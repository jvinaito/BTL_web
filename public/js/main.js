// Xử lý thêm vào giỏ hàng bằng AJAX (nếu muốn không reload)
document.querySelectorAll('.add-to-cart').forEach(btn => {
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    const productId = this.dataset.id;
    const qty = this.dataset.qty || 1;
    fetch('/orders/cart/add/' + productId, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: qty })
    }).then(res => {
      if (res.ok) {
        alert('Added to cart');
        // Có thể cập nhật số lượng giỏ hàng ở header
      }
    });
  });
});

// Xử lý toggle password
document.querySelectorAll('.toggle-password').forEach(icon => {
  icon.addEventListener('click', function() {
    const input = this.closest('.input-group').querySelector('input');
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    this.classList.toggle('fa-eye-slash');
    this.classList.toggle('fa-eye');
  });
});
// Hàm hiển thị toast
function showAddToCartToast(productName) {
  const toastEl = document.getElementById('cartToast');
  const toastBody = toastEl.querySelector('.toast-body');
  toastBody.textContent = `✅ Đã thêm "${productName}" vào giỏ hàng!`;
  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}

// Hàm cập nhật số lượng trên icon giỏ
async function updateCartCount() {
  const res = await fetch('/orders/cart/count');
  const data = await res.json();
  const cartCountSpan = document.getElementById('cart-count');
  if (cartCountSpan) {
    cartCountSpan.textContent = data.count;
    if (data.count > 0) cartCountSpan.classList.remove('d-none');
    else cartCountSpan.classList.add('d-none');
  }
}

// Gắn sự kiện cho tất cả nút "Add to Cart"
document.querySelectorAll('.add-to-cart').forEach(btn => {
  btn.addEventListener('click', async function(e) {
    e.preventDefault();
    const productId = this.dataset.id;
    // Lấy tên sản phẩm từ thẻ cha (card)
    const productName = this.closest('.card')?.querySelector('.card-title, .fw-bold')?.innerText || 'sản phẩm';
    const response = await fetch(`/orders/cart/add/${productId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      showAddToCartToast(productName);
      await updateCartCount(); // cập nhật số lượng trên giỏ
    } else {
      alert('Có lỗi xảy ra, vui lòng thử lại.');
    }
  });
});