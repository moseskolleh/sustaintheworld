// Regression tests for the narration pipeline.
//
// What ships now: the browser voice reads the sections (0 bytes), and the
// one recording the site plays is Moses's own introduction, installed by
// scripts/voice-intro.js. Until he records it the manifest lists no tracks.
// These tests hold that in place:
//
//   - the Fish Audio generator renders section tracks only when asked with
//     --sections, so no copy edit can plan a render or spend a credit, and
//     nothing here fails because section tracks are absent;
//   - the chunk assembler does nothing, cleanly, with an empty chunk map —
//     the workflow that runs it must not fail or commit junk;
//   - the introduction, once recorded, is described truthfully: its real
//     weight and length, a recording of the named person, and captions from
//     the exact script he read;
//   - the one shared signature formula (scripts/lib/voice-signature.js)
//     still behaves, for anyone who opts back in to rendering sections.
//
// Run with: node tests/voice.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sign = require('../scripts/lib/voice-signature.js');
const intro = require('../scripts/voice-intro.js');
const { BUDGETS } = require('../scripts/check-budget.js');
const { SCRIPTS, INTRO } = require('../voice-scripts.js');
const profile = require('../content/profile.json');

const MANIFEST_PATH = path.join(ROOT, 'assets', 'audio', 'voice-manifest.json');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// --- The signature module itself ------------------------------------------
{
    const base = { model: 's1', voiceId: 'abc', bitrate: 64, format: 'mp3' };

    assert(
        sign.signature('hello', base) === sign.signature('hello', base),
        'Signature: the same text and config always hash the same'
    );
    assert(
        sign.signature('hello', base) !== sign.signature('hello there', base),
        'Signature: changed text changes the hash'
    );

    // The four fields that genuinely change the audio must all invalidate.
    [
        ['model', 's2'],
        ['voiceId', 'different'],
        ['bitrate', 128],
        ['format', 'opus']
    ].forEach(([field, value]) => {
        const changed = Object.assign({}, base, { [field]: value });
        assert(
            sign.signature('hello', base) !== sign.signature('hello', changed),
            `Signature: changing ${field} invalidates the track`
        );
    });

    // …and the one that does not must not. This is the plan-upgrade case:
    // raising FISH_AUDIO_MAX_BYTES from 500 to 15000 renders the same words
    // in the same voice, and must not bill for ten re-renders.
    const withMax = Object.assign({}, base, { maxBytes: 15000 });
    assert(
        sign.signature('hello', base) === sign.signature('hello', withMax),
        'Signature: the per-call text cap is not part of staleness'
    );

    // Env vars arrive as strings, a JSON plan as numbers. Both callers must
    // land on the same hash or the whole exercise is pointless.
    const asStrings = { model: 's1', voiceId: 'abc', bitrate: '64', format: 'MP3' };
    assert(
        sign.signature('hello', base) === sign.signature('hello', asStrings),
        'Signature: string and number config forms normalise to one hash'
    );

    const drift = sign.configDrift({ model: 's1', voiceId: 'abc', bitrate: 64, format: 'mp3' }, base);
    assert(drift.length === 0, 'Drift: an identical config reports no drift');
    const drifted = sign.configDrift({ model: 's1', voiceId: '', bitrate: 64, format: 'mp3' }, base);
    assert(
        drifted.length === 1 && drifted[0].field === 'voiceId',
        'Drift: a changed voice id is reported by name'
    );

    assert(
        sign.textSignature('Kushe.') === sign.textSignature('Kushe.') &&
        sign.textSignature('Kushe.') !== sign.textSignature('Kushe!'),
        'Signature: a script\'s words alone identify the recording read from them'
    );
}

// --- Neither generator may grow its own copy of the formula ----------------
// The original bug was two hand-rolled hashes that looked equivalent. Any
// direct crypto use back in these files is that bug returning.
{
    ['generate-voice.js', 'assemble-voice.js', 'voice-intro.js'].forEach((name) => {
        const src = fs.readFileSync(path.join(ROOT, 'scripts', name), 'utf8');
        assert(
            !/createHash/.test(src),
            `Shared: scripts/${name} hashes only through lib/voice-signature.js`
        );
        assert(
            /require\(['"]\.\/lib\/voice-signature\.js['"]\)/.test(src),
            `Shared: scripts/${name} imports the shared signature module`
        );
    });
}

// --- The stock voice is retired, and stays retired -------------------------
{
    const retired = ['hero', 'journey', 'about', 'experience', 'projects', 'ecoprompt', 'skills', 'education', 'notes', 'contact']
        .filter(id => fs.existsSync(path.join(ROOT, 'assets', 'audio', `${id}.mp3`)));
    assert(retired.length === 0, `Retired: no stock-voice section track ships (${retired.join(', ') || 'none'})`);

    // Nothing the visitor can reach may present a synthetic voice as the
    // narrator, or name the retired one.
    const shipped = ['modules/dispatch.js', 'modules/terminal.js', 'script.js', 'index.html', 'voice-scripts.js']
        .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    assert(!/Spiritual African Narrator/i.test(shipped), 'Retired: the stock voice is not named anywhere the page ships');
    assert(!/synthetic voice/i.test(shipped.replace(/\/\/.*$/gm, '')), 'Retired: no shipped label calls the narration a synthetic voice');
}

// --- The committed manifest --------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
{
    assert(!!manifest && typeof manifest.tracks === 'object', 'Manifest: exists and has a tracks object (the page fetches it; it must not 404)');

    const sections = Object.keys(manifest.tracks).filter(id => id !== 'intro');
    assert(
        sections.length === 0,
        `Manifest: lists no section tracks — the page reads sections with the browser voice (listed: ${sections.join(', ') || 'none'})`
    );

    const t = manifest.tracks.intro;
    if (!t) {
        console.log('SKIP: Moses has not recorded his introduction yet — the page offers no recording');
    } else {
        const file = path.join(ROOT, t.file || '');
        assert(t.file === 'assets/audio/intro.mp3' && fs.existsSync(file), `Intro: the recording is on disk at assets/audio/intro.mp3 (${t.file})`);
        assert(fs.existsSync(file) && fs.statSync(file).size === t.bytes, 'Intro: the quoted weight matches the file');
        assert(Math.abs(t.grams - Number(sign.grams(t.bytes).toFixed(3))) <= 0.0005, 'Intro: the quoted grams follow the Sustainable Web Design model');
        assert(typeof t.seconds === 'number' && t.seconds > 0, `Intro: records how long it runs (${t.seconds} s)`);
        assert(t.voiceKind === 'recorded', `Intro: is a recording, not synthesised speech (voiceKind ${t.voiceKind})`);
        assert(t.voiceTitle === profile.person.name, `Intro: names who is speaking (${t.voiceTitle})`);
        assert(
            !!INTRO && t.scriptHash === sign.textSignature(INTRO.text),
            'Intro: the captions are the script it was recorded from — re-run npm run voice:intro after editing the intro script'
        );
        assert(t.bytes <= BUDGETS.introAudio.max, `Intro: within the audio budget (${Math.round(t.bytes / 1024)} KB of ${BUDGETS.introAudio.max / 1024} KB)`);
    }
}

// --- The generator: opt-in, and free until then ------------------------------
// The one that actually costs money. It runs the real generator exactly as
// `npm run voice` would, with no key, and asserts it plans to spend nothing.
const runGenerator = (args) => execFileSync(
    process.execPath,
    [path.join(ROOT, 'scripts', 'generate-voice.js')].concat(args),
    { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { FISH_AUDIO_API_KEY: '' }) }
);
{
    const before = fs.readFileSync(MANIFEST_PATH, 'utf8');

    const plain = runGenerator([]);
    assert(/rendered 0 · spent 0/.test(plain), 'Generator: plain `npm run voice` renders nothing and spends nothing');
    assert(/--sections/.test(plain), 'Generator: …and says how to opt in');

    const dry = runGenerator(['--dry-run']);
    assert(/rendered 0 · spent 0/.test(dry) && !/would cost/.test(dry), 'Generator: a dry run without --sections plans no render');

    // The opt-in works, and its bill is knowable before anything is sent:
    // one credit per UTF-8 byte of every section script.
    const bytes = SCRIPTS.reduce((n, s) => n + Buffer.byteLength(s.text, 'utf8'), 0);
    const opted = runGenerator(['--sections', '--dry-run']);
    assert(
        new RegExp(`rendered ${SCRIPTS.length} · skipped 0`).test(opted),
        `Generator: --sections --dry-run plans every section (got: ${(opted.match(/rendered \d+ · skipped \d+/) || ['no summary'])[0]})`
    );
    assert(
        opted.includes(`would cost ~${bytes.toLocaleString()} credits`),
        `Generator: …and prices it at one credit per byte (~${bytes.toLocaleString()})`
    );

    assert(fs.readFileSync(MANIFEST_PATH, 'utf8') === before, 'Generator: none of these runs touched the manifest');
}

// --- The assembler, and the workflow that runs it ----------------------------
{
    const before = fs.readFileSync(MANIFEST_PATH, 'utf8');
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'assemble-voice.js')], { cwd: ROOT, encoding: 'utf8' });
    assert(/nothing to assemble/.test(out), 'Assembler: an empty chunk map is a clean no-op, not a crash');
    assert(fs.readFileSync(MANIFEST_PATH, 'utf8') === before, 'Assembler: …and writes nothing');

    const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'assemble-voice.yml'), 'utf8');
    assert(!/^\s*push:/m.test(wf), 'Workflow: assembling narration never runs on a push — manual only');
    assert(/check-budget\.js/.test(wf), 'Workflow: whatever it assembles must pass the audio budget before it is committed');

    // The assembler keeps Moses's introduction when it restates the manifest.
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'assemble-voice.js'), 'utf8');
    assert(/id === 'intro'/.test(src), 'Assembler: a section run keeps tracks.intro');
}

// --- voice:intro — installing the recording ----------------------------------
// A synthetic MP3: silent MPEG-1 Layer III frames, mono, 64 kbps, 44.1 kHz.
// 208 bytes and 1152 samples each, so 2,871 frames run 75.0 s.
function silentMp3(frames, id3) {
    const frame = Buffer.alloc(208);
    frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x50; frame[3] = 0xc4;
    const body = Buffer.concat(Array.from({ length: frames }, () => frame));
    if (!id3) return body;
    const tag = Buffer.alloc(10 + 100);
    tag.write('ID3', 0, 'latin1'); tag[3] = 4; tag[9] = 100;   // 100-byte tag body
    return Buffer.concat([tag, body, Buffer.from('TAG'.padEnd(128, ' '), 'latin1')]);
}
{
    const expected = (2871 * 1152) / 44100;
    const plain = intro.mp3Duration(silentMp3(2871, false));
    const tagged = intro.mp3Duration(silentMp3(2871, true));
    assert(plain !== null && Math.abs(plain - expected) < 0.01, `voice:intro: frame headers give the duration (${plain && plain.toFixed(2)} s of ${expected.toFixed(2)})`);
    assert(tagged !== null && Math.abs(tagged - expected) < 0.01, 'voice:intro: an ID3v2 tag in front and an ID3v1 tag behind are stepped over');
    assert(intro.mp3Duration(Buffer.from('RIFF....WAVEfmt this is not an mp3 at all'.repeat(40))) === null, 'voice:intro: a file that is not MP3 has no duration');

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-intro-'));
    try {
        const take = path.join(tmp, 'take.mp3');
        fs.writeFileSync(take, silentMp3(2871, true));
        fs.mkdirSync(path.join(tmp, 'assets', 'audio'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'assets', 'audio', 'voice-manifest.json'), JSON.stringify({ $comment: ['kept'], tracks: {} }));

        const { entry, measuredBy } = intro.install({ source: take, root: tmp, ffprobe: false });
        const written = JSON.parse(fs.readFileSync(path.join(tmp, 'assets', 'audio', 'voice-manifest.json'), 'utf8'));
        const copied = path.join(tmp, 'assets', 'audio', 'intro.mp3');

        assert(fs.existsSync(copied) && fs.statSync(copied).size === fs.statSync(take).size, 'voice:intro: copies the take to assets/audio/intro.mp3');
        assert(entry.bytes === fs.statSync(take).size, 'voice:intro: measures the bytes');
        assert(Math.abs(entry.seconds - 75) < 0.1 && /frame headers/.test(measuredBy), `voice:intro: without ffprobe, reads the length from the MP3 (${entry.seconds} s, ${measuredBy})`);
        assert(entry.voiceKind === 'recorded' && entry.voiceTitle === profile.person.name, 'voice:intro: marks it a recording of Moses Kolleh Sesay');
        assert(entry.scriptHash === sign.textSignature(INTRO.text), 'voice:intro: records which script the captions come from');
        assert(written.tracks.intro && written.$comment && written.$comment[0] === 'kept', 'voice:intro: writes the entry and keeps the rest of the manifest');

        const given = intro.install({ source: take, root: tmp, ffprobe: false, seconds: '81.5' });
        assert(given.entry.seconds === 81.5, 'voice:intro: --seconds wins when given');

        const wav = path.join(tmp, 'take.wav');
        fs.writeFileSync(wav, Buffer.alloc(4096));
        let refused = null;
        try { intro.install({ source: wav, root: tmp, ffprobe: false }); } catch (e) { refused = e; }
        assert(!!refused && /ffmpeg/.test(refused.message), 'voice:intro: refuses a non-MP3 and says how to convert it');

        const heavy = path.join(tmp, 'heavy.mp3');
        fs.writeFileSync(heavy, silentMp3(Math.ceil((BUDGETS.introAudio.max + 1024) / 208), false));
        refused = null;
        try { intro.install({ source: heavy, root: tmp, ffprobe: false }); } catch (e) { refused = e; }
        assert(!!refused && /budget/.test(refused.message), 'voice:intro: refuses a take over the audio budget before it can be committed');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

// --- The script Moses reads --------------------------------------------------
{
    assert(!!INTRO, 'Intro script: voice-scripts.js carries it, for the captions');
    if (INTRO) {
        const words = INTRO.text.trim().split(/\s+/).length;
        assert(/^Kushe\b/.test(INTRO.text), 'Intro script: opens with "Kushe"');
        assert(words >= 150 && words <= 220, `Intro script: ${words} words — one 60–90 s take`);
        assert(/^I'm Moses Kolleh Sesay\b/.test(INTRO.text.replace(/^Kushe\.\s*/, '')), 'Intro script: first person, and says who is speaking');
        assert(!SCRIPTS.some(s => s.id === 'intro'), 'Intro script: not one of the sections the browser voice reads');
    }
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
