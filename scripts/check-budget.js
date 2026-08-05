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
//     npm run budget
//
// WHAT "WIRE WEIGHT" MEANS. GitHub Pages compresses text responses, so the
// bytes a visitor downloads for HTML/CSS/JS are the gzipped bytes, not the
// bytes on disk. Images are already compressed and are counted as-is. This
// is an estimate — the real figure depends on the CDN's encoder, and brotli
// does better than the gzip used here — but it is a conservative one, and it
// is measured rather than asserted.
//
// FIRST-PARTY ONLY. Every figure below counts files in this repository. The
// pages also pull a stylesheet and font files from Google Fonts, and those
// bytes cannot be measured from here: the size depends on the browser, since
// the stylesheet serves different woff2 subsets per unicode-range. Calling
// the total "what a visitor transfers" while silently dropping a
// render-blocking third-party request would be the same kind of unenforced
// claim this script exists to remove, so the labels say "first-party" and
// the third-party origins are listed separately and counted.
//
// The origins ARE budgeted, by number: adding a new third-party host fails
// this check. That is the part worth enforcing — the bytes of any single
// font file matter far less than a page quietly acquiring another origin.
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
// Budgets. Each carries roughly 15–30% headroom over the current figure, so
// ordinary edits do not trip it but a new hero image or an unoptimised
// screenshot does. Raising one is a deliberate act: update the README in the
// same commit, because the README quotes these.
// ------------------------------------------------------------------
// Third-party origins the pages are allowed to reach. Everything here is a
// deliberate decision that predates this script; the budget's job is to stop
// another one appearing without anybody noticing.
const ALLOWED_THIRD_PARTY = [
    'fonts.googleapis.com',   // the webfont stylesheet (render-blocking)
    'fonts.gstatic.com'       // the woff2 files it references
];

const BUDGETS = {
    criticalWire: {
        label: 'First view, first-party bytes over the wire (HTML + CSS + JS gzipped, plus eagerly-loaded images)',
        max: 300 * KB,
        readme: 'the number the README quotes for a first visit — first-party only; see thirdPartyOrigins'
    },
    thirdPartyOrigins: {
        label: 'Distinct third-party origins a page requests',
        max: ALLOWED_THIRD_PARTY.length,
        unit: 'count',
        readme: 'font hosts only. Their bytes are not measurable from here, so the count is what is held.'
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
    allAudio: {
        label: 'Every narration track (only if someone played all of them)',
        max: 4.5 * MB,
        readme: 'nothing here is fetched until a visitor presses play'
    },
    fieldReport: {
        label: 'Text-only field report, whole page',
        max: 12 * KB,
        readme: 'the footer calls it "the whole portfolio in 8 KB" — this is what keeps that true'
    },
    // The generated pages carry no images and no framework, so they should
    // stay small. A budget here is what stops "just one more section" turning
    // the evidence pages into the thing they were built to argue against.
    caseStudiesWire: {
        label: 'Case studies page, first-party bytes over the wire',
        max: 40 * KB,
        readme: 'generated from content/projects.json — text only, no images'
    },
    researchWire: {
        label: 'Research outputs page, first-party bytes over the wire',
        max: 30 * KB,
        readme: 'generated from content/research.json — text only, no images'
    }
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

// ------------------------------------------------------------------
// What the first view actually costs.
//
// Derived from index.html rather than hardcoded, so adding a stylesheet or
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
    (html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || []).forEach((tag) => {
        const m = tag.match(/href=["']([^"']+)["']/i);
        if (m) add(m[1]);
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

    // An <img> without loading="lazy" is fetched during the first view.
    // The lightbox's empty <img src=""> is not a request, so it is skipped
    // by the sizeOf() check above.
    (html.match(/<img[^>]*>/gi) || []).forEach((tag) => {
        if (/loading=["']lazy["']/i.test(tag)) return;
        const m = tag.match(/src=["']([^"']+)["']/i);
        if (m) add(m[1]);
    });

    return assets;
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

const allFiles = walk(ROOT, []);
const images = allFiles.filter(isImage);
const audio = allFiles.filter(f => /\.(mp3|opus|wav|m4a)$/i.test(f));

const critical = criticalAssets().map((rel) => {
    const raw = sizeOf(rel);
    const wire = isText(rel) ? gzipOf(rel) : raw;
    return { rel, raw, wire };
});

const pageWire = (page) => criticalAssets(page).reduce((n, rel) => {
    const raw = sizeOf(rel);
    return n + (isText(rel) ? gzipOf(rel) : raw);
}, 0);

/**
 * Every off-site origin a page asks the browser to contact during a first
 * view: stylesheets, scripts, preconnects and eager images. Plain <a href>
 * links are excluded — following one is the visitor's choice, not a request
 * the page makes on its own.
 */
// The site's own host. An absolute self-reference is not a third party, and
// canonical/og URLs are written absolute by necessity.
const OWN_HOST = 'moseskolleh.github.io';

// <link> rels that actually cause the browser to reach out. `canonical` and
// `alternate` are metadata — they name a URL, they do not fetch it — and
// counting them was this function's first bug.
const FETCHING_REL = ['stylesheet', 'preload', 'prefetch', 'preconnect', 'dns-prefetch', 'icon', 'shortcut icon', 'apple-touch-icon', 'manifest', 'modulepreload'];

function thirdPartyOrigins(page) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const origins = new Set();

    const tags = html.match(/<(?:link|script|img|iframe|source|video|audio)\b[^>]*>/gi) || [];
    tags.forEach((tag) => {
        if (/^<link\b/i.test(tag)) {
            const rel = (tag.match(/\brel=["']([^"']+)["']/i) || [, ''])[1].toLowerCase().trim();
            if (!FETCHING_REL.includes(rel)) return;
        }
        const m = tag.match(/(?:href|src)=["']([^"']+)["']/i);
        if (!m) return;
        const url = m[1];
        if (!/^(https?:)?\/\//i.test(url)) return;
        try {
            const host = new URL(url.startsWith('//') ? `https:${url}` : url).host;
            if (host !== OWN_HOST) origins.add(host);
        } catch (e) { /* not a URL we can attribute */ }
    });

    return [...origins].sort();
}

/**
 * Origins present that nobody approved.
 *
 * Counting origins was not enough on its own: swap an allowed host for an
 * unapproved one and the count stays at the ceiling, so the numeric budget
 * passes. The identities have to be checked, not just how many there are —
 * and the result has to reach the exit code, which is the half this
 * originally got wrong.
 */
function unexpected(origins, allowed = ALLOWED_THIRD_PARTY) {
    return origins.filter(o => !allowed.includes(o));
}

const BUDGETED_PAGES = ['index.html', 'case-studies.html', 'research.html', 'field-report.html', 'carbon-ai.html'];
const originsByPage = BUDGETED_PAGES.map(p => ({ page: p, origins: thirdPartyOrigins(p) }));
const allOrigins = [...new Set(originsByPage.flatMap(o => o.origins))].sort();
const unexpectedOrigins = unexpected(allOrigins);

const measured = {
    criticalWire: critical.reduce((n, a) => n + a.wire, 0),
    caseStudiesWire: pageWire('case-studies.html'),
    researchWire: pageWire('research.html'),
    thirdPartyOrigins: allOrigins.length,
    largestImage: images.reduce((n, f) => Math.max(n, sizeOf(f) || 0), 0),
    allImages: images.reduce((n, f) => n + (sizeOf(f) || 0), 0),
    allAudio: audio.reduce((n, f) => n + (sizeOf(f) || 0), 0),
    // Uncompressed, because that is the number the footer quotes and the one a
    // reader can verify by saving the page.
    fieldReport: sizeOf('field-report.html') || 0
};

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------
// Reporting and the exit code only happen when this is run as a command.
// Importing it (from tests/portfolio.test.js) must not print or exit.
if (require.main === module) {

console.log('\n  First view, asset by asset:\n');
critical
    .slice()
    .sort((a, b) => b.wire - a.wire)
    .forEach(({ rel, raw, wire }) => {
        const note = isText(rel) ? `${fmt(raw)} on disk → ${fmt(wire)} gzipped` : `${fmt(wire)}`;
        console.log(`    ${rel.padEnd(34)} ${note}`);
    });

console.log('\n  Budgets:\n');

let over = 0;
Object.entries(BUDGETS).forEach(([key, budget]) => {
    const value = measured[key];
    const pct = Math.round((value / budget.max) * 100);
    const ok = value <= budget.max;
    if (!ok) over++;
    const show = budget.unit === 'count' ? (n) => String(n) : fmt;
    console.log(`    ${ok ? '·' : '✗'} ${budget.label}`);
    console.log(`      ${show(value)} of ${show(budget.max)} (${pct}%)`);
});

// Named, not just counted — a reader should be able to see which third
// parties the page reaches for without opening devtools.
console.log('\n  Third-party origins requested during a first view:\n');
if (!allOrigins.length) {
    console.log('    none — every byte comes from this repository');
} else {
    allOrigins.forEach((origin) => {
        const pages = originsByPage.filter(o => o.origins.includes(origin)).map(o => o.page);
        const known = ALLOWED_THIRD_PARTY.includes(origin);
        console.log(`    ${known ? '·' : '✗'} ${origin.padEnd(24)} on ${pages.length} page(s)`);
    });
    console.log('\n    These bytes are NOT in the totals above and cannot be measured from here:');
    console.log('    the font stylesheet serves different woff2 subsets per browser. Typically a few');
    console.log('    tens of KB on a first visit, then cached. Removing the webfonts would remove');
    console.log('    the uncertainty along with them.');
}

// This has to count towards the failure, not merely print. Without it, an
// unapproved origin that *replaced* an approved one kept the count inside its
// ceiling, and the script reported "All budgets met" and exited 0 — enforcing
// nothing while claiming to enforce it.
if (unexpectedOrigins.length) {
    over++;
    console.error(`\n  ✗ unapproved third-party origin(s): ${unexpectedOrigins.join(', ')}`);
    console.error('    Add to ALLOWED_THIRD_PARTY in scripts/check-budget.js if this is intended.');
}

const largest = images
    .map(f => ({ f, size: sizeOf(f) || 0 }))
    .sort((a, b) => b.size - a.size)[0];
if (largest) console.log(`\n  Heaviest image: ${largest.f} (${fmt(largest.size)})`);

if (over) {
    console.error(`\n  ${over} budget(s) exceeded.`);
    console.error('  Either bring the weight back down, or raise the budget in');
    console.error('  scripts/check-budget.js AND update the figure the README quotes.\n');
    process.exit(1);
}

console.log('\n  All budgets met.\n');

}

module.exports = { BUDGETS, ALLOWED_THIRD_PARTY, measured, unexpected, thirdPartyOrigins };
