#!/usr/bin/env node
// ===================================================================
// VOICE INTRO — install Moses's own recorded introduction
//
//     npm run voice:intro -- path/to/take.mp3
//     npm run voice:intro -- path/to/take.mp3 --seconds 78
//
// The site plays one recording: Moses Kolleh Sesay introducing himself, in
// his own voice, read from the `intro` script in content/narration.json. This
// copies his take to assets/audio/intro.mp3, measures what it weighs and how
// long it runs, and writes the manifest entry the player reads. Until that
// entry exists the page offers no recording at all, so nothing 404s.
//
// It is his own voice, recorded by him, so no voice model, no API key and no
// third party's consent is involved — and nothing is sent anywhere.
//
// Duration, in order of preference:
//   --seconds N         what you say it is (you listened to it)
//   ffprobe             if it is on PATH
//   the MP3 itself      frame headers summed, no dependency
// If none of those works, it stops and asks for --seconds.
// ===================================================================

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sign = require('./lib/voice-signature.js');

const ROOT = path.join(__dirname, '..');

// ------------------------------------------------------------------
// MP3 duration from the frame headers.
//
// Every MPEG audio frame starts with an 11-bit sync word and a header that
// gives its bitrate, sample rate and padding — enough to know both its
// length in bytes and the number of samples it carries. Walking the frames
// and summing samples / sample-rate gives the duration of constant- and
// variable-bitrate files alike. An ID3v2 tag at the front is skipped; bytes
// that are not a frame (an ID3v1 tag at the end, junk) are stepped over.
// ------------------------------------------------------------------
const BITRATES = {
    '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
};
// Indexed by the header's two version bits: 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5.
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function parseFrameHeader(buf, i) {
    if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
    const versionBits = (buf[i + 1] >> 3) & 0x03;   // 1 is reserved
    const layerBits = (buf[i + 1] >> 1) & 0x03;     // 0 is reserved
    const bitrateIndex = (buf[i + 2] >> 4) & 0x0f;
    const rateIndex = (buf[i + 2] >> 2) & 0x03;
    const padding = (buf[i + 2] >> 1) & 0x01;
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;

    const mpeg1 = versionBits === 3;
    const layer = 4 - layerBits;                    // 3 → Layer I, 1 → Layer III
    const kbps = BITRATES[`${mpeg1 ? 1 : 2}-${layer}`][bitrateIndex];
    const sampleRate = SAMPLE_RATES[versionBits][rateIndex];
    const samples = layer === 1 ? 384 : (layer === 3 && !mpeg1 ? 576 : 1152);
    const length = layer === 1
        ? (Math.floor((12 * kbps * 1000) / sampleRate) + padding) * 4
        : Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
    return length > 4 ? { length, samples, sampleRate, kbps } : null;
}

/** Seconds of audio in an MP3 buffer, or null if it does not look like one. */
function mp3Duration(buf) {
    let i = 0;
    // ID3v2: "ID3", version, flags, then a 28-bit "synchsafe" size.
    if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
        const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
        i = 10 + size + ((buf[5] & 0x10) ? 10 : 0);
    }
    let seconds = 0;
    let frames = 0;
    while (i < buf.length - 4) {
        const frame = parseFrameHeader(buf, i);
        if (!frame) { i++; continue; }
        seconds += frame.samples / frame.sampleRate;
        frames++;
        i += frame.length;
    }
    // A handful of accidental sync words in a non-MP3 file is not audio.
    return frames >= 20 ? seconds : null;
}

/** Duration from ffprobe, or null when it is not installed or cannot tell. */
function ffprobeDuration(file) {
    const run = spawnSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', file
    ], { encoding: 'utf8' });
    if (run.error || run.status !== 0) return null;
    const s = parseFloat(run.stdout);
    return Number.isFinite(s) && s > 0 ? s : null;
}

// ------------------------------------------------------------------
// Install
// ------------------------------------------------------------------
const kb = bytes => `${(bytes / 1024).toFixed(0)} KB`;

/**
 * Copies `source` into `<root>/assets/audio/intro.mp3` and writes its entry
 * into `<root>/assets/audio/voice-manifest.json`, keeping everything else
 * the manifest holds. `root` is the repository unless a test says otherwise;
 * the script and the name always come from this repository's content/.
 * Returns the entry. Throws with a message meant for the person running it.
 */
function install({ source, seconds, root = ROOT, ffprobe = true } = {}) {
    if (!source) throw new Error('which recording? usage: npm run voice:intro -- path/to/take.mp3 [--seconds N]');
    const abs = path.resolve(source);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) throw new Error(`no recording at ${abs}`);

    const audio = fs.readFileSync(abs);
    const looksMp3 = audio.toString('latin1', 0, 3) === 'ID3' || !!parseFrameHeader(audio, 0);
    if (path.extname(abs).toLowerCase() !== '.mp3' || !looksMp3) {
        throw new Error(
            'the site plays MP3, the one format every browser decodes. Convert the take first, e.g.\n' +
            `         ffmpeg -i "${path.basename(abs)}" -ac 1 -b:a 64k intro.mp3`);
    }

    // The same ceiling `npm test` enforces, checked here so a take that would
    // fail the build is caught before it is committed.
    const { BUDGETS } = require('./check-budget.js');
    const ceiling = BUDGETS.introAudio.max;
    if (audio.length > ceiling) {
        throw new Error(
            `the recording is ${kb(audio.length)}; the budget for it is ${kb(ceiling)}. ` +
            'Mono at 64 kbps is plenty for a voice (90 s is about 720 KB):\n' +
            `         ffmpeg -i "${path.basename(abs)}" -ac 1 -b:a 64k intro.mp3`);
    }

    let duration = Number(seconds) > 0 ? Number(seconds) : null;
    let measuredBy = duration ? 'as given with --seconds' : null;
    if (!duration && ffprobe) {
        duration = ffprobeDuration(abs);
        if (duration) measuredBy = 'ffprobe';
    }
    if (!duration) {
        duration = mp3Duration(audio);
        if (duration) measuredBy = 'the MP3 frame headers';
    }
    if (!duration) throw new Error('could not tell how long the recording is — pass it: --seconds 78');

    const { intro } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'narration.json'), 'utf8'));
    const { person } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'profile.json'), 'utf8'));
    if (!intro || !intro.text) throw new Error('content/narration.json has no `intro` script to caption the recording with');

    const outDir = path.join(root, 'assets', 'audio');
    const outFile = path.join(outDir, 'intro.mp3');
    fs.mkdirSync(outDir, { recursive: true });
    if (path.resolve(outFile) !== abs) fs.copyFileSync(abs, outFile);

    const manifestFile = path.join(outDir, 'voice-manifest.json');
    let manifest = { tracks: {} };
    if (fs.existsSync(manifestFile)) {
        manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        manifest.tracks = manifest.tracks || {};
    }
    const entry = {
        file: 'assets/audio/intro.mp3',
        bytes: audio.length,
        grams: Number(sign.grams(audio.length).toFixed(3)),
        seconds: Math.round(duration * 10) / 10,
        // What the page checks before offering it: a recording of a person,
        // named — never synthesised speech presented as him.
        voiceKind: 'recorded',
        voiceTitle: person.name,
        // The words the captions show. If the script changes after the take,
        // tests/voice.test.js says so rather than captioning words he never said.
        scriptHash: sign.textSignature(intro.text)
    };
    manifest.tracks.intro = entry;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');

    return { entry, measuredBy, words: intro.text.trim().split(/\s+/).length };
}

// ------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------
if (require.main === module) {
    const argv = process.argv.slice(2);
    const at = argv.indexOf('--seconds');
    const seconds = at > -1 ? argv[at + 1] : null;
    const source = argv.find((a, i) => !a.startsWith('--') && (at === -1 || i !== at + 1));

    try {
        const { entry, measuredBy, words } = install({ source, seconds });
        console.log(`\n  installed assets/audio/intro.mp3 — ${kb(entry.bytes)}, ${entry.seconds} s (${measuredBy}), ≈${entry.grams.toFixed(2)} g transfer per play`);
        if (entry.seconds < 60 || entry.seconds > 90) {
            console.log(`  note: the plan asks for 60–90 s; this take is ${entry.seconds} s. It works either way.`);
        }
        console.log(`  captions: the ${words}-word intro script in content/narration.json.`);
        console.log('  If you changed any words while recording, edit that script to match what you said,');
        console.log('  then run this again, so the captions are what a listener actually hears.');
        console.log('\n  next: npm test, then commit assets/audio/intro.mp3 and assets/audio/voice-manifest.json\n');
    } catch (err) {
        console.error(`\n  voice:intro: ${err.message}\n`);
        process.exit(1);
    }
}

module.exports = { install, mp3Duration, parseFrameHeader, ffprobeDuration };
