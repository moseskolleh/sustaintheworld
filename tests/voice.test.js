// Regression tests for the narration pipeline.
//
// The bug these exist to prevent: scripts/assemble-voice.js and
// scripts/generate-voice.js each computed their own track signature over a
// different list of fields. Nothing failed loudly — the assembled narration
// played fine — but `npm run voice` considered all ten committed tracks
// stale, and a dry run offered to re-render the whole page for roughly 7,700
// Fish Audio credits. The fix is one shared module; these tests prove the
// two scripts actually agree, rather than trusting that they still do.
//
// Run with: node tests/voice.test.js

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const sign = require('../scripts/lib/voice-signature.js');
const { SCRIPTS } = require('../voice-scripts.js');

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
}

// --- Neither script may grow its own copy of the formula -------------------
// The original bug was two hand-rolled hashes that looked equivalent. Any
// direct crypto use back in those files is that bug returning.
{
    ['generate-voice.js', 'assemble-voice.js'].forEach((name) => {
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

// --- The committed manifest must describe the committed audio --------------
const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : null;

if (!manifest) {
    console.log('SKIP: no narration manifest committed — nothing to verify');
} else {
    const config = sign.manifestConfig(manifest);

    assert(!!manifest.format, 'Manifest: records the audio format it was rendered in');
    assert(
        manifest.signatureVersion === sign.SIGNATURE_VERSION,
        `Manifest: signature version matches the module (${manifest.signatureVersion} vs ${sign.SIGNATURE_VERSION})`
    );

    // Narration identity: the page must be able to say who is reading without
    // guessing. A synthetic voice presented as a person is the credibility
    // problem this field exists to close.
    assert(
        typeof manifest.voiceTitle === 'string' && manifest.voiceTitle.length > 0,
        'Manifest: names the voice actually used'
    );
    assert(
        manifest.voiceKind === 'synthetic' || manifest.voiceKind === 'human',
        `Manifest: declares whether the voice is synthetic or human (got ${manifest.voiceKind})`
    );

    const stale = [];
    const missingFiles = [];
    const wrongSize = [];

    SCRIPTS.forEach((script) => {
        const track = manifest.tracks[script.id];
        if (!track) return;                       // covered by the count check below
        if (!sign.isCurrent(track, script.text, config)) stale.push(script.id);

        const file = path.join(ROOT, track.file);
        if (!fs.existsSync(file)) { missingFiles.push(script.id); return; }
        if (fs.statSync(file).size !== track.bytes) wrongSize.push(script.id);
    });

    const missingTracks = SCRIPTS.filter(s => !manifest.tracks[s.id]).map(s => s.id);
    assert(
        missingTracks.length === 0,
        `Manifest: every script has a track (missing: ${missingTracks.join(', ') || 'none'})`
    );
    assert(
        stale.length === 0,
        `Manifest: every track's hash matches its script under the shared formula (stale: ${stale.join(', ') || 'none'})`
    );
    assert(
        missingFiles.length === 0,
        `Manifest: every track's audio file exists (missing: ${missingFiles.join(', ') || 'none'})`
    );
    assert(
        wrongSize.length === 0,
        `Manifest: the quoted byte weight matches the file on disk (wrong: ${wrongSize.join(', ') || 'none'})`
    );

    // The grams figure next to the play button is derived, not typed. If it
    // drifts from the model, the page is quoting a number it cannot defend.
    const badGrams = Object.entries(manifest.tracks).filter(([, t]) =>
        Math.abs(t.grams - Number(sign.grams(t.bytes).toFixed(3))) > 0.0005);
    assert(
        badGrams.length === 0,
        `Manifest: quoted grams match the Sustainable Web Design model (off: ${badGrams.map(b => b[0]).join(', ') || 'none'})`
    );

    // --- The one that actually costs money ---------------------------------
    // Everything above could pass while the generator still disagreed. This
    // runs the real generator, in dry-run, configured exactly as the manifest
    // says the narration was rendered, and asserts it plans to spend nothing.
    {
        const out = execFileSync(
            process.execPath,
            [path.join(ROOT, 'scripts', 'generate-voice.js'), '--dry-run'],
            {
                cwd: ROOT,
                encoding: 'utf8',
                env: Object.assign({}, process.env, {
                    FISH_AUDIO_API_KEY: '',
                    FISH_AUDIO_MODEL: String(config.model),
                    FISH_AUDIO_VOICE_ID: String(config.voiceId),
                    FISH_AUDIO_BITRATE: String(config.bitrate),
                    FISH_AUDIO_FORMAT: String(config.format)
                })
            }
        );

        const expected = SCRIPTS.length;
        assert(
            new RegExp(`rendered 0 · skipped ${expected}\\b`).test(out),
            `Generator: a dry run against the committed narration re-renders nothing (got: ${(out.match(/rendered \d+ · skipped \d+/) || ['no summary'])[0]})`
        );
        assert(
            !/would cost/.test(out),
            'Generator: a dry run against the committed narration plans zero credits'
        );
        assert(
            !/does not match how the existing narration was rendered/.test(out),
            'Generator: the committed manifest reports no configuration drift'
        );
    }

    // Changing one script must invalidate exactly that track and no other —
    // the property that makes "fix a sentence, re-render one file" true.
    {
        const target = SCRIPTS[0];
        const edited = `${target.text} One more sentence.`;
        const invalidated = SCRIPTS.filter((s) => {
            const text = s.id === target.id ? edited : s.text;
            return !sign.isCurrent(manifest.tracks[s.id], text, config);
        }).map(s => s.id);

        assert(
            invalidated.length === 1 && invalidated[0] === target.id,
            `Generator: editing one script invalidates only that track (invalidated: ${invalidated.join(', ')})`
        );
    }
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
