"""
chatbot.py – Entry point chính.
Import: constants, normalize, detectors.
"""

import re
import json
import logging
import os

from pymongo import MongoClient
from pymongo.errors import PyMongoError

from constants import STOPWORDS
from normalize import normalize, norm_pattern, strip_accents
from detectors import detect_age, detect_price, detect_gender

logger = logging.getLogger(__name__)

# ── Load intents ──────────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_BASE_DIR, 'intents.json'), 'r', encoding='utf-8') as f:
    INTENTS = json.load(f)['intents']

_NORM_INTENTS: list[dict] = [
    {**intent, 'patterns_norm': [norm_pattern(p) for p in intent['patterns']]}
    for intent in INTENTS
]

# ── MongoDB ───────────────────────────────────────────────────────────────────
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017/rainbowrattles')
_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
_db = _client.get_database('rainbowrattles')
products_col   = _db['products']
categories_col = _db['categories']


# ══════════════════════════════════════════════════════════════════════════════
# TOKEN SEARCH ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _extract_keywords(msg_norm: str) -> list[str]:
    tokens = re.findall(r'[a-z0-9]+', msg_norm)
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1 and not t.isdigit()]


def _extract_keywords_relaxed(msg_norm: str) -> list[str]:
    """Phiên bản relaxed: giữ lại token ngắn hơn và không lọc stopwords.
    Dùng làm fallback khi extract_keywords trả về rỗng hoặc tìm không ra gì.
    """
    tokens = re.findall(r'[a-z0-9]+', msg_norm)
    # Chỉ bỏ các từ chức năng thuần tuý (hỏi/mệnh lệnh), giữ lại mọi danh từ
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

    # Fallback: nếu strict keywords rỗng, thử relaxed (ví dụ người gõ "gau", "xe")
    if not keywords:
        keywords = _extract_keywords_relaxed(msg_norm)

    if not keywords:
        logger.info('No keywords extracted from "%s"', msg_norm)
        return []

    logger.info('Keywords: %s', keywords)

    # Mỗi keyword dùng prefix regex (^keyword hoặc \bkeyword) để match từ đầu từ
    # Vd: "gau" → khớp "Gấu Bông" sau khi server đã lưu name gốc có dấu
    # Dùng OR toàn bộ keyword để kéo về candidates rộng, sau đó score lại
    regex_parts = [kw for kw in keywords]
    regex_or = '|'.join(re.escape(kw) for kw in regex_parts)

    try:
        # Query cả name lẫn description để không bỏ sót
        candidates = list(products_col.find(
            {'$or': [
                {'searchName': {'$regex': regex_or, '$options': 'i'}},  # ưu tiên tìm không dấu
        {'name': {'$regex': regex_or, '$options': 'i'}},
        {'description': {'$regex': regex_or, '$options': 'i'}},
            ]},
            {'name': 1, 'salePrice': 1, 'description': 1, 'sold': 1, 'imageUrl': 1}
        ).limit(200))  # tăng pool để score chính xác hơn
        logger.info('Found %d candidates', len(candidates))
    except PyMongoError as e:
        logger.error('MongoDB token search error: %s', e)
        return []

    # Score dựa trên tên đã strip_accents để khớp với keywords (đã stripped)
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


def _get_category_map() -> dict[str, object]:
    try:
        return {
            strip_accents(cat['name']): cat['_id']
            for cat in categories_col.find({}, {'name': 1})
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
        products = list(products_col.find(
            {'ageRange': {'$regex': str(age), '$options': 'i'}},
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
        products = list(products_col.find(
            {'salePrice': {'$lte': price}},
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
        products = list(products_col.find(
            {'sold': {'$exists': True}},
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
        products = list(products_col.find(
            {'gender': gender},
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
    """Xử lý khi câu hỏi chứa nhiều tiêu chí: tuổi + giá + giới tính.

    FIX: Bỏ kiểm tra `if age:` thừa bên trong nhánh `if age and price`
    vì điều kiện đã được đảm bảo ở ngoài.
    """
    age    = detect_age(msg_norm)
    price  = detect_price(msg_norm)
    gender = detect_gender(msg_norm)

    # Có cả tuổi lẫn giá → query đầy đủ
    if age and price:
        query: dict = {
            'salePrice': {'$lte': price},
            'ageRange':  {'$regex': str(age), '$options': 'i'},
        }
        if gender:
            query['gender'] = gender

        try:
            products = list(products_col.find(
                query, {'name': 1, 'salePrice': 1, 'imageUrl': 1}
            ).sort('sold', -1).limit(5))
        except PyMongoError as e:
            logger.error('MongoDB multi-intent error: %s', e)
            return (None, [])

        label_parts: list[str] = []
        if gender:
            label_parts.append('bé trai' if gender == 'Boy' else 'bé gái')
        label_parts.append(f'{age} tuổi')
        label_parts.append(f'dưới ${price}')
        label = 'Sản phẩm ' + ', '.join(label_parts) + ':'

        reply, _ = _fmt_products(products, label)
        if reply is None:
            reply = 'Không tìm thấy sản phẩm phù hợp với yêu cầu này.'
        return (reply, products)

    # Có giới tính + tuổi (không có giá)
    if gender and age:
        try:
            products = list(products_col.find(
                {'gender': gender, 'ageRange': {'$regex': str(age), '$options': 'i'}},
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
                products = list(products_col.find(
                    {'category': cat_map[cat_name]},
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

    try:
        cat_map = {
            strip_accents(cat['name']): cat['_id']
            for cat in categories_col.find({}, {'name': 1})
            if 'name' in cat
        }
    except PyMongoError as e:
        logger.error('MongoDB categories error: %s', e)
        return (None, [])

    for phrase in _ngrams_longest_first(keywords):
        for cat_norm, cat_id in cat_map.items():
            if phrase in cat_norm or cat_norm in phrase:
                try:
                    products = list(products_col.find(
                        {'category': cat_id},
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

    # Lớp 0: Multi-intent (tuổi + giá, hoặc giới tính + tuổi)
    multi_reply, multi_products = _handle_multi_intent(msg_norm)
    if multi_reply:
        return (multi_reply, multi_products)

    # Lớp 1: Intent matching từ intents.json
    for intent in _NORM_INTENTS:
        tag      = intent['tag']
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
                pass  # để lớp 3/5 xử lý
            else:
                if pnorm in msg_norm:
                    if tag == 'bestseller':
                        return _handle_bestseller(response)
                    elif tag == 'gender':
                        return _handle_gender(msg_norm)
                    else:
                        return (response, [])

    # Lớp 2: Suy luận số (tuổi / giá đơn lẻ)
    age   = detect_age(msg_norm)
    price = detect_price(msg_norm)
    if age:
        return _handle_age(age)
    if price:
        return _handle_price(price)

    # Lớp 3: Danh mục exact match
    cat_reply, cat_products = _handle_category_exact(msg_norm)
    if cat_reply:
        return (cat_reply, cat_products)

    # Lớp 4: Token search theo tên sản phẩm
    products = _search_products_by_tokens(msg_norm)
    if products:
        keywords   = _extract_keywords(msg_norm)
        kw_display = ' '.join(keywords) if keywords else msg_norm
        reply, _   = _fmt_products(products, f'Tìm thấy sản phẩm cho "{kw_display}":')
        if reply:
            return (reply, products)

    # Lớp 5: Token search theo danh mục
    cat_token_reply, cat_token_products = _search_category_by_tokens(msg_norm)
    if cat_token_reply:
        return (cat_token_reply, cat_token_products)

    # Fallback
    return (
        'Xin lỗi, tôi chưa tìm thấy kết quả phù hợp 😅\n'
        'Bạn thử gõ:\n'
        '• Tên sản phẩm (vd: "gấu bông", "xe đua", "lego")\n'
        '• Độ tuổi (vd: "bé 3 tuổi", "cho trẻ 5 tuổi")\n'
        '• Giới tính (vd: "bé trai", "bé gái")\n'
        '• Giá (vd: "dưới 20 đô", "tầm 50")\n'
        '• Sản phẩm bán chạy',
        [],
    )


# ══════════════════════════════════════════════════════════════════════════════
# SUGGEST — dùng cho autocomplete frontend
# ══════════════════════════════════════════════════════════════════════════════

def suggest_products(q: str, limit: int = 6) -> list[str]:
    """Trả về danh sách tên sản phẩm gợi ý dựa trên prefix query.

    Ví dụ: q="gau" → ["Gấu Bông Teddy 30cm", "Gấu Bông Đội Mũ", ...]
    """
    if not q or len(q.strip()) < 1:
        return []
    q_norm = normalize(q)
    # Lấy từ đầu tiên có nghĩa để làm prefix search trên MongoDB
    tokens = _extract_keywords_relaxed(q_norm) or re.findall(r'[a-z0-9]+', q_norm)
    if not tokens:
        return []
    # Dùng regex prefix của từ cuối (đang gõ dở) + các từ trước làm bộ lọc thêm
    last_token = tokens[-1]
    prefix_re  = f'^{re.escape(last_token)}|\\b{re.escape(last_token)}'
    try:
        docs = list(products_col.find(
            {'name': {'$regex': prefix_re, '$options': 'i'}},
            {'name': 1}
        ).limit(50))
    except PyMongoError:
        return []
    # Score đơn giản: ưu tiên tên ngắn hơn / có nhiều token khớp hơn
    results = []
    for doc in docs:
        name = doc.get('name', '')
        name_n = strip_accents(name)
        hit = sum(1 for t in tokens if t in name_n)
        if hit > 0:
            results.append((name, hit, len(name)))
    results.sort(key=lambda x: (-x[1], x[2]))
    return [r[0] for r in results][:limit]