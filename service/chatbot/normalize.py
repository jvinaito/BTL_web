"""
normalize.py – Chuẩn hoá văn bản đầu vào trước khi xử lý intent.
Phiên bản cải thiện: giữ nguyên constants.py, bổ sung thêm slang, spell, synonym mở rộng.
"""

import re
import unicodedata

from constants import SLANG as CONST_SLANG
from constants import SYNONYMS as CONST_SYNONYMS
from constants import SPELL_CORRECT as CONST_SPELL

# ── Bổ sung slang mới (không trùng với constants) ──
EXTRA_SLANG: list[tuple[str, str]] = [
    # Viết tắt mạng xã hội
    (r'\bbh\b', 'bây giờ'),
    (r'\bbtw\b', 'nhân tiện'),
    (r'\bck\b', 'chồng'),
    (r'\bvk\b', 'vợ'),
    (r'\bko\b', 'không'),
    (r'\bk\b', 'không'),
    (r'\bkhum\b', 'không'),
    (r'\bkh\b', 'không'),
    (r'\bkp\b', 'không phải'),
    (r'\bkq\b', 'kết quả'),
    (r'\bmk\b', 'mình'),
    (r'\btk\b', 'tài khoản'),
    (r'\bvc\b', 'việc'),
    (r'\bntn\b', 'như thế nào'),
    (r'\bsdn\b', 'số điện thoại'),
    (r'\bsđt\b', 'số điện thoại'),
    (r'\bvd\b', 'ví dụ'),
    (r'\bvl\b', 'vậy luôn'),
    (r'\bqt\b', 'quốc tế'),
    (r'\btt\b', 'trạng thái'),
    (r'\bgd\b', 'giao dịch'),
    (r'\bms\b', 'mới'),
    (r'\bnv\b', 'nhân viên'),
    (r'\bdv\b', 'dịch vụ'),
    (r'\bgg\b', 'google'),
    (r'\bfb\b', 'facebook'),
    (r'\bđc\b', 'được'),
    (r'\bdc\b', 'được'),
    (r'\bbn\b', 'bao nhiêu'),
    (r'\bbnh\b', 'bao nhiêu'),
    (r'\bpls\b', 'xin hãy'),
    (r'\bplz\b', 'xin hãy'),
    (r'\bthks\b', 'cảm ơn'),
    (r'\btks\b', 'cảm ơn'),
    (r'\bty\b', 'cảm ơn'),
    (r'\bokay\b', 'ok'),
    (r'\bok\b', 'được rồi'),
    # Teen code
    (r'\bchuj\b', 'chứ'),
    (r'\btr\b', 'trước'),
    (r'\bsau\b', 'sau'),
    (r'\bz\b', 'vậy'),
    (r'\bvz\b', 'vậy'),
    (r'\bdao\b', 'dạo'),
    (r'\bđây\b', 'đây'),
    (r'\bnày\b', 'này'),
    (r'\bnay\b', 'nay'),
    (r'\btrc\b', 'trước'),
    (r'\bthui\b', 'thôi'),
    (r'\bthoy\b', 'thôi'),
    (r'\bnhiu\b', 'nhiều'),
    (r'\bnh\b', 'nhiều'),
    (r'\bbit\b', 'biết'),
    (r'\bbik\b', 'biết'),
    (r'\bhet\b', 'hết'),
    (r'\bquá\b', 'quá'),
    (r'\bwa\b', 'quá'),
    (r'\bui\b', 'ơi'),
    (r'\bừa\b', 'ừa'),
    (r'\buh\b', 'ừ'),
    (r'\buh huh\b', 'ừ'),
    (r'\bheng\b', 'hông'),
    (r'\bhok\b', 'không'),
    (r'\bhok co\b', 'không có'),
    (r'\bkg\b', 'không'),
    (r'\bkhg\b', 'không'),
    (r'\bkog\b', 'không'),
    # Lỗi bàn phím
    (r'\bej\b', 'gì'),
    (r'\bgj\b', 'gì'),
    (r'\bnj\b', 'ni'),
    (r'\bvj\b', 'vì'),
    (r'\bj\b', 'gì'),
    # Biểu cảm
    (r'hahah+', 'haha'),
    (r'heheh+', 'hehe'),
    (r'hihi+', 'hehe'),
    (r'uh+m+', 'ừm'),
    (r'wow+', 'wow'),
    (r'oke+', 'ok'),
    (r'okie+', 'ok'),
    # Số lượng
    (r'(\d+)\s+cai\b', r'\1 cái'),
    (r'(\d+)\s+chiec\b', r'\1 chiếc'),
    (r'(\d+)\s+sp\b', r'\1 sản phẩm'),
]

# ── Gộp slang ──
SLANG = list(CONST_SLANG)
# Thêm extra, tránh trùng lặp (kiểm tra pattern)
existing_patterns = {p for p, _ in SLANG}
for p, r in EXTRA_SLANG:
    if p not in existing_patterns:
        SLANG.append((p, r))
        existing_patterns.add(p)

# ── Bổ sung spell correct (key đã có dấu, normalize sẽ strip accents) ──
EXTRA_SPELL: dict[str, str] = {
    'san phẩm': 'san pham',
    'sản phâm': 'san pham',
    'do choii': 'do choi',
    'do chơi': 'do choi',
    'giao háng': 'giao hang',
    'giáo hàng': 'giao hang',
    'giỏ hàg': 'gio hang',
    'đặt hàg': 'dat hang',
    'khuyến mại': 'khuyen mai',
    'khuyến mải': 'khuyen mai',
    'thanh toán': 'thanh toan',
    'thah toan': 'thanh toan',
    'tahn toan': 'thanh toan',
    'vân chuyển': 'van chuyen',
    'vận chuyễn': 'van chuyen',
    'hòan tiền': 'hoan tien',
    'hoàm tien': 'hoan tien',
    'đổi trã': 'doi tra',
    'bán cháy': 'ban chay',
    'bán chaỵ': 'ban chay',
    'tuoii': 'tuoi',
    'khog': 'khong',
    'khôg': 'khong',
    'khôngg': 'khong',
    'có gì': 'co gi',
    'gợi í': 'goi y',
    'gơi y': 'goi y',
    'tìn': 'tim',
    'tim kem': 'tim kiem',
    'tìm kiếm': 'tim kiem',
    'thông tinn': 'thong tin',
    'thông tiin': 'thong tin',
    'lich sử': 'lich su',
    'lịch sử': 'lich su',
    'dơn hàng': 'don hang',
    'đơn hàg': 'don hang',
    'đơn hàn': 'don hang',
    'hủy đơn': 'huy don',
    'huỷ đơn': 'huy don',
    'sinhh nhat': 'sinh nhat',
    'sinh nhật': 'sinh nhat',
    'sinh nhàt': 'sinh nhat',
    'quà tặng': 'qua tang',
    'quà tang': 'qua tang',
    'sosanh': 'so sanh',
    'so sánh': 'so sanh',
    'tư van': 'tu van',
    'tư vấn': 'tu van',
    'muonn mua': 'muon mua',
    'muốn mua': 'muon mua',
    'hotlien': 'hotline',
    'liên hệ': 'lien he',
    'liên hê': 'lien he',
    'bao nhieu': 'bao nhieu',
    'bao nhiêu': 'bao nhieu',
}

# ── Gộp spell correct ──
SPELL_CORRECT = dict(CONST_SPELL)
SPELL_CORRECT.update(EXTRA_SPELL)

# ── Bổ sung synonyms (key không dấu) ──
EXTRA_SYNONYMS: dict[str, str] = {
    # Mua sắm
    'mua sam': 'mua hang',
    'shopping': 'mua hang',
    'dat mua': 'dat hang',
    'order': 'dat hang',
    'purchase': 'dat hang',
    'buy': 'mua',
    'add to cart': 'them vao gio',
    'them gio': 'them vao gio',
    'bo vao gio': 'them vao gio',
    # Sản phẩm
    'hang hoa': 'san pham',
    'mat hang': 'san pham',
    'mon do': 'san pham',
    'item': 'san pham',
    'product': 'san pham',
    # Giỏ hàng
    'cart': 'gio hang',
    'basket': 'gio hang',
    'tui hang': 'gio hang',
    # Giá
    'gia ca': 'gia',
    'gia tien': 'gia',
    'cost': 'gia',
    'price': 'gia',
    'bao tien': 'gia bao nhieu',
    'bao nhieu tien': 'gia bao nhieu',
    'gia bao nhieu': 'gia bao nhieu',
    'mat bao nhieu': 'gia bao nhieu',
    'tot gia': 'gia re',
    're tien': 'gia re',
    'gia mem': 'gia re',
    'gia binh dan': 'gia re',
    'gia tot': 'gia re',
    'giam gia': 'khuyen mai',
    'sale off': 'khuyen mai',
    'on sale': 'khuyen mai',
    'discount': 'khuyen mai',
    # Đổi trả
    'tra lai': 'tra hang',
    'doi lai': 'doi hang',
    'refund': 'hoan tien',
    'return': 'doi tra',
    'bao hanh': 'doi tra',
    'warranty': 'doi tra',
    # Giao hàng
    'giao nhanh': 'giao hang nhanh',
    'ship': 'giao hang',
    'delivery': 'giao hang',
    'van chuyen': 'giao hang',
    'gui hang': 'giao hang',
    'nhan hang': 'giao hang',
    'phi ship': 'phi giao hang',
    'phi van chuyen': 'phi giao hang',
    'free ship': 'mien phi giao hang',
    'freeship': 'mien phi giao hang',
    # Đơn hàng
    'don': 'don hang',
    'order history': 'lich su don hang',
    'lich su': 'lich su don hang',
    'huy don': 'huy don hang',
    'cancel': 'huy',
    'track': 'theo doi',
    'tracking': 'theo doi',
    'van don': 'ma van don',
    # Độ tuổi
    'so sinh': 'so sinh',
    'nho tuoi': 'be',
    'infant': 'so sinh',
    'toddler': 'tre moi biet di',
    'kids': 'tre em',
    'children': 'tre em',
    'baby': 'be',
    # Giới tính
    'boy': 'be trai',
    'girl': 'be gai',
    'nam': 'be trai',
    'nu': 'be gai',
    'con trai': 'be trai',
    'con gai': 'be gai',
    'chau trai': 'be trai',
    'chau gai': 'be gai',
    # Danh mục
    'xe hoi': 'xe',
    'xe tai': 'xe',
    'bup be': 'bup be',
    'doll': 'bup be',
    'robot': 'robot',
    'lego': 'xep hinh',
    'puzzle': 'xep hinh',
    'cau do': 'xep hinh',
    'gau bong': 'gau bong',
    'teddy': 'gau bong',
    'stuffed animal': 'thu nhoi bong',
    # Quà tặng
    'gift': 'qua tang',
    'present': 'qua tang',
    'qua': 'qua tang',
    'mon qua': 'qua tang',
    'tang qua': 'tang qua',
    'qua sinh nhat': 'qua tang sinh nhat',
    'qua noel': 'qua tang giang sinh',
    'qua giang sinh': 'qua tang giang sinh',
    'qua tet': 'qua tang tet',
    'qua trung thu': 'qua tang trung thu',
    # Liên hệ
    'support': 'ho tro',
    'help': 'tro giup',
    'contact': 'lien he',
    'customer service': 'ho tro khach hang',
    'cskh': 'ho tro khach hang',
    'tu van': 'tu van',
    'nhan vien': 'nhan vien tu van',
    # Thanh toán
    'cod': 'thanh toan khi nhan hang',
    'cash on delivery': 'thanh toan khi nhan hang',
    'chuyen khoan': 'chuyen khoan ngan hang',
    'banking': 'chuyen khoan ngan hang',
    'momo': 'vi dien tu momo',
    'zalopay': 'vi dien tu zalopay',
    'vnpay': 'vi dien tu vnpay',
    'visa': 'the tin dung',
    'mastercard': 'the tin dung',
    'atm': 'the ghi no',
    # An toàn
    'an toan': 'an toan',
    'safe': 'an toan',
    'bpa free': 'khong bpa',
    'chat lieu': 'nguyen lieu',
    'material': 'nguyen lieu',
    'chung chi': 'chung nhan chat luong',
    'certified': 'chung nhan chat luong',
    # Tìm kiếm
    'search': 'tim kiem',
    'find': 'tim',
    'compare': 'so sanh',
    'vs': 'so sanh',
    'review': 'danh gia',
    'rating': 'danh gia',
    'feedback': 'danh gia',
    'bestseller': 'ban chay nhat',
    'top rated': 'danh gia cao nhat',
    'most popular': 'pho bien nhat',
    'trending': 'dang hot',
    'new': 'moi',
    'newest': 'moi nhat',
    'latest': 'moi nhat',
}

# ── Gộp synonyms ──
SYNONYMS = dict(CONST_SYNONYMS)
SYNONYMS.update(EXTRA_SYNONYMS)

# ── Compile slang patterns ──
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
        # wrong có thể có dấu, strip accents để match
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


def _remove_filler_words(text: str) -> str:
    """Loại bỏ từ đệm không mang nghĩa."""
    fillers = [
        r'\b(uh|um|er|ah|hmm|ừm|à|ờ|ơ|mà|thì|là|đó|vậy|nhỉ|nha|nhe|ha|hả|ạ|ơi)\b',
    ]
    for f in fillers:
        text = re.sub(f, ' ', text, flags=re.IGNORECASE)
    return text


def normalize(text: str) -> str:
    """
    Pipeline: slang (có dấu) → strip accents → spell-correct → synonyms → filler → collapse whitespace.
    """
    t = text  # slang đã được áp dụng trong pipeline
    # Áp dụng slang trước khi strip accents (vì slang có thể có dấu)
    for pattern, replacement in _SLANG_RE:
        t = pattern.sub(replacement, t)
    t = strip_accents(t)
    t = _apply_spell_correct(t)
    t = _apply_synonyms(t)
    t = _remove_filler_words(t)
    return re.sub(r'\s+', ' ', t).strip()


def norm_pattern(pattern: str) -> str:
    """Chuẩn hoá pattern intent (bảo toàn placeholder như {age}, {price})."""
    parts = re.split(r'(\{[^}]+\})', pattern)
    return ''.join(p if p.startswith('{') else strip_accents(p) for p in parts)