"""
actions.py – Phân tích hành động người dùng: thêm giỏ hàng, checkout, xem chi tiết,
xem giỏ, sửa giỏ, xóa giỏ.
"""

import re
from typing import Optional, Dict, Any

from constants import CONFIRM_YES, CONFIRM_NO


def _extract_product_name_and_quantity(msg_norm: str) -> tuple[Optional[str], int]:
    patterns = [
        r'^(?:cho toi|toi muon|cho tui)\s+(\d+)\s+(.+?)$',
        r'^(?:them|mua|cho vao gio|add to cart)\s+(\d+)\s+(.+?)(?:\s+vao gio)?$',
        r'^(?:them|mua)\s+(.+?)\s+voi so luong\s+(\d+)$',
        r'^(?:them|mua)\s+(\d+)\s+(?:cai|chiec|san pham)?\s+(.+?)$',
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
    if product_name and len(product_name) >= 3:
        return {'action': 'add_to_cart', 'product_name': product_name, 'quantity': quantity}
    return None


def parse_add_by_index(msg_norm: str) -> Optional[Dict[str, Any]]:
    patterns = [
        r'^(?:them|add)\s+(\d+)\s+(?:cai|chiec)?\s*(?:so\s*)?(\d+)$',
        r'^(?:them|add)\s+(?:vao gio\s+)?(?:so\s*)?(\d+)$',
    ]
    for pat in patterns:
        m = re.search(pat, msg_norm, re.IGNORECASE)
        if m:
            groups = m.groups()
            if len(groups) == 2:
                qty, idx = int(groups[0]), int(groups[1])
                if 1 <= idx <= 20:
                    return {'action': 'add_by_index', 'index': idx, 'quantity': qty}
            elif len(groups) == 1:
                idx = int(groups[0])
                if 1 <= idx <= 20:
                    return {'action': 'add_by_index', 'index': idx, 'quantity': 1}
    return None


def parse_view_detail(msg_norm: str) -> Optional[Dict[str, Any]]:
    if re.fullmatch(r'[1-9]', msg_norm.strip()):
        return {'action': 'view_detail', 'index': int(msg_norm.strip())}
    m = re.search(
        r'^(?:xem|chi tiet|mo ta|san pham|so|thong tin|hinh anh)\s*(?:so\s*)?(\d+)$',
        msg_norm.strip(), re.IGNORECASE
    )
    if m:
        idx = int(m.group(1))
        if 1 <= idx <= 20:
            return {'action': 'view_detail', 'index': idx}
    return None


def parse_cart_view(msg_norm: str) -> Optional[Dict[str, Any]]:
    patterns = [
        r'^(?:xem gio hang|gio hang cua toi|gio hang|cart|trong gio co gi|gio hang co gi)$',
    ]
    for pat in patterns:
        if re.search(pat, msg_norm.strip(), re.IGNORECASE):
            return {'action': 'cart_view'}
    return None


def parse_cart_update(msg_norm: str) -> Optional[Dict[str, Any]]:
    # Ưu tiên index trước: "sửa 2 thành 5", "sửa số 2 thành 5"
    m = re.search(
        r'(?:sua|cap nhat|doi|tang|giam)\s+(?:so luong\s+)?(?:san pham\s+)?(?:so\s*)?(\d+)\s+(?:thanh|len|xuong|bang)\s+(\d+)',
        msg_norm, re.IGNORECASE
    )
    if m:
        idx = int(m.group(1))
        quantity = int(m.group(2))
        if 1 <= idx <= 20 and quantity > 0:
            return {'action': 'cart_update_by_index', 'index': idx, 'quantity': quantity}

    # Nếu không có index, thử tìm tên sản phẩm: "sửa gấu bông thành 3"
    m = re.search(
        r'(?:sua|cap nhat|doi|tang|giam)\s+(?:so luong\s+)?(.+?)\s+(?:thanh|len|xuong|bang)\s+(\d+)',
        msg_norm, re.IGNORECASE
    )
    if m:
        product_name = m.group(1).strip()
        quantity = int(m.group(2))
        parts = product_name.split()
        if len(parts) > 2:
            unique = []
            for w in parts:
                if w not in unique:
                    unique.append(w)
            if len(unique) < len(parts):
                product_name = ' '.join(unique[:2])
            else:
                product_name = ' '.join(parts[:2])
        if product_name and len(product_name) >= 2 and quantity > 0:
            return {'action': 'cart_update', 'product_name': product_name, 'quantity': quantity}
    return None


def parse_cart_remove(msg_norm: str) -> Optional[Dict[str, Any]]:
    # Ưu tiên index trước: "xóa 2", "xóa số 2"
    m = re.search(
        r'^(?:xoa|bo|remove)\s+(?:san pham\s+)?(?:so\s*)?(\d+)$',
        msg_norm, re.IGNORECASE
    )
    if m:
        idx = int(m.group(1))
        if 1 <= idx <= 20:
            return {'action': 'cart_remove_by_index', 'index': idx}

    # Nếu không có index, thử tìm tên sản phẩm: "xóa gấu bông"
    m = re.search(
        r'^(?:xoa|bo|remove)\s+(.+?)(?:\s+khoi gio|\s+ra khoi gio|\s+trong gio)?$',
        msg_norm, re.IGNORECASE
    )
    if m:
        product_name = m.group(1).strip()
        parts = product_name.split()
        if len(parts) > 2:
            unique = []
            for w in parts:
                if w not in unique:
                    unique.append(w)
            if len(unique) < len(parts):
                product_name = ' '.join(unique[:2])
            else:
                product_name = ' '.join(parts[:2])
        if product_name and len(product_name) >= 2:
            return {'action': 'cart_remove', 'product_name': product_name}
    return None


def parse_checkout(msg_norm: str, in_checkout_flow: bool = False) -> Optional[Dict[str, Any]]:
    init_patterns = [
        r'^(?:dat hang|thanh toan|checkout|mua hang|dat mua)$',
        r'^(?:toi muon|cho toi)\s+(?:dat hang|thanh toan|checkout)$',
    ]
    for pat in init_patterns:
        if re.search(pat, msg_norm.strip(), re.IGNORECASE):
            return {'action': 'checkout', 'step': 'init'}
    if in_checkout_flow:
        stripped = msg_norm.strip()
        if stripped in CONFIRM_YES:
            return {'action': 'checkout_confirm', 'confirm': True}
        if stripped in CONFIRM_NO:
            return {'action': 'checkout_confirm', 'confirm': False}
    return None


def process_action(
    msg_norm: str,
    in_checkout_flow: bool = False,
    has_last_products: bool = False,
) -> Optional[Dict[str, Any]]:
    chk = parse_checkout(msg_norm, in_checkout_flow=in_checkout_flow)
    if chk:
        return chk

    cart_view = parse_cart_view(msg_norm)
    if cart_view:
        return cart_view

    cart_update = parse_cart_update(msg_norm)
    if cart_update:
        return cart_update

    cart_remove = parse_cart_remove(msg_norm)
    if cart_remove:
        return cart_remove

    if has_last_products:
        view = parse_view_detail(msg_norm)
        if view:
            return view
        add_idx = parse_add_by_index(msg_norm)
        if add_idx:
            return add_idx

    add = parse_add_to_cart(msg_norm)
    if add:
        return add

    return None