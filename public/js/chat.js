document.addEventListener('DOMContentLoaded', function () {
  const chatIcon      = document.getElementById('chat-icon');
  const chatBox       = document.getElementById('chat-box');
  const closeChat     = document.getElementById('close-chat');
  const sendBtn       = document.getElementById('send-btn');
  const chatInput     = document.getElementById('chat-input');
  const messagesDiv   = document.getElementById('chat-messages');
  const typingIndicator = document.getElementById('typing-indicator');
  const chatBadge     = document.querySelector('.chat-badge');
  const quickReplies  = document.getElementById('quick-replies');

  let isOpen = false;

  /* ── Helpers ── */
  function getTime() {
    return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  function scrollToBottom() {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  /* ── Render message ── */
  function addMessage(text, isUser) {
    // Remove quick-replies once user starts chatting
    if (isUser && quickReplies) quickReplies.remove();

    const row = document.createElement('div');
    row.className = `msg-row ${isUser ? 'user-row' : 'bot-row'}`;

    // Convert newlines to <br> for bot messages
    const formatted = isUser
      ? escapeHtml(text)
      : escapeHtml(text).replace(/\n/g, '<br>');

    row.innerHTML = `
      <div>
        <div class="msg-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}">${formatted}</div>
        <div class="msg-time">${getTime()}</div>
      </div>`;

    messagesDiv.appendChild(row);
    scrollToBottom();
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Typing indicator ── */
  function showTyping() {
    typingIndicator.style.display = 'block';
    scrollToBottom();
  }
  function hideTyping() {
    typingIndicator.style.display = 'none';
  }

  /* ── Send message ── */
  async function sendMessage(msg) {
    msg = (msg || chatInput.value).trim();
    if (!msg) return;

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

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      hideTyping();
      addMessage(data.reply || 'Xin lỗi, tôi không nhận được phản hồi.', false);
    } catch (err) {
      hideTyping();
      addMessage('Rất tiếc, chatbot đang bận. Vui lòng thử lại sau! 🙏', false);
      console.error('[Chatbot]', err);
    } finally {
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  /* ── Quick reply buttons ── */
  document.addEventListener('click', function (e) {
    if (e.target.matches('.quick-btn')) {
      sendMessage(e.target.dataset.msg);
    }
  });

  /* ── Open / Close ── */
  chatIcon.addEventListener('click', function () {
    isOpen = true;
    chatBox.style.display = 'flex';
    chatIcon.style.display = 'none';
    chatInput.focus();
    // Hide badge
    if (chatBadge) chatBadge.style.display = 'none';
  });

  closeChat.addEventListener('click', function () {
    isOpen = false;
    chatBox.style.display = 'none';
    chatIcon.style.display = 'flex';
  });

  /* ── Send triggers ── */
  sendBtn.addEventListener('click', () => sendMessage());
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});