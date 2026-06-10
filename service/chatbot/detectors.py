"""
detectors.py – Phát hiện tuổi, giá, giới tính từ chuỗi đã chuẩn hoá.
"""

import re

from constants import BOY_KEYWORDS, GIRL_KEYWORDS, PRICE_HINTS


# ── Tuổi ──────────────────────────────────────────────────────────────────────

def detect_age(msg_norm: str) -> int | None:
    """Trả về số tuổi (1–15) hoặc None nếu không tìm thấy."""
    # Dạng "3 tuoi", "3tuoi"
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

    # Dạng "len 3" (lên 3 tuổi)
    m = re.search(r'len\s*(\d+)', msg_norm)
    if m:
        age = int(m.group(1))
        if 0 < age <= 15:
            return age

    # Dạng mơ hồ: có từ gợi ý trẻ em + số nhỏ
    # FIX: pattern trước đây có 'tầm' (có dấu) → không bao giờ match sau strip_accents.
    # Sửa thành 'tam' (đã strip) và thêm 'gan'.
    age_hints = ('be', 'tre', 'thang', 'chau', 'con')
    m = re.search(r'(?:khoang|gan|tam)\s*(\d+)', msg_norm)
    if m and any(h in msg_norm for h in age_hints):
        n = int(m.group(1))
        if 0 < n <= 15:
            return n

    return None


# ── Giá ───────────────────────────────────────────────────────────────────────

def detect_price(msg_norm: str) -> int | None:
    """Trả về mức giá tối đa (USD) hoặc None nếu không tìm thấy.

    FIX: Bỏ 'do' khỏi PRICE_HINTS (dễ nhận nhầm), thay vào đó kiểm tra
    'do' riêng chỉ khi đã có số hợp lệ tìm thấy.
    """
    if not any(h in msg_norm for h in PRICE_HINTS):
        return None

    # Ưu tiên số ngay sau keyword giá
    m = re.search(r'(?:duoi|gia|max|toi da|khong qua|khoang)\s*(\d+)', msg_norm)
    if m:
        n = int(m.group(1))
        # Số > 15 → chắc chắn là giá; ≤ 15 chỉ nhận nếu có đơn vị tiền
        if n > 15 or 'do' in msg_norm or 'usd' in msg_norm:
            return n

    # Fallback: lấy số đầu tiên > 15 trong câu
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
    # Cả hai hoặc không có → trả None (để handler hỏi lại)
    return None