#!/usr/bin/env node
// ===================================================================
// GENERATE VOICE — build-time narration via the Fish Audio TTS API
//
// Renders every script in voice-scripts.js to assets/audio/<id>.mp3 and
// writes a manifest recording each file's real byte size, so the page can
// tell visitors exactly what pressing play will cost them.
//
// This runs on your machine, never in the browser and never in CI-on-PR.
// The API key is read from the environment and is never written to disk:
//
//     export FISH_AUDIO_API_KEY=...        # or put it in .env (gitignored)
//     npm run voice                        # only re-renders changed scripts
//     npm run voice -- --force             # re-render everything
//     npm run voice -- --only hero,about   # re-render specific sections
//     npm run voice -- --dry-run           # show the plan, spend nothing
//
// Voice selection. Set FISH_AUDIO_VOICE_ID to a Fish Audio model id and every
// line is spoken in that voice — including a clone of your own. Without it the
// API's default voice is used, which is fine for a first pass but is not the
// point of this feature.
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

const API_URL = process.env.FISH_AUDIO_API_URL || 'https://api.fish.audio/v1/tts';
const MODEL = process.env.FISH_AUDIO_MODEL || 's1';
const VOICE_ID = process.env.FISH_AUDIO_VOICE_ID || '';
const BITRATE = Number(process.env.FISH_AUDIO_BITRATE || 64);

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

const hash = text => crypto.createHash('sha256')
    .update(`${text}::${MODEL}::${VOICE_ID}::${BITRATE}`)
    .digest('hex').slice(0, 12);

const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

// Sustainable Web Design model, same constant the footer badge uses, so the
// number quoted next to the play button is derived the same way as the badge.
const GRAMS_PER_MB = 0.36;
const grams = bytes => (bytes / (1024 * 1024)) * GRAMS_PER_MB;

// ------------------------------------------------------------------
// One TTS request. Fish Audio returns raw audio bytes on success.
// ------------------------------------------------------------------
async function synthesise(text, apiKey) {
    const body = {
        text,
        format: 'mp3',
        mp3_bitrate: BITRATE,
        normalize: true,
        latency: 'normal'
    };
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

    const { SCRIPTS } = require(path.join(ROOT, 'voice-scripts.js'));
    const apiKey = process.env.FISH_AUDIO_API_KEY;

    if (!apiKey && !DRY_RUN) {
        console.error('\n  FISH_AUDIO_API_KEY is not set.\n');
        console.error('  export FISH_AUDIO_API_KEY=your_key_here');
        console.error('  …or create a .env file (it is gitignored):');
        console.error('  echo "FISH_AUDIO_API_KEY=your_key_here" > .env\n');
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });

    let manifest = { voiceId: VOICE_ID, model: MODEL, bitrate: BITRATE, tracks: {} };
    if (fs.existsSync(MANIFEST)) {
        try {
            const prev = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
            if (prev && prev.tracks) manifest = prev;
        } catch (e) { /* corrupt manifest — start fresh */ }
    }
    manifest.voiceId = VOICE_ID;
    manifest.model = MODEL;
    manifest.bitrate = BITRATE;

    const targets = SCRIPTS.filter(s => !ONLY.length || ONLY.includes(s.id));
    if (ONLY.length) {
        const unknown = ONLY.filter(id => !SCRIPTS.some(s => s.id === id));
        if (unknown.length) {
            console.error(`  unknown section id(s): ${unknown.join(', ')}`);
            console.error(`  available: ${SCRIPTS.map(s => s.id).join(', ')}`);
            process.exit(1);
        }
    }

    console.log(`\n  fish audio · model ${MODEL} · ${BITRATE} kbps${VOICE_ID ? ` · voice ${VOICE_ID}` : ' · DEFAULT VOICE (set FISH_AUDIO_VOICE_ID)'}`);
    console.log(`  ${targets.length} script(s) considered\n`);

    let rendered = 0;
    let skipped = 0;
    let failed = 0;

    for (const script of targets) {
        const file = path.join(OUT_DIR, `${script.id}.mp3`);
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
                file: `assets/audio/${script.id}.mp3`,
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
