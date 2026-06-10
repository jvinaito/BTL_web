# actions.py
import re
from typing import Optional, Dict, Any

def _extract_product_name_and_quantity(msg_norm: str) -> tuple[Optional[str], int]:
    """
    Trích xuất tên sản phẩm và số lượng từ câu lệnh (đã normalize không dấu).
    Trả về (product_name, quantity). Mặc định quantity = 1.
    """
    patterns = [
        # Dạng: "cho toi 5 lego du hanh vu tru"
        r'^(?:cho toi|toi muon|cho tui)\s+(\d+)\s+(.+?)$',
        # Dạng: "them 5 lego"
        r'^(?:them|mua|cho vao gio|add to cart)\s+(\d+)\s+(.+?)(?:\s+vao gio)?$',
        # Dạng: "them lego voi so luong 5"
        r'^(?:them|mua)\s+(.+?)\s+voi so luong\s+(\d+)$',
        # Dạng: "mua 2 cai gau bong"
        r'^(?:them|mua)\s+(\d+)\s+(?:cai|chiec|san pham)?\s+(.+?)$',
        # Dạng không số lượng (quantity=1)
        r'^(?:them|mua|cho vao gio|add to cart|cho toi|toi muon)\s+(.+?)(?:\s+vao gio)?$',
    ]
    for pat in patterns:
        m = re.search(pat, msg_norm, re.IGNORECASE)
        if m:
            groups = m.groups()
            if len(groups) == 2:
                g1, g2 = groups
                if g1.isdigit():
                    return (g2.strip(), int(g1))
                elif g2.isdigit():
                    return (g1.strip(), int(g2))
                else:
                    return (g1.strip(), 1)
            else:
                return (groups[0].strip(), 1)
    return (None, 1)

def parse_add_to_cart(msg_norm: str) -> Optional[Dict[str, Any]]:
    product_name, quantity = _extract_product_name_and_quantity(msg_norm)
    if product_name and len(product_name) >= 3:  # đủ dài để tránh nhầm
        return {'action': 'add_to_cart', 'product_name': product_name, 'quantity': quantity}
    return None

def parse_checkout(msg_norm: str) -> Optional[Dict[str, Any]]:
    patterns = [
        r'^(?:dat hang|thanh toan|checkout|mua hang|dat mua)$',
        r'^(?:toi muon|cho toi) (?:dat hang|thanh toan|checkout)',
    ]
    for pat in patterns:
        if re.search(pat, msg_norm, re.IGNORECASE):
            return {'action': 'checkout'}
    return None

def process_action(msg_norm: str) -> Optional[Dict[str, Any]]:
    chk = parse_checkout(msg_norm)
    if chk:
        return chk
    add = parse_add_to_cart(msg_norm)
    if add:
        return add
    return None