document.addEventListener('DOMContentLoaded', function () {
  const chatIcon       = document.getElementById('chat-icon');
  const chatBox        = document.getElementById('chat-box');
  const closeChat      = document.getElementById('close-chat');
  const sendBtn        = document.getElementById('send-btn');
  const chatInput      = document.getElementById('chat-input');
  const messagesDiv    = document.getElementById('chat-messages');
  const typingIndicator = document.getElementById('typing-indicator');
  const chatBadge      = document.querySelector('.chat-badge');
  const quickReplies   = document.getElementById('quick-replies');

  let isOpen = false;

  function getTime() {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderProductCard(product) {
    const productId = product._id || product.id;
    const name      = escapeHtml(product.name || 'Sản phẩm');
    const price     = product.salePrice || product.price || '?';
    const imageUrl  = product.imageUrl || '/images/placeholder.png';
    return `
      <div class="product-card bg-white rounded-3 p-2 mb-2 shadow-sm d-flex align-items-center">
        <img src="${imageUrl}" style="width:50px;height:50px;object-fit:cover;" class="rounded-3 me-2"
             onerror="this.src='/images/placeholder.png'">
        <div class="flex-grow-1">
          <div class="fw-bold small">${name}</div>
          <div class="text-success fw-bold">$${price}</div>
        </div>
        <a href="/products/${productId}" target="_blank" class="btn btn-sm btn-info text-white">Xem</a>
      </div>`;
  }

  function addMessage(text, isUser, products = []) {
    if (isUser && quickReplies) quickReplies.remove();

    const row = document.createElement('div');
    row.className = `msg-row ${isUser ? 'user-row' : 'bot-row'}`;

    const formatted = isUser
      ? escapeHtml(text)
      : escapeHtml(text).replace(/\n/g, '<br>');

    row.innerHTML = `
      <div>
        <div class="msg-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}">${formatted}</div>
        <div class="msg-time">${getTime()}</div>
      </div>`;
    messagesDiv.appendChild(row);

    if (!isUser && products && products.length > 0) {
      const productContainer = document.createElement('div');
      productContainer.className = 'products-container mt-2';
      products.forEach(prod => {
        productContainer.innerHTML += renderProductCard(prod);
      });
      messagesDiv.appendChild(productContainer);
    }

    scrollToBottom();
  }

  function showTyping() { typingIndicator.style.display = 'block'; scrollToBottom(); }
  function hideTyping()  { typingIndicator.style.display = 'none'; }

  /* AUTOCOMPLETE */
  let _suggestTimer = null;
  let _currentSuggestions = [];

  const suggestBox = document.createElement('div');
  suggestBox.id = 'chat-suggest-box';
  suggestBox.style.cssText = `
    position: absolute;
    bottom: 100%;
    left: 0; right: 0;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 16px rgba(0,0,0,.1);
    max-height: 180px;
    overflow-y: auto;
    z-index: 10;
    display: none;
  `;
  const footer = document.querySelector('.chat-footer');
  if (footer) {
    footer.style.position = 'relative';
    footer.prepend(suggestBox);
  }

  function showSuggestions(items) {
    _currentSuggestions = items;
    if (!items.length) { suggestBox.style.display = 'none'; return; }
    suggestBox.innerHTML = items.map((s, i) =>
      `<div class="suggest-item" data-idx="${i}" style="
        padding: 8px 14px; font-size:.84rem; cursor:pointer;
        border-bottom: 1px solid #f0f0f0; transition: background .12s;
      ">${escapeHtml(s)}</div>`
    ).join('');
    suggestBox.style.display = 'block';
  }

  function hideSuggestions() {
    suggestBox.style.display = 'none';
    _currentSuggestions = [];
  }

  suggestBox.addEventListener('mouseover', e => {
    const item = e.target.closest('.suggest-item');
    if (item) item.style.background = '#f0fbfe';
  });
  suggestBox.addEventListener('mouseout', e => {
    const item = e.target.closest('.suggest-item');
    if (item) item.style.background = '';
  });
  suggestBox.addEventListener('mousedown', e => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    e.preventDefault();
    const chosen = _currentSuggestions[parseInt(item.dataset.idx)];
    if (chosen) {
      chatInput.value = chosen;
      hideSuggestions();
    }
  });

  let _selectedIdx = -1;
  function _highlightSuggest(idx) {
    const items = suggestBox.querySelectorAll('.suggest-item');
    items.forEach((el, i) => {
      el.style.background = i === idx ? '#e0f7fc' : '';
    });
    _selectedIdx = idx;
  }

  async function fetchSuggestions(q) {
    if (!q || q.length < 1) { hideSuggestions(); return; }
    try {
      const res = await fetch(`/api/chatbot/suggest?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      showSuggestions(data.suggestions || []);
    } catch (_) {}
  }

  chatInput.addEventListener('input', () => {
    const val = chatInput.value.trim();
    _selectedIdx = -1;
    clearTimeout(_suggestTimer);
    if (!val || val.length > 50) { hideSuggestions(); return; }
    _suggestTimer = setTimeout(() => fetchSuggestions(val), 220);
  });

  chatInput.addEventListener('keydown', function (e) {
    const items = suggestBox.querySelectorAll('.suggest-item');
    if (suggestBox.style.display !== 'none' && items.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _highlightSuggest(Math.min(_selectedIdx + 1, items.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        _highlightSuggest(Math.max(_selectedIdx - 1, 0));
        return;
      }
      if (e.key === 'Enter' && _selectedIdx >= 0) {
        e.preventDefault();
        chatInput.value = _currentSuggestions[_selectedIdx];
        hideSuggestions();
        return;
      }
      if (e.key === 'Escape') { hideSuggestions(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.addEventListener('click', function (e) {
    if (!chatBox.contains(e.target)) hideSuggestions();
  });

  async function sendMessage(msg) {
    msg = (msg || chatInput.value).trim();
    if (!msg) return;

    hideSuggestions();
    addMessage(msg, true);
    chatInput.value = '';
    sendBtn.disabled = true;
    showTyping();

    try {
      const res = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      hideTyping();
      if (!res.ok) {
        addMessage(data.error || 'Xin lỗi, có lỗi xảy ra. Vui lòng thử lại!', false, []);
      } else {
        if (data.redirect) {
          window.location.href = data.redirect;
          return;
        }
        // Cập nhật badge nếu thêm giỏ thành công
        if (data.reply && data.reply.startsWith('✅')) {
          const badge = document.querySelector('#cart-count'); // giả sử header có id cart-count
          if (badge) {
            let count = parseInt(badge.textContent || '0');
            badge.textContent = count + 1;
          }
        }
        addMessage(data.reply || 'Xin lỗi, tôi không nhận được phản hồi.', false, data.products || []);
      }
    } catch (err) {
      hideTyping();
      addMessage('Rất tiếc, chatbot đang bận. Vui lòng thử lại sau! 🙏', false, []);
      console.error('[Chatbot]', err);
    } finally {
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.matches('.quick-btn')) {
      sendMessage(e.target.dataset.msg);
    }
  });

  chatIcon.addEventListener('click', function () {
    isOpen = true;
    chatBox.style.display = 'flex';
    chatIcon.style.display = 'none';
    chatInput.focus();
    if (chatBadge) chatBadge.style.display = 'none';
  });

  closeChat.addEventListener('click', function () {
    isOpen = false;
    chatBox.style.display = 'none';
    chatIcon.style.display = 'flex';
    hideSuggestions();
  });

  sendBtn.addEventListener('click', () => sendMessage());
});