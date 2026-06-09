const router = require('express').Router();
const axios  = require('axios');

const CHATBOT_URL = process.env.CHATBOT_URL || 'http://localhost:5001/chat';
const TIMEOUT_MS  = 8000; // 8s timeout

router.post('/message', async (req, res) => {
  const userMessage = (req.body.message || '').trim();

  if (!userMessage) {
    return res.status(400).json({ error: 'Tin nhắn không được để trống.' });
  }

  if (userMessage.length > 500) {
    return res.status(400).json({ error: 'Tin nhắn quá dài (tối đa 500 ký tự).' });
  }

  try {
    const response = await axios.post(
      CHATBOT_URL,
      { message: userMessage },
      { timeout: TIMEOUT_MS }
    );

    const reply = response.data?.reply;
    if (!reply) {
      return res.status(502).json({ error: 'Chatbot trả về phản hồi không hợp lệ.' });
    }

    return res.json({ reply });
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[Chatbot] Timeout:', err.message);
      return res.status(504).json({ error: 'Chatbot phản hồi quá chậm. Vui lòng thử lại.' });
    }
    if (err.response) {
      // Python service returned an error
      console.error('[Chatbot] Service error:', err.response.status, err.response.data);
      return res.status(502).json({ error: 'Lỗi từ chatbot service.' });
    }
    // Network / connection refused
    console.error('[Chatbot] Connection error:', err.message);
    return res.status(503).json({ error: 'Không thể kết nối đến chatbot. Vui lòng thử lại sau.' });
  }
});

module.exports = router;