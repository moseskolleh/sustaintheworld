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
//
// The chunk map is empty now. The ten stock-voice section tracks it
// described were retired (see scripts/generate-voice.js for why), and an
// empty or missing map is a normal state: the script says so and exits
// cleanly, writing nothing. When it does assemble, it merges into the
// existing manifest, so Moses's recorded introduction (tracks.intro) is
// never dropped by a section run.
// ===================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// The one definition of a track signature and of the grams-per-MB constant,
// shared with generate-voice.js. Before this module existed the two scripts
// hashed different field lists, so `npm run voice` treated every assembled
// track as stale — a ~7,700-credit re-render of audio that already existed.
const sign = require('./lib/voice-signature.js');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'audio');
const MANIFEST = path.join(OUT_DIR, 'voice-manifest.json');
const CHUNKS = path.join(__dirname, 'voice-chunks.json');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const grams = sign.grams;
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

// --from-disk rewrites the manifest from the .mp3 files already committed in
// assets/audio, downloading and re-encoding nothing. It exists for the case
// where the audio is correct but the manifest needs to be restated — a
// signature-formula change, say. Re-running the full assembly for that would
// mean re-fetching ten tracks to produce byte-identical output.
const FROM_DISK = process.argv.slice(2).includes('--from-disk');

async function main() {
    const plan = fs.existsSync(CHUNKS) ? JSON.parse(fs.readFileSync(CHUNKS, 'utf8')) : {};
    if (!Array.isArray(plan.sections) || !plan.sections.length) {
        console.log(`\n  nothing to assemble: ${path.relative(ROOT, CHUNKS)} lists no sections. No files were changed.\n`);
        return;
    }
    const { SCRIPTS } = require(path.join(ROOT, 'voice-scripts.js'));
    const byId = Object.fromEntries(SCRIPTS.map(s => [s.id, s]));

    // ffmpeg re-encodes every chunk to mp3 at the plan's bitrate, so that —
    // not whatever the chunks arrived as — is the format the signature has to
    // describe. Both scripts go through the same module, so a later
    // `npm run voice` with matching settings sees these tracks as current.
    const config = sign.normaliseConfig({
        model: plan.model,
        voiceId: plan.voiceId,
        bitrate: plan.bitrate,
        format: 'mp3'
    });
    const hash = text => sign.signature(text, config);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-chunks-'));

    // Whatever else the manifest holds — the $comment, Moses's introduction —
    // is kept. Only the section-render header and section tracks are restated.
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) || {}; } catch (e) { /* none yet */ }
    const kept = Object.fromEntries(Object.entries(previous.tracks || {}).filter(([id]) => id === 'intro'));

    const manifest = {
        ...previous,
        voiceId: config.voiceId,
        model: config.model,
        bitrate: config.bitrate,
        format: config.format,
        // Provenance, not staleness input. maxBytes is the per-call text cap
        // these chunks were rendered under; the signature deliberately
        // excludes it (see scripts/lib/voice-signature.js).
        maxBytes: plan.maxBytes || 500,
        signatureVersion: sign.SIGNATURE_VERSION,
        // Who is actually reading, recorded as provenance so a synthesised
        // narrator is never mistaken for a person. (The site's player plays
        // no section tracks; it reads sections with the browser voice.)
        voiceTitle: plan.voiceTitle || '',
        voiceKind: plan.voiceKind || 'synthetic',
        voiceProvider: plan.voiceProvider || 'Fish Audio',
        renderedOn: plan.renderedOn || '',
        tracks: { ...kept }
    };
    let failed = 0;

    for (const section of plan.sections) {
        const script = byId[section.id];
        if (!script) {
            console.error(`  ✗ ${section.id}: not present in voice-scripts.js`);
            failed++;
            continue;
        }
        process.stdout.write(`  → ${section.id.padEnd(11)} ${FROM_DISK ? 'from disk' : `${section.urls.length} chunk(s)`}… `);
        try {
            const out = path.join(OUT_DIR, `${section.id}.mp3`);
            if (FROM_DISK) {
                if (!fs.existsSync(out)) throw new Error(`${path.relative(ROOT, out)} is not on disk — run without --from-disk`);
            } else {
                const files = [];
                for (let i = 0; i < section.urls.length; i++) {
                    const f = path.join(tmp, `${section.id}-${i}.mp3`);
                    await download(section.urls[i], f);
                    files.push(f);
                }
                concat(files, out, config.bitrate);
            }
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
    const sections = Object.keys(manifest.tracks).filter(id => id !== 'intro');
    const totalBytes = sections.reduce((n, id) => n + manifest.tracks[id].bytes, 0);
    console.log(`\n  section narration: ${kb(totalBytes)} across ${sections.length} tracks (${grams(totalBytes).toFixed(2)} g if someone played all of it)`);
    console.log(`  manifest: ${path.relative(ROOT, MANIFEST)}\n`);
}

main().catch(err => {
    console.error(`\n  assemble-voice failed: ${err.message}\n`);
    process.exit(1);
});
