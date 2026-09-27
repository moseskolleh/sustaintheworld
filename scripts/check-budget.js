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
//     npm run budget            the report
//     npm run budget -- --json  the measurements, for other scripts
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

const ROOT = path.join(__dirname, '..');
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
// (docs/plan.md, "Stop doing"). When a ceiling does change, the README
// quotes these, so update it in the same commit.
// ------------------------------------------------------------------
const BUDGETS = {
    criticalWire: {
        label: 'First view of the homepage, over the wire (HTML + CSS + JS gzipped, the fonts, and eagerly-loaded images)',
        max: 300 * KB,
        readme: 'the number the README quotes for a first visit'
    },
    // What a visit fetches after arriving, if it uses everything: the
    // on-demand modules, the narration scripts and AI data behind them, the
    // journey map, the narration manifest. Bounded so "on demand" cannot
    // become the place where weight goes to hide.
    onDemand: {
        label: 'Everything a full visit adds on demand (modules, scripts, map — gzipped)',
        max: 72 * KB,
        readme: 'fetched one feature at a time, only when that feature is used'
    },
    largestImage: {
        label: 'Largest single image',
        max: 220 * KB,
        readme: 'no single image may dominate a gallery open'
    },
    allImages: {
        label: 'Every image in the repository',
        max: 3.5 * MB,
        readme: 'the full gallery, only reached by opening every project'
    },
    // The only audio the site ships is Moses's own recorded introduction:
    // one 60–90 s take, and 90 s of mono MP3 at 64 kbps is about 720 KB.
    // Every audio file in the repository counts against it, so the ten
    // stock-voice section tracks this replaced (4.13 MB, retired with their
    // 4.5 MB budget) cannot drift back in unbudgeted. 0 KB until he records.
    introAudio: {
        label: "Recorded narration: Moses's introduction, the one audio file the site ships",
        max: 800 * KB,
        readme: 'fetched only when a visitor asks to hear him'
    },
    fieldReport: {
        label: 'Text-only field report, the HTML file as saved (uncompressed)',
        max: 12 * KB,
        readme: 'the footer calls it "the whole portfolio in 9 KB" — this is what keeps that true'
    },
    // The same page as a visit costs it: its HTML gzipped, the visit counter
    // (the one script it loads) and its icon. The footer's figure above is
    // the file a reader can save; this is what reaching it transfers.
    fieldReportWire: {
        label: 'Text-only field report, over the wire (with its visit counter)',
        max: 8 * KB,
        readme: 'a first view like the other pages, counter included'
    },
    // The generated pages carry no images and no framework, so they should
    // stay small. A budget here is what stops "just one more section" turning
    // the evidence pages into the thing they were built to argue against.
    caseStudiesWire: {
        label: 'Case studies page, over the wire (with fonts)',
        max: 120 * KB,
        readme: 'generated from content/projects.json — text only, no images'
    },
    // Sized for the page once it is full, not for today's empty state (about
    // 88 KB), so the weekly Action cannot turn red just because counting
    // started: twelve weeks of lines, fifteen referrers and every feature the
    // site names came to about 90 KB from a fixture.
    statsWire: {
        label: 'Open counts page, over the wire (with fonts)',
        max: 105 * KB,
        readme: 'generated from content/stats.json — text only, no images'
    },
    researchWire: {
        label: 'Research outputs page, over the wire (with fonts)',
        max: 110 * KB,
        readme: 'generated from content/research.json — text only, no images'
    },
    // "AI, Weighed" carries its calculator and the emission-factor data on
    // arrival, so it is the heaviest page after the homepage and it went
    // unbudgeted until a real browser measured it at 106 KB. The ceiling is
    // that measurement plus 5%, not the usual headroom: budgets only ratchet
    // down, and this one starts where the page already is.
    carbonAiWire: {
        label: 'AI, Weighed (carbon-ai.html), over the wire (with fonts)',
        max: 111 * KB,
        readme: 'the calculator and its emission-factor data arrive with the page'
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
    // The lightbox's <img> has no src until an image is opened, so it adds
    // nothing.
    (html.match(/<img[^>]*>/gi) || []).forEach((tag) => {
        if (/loading=["']lazy["']/i.test(tag)) return;
        const m = tag.match(/src=["']([^"']+)["']/i);
        if (m) add(m[1]);
    });

    return assets;
}

// What script.js fetches later, feature by feature. The module list is read
// from the directory, so a new module — or a module's stylesheet — is
// counted the moment it exists.
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
    const pageWire = (page) => criticalAssets(page).reduce((n, rel) => n + wireOf(rel), 0);

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
        fieldReport: sizeOf('field-report.html') || 0,
        fieldReportWire: pageWire('field-report.html')
    };
    const largest = images.map(f => ({ f, size: sizeOf(f) || 0 })).sort((a, b) => b.size - a.size)[0] || null;
    return { measured, critical, onDemand, largest };
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------
function report() {
    const { measured, critical, onDemand, largest } = measure();

    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(measured));
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
        const pct = Math.round((value / budget.max) * 100);
        const ok = value <= budget.max;
        if (!ok) over++;
        console.log(`    ${ok ? '·' : '✗'} ${budget.label}`);
        console.log(`      ${fmt(value)} of ${fmt(budget.max)} (${pct}%)`);
    });

    if (largest) console.log(`\n  Heaviest image: ${largest.f} (${fmt(largest.size)})`);

    if (over) {
        console.error(`\n  ${over} budget(s) exceeded.`);
        console.error('  Either bring the weight back down, or raise the budget in');
        console.error('  scripts/check-budget.js AND update the figure the README quotes.\n');
        process.exit(1);
    }

    console.log('\n  All budgets met.\n');
}

if (require.main === module) report();

module.exports = { BUDGETS, PAGE_BUDGETS, measure, criticalAssets, onDemandAssets };
