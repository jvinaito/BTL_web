"""
chatbot.py – Xử lý tin nhắn chatbot đồ chơi Rainbow Rattles.
"""

import re
import json
import logging
import os
from typing import Any
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from constants import STOPWORDS
from normalize import normalize, norm_pattern, strip_accents
from detectors import detect_age, detect_price, detect_gender, detect_brand
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
# SESSION
# ══════════════════════════════════════════════════════════════════════════════

_sessions: dict[str, dict[str, Any]] = {}

def _get_session(session_id: str = 'default') -> dict[str, Any]:
    if session_id not in _sessions:
        _sessions[session_id] = {
            'last_products': [],
            'in_checkout_flow': False,
        }
    return _sessions[session_id]

def _set_last_products(products: list[dict], session_id: str = 'default') -> None:
    _get_session(session_id)['last_products'] = products

def _set_checkout_flow(active: bool, session_id: str = 'default') -> None:
    _get_session(session_id)['in_checkout_flow'] = active


# ══════════════════════════════════════════════════════════════════════════════
# TOKEN SEARCH ENGINE
# ══════════════════════════════════════════════════════════════════════════════

def _extract_keywords(msg_norm: str) -> list[str]:
    tokens = re.findall(r'[a-z0-9]+', msg_norm)
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1 and not t.isdigit()]

def _extract_keywords_relaxed(msg_norm: str) -> list[str]:
    tokens = re.findall(r'[a-z0-9]+', msg_norm)
    skip = {'xin', 'cho', 'toi', 'ban', 'muon', 'can', 'hay', 'oke', 'ok',
            'la', 'va', 'ma', 'di', 'nhe', 'ak', 'uh', 'vang', 'da',
            'co', 'khong', 'roi', 'nay', 'kia', 'lam', 'sao', 'the', 'nhu'}
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

def _search_products_by_tokens(msg_norm: str, limit: int = 20) -> list[dict]:
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
                {'name':       {'$regex': regex_or, '$options': 'i'}},
                {'description':{'$regex': regex_or, '$options': 'i'}},
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

DISPLAY_LIMIT = 20
INITIAL_DISPLAY = 5

def _fmt_products(products: list, label: str = '') -> tuple[str | None, list]:
    if not products:
        return (None, [])
    display = products[:INITIAL_DISPLAY]
    lines = [label] if label else []
    for idx, p in enumerate(display, 1):
        name = p.get('name', 'Không có tên')
        price_val = p.get('salePrice', 0)
        price_fmt = f"{price_val:,}".replace(',', '.') if isinstance(price_val, (int, float)) else str(price_val)
        lines.append(f"{idx}. {name} – {price_fmt}đ")
    if len(products) > INITIAL_DISPLAY:
        lines.append(f"💡 Còn {len(products) - INITIAL_DISPLAY} sản phẩm nữa. Gõ 'xem thêm' để xem tiếp.")
    else:
        lines.append("💡 Gõ số (1-5) để xem chi tiết | 'thêm [số]' để thêm giỏ hàng")
    return ('\n'.join(lines), products)


def _get_category_map() -> dict:
    try:
        return {
            strip_accents(cat['name']): cat['_id']
            for cat in get_categories_col().find({}, {'name': 1})
            if 'name' in cat
        }
    except PyMongoError as e:
        logger.error('MongoDB categories error: %s', e)
        return {}


def _build_label(
    gender: str | None,
    age: int | None,
    price: int | None,
    brand: str | None,
    product_kws: list[str],
) -> str:
    parts = []
    if product_kws:
        parts.append(f'"{" ".join(product_kws)}"')
    if brand:
        parts.append(f'hãng {brand}')
    if gender:
        parts.append('bé trai' if gender == 'Boy' else 'bé gái')
    if age:
        parts.append(f'{age} tuổi')
    if price:
        parts.append(f"dưới {price:,}đ".replace(',', '.'))
    return 'Sản phẩm ' + ' - '.join(parts) + ':' if parts else 'Kết quả tìm kiếm:'


# ══════════════════════════════════════════════════════════════════════════════
# INTENT HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

def _handle_age(age: int) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'ageRange': {'$regex': str(age), '$options': 'i'}, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'imageUrl': 1}
        ).limit(20))
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
        ).sort('salePrice', 1).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    price_fmt = f"{price:,}".replace(',', '.')
    reply, _ = _fmt_products(products, f'Sản phẩm có giá dưới {price_fmt}đ:')
    if reply is None:
        reply = f'Không tìm thấy sản phẩm nào có giá dưới {price_fmt}đ.'
    return (reply, products)


def _handle_bestseller(base_response: str) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'sold': {'$exists': True}, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'sold': 1, 'salePrice': 1, 'imageUrl': 1}
        ).sort('sold', -1).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    if not products:
        return ('Hiện chưa có dữ liệu sản phẩm bán chạy.', [])
    reply, _ = _fmt_products(products, base_response)
    return (reply, products)


def _handle_gender(msg_norm: str) -> tuple[str, list]:
    gender = detect_gender(msg_norm)
    if gender is None:
        return ('Bạn muốn tìm đồ chơi cho bé trai hay bé gái? Hãy cho tôi biết nhé!', [])
    label = 'bé trai' if gender == 'Boy' else 'bé gái'
    try:
        products = list(get_products_col().find(
            {'gender': gender, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'imageUrl': 1}
        ).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    reply, _ = _fmt_products(products, f'Sản phẩm dành cho {label}:')
    if reply is None:
        reply = f'Hiện chưa có sản phẩm dành cho {label}.'
    return (reply, products)


def _handle_brand(brand: str) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'brand': {'$regex': re.escape(brand), '$options': 'i'},
             'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'imageUrl': 1}
        ).sort('sold', -1).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB brand error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    reply, _ = _fmt_products(products, f'Sản phẩm hãng {brand.upper()}:')
    if reply is None:
        reply = f'Hiện chưa có sản phẩm của hãng {brand.upper()}.'
    return (reply, products)


def _handle_sale_products(base_response: str) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'discount': {'$gt': 0}, 'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'discount': 1, 'originalPrice': 1, 'imageUrl': 1}
        ).sort('discount', -1).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    if not products:
        return ('Hiện chưa có sản phẩm nào đang giảm giá.', [])
    logger.info(f'[Sale] Found {len(products)} products')
    reply, _ = _fmt_products(products, base_response)
    return (reply, products)


def _handle_new_arrivals(base_response: str) -> tuple[str, list]:
    try:
        products = list(get_products_col().find(
            {'status': 'Active', 'stock': {'$gt': 0}},
            {'name': 1, 'salePrice': 1, 'createdAt': 1, 'imageUrl': 1}
        ).sort('createdAt', -1).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])
    if not products:
        return ('Hiện chưa có sản phẩm mới.', [])
    logger.info(f'[New] Found {len(products)} products')
    reply, _ = _fmt_products(products, base_response)
    return (reply, products)


# ══════════════════════════════════════════════════════════════════════════════
# COMPOUND SEARCH
# ══════════════════════════════════════════════════════════════════════════════

_FILTER_WORDS = frozenset({
    'tuoi', 'gia', 'duoi', 'tren', 'khoang', 'tam', 'be', 'bé',
    'trai', 'gai', 'cho', 'tre', 'em', 'con', 'nho',
    'hang', 'thuonghieu', 'brand', 'chay', 'nhat',
})

def _build_product_kws(msg_norm: str, age: int | None, price: int | None) -> list[str]:
    keywords = _extract_keywords(msg_norm)
    age_tokens = {str(age)} if age else set()
    price_tokens = {str(price)} if price else set()
    return [
        kw for kw in keywords
        if kw not in age_tokens
        and kw not in price_tokens
        and kw not in _FILTER_WORDS
        and not re.fullmatch(r'\d+', kw)
    ]


def _query_with_fallback(
    query: dict,
    product_kws: list[str],
    label: str,
    fallback_label: str,
) -> tuple[str | None, list]:
    PROJ = {'name': 1, 'salePrice': 1, 'description': 1, 'sold': 1, 'imageUrl': 1}
    try:
        candidates = list(get_products_col().find(query, PROJ).limit(200))
    except PyMongoError as e:
        logger.error('MongoDB compound error: %s', e)
        return (None, [])

    if not candidates:
        loose = {k: v for k, v in query.items() if k not in ('ageRange', 'salePrice', 'gender')}
        try:
            candidates = list(get_products_col().find(loose, PROJ).limit(50))
        except PyMongoError:
            pass
        if not candidates:
            return (None, [])
        label = fallback_label

    if product_kws:
        scored = [(p, _score_product(p, product_kws)) for p in candidates]
        scored = [(p, s) for p, s in scored if s > 0] or [(p, 1.0) for p in candidates]
    else:
        scored = [(p, 1.0) for p in candidates]
    scored.sort(key=lambda x: (-x[1], -x[0].get('sold', 0)))
    products = [p for p, _ in scored][:20]

    reply, _ = _fmt_products(products, label)
    return (reply or 'Không tìm thấy sản phẩm phù hợp.', products)


def _handle_compound(msg_norm: str) -> tuple[str | None, list]:
    age    = detect_age(msg_norm)
    price  = detect_price(msg_norm)
    gender = detect_gender(msg_norm)
    brand  = detect_brand(msg_norm)

    logger.info('[Compound] age=%s price=%s gender=%s brand=%s', age, price, gender, brand)

    if not any([age, price, gender, brand]):
        return (None, [])

    product_kws = _build_product_kws(msg_norm, age, price)

    if brand and brand in product_kws:
        brand = None

    if not product_kws and not brand:
        return _handle_filters_only(age, price, gender, msg_norm)

    logger.info('[Compound] product_kws=%s', product_kws)

    query: dict = {'status': 'Active', 'stock': {'$gt': 0}}
    if product_kws:
        regex_or = '|'.join(re.escape(kw) for kw in product_kws)
        query['$or'] = [
            {'searchName': {'$regex': regex_or, '$options': 'i'}},
            {'name':       {'$regex': regex_or, '$options': 'i'}},
        ]
    if age:    query['ageRange']  = {'$regex': str(age), '$options': 'i'}
    if price:  query['salePrice'] = {'$lte': price}
    if gender: query['gender']    = gender
    if brand:  query['brand']     = {'$regex': re.escape(brand), '$options': 'i'}

    label = _build_label(gender, age, price, brand, product_kws)
    fallback_label = (
        f'Không tìm thấy "{" ".join(product_kws)}" với bộ lọc đã chọn.\n'
        'Đây là sản phẩm tương tự bạn có thể tham khảo:'
    )

    return _query_with_fallback(query, product_kws, label, fallback_label)


def _handle_filters_only(
    age: int | None,
    price: int | None,
    gender: str | None,
    msg_norm: str,
) -> tuple[str | None, list]:
    if not any([age, price, gender]):
        return (None, [])

    query: dict = {'status': 'Active', 'stock': {'$gt': 0}}
    if age:    query['ageRange']  = {'$regex': str(age), '$options': 'i'}
    if price:  query['salePrice'] = {'$lte': price}
    if gender: query['gender']    = gender

    PROJ = {'name': 1, 'salePrice': 1, 'imageUrl': 1}
    try:
        products = list(get_products_col().find(query, PROJ).sort('sold', -1).limit(20))
    except PyMongoError as e:
        logger.error('MongoDB filter-only error: %s', e)
        return ('Xin lỗi, không thể truy vấn dữ liệu lúc này.', [])

    label = _build_label(gender, age, price, None, [])
    reply, _ = _fmt_products(products, label)
    if reply is None:
        reply = 'Không tìm thấy sản phẩm phù hợp với yêu cầu này.'
    return (reply, products)


# ══════════════════════════════════════════════════════════════════════════════
# CATEGORY SEARCH
# ══════════════════════════════════════════════════════════════════════════════

def _handle_category_exact(msg_norm: str) -> tuple[str | None, list]:
    cat_map = _get_category_map()
    for cat_name in sorted(cat_map, key=len, reverse=True):
        if cat_name in msg_norm:
            try:
                products = list(get_products_col().find(
                    {'category': cat_map[cat_name], 'status': 'Active', 'stock': {'$gt': 0}},
                    {'name': 1, 'salePrice': 1, 'imageUrl': 1}
                ).sort('sold', -1).limit(20))
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
                    ).sort('sold', -1).limit(20))
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
# INTENT MATCHING
# ══════════════════════════════════════════════════════════════════════════════

_EXCLUDE_PRODUCT_NAME_KEYWORDS = [
    'lich su', 'gan nhat', 'cuoi cung', 'gan day', 'cua toi', 'hang', 'cac don',
    'nhat', 'cung', 'day', 'su'
]

def _match_intents(msg_norm: str) -> tuple[str | None, list]:
    logger.info('[MatchIntents] Checking: %s', msg_norm)
    lower_msg = msg_norm.lower()

    # 1. Ưu tiên intent đặc biệt
    special_tags = ['cart_view', 'order_history', 'latest_order']
    for intent in _NORM_INTENTS:
        tag = intent['tag']
        if tag not in special_tags:
            continue
        for pnorm in intent['patterns_norm']:
            escaped = r'\s+'.join(re.escape(w) for w in pnorm.split())
            if re.search(r'\b' + escaped + r'\b', msg_norm):
                logger.info('[MatchIntents] Matched special intent: %s', tag)
                if tag == 'cart_view':
                    return ('__view_cart__', [])
                elif tag == 'order_history':
                    return (json.dumps({'__action__': {'action': 'order_history'}}), [])
                elif tag == 'latest_order':
                    return (json.dumps({'__action__': {'action': 'latest_order'}}), [])

    # 2. cancel_order
    for intent in _NORM_INTENTS:
        tag = intent['tag']
        if tag != 'cancel_order':
            continue
        for pnorm in intent['patterns_norm']:
            if '{orderId}' in pnorm:
                regex = pnorm.replace('{orderId}', r'(ORD\d+)')
                m = re.search(regex, msg_norm)
                if m:
                    order_id = m.group(1)
                    return (json.dumps({'__action__': {'action': 'cancel_order', 'orderId': order_id}}), [])
            elif '{index}' in pnorm:
                regex = pnorm.replace('{index}', r'(\d+)')
                m = re.search(regex, msg_norm)
                if m:
                    idx = int(m.group(1))
                    if 1 <= idx <= 20:
                        return (json.dumps({'__action__': {'action': 'cancel_order_by_index', 'index': idx}}), [])

    # 3. Các intent có placeholder
    for intent in _NORM_INTENTS:
        tag = intent['tag']
        response = intent['responses'][0]

        for pnorm in intent['patterns_norm']:
            if '{age}' in pnorm:
                regex = pnorm.replace('{age}', r'(\d+)')
                m = re.search(regex, msg_norm)
                if m:
                    reply, all_p = _handle_age(int(m.group(1)))
                    if all_p:
                        _set_last_products(all_p)
                    return (reply, all_p)

            elif '{price}' in pnorm:
                regex = pnorm.replace('{price}', r'(\d+)')
                m = re.search(regex, msg_norm)
                if m:
                    reply, all_p = _handle_price(int(m.group(1)))
                    if all_p:
                        _set_last_products(all_p)
                    return (reply, all_p)

            elif '{category}' in pnorm:
                pass

            elif '{index}' in pnorm:
                regex = pnorm.replace('{index}', r'(\d+)')
                m = re.search(regex, msg_norm)
                if m:
                    idx = int(m.group(1))
                    if 1 <= idx <= 20:
                        return (json.dumps({'__action__': {'action': 'order_detail_by_index', 'index': idx}}), [])

            elif '{orderId}' in pnorm:
                regex = pnorm.replace('{orderId}', r'(ORD\d+)')
                m = re.search(regex, msg_norm)
                if m:
                    order_id = m.group(1)
                    return (json.dumps({'__action__': {'action': 'order_status', 'orderId': order_id}}), [])

            elif '{product_name}' in pnorm:
                if any(kw in lower_msg for kw in _EXCLUDE_PRODUCT_NAME_KEYWORDS):
                    continue
                m = re.search(r'(?:don|tim don|xem don cua|don co)\s+(.+)', msg_norm)
                if m:
                    product_name = m.group(1).strip()
                    if len(product_name) >= 2 and not any(kw in product_name for kw in ['nhat', 'cung', 'day', 'su']):
                        return (json.dumps({'__action__': {'action': 'order_detail_by_product', 'product_name': product_name}}), [])

            else:
                escaped = r'\s+'.join(re.escape(w) for w in pnorm.split())
                pattern = r'\b' + escaped + r'\b'
                if re.search(pattern, msg_norm):
                    logger.info('[MatchIntents] Matched intent: %s', tag)
                    if tag == 'bestseller':
                        reply, all_p = _handle_bestseller(response)
                        if all_p:
                            _set_last_products(all_p)
                        return (reply, all_p)
                    elif tag == 'gender':
                        reply, all_p = _handle_gender(msg_norm)
                        if all_p:
                            _set_last_products(all_p)
                        return (reply, all_p)
                    elif tag == 'sale_products':
                        reply, all_p = _handle_sale_products(response)
                        if all_p:
                            _set_last_products(all_p)
                        return (reply, all_p)
                    elif tag == 'new_arrivals':
                        reply, all_p = _handle_new_arrivals(response)
                        if all_p:
                            _set_last_products(all_p)
                        return (reply, all_p)
                    elif tag == 'help':
                        return (response, [])
                    else:
                        return (response, [])

    return (None, [])


# ══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

def process_message(msg: str, session_id: str = 'default') -> tuple[str, list, list]:
    msg_norm = normalize(msg)
    logger.info('raw=%r  norm=%r', msg[:80], msg_norm[:80])

    session = _get_session(session_id)

    # ── 1. ACTION ─────────────────────────────────────────────────────────────
    action = process_action(
        msg_norm,
        in_checkout_flow=session['in_checkout_flow'],
        has_last_products=bool(session['last_products']),
    )
    if action:
        logger.info('ACTION: %s', action)

        if action['action'] == 'checkout':
            _set_checkout_flow(True, session_id)
            return (json.dumps({'__action__': action}), [], [])

        if action['action'] == 'checkout_confirm':
            _set_checkout_flow(False, session_id)
            return (json.dumps({'__action__': action}), [], [])

        if action['action'] == 'view_detail':
            idx = action['index'] - 1
            last = session['last_products']
            if 0 <= idx < len(last):
                p = last[idx]
                return (json.dumps({'__action__': {'action': 'view_detail', 'product_id': str(p['_id'])}}), [], [])
            return ('Không có sản phẩm số đó trong danh sách vừa hiển thị.', [], [])

        if action['action'] == 'add_by_index':
            idx = action['index'] - 1
            last = session['last_products']
            if 0 <= idx < len(last):
                p = last[idx]
                enriched = {**action, 'product_name': p.get('name', ''), 'product_id': str(p['_id'])}
                return (json.dumps({'__action__': enriched}), [], [])
            return ('Không có sản phẩm số đó trong danh sách vừa hiển thị.', [], [])

        if action['action'] == 'compare_items':
            last = session['last_products']
            idx1 = action['index1'] - 1
            idx2 = action['index2'] - 1
            if 0 <= idx1 < len(last) and 0 <= idx2 < len(last):
                enriched = {
                    **action,
                    'product_id1': str(last[idx1]['_id']),
                    'product_id2': str(last[idx2]['_id']),
                }
                return (json.dumps({'__action__': enriched}), [], [])
            return ('Không có sản phẩm số đó trong danh sách vừa hiển thị.', [], [])

        return (json.dumps({'__action__': action}), [], [])

    # ── 2. COMPOUND ───────────────────────────────────────────────────────────
    compound_reply, compound_all = _handle_compound(msg_norm)
    if compound_reply:
        _set_last_products(compound_all, session_id)
        return (compound_reply, compound_all[:INITIAL_DISPLAY], compound_all)

    # ── 3. INTENT MATCHING ────────────────────────────────────────────────────
    intent_reply, intent_all = _match_intents(msg_norm)
    if intent_reply:
        if intent_reply == '__view_cart__':
            return (json.dumps({'__action__': {'action': 'cart_view'}}), [], [])
        if intent_all:
            _set_last_products(intent_all, session_id)
        return (intent_reply, intent_all[:INITIAL_DISPLAY], intent_all)

    # ── 4. INFER: detect_age / detect_price standalone ───────────────────────
    age   = detect_age(msg_norm)
    price = detect_price(msg_norm)
    if age is not None:
        reply, all_p = _handle_age(age)
        _set_last_products(all_p, session_id)
        return (reply, all_p[:INITIAL_DISPLAY], all_p)
    if price is not None:
        reply, all_p = _handle_price(price)
        _set_last_products(all_p, session_id)
        return (reply, all_p[:INITIAL_DISPLAY], all_p)

    # ── 5. BRAND standalone ───────────────────────────────────────────────────
    brand = detect_brand(msg_norm)
    if brand:
        reply, all_p = _handle_brand(brand)
        _set_last_products(all_p, session_id)
        return (reply, all_p[:INITIAL_DISPLAY], all_p)

    # ── 6. CATEGORY exact ─────────────────────────────────────────────────────
    cat_reply, cat_all = _handle_category_exact(msg_norm)
    if cat_reply:
        _set_last_products(cat_all, session_id)
        return (cat_reply, cat_all[:INITIAL_DISPLAY], cat_all)

    # ── 7. TOKEN search ───────────────────────────────────────────────────────
    all_products = _search_products_by_tokens(msg_norm)
    if all_products:
        keywords = _extract_keywords(msg_norm)
        kw_display = ' '.join(keywords) if keywords else msg_norm
        reply, _ = _fmt_products(all_products, f'Tìm thấy sản phẩm cho "{kw_display}":')
        if reply:
            _set_last_products(all_products, session_id)
            return (reply, all_products[:INITIAL_DISPLAY], all_products)

    # ── 8. CATEGORY token search ──────────────────────────────────────────────
    cat_token_reply, cat_token_all = _search_category_by_tokens(msg_norm)
    if cat_token_reply:
        _set_last_products(cat_token_all, session_id)
        return (cat_token_reply, cat_token_all[:INITIAL_DISPLAY], cat_token_all)

    # ── 9. FALLBACK ───────────────────────────────────────────────────────────
    return (
        'Xin lỗi, tôi chưa tìm thấy kết quả phù hợp 😅\n'
        'Bạn thử gõ:\n'
        '• Tên sản phẩm (vd: "gấu bông", "xe đua", "lego")\n'
        '• Độ tuổi (vd: "bé 3 tuổi", "cho trẻ 5 tuổi")\n'
        '• Giới tính (vd: "bé trai", "bé gái")\n'
        '• Giá (vd: "dưới 20 đô", "tầm 50")\n'
        '• Sản phẩm bán chạy\n'
        '• Sản phẩm giảm giá\n'
        '• Sản phẩm mới về\n'
        '• Gõ "hướng dẫn" để xem tất cả lệnh',
        [], []
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