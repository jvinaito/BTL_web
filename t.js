// test.js – Kiểm tra toàn bộ tính năng chatbot
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const CHATBOT_URL = `${BASE_URL}/api/chatbot/message`;
const SUGGEST_URL = `${BASE_URL}/api/chatbot/suggest`;

// ── Cấu hình ──────────────────────────────────────────────────────────────
const TEST_USER = {
  email: 'test@example.com',
  password: '123456'
};

let sessionCookie = '';

// ── Hàm trợ giúp ──────────────────────────────────────────────────────────
function printResult(testName, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}${details ? ': ' + details : ''}`);
}

async function login() {
  try {
    const res = await axios.post(`${BASE_URL}/auth/login`, TEST_USER, {
      maxRedirects: 0,
      validateStatus: status => status === 302 || status === 200
    });
    // Lấy cookie từ response
    if (res.headers['set-cookie']) {
      sessionCookie = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    }
    return true;
  } catch (err) {
    console.error('❌ Login failed:', err.message);
    return false;
  }
}

async function chat(message, expectedKeywords = [], expectProducts = false) {
  try {
    const res = await axios.post(CHATBOT_URL, { message }, {
      headers: { Cookie: sessionCookie }
    });
    const data = res.data;
    const reply = data.reply || '';
    const products = data.products || [];

    // Kiểm tra từ khóa
    let keywordPassed = true;
    if (expectedKeywords.length > 0) {
      for (const kw of expectedKeywords) {
        if (!reply.includes(kw)) {
          keywordPassed = false;
          break;
        }
      }
    }

    // Kiểm tra sản phẩm
    let productPassed = true;
    if (expectProducts && products.length === 0) {
      productPassed = false;
    }

    return {
      success: keywordPassed && productPassed,
      reply: reply.slice(0, 200),
      products: products.length
    };
  } catch (err) {
    return {
      success: false,
      reply: `Error: ${err.message}`,
      products: 0
    };
  }
}

// ── Test suite ─────────────────────────────────────────────────────────────
async function runTests() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  🧪 CHATBOT TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── 1. Đăng nhập ──
  console.log('📌 1. ĐĂNG NHẬP');
  const loggedIn = await login();
  printResult('Đăng nhập', loggedIn);
  if (!loggedIn) {
    console.log('\n⚠️ Không thể đăng nhập, bỏ qua các test yêu cầu đăng nhập.\n');
  }
  console.log('');

  // ── 2. Xem giỏ hàng ──
  console.log('📌 2. XEM GIỎ HÀNG');
  const cartTests = [
    { msg: 'xem giỏ hàng', keywords: ['Giỏ hàng', 'trống'] },
    { msg: 'giỏ hàng', keywords: ['Giỏ hàng'] },
    { msg: 'cart', keywords: ['Giỏ hàng'] }
  ];
  for (const test of cartTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success);
  }
  console.log('');

  // ── 3. Thêm vào giỏ ──
  console.log('📌 3. THÊM VÀO GIỎ');
  const addTests = [
    { msg: 'thêm 2 gấu bông', keywords: ['✅', 'gấu bông'] },
    { msg: 'thêm Xe tải điều khiển', keywords: ['✅', 'Xe tải'] },
    { msg: 'thêm 3 Robot biến hình', keywords: ['✅', 'Robot'] }
  ];
  for (const test of addTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success);
  }
  console.log('');

  // ── 4. Xóa khỏi giỏ ──
  console.log('📌 4. XÓA KHỎI GIỎ');
  const removeTests = [
    { msg: 'xóa số 1', keywords: ['✅', 'xóa'] },
    { msg: 'xóa gấu bông', keywords: ['✅', 'xóa'] }
  ];
  for (const test of removeTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success);
  }
  console.log('');

  // ── 5. Sửa số lượng ──
  console.log('📌 5. SỬA SỐ LƯỢNG');
  const updateTests = [
    { msg: 'sửa số 1 thành 5', keywords: ['✅', 'cập nhật'] },
    { msg: 'sửa Xe tải thành 3', keywords: ['✅', 'cập nhật'] }
  ];
  for (const test of updateTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success);
  }
  console.log('');

  // ── 6. Lịch sử đơn hàng ──
  console.log('📌 6. LỊCH SỬ ĐƠN HÀNG');
  const historyTests = [
    { msg: 'lịch sử đơn hàng', keywords: ['Lịch sử', 'đơn hàng'] },
    { msg: 'các đơn hàng', keywords: ['Lịch sử', 'đơn hàng'] },
    { msg: 'history', keywords: ['Lịch sử', 'đơn hàng'] }
  ];
  for (const test of historyTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success, result.reply.slice(0, 100));
  }
  console.log('');

  // ── 7. Đơn gần nhất ──
  console.log('📌 7. ĐƠN GẦN NHẤT');
  const latestTests = [
    { msg: 'đơn gần nhất', keywords: ['Đơn hàng gần nhất', 'Mã:'] },
    { msg: 'đơn cuối cùng', keywords: ['Đơn hàng gần nhất', 'Mã:'] },
    { msg: 'đơn gan day', keywords: ['Đơn hàng gần nhất', 'Mã:'] }
  ];
  for (const test of latestTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success, result.reply.slice(0, 80));
  }
  console.log('');

  // ── 8. Xem đơn theo số thứ tự ──
  console.log('📌 8. XEM ĐƠN THEO SỐ THỨ TỰ');
  const detailByIndexTests = [
    { msg: 'xem đơn 1', keywords: ['Chi tiết đơn hàng', 'Mã:'] },
    { msg: 'don 1', keywords: ['Chi tiết đơn hàng', 'Mã:'] }
  ];
  for (const test of detailByIndexTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success, result.reply.slice(0, 80));
  }
  console.log('');

  // ── 9. Tìm đơn theo tên sản phẩm ──
  console.log('📌 9. TÌM ĐƠN THEO TÊN SẢN PHẨM');
  const productTests = [
    { msg: 'đơn gấu bông', keywords: ['Đơn hàng có sản phẩm', 'gấu bông'] },
    { msg: 'tìm đơn xe đua', keywords: ['Đơn hàng có sản phẩm', 'xe đua'] }
  ];
  for (const test of productTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success, result.reply.slice(0, 80));
  }
  console.log('');

  // ── 10. Tìm kiếm sản phẩm ──
  console.log('📌 10. TÌM KIẾM SẢN PHẨM');
  const searchTests = [
    { msg: 'gấu bông', keywords: ['gấu bông'], expectProducts: true },
    { msg: 'đồ chơi cho bé 3 tuổi', keywords: ['3 tuổi'], expectProducts: true },
    { msg: 'đồ chơi bé trai', keywords: ['bé trai'], expectProducts: true },
    { msg: 'dưới 30 đô', keywords: ['dưới'], expectProducts: true }
  ];
  for (const test of searchTests) {
    const result = await chat(test.msg, test.keywords, test.expectProducts);
    printResult(`"${test.msg}"`, result.success, `tìm thấy ${result.products} sản phẩm`);
  }
  console.log('');

  // ── 11. Checkout ──
  console.log('📌 11. CHECKOUT');
  const checkoutResult = await chat('đặt hàng', ['Xác nhận đặt hàng']);
  printResult('"đặt hàng"', checkoutResult.success, checkoutResult.reply.slice(0, 80));
  console.log('');

  // ── 12. Gợi ý tìm kiếm (suggest) ──
  console.log('📌 12. GỢI Ý TÌM KIẾM');
  try {
    const res = await axios.get(SUGGEST_URL, { params: { q: 'gấu' } });
    const suggestions = res.data?.suggestions || [];
    printResult('Gợi ý "gấu"', suggestions.length > 0, `${suggestions.length} gợi ý: ${suggestions.join(', ')}`);
  } catch (err) {
    printResult('Gợi ý "gấu"', false, err.message);
  }
  console.log('');

  // ── 13. Hướng dẫn ──
  console.log('📌 13. HƯỚNG DẪN');
  const helpResult = await chat('hướng dẫn', ['Tôi có thể giúp bạn']);
  printResult('"hướng dẫn"', helpResult.success);
  console.log('');

  // ── 14. FAQ ──
  console.log('📌 14. FAQ');
  const faqTests = [
    { msg: 'chính sách đổi trả', keywords: ['Chính sách đổi trả'] },
    { msg: 'phí vận chuyển', keywords: ['Chính sách giao hàng'] },
    { msg: 'thanh toán', keywords: ['Phương thức thanh toán'] }
  ];
  for (const test of faqTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success);
  }
  console.log('');

  // ── 15. Xem chi tiết sản phẩm ──
  console.log('📌 15. XEM CHI TIẾT SẢN PHẨM (cần tìm kiếm trước)');
  // Tìm kiếm trước
  await chat('gấu bông');
  const detailResult = await chat('1', ['📦', 'Giá:']);
  printResult('"1" (xem chi tiết sp số 1)', detailResult.success, detailResult.reply.slice(0, 80));
  console.log('');

  // ── 16. Lỗi chính tả ──
  console.log('📌 16. LỖI CHÍNH TẢ');
  const typoTests = [
    { msg: 'xem gio hang', keywords: ['Giỏ hàng'] },
    { msg: 'xoá gấu bông', keywords: ['xóa'] }
  ];
  for (const test of typoTests) {
    const result = await chat(test.msg, test.keywords);
    printResult(`"${test.msg}"`, result.success);
  }
  console.log('');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
}

// ── Chạy test ─────────────────────────────────────────────────────────────
runTests().catch(console.error);