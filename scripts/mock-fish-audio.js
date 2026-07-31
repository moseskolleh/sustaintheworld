#!/usr/bin/env node
// ===================================================================
// MOCK FISH AUDIO — a local stand-in for api.fish.audio
//
// Speaks the same protocol as the real service so the whole narration
// pipeline (clone → render → manifest → playback in the page) can be
// exercised end to end without a network call and without spending a
// single credit.
//
//     npm run voice:mock                  # terminal 1 — starts on :8199
//     npm run voice:check                 # terminal 2 — clone + render against it
//
// It returns real, decodable WAV whose length scales with the text, so
// byte sizes, gram figures and <audio> durations are all genuine — only
// the voice is fake.
//
// Routes:
//     POST /model    multipart  -> { "_id": "..." }
//     POST /v1/tts   json       -> raw audio bytes
//     GET  /__calls             -> what this server was asked for
// ===================================================================

const http = require('http');

const PORT = Number(process.env.MOCK_FISH_PORT || process.argv[2] || 8199);
const calls = { model: [], tts: [] };

function makeWav(seconds, sampleRate = 22050) {
    const n = Math.max(1, Math.round(seconds * sampleRate));
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
        const t = i / sampleRate;
        const v = Math.round(2500 * Math.sin(2 * Math.PI * (150 + 40 * Math.sin(t * 3)) * t));
        data.writeInt16LE(v, i * 2);
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28);
    h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
};

const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
        const body = Buffer.concat(chunks);

        if (req.url === '/__calls') return json(res, 200, calls);

        if (!/^Bearer .+/.test(req.headers.authorization || '')) {
            return json(res, 401, { error: 'missing bearer token' });
        }

        if (req.method === 'POST' && req.url === '/model') {
            const ct = req.headers['content-type'] || '';
            const ok = ct.startsWith('multipart/form-data') && body.includes('voices') && body.length > 8 * 1024;
            calls.model.push({ contentType: ct, bytes: body.length, ok });
            if (!ok) return json(res, 422, { error: 'expected multipart/form-data with a voices file' });
            return json(res, 200, { _id: 'mockvoice_9f3a21c7', title: 'mock voice', state: 'trained' });
        }

        if (req.method === 'POST' && req.url === '/v1/tts') {
            let payload = {};
            try { payload = JSON.parse(body.toString('utf8')); } catch (e) { /* handled below */ }
            calls.tts.push({
                model: req.headers.model,
                reference_id: payload.reference_id,
                format: payload.format,
                chars: (payload.text || '').length
            });
            if (!payload.text) return json(res, 422, { error: 'text is required' });

            const wav = makeWav(payload.text.length / 14);   // ~14 chars/sec, narration pace
            res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length });
            return res.end(wav);
        }

        json(res, 404, { error: `no route for ${req.method} ${req.url}` });
    });
});

server.listen(PORT, () => {
    console.log(`\n  mock fish audio listening on http://127.0.0.1:${PORT}`);
    console.log('  point the generator at it with:\n');
    console.log(`    FISH_AUDIO_API_BASE=http://127.0.0.1:${PORT} FISH_AUDIO_API_KEY=mock FISH_AUDIO_FORMAT=wav \\`);
    console.log('      node scripts/generate-voice.js --force\n');
});
