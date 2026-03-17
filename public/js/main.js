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