// tts-proxy.js
const router = require('express').Router();
const https = require('https');

router.get('/tts', (req, res) => {
    const text = (req.query.text || '').trim().slice(0, 200);
    const speed = parseFloat(req.query.speed) || 1.0;
    if (!text) return res.status(400).send('Missing text');

    // Google Translate TTS (giọng nữ tiếng Việt)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&ttsspeed=${speed}&client=tw-ob`;
    const options = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
        }
    };
    https.get(url, options, (googleRes) => {
        if (googleRes.statusCode !== 200) {
            console.error('[TTS] Google returned', googleRes.statusCode);
            return res.status(502).send('Google TTS error');
        }
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        googleRes.pipe(res);
    }).on('error', (err) => {
        console.error('[TTS] Request error:', err.message);
        res.status(503).send('TTS service unavailable');
    });
});

module.exports = router;