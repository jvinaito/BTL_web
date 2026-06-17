document.addEventListener('DOMContentLoaded', function() {
  const chatIcon = document.getElementById('admin-chat-icon');
  const chatBox = document.getElementById('admin-chat-box');
  const closeBtn = document.getElementById('close-admin-chat');
  const sendBtn = document.getElementById('admin-send-btn');
  const input = document.getElementById('admin-chat-input');
  const messagesDiv = document.getElementById('admin-chat-messages');
  const quickRepliesDiv = document.getElementById('admin-quick-replies');

  let voiceEnabled = localStorage.getItem('adminVoiceEnabled') !== 'false';
  let currentAudio = null;

  // ── HÀM CHUYỂN ĐỔI TIỀN TỆ CHO TTS: bỏ dấu chấm và khoảng trắng, thêm "đồng" ──
  function formatCurrencyForTTS(text) {
    const formatted = text.replace(/(\d{1,3}(?:\s*\.\s*\d{3})*)\s*đ/g, function(match, number) {
      const cleanNumber = number.replace(/[.\s]/g, '');
      return cleanNumber + ' đồng';
    });
    console.log('[Admin TTS] Original:', text);
    console.log('[Admin TTS] Formatted:', formatted);
    return formatted;
  }

  function stopSpeaking() {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
  }

  function speakText(text) {
    if (!voiceEnabled || !text.trim()) return;
    stopSpeaking();
    const formattedText = formatCurrencyForTTS(text);
    const url = `/api/tts?text=${encodeURIComponent(formattedText)}&speed=1.15`;
    console.log('[Admin TTS] Final URL:', url);
    const audio = new Audio(url);
    audio.volume = 1.0;
    currentAudio = audio;
    audio.onended = () => { currentAudio = null; };
    audio.onerror = (err) => console.error('[Admin TTS] Error:', err);
    audio.play().catch(e => console.error('[Admin TTS] Play error:', e));
  }

  // Quick reply buttons (removed "duyệt đơn ORD")
  const quickReplies = [
    'doanh thu', 'đơn hàng hôm nay', 'đơn hàng pending', 'đơn hàng complete',
    'top user', 'tồn kho', 'bán chạy'
  ];

  function renderQuickReplies() {
    if (!quickRepliesDiv) return;
    quickRepliesDiv.innerHTML = '';
    quickReplies.forEach(q => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline-secondary rounded-pill admin-quick-reply-btn';
      btn.textContent = q;
      btn.onclick = () => {
        input.value = q;
        input.focus();
        sendMessage();
      };
      quickRepliesDiv.appendChild(btn);
    });
  }
  renderQuickReplies();

  // Voice input (mic) - tự động gửi
  let isListening = false;
  let recognition = null;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      input.value = e.results[0][0].transcript;
      sendMessage();
    };
    recognition.onerror = () => {
      isListening = false;
      updateMicUI();
    };
    recognition.onend = () => {
      isListening = false;
      updateMicUI();
    };
  }

  const micBtn = document.getElementById('admin-mic-btn');
  function updateMicUI() {
    if (micBtn) {
      micBtn.innerHTML = isListening ? '<i class="fa-solid fa-microphone-slash"></i>' : '<i class="fa-solid fa-microphone"></i>';
      micBtn.classList.toggle('listening', isListening);
    }
  }
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (!recognition) {
        addMessage('Trình duyệt không hỗ trợ nhập giọng nói.', false);
        return;
      }
      if (isListening) recognition.stop();
      else recognition.start();
      isListening = !isListening;
      updateMicUI();
    });
  }

  // Voice output toggle button
  const voiceToggleBtn = document.getElementById('admin-voice-toggle');
  function updateVoiceToggleUI() {
    if (voiceToggleBtn) {
      voiceToggleBtn.classList.toggle('off', !voiceEnabled);
      voiceToggleBtn.innerHTML = voiceEnabled ? '<i class="fa-solid fa-volume-up"></i> Âm thanh' : '<i class="fa-solid fa-volume-mute"></i> Âm thanh';
      voiceToggleBtn.title = voiceEnabled ? 'Tắt đọc giọng nói' : 'Bật đọc giọng nói';
    }
  }
  updateVoiceToggleUI();
  if (voiceToggleBtn) {
    voiceToggleBtn.addEventListener('click', () => {
      voiceEnabled = !voiceEnabled;
      localStorage.setItem('adminVoiceEnabled', voiceEnabled);
      updateVoiceToggleUI();
      if (!voiceEnabled) stopSpeaking();
    });
  }

  function addMessage(text, isUser) {
    const row = document.createElement('div');
    row.className = `d-flex ${isUser ? 'justify-content-end' : 'justify-content-start'} mb-2`;
    const bubbleClass = isUser ? 'admin-chat-bubble-user' : 'admin-chat-bubble-bot';
    row.innerHTML = `<div class="${bubbleClass}">${escapeHtml(text)}</div>`;
    messagesDiv.appendChild(row);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Nếu là tin nhắn bot và voice enabled thì đọc
    if (!isUser && voiceEnabled) {
      speakText(text);
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    }).replace(/\n/g, '<br>');
  }

  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg) return;
    addMessage(msg, true);
    input.value = '';
    try {
      const res = await fetch('/admin/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      addMessage(data.reply || 'Không nhận được phản hồi.', false);
    } catch (err) {
      addMessage('Lỗi kết nối, vui lòng thử lại.', false);
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
  chatIcon.addEventListener('click', () => {
    chatBox.style.display = 'flex';
    chatIcon.style.display = 'none';
    input.focus();
  });
  closeBtn.addEventListener('click', () => {
    chatBox.style.display = 'none';
    chatIcon.style.display = 'flex';
  });
});