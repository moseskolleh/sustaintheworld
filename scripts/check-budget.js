#!/usr/bin/env node
// ===================================================================
// CHECK BUDGET — hold the site to the weights the README quotes
//
// The README used to claim "under 2 MB for the whole site" and a Lighthouse
// score, with nothing measuring either. The image total had since grown past
// 3 MB, so the claim was simply false, and nobody would have noticed until a
// reader checked. A performance claim that nothing enforces decays into a
// performance claim that is wrong.
//
// This measures what the site actually weighs and fails when it exceeds the
// budgets below, so the README can quote numbers that are true by
// construction. Run by `npm test`.
//
//     npm run budget                  the report, and what could be lowered
//     npm run budget -- --json        every budget as JSON: measured, ceiling,
//                                     headroom (for scripts/receipt.js)
//     npm run budget -- --readme      rewrite the README's budget tables
//     npm run budget -- --ratchet     lower every ceiling to what is measured
//                                     plus 5%; never raises one
//
// --lengths FILE adds the scroll lengths `npm run smoke` measured (it
// writes them to .smoke/length.json) to --json, --ratchet and the report;
// --root DIR measures another checkout with this script, which is how the
// pull-request receipt weighs main (see .github/workflows/receipt.yml);
// with --json it reports that checkout's own ceilings (see ceilingsOf).
//
// WHAT "WIRE WEIGHT" MEANS. GitHub Pages compresses text responses, so the
// bytes a visitor downloads for HTML/CSS/JS are the gzipped bytes, not the
// bytes on disk. Images and fonts are already compressed and are counted
// as-is. This is an estimate — the real figure depends on the CDN's encoder,
// and brotli does better than the gzip used here — but it is a conservative
// one, and it is measured rather than asserted.
//
// WHAT THE ESTIMATE USED TO MISS. The first-view figure came to 234 KB while
// a real browser measured over 500 KB. Two things were left out: the fonts,
// which came from Google and were never a file in this repository, and a
// second 150 KB hero image the slideshow fetched on idle. The fonts are
// self-hosted now and counted below; the slideshow fetches a slide only when
// it is about to show it; and `npm run smoke` opens the page in Chromium and
// fails if what it measures comes in above what this script claims.
//
// WHAT IT DOES NOT MEASURE. Render time, layout stability, and Lighthouse
// scores need a real browser; none of them are claimed anywhere on the basis
// of this script.
// ===================================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const os = require('os');
const { execFileSync } = require('child_process');

// Command-line flags are read only when this file is run, never when a
// test or smoke.js requires it: smoke.js has a --root of its own.
const CLI = require.main === module ? process.argv.slice(2) : [];
const flag = (name) => CLI.includes(name);
const option = (name) => { const i = CLI.indexOf(name); return i > -1 && CLI[i + 1] ? CLI[i + 1] : null; };

const ROOT = path.resolve(option('--root') || path.join(__dirname, '..'));
const KB = 1024;
const MB = 1024 * 1024;

// ------------------------------------------------------------------
// Budgets. The headroom is not uniform: the report prints each figure as a
// share of its ceiling, and in September 2026 that ran from 74% (the field
// report over the wire) to 96% (the on-demand total: the wave-1 review's
// fixes filled it to within 100 bytes, until the journey map shed 1.6 KB of
// path points that drew nothing, then 3.6 KB more written as steps, which
// paid for the time-zone table moving here out of script.js), with the
// audio budget at 0% until Moses records his introduction. To make room,
// remove something of equal weight rather than raise a ceiling
// (docs/plan.md, "Stop doing"); `--ratchet` lowers them. The README's
// table is written from these (`readme` is the row's name there) by
// `npm run budget -- --readme`, and npm test fails while it is out of date.
//
// A budget with `hold` is sized for a state the site has not reached yet,
// so the ratchet and the "you could lower" hints leave it where it is.
// ------------------------------------------------------------------
const BUDGETS = {
    criticalWire: {
        label: 'First view of the homepage, over the wire (HTML + CSS + JS gzipped, the fonts, and eagerly-loaded images)',
        max: 288 * KB,
        readme: 'First view of the homepage, over the wire (fonts included)'
    },
    // What a visit fetches after arriving, if it uses everything: the
    // on-demand modules, the narration scripts and AI data behind them, the
    // journey map, the narration manifest. Bounded so "on demand" cannot
    // become the place where weight goes to hide.
    onDemand: {
        label: 'Everything a full visit adds on demand (modules, scripts, map — gzipped)',
        max: 72 * KB,
        readme: 'Everything a full visit adds on demand (modules, scripts, map)'
    },
    largestImage: {
        label: 'Largest single image',
        max: 210 * KB,
        readme: 'Largest single image'
    },
    allImages: {
        label: 'Every image in the repository',
        max: 3.5 * MB,
        readme: 'Every image in the repository'
    },
    // The only audio the site ships is Moses's own recorded introduction:
    // one 60–90 s take, and 90 s of mono MP3 at 64 kbps is about 720 KB.
    // Every audio file in the repository counts against it, so the ten
    // stock-voice section tracks this replaced (4.13 MB, retired with their
    // 4.5 MB budget) cannot drift back in unbudgeted. 0 KB until he records.
    introAudio: {
        label: "Recorded narration: Moses's introduction, the one audio file the site ships",
        max: 800 * KB,
        readme: "Recorded narration: Moses's introduction (sized for his 60–90 s take)",
        hold: 'sized for his recording, which is not made yet'
    },
    // The footer calls it "the whole portfolio in 9 KB"; this is what keeps
    // that true.
    fieldReport: {
        label: 'Text-only field report, the HTML file as saved (uncompressed)',
        max: 11 * KB,
        readme: 'Text-only field report, the HTML file (the size the footer quotes)'
    },
    // The same page as a visit costs it: its HTML gzipped, the visit counter
    // (the one script it loads) and its icon. The footer's figure above is
    // the file a reader can save; this is what reaching it transfers.
    fieldReportWire: {
        label: 'Text-only field report, over the wire (with its visit counter)',
        max: 8 * KB,
        readme: 'Text-only field report, over the wire (with its visit counter)'
    },
    // The generated pages carry no images and no framework, so they should
    // stay small. A budget here is what stops "just one more section" turning
    // the evidence pages into the thing they were built to argue against.
    caseStudiesWire: {
        label: 'Case studies page, over the wire (with fonts)',
        max: 109 * KB,
        readme: 'Case studies page, over the wire (fonts included)'
    },
    // Sized for the page once it is full, not for today's empty state (95 KB
    // in October 2026), so the weekly Action cannot turn red just because
    // counting started. Every list on it is capped (twelve weeks, fifteen
    // referrers and "other", the features, lenses and sections the site
    // names), and drawn with all of them full, by smoke.js's busy quarter or
    // tests/stats.test.js's twenty weeks, it comes to 97.8 KB: the ceiling is
    // that plus 5%, as the ratchet would set it. The hold keeps the ratchet
    // from measuring the committed, empty page instead; stats.test.js holds
    // the full one to the ceiling.
    statsWire: {
        label: 'Open counts page, over the wire (with fonts)',
        max: 103 * KB,
        readme: 'Open counts page, over the wire (fonts included; sized for a full page)',
        hold: "sized for the page full of counts, not for today's"
    },
    researchWire: {
        label: 'Research outputs page, over the wire (with fonts)',
        max: 99 * KB,
        readme: 'Research outputs page, over the wire (fonts included)'
    },
    // "AI, Weighed" carries its calculator and the emission-factor data on
    // arrival, so it is the heaviest page after the homepage and it went
    // unbudgeted until a real browser measured it at 106 KB. The ceiling is
    // that measurement plus 5%, not the usual headroom: budgets only ratchet
    // down, and this one starts where the page already is.
    carbonAiWire: {
        label: 'AI, Weighed (carbon-ai.html), over the wire (with fonts)',
        max: 111 * KB,
        readme: 'AI, Weighed (`carbon-ai.html`), over the wire (fonts included)'
    }
};

// The pages whose whole first view is budgeted, and the measurement that
// holds each. `npm run smoke` loads every one of them in a browser and fails
// if what it transfers comes in above the estimate here.
const PAGE_BUDGETS = {
    'index.html': 'criticalWire',
    'case-studies.html': 'caseStudiesWire',
    'research.html': 'researchWire',
    'carbon-ai.html': 'carbonAiWire',
    'stats.html': 'statsWire',
    'field-report.html': 'fieldReportWire'
};

// ------------------------------------------------------------------
// Length: how far a reader has to scroll.
//
// Weight is what a page costs the network; length is what it costs a busy
// reader, and nothing held it. The homepage had grown to 19.4 screens on a
// desktop and 32.7 on a phone when docs/plan.md set it targets of 10 and
// 18 (Phase 2). A length is the page's scroll height over the window's
// height, in "screens", at the two sizes the accessibility pass uses.
//
// It takes a browser to measure, so this file holds only the ceilings:
// `npm run smoke` measures every page once it has settled (fonts loaded,
// every section drawn at its real height rather than the 2000px estimate
// content-visibility uses until then, on-demand features arrived, nothing
// opened), fails a page above its ceiling, and writes what it measured to
// .smoke/length.json for --json, --ratchet and the pull-request receipt.
//
// The homepage's ceilings began as the plan's targets, not a measurement;
// once it met them, the ratchet (step 2.9) brought them down to what it
// measured plus 5%, like the rest. Every other page's is what it measured
// when the budget was set (28 September 2026, with the shared nav and
// closing call to action every page but the homepage now has, in Chromium
// 141, the build CI pins) plus 5%. stats.html is held drawn full, as the
// smoke's fixture draws a busy quarter: that is the page the weekly Action
// will commit, and the page as committed today is shorter.
// ------------------------------------------------------------------
const VIEWPORTS = {
    '1440x900': { width: 1440, height: 900, label: 'desktop' },
    '390x844': { width: 390, height: 844, label: 'phone' }
};
const LENGTH = {
    'index.html': { '1440x900': 9.79, '390x844': 17.09 },
    'case-studies.html': { '1440x900': 11.85, '390x844': 19.78 },
    'carbon-ai.html': { '1440x900': 7.07, '390x844': 13.38 },
    'research.html': { '1440x900': 5.86, '390x844': 8.99 },
    'stats.html': { '1440x900': 10.97, '390x844': 16.25 },
    'field-report.html': { '1440x900': 4.4, '390x844': 7.44 },
    '404.html': { '1440x900': 1.05, '390x844': 1.05 }
};

// A page's length as a budget reads it: the longest state the smoke draws
// it in (stats.html also drawn full; see above).
const heldLength = (m) => (m ? Math.max(m.screens, m.full ? m.full.screens : 0) : null);

// ------------------------------------------------------------------
// The ratchet: a ceiling earned by a measurement is 5% above it, and at
// least a small floor above it, so a small page is not held to within a
// few bytes of today. Byte ceilings round up to a whole KB, lengths to a
// hundredth of a screen. `--ratchet` moves each ceiling down to that and
// never up; the report names every budget whose ceiling could come down:
// more than 10% headroom, and a ratchet target below the ceiling (a small
// budget can have the first and not the second, the floor being 1 KB).
// ------------------------------------------------------------------
const RATCHET = { share: 0.05, floorBytes: 1 * KB, floorScreens: 0.1, hintAbove: 0.10 };

function ratchetTarget(measured, unit) {
    if (unit === 'screens') {
        const want = Math.max(measured * (1 + RATCHET.share), measured + RATCHET.floorScreens);
        // 2 × 1.05 × 100 is 210.00000000000003 in floating point; the
        // epsilon keeps that from rounding up to 2.11.
        return Math.ceil(want * 100 - 1e-6) / 100;
    }
    const want = Math.max(measured * (1 + RATCHET.share), measured + RATCHET.floorBytes);
    return Math.ceil(want / KB - 1e-9) * KB;
}

// What a ceiling could come down to, or null: only when the headroom is
// over 10% of it and the budget is not held for later.
function couldLowerTo(measured, ceiling, unit, hold) {
    if (hold || typeof measured !== 'number' || !(ceiling > 0)) return null;
    if ((ceiling - measured) / ceiling <= RATCHET.hintAbove) return null;
    const target = ratchetTarget(measured, unit);
    return target < ceiling ? target : null;
}

const fmt = (bytes) => (bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(0)} KB`);
const sizeOf = (rel) => {
    const file = path.join(ROOT, rel);
    return fs.existsSync(file) ? fs.statSync(file).size : null;
};
const gzipOf = (rel) => zlib.gzipSync(fs.readFileSync(path.join(ROOT, rel)), { level: 9 }).length;

const isText = (rel) => /\.(html|css|js|json|svg|xml|txt)$/i.test(rel);
const isImage = (rel) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(rel);
const isLocal = (href) => href && !/^(https?:)?\/\//.test(href) && !href.startsWith('data:') && !href.startsWith('#');
const wireOf = (rel) => (isText(rel) ? gzipOf(rel) : sizeOf(rel));

// ------------------------------------------------------------------
// What the first view of a page actually costs.
//
// Derived from the HTML rather than hardcoded, so adding a stylesheet or
// dropping loading="lazy" from an image shows up here instead of quietly
// making the README wrong.
// ------------------------------------------------------------------
function criticalAssets(page = 'index.html') {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const assets = [page];
    const add = (rel) => {
        if (isLocal(rel) && !assets.includes(rel) && sizeOf(rel) !== null) assets.push(rel);
    };

    // Stylesheets and scripts block or accompany the first render.
    const stylesheets = [];
    (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || []).forEach((tag) => {
        const m = tag.match(/href=["']([^"']+)["']/i);
        if (m) { add(m[1]); stylesheets.push(m[1]); }
    });
    (html.match(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi) || []).forEach((tag) => {
        const m = tag.match(/src=["']([^"']+)["']/i);
        if (m) add(m[1]);
    });

    // Anything explicitly preloaded is, by definition, on the critical path.
    (html.match(/<link[^>]+rel=["']preload["'][^>]*>/gi) || []).forEach((tag) => {
        const m = tag.match(/href=["']([^"']+)["']/i);
        if (m) add(m[1]);
    });

    // The icon: a browser asks for it on arrival, on every page. It is about
    // 200 bytes, but on the 6 KB field report that was most of the room
    // between this estimate and what a browser measured.
    (html.match(/<link[^>]+rel=["']icon["'][^>]*>/gi) || []).forEach((tag) => {
        const m = tag.match(/href=["']([^"']+)["']/i);
        if (m) add(m[1]);
    });

    // Every face a stylesheet declares. Not every page uses every weight
    // above the fold, but the four here are all used somewhere on a first
    // screen, and counting them all is the conservative side to err on.
    stylesheets.forEach((css) => {
        if (!isLocal(css) || sizeOf(css) === null) return;
        const text = fs.readFileSync(path.join(ROOT, css), 'utf8');
        (text.match(/@font-face\s*{[^}]*}/g) || []).forEach((face) => {
            const m = face.match(/url\(['"]?([^'")]+)['"]?\)/);
            if (m) add(m[1]);
        });
    });

    // An <img> without loading="lazy" is fetched during the first view.
    // The case studies' lightbox is not in the markup: its script makes its
    // <img> when a photo is opened, so it adds nothing.
    (html.match(/<img[^>]*>/gi) || []).forEach((tag) => {
        if (/loading=["']lazy["']/i.test(tag)) return;
        const m = tag.match(/src=["']([^"']+)["']/i);
        if (m) add(m[1]);
    });

    return assets;
}

// What script.js fetches later, feature by feature — and what
// case-studies.html's own loader fetches as a reader nears its two games
// (modules/dossier.css and .js, out of every first view). The module list
// is read from the directory, so a new module — or a module's stylesheet —
// is counted the moment it exists.
function onDemandAssets() {
    const files = [];
    const modulesDir = path.join(ROOT, 'modules');
    if (fs.existsSync(modulesDir)) {
        fs.readdirSync(modulesDir).filter(f => /\.(js|css)$/.test(f)).sort()
            .forEach(f => files.push(`modules/${f}`));
    }
    ['voice-scripts.js', 'ai-carbon-data.js', 'assets/journey-map.svg', 'assets/timezones.json', 'assets/audio/voice-manifest.json']
        .forEach((rel) => { if (sizeOf(rel) !== null) files.push(rel); });
    return files;
}

// The README's table of the same files, a row per feature: what arrives
// together and when. Only the words are written here. The weight is
// measured, so a module that grows cannot leave the README quoting what it
// used to weigh, as the hand-written table had more than once.
// Every file above must be in exactly one row, or the README would leave
// it out without a word: the report and tests/budget.test.js fail until it
// is. The rows add up to the on-demand budget.
const MODULE_TABLE = [
    { module: '`modules/interactives.js` (+ `ai-carbon-data.js`)', files: ['modules/interactives.js', 'ai-carbon-data.js'],
        when: 'section 05, the Assay or the footer receipt comes within a screen of the viewport, or a deep link lands there' },
    { module: '`modules/dispatch.js` (+ `dispatch.css`, `voice-scripts.js`)', files: ['modules/dispatch.js', 'modules/dispatch.css', 'voice-scripts.js'],
        when: 'the first press of Listen, or `voice` in the terminal' },
    { module: '`modules/dossier.js` (+ `dossier.css`)', files: ['modules/dossier.js', 'modules/dossier.css'],
        when: 'on `case-studies.html`, a game\'s host comes within a screen of view (the page\'s own loader, not `script.js`)' },
    { module: '`modules/terminal.js`', files: ['modules/terminal.js'],
        when: 'the backtick key or the footer button' },
    { module: '`modules/anatomy.css` + `anatomy.js`, on `carbon-ai.html`', files: ['modules/anatomy.css', 'modules/anatomy.js'],
        when: 'Anatomy of a Prompt comes within 400px of the screen (`carbon-ai.js` fetches them)' },
    { module: '`assets/journey-map.svg`', files: ['assets/journey-map.svg'],
        when: 'the first sign a reader is heading down the page: a scroll, a key, a touch, or a deep link' },
    { module: '`assets/timezones.json`', files: ['assets/timezones.json'],
        when: 'the journey map arrives, for its "you?" mark (the zone is looked up in the page, never sent)' },
    { module: '`assets/audio/voice-manifest.json`', files: ['assets/audio/voice-manifest.json'],
        when: '1.5 s after load, only where the browser has no voice to read aloud with: whether a recording can stand in' }
];

// Each row weighed, and any on-demand file no row names.
function moduleRows(onDemand) {
    const wire = new Map(onDemand.map(a => [a.rel, a.wire]));
    const named = MODULE_TABLE.flatMap(r => r.files);
    return {
        rows: MODULE_TABLE.map(r => ({
            module: r.module,
            when: r.when,
            measured: r.files.every(f => wire.has(f)) ? r.files.reduce((n, f) => n + wire.get(f), 0) : null
        })),
        unlisted: onDemand.map(a => a.rel).filter(f => !named.includes(f)),
        twice: named.filter((f, i) => named.indexOf(f) !== i)
    };
}

// ------------------------------------------------------------------
// Measure
// ------------------------------------------------------------------
function walk(dir, out) {
    if (!fs.existsSync(dir)) return out;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) return;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(path.relative(ROOT, full));
    });
    return out;
}

function measure() {
    const allFiles = walk(ROOT, []);
    const images = allFiles.filter(isImage);
    const audio = allFiles.filter(f => /\.(mp3|opus|wav|m4a)$/i.test(f));

    const critical = criticalAssets().map((rel) => ({ rel, raw: sizeOf(rel), wire: wireOf(rel) }));
    const onDemand = onDemandAssets().map((rel) => ({ rel, raw: sizeOf(rel), wire: wireOf(rel) }));
    // null for a page this checkout does not have (an older one, by --root).
    const pageWire = (page) => (sizeOf(page) === null ? null : criticalAssets(page).reduce((n, rel) => n + wireOf(rel), 0));

    const measured = {
        criticalWire: critical.reduce((n, a) => n + a.wire, 0),
        onDemand: onDemand.reduce((n, a) => n + a.wire, 0),
        caseStudiesWire: pageWire('case-studies.html'),
        statsWire: pageWire('stats.html'),
        researchWire: pageWire('research.html'),
        carbonAiWire: pageWire('carbon-ai.html'),
        largestImage: images.reduce((n, f) => Math.max(n, sizeOf(f) || 0), 0),
        allImages: images.reduce((n, f) => n + (sizeOf(f) || 0), 0),
        introAudio: audio.reduce((n, f) => n + (sizeOf(f) || 0), 0),
        // Uncompressed, because that is the number the footer quotes and the one a
        // reader can verify by saving the page.
        fieldReport: sizeOf('field-report.html'),
        fieldReportWire: pageWire('field-report.html'),
        // Not a budget: the README's on-demand table, row by row.
        modules: moduleRows(onDemand),
        // Nor this: the core script as the README's summary of it quotes it.
        core: sizeOf('script.js') === null ? null : { raw: sizeOf('script.js'), wire: gzipOf('script.js') }
    };
    const largest = images.map(f => ({ f, size: sizeOf(f) || 0 })).sort((a, b) => b.size - a.size)[0] || null;
    return { measured, critical, onDemand, largest };
}

// ------------------------------------------------------------------
// Every budget as data: what it measures, its ceiling, the headroom
// between them, and what it could come down to. The report, the README's
// tables, the ratchet and the pull-request receipt (scripts/receipt.js)
// all read this one object, so they cannot disagree about a number.
// ------------------------------------------------------------------
const SCHEMA = 1;
const round2 = (n) => Math.round(n * 100) / 100;

// The lengths smoke.js wrote, checked for shape so a file from anything
// else is refused rather than read as a page of zeros.
function readLengths(file) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || data.schema !== SCHEMA || !data.pages || typeof data.pages !== 'object') {
        throw new Error(`${file} is not a length measurement from scripts/smoke.js (schema ${SCHEMA})`);
    }
    return data;
}

// Whose ceilings. Another checkout (--root) is measured by this script, so
// the receipt compares two sites and not two methods, but the ceilings it
// reports are that checkout's own, from its copy of this script. Read from
// this one, main's ceilings were always the branch's, and a pull request
// that moved a ceiling, down or up, showed no sign of it in its receipt.
// A copy that is missing or will not load leaves this script's (nothing is
// shown to have moved); a budget its copy lacks has no ceiling there.
function ceilingsOf(root) {
    const own = { BUDGETS, LENGTH };
    const file = path.join(root, 'scripts', 'check-budget.js');
    if (path.resolve(file) === __filename || !fs.existsSync(file)) return own;
    try {
        const theirs = require(file);
        return theirs && theirs.BUDGETS ? { BUDGETS: theirs.BUDGETS, LENGTH: theirs.LENGTH || {} } : own;
    } catch (e) {
        return own;
    }
}

function budgetJson(measured, lengths = null, ceilings = { BUDGETS, LENGTH }) {
    const pageOf = Object.fromEntries(Object.entries(PAGE_BUDGETS).map(([page, key]) => [key, page]));
    const maxOf = (b) => (b && typeof b.max === 'number' ? b.max : null);
    const bytes = {};
    Object.entries(BUDGETS).forEach(([key, b]) => {
        const m = typeof measured[key] === 'number' ? measured[key] : null;
        const max = maxOf(ceilings.BUDGETS[key]);
        bytes[key] = {
            label: b.label,
            readme: b.readme,
            page: pageOf[key] || null,
            unit: 'bytes',
            measured: m,
            ceiling: max,
            headroom: m === null || max === null ? null : max - m,
            hold: b.hold || null,
            couldLowerTo: couldLowerTo(m, max, 'bytes', b.hold)
        };
    });
    // A budget only the other checkout has: its ceiling, unmeasured, as
    // this script no longer knows what it weighed.
    Object.entries(ceilings.BUDGETS).forEach(([key, b]) => {
        if (bytes[key]) return;
        bytes[key] = { label: b.label || key, readme: b.readme || b.label || key, page: null, unit: 'bytes', measured: null, ceiling: maxOf(b), headroom: null, hold: b.hold || null, couldLowerTo: null };
    });
    const length = {};
    const pages = Object.keys(LENGTH).concat(Object.keys(ceilings.LENGTH).filter(p => !LENGTH[p]));
    pages.forEach((page) => {
        length[page] = {};
        Object.keys(VIEWPORTS).forEach((vp) => {
            const m = lengths && lengths.pages[page] ? heldLength(lengths.pages[page][vp]) : null;
            const c = ceilings.LENGTH[page] && typeof ceilings.LENGTH[page][vp] === 'number' ? ceilings.LENGTH[page][vp] : null;
            length[page][vp] = {
                unit: 'screens',
                measured: m,
                ceiling: c,
                headroom: m === null || c === null ? null : round2(c - m),
                couldLowerTo: couldLowerTo(m, c, 'screens')
            };
        });
    });
    return { schema: SCHEMA, viewports: VIEWPORTS, bytes, length, modules: measured.modules || null, core: measured.core || null };
}

// A ceiling as a person writes it: 300 KB, 3.5 MB.
const fmtCeiling = (bytes) => (bytes >= MB ? `${+(bytes / MB).toFixed(2)} MB` : `${+(bytes / KB).toFixed(1)} KB`);
// A measurement as the README quotes it: ~274 KB, ~3.36 MB, 0 KB.
const fmtApprox = (bytes) => (bytes === null ? 'missing' : bytes === 0 ? '0 KB' : `~${fmt(bytes)}`);

function hints(json) {
    const out = [];
    Object.values(json.bytes).forEach((b) => {
        if (b.couldLowerTo !== null) out.push(`you could lower ${b.readme} from ${fmtCeiling(b.ceiling)} to ${fmtCeiling(b.couldLowerTo)}`);
    });
    Object.entries(json.length).forEach(([page, vps]) => Object.entries(vps).forEach(([vp, l]) => {
        if (l.couldLowerTo !== null) out.push(`you could lower the length of ${page} at ${vp} from ${l.ceiling} to ${l.couldLowerTo} screens`);
    }));
    return out;
}

// ------------------------------------------------------------------
// The README's budget tables and its table of on-demand files, between
// markers, written from the object above. tests/budget.test.js fails while
// what the README says differs from what this writes, and so does the
// report below.
// ------------------------------------------------------------------
const README_TABLES = {
    bytes: ['<!-- BUDGET-TABLE:START — generated by scripts/check-budget.js (npm run budget -- --readme). Do not edit by hand. -->', '<!-- BUDGET-TABLE:END -->'],
    length: ['<!-- LENGTH-TABLE:START — generated by scripts/check-budget.js (npm run budget -- --readme). Do not edit by hand. -->', '<!-- LENGTH-TABLE:END -->'],
    modules: ['<!-- MODULE-TABLE:START — generated by scripts/check-budget.js (npm run budget -- --readme). Do not edit by hand. -->', '<!-- MODULE-TABLE:END -->']
};
// Prose that quotes a figure, kept true the same way: the first view's
// ceiling, and the core script's weight on disk and gzipped (typed by
// hand, it still said 72 KB after script.js had passed 72.5).
const README_QUOTES = [
    { what: 'the first view\'s ceiling', re: /(against a )\d+( KB ceiling)/, value: (json) => json.bytes.criticalWire.ceiling },
    { what: 'script.js on disk', re: /(A )\d+( KB core \(`script\.js`, )/, value: (json) => json.core && json.core.raw },
    { what: 'script.js gzipped', re: /(\(`script\.js`, )\d+( KB gzipped\))/, value: (json) => json.core && json.core.wire }
];

function readmeTables(json) {
    const bytes = ['| Budget | Measured | Ceiling |', '|---|---|---|']
        .concat(Object.values(json.bytes).map(b => `| ${b.readme} | ${fmtApprox(b.measured)} | ${fmtCeiling(b.ceiling)} |`));
    const vps = Object.entries(json.viewports);
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    const length = [`| Page | ${vps.map(([, v]) => `${cap(v.label)}, ${v.width}×${v.height}`).join(' | ')} |`, `|---|${vps.map(() => '---|').join('')}`]
        .concat(Object.entries(json.length).map(([page, l]) => `| \`${page}\` | ${vps.map(([vp]) => `${l[vp].ceiling} screens`).join(' | ')} |`));
    const m = json.modules;
    if (!m) throw new Error('the on-demand files were not measured, so the modules table cannot be written');
    if (m.unlisted.length) throw new Error(`${m.unlisted.join(', ')} ${m.unlisted.length > 1 ? 'are' : 'is'} fetched on demand but in no row of MODULE_TABLE in check-budget.js`);
    if (m.twice.length) throw new Error(`${m.twice.join(', ')} ${m.twice.length > 1 ? 'are' : 'is'} in more than one row of MODULE_TABLE in check-budget.js`);
    const kb = (b) => (b === null ? 'missing' : b < KB / 2 ? '<1 KB' : `~${fmt(b)}`);
    const modules = ['| Module | Loads when | Gzipped |', '|---|---|---|']
        .concat(m.rows.map(r => `| ${r.module} | ${r.when} | ${kb(r.measured)} |`));
    return { bytes: bytes.join('\n'), length: length.join('\n'), modules: modules.join('\n') };
}

function renderReadme(text, json) {
    const tables = readmeTables(json);
    let out = text;
    Object.entries(README_TABLES).forEach(([which, [start, end]]) => {
        const a = out.indexOf(start);
        const b = out.indexOf(end);
        if (a === -1 || b < a) throw new Error(`README.md is missing the ${start.slice(5, start.indexOf(':'))} markers`);
        out = out.slice(0, a + start.length) + '\n' + tables[which] + '\n' + out.slice(b);
    });
    README_QUOTES.forEach(({ what, re, value }) => {
        if (!re.test(out)) throw new Error(`README.md no longer quotes ${what} where ${re} expects it`);
        if (typeof value(json) !== 'number') throw new Error(`${what} was not measured, so the README cannot quote it`);
        // Rounded as the report prints it ("73 KB on disk → 24 KB gzipped").
        out = out.replace(re, `$1${(value(json) / KB).toFixed(0)}$2`);
    });
    return out;
}

const readmePath = () => path.join(ROOT, 'README.md');
const readmeIsCurrent = (json) => {
    const text = fs.readFileSync(readmePath(), 'utf8');
    return renderReadme(text, json) === text;
};

// ------------------------------------------------------------------
// The ratchet. It rewrites this file's own source, each BUDGETS `max:`
// and each LENGTH ceiling, to what the measurement earns, and only where
// that is lower. Pure, so tests/budget.test.js can run it on any
// measurement without touching the file; `--ratchet` loads the result as
// a module and checks it before writing it back.
// ------------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ratchetSource(source, json) {
    let out = source;
    const changes = [];
    Object.entries(json.bytes).forEach(([key, b]) => {
        if (b.hold || b.measured === null) return;
        const to = ratchetTarget(b.measured, 'bytes');
        if (to >= b.ceiling) return;
        const re = new RegExp(`(\\n {4}${escapeRe(key)}: \\{[^]*?\\n {8}max: )([^,\\n]+)`);
        if (!re.test(out)) throw new Error(`cannot find the ceiling of ${key} in check-budget.js`);
        out = out.replace(re, `$1${to / KB} * KB`);
        changes.push({ kind: 'bytes', key, name: b.readme, from: b.ceiling, to });
    });
    Object.entries(json.length).forEach(([page, vps]) => Object.entries(vps).forEach(([vp, l]) => {
        if (l.measured === null) return;
        const to = ratchetTarget(l.measured, 'screens');
        if (to >= l.ceiling) return;
        const re = new RegExp(`(\\n {4}'${escapeRe(page)}': \\{[^}\\n]*'${escapeRe(vp)}': )([\\d.]+)`);
        if (!re.test(out)) throw new Error(`cannot find the length ceiling of ${page} at ${vp} in check-budget.js`);
        out = out.replace(re, `$1${to}`);
        changes.push({ kind: 'length', page, vp, name: `${page} at ${vp}`, from: l.ceiling, to });
    }));
    return { source: out, changes };
}

// Load a rewritten check-budget.js as a module, from a copy, without
// running it (require.main is not the copy).
function loadSource(source) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mks-budget-'));
    const file = path.join(dir, 'check-budget.js');
    try {
        fs.writeFileSync(file, source);
        return require(file);
    } finally {
        delete require.cache[file];
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function ratchet(json) {
    const before = fs.readFileSync(__filename, 'utf8');
    const { source, changes } = ratchetSource(before, json);
    if (Object.values(json.length).every(vps => Object.values(vps).every(l => l.measured === null))) {
        console.log('\n  Lengths not measured, so their ceilings stay: run `npm run smoke` and pass --lengths .smoke/length.json.');
    }
    if (!changes.length) {
        console.log('\n  Nothing to lower: every ceiling is within 5% (or the floor) of what it holds.\n');
        return;
    }
    // Every ceiling as the new source states it: the ones changed exactly
    // as meant, and none of them above where it was.
    const next = loadSource(source);
    const wrong = [];
    Object.entries(BUDGETS).forEach(([key, b]) => {
        const c = changes.find(x => x.kind === 'bytes' && x.key === key);
        const want = c ? c.to : b.max;
        if (!next.BUDGETS[key] || next.BUDGETS[key].max !== want) wrong.push(`${key}: ${next.BUDGETS[key] && next.BUDGETS[key].max}, not ${want}`);
    });
    Object.entries(LENGTH).forEach(([page, vps]) => Object.entries(vps).forEach(([vp, was]) => {
        const c = changes.find(x => x.kind === 'length' && x.page === page && x.vp === vp);
        const want = c ? c.to : was;
        if (!next.LENGTH[page] || next.LENGTH[page][vp] !== want) wrong.push(`${page} ${vp}: ${next.LENGTH[page] && next.LENGTH[page][vp]}, not ${want}`);
    }));
    if (wrong.length) throw new Error(`the rewritten check-budget.js would not say what was meant (${wrong.join('; ')}); nothing was written`);

    fs.writeFileSync(__filename, source);
    console.log('\n  Ceilings lowered in scripts/check-budget.js:\n');
    changes.forEach((c) => {
        const show = c.kind === 'bytes' ? fmtCeiling : (n) => `${n} screens`;
        console.log(`    · ${c.name}: ${show(c.from)} → ${show(c.to)}`);
    });
    // The README quotes the ceilings, so it is rewritten from the new file.
    execFileSync(process.execPath, [__filename, '--readme'], { stdio: 'inherit' });
    console.log('  Commit scripts/check-budget.js and README.md together.\n');
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------
function report() {
    const { measured, critical, onDemand, largest } = measure();
    const lengthsFile = option('--lengths');
    const lengths = lengthsFile ? readLengths(lengthsFile) : null;
    const json = budgetJson(measured, lengths);

    // Data, not a verdict: it exits 0 even over a ceiling, because the
    // receipt measures main with it, and main may be over a ceiling the
    // pull request sets.
    if (flag('--json')) {
        console.log(JSON.stringify(option('--root') ? budgetJson(measured, lengths, ceilingsOf(ROOT)) : json, null, 2));
        return;
    }
    if (flag('--readme')) {
        const text = fs.readFileSync(readmePath(), 'utf8');
        const next = renderReadme(text, json);
        if (next === text) console.log('\n  README.md: the budget tables are already current.\n');
        else { fs.writeFileSync(readmePath(), next); console.log('\n  README.md: budget tables rewritten.\n'); }
        return;
    }
    if (flag('--ratchet')) {
        if (option('--root')) throw new Error('--ratchet lowers this checkout\'s own ceilings; it cannot take --root');
        ratchet(json);
        return;
    }

    const line = ({ rel, raw, wire }) => {
        const note = isText(rel) ? `${fmt(raw)} on disk → ${fmt(wire)} gzipped` : `${fmt(wire)}`;
        console.log(`    ${rel.padEnd(40)} ${note}`);
    };

    console.log('\n  First view, asset by asset:\n');
    critical.slice().sort((a, b) => b.wire - a.wire).forEach(line);

    console.log('\n  On demand, only when a feature is used:\n');
    onDemand.slice().sort((a, b) => b.wire - a.wire).forEach(line);

    console.log('\n  Budgets:\n');

    let over = 0;
    Object.entries(BUDGETS).forEach(([key, budget]) => {
        const value = measured[key];
        if (typeof value !== 'number') {
            over++;
            console.log(`    ✗ ${budget.label}`);
            console.log('      not measured: the file it weighs is missing');
            return;
        }
        const pct = Math.round((value / budget.max) * 100);
        const ok = value <= budget.max;
        if (!ok) over++;
        console.log(`    ${ok ? '·' : '✗'} ${budget.label}`);
        console.log(`      ${fmt(value)} of ${fmt(budget.max)} (${pct}%)`);
    });

    if (largest) console.log(`\n  Heaviest image: ${largest.f} (${fmt(largest.size)})`);

    // Lengths are measured by `npm run smoke`; here only when handed its file.
    console.log(`\n  Length, in screens (page height ÷ window height)${lengths ? '' : ' — ceilings; `npm run smoke` measures them'}:\n`);
    Object.entries(json.length).forEach(([page, vps]) => {
        const cells = Object.entries(vps).map(([vp, l]) => {
            if (l.measured === null) return `${vp} ≤ ${l.ceiling.toFixed(2)}`;
            if (l.measured > l.ceiling) over++;
            return `${vp} ${l.measured.toFixed(2)} of ${l.ceiling.toFixed(2)}${l.measured > l.ceiling ? ' ✗' : ''}`;
        });
        console.log(`    ${page.padEnd(20)} ${cells.join('   ')}`);
    });

    const could = hints(json);
    if (could.length) {
        console.log('\n  More than 10% headroom (`npm run budget -- --ratchet` lowers them all):\n');
        could.forEach(h => console.log(`    · ${h}`));
    }

    let stale = null;
    try { if (!readmeIsCurrent(json)) stale = 'its budget tables are out of date'; } catch (e) { stale = e.message; }
    if (stale) {
        console.error(`\n  README.md: ${stale}.`);
        console.error('  Run `npm run budget -- --readme` and commit README.md with the change.');
    }
    if (over) {
        console.error(`\n  ${over} budget(s) exceeded.`);
        console.error('  Bring the weight or the length back down: remove something of equal');
        console.error('  weight rather than raise a ceiling (docs/plan.md, "Stop doing").');
    }
    if (stale || over) {
        console.error('');
        process.exit(1);
    }

    console.log('\n  All budgets met, and the README says so.\n');
}

if (require.main === module) {
    try { report(); } catch (e) { console.error(`\n  check-budget: ${e.message}\n`); process.exit(1); }
}

module.exports = {
    BUDGETS, PAGE_BUDGETS, LENGTH, VIEWPORTS, RATCHET, SCHEMA, README_TABLES, MODULE_TABLE,
    measure, criticalAssets, onDemandAssets, moduleRows,
    budgetJson, ceilingsOf, readLengths, heldLength, hints, ratchetTarget, couldLowerTo, ratchetSource, loadSource,
    readmeTables, renderReadme, fmtCeiling
};
