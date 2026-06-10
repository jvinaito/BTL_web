const router = require('express').Router();
const axios = require('axios');

const CHATBOT_URL = process.env.CHATBOT_URL || 'http://localhost:5001/chat';
const SUGGEST_URL = process.env.CHATBOT_URL
  ? process.env.CHATBOT_URL.replace('/chat', '/suggest')
  : 'http://localhost:5001/suggest';
const TIMEOUT_MS = 8000;

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
    const products = response.data?.products || [];
    if (!reply) {
      return res.status(502).json({ error: 'Chatbot trả về phản hồi không hợp lệ.' });
    }
    return res.json({ reply, products });
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[Chatbot] Timeout:', err.message);
      return res.status(504).json({ error: 'Chatbot phản hồi quá chậm. Vui lòng thử lại.' });
    }
    if (err.response) {
      console.error('[Chatbot] Service error:', err.response.status, err.response.data);
      return res.status(502).json({ error: 'Lỗi từ chatbot service.' });
    }
    console.error('[Chatbot] Connection error:', err.message);
    return res.status(503).json({ error: 'Không thể kết nối đến chatbot. Vui lòng thử lại sau.' });
  }
});

/* ── Autocomplete suggestions ── */
router.get('/suggest', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 1) return res.json({ suggestions: [] });

  try {
    const response = await axios.get(SUGGEST_URL, {
      params: { q },
      timeout: 3000,
    });
    return res.json({ suggestions: response.data?.suggestions || [] });
  } catch (err) {
    // Suggest lỗi không critical — trả về rỗng, không báo lỗi cho user
    return res.json({ suggestions: [] });
  }
});

module.exports = router;