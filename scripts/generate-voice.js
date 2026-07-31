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
let API_URL, MODEL_URL, MODEL, BITRATE, FORMAT;

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

const hash = text => crypto.createHash('sha256')
    .update(`${text}::${MODEL}::${VOICE_ID}::${BITRATE}::${FORMAT}`)
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
// One TTS request. Fish Audio returns raw audio bytes on success.
// ------------------------------------------------------------------
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
        throw new Error(`HTTP ${res.status} ${res.statusText}${detail ? `\n         ${detail}` : ''}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) {
        throw new Error(`response was only ${buf.length} bytes — expected audio, got:\n         ${buf.toString('utf8').slice(0, 300)}`);
    }
    return buf;
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
    console.log(`  ${targets.length} script(s) considered\n`);

    let rendered = 0;
    let skipped = 0;
    let failed = 0;

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
        if (DRY_RUN) {
            console.log(`  → ${script.id.padEnd(11)} would render ${words} words / ${script.text.length} chars`);
            rendered++;
            continue;
        }

        process.stdout.write(`  → ${script.id.padEnd(11)} rendering ${words} words… `);
        try {
            const audio = await synthesise(script.text, apiKey);
            fs.writeFileSync(file, audio);
            manifest.tracks[script.id] = {
                file: `assets/audio/${script.id}.${FORMAT}`,
                bytes: audio.length,
                grams: Number(grams(audio.length).toFixed(3)),
                chars: script.text.length,
                hash: sig
            };
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
