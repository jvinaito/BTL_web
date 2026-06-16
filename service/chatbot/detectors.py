"""
detectors.py – Phát hiện tuổi, giá, giới tính, thương hiệu từ chuỗi đã chuẩn hoá.

FIX so với bản cũ:
- detect_price: fallback lấy số > 15 chỉ chạy khi có PRICE_HINTS rõ ràng (không phải 're'),
  tránh nhầm "bé 20 tuổi" → price=20.
- detect_price: không lấy số đã bị detect_age nhận.
- detect_brand: thêm min-length guard (brand >= 3 ký tự) tránh match sai.
"""

import re
import time
import os
from pymongo import MongoClient

from constants import BOY_KEYWORDS, GIRL_KEYWORDS, PRICE_HINTS

# ── Kết nối MongoDB ───────────────────────────────────────────────────────────
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://127.0.0.1:27017/rainbowrattles')
_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=3000)
_db = _client.get_database('rainbowrattles')
_products_col = _db['products']

_brand_cache: dict = {"data": None, "timestamp": 0}
_BRAND_CACHE_TTL = 300  # 5 phút


def _get_brand_list() -> list[str]:
    now = time.time()
    if _brand_cache["data"] is None or (now - _brand_cache["timestamp"]) > _BRAND_CACHE_TTL:
        try:
            brands = _products_col.distinct('brand')
            # FIX: lọc brand quá ngắn (< 3 ký tự) tránh false-match
            _brand_cache["data"] = [
                b.lower().strip() for b in brands
                if b and isinstance(b, str) and len(b.strip()) >= 3
            ]
            _brand_cache["timestamp"] = now
        except Exception:
            _brand_cache["data"] = []
    return _brand_cache["data"]


def detect_brand(msg_norm: str) -> str | None:
    brands = _get_brand_list()
    # Ưu tiên brand dài hơn để tránh match sai (vd: "lego" trước "le")
    for b in sorted(brands, key=len, reverse=True):
        # Dùng word-boundary để tránh "lego" match "legos"
        if re.search(r'\b' + re.escape(b) + r'\b', msg_norm):
            return b
    return None


# ── Tuổi ──────────────────────────────────────────────────────────────────────

def detect_age(msg_norm: str) -> int | None:
    """Trả về số tuổi (1–15) hoặc None."""
    # "3 tuoi" / "3tuoi"
    m = re.search(r'(\d+)\s*tuoi', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # "3t" – viết tắt tuổi (không phải "3thang", "3tr", "3ty")
    m = re.search(r'(\d+)t\b(?!hang|r|y)', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # "len 3"
    m = re.search(r'len\s*(\d+)', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # "khoang 3", "gan 3" + gợi ý tuổi
    age_hints = ('be', 'tre', 'thang', 'chau', 'con')
    m = re.search(r'(?:khoang|gan|tam)\s*(\d+)', msg_norm)
    if m and any(h in msg_norm for h in age_hints):
        n = int(m.group(1))
        if 0 < n <= 15:
            return n

    return None


# ── Giá ───────────────────────────────────────────────────────────────────────

# Hints "mạnh" – không bao gồm 're' vì 're' quá ngắn và hay xuất hiện ngẫu nhiên
_STRONG_PRICE_HINTS = ('duoi', 'gia', 'tien', 'usd', 'do', 'gia duoi', 'budget', 'khoang gia')


def detect_price(msg_norm: str) -> int | None:
    """
    Trả về mức giá tối đa (đơn vị gốc trong câu, thường là USD hoặc VND đã rút gọn).

    FIX:
    - Chỉ fallback lấy số > 15 khi có STRONG hint (loại trừ 're').
    - Loại trừ số đã được detect_age nhận (tránh "cho bé 5 tuổi dưới 20" lấy 5 làm price).
    """
    has_hint = any(h in msg_norm for h in PRICE_HINTS)
    if not has_hint:
        return None

    # Lấy số tuổi đã detect để loại trừ khỏi price candidates
    age_val = detect_age(msg_norm)

    # Ưu tiên số ngay sau keyword giá
    m = re.search(
        r'(?:duoi|gia|max|toi da|khong qua|khoang gia|gia duoi|budget)\s*(\d+)',
        msg_norm
    )
    if m:
        n = int(m.group(1))
        if age_val and n == age_val:
            pass  # Không nhầm tuổi thành giá
        else:
            currency_hint = bool(re.search(r'\bdo\b|\busd\b|\$', msg_norm))
            if n > 15 or currency_hint:
                return n

    # Fallback: lấy số đầu tiên > 15, chỉ khi có STRONG hint
    has_strong_hint = any(h in msg_norm for h in _STRONG_PRICE_HINTS)
    if has_strong_hint:
        for num_str in re.findall(r'\d+', msg_norm):
            n = int(num_str)
            if n > 15 and (age_val is None or n != age_val):
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