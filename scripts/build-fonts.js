#!/usr/bin/env node
// ===================================================================
// BUILD FONTS — self-hosted, subsetted, and counted
//
//     npm run fonts:build            fetch the sources, subset, write assets/fonts/
//     npm run fonts:build -- --from <dir>   same, from already-downloaded sources
//     npm run fonts:check            fail if the committed fonts or the @font-face
//                                    blocks in the stylesheets are out of date
//
// Until this script existed the site loaded its three typefaces from Google
// Fonts. That was the last third-party request on every page, and it had two
// costs the site never owned up to. It sent every visitor's IP address to
// Google before a single word rendered, and it moved about 100 KB of font
// data that `npm run budget` did not count — so the "first view" figure the
// README quoted was short by a third.
//
// Now the fonts live in assets/fonts/, subset to the Latin range Google
// serves and instanced to the weight range the stylesheets actually use.
// The budget counts them like any other asset, and no page needs a
// connection to anyone but the host.
//
// WHAT "SUBSET" MEANS HERE. Each face keeps the same unicode-range Google
// Fonts uses for its `latin` split, so a visitor sees exactly the glyphs they
// saw before. Characters outside that range (Chinese, Arabic, the → arrow)
// fall back to a system font, which is what happened before as well — the
// site never requested the other subsets.
//
// WHAT "INSTANCED" MEANS. Inter and Space Grotesk are variable fonts. Google
// serves the full weight axis; the stylesheets use Inter at 400–600 and
// Space Grotesk at 400–700, so the deltas outside those ranges are dropped.
// Weights in between are still real (a `font-weight: 550` interpolates),
// weights outside clamp to the nearest edge, exactly as they did when the
// page only requested those weights.
//
// The output is committed. `--check` runs in CI and needs no network: it
// hashes the committed files against assets/fonts/manifest.json and compares
// the generated @font-face block in each stylesheet with the one the
// manifest describes.
//
// LICENSING. All three families are under the SIL Open Font License 1.1,
// which permits bundling, subsetting and serving them. The notices ship in
// assets/fonts/LICENSE-OFL.txt. IBM Plex carries the Reserved Font Name
// "Plex"; the @font-face family names here are what the stylesheets already
// used, and nothing is redistributed under a new name.
// ===================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'fonts');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const GENERATED_BY = 'scripts/build-fonts.js';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const fromIdx = args.indexOf('--from');
const SOURCE_DIR = fromIdx > -1 ? args[fromIdx + 1] : process.env.FONT_SOURCE_DIR;

// Google Fonts' `latin` unicode-range, verbatim, so the self-hosted faces
// cover precisely the characters the hosted ones did.
const LATIN_RANGE =
    'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, ' +
    'U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, ' +
    'U+2212, U+2215, U+FEFF, U+FFFD';

// The four files the pages used to fetch from fonts.gstatic.com. Google
// serves one variable file per family regardless of which static weights the
// CSS asks for, so these are the actual bytes a visitor used to download.
// The version segment in each URL (v20, v22) pins the upstream release.
const FONTS = [
    {
        id: 'space-grotesk',
        family: 'Space Grotesk',
        file: 'space-grotesk-latin.woff2',
        weight: '400 700',
        style: 'normal',
        axes: { wght: { min: 400, max: 700 } },
        source: 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4Cw.woff2',
        upstream: 'https://github.com/floriankarsten/space-grotesk',
        copyright: 'Copyright 2020 The Space Grotesk Project Authors'
    },
    {
        id: 'inter',
        family: 'Inter',
        file: 'inter-latin.woff2',
        weight: '400 600',
        style: 'normal',
        axes: { wght: { min: 400, max: 600 } },
        source: 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2',
        upstream: 'https://github.com/rsms/inter',
        copyright: 'Copyright (c) 2016 The Inter Project Authors'
    },
    {
        id: 'ibm-plex-mono-400',
        family: 'IBM Plex Mono',
        file: 'ibm-plex-mono-latin-400.woff2',
        weight: '400',
        style: 'normal',
        source: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n1i8q1w.woff2',
        upstream: 'https://github.com/IBM/plex',
        copyright: 'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"'
    },
    {
        id: 'ibm-plex-mono-500',
        family: 'IBM Plex Mono',
        file: 'ibm-plex-mono-latin-500.woff2',
        weight: '500',
        style: 'normal',
        source: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJwlBFgg.woff2',
        upstream: 'https://github.com/IBM/plex',
        copyright: 'Copyright © 2017 IBM Corp. with Reserved Font Name "Plex"'
    }
];

// Every stylesheet that sets one of the families carries the generated block
// between these markers, so a page that loads any one of them gets the faces
// without a second request.
const STYLESHEETS = ['style.css', 'content.css', 'carbon-ai.css'];
const START = '/* FONTS:START';
const END = '/* FONTS:END */';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const fmt = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

// ------------------------------------------------------------------
// The @font-face block, derived from the manifest so the stylesheets can
// never describe a file that is not there.
// ------------------------------------------------------------------
function fontFaceBlock(manifest) {
    const faces = manifest.fonts.map((f) => [
        '@font-face {',
        `    font-family: '${f.family}';`,
        `    font-style: ${f.style};`,
        `    font-weight: ${f.weight};`,
        '    font-display: swap;',
        `    src: url('assets/fonts/${f.file}') format('woff2');`,
        `    unicode-range: ${manifest.unicodeRange};`,
        '}'
    ].join('\n'));
    return [
        `${START} — generated by ${GENERATED_BY} from assets/fonts/manifest.json. Do not edit by hand.`,
        '   Self-hosted so no page needs a request to a third party. `font-display: swap`',
        '   renders text in the fallback face immediately and swaps when the file lands. */',
        ...faces,
        END
    ].join('\n');
}

function splice(css, block) {
    const a = css.indexOf(START);
    const b = css.indexOf(END);
    if (a === -1 || b === -1 || b < a) {
        throw new Error(`stylesheet has no ${START} … ${END} markers`);
    }
    return css.slice(0, a) + block + css.slice(b + END.length);
}

// ------------------------------------------------------------------
// --check: hashes and stylesheet blocks, no network
// ------------------------------------------------------------------
function check() {
    const problems = [];
    if (!fs.existsSync(MANIFEST)) {
        console.error(`  ✗ ${path.relative(ROOT, MANIFEST)} is missing — run \`npm run fonts:build\``);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

    if (manifest.unicodeRange !== LATIN_RANGE) {
        problems.push('manifest unicodeRange differs from the range this script subsets to');
    }

    const expectedIds = FONTS.map(f => f.id).join(',');
    const manifestIds = manifest.fonts.map(f => f.id).join(',');
    if (expectedIds !== manifestIds) {
        problems.push(`manifest lists [${manifestIds}], this script builds [${expectedIds}]`);
    }

    manifest.fonts.forEach((f) => {
        const file = path.join(OUT_DIR, f.file);
        if (!fs.existsSync(file)) { problems.push(`${f.file} is missing`); return; }
        const buf = fs.readFileSync(file);
        if (buf.length !== f.bytes) problems.push(`${f.file}: ${buf.length} bytes on disk, manifest says ${f.bytes}`);
        if (sha256(buf) !== f.sha256) problems.push(`${f.file}: hash differs from the manifest`);
        const spec = FONTS.find(s => s.id === f.id);
        if (spec && (spec.weight !== f.weight || spec.family !== f.family || spec.file !== f.file)) {
            problems.push(`${f.id}: manifest entry no longer matches this script's definition`);
        }
    });

    const block = fontFaceBlock(manifest);
    STYLESHEETS.forEach((rel) => {
        const file = path.join(ROOT, rel);
        if (!fs.existsSync(file)) { problems.push(`${rel} does not exist`); return; }
        const css = fs.readFileSync(file, 'utf8');
        let current;
        try { current = splice(css, block); } catch (e) { problems.push(`${rel}: ${e.message}`); return; }
        if (current !== css) problems.push(`${rel}: @font-face block is out of date`);
    });

    if (!fs.existsSync(path.join(OUT_DIR, 'LICENSE-OFL.txt'))) {
        problems.push('assets/fonts/LICENSE-OFL.txt is missing — the OFL requires the notice to travel with the fonts');
    }

    if (problems.length) {
        console.error('\n  Fonts are out of date:\n');
        problems.forEach(p => console.error(`    ✗ ${p}`));
        console.error('\n  Run `npm run fonts:build` and commit the result.\n');
        process.exit(1);
    }
    const total = manifest.fonts.reduce((n, f) => n + f.bytes, 0);
    console.log(`  assets/fonts matches its manifest (${manifest.fonts.length} files, ${fmt(total)}); @font-face blocks current in ${STYLESHEETS.join(', ')}`);
}

// ------------------------------------------------------------------
// build: fetch (or read), subset, write
// ------------------------------------------------------------------
async function fetchSource(spec) {
    if (SOURCE_DIR) {
        const local = path.join(SOURCE_DIR, `${spec.id}.source.woff2`);
        if (!fs.existsSync(local)) throw new Error(`--from: ${local} not found`);
        return fs.readFileSync(local);
    }
    if (typeof fetch !== 'function') throw new Error('Node 18+ is needed to download the sources (or pass --from <dir>)');
    // Google serves woff2 only to browsers it recognises; identify as one.
    const res = await fetch(spec.source, {
        headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36' }
    });
    if (!res.ok) throw new Error(`${spec.source}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

// Every code point in the range, as a string, which is how the subsetter
// takes its glyph list.
function textForRange(range) {
    let out = '';
    range.split(',').forEach((part) => {
        const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map(h => parseInt(h, 16));
        for (let c = a; c <= (b === undefined ? a : b); c++) {
            if (c >= 0xD800 && c <= 0xDFFF) continue;
            out += String.fromCodePoint(c);
        }
    });
    return out;
}

async function build() {
    let subsetFont;
    try {
        subsetFont = require('subset-font');
    } catch (e) {
        console.error('  subset-font is not installed — run `npm install` first');
        process.exit(1);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const text = textForRange(LATIN_RANGE);
    const entries = [];

    console.log('\n  Building fonts:\n');
    for (const spec of FONTS) {
        const source = await fetchSource(spec);
        const options = { targetFormat: 'woff2' };
        if (spec.axes) options.variationAxes = spec.axes;
        const out = await subsetFont(source, text, options);
        fs.writeFileSync(path.join(OUT_DIR, spec.file), out);
        entries.push({
            id: spec.id,
            family: spec.family,
            file: spec.file,
            weight: spec.weight,
            style: spec.style,
            axes: spec.axes || null,
            bytes: out.length,
            sha256: sha256(out),
            source: spec.source,
            sourceBytes: source.length,
            sourceSha256: sha256(source),
            upstream: spec.upstream,
            copyright: spec.copyright,
            license: 'OFL-1.1'
        });
        console.log(`    ${spec.file.padEnd(32)} ${fmt(source.length).padStart(9)} → ${fmt(out.length).padStart(9)}`);
    }

    const manifest = {
        generatedBy: GENERATED_BY,
        note: 'Subset to the latin unicode-range below and instanced to the weights the stylesheets use. Regenerate with `npm run fonts:build`; `npm run fonts:check` verifies these hashes in CI.',
        unicodeRange: LATIN_RANGE,
        fonts: entries
    };
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

    const block = fontFaceBlock(manifest);
    STYLESHEETS.forEach((rel) => {
        const file = path.join(ROOT, rel);
        const css = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, splice(css, block));
    });

    const total = entries.reduce((n, f) => n + f.bytes, 0);
    console.log(`\n  ${entries.length} files, ${fmt(total)} on the wire; manifest and @font-face blocks written.\n`);
}

if (CHECK) check();
else build().catch((e) => { console.error(`  ✗ ${e.message}`); process.exit(1); });
