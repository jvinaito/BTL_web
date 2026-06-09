import re
import json
import logging
import os
from pymongo import MongoClient
from pymongo.errors import PyMongoError
import unicodedata
logger = logging.getLogger(__name__)


def remove_vietnamese_tones(text):
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = text.replace('đ', 'd').replace('Đ', 'D')
    return text
# ── Load intents ────────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(_BASE_DIR, 'intents.json'), 'r', encoding='utf-8') as f:
    INTENTS = json.load(f)['intents']

# ── MongoDB ──────────────────────────────────────────────────────────────────
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017/rainbowrattles')
_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
_db = _client.get_database('rainbowrattles')
products_col   = _db['products']
categories_col = _db['categories']

# ── Helpers ──────────────────────────────────────────────────────────────────
def _fmt_products(products, label=''):
    """Format a list of product dicts into a readable string."""
    if not products:
        return None
    lines = [label] if label else []
    for p in products:
        name  = p.get('name', 'N/A')
        price = p.get('salePrice', '?')
        lines.append(f'• {name} – ${price}')
    return '\n'.join(lines)


def _get_all_category_names():
    """Return lowercase category name → ObjectId mapping."""
    try:
        return {
            cat['name'].lower(): cat['_id']
            for cat in categories_col.find({}, {'name': 1})
            if 'name' in cat
        }
    except PyMongoError as e:
        logger.error('MongoDB categories error: %s', e)
        return {}


# ── Intent handlers ──────────────────────────────────────────────────────────
def _handle_age(age: int) -> str:
    try:
        products = list(products_col.find(
            {'ageRange': {'$regex': str(age), '$options': 'i'}},
            {'name': 1, 'salePrice': 1}
        ).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return 'Xin lỗi, không thể truy vấn dữ liệu lúc này.'

    result = _fmt_products(products, f'Sản phẩm phù hợp cho bé {age} tuổi:')
    return result or f'Rất tiếc, hiện chưa có sản phẩm nào cho bé {age} tuổi.'


def _handle_price(price: int) -> str:
    try:
        products = list(products_col.find(
            {'salePrice': {'$lte': price}},
            {'name': 1, 'salePrice': 1}
        ).sort('salePrice', 1).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return 'Xin lỗi, không thể truy vấn dữ liệu lúc này.'

    result = _fmt_products(products, f'Sản phẩm có giá dưới ${price}:')
    return result or f'Không tìm thấy sản phẩm nào có giá dưới ${price}.'


def _handle_category(msg_lower: str) -> str | None:
    cat_map = _get_all_category_names()
    matched_name = next(
        (name for name in cat_map if name in msg_lower),
        None
    )
    if not matched_name:
        return None

    try:
        products = list(products_col.find(
            {'category': cat_map[matched_name]},
            {'name': 1, 'salePrice': 1}
        ).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return 'Xin lỗi, không thể truy vấn dữ liệu lúc này.'

    display_name = matched_name.title()
    result = _fmt_products(products, f'Sản phẩm danh mục {display_name}:')
    return result or f'Hiện chưa có sản phẩm nào trong danh mục {display_name}.'


def _handle_bestseller(base_response: str) -> str:
    try:
        products = list(products_col.find(
            {'sold': {'$exists': True}},
            {'name': 1, 'sold': 1, 'salePrice': 1}
        ).sort('sold', -1).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return 'Xin lỗi, không thể truy vấn dữ liệu lúc này.'

    if not products:
        return 'Hiện chưa có dữ liệu sản phẩm bán chạy.'

    lines = [base_response]
    for p in products:
        lines.append(f"• {p.get('name', 'N/A')} – ${p.get('salePrice', '?')} (đã bán: {p.get('sold', 0)})")
    return '\n'.join(lines)


def _handle_gender(msg_lower: str, base_response: str) -> str:
    is_boy = any(kw in msg_lower for kw in ('trai', 'boy', 'nam'))
    gender = 'Boy' if is_boy else 'Girl'
    label  = 'bé trai' if is_boy else 'bé gái'

    try:
        products = list(products_col.find(
            {'gender': gender},
            {'name': 1, 'salePrice': 1}
        ).limit(5))
    except PyMongoError as e:
        logger.error('MongoDB error: %s', e)
        return 'Xin lỗi, không thể truy vấn dữ liệu lúc này.'

    result = _fmt_products(products, f'Sản phẩm dành cho {label}:')
    return result or f'Hiện chưa có sản phẩm dành cho {label}.'


# ── Main entry point ─────────────────────────────────────────────────────────
def process_message(msg: str) -> str:
    msg_lower = remove_vietnamese_tones(
        msg.lower().strip()
    )
    for intent in INTENTS:
        tag      = intent['tag']
        patterns = intent['patterns']
        response = intent['responses'][0]

        for pattern in patterns:
            # --- Dynamic patterns ---
            if '{age}' in pattern:
                regex = pattern.replace('{age}', r'(\d+)')
                m = re.search(regex, msg_lower)
                if m:
                    return _handle_age(int(m.group(1)))

            elif '{price}' in pattern:
                regex = pattern.replace('{price}', r'(\d+)')
                m = re.search(regex, msg_lower)
                if m:
                    return _handle_price(int(m.group(1)))

            elif '{category}' in pattern:
                result = _handle_category(msg_lower)
                if result:
                    return result

            # --- Static patterns ---
            else:
                if pattern.lower() in msg_lower:
                    if tag == 'bestseller':
                        return _handle_bestseller(response)
                    elif tag == 'gender':
                        return _handle_gender(msg_lower, response)
                    elif tag == 'greeting':
                        return response
                    else:
                        return response  # fallback for any other static tag

    return (
        'Xin lỗi, tôi chưa hiểu câu hỏi của bạn 😅\n'
        'Bạn có thể hỏi về:\n'
        '• Sản phẩm bán chạy\n'
        '• Đồ chơi theo độ tuổi (vd: "đồ chơi cho bé 3 tuổi")\n'
        '• Đồ chơi theo giới tính (bé trai / bé gái)\n'
        '• Sản phẩm theo giá (vd: "dưới 20 đô")\n'
        '• Danh mục sản phẩm'
    )
