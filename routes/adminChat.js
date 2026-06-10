// routes/adminChat.js
const router = require('express').Router();
const { processAdminMessage } = require('../service/adminChat/adminChat');

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.level === 'Admin') {
    return next();
  }
  return res.status(403).json({ error: 'Unauthorized' });
}

router.post('/chat', isAdmin, async (req, res) => {
  const message = (req.body.message || '').trim();
  if (!message) return res.json({ reply: 'Vui lòng nhập câu hỏi.' });
  const reply = await processAdminMessage(message);
  // Nếu có quick replies, có thể trả về thêm, nhưng tạm thời chỉ text
  res.json({ reply });
});

module.exports = router;