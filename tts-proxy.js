// tts-proxy.js
const router = require('express').Router();
const https = require('https');
const crypto = require('crypto');

// In-memory cache (tối đa 100 entries)
const cache = new Map();
const CACHE_MAX = 100;

function getCacheKey(text, speed) {
  return crypto.createHash('md5').update(`${text}|${speed}`).digest('hex');
}

function cleanText(text) {
  return text
    .replace(/[🎉✅❌📦🛒🔐❓⚠️📌💡📭🙅]/gu, '')
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180); // giới hạn an toàn, không cắt giữa từ
}

function fetchFromGoogle(text, speed) {
  return new Promise((resolve, reject) => {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&ttsspeed=${speed}&client=tw-ob`;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
        'Accept': '*/*',
        'Accept-Language': 'vi-VN,vi;q=0.9',
      },
      timeout: 8000,
    };

    const req = https.get(url, options, (googleRes) => {
      if (googleRes.statusCode === 429) {
        return reject(Object.assign(new Error('rate_limited'), { code: 429 }));
      }
      if (googleRes.statusCode !== 200) {
        return reject(Object.assign(new Error(`google_${googleRes.statusCode}`), { code: 502 }));
      }
      const chunks = [];
      googleRes.on('data', d => chunks.push(d));
      googleRes.on('end', () => resolve(Buffer.concat(chunks)));
      googleRes.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

router.get('/tts', async (req, res) => {
  const raw = (req.query.text || '').trim();
  if (!raw) return res.status(400).send('Missing text');

  const text = cleanText(raw);
  if (!text) return res.status(400).send('Empty text after cleaning');

  const speed = Math.min(Math.max(parseFloat(req.query.speed) || 1.0, 0.5), 2.0);
  const cacheKey = getCacheKey(text, speed);

  // Trả cache nếu có
  if (cache.has(cacheKey)) {
    const buf = cache.get(cacheKey);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Cache', 'HIT');
    return res.end(buf);
  }

  try {
    const audioBuffer = await fetchFromGoogle(text, speed);

    // Lưu cache, xóa entry cũ nếu đầy
    if (cache.size >= CACHE_MAX) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, audioBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Cache', 'MISS');
    res.end(audioBuffer);

  } catch (err) {
    const status = err.code === 429 ? 429 : (err.code || 502);
    console.error('[TTS] Error:', err.message);
    res.status(status).send(
      err.code === 429 ? 'Rate limited by Google TTS' : 'TTS service error'
    );
  }
});

module.exports = router;