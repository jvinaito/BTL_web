"""
normalize.py – Chuẩn hoá văn bản đầu vào trước khi xử lý intent.
"""

import re
import unicodedata

from constants import SLANG, SYNONYMS, SPELL_CORRECT

# Compile slang patterns một lần duy nhất khi import
_SLANG_RE: list[tuple[re.Pattern, str]] = [
    (re.compile(p, re.IGNORECASE), r) for p, r in SLANG
]


def strip_accents(text: str) -> str:
    """Bỏ dấu tiếng Việt và chuyển về chữ thường."""
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return text.replace('đ', 'd').replace('Đ', 'D').lower()


def _apply_spell_correct(text: str) -> str:
    for wrong, correct in SPELL_CORRECT.items():
        pattern = r'\b' + re.escape(strip_accents(wrong)) + r'\b'
        text = re.sub(pattern, correct, text)
    return text


def _apply_synonyms(text: str) -> str:
    # Sắp xếp theo độ dài giảm dần để ưu tiên cụm dài hơn
    for src in sorted(SYNONYMS, key=len, reverse=True):
        dst = SYNONYMS[src]
        pattern = r'\b' + re.escape(src) + r'\b'
        text = re.sub(pattern, dst, text)
    return text


def normalize(text: str) -> str:
    """Pipeline: strip accents → slang → spell-correct → synonyms → collapse whitespace."""
    t = strip_accents(text)
    for pattern, replacement in _SLANG_RE:
        t = pattern.sub(replacement, t)
    t = _apply_spell_correct(t)
    t = _apply_synonyms(t)
    return re.sub(r'\s+', ' ', t).strip()


def norm_pattern(pattern: str) -> str:
    """Chuẩn hoá pattern intent (bảo toàn placeholder như {age}, {price})."""
    parts = re.split(r'(\{[^}]+\})', pattern)
    return ''.join(p if p.startswith('{') else strip_accents(p) for p in parts)