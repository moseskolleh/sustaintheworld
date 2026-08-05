'use strict';
// ===================================================================
// VOICE SIGNATURE — the single definition of "is this track current?"
//
// Two programs write assets/audio/voice-manifest.json:
//
//   scripts/generate-voice.js   renders from the Fish Audio TTS API
//   scripts/assemble-voice.js   stitches chunks rendered over MCP
//
// They have to agree, byte for byte, on how a track's signature is
// computed. When they did not, `npm run voice` considered every
// assembled track stale and offered to re-render the whole page —
// about 7,700 Fish Audio credits for output that already existed.
// That is the entire reason this module exists: there is now one
// formula, in one file, imported by both, and tests/voice.test.js
// fails if either script grows its own copy.
//
// WHAT IS IN THE SIGNATURE
//
//   text      the words spoken — obviously
//   model     a different TTS model is a different reading
//   voiceId   a different voice is a different reading
//   bitrate   changes the bytes the visitor downloads
//   format    changes the file, and the file name
//
// WHAT IS DELIBERATELY NOT
//
//   maxBytes  the per-call text limit only decides where the render was
//             cut into API calls. Sentence-boundary chunking means the
//             joins land on pauses, so a section rendered in two calls
//             and the same section rendered in one are the same reading.
//             Including it meant that upgrading a Fish Audio plan — which
//             raises the cap from 500 to 15000 — silently invalidated
//             every track on the next run. It is recorded in the manifest
//             for provenance and reported as drift, never as staleness.
//             `npm run voice -- --force` re-renders regardless.
// ===================================================================

const crypto = require('crypto');

// Bumped only when the formula itself changes. Stored in the manifest so a
// future change can tell "rendered under the old formula" apart from
// "genuinely stale", instead of quietly re-rendering the page.
const SIGNATURE_VERSION = 1;

// Sustainable Web Design model. Shared here so the assembler, the generator
// and the footer badge cannot drift onto different constants.
const GRAMS_PER_MB = 0.36;

// Fields that make up the signature, in order. Also the fields compared when
// reporting configuration drift, so the two can never fall out of step.
const SIGNATURE_FIELDS = ['model', 'voiceId', 'bitrate', 'format'];

/**
 * Coerces a render configuration into the exact shape the hash is taken
 * over. Both callers reach this from different directions — one from
 * environment variables (all strings), one from a JSON plan (mixed types) —
 * so normalising here is what makes the two agree.
 */
function normaliseConfig(config) {
    const c = config || {};
    const bitrate = Number(c.bitrate);
    return {
        model: String(c.model == null ? '' : c.model),
        voiceId: String(c.voiceId == null ? '' : c.voiceId),
        bitrate: Number.isFinite(bitrate) ? bitrate : 0,
        format: String(c.format == null ? 'mp3' : c.format).toLowerCase()
    };
}

/** The 12-hex-character signature stored as `hash` on every manifest track. */
function signature(text, config) {
    const c = normaliseConfig(config);
    const parts = [String(text == null ? '' : text)].concat(SIGNATURE_FIELDS.map(f => c[f]));
    return crypto.createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 12);
}

/** True when `track` was rendered from exactly this text under this config. */
function isCurrent(track, text, config) {
    return !!(track && track.hash && track.hash === signature(text, config));
}

/**
 * Reads the render configuration back off a manifest. Older manifests predate
 * `format`, and mp3 is the only format either script has ever shipped, so the
 * default keeps them readable rather than treating them as a mismatch.
 */
function manifestConfig(manifest) {
    const m = manifest || {};
    return normaliseConfig({
        model: m.model,
        voiceId: m.voiceId,
        bitrate: m.bitrate,
        format: m.format || 'mp3'
    });
}

/**
 * Compares the config a manifest was written under with the one about to be
 * used, and returns the fields that differ. The generator prints these before
 * spending anything, so "it wants to re-render all ten sections" always comes
 * with the reason attached.
 */
function configDrift(manifest, config) {
    const was = manifestConfig(manifest);
    const now = normaliseConfig(config);
    return SIGNATURE_FIELDS
        .filter(field => String(was[field]) !== String(now[field]))
        .map(field => ({ field, was: was[field], now: now[field] }));
}

/** Grams CO₂e for a transferred payload, Sustainable Web Design model. */
const grams = bytes => (bytes / (1024 * 1024)) * GRAMS_PER_MB;

module.exports = {
    SIGNATURE_VERSION,
    SIGNATURE_FIELDS,
    GRAMS_PER_MB,
    normaliseConfig,
    manifestConfig,
    signature,
    isCurrent,
    configDrift,
    grams
};
