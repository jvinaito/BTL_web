// main.js - chỉ dùng toast global (window.showToast)
// Không còn bootstrap toast hay alert kiểu cũ

// Toggle hiển thị mật khẩu
document.querySelectorAll('.toggle-password').forEach(icon => {
  icon.addEventListener('click', function() {
    const input = this.closest('.input-group').querySelector('input');
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    this.classList.toggle('fa-eye-slash');
    this.classList.toggle('fa-eye');
  });
});

// Cập nhật số lượng giỏ hàng trên badge
async function updateCartCount() {
  try {
    const res = await fetch('/orders/cart/count');
    const data = await res.json();
    const badge = document.getElementById('cart-count');
    if (badge) {
      badge.textContent = data.count;
      if (data.count > 0) badge.classList.remove('d-none');
      else badge.classList.add('d-none');
    }
  } catch (err) {
    console.error('Update cart count error:', err);
  }
}

// Gắn sự kiện cho tất cả nút "Add to Cart"
document.querySelectorAll('.add-to-cart').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const productId = btn.dataset.id;
    const productName = btn.closest('.card')?.querySelector('.card-title, .fw-bold')?.innerText || 'sản phẩm';

    try {
      const response = await fetch(`/orders/cart/add/${productId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.ok) {
        // Dùng toast toàn cục (từ chat.js) nếu có, nếu không thì fallback alert
        if (window.showToast) {
          window.showToast(`✅ Đã thêm "${productName}" vào giỏ hàng!`, 'success');
        } else {
          alert(`✅ Đã thêm "${productName}" vào giỏ hàng!`);
        }
        await updateCartCount();
      } else {
        const errorMsg = await response.text();
        if (window.showToast) {
          window.showToast(`❌ ${errorMsg || 'Có lỗi xảy ra, vui lòng thử lại.'}`, 'error');
        } else {
          alert('Có lỗi xảy ra, vui lòng thử lại.');
        }
      }
    } catch (err) {
      console.error(err);
      if (window.showToast) {
        window.showToast('Lỗi kết nối, vui lòng thử lại sau.', 'error');
      } else {
        alert('Lỗi kết nối, vui lòng thử lại sau.');
      }
    }
  });
});

// Khởi tạo cập nhật badge khi trang tải
document.addEventListener('DOMContentLoaded', () => {
  updateCartCount();
});