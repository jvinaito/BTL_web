import re
import json
import logging
import unicodedata
import os
from functools import lru_cache
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from constants import STOPWORDS
from normalize import normalize, norm_pattern, strip_accents
from detectors import detect_age, detect_price, detect_gender
from actions import process_action

logger = logging.getLogger(__name__)

# ── Load intents ──────────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_BASE_DIR, 'intents.json'), 'r', encoding='utf-8') as f:
    INTENTS = json.load(f)['intents']

_NORM_INTENTS: list[dict] = [
    {**intent, 'patterns_norm': [norm_pattern(p) for p in intent['patterns']]}
    for intent in INTENTS
]

# ── MongoDB (lazy init) ───────────────────────────────────────────────────────
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017/rainbowrattles')
_db = None

def get_db():
    global _db
    if _db is None:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
        _db = client.get_database('rainbowrattles')
    return _db

def get_products_col():
    return get_db()['products']

def get_categories_col():
    return get_db()['categories']


# ══════════════════════════════════════════════════════════════════════════════
# TOKEN SEARCH ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _extract_keywords(msg_norm: str) -> list[str]:
    tokens = re.findall(r'[a-z0-9]+', msg_norm)
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1 and not t.isdigit()]

def _extract_keywords_relaxed(msg_norm: str) -> list[str]:
    tokens = re.findall(r'[a-z0-9]+', msg_norm)
    skip = {'xin', 'cho', 'toi', 'ban', 'muon', 'can', 'hay', 'oke', 'ok',
            'la', 'va', 'ma', 'di', 'nhe', 'ak', 'uh', 'vang', 'da'}
    return [t for t in tokens if t not in skip and len(t) >= 2 and not t.isdigit()]

def _ngrams_longest_first(tokens: list[str]) -> list[str]:
    result = []
    n = len(tokens)
    for length in range(n, 0, -1):
        for i in range(n - length + 1):
            result.append(' '.join(tokens[i:i + length]))
    return result

def _levenshtein(a: str, b: str) -> int:
    if abs(len(a) - len(b)) > 2:
        return 99
    m, n = len(a), len(b)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, n + 1):
            old = dp[j]
            dp[j] = min(prev + (a[i-1] != b[j-1]), dp[j] + 1, dp[j-1] + 1)
            prev = old
    return dp[n]

def _score_product(p: dict, keywords: list[str]) -> float:
    name_norm = strip_accents(p.get('name', ''))
    desc_norm = strip_accents(p.get('description', ''))
    score = 0.0
    matched: set[str] = set()

    for phrase in _ngrams_longest_first(keywords):
        if phrase in matched:
            continue
        weight = len(phrase.split())
        if phrase in name_norm:
            score += weight * 2
            matched.add(phrase)
        elif phrase in desc_norm:
            score += weight
            matched.add(phrase)
        elif weight == 1 and len(phrase) >= 3:
            for word in name_norm.split():
                dist = _levenshtein(phrase, word)
                if dist <= 1:
                    score += 0.5
                    matched.add(phrase)
                    break
                elif dist <= 2 and len(phrase) >= 6:
                    score += 0.3
                    matched.add(phrase)
                    break
    return score

def _search_products_by_tokens(msg_norm: str, limit: int = 5) -> list[dict]:
    keywords = _extract_keywords(msg_norm)
    if not keywords:
        keywords = _extract_keywords_relaxed(msg_norm)
    if not keywords:
        logger.info('No keywords extracted from "%s"', msg_norm)
        return []
    logger.info('Keywords: %s', keywords)
    regex_or = '|'.join(re.escape(kw) for kw in keywords)
    try:
        candidates = list(get_products_col().find(
            {'$or': [
                {'searchName': {'$regex': regex_or, '$options': 'i'}},
                {'name': {'$regex': regex_or, '$options': 'i'}},
                {'description': {'$regex': regex_or, '$options': 'i'}},
            ],
            'status': 'Active',
            'stock': {'$gt': 0}
            },
            {'name': 1, 'salePrice': 1, 'description': 1, 'sold': 1, 'imageUrl': 1}
        ).limit(200))
        logger.info('Found %d candidates', len(candidates))
    except PyMongoError as e:
        logger.error('MongoDB token search error: %s', e)
        return []
    scored = [(p, _score_product(p, keywords)) for p in candidates]
    scored = [(p, s) for p, s in scored if s > 0]
    scored.sort(key=lambda x: (-x[1], -x[0].get('sold', 0)))
    return [p for p, _ in scored][:limit]


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_products(products: list, label: str = '') -> tuple[str | None, list]:
    if not products:
        return (None, [])
    lines = [label] if label else []
    for p in products:
        lines.append(f"• {p.get('name', 'N/A')} – ${p.get('salePrice', '?')}")
    return ('\n'.join(lines), products)

@lru_cache(maxsize=1)
def _get_category_map():
    try:
        return {
            strip_accents(cat['name']): cat['_id']
            for cat in get_categories_col().find({}, {'name': 1})
            if 'name' in cat
        }
    except PyMongoError as e:
        logger.error('MongoDB categories error: %s', e)
        return {}


# ══════════════════════════════════════════════════════════════════════════════
# INTENT HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

def _handle_age(age: int) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'ageRange': {'$regex': str(age), '$options': 'i'}, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'imageUrl': 1}
        ).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    reply, _ = _fmt_products(products, f'Sản phẩm phù hợp cho bé {age} tuổi:')
    if reply is None:
        reply = f'Rất tiếc, chưa có sản phẩm nào cho bé {age} tuổi.'
    return (reply, products)

def _handle_price(price: int) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'salePrice': {'$lte': price}, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'imageUrl': 1}
        ).sort('salePrice', 1).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    reply, _ = _fmt_products(products, f'Sản phẩm có giá dưới ${price}:')
    if reply is None:
        reply = f'Không tìm thấy sản phẩm nào có giá dưới ${price}.'
    return (reply, products)

def _handle_bestseller(base_response: str) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'sold': {'$exists': True}, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'sold': 1, 'salePrice': 1, 'imageUrl': 1}
        ).sort('sold', -1).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    if not products:
        return ('Hiện chưa có dữ liệu sản phẩm bán chạy.', [])
    lines = [base_response]
    for p in products:
        lines.append(f"• {p.get('name','N/A')} – ${p.get('salePrice','?')} (đã bán: {p.get('sold',0)})")
    return ('\n'.join(lines), products)

def _handle_gender(msg_norm: str) -> tuple[str, list]:
    gender = detect_gender(msg_norm)
    if gender is None:
        return ('Bạn muốn tìm đồ chơi cho bé trai hay bé gái? Hãy cho tôi biết để tôi gợi ý chính xác hơn nhé!', [])
    label = 'bé trai' if gender == 'Boy' else 'bé gái'
    try:
        products = list(get_products_col().find(
            {'gender': gender, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'imageUrl': 1}
        ).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    reply, _ = _fmt_products(products, f'Sản phẩm dành cho {label}:')
    if reply is None:
        reply = f'Hiện chưa có sản phẩm dành cho {label}.'
    return (reply, products)

def _handle_multi_intent(msg_norm: str) -> tuple[str | None, list]:
    age = detect_age(msg_norm)
    price = detect_price(msg_norm)
    gender = detect_gender(msg_norm)

    if age and price:
        query = {
            'salePrice': {'$lte': price},
            'ageRange': {'$regex': str(age), '$options': 'i'},
            'status': 'Active',
            'stock': {'$gt': 0}
        }
        if gender:
            query['gender'] = gender
        try:
            products = list(get_products_col().find(
                query, {'name': 1, 'salePrice': 1, 'imageUrl': 1}
            ).sort('sold', -1).limit(5))
        except PyMongoError as e:
            logger.error('MongoDB multi-intent error: %s', e)
            return (None, [])
        label_parts = []
        if gender:
            label_parts.append('bé trai' if gender == 'Boy' else 'bé gái')
        label_parts.append(f'{age} tuổi')
        label_parts.append(f'dưới ${price}')
        label = 'Sản phẩm ' + ', '.join(label_parts) + ':'
        reply, _ = _fmt_products(products, label)
        if reply is None:
            reply = 'Không tìm thấy sản phẩm phù hợp với yêu cầu này.'
        return (reply, products)

    if gender and age:
        try:
            products = list(get_products_col().find(
                {'gender': gender, 'ageRange': {'$regex': str(age), '$options': 'i'},
                 'status': 'Active', 'stock': {'$gt': 0}},
                {'name': 1, 'salePrice': 1, 'imageUrl': 1}
            ).sort('sold', -1).limit(5))
        except PyMongoError as e:
            logger.error('MongoDB multi-intent error: %s', e)
            return (None, [])
        label = f'Sản phẩm {"bé trai" if gender == "Boy" else "bé gái"} {age} tuổi:'
        reply, _ = _fmt_products(products, label)
        if reply is None:
            reply = 'Không tìm thấy sản phẩm phù hợp.'
        return (reply, products)

    return (None, [])

def _handle_category_exact(msg_norm: str) -> tuple[str | None, list]:
    cat_map = _get_category_map()
    for cat_name in sorted(cat_map, key=len, reverse=True):
        if cat_name in msg_norm:
            try:
                products = list(get_products_col().find(
                    {'category': cat_map[cat_name], 'status': 'Active', 'stock': {'$gt': 0}},
                    {'name': 1, 'salePrice': 1, 'imageUrl': 1}
                ).sort('sold', -1).limit(5))
            except PyMongoError as e:
                logger.error('MongoDB error: %s', e)
                return (None, [])
            display = cat_name.title()
            reply, _ = _fmt_products(products, f'Sản phẩm danh mục {display}:')
            if reply is None:
                reply = f'Hiện chưa có sản phẩm trong danh mục {display}.'
            return (reply, products)
    return (None, [])

def _search_category_by_tokens(msg_norm: str) -> tuple[str | None, list]:
    keywords = _extract_keywords(msg_norm)
    if not keywords:
        return (None, [])

    cat_map = _get_category_map()
    for phrase in _ngrams_longest_first(keywords):
        for cat_norm, cat_id in cat_map.items():
            if phrase in cat_norm or cat_norm in phrase:
                try:
                    products = list(get_products_col().find(
                        {'category': cat_id, 'status': 'Active', 'stock': {'$gt': 0}},
                        {'name': 1, 'salePrice': 1, 'imageUrl': 1}
                    ).sort('sold', -1).limit(5))
                except PyMongoError as e:
                    logger.error('MongoDB error: %s', e)
                    return (None, [])
                display = cat_norm.title()
                reply, _ = _fmt_products(products, f'Sản phẩm danh mục {display}:')
                if reply is None:
                    reply = f'Hiện chưa có sản phẩm trong danh mục {display}.'
                return (reply, products)
    return (None, [])


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def process_message(msg: str) -> tuple[str, list]:
    msg_norm = normalize(msg)
    logger.info('raw=%r  norm=%r', msg[:80], msg_norm[:80])

    # ── ACTION (thêm giỏ / thanh toán) ──
    action = process_action(msg_norm)
    if action:
        logger.info('ACTION DETECTED: %s', action)
        return (json.dumps({'__action__': action}), [])

    # ── Lớp 0: Multi-intent ──
    multi_reply, multi_products = _handle_multi_intent(msg_norm)
    if multi_reply:
        return (multi_reply, multi_products)

    # ── Lớp 1: Intent matching ──
    for intent in _NORM_INTENTS:
        tag = intent['tag']
        response = intent['responses'][0]
        for pnorm in intent['patterns_norm']:
            if '{age}' in pnorm:
                m = re.search(pnorm.replace('{age}', r'(\d+)'), msg_norm)
                if m:
                    return _handle_age(int(m.group(1)))
            elif '{price}' in pnorm:
                m = re.search(pnorm.replace('{price}', r'(\d+)'), msg_norm)
                if m:
                    return _handle_price(int(m.group(1)))
            elif '{category}' in pnorm:
                pass
            else:
                if pnorm in msg_norm:
                    if tag == 'bestseller':
                        return _handle_bestseller(response)
                    elif tag == 'gender':
                        return _handle_gender(msg_norm)
                    else:
                        return (response, [])

    # ── Lớp 2: Suy luận số ──
    age = detect_age(msg_norm)
    price = detect_price(msg_norm)
    if age:
        return _handle_age(age)
    if price:
        return _handle_price(price)

    # ── Lớp 3: Danh mục exact ──
    cat_reply, cat_products = _handle_category_exact(msg_norm)
    if cat_reply:
        return (cat_reply, cat_products)

    # ── Lớp 4: Token search sản phẩm ──
    products = _search_products_by_tokens(msg_norm)
    if products:
        keywords = _extract_keywords(msg_norm)
        kw_display = ' '.join(keywords) if keywords else msg_norm
        reply, _ = _fmt_products(products, f'Tìm thấy sản phẩm cho "{kw_display}":')
        if reply:
            return (reply, products)

    # ── Lớp 5: Danh mục token search ──
    cat_token_reply, cat_token_products = _search_category_by_tokens(msg_norm)
    if cat_token_reply:
        return (cat_token_reply, cat_token_products)

    # ── Fallback ──
    return (
        'Xin lỗi, tôi chưa tìm thấy kết quả phù hợp 😅\n'
        'Bạn thử gõ:\n'
        '• Tên sản phẩm (vd: "gấu bông", "xe đua", "lego")\n'
        '• Độ tuổi (vd: "bé 3 tuổi", "cho trẻ 5 tuổi")\n'
        '• Giới tính (vd: "bé trai", "bé gái")\n'
        '• Giá (vd: "dưới 20 đô", "tầm 50")\n'
        '• Sản phẩm bán chạy',
        []
    )


# ══════════════════════════════════════════════════════════════════════════════
# SUGGEST
# ══════════════════════════════════════════════════════════════════════════════

def suggest_products(q: str, limit: int = 6) -> list[str]:
    if not q or len(q.strip()) < 1:
        return []
    q_norm = normalize(q)
    tokens = _extract_keywords_relaxed(q_norm) or re.findall(r'[a-z0-9]+', q_norm)
    if not tokens:
        return []
    last_token = tokens[-1]
    prefix_re = f'^{re.escape(last_token)}|\\b{re.escape(last_token)}'
    try:
        docs = list(get_products_col().find(
            {'searchName': {'$regex': prefix_re, '$options': 'i'}, 'status': 'Active'},
            {'name': 1}
        ).limit(50))
    except PyMongoError as e:
        logger.error('Suggest error: %s', e)
        return []
    results = []
    for doc in docs:
        name = doc.get('name', '')
        name_n = strip_accents(name)
        hit = sum(1 for t in tokens if t in name_n)
        if hit > 0:
            results.append((name, hit, len(name)))
    results.sort(key=lambda x: (-x[1], x[2]))
    return [r[0] for r in results][:limit]