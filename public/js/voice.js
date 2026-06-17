// voice.js - Nhập giọng nói tự động gửi, đọc câu trả lời qua proxy TTS
(function () {
    function init() {
        const chatInput = document.getElementById('chat-input');
        const messagesDiv = document.getElementById('chat-messages');
        const footer = document.querySelector('.chat-footer');
        const sendBtn = document.getElementById('send-btn');
        if (!chatInput || !footer) return;

        const TTS_SPEED = 1.15;
        const TTS_PROXY_URL = '/api/tts';

        let voiceEnabled = localStorage.getItem('chatVoiceEnabled') !== 'false';
        let currentAudio = null;

        // ── HÀM CHUYỂN ĐỔI TIỀN TỆ CHO TTS: bỏ dấu chấm và khoảng trắng, thêm "đồng" ──
        function formatCurrencyForTTS(text) {
            // Match các dạng: 6.100.000đ, 6. 100. 000đ, 6.100.000 đồng, ...
            // Lấy phần số (có thể có khoảng trắng sau dấu chấm) và đuôi "đ" hoặc "đồng"
            const formatted = text.replace(/(\d{1,3}(?:\s*\.\s*\d{3})*)\s*đ/g, function(match, number) {
                // Xóa tất cả dấu chấm và khoảng trắng trong số
                const cleanNumber = number.replace(/[.\s]/g, '');
                return cleanNumber + ' đồng';
            });
            console.log('[TTS] Original:', text);
            console.log('[TTS] Formatted:', formatted);
            return formatted;
        }

        // ── Chia văn bản ──
        function splitText(text, maxLen = 180) {
            const clean = text
                .replace(/[🎉✅❌📦🛒🔐❓⚠️📌💡📭🙅]/gu, '')
                .replace(/\*+/g, '')
                .trim();
            const sentences = clean.replace(/([.!?,，。])\s*/g, '$1|').split('|');
            const chunks = [];
            let current = '';
            for (const s of sentences) {
                if (!s.trim()) continue;
                if ((current + s).length > maxLen) {
                    if (current) chunks.push(current.trim());
                    current = s;
                } else {
                    current += (current ? ' ' : '') + s;
                }
            }
            if (current.trim()) chunks.push(current.trim());
            return chunks.length ? chunks : [clean.substring(0, maxLen)];
        }

        function stopSpeaking() {
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.src = '';
                currentAudio = null;
            }
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        }

        function playChunks(chunks, index = 0) {
            if (!voiceEnabled || index >= chunks.length) return;
            stopSpeaking();

            const textChunk = formatCurrencyForTTS(chunks[index]);
            const url = `${TTS_PROXY_URL}?text=${encodeURIComponent(textChunk)}&speed=${TTS_SPEED}`;
            console.log('[TTS] Final URL:', url);
            const audio = new Audio(url);
            audio.volume = 1.0;
            currentAudio = audio;

            audio.onended = () => playChunks(chunks, index + 1);
            audio.onerror = () => {
                console.error('[TTS] Proxy lỗi đoạn', index);
                // Không fallback
            };
            audio.play().catch((e) => {
                console.error('[TTS] Play error:', e);
            });
        }

        function speakText(text) {
            if (!voiceEnabled || !text.trim()) return;
            stopSpeaking();
            playChunks(splitText(text));
        }

        // Lắng nghe tin nhắn bot
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1 && node.classList?.contains('msg-row') && node.classList.contains('bot-row')) {
                        const bubble = node.querySelector('.msg-bubble');
                        if (voiceEnabled && bubble?.innerText?.trim()) speakText(bubble.innerText);
                    }
                }
            }
        });
        observer.observe(messagesDiv, { childList: true, subtree: false });

        // ── Nhập bằng giọng nói và TỰ ĐỘNG GỬI ──
        let isListening = false;
        let recognition = null;

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SR();
            recognition.lang = 'vi-VN';
            recognition.interimResults = false;
            recognition.continuous = false;
            recognition.onresult = (e) => {
                const text = e.results[0][0].transcript;
                chatInput.value = text;
                setMicIdle();
                if (sendBtn) sendBtn.click();
            };
            recognition.onerror = (e) => { console.error('[Mic]', e.error); setMicIdle(); };
            recognition.onend = setMicIdle;
        }

        function setMicIdle() {
            isListening = false;
            const btn = document.getElementById('voice-input-btn');
            if (btn) {
                btn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Nói</span>';
                btn.style.backgroundColor = '#28a745';
            }
        }

        function toggleVoiceInput() {
            if (!recognition) { if (window.showToast) window.showToast('Trình duyệt không hỗ trợ.', 'error'); return; }
            if (isListening) { recognition.stop(); }
            else {
                recognition.start(); isListening = true;
                const btn = document.getElementById('voice-input-btn');
                if (btn) { btn.innerHTML = '<i class="fa-solid fa-microphone-slash"></i><span>Đang nghe...</span>'; btn.style.backgroundColor = '#dc3545'; }
            }
        }

        // ── Tạo nút UI ──
        const voiceToggleWrapper = document.createElement('div');
        voiceToggleWrapper.style.cssText = 'display:flex;align-items:center;gap:6px;margin-right:6px;';
        const voiceToggleBtn = document.createElement('button');
        voiceToggleBtn.id = 'voice-toggle-btn';
        voiceToggleBtn.type = 'button';
        voiceToggleBtn.style.cssText = `border:none;cursor:pointer;padding:8px 16px;font-size:14px;font-weight:500;
            transition:all .2s ease;display:inline-flex;align-items:center;gap:8px;
            border-radius:40px;color:white;box-shadow:0 1px 3px rgba(0,0,0,0.1);`;
        const voiceIcon = document.createElement('i'); voiceIcon.style.fontSize = '16px';
        const voiceText = document.createElement('span'); voiceText.textContent = 'Âm thanh';
        voiceToggleBtn.appendChild(voiceIcon); voiceToggleBtn.appendChild(voiceText);

        function updateVoiceStyle() {
            voiceToggleBtn.style.backgroundColor = voiceEnabled ? '#007bff' : '#e0e0e0';
            voiceToggleBtn.style.color = voiceEnabled ? 'white' : '#666';
            voiceIcon.className = voiceEnabled ? 'fa-solid fa-volume-up' : 'fa-solid fa-volume-mute';
            voiceToggleBtn.title = voiceEnabled ? 'Tắt đọc giọng nói' : 'Bật đọc giọng nói';
        }
        updateVoiceStyle();
        voiceToggleBtn.addEventListener('click', () => {
            voiceEnabled = !voiceEnabled;
            localStorage.setItem('chatVoiceEnabled', voiceEnabled);
            updateVoiceStyle();
            if (!voiceEnabled) stopSpeaking();
        });
        voiceToggleWrapper.appendChild(voiceToggleBtn);

        const voiceInputWrapper = document.createElement('div');
        voiceInputWrapper.style.cssText = 'display:flex;align-items:center;margin-right:6px;';
        const voiceInputBtn = document.createElement('button');
        voiceInputBtn.id = 'voice-input-btn'; voiceInputBtn.type = 'button';
        voiceInputBtn.style.cssText = `border:none;cursor:pointer;padding:8px 12px;font-size:16px;font-weight:500;
            transition:all .2s ease;display:inline-flex;align-items:center;gap:6px;
            border-radius:40px;background-color:#28a745;color:white;box-shadow:0 1px 3px rgba(0,0,0,0.1);`;
        voiceInputBtn.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Nói</span>';
        voiceInputBtn.title = 'Nhập bằng giọng nói (tự động gửi)';
        voiceInputBtn.addEventListener('click', toggleVoiceInput);
        voiceInputWrapper.appendChild(voiceInputBtn);

        let targetContainer = document.querySelector('#suggest-toggle-btn')?.parentElement;
        if (!targetContainer) {
            const container = document.createElement('div');
            container.style.cssText = 'display:flex;gap:8px;margin-right:8px;';
            targetContainer = container;
            const inputWrapper = chatInput.parentElement;
            footer.insertBefore(container, inputWrapper !== footer ? inputWrapper : chatInput);
        }
        targetContainer.insertBefore(voiceInputWrapper, targetContainer.firstChild);
        targetContainer.insertBefore(voiceToggleWrapper, targetContainer.firstChild);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 300);
})();