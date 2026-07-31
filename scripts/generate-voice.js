#!/usr/bin/env node
// ===================================================================
// GENERATE VOICE — build-time narration via the Fish Audio TTS API
//
// Renders every script in voice-scripts.js to assets/audio/<id>.mp3 and
// writes a manifest recording each file's real byte size, so the page can
// tell visitors exactly what pressing play will cost them.
//
// The API key is used HERE and nowhere else. It never reaches the browser,
// never appears in the shipped site, and never runs in CI. What ships is the
// rendered .mp3 files, which the page plays with a plain <audio> element.
//
//     cp .env.example .env                       # paste the key in
//     npm run voice -- --audition id1,id2,id3    # compare candidate voices on real copy
//     npm run voice -- --clone path/to/you.mp3   # clone your voice, then render everything
//     npm run voice                              # re-render only what changed
//     npm run voice -- --force                   # re-render everything
//     npm run voice -- --only hero,about         # re-render specific sections
//     npm run voice -- --dry-run                 # show the plan, spend nothing
//
// Voice cloning. `--clone <file>` uploads a sample of your own voice, creates
// a Fish Audio voice model from it, saves the returned id into .env as
// FISH_AUDIO_VOICE_ID, and then narrates every section in that voice. Do it
// once; after that plain `npm run voice` reuses the id.
//
// Cost control. Scripts are hashed; unchanged text is skipped on re-runs, so
// fixing one sentence re-renders one file rather than the whole page.
// ===================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio');
const MANIFEST = path.join(OUT_DIR, 'voice-manifest.json');

// Everything below is resolved in resolveConfig(), AFTER .env has been read.
// Reading process.env at module scope would silently ignore every setting in
// .env except the key itself, which is a confusing way to lose an afternoon.
let API_URL, MODEL_URL, MODEL, BITRATE, FORMAT, MAX_BYTES;

// VOICE_ID is also reassigned when --clone mints a new voice model mid-run.
let VOICE_ID = '';

// mp3 is the default because it is the one format every browser decodes.
// opus is roughly half the bytes at speech bitrates, which matters on this
// site — but Safari's support is patchy, so it stays opt-in.
const FORMATS = ['mp3', 'wav', 'opus'];

function resolveConfig() {
    const base = (process.env.FISH_AUDIO_API_BASE || 'https://api.fish.audio').replace(/\/+$/, '');
    API_URL = process.env.FISH_AUDIO_API_URL || `${base}/v1/tts`;
    MODEL_URL = process.env.FISH_AUDIO_MODEL_URL || `${base}/model`;
    MODEL = process.env.FISH_AUDIO_MODEL || 's1';
    BITRATE = Number(process.env.FISH_AUDIO_BITRATE || 64);
    VOICE_ID = process.env.FISH_AUDIO_VOICE_ID || '';
    // 500 is the free-plan ceiling, so it is the safe default. Paid plans
    // allow 15000 (lite/plus) or 30000 — raising this renders each section in
    // one call, which is both fewer requests and a seamless result.
    MAX_BYTES = Number(process.env.FISH_AUDIO_MAX_BYTES || 500);
    FORMAT = (process.env.FISH_AUDIO_FORMAT || 'mp3').toLowerCase();
    if (!FORMATS.includes(FORMAT)) {
        console.error(`\n  FISH_AUDIO_FORMAT="${FORMAT}" is not one of ${FORMATS.join(', ')}\n`);
        process.exit(1);
    }
}

// ------------------------------------------------------------------
// .env loading — minimal, no dependency. Only KEY=value lines.
// ------------------------------------------------------------------
function loadDotEnv() {
    const file = path.join(ROOT, '.env');
    if (!fs.existsSync(file)) return;
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) return;
        const value = m[2].replace(/^["']|["']$/g, '');
        if (!process.env[m[1]]) process.env[m[1]] = value;
    });
}

// ------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = f => argv.includes(f);
const flagValue = f => {
    const i = argv.indexOf(f);
    return i > -1 && argv[i + 1] ? argv[i + 1] : null;
};

const FORCE = hasFlag('--force');
const DRY_RUN = hasFlag('--dry-run');
const ONLY = (flagValue('--only') || '').split(',').map(s => s.trim()).filter(Boolean);
const CLONE_FROM = flagValue('--clone');
const CLONE_TITLE = flagValue('--clone-title') || 'Moses Kolleh Sesay — portfolio narration';
const AUDITION = (flagValue('--audition') || '').split(',').map(s => s.trim()).filter(Boolean);
const AUDITION_TEXT = flagValue('--audition-text');

const hash = text => crypto.createHash('sha256')
    .update(`${text}::${MODEL}::${VOICE_ID}::${BITRATE}::${FORMAT}::${MAX_BYTES}`)
    .digest('hex').slice(0, 12);

const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

// Sustainable Web Design model, same constant the footer badge uses, so the
// number quoted next to the play button is derived the same way as the badge.
const GRAMS_PER_MB = 0.36;
const grams = bytes => (bytes / (1024 * 1024)) * GRAMS_PER_MB;

// ------------------------------------------------------------------
// Voice cloning. Uploads a sample and creates a Fish Audio voice model;
// the returned id is what makes every later TTS call speak in that voice.
// Run once — the id is written back to .env so re-runs reuse it.
// ------------------------------------------------------------------
const AUDIO_MIME = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.flac': 'audio/flac',
    '.webm': 'audio/webm', '.aac': 'audio/aac'
};

async function cloneVoice(samplePath, apiKey) {
    const abs = path.resolve(ROOT, samplePath);
    if (!fs.existsSync(abs)) throw new Error(`sample not found: ${abs}`);

    const ext = path.extname(abs).toLowerCase();
    const mime = AUDIO_MIME[ext];
    if (!mime) {
        throw new Error(`unsupported sample format "${ext}" — use one of ${Object.keys(AUDIO_MIME).join(', ')}`);
    }

    const bytes = fs.readFileSync(abs);
    if (bytes.length < 8 * 1024) {
        throw new Error(`sample is only ${(bytes.length / 1024).toFixed(0)} KB — that is almost certainly too short to clone from`);
    }

    const form = new FormData();
    form.append('type', 'tts');
    form.append('title', CLONE_TITLE);
    form.append('train_mode', 'fast');
    form.append('visibility', 'private');
    form.append('voices', new Blob([bytes], { type: mime }), path.basename(abs));

    const res = await fetch(MODEL_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },   // let fetch set the multipart boundary
        body: form
    });

    const raw = await res.text();
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}${raw ? `\n         ${raw.slice(0, 600)}` : ''}`);
    }

    let data;
    try { data = JSON.parse(raw); } catch (e) {
        throw new Error(`could not parse the model response as JSON:\n         ${raw.slice(0, 300)}`);
    }
    const id = data._id || data.id || data.model_id || data.reference_id;
    if (!id) {
        throw new Error(`no model id in the response — got keys: ${Object.keys(data).join(', ')}`);
    }
    return String(id);
}

// Persists the cloned voice id so the next run reuses it instead of paying
// to clone again. .env is gitignored; this never lands in the repo.
function persistVoiceId(id) {
    const file = path.join(ROOT, '.env');
    let lines = [];
    if (fs.existsSync(file)) {
        lines = fs.readFileSync(file, 'utf8').split('\n');
    }
    const idx = lines.findIndex(l => /^\s*FISH_AUDIO_VOICE_ID\s*=/.test(l));
    if (idx > -1) lines[idx] = `FISH_AUDIO_VOICE_ID=${id}`;
    else {
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(`FISH_AUDIO_VOICE_ID=${id}`);
    }
    fs.writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n'));
}

// ------------------------------------------------------------------
// Chunking for the per-call text limit.
//
// Fish Audio caps how much text one TTS call accepts, and the cap depends
// on the plan: 500 UTF-8 bytes on free, 15000 on lite/plus, 30000 on other
// paid tiers. Every script here is longer than 500 bytes, so on a free plan
// an unchunked render fails on all ten sections.
//
// Splitting happens at sentence boundaries — never mid-sentence — so the
// joins in the rendered audio land where a reader would pause anyway.
// Billing is per byte of text, so chunking costs exactly the same as one
// large call; it only costs extra requests.
//
// Raise FISH_AUDIO_MAX_BYTES on a paid plan to render each section in a
// single call and remove the joins entirely.
// ------------------------------------------------------------------
const utf8Len = s => Buffer.byteLength(s, 'utf8');

function chunkText(text, maxBytes) {
    if (utf8Len(text) <= maxBytes) return [text];

    const { splitSentences } = require(path.join(ROOT, 'voice-scripts.js'));
    const out = [];
    let buf = '';

    for (const sentence of splitSentences(text)) {
        const candidate = buf ? `${buf} ${sentence}` : sentence;
        if (utf8Len(candidate) <= maxBytes) { buf = candidate; continue; }
        if (buf) out.push(buf);

        if (utf8Len(sentence) <= maxBytes) { buf = sentence; continue; }

        // A single sentence over the limit still has to go somewhere. Break it
        // on commas and clause dashes before falling back to words, so the cut
        // lands at the most natural pause available.
        buf = '';
        const pieces = sentence.split(/(?<=[,;:—])\s+/);
        for (const piece of pieces) {
            const merged = buf ? `${buf} ${piece}` : piece;
            if (utf8Len(merged) <= maxBytes) { buf = merged; continue; }
            if (buf) out.push(buf);
            if (utf8Len(piece) <= maxBytes) { buf = piece; continue; }
            buf = '';
            for (const word of piece.split(/\s+/)) {
                const w = buf ? `${buf} ${word}` : word;
                if (utf8Len(w) <= maxBytes) buf = w;
                else { if (buf) out.push(buf); buf = word; }
            }
        }
    }
    if (buf) out.push(buf);
    return out.filter(Boolean);
}

// ------------------------------------------------------------------
// One TTS request. Fish Audio returns raw audio bytes on success.
//
// The per-call text limit depends on the plan, and a plan can change under
// you — a trial that expires, an upgrade that lands. Rather than making the
// operator keep FISH_AUDIO_MAX_BYTES in sync by hand, a rejection for
// over-long text is recognised here and handled by re-chunking smaller.
// ------------------------------------------------------------------
function isTooLong(status, detail) {
    if (status !== 400 && status !== 413 && status !== 422) return false;
    return /too\s*long|max(imum)?[\s_-]*(text|length|bytes)|exceed|payload too large|limit/i.test(detail || '');
}

async function synthesise(text, apiKey) {
    const body = {
        text,
        format: FORMAT,
        normalize: true,
        latency: 'normal'
    };
    if (FORMAT === 'mp3') body.mp3_bitrate = BITRATE;
    if (VOICE_ID) body.reference_id = VOICE_ID;

    const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'model': MODEL
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        // Surface the server's own words — the fastest way to spot a renamed
        // field or an exhausted quota.
        let detail = '';
        try { detail = (await res.text()).slice(0, 600); } catch (e) { /* no body */ }
        const err = new Error(`HTTP ${res.status} ${res.statusText}${detail ? `\n         ${detail}` : ''}`);
        // Flagged so the caller can re-chunk smaller and retry instead of
        // failing the whole run over a plan limit it guessed wrong.
        err.tooLong = isTooLong(res.status, detail);
        throw err;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) {
        throw new Error(`response was only ${buf.length} bytes — expected audio, got:\n         ${buf.toString('utf8').slice(0, 300)}`);
    }
    return buf;
}

// ------------------------------------------------------------------
// Joining the rendered chunks back into one file per section.
//
// mp3 and opus are frame streams — concatenating the bytes gives a file
// players decode straight through. wav is not: every part carries its own
// 44-byte RIFF header, so the parts after the first are stripped and the
// header's two length fields are rewritten to cover the whole thing.
// ------------------------------------------------------------------
function concatAudio(parts, format) {
    if (parts.length === 1) return parts[0];
    if (format !== 'wav') return Buffer.concat(parts);

    const HEADER = 44;
    const bodies = parts.map((p, i) => (i === 0 ? p.subarray(HEADER) : p.subarray(HEADER)));
    const body = Buffer.concat(bodies);
    const header = Buffer.from(parts[0].subarray(0, HEADER));
    header.writeUInt32LE(36 + body.length, 4);    // RIFF chunk size
    header.writeUInt32LE(body.length, 40);        // data chunk size
    return Buffer.concat([header, body]);
}

// Renders one script, splitting it if the plan's per-call limit requires it.
//
// If the service rejects a chunk as too long, the limit is halved and the
// script re-rendered from the start. MAX_BYTES stays lowered for the rest of
// the run, so the discovery costs one rejected call, not one per section.
// A rejected request renders nothing, so it bills nothing.
const MIN_CHUNK_BYTES = 200;

async function synthesiseScript(text, apiKey) {
    for (;;) {
        const chunks = chunkText(text, MAX_BYTES);
        const parts = [];
        try {
            for (const chunk of chunks) parts.push(await synthesise(chunk, apiKey));
            return { audio: concatAudio(parts, FORMAT), chunks: chunks.length };
        } catch (err) {
            if (!err.tooLong || MAX_BYTES <= MIN_CHUNK_BYTES) throw err;
            const next = Math.max(MIN_CHUNK_BYTES, Math.floor(MAX_BYTES / 2));
            console.log(`\n         per-call limit is lower than ${MAX_BYTES} bytes — retrying at ${next}`);
            console.log(`         set FISH_AUDIO_MAX_BYTES=${next} to skip this next time`);
            MAX_BYTES = next;
        }
    }
}

// ------------------------------------------------------------------
// Auditioning. Renders the same line in several candidate voices so they
// can be compared on the copy they will actually read, rather than on
// whatever demo sentence a voice library happens to ship.
//
//     npm run voice -- --audition id1,id2,id3
//
// Output goes to .voice-auditions/ (gitignored), never to assets/audio,
// so an audition can never be mistaken for the narration that ships.
// ------------------------------------------------------------------
const AUDITION_DIR = path.join(ROOT, '.voice-auditions');

// The opening of the hero script: first person, a Krio greeting, a proper
// name and a job title. If a voice is going to stumble, it stumbles here.
const DEFAULT_AUDITION_TEXT =
    "Kushe. I'm Moses Kolleh Sesay — a sustainability and climate analyst based in Amsterdam. " +
    "Geologist by training, sustainability analyst by conviction.";

async function runAudition(apiKey) {
    const text = AUDITION_TEXT || DEFAULT_AUDITION_TEXT;
    const bytes = utf8Len(text);

    console.log(`\n  auditioning ${AUDITION.length} voice(s) on ${bytes} bytes each`);
    console.log(`  "${text.slice(0, 72)}${text.length > 72 ? '…' : ''}"`);
    console.log(`  ~${(bytes * AUDITION.length).toLocaleString()} credits total\n`);

    if (DRY_RUN) {
        AUDITION.forEach(id => console.log(`  → ${id}  (would render)`));
        console.log('');
        return 0;
    }

    fs.mkdirSync(AUDITION_DIR, { recursive: true });
    const saved = VOICE_ID;
    let failed = 0;

    for (const id of AUDITION) {
        process.stdout.write(`  → ${id.padEnd(34)} `);
        VOICE_ID = id;                        // synthesise() reads this
        try {
            const { audio } = await synthesiseScript(text, apiKey);
            const out = path.join(AUDITION_DIR, `${id}.${FORMAT}`);
            fs.writeFileSync(out, audio);
            console.log(`${kb(audio.length)}  → ${path.relative(ROOT, out)}`);
        } catch (err) {
            console.log('FAILED');
            console.error(`       ${err.message}\n`);
            failed++;
        }
    }

    VOICE_ID = saved;
    console.log(`\n  listen to ${path.relative(ROOT, AUDITION_DIR)}/ and pick one, then:`);
    console.log('    add FISH_AUDIO_VOICE_ID=<the winner> to .env');
    console.log('    npm run voice\n');
    return failed;
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------
async function main() {
    loadDotEnv();
    resolveConfig();

    const { SCRIPTS } = require(path.join(ROOT, 'voice-scripts.js'));
    const apiKey = process.env.FISH_AUDIO_API_KEY;

    if (!apiKey && !DRY_RUN) {
        console.error('\n  FISH_AUDIO_API_KEY is not set.\n');
        console.error('  cp .env.example .env      # then paste your key into it');
        console.error('  …or: export FISH_AUDIO_API_KEY=your_key_here\n');
        process.exit(1);
    }

    // Auditioning is a side errand: it renders nothing that ships and writes
    // no manifest, so it returns before any of the build logic below.
    if (AUDITION.length) {
        process.exit(await runAudition(apiKey) ? 1 : 0);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });

    // --- clone first, so the render below speaks in the new voice ----------
    if (CLONE_FROM) {
        if (DRY_RUN) {
            console.log(`\n  would clone a voice from ${CLONE_FROM} and save the id to .env\n`);
        } else {
            process.stdout.write(`\n  cloning voice from ${CLONE_FROM} … `);
            try {
                const id = await cloneVoice(CLONE_FROM, apiKey);
                VOICE_ID = id;
                persistVoiceId(id);
                console.log('done');
                console.log(`  voice id ${id} — saved to .env, reused on every later run`);
            } catch (err) {
                console.log('FAILED');
                console.error(`         ${err.message}\n`);
                process.exit(1);
            }
        }
    }

    if (!VOICE_ID && !DRY_RUN) {
        console.log('\n  note: no FISH_AUDIO_VOICE_ID set, so this renders in the API default voice.');
        console.log('  to narrate in your own voice: npm run voice -- --clone path/to/your-sample.mp3');
    }

    let manifest = { voiceId: VOICE_ID, model: MODEL, bitrate: BITRATE, format: FORMAT, tracks: {} };
    if (fs.existsSync(MANIFEST)) {
        try {
            const prev = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
            if (prev && prev.tracks) manifest = prev;
        } catch (e) { /* corrupt manifest — start fresh */ }
    }
    manifest.voiceId = VOICE_ID;
    manifest.model = MODEL;
    manifest.bitrate = BITRATE;
    manifest.format = FORMAT;

    const targets = SCRIPTS.filter(s => !ONLY.length || ONLY.includes(s.id));
    if (ONLY.length) {
        const unknown = ONLY.filter(id => !SCRIPTS.some(s => s.id === id));
        if (unknown.length) {
            console.error(`  unknown section id(s): ${unknown.join(', ')}`);
            console.error(`  available: ${SCRIPTS.map(s => s.id).join(', ')}`);
            process.exit(1);
        }
    }

    console.log(`\n  fish audio · model ${MODEL} · ${FORMAT}${FORMAT === 'mp3' ? ` ${BITRATE} kbps` : ''}${VOICE_ID ? ` · voice ${VOICE_ID}` : ' · DEFAULT VOICE'}`);
    console.log(`  ${targets.length} script(s) considered · max ${MAX_BYTES} bytes per call\n`);

    let rendered = 0;
    let skipped = 0;
    let failed = 0;
    let creditsPlanned = 0;   // 1 credit per UTF-8 byte of text
    let creditsSpent = 0;

    for (const script of targets) {
        const file = path.join(OUT_DIR, `${script.id}.${FORMAT}`);
        const sig = hash(script.text);
        const prev = manifest.tracks[script.id];
        const unchanged = prev && prev.hash === sig && fs.existsSync(file);

        if (unchanged && !FORCE) {
            console.log(`  · ${script.id.padEnd(11)} unchanged — skipped (${kb(prev.bytes)})`);
            skipped++;
            continue;
        }

        const words = script.text.trim().split(/\s+/).length;
        const textBytes = utf8Len(script.text);
        const nChunks = chunkText(script.text, MAX_BYTES).length;
        creditsPlanned += textBytes;

        if (DRY_RUN) {
            const split = nChunks > 1 ? ` in ${nChunks} calls` : '';
            console.log(`  → ${script.id.padEnd(11)} ${words} words · ${textBytes} bytes${split} · ${textBytes} credits`);
            rendered++;
            continue;
        }

        process.stdout.write(`  → ${script.id.padEnd(11)} rendering ${words} words${nChunks > 1 ? ` (${nChunks} calls)` : ''}… `);
        try {
            const { audio, chunks } = await synthesiseScript(script.text, apiKey);
            fs.writeFileSync(file, audio);
            manifest.tracks[script.id] = {
                file: `assets/audio/${script.id}.${FORMAT}`,
                bytes: audio.length,
                grams: Number(grams(audio.length).toFixed(3)),
                chars: script.text.length,
                textBytes,
                chunks,
                // Recomputed rather than reusing the pre-render signature:
                // an adaptive retry may have lowered MAX_BYTES, which is part
                // of the hash, and the stored value must describe how this
                // file was actually produced.
                hash: hash(script.text)
            };
            creditsSpent += textBytes;
            console.log(`${kb(audio.length)}  (${grams(audio.length).toFixed(2)} g)`);
            rendered++;
        } catch (err) {
            console.log('FAILED');
            console.error(`         ${err.message}\n`);
            failed++;
        }
    }

    if (!DRY_RUN) {
        fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    }

    const totalBytes = Object.values(manifest.tracks).reduce((n, t) => n + t.bytes, 0);
    console.log(`\n  rendered ${rendered} · skipped ${skipped}${failed ? ` · failed ${failed}` : ''}`);
    // Fish Audio bills 1 credit per UTF-8 byte of text, so the spend is known
    // before a single call goes out. Worth seeing on a free plan, where the
    // whole page costs most of the monthly allowance.
    if (DRY_RUN && creditsPlanned) {
        console.log(`  would cost ~${creditsPlanned.toLocaleString()} credits (1 per UTF-8 byte of text)`);
    } else if (creditsSpent) {
        console.log(`  cost ~${creditsSpent.toLocaleString()} credits`);
    }
    if (totalBytes) {
        console.log(`  full narration: ${kb(totalBytes)} across ${Object.keys(manifest.tracks).length} tracks (${grams(totalBytes).toFixed(2)} g if someone played all of it)`);
        console.log('  none of it is downloaded until a visitor presses play.');
    }
    if (!DRY_RUN) console.log(`  manifest: ${path.relative(ROOT, MANIFEST)}`);
    console.log('');

    if (failed) process.exit(1);
}

main().catch(err => {
    console.error(`\n  generate-voice failed: ${err.message}\n`);
    process.exit(1);
});
