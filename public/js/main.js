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
                void badge.offsetWidth;
                badge.classList.add('bump');
            } else {
                badge.classList.add('d-none');
            }
        }
    } catch (err) {
        console.error('Update cart count error:', err);
    }
};

// ===== GET PRODUCT NAME =====
function getProductName(btn) {
    const card = btn.closest('.card');
    if (card) {
        const titleEl = card.querySelector('.card-title, .fw-bold, .product-name');
        if (titleEl) return titleEl.innerText.trim();
    }
    const container = btn.closest('.container');
    if (container) {
        const h2 = container.querySelector('h2.fw-bold');
        if (h2) return h2.innerText.trim();
    }
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

// ===== SO SÁNH SẢN PHẨM =====
let selectedCompare = [];

// Lưu trạng thái toggle và checkbox đã chọn vào localStorage
const COMPARE_MODE_KEY = 'compareMode';
const COMPARE_SELECTED_KEY = 'compareSelected';

function loadCompareState() {
    const mode = localStorage.getItem(COMPARE_MODE_KEY) === 'true';
    const selected = JSON.parse(localStorage.getItem(COMPARE_SELECTED_KEY) || '[]');
    return { mode, selected };
}

function saveCompareState(mode, selected) {
    localStorage.setItem(COMPARE_MODE_KEY, JSON.stringify(mode));
    localStorage.setItem(COMPARE_SELECTED_KEY, JSON.stringify(selected));
}

function updateCompareUI() {
    const { mode, selected } = loadCompareState();
    const checkboxes = document.querySelectorAll('.compare-checkbox');
    const btn = document.getElementById('toggle-compare-btn');
    const text = document.getElementById('toggle-compare-text');

    // Cập nhật nút toggle
    if (btn) {
        btn.classList.toggle('btn-info', mode);
        btn.classList.toggle('btn-outline-info', !mode);
        if (text) text.textContent = mode ? 'Tắt so sánh' : 'So sánh';
    }

    // Ẩn/hiện checkbox và khôi phục trạng thái chọn
    checkboxes.forEach(cb => {
        const wrapper = cb.closest('.compare-checkbox-wrapper');
        if (wrapper) wrapper.style.display = mode ? 'block' : 'none';
        if (mode && selected.includes(cb.value)) {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });

    // Cập nhật thanh so sánh
    updateCompareBar();
}

function toggleCompareMode() {
    const { mode, selected } = loadCompareState();
    const newMode = !mode;
    const newSelected = newMode ? selected : [];
    saveCompareState(newMode, newSelected);
    updateCompareUI();
}

function updateCompareBar() {
    const bar = document.getElementById('compare-bar');
    const count = document.getElementById('compare-count');
    const btn = document.getElementById('compare-btn');
    const checkboxes = document.querySelectorAll('.compare-checkbox:checked');

    selectedCompare = [];
    checkboxes.forEach(cb => selectedCompare.push(cb.value));

    // Lưu selected vào localStorage mỗi khi thay đổi
    const { mode } = loadCompareState();
    if (mode) {
        saveCompareState(mode, selectedCompare);
    }

    if (selectedCompare.length >= 2) {
        bar.style.display = 'block';
        count.textContent = selectedCompare.length;
        btn.disabled = false;
        btn.textContent = `🔄 So sánh (${selectedCompare.length})`;
    } else if (selectedCompare.length > 0) {
        bar.style.display = 'block';
        count.textContent = selectedCompare.length;
        btn.disabled = true;
        btn.textContent = '🔒 Chọn ít nhất 2 sản phẩm';
    } else {
        bar.style.display = 'none';
    }
}

function clearCompare() {
    document.querySelectorAll('.compare-checkbox').forEach(cb => cb.checked = false);
    const { mode } = loadCompareState();
    saveCompareState(mode, []);
    updateCompareBar();
}

function handleCompare() {
    if (selectedCompare.length < 2) return;
    const url = `/products/compare?ids=${selectedCompare.join(',')}`;
    window.location.href = url;
}

// Lắng nghe sự kiện thay đổi checkbox
document.addEventListener('change', function(e) {
    if (e.target.classList.contains('compare-checkbox')) {
        const checked = document.querySelectorAll('.compare-checkbox:checked');
        if (checked.length > 4) {
            e.target.checked = false;
            alert('Chỉ được chọn tối đa 4 sản phẩm để so sánh');
            return;
        }
        // Cập nhật selected trong localStorage
        const { mode } = loadCompareState();
        const selected = [];
        document.querySelectorAll('.compare-checkbox:checked').forEach(cb => selected.push(cb.value));
        saveCompareState(mode, selected);
        updateCompareBar();
    }
});

// Gán sự kiện cho nút toggle và nút so sánh
document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('toggle-compare-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleCompareMode);
    }
    const compareBtn = document.getElementById('compare-btn');
    if (compareBtn) {
        compareBtn.addEventListener('click', handleCompare);
    }
    // Khôi phục trạng thái
    updateCompareUI();
    // Cập nhật badge giỏ hàng
    window.updateCartCount();
});