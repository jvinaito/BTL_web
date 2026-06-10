"""
constants.py – Tất cả cụm từ tĩnh: slang, stopwords, synonyms, spell-correct.
Không import gì ngoài thư viện chuẩn.
"""

# ── Slang / viết tắt ──────────────────────────────────────────────────────────
# Mỗi tuple: (raw_pattern, replacement)
# Compile thành regex ở normalize.py
SLANG: list[tuple[str, str]] = [
    # Chào hỏi
    (r'\b(?<!xin )chao\b',     'xin chao'),
    (r'\bhey\b',               'xin chao'),
    (r'\bhello\b',             'xin chao'),
    (r'\bhi\b',                'xin chao'),
    # Sản phẩm
    (r'\bsp\b',                'san pham'),
    (r'\bsanpham\b',           'san pham'),
    # Bán chạy
    (r'\bban chay(?! nhat)\b', 'ban chay nhat'),
    (r'\bbest ?seller\b',      'ban chay nhat'),
    (r'\btop1?\b',             'ban chay nhat'),   # gộp top + top1
    (r'\btop san pham\b',      'ban chay nhat'),
    (r'\bnoi bat\b',           'ban chay nhat'),
    (r'\bpho bien\b',          'ban chay nhat'),
    (r'\bban nhieu nhat\b',    'ban chay nhat'),
    (r'\bduoc ua chuong\b',    'ban chay nhat'),
    (r'\bnhieu nguoi mua\b',   'ban chay nhat'),
    (r'\bbesdeller\b',         'ban chay nhat'),
    # Giới tính – be trai
    (r'\bcon trai\b',          'be trai'),
    (r'\bboy\b',               'be trai'),
    (r'\btrai nho\b',          'be trai'),
    (r'\bchau trai\b',         'be trai'),
    # Giới tính – be gai
    (r'\bcon gai\b',           'be gai'),
    (r'\bgirl\b',              'be gai'),
    (r'\bgai nho\b',           'be gai'),
    (r'\bchau gai\b',          'be gai'),
    # Giá – đơn vị
    (r'\busd\b',               'do'),
    (r'\$(\d+)',               r'\1 do'),
    (r'(\d+)k\b',              r'\g<1>000'),
    # Giá – cụm "dưới / tối đa / khoảng"
    (r'\bkhong qua\b',         'duoi'),
    (r'\btoi da\b',            'duoi'),
    (r'\bmax\b',               'duoi'),
    # FIX: 'tam' → 'khoang' thay vì 'duoi' (ý nghĩa khác nhau)
    (r'\btam\b',               'khoang'),
    (r'\bgia bao nhieu\b',     'gia'),
    (r'\bbao nhieu tien\b',    'gia'),
    (r'\bpredge\b',            'gia duoi'),
    (r'\bre thoi\b',           'duoi 20'),
    (r'\bkhong dat\b',         'duoi'),
    (r'\bgiatot\b',            'duoi'),
    # Lỗi chính tả
    (r'\bdo choy\b',           'do choi'),
    (r'\bsan fam\b',           'san pham'),
    # Từ thừa cuối câu (không xoá 'rồi' vì có thể là từ cần thiết trong một số câu)
    (r'\bnhe\b',               ''),
    (r'\bak\b',                ''),
]

# ── Stopwords ─────────────────────────────────────────────────────────────────
# Đã loại bỏ trùng lặp so với bản gốc
STOPWORDS: frozenset[str] = frozenset({
    'do', 'choi', 'cho', 'be', 'tre', 'san', 'pham', 'tim', 'kiem',
    'loai', 'the', 'nao', 'gi', 'co', 'ban', 'muon', 'can', 'mua',
    'xem', 'hien', 'thi', 'tat', 'ca', 'mot', 'cai', 'nhung', 'cac',
    'la', 'va', 'hay', 'hoac', 'khong', 'tuoi', 'gia', 'duoi', 'tren',
    'khoang', 'dang', 'them', 'cung', 'nua', 'voi', 'den', 'tu',
    'toi', 'tui', 'minh', 'anh', 'chi', 'em', 'ho', 'chung',
    'xin', 'loi', 'vui', 'long', 'oke', 'ok', 'uh',
    'da', 'vang', 'chac', 'nen', 'biet', 'nghi', 'thay',
    'gioi', 'thieu', 'van', 'de', 'hoi', 'duoc', 'hieu',
    'tuy', 'neu', 'vi', 'vay', 'ma', 'du', 'khi',
    'trong', 'ngoai', 'sau', 'truoc', 'giua', 'cuoi', 'dau',
    'tot', 'dep', 're', 'dat', 'moi', 'cu', 'lon', 'nho', 'nhieu', 'it',
    'qua', 'rat', 'kha', 'hon', 'nhat', 'nhu', 'day',
    'hai', 'ba', 'bon', 'nam', 'bay', 'tam', 'chin', 'muoi',
    'di', 'nha', 'chu', 'gio', 'luc',
    'hang', 'kho', 'mang', 'ship', 'giao',
    'cart', 'hanh', 'thanh', 'toan',
})

# ── Synonyms ──────────────────────────────────────────────────────────────────
# FIX: 'puzzle' không còn map tới 'xep hinh' để tránh xung đột với _SPELL_CORRECT.
# Bây giờ cả 'puzzle' và 'xep hinh' đều là danh mục hợp lệ riêng biệt.
SYNONYMS: dict[str, str] = {
    'xe hoi':        'xe o to',
    'o to':          'xe o to',
    'xe hop':        'xe o to',
    'xe oto':        'xe o to',
    'xe hoi':        'xe o to',   # có dấu — sẽ được strip trước khi dùng
    'doll':          'bup be',
    'barbie':        'bup be',
    'teddy':         'gau bong',
    'thu bong':      'gau bong',
    'thu nhoi bong': 'gau bong',
    'block':         'do xep hinh',
    'xep hinh':      'do xep hinh',
    'ghep hinh':     'xep hinh',
    'da banh':       'banh da',
    'da cau':        'cau long',
    'xe lua':        'tau hoa',
    'xe dien':       'xe chay pin',
    'xe pin':        'xe chay pin',
    'drone':         'may bay dieu khien',
    'sung nuoc':     'do choi nuoc',
    'bong bong':     'bong',
    # Tuổi bằng chữ → số (xử lý trước khi detect_age)
    'mot tuoi':  '1 tuoi',
    'hai tuoi':  '2 tuoi',
    'ba tuoi':   '3 tuoi',
    'bon tuoi':  '4 tuoi',
    'nam tuoi':  '5 tuoi',
    'sau tuoi':  '6 tuoi',
    'bay tuoi':  '7 tuoi',
    'tam tuoi':  '8 tuoi',
    'chin tuoi': '9 tuoi',
    'muoi tuoi': '10 tuoi',
}

# ── Spell correction ──────────────────────────────────────────────────────────
# FIX: 'pulle'/'puzzel' → 'puzzle' (không chuyển thẳng sang 'xep hinh')
# để synonym pipeline quyết định sau.
SPELL_CORRECT: dict[str, str] = {
    'gao bong':  'gau bong',
    'xep hien':  'xep hinh',
    'xep hin':   'xep hinh',
    'pulle':     'puzzle',
    'puzzel':    'puzzle',
    'robo':      'robot',
    'xe hoi':    'xe o to',    # có dấu — strip trước khi match
}

# ── Keywords giới tính ────────────────────────────────────────────────────────
BOY_KEYWORDS:  tuple[str, ...] = ('be trai', 'trai', 'do choi nam', 'cho trai', 'con trai')
GIRL_KEYWORDS: tuple[str, ...] = ('be gai',  'gai',  'do choi nu',  'cho gai',  'con gai')

# ── Hints phát hiện giá ───────────────────────────────────────────────────────
# FIX: bỏ 'do' khỏi hints vì 'do' xuất hiện quá phổ biến, dễ gây nhận nhầm giá.
PRICE_HINTS: tuple[str, ...] = (
    'duoi', 'gia', 're', 'tien', 'usd', 'khoang', 'gia duoi', 'budget',
)