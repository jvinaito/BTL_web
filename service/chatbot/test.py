import requests
import json
import time

# Địa chỉ Flask server (có thể sửa nếu chạy ở cổng khác)
BASE_URL = "http://localhost:5001"

def test_chat(message, expected_keywords=None, expect_products=True):
    """
    Gửi tin nhắn đến chatbot và kiểm tra kết quả.
    - message: câu hỏi
    - expected_keywords: danh sách từ khóa mong đợi có trong reply (không phân biệt hoa thường)
    - expect_products: có mong đợi danh sách sản phẩm trả về không
    Trả về (success, message)
    """
    try:
        resp = requests.post(f"{BASE_URL}/chat", json={"message": message}, timeout=10)
        if resp.status_code != 200:
            return False, f"HTTP {resp.status_code}"
        data = resp.json()
        reply = data.get("reply", "")
        products = data.get("products", [])
        has_products = len(products) > 0
        if expect_products and not has_products:
            return False, "Không có sản phẩm trả về (expected products)"
        if expected_keywords:
            for kw in expected_keywords:
                if kw.lower() not in reply.lower():
                    return False, f"Thiếu từ khóa '{kw}' trong reply"
        return True, reply[:100]  # trả về 100 ký tự đầu của reply
    except Exception as e:
        return False, str(e)

def main():
    # Danh sách test: (câu hỏi, từ khóa mong đợi, mong đợi có sản phẩm)
    tests = [
        ("xin chào", ["xin chào"], False),
        ("sản phẩm bán chạy", ["bán chạy"], True),
        ("đồ chơi cho bé 3 tuổi", ["3 tuổi"], True),
        ("bé trai", ["bé trai"], True),
        ("dưới 20 đô", ["dưới"], True),
        ("lego cho bé 5 tuổi", ["lego", "5 tuổi"], True),
        ("xe đua bé trai dưới 30 đô", ["xe đua", "bé trai", "30"], True),
        ("gấu bông melissa & doug", ["gấu bông", "melissa"], True),
        ("hasbro lego", ["hasbro", "lego"], True),
        ("fisher price đồ chơi giáo dục", ["fisher", "giáo dục"], True),
        ("vtech", [], True),           # có thể không có sản phẩm nhưng vẫn pass
        ("thêm lego du hành vũ trụ vào giỏ", ["✅"], False),  # action add_to_cart
        ("đặt hàng", ["xác nhận"], False),                    # action checkout
    ]

    passed = 0
    failed = 0
    print("===== CHATBOT TEST SUITE =====")
    print(f"{'STATUS':<8} | {'CÂU HỎI':<50} | {'KẾT QUẢ'}")
    print("-" * 80)

    for msg, keywords, expect_prod in tests:
        ok, info = test_chat(msg, keywords, expect_prod)
        status = "✅ PASS" if ok else "❌ FAIL"
        if ok:
            passed += 1
        else:
            failed += 1
        # Hiển thị câu hỏi rút gọn
        short_msg = msg[:47] + "..." if len(msg) > 50 else msg
        print(f"{status:<8} | {short_msg:<50} | {info}")

    print("-" * 80)
    print(f"\n📊 KẾT QUẢ: {passed} passed, {failed} failed")
    print(f"🎯 TỶ LỆ THÀNH CÔNG: {passed/(passed+failed)*100:.1f}%" if (passed+failed) else "No tests")

if __name__ == "__main__":
    main()