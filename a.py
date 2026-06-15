#!/usr/bin/env python3
"""
Script sửa ký hiệu $ → đ còn sót trong các file chatbot.
Chạy từ thư mục gốc dự án: python fix_chatbot_currency.py
"""

import os

REPLACEMENTS = {

    # ── service/adminChat/adminChat.js ──────────────────────────────────────
    "service/adminChat/adminChat.js": [
        # Doanh thu
        (
            'return `💰 Tổng doanh thu hoàn thành: $${stats.totalIncome.toFixed(2)}`;',
            'return `💰 Tổng doanh thu hoàn thành: ${stats.totalIncome.toLocaleString(\'vi-VN\')}đ`;',
        ),
        # Danh sách đơn hàng: - $${o.total} -
        (
            '- $${o.total} - ${o.status}\\n`',
            '- ${Number(o.total).toLocaleString(\'vi-VN\')}đ - ${o.status}\\n`',
        ),
        # Danh sách đơn theo status: - $${o.total}\n
        (
            '- $${o.total}\\n`',
            '- ${Number(o.total).toLocaleString(\'vi-VN\')}đ\\n`',
        ),
        # Chi tiết đơn hàng: - $${order.total} -
        (
            '- $${order.total} - ${order.status}`',
            '- ${Number(order.total).toLocaleString(\'vi-VN\')}đ - ${order.status}`',
        ),
        # Khách hàng nổi bật: - $${u.totalSpent.toFixed(2)}\n
        (
            '- $${u.totalSpent.toFixed(2)}\\n`',
            '- ${u.totalSpent.toLocaleString(\'vi-VN\')}đ\\n`',
        ),
        # Sản phẩm tìm kiếm: - $${p.salePrice}
        (
            '- $${p.salePrice} (tồn:',
            '- ${Number(p.salePrice).toLocaleString(\'vi-VN\')}đ (tồn:',
        ),
    ],

    # ── public/js/chat.js ───────────────────────────────────────────────────
    "public/js/chat.js": [
        # Card sản phẩm trong chatbot
        (
            '<div class="text-success fw-bold">$${price}</div>',
            '<div class="text-success fw-bold">${Number(price).toLocaleString(\'vi-VN\')}đ</div>',
        ),
        # Xác nhận đặt hàng
        (
            'let msg = `📦 Xác nhận đặt hàng với tổng tiền $${total.toFixed(2)}. `',
            'let msg = `📦 Xác nhận đặt hàng với tổng tiền ${total.toLocaleString(\'vi-VN\')}đ. `',
        ),
    ],

    # ── routes/chatbot.js (hoặc routes/orders.js nếu confirm order ở đó) ──
    "routes/chatbot.js": [
        (
            'let msg = `📦 Xác nhận đặt hàng với tổng tiền $${total.toFixed(2)}. `',
            'let msg = `📦 Xác nhận đặt hàng với tổng tiền ${total.toLocaleString(\'vi-VN\')}đ. `',
        ),
    ],

    # ── service/chatbot/intents.json ────────────────────────────────────────
    "service/chatbot/intents.json": [
        (
            '"dưới {price}$"',
            '"dưới {price}đ"',
        ),
    ],

    # ── service/chatbot/normalize.py (regex nhận diện $số) ─────────────────
    "service/chatbot/normalize.py": [
        # Regex chuyển $số → số do — đổi output thành "đ" thay vì "do"
        (
            r"(r'\$(\d+)',               r'\1 do')",
            r"(r'\$(\d+)',               r'\1đ')",
        ),
    ],

    # ── views/admin/add.ejs (label form nhập giá) ───────────────────────────
    "views/admin/add.ejs": [
        (
            '<label class="form-label fw-bold small">Giá gốc ($)</label>',
            '<label class="form-label fw-bold small">Giá gốc (đ)</label>',
        ),
    ],

    # ── views/admin/product.ejs (nếu cũng có label giá gốc $) ──────────────
    "views/admin/product.ejs": [
        (
            '<label class="form-label fw-bold small">Giá gốc ($)</label>',
            '<label class="form-label fw-bold small">Giá gốc (đ)</label>',
        ),
    ],
}


def fix_file(filepath, replacements):
    result = {"file": filepath, "found": [], "not_found": [], "changed": False}

    if not os.path.isfile(filepath):
        result["error"] = "FILE KHÔNG TỒN TẠI"
        return result

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = content
    for old, new in replacements:
        if old == new:
            continue
        if old in new_content:
            new_content = new_content.replace(old, new)
            result["found"].append(old[:70] + ("…" if len(old) > 70 else ""))
        else:
            result["not_found"].append(old[:70] + ("…" if len(old) > 70 else ""))

    if new_content != content:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        result["changed"] = True

    return result


def main():
    print("=" * 60)
    print("  FIX CHATBOT CURRENCY: $ → đ")
    print("=" * 60)
    print(f"  Thư mục làm việc: {os.getcwd()}\n")

    total_changed = 0

    for filepath, replacements in REPLACEMENTS.items():
        result = fix_file(filepath, replacements)

        if "error" in result:
            print(f"⚠️  {filepath}: {result['error']}")
            continue

        status = "✅ ĐÃ SỬA" if result["changed"] else "⏭️  không đổi"
        print(f"{status}  {filepath}")
        for item in result["found"]:
            print(f"      ✔ {item}")
        for item in result["not_found"]:
            print(f"      ✗ (không tìm thấy) {item}")

        if result["changed"]:
            total_changed += 1

    print("\n" + "=" * 60)
    print(f"  Đã sửa: {total_changed} file")
    print("=" * 60)
    print("\n✅ Hoàn tất! Toàn bộ chatbot giờ hiển thị đ thay vì $.\n")


if __name__ == "__main__":
    main()