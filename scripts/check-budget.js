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
const BUDGETS = {
    criticalWire: {
        label: 'First view, over the wire (HTML + CSS + JS gzipped, plus eagerly-loaded images)',
        max: 300 * KB,
        readme: 'the number the README quotes for a first visit'
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
function criticalAssets() {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const assets = ['index.html'];
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

const measured = {
    criticalWire: critical.reduce((n, a) => n + a.wire, 0),
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
    console.log(`    ${ok ? '·' : '✗'} ${budget.label}`);
    console.log(`      ${fmt(value)} of ${fmt(budget.max)} (${pct}%)`);
});

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

module.exports = { BUDGETS, measured };
