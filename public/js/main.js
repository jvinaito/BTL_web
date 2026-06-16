// main.js

// ===== TOGGLE PASSWORD =====
document.querySelectorAll('.toggle-password').forEach(icon => {
    icon.addEventListener('click', function () {
        const input = this.closest('.input-group').querySelector('input');
        const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
        input.setAttribute('type', type);
        this.classList.toggle('fa-eye-slash');
        this.classList.toggle('fa-eye');
    });
});

// ===== CART BADGE UPDATE WITH BUMP =====
window.updateCartCount = async function () {
    try {
        const res = await fetch('/orders/cart/count');
        const data = await res.json();
        const badge = document.getElementById('cart-count');
        if (badge) {
            badge.textContent = data.count;
            if (data.count > 0) {
                badge.classList.remove('d-none');
                badge.classList.remove('bump');
                void badge.offsetWidth; // force reflow
                badge.classList.add('bump');
            } else {
                badge.classList.add('d-none');
            }
        }
    } catch (err) {
        console.error('Update cart count error:', err);
    }
};

// ===== GET PRODUCT NAME (hỗ trợ cả trang detail) =====
function getProductName(btn) {
    // 1. Tìm trong card (trang chủ, shop, ...)
    const card = btn.closest('.card');
    if (card) {
        const titleEl = card.querySelector('.card-title, .fw-bold, .product-name');
        if (titleEl) return titleEl.innerText.trim();
    }
    // 2. Trang detail: tìm <h2> trong cùng container
    const container = btn.closest('.container');
    if (container) {
        const h2 = container.querySelector('h2.fw-bold');
        if (h2) return h2.innerText.trim();
    }
    // 3. Fallback
    return 'sản phẩm';
}

// ===== ADD TO CART =====
document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const productId = btn.dataset.id;
        const quantity = parseInt(btn.dataset.qty) || 1;
        const productName = getProductName(btn);

        try {
            const response = await fetch(`/orders/cart/add/${productId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity: quantity })
            });
            if (response.ok) {
                if (window.showToast) {
                    window.showToast(`✅ Đã thêm ${quantity} ${productName} vào giỏ hàng!`, 'success');
                } else {
                    alert(`✅ Đã thêm ${quantity} ${productName} vào giỏ hàng!`);
                }
                await window.updateCartCount();
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

// ===== NAVBAR SCROLL =====
window.addEventListener('scroll', function () {
    const nav = document.querySelector('.navbar');
    if (nav) {
        nav.classList.toggle('navbar-scrolled', window.scrollY > 50);
    }
});

// ===== HERO PARALLAX =====
window.addEventListener('scroll', function () {
    const heroImg = document.querySelector('.hero-image');
    if (heroImg) {
        heroImg.style.transform = `translateY(${window.pageYOffset * 0.05}px)`;
    }
});

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function () {
    window.updateCartCount();
});