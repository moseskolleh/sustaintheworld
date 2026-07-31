#!/usr/bin/env node
// ===================================================================
// ASSEMBLE VOICE — stitch pre-rendered Fish Audio chunks into tracks
//
// Companion to generate-voice.js for the case where the narration was
// rendered through the Fish Audio MCP connection instead of a local API
// key. The free API caps one call at 500 bytes of text, so each section
// of voice-scripts.js was spoken in sentence-boundary chunks; this
// script downloads those chunks (URLs in scripts/voice-chunks.json),
// concatenates them with ffmpeg into one assets/audio/<id>.mp3 per
// section, and writes the same voice-manifest.json that
// generate-voice.js would have written — same fields, same hash
// formula — so the two generators are interchangeable and `npm run
// voice` correctly skips sections whose text has not changed.
//
// Runs in CI (GitHub's runners have ffmpeg preinstalled and open
// egress; the Claude sandbox that rendered the chunks cannot reach the
// audio CDN itself). Locally:  node scripts/assemble-voice.js
// ===================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio');
const MANIFEST = path.join(OUT_DIR, 'voice-manifest.json');
const CHUNKS = path.join(__dirname, 'voice-chunks.json');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

// Sustainable Web Design model — same constant as generate-voice.js and
// the footer badge, so every quoted weight is derived the same way.
const GRAMS_PER_MB = 0.36;
const grams = bytes => (bytes / (1024 * 1024)) * GRAMS_PER_MB;
const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

async function download(url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1024) {
        throw new Error(`chunk was only ${buf.length} bytes — expected audio: ${url}`);
    }
    fs.writeFileSync(dest, buf);
    return buf.length;
}

function concat(chunkFiles, outFile, bitrate) {
    // The concat demuxer needs a list file; re-encoding to CBR at the
    // repo's standard bitrate gives one clean stream with an accurate
    // duration header instead of stacked per-chunk headers.
    const list = `${outFile}.txt`;
    fs.writeFileSync(list, chunkFiles.map(f => `file '${f}'`).join('\n') + '\n');
    const args = [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'concat', '-safe', '0', '-i', list,
        '-codec:a', 'libmp3lame', '-b:a', `${bitrate}k`,
        outFile
    ];
    const run = spawnSync(FFMPEG, args, { encoding: 'utf8' });
    fs.unlinkSync(list);
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`ffmpeg exited ${run.status}: ${run.stderr}`);
}

async function main() {
    const plan = JSON.parse(fs.readFileSync(CHUNKS, 'utf8'));
    const { SCRIPTS } = require(path.join(ROOT, 'voice-scripts.js'));
    const byId = Object.fromEntries(SCRIPTS.map(s => [s.id, s]));

    // Same signature formula as generate-voice.js, so a later run of
    // `npm run voice` with matching env vars sees these tracks as current.
    const hash = text => crypto.createHash('sha256')
        .update(`${text}::${plan.model}::${plan.voiceId}::${plan.bitrate}`)
        .digest('hex').slice(0, 12);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-chunks-'));

    const manifest = { voiceId: plan.voiceId, model: plan.model, bitrate: plan.bitrate, tracks: {} };
    let failed = 0;

    for (const section of plan.sections) {
        const script = byId[section.id];
        if (!script) {
            console.error(`  ✗ ${section.id}: not present in voice-scripts.js`);
            failed++;
            continue;
        }
        process.stdout.write(`  → ${section.id.padEnd(11)} ${section.urls.length} chunk(s)… `);
        try {
            const files = [];
            for (let i = 0; i < section.urls.length; i++) {
                const f = path.join(tmp, `${section.id}-${i}.mp3`);
                await download(section.urls[i], f);
                files.push(f);
            }
            const out = path.join(OUT_DIR, `${section.id}.mp3`);
            concat(files, out, plan.bitrate);
            const bytes = fs.statSync(out).size;
            manifest.tracks[section.id] = {
                file: `assets/audio/${section.id}.mp3`,
                bytes,
                grams: Number(grams(bytes).toFixed(3)),
                chars: script.text.length,
                hash: hash(script.text)
            };
            console.log(`${kb(bytes)}  (${grams(bytes).toFixed(2)} g)`);
        } catch (err) {
            console.log('FAILED');
            console.error(`         ${err.message}`);
            failed++;
        }
    }

    fs.rmSync(tmp, { recursive: true, force: true });

    if (failed) {
        console.error(`\n  ${failed} section(s) failed — manifest not written.\n`);
        process.exit(1);
    }

    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
    const totalBytes = Object.values(manifest.tracks).reduce((n, t) => n + t.bytes, 0);
    console.log(`\n  full narration: ${kb(totalBytes)} across ${Object.keys(manifest.tracks).length} tracks (${grams(totalBytes).toFixed(2)} g if someone played all of it)`);
    console.log(`  manifest: ${path.relative(ROOT, MANIFEST)}\n`);
}

main().catch(err => {
    console.error(`\n  assemble-voice failed: ${err.message}\n`);
    process.exit(1);
});
