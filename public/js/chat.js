document.addEventListener('DOMContentLoaded', function () {
  const chatIcon       = document.getElementById('chat-icon');
  const chatBox        = document.getElementById('chat-box');
  const closeChat      = document.getElementById('close-chat');
  const sendBtn        = document.getElementById('send-btn');
  const chatInput      = document.getElementById('chat-input');
  const messagesDiv    = document.getElementById('chat-messages');
  const typingIndicator = document.getElementById('typing-indicator');
  const chatBadge      = document.querySelector('.chat-badge');

  let isOpen = false;
  let lastProducts = [];

  // ── Toast thông báo ──
  function showToast(message, type = 'success') {
    let container = document.getElementById('global-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'global-toast-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    const bgColor = type === 'success' ? '#00bcd4' : (type === 'error' ? '#dc3545' : '#ffc107');
    toast.style.cssText = `
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      font-size: 14px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideInRight 0.3s ease;
      max-width: 350px;
    `;
    let icon = '';
    if (type === 'success' && !message.startsWith('✅')) icon = '✅ ';
    else if (type === 'error' && !message.startsWith('❌')) icon = '⚠️ ';
    toast.innerHTML = `<span>${icon}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  if (!document.querySelector('#toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  window.showToast = showToast;

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

  // ── Nút Xem thêm ──
  function removeViewMoreBtn() {
    const existing = messagesDiv.querySelector('.view-more-bar');
    if (existing) existing.remove();
  }
  function renderViewMoreBtn() {
    removeViewMoreBtn();
    const bar = document.createElement('div');
    bar.className = 'view-more-bar d-flex justify-content-center px-2 pb-2 mt-1';
    bar.innerHTML = `<button class="btn btn-sm btn-outline-info rounded-pill px-3 view-more-btn" style="font-size:.82rem;">
      📦 Xem thêm sản phẩm
    </button>`;
    messagesDiv.appendChild(bar);
    scrollToBottom();
  }

  // Quick Replies
  function removeQuickReplies() {
    const existing = messagesDiv.querySelector('.quick-replies-bar');
    if (existing) existing.remove();
  }
  function renderQuickReplies(replies) {
    removeQuickReplies();
    if (!replies || !replies.length) return;
    const bar = document.createElement('div');
    bar.className = 'quick-replies-bar d-flex flex-wrap gap-2 px-2 pb-2';
    bar.style.cssText = 'margin-top: 6px;';
    replies.forEach(({ label, value }) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-primary rounded-pill quick-btn';
      btn.textContent = label;
      btn.dataset.msg = value;
      bar.appendChild(btn);
    });
    messagesDiv.appendChild(bar);
    scrollToBottom();
  }

  function addMessage(text, isUser, products = [], quickReplies = [], hasMore = false) {
    if (isUser) { removeQuickReplies(); removeViewMoreBtn(); }
    const row = document.createElement('div');
    row.className = `msg-row ${isUser ? 'user-row' : 'bot-row'}`;
    const formatted = isUser ? escapeHtml(text) : escapeHtml(text).replace(/\n/g, '<br>');
    row.innerHTML = `<div><div class="msg-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}">${formatted}</div><div class="msg-time">${getTime()}</div></div>`;
    messagesDiv.appendChild(row);

    if (!isUser && products && products.length > 0) {
      lastProducts = products;
    }
    if (!isUser && products && products.length > 0) {
      const productContainer = document.createElement('div');
      productContainer.className = 'products-container mt-2';
      products.forEach(prod => { productContainer.innerHTML += renderProductCard(prod); });
      messagesDiv.appendChild(productContainer);
    }
    scrollToBottom();
    if (!isUser && quickReplies && quickReplies.length > 0) renderQuickReplies(quickReplies);
    if (!isUser && hasMore) renderViewMoreBtn();
  }

  function showTyping() { typingIndicator.style.display = 'block'; scrollToBottom(); }
  function hideTyping()  { typingIndicator.style.display = 'none'; }

  // Lệnh rút gọn
  function expandShortcut(msg) {
    if (!lastProducts || lastProducts.length === 0) return msg;
    let match = msg.match(/^thêm\s+(\d+)$/i);
    if (match) {
      const idx = parseInt(match[1]) - 1;
      if (lastProducts[idx]) return `thêm ${lastProducts[idx].name}`;
    }
    match = msg.match(/^thêm\s+(\d+)\s+(?:cái|sản phẩm)\s+(\d+)$/i);
    if (match) {
      const qty = parseInt(match[1]);
      const idx = parseInt(match[2]) - 1;
      if (lastProducts[idx]) return `thêm ${qty} ${lastProducts[idx].name}`;
    }
    if (/^\d+$/.test(msg)) {
      const idx = parseInt(msg) - 1;
      if (lastProducts[idx]) return `xem chi tiết ${lastProducts[idx].name}`;
    }
    return msg;
  }

  // ========== AUTOCOMPLETE VỚI NÚT BẬT/TẮT (TO, MÀU VÀNG KHI BẬT) ==========
  let _suggestEnabled = true;
  let _suggestTimer = null, _currentSuggestions = [];

  // Tạo nút toggle lớn, màu vàng khi bật
  const toggleWrapper = document.createElement('div');
  toggleWrapper.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-right: 6px;';
  const suggestToggleBtn = document.createElement('button');
  suggestToggleBtn.id = 'suggest-toggle-btn';
  suggestToggleBtn.type = 'button';
  suggestToggleBtn.style.cssText = `
    background: none; border: none; cursor: pointer; padding: 8px 16px;
    font-size: 14px; font-weight: 500; transition: all .2s ease;
    display: inline-flex; align-items: center; gap: 8px;
    border-radius: 40px; background-color: #ffc107; color: #222;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  const toggleIcon = document.createElement('i');
  toggleIcon.className = 'fa-solid fa-lightbulb';
  toggleIcon.style.fontSize = '16px';
  const toggleText = document.createElement('span');
  toggleText.textContent = 'Gợi ý';
  suggestToggleBtn.appendChild(toggleIcon);
  suggestToggleBtn.appendChild(toggleText);
  
  function updateToggleStyle() {
    if (_suggestEnabled) {
      suggestToggleBtn.style.backgroundColor = '#ffc107';
      suggestToggleBtn.style.color = '#222';
      toggleIcon.className = 'fa-solid fa-lightbulb';
      suggestToggleBtn.title = 'Tắt gợi ý';
    } else {
      suggestToggleBtn.style.backgroundColor = '#e0e0e0';
      suggestToggleBtn.style.color = '#666';
      toggleIcon.className = 'fa-regular fa-lightbulb';
      suggestToggleBtn.title = 'Bật gợi ý';
    }
  }
  updateToggleStyle();
  suggestToggleBtn.addEventListener('click', () => {
    _suggestEnabled = !_suggestEnabled;
    updateToggleStyle();
    if (!_suggestEnabled) hideSuggestions();
    else if (chatInput.value.trim().length >= 1) fetchSuggestions(chatInput.value.trim());
  });
  toggleWrapper.appendChild(suggestToggleBtn);

  // Chèn vào footer (cạnh ô input)
  const footer = document.querySelector('.chat-footer');
  if (footer) {
    footer.style.position = 'relative';
    const inputWrapper = chatInput.parentElement;
    if (inputWrapper && inputWrapper !== footer) {
      footer.insertBefore(toggleWrapper, inputWrapper);
    } else {
      footer.insertBefore(toggleWrapper, chatInput);
    }
  }

  // Hộp gợi ý
  const suggestBox = document.createElement('div');
  suggestBox.id = 'chat-suggest-box';
  suggestBox.style.cssText = `position:absolute;bottom:100%;left:0;right:0;background:#fff;border:1px solid #e0e0e0;border-radius:12px 12px 0 0;box-shadow:0 -4px 16px rgba(0,0,0,.1);max-height:180px;overflow-y:auto;z-index:10;display:none;`;
  if (footer) footer.prepend(suggestBox);

  function showSuggestions(items) {
    if (!_suggestEnabled) return;
    _currentSuggestions = items;
    if (!items.length) { suggestBox.style.display = 'none'; return; }
    suggestBox.innerHTML = items.map((s,i) => `<div class="suggest-item" data-idx="${i}" style="padding:8px 14px; font-size:.84rem; cursor:pointer; border-bottom:1px solid #f0f0f0;">${escapeHtml(s)}</div>`).join('');
    suggestBox.style.display = 'block';
  }
  function hideSuggestions() { suggestBox.style.display = 'none'; _currentSuggestions = []; }

  // Thay thế từ đang gõ
  function replaceCurrentWord(word) {
    const cursorPos = chatInput.selectionStart;
    const text = chatInput.value;
    let start = cursorPos;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    let end = cursorPos;
    while (end < text.length && /\S/.test(text[end])) end++;
    const newWord = word + ' ';
    const newText = text.slice(0, start) + newWord + text.slice(end);
    chatInput.value = newText;
    const newCursorPos = start + newWord.length;
    chatInput.setSelectionRange(newCursorPos, newCursorPos);
    chatInput.focus();
  }

  suggestBox.addEventListener('mouseover', e => { const item = e.target.closest('.suggest-item'); if (item) item.style.background = '#f0fbfe'; });
  suggestBox.addEventListener('mouseout',  e => { const item = e.target.closest('.suggest-item'); if (item) item.style.background = ''; });
  suggestBox.addEventListener('mousedown', e => {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    e.preventDefault();
    const chosen = _currentSuggestions[parseInt(item.dataset.idx)];
    if (chosen) { replaceCurrentWord(chosen); hideSuggestions(); }
  });

  let _selectedIdx = -1;
  function _highlightSuggest(idx) { const items = suggestBox.querySelectorAll('.suggest-item'); items.forEach((el,i) => { el.style.background = i === idx ? '#e0f7fc' : ''; }); _selectedIdx = idx; }
  async function fetchSuggestions(q) {
    if (!_suggestEnabled || !q || q.length < 1) { hideSuggestions(); return; }
    try { const res = await fetch(`/api/chatbot/suggest?q=${encodeURIComponent(q)}`); if (!res.ok) return; const data = await res.json(); showSuggestions(data.suggestions || []); } catch(_) {}
  }
  chatInput.addEventListener('input', () => {
    const cursorPos = chatInput.selectionStart;
    const textToCursor = chatInput.value.slice(0, cursorPos);
    const wordMatch = textToCursor.match(/(\S+)$/);
    const q = wordMatch ? wordMatch[1] : '';
    _selectedIdx = -1;
    clearTimeout(_suggestTimer);
    if (!q || q.length > 50) { hideSuggestions(); return; }
    _suggestTimer = setTimeout(() => fetchSuggestions(q), 220);
  });
  chatInput.addEventListener('keydown', (e) => {
    const items = suggestBox.querySelectorAll('.suggest-item');
    if (suggestBox.style.display !== 'none' && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); _highlightSuggest(Math.min(_selectedIdx+1, items.length-1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _highlightSuggest(Math.max(_selectedIdx-1, 0)); return; }
      if (e.key === 'Enter' && _selectedIdx >= 0) {
        e.preventDefault();
        replaceCurrentWord(_currentSuggestions[_selectedIdx]);
        hideSuggestions(); return;
      }
      if (e.key === 'Escape') { hideSuggestions(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.addEventListener('click', (e) => { if (!chatBox.contains(e.target)) hideSuggestions(); });

  // Gửi tin nhắn
  async function sendMessage(msg) {
    msg = (msg || chatInput.value).trim();
    if (!msg) return;
    const expanded = expandShortcut(msg);
    if (expanded !== msg) msg = expanded;

    hideSuggestions(); removeQuickReplies(); addMessage(msg, true);
    chatInput.value = ''; sendBtn.disabled = true; showTyping();
    try {
      const res = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      hideTyping();
      if (!res.ok) addMessage(data.error || 'Xin lỗi, có lỗi xảy ra!', false, [], []);
      else {
        if (data.redirect) { window.location.href = data.redirect; return; }
        if (data.reply && data.reply.startsWith('✅')) {
          showToast(data.reply, 'success');
          const badge = document.querySelector('#cart-count');
          if (badge) badge.textContent = parseInt(badge.textContent||'0') + 1;
        }
        if (data.reply && data.reply.includes('🎉')) {
          showToast(data.reply, 'success');
          const badge = document.querySelector('#cart-count');
          if (badge) badge.textContent = '0';
        }
        addMessage(data.reply || 'Không nhận được phản hồi.', false, data.products || [], data.quick_replies || [], !!data.has_more);
      }
    } catch (err) {
      hideTyping();
      addMessage('Rất tiếc, chatbot đang bận. 🙏', false, []);
      showToast('Không thể kết nối chatbot', 'error');
    } finally { sendBtn.disabled = false; chatInput.focus(); }
  }

  document.addEventListener('click', (e) => { if (e.target.matches('.quick-btn')) sendMessage(e.target.dataset.msg); });
  document.addEventListener('click', (e) => { if (e.target.closest('.view-more-btn')) { removeViewMoreBtn(); sendMessage('xem thêm'); } });
  chatIcon.addEventListener('click', () => { isOpen = true; chatBox.style.display = 'flex'; chatIcon.style.display = 'none'; chatInput.focus(); if (chatBadge) chatBadge.style.display = 'none'; });
  closeChat.addEventListener('click', () => { isOpen = false; chatBox.style.display = 'none'; chatIcon.style.display = 'flex'; hideSuggestions(); });
  sendBtn.addEventListener('click', () => sendMessage());
});