"""
detectors.py – Phát hiện tuổi, giá, giới tính, thương hiệu từ chuỗi đã chuẩn hoá.
"""

import re
import os
from pymongo import MongoClient

from constants import BOY_KEYWORDS, GIRL_KEYWORDS, PRICE_HINTS

# ── Kết nối MongoDB để lấy danh sách brand ─────────────────────────────────────
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017/rainbowrattles')
_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
_db = _client.get_database('rainbowrattles')
_products_col = _db['products']

_brand_cache = None

def _get_brand_list():
    """Lấy danh sách các brand duy nhất từ database (có cache)."""
    global _brand_cache
    if _brand_cache is None:
        try:
            brands = _products_col.distinct('brand')
            _brand_cache = [b.lower().strip() for b in brands if b and isinstance(b, str)]
        except Exception:
            _brand_cache = []
    return _brand_cache

def detect_brand(msg_norm: str) -> str | None:
    """Trả về tên brand (viết thường, không dấu) nếu tìm thấy trong câu."""
    brands = _get_brand_list()
    for b in brands:
        if b in msg_norm:
            return b
    return None


# ── Tuổi ──────────────────────────────────────────────────────────────────────

def detect_age(msg_norm: str) -> int | None:
    """Trả về số tuổi (1–15) hoặc None nếu không tìm thấy."""
    # Dạng "3 tuoi"
    m = re.search(r'(\d+)\s*tuoi', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # Dạng "3t" (viết tắt tuổi, không phải "3thang")
    m = re.search(r'(\d+)t\b(?!hang)', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # Dạng "len 3"
    m = re.search(r'len\s*(\d+)', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # Dạng "khoảng 3", "gần 3" + gợi ý tuổi
    age_hints = ('be', 'tre', 'thang', 'chau', 'con')
    m = re.search(r'(?:khoang|gan|tam)\s*(\d+)', msg_norm)
    if m and any(h in msg_norm for h in age_hints):
        n = int(m.group(1))
        if 0 < n <= 15:
            return n

    return None


# ── Giá ───────────────────────────────────────────────────────────────────────

def detect_price(msg_norm: str) -> int | None:
    """Trả về mức giá tối đa (USD) hoặc None nếu không tìm thấy."""
    if not any(h in msg_norm for h in PRICE_HINTS):
        return None

    # Ưu tiên số ngay sau keyword giá
    m = re.search(r'(?:duoi|gia|max|toi da|khong qua|khoang)\s*(\d+)', msg_norm)
    if m:
        n = int(m.group(1))
        if n > 15 or 'do' in msg_norm or 'usd' in msg_norm:
            return n

    # Fallback: lấy số đầu tiên > 15
    for num_str in re.findall(r'\d+', msg_norm):
        n = int(num_str)
        if n > 15:
            return n

    return None


# ── Giới tính ─────────────────────────────────────────────────────────────────

def detect_gender(msg_norm: str) -> str | None:
    """Trả về 'Boy', 'Girl' hoặc None."""
    is_boy  = any(kw in msg_norm for kw in BOY_KEYWORDS)
    is_girl = any(kw in msg_norm for kw in GIRL_KEYWORDS)
    if is_boy and not is_girl:
        return 'Boy'
    if is_girl and not is_boy:
        return 'Girl'
    return None