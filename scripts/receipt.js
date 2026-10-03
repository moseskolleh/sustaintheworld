#!/usr/bin/env node
// ===================================================================
// RECEIPT — what a pull request changes in weight, carbon and length
//
//     node scripts/receipt.js --head head.json [--base base.json]
//         [--head-length head-length.json] [--base-length base-length.json]
//         [--base-label main] [--head-label "This PR"]
//         [--base-sha abc1234] [--head-sha def5678]
//
// The budget files are `npm run budget -- --json` on each side (main's
// with --root, which reports main's own ceilings beside the branch's
// measure of main); the length files are what `npm run smoke --
// --lengths-only` wrote on each side. The
// Markdown goes to stdout. .github/workflows/receipt.yml measures main and
// the pull request with the pull request's own scripts and posts this as
// one comment, which it finds again by the marker on the first line and
// edits in place on every push, so a pull request carries one receipt, not
// one per commit.
//
// The carbon figure is the one the footer badge uses: bytes transferred
// times the Sustainable Web Design constant, 0.36 g CO₂e per MB (one copy,
// in scripts/lib/voice-signature.js), for a first view with nothing cached.
// It counts network transfer only, not the reader's device, and it is an
// estimate; the receipt says both wherever it shows the figure.
// ===================================================================

const fs = require('fs');
const { GRAMS_PER_MB, grams } = require('./lib/voice-signature.js');
const { couldLowerTo, heldLength, fmtCeiling } = require('./check-budget.js');

const KB = 1024;
const MB = 1024 * 1024;
const MARKER = '<!-- carbon-receipt: written by scripts/receipt.js; the workflow edits this comment in place -->';
const MINUS = '−';

// ------------------------------------------------------------------
// Formatting. Every change carries its sign, a fall as a true minus.
// ------------------------------------------------------------------
const signed = (n, format) => (n === 0 ? '0' : `${n > 0 ? '+' : MINUS}${format(Math.abs(n))}`);
const fmtBytes = (b) => (b === 0 ? '0 KB' : b >= MB ? `${(b / MB).toFixed(2)} MB` : `${(b / KB).toFixed(1)} KB`);
// Small changes in bytes, so a 300-byte change does not read as "0.3 KB".
const fmtByteChange = (b) => (b < 10 * KB ? `${b.toLocaleString('en-US')} B` : fmtBytes(b));
const mgOf = (bytes) => grams(bytes) * 1000;
const fmtMg = (mg) => `${mg.toFixed(1)} mg`;
// A change too small to show at one decimal still is one: "+<0.1 mg".
const fmtMgChange = (mg) => (mg < 0.05 ? '<0.1 mg' : fmtMg(mg));
const fmtScreens = (n) => n.toFixed(2);
const size = (vp, json) => {
    const v = json && json.viewports && json.viewports[vp];
    return v ? `${v.width}×${v.height}` : vp.replace('x', '×');
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cell = (v, format) => (v === null ? '—' : format(v));
const change = (from, to, format) => (from === null || to === null ? '—' : signed(to - from, format));

// A page's length on one side, from smoke's file where there is one, else
// from the budget file (which carries it only when given --lengths).
function lengthOf(lengthFile, budget, page, vp) {
    const m = lengthFile && lengthFile.pages && lengthFile.pages[page] ? lengthFile.pages[page][vp] : null;
    if (m && typeof m.screens === 'number') return m;
    const b = budget && budget.length && budget.length[page] ? budget.length[page][vp] : null;
    return b && typeof b.measured === 'number' ? { screens: b.measured } : null;
}

const union = (...lists) => lists.flat().filter((k, i, all) => all.indexOf(k) === i);

// A ceiling where main's differs: what main's was, or that main had none.
// Each side reports its own (check-budget.js reads main's from main's copy
// of it), so a pull request that moves a ceiling, either way, shows it.
// Nothing is said when main was not measured.
const moved = (was, now, format) => (was === undefined || was === now ? ''
    : num(was) === null ? ' (new)' : ` (was ${format(was)})`);

// ------------------------------------------------------------------
// The receipt
// ------------------------------------------------------------------
function receipt({ base = null, head, baseLength = null, headLength = null, baseLabel = 'main', headLabel = 'This PR', baseSha = '', headSha = '' }) {
    if (!head || !head.bytes) throw new Error('the head budget file is missing or not `npm run budget -- --json` output');
    const baseBytes = (base && base.bytes) || {};
    const out = [MARKER, '### Carbon receipt', ''];
    const at = (label, sha) => `\`${label}\`${sha ? ` (${sha.slice(0, 7)})` : ''}`;
    out.push(`What this pull request changes in what the site weighs and how far a reader scrolls: ${at(baseLabel, baseSha)} against ${at(headLabel, headSha)}, ` +
        'both measured by the pull request\'s own scripts, so a difference is a difference in the site.');
    if (!base) out.push('', `${baseLabel} could not be measured, so there is nothing to compare against; the figures below are this branch's alone.`);

    // What is over, first: that is what a reviewer has to act on.
    const over = [];
    Object.values(head.bytes).forEach((b) => {
        if (num(b.measured) !== null && b.measured > b.ceiling) over.push(`${b.readme}: ${fmtBytes(b.measured)} of ${fmtCeiling(b.ceiling)}`);
    });
    const pages = union(Object.keys(head.length || {}), Object.keys((headLength && headLength.pages) || {}), Object.keys((baseLength && baseLength.pages) || {}));
    const vps = union(Object.keys(head.viewports || {}), ...pages.map(p => Object.keys(((headLength && headLength.pages) || {})[p] || {})));
    const ceilingOf = (page, vp, side = head) => (side.length && side.length[page] && side.length[page][vp] ? side.length[page][vp].ceiling : null);
    pages.forEach(page => vps.forEach((vp) => {
        const m = lengthOf(headLength, head, page, vp);
        const c = ceilingOf(page, vp);
        if (m && c !== null && heldLength(m) > c) over.push(`\`${page}\` at ${size(vp, head)}: ${fmtScreens(heldLength(m))} screens of ${c}`);
    }));

    const first = head.bytes.criticalWire;
    if (first && num(first.measured) !== null) {
        const was = num((baseBytes.criticalWire || {}).measured);
        const move = was === null ? ''
            : was === first.measured ? `, as on ${baseLabel}`
            : ` (${signed(first.measured - was, fmtByteChange)} from ${fmtBytes(was)} on ${baseLabel})`;
        out.push('', `**The homepage's first view:** ${fmtBytes(first.measured)}${move}, about ${fmtMg(mgOf(first.measured))} CO₂e a view.`);
    }
    out.push('', over.length
        ? `**✗ ${over.length} budget${over.length === 1 ? '' : 's'} over the ceiling on this branch:** ${over.join('; ')}.`
        : '**✓ Every budget is within its ceiling on this branch.**');

    // Bytes, every budget.
    out.push('', '#### Bytes', '', `| Budget | ${baseLabel} | ${headLabel} | Change | Ceiling |`, '|---|--:|--:|--:|---|');
    union(Object.keys(head.bytes), Object.keys(baseBytes)).forEach((key) => {
        const h = head.bytes[key] || null;
        const b = baseBytes[key] || null;
        const hm = h ? num(h.measured) : null;
        const bm = b ? num(b.measured) : null;
        let ceiling = '—';
        if (h) {
            const mark = hm === null ? '' : hm > h.ceiling ? '✗ over ' : '✓ ';
            ceiling = `${mark}${fmtCeiling(h.ceiling)}${moved(b ? b.ceiling : undefined, h.ceiling, fmtCeiling)}`;
        } else if (b && num(b.ceiling) !== null) {
            ceiling = `none (was ${fmtCeiling(b.ceiling)})`;
        }
        out.push(`| ${(h || b).readme || key} | ${cell(bm, fmtBytes)} | ${cell(hm, fmtBytes)} | ${change(bm, hm, fmtByteChange)} | ${ceiling} |`);
    });

    // Carbon, per page, for a first view, in the length table's page order.
    const rank = (page) => (pages.includes(page) ? pages.indexOf(page) : pages.length);
    const firstViews = Object.entries(head.bytes).filter(([, b]) => b.page).sort((a, b) => rank(a[1].page) - rank(b[1].page));
    if (firstViews.length) {
        out.push('', '#### Estimated CO₂e per first view', '', `| Page | ${baseLabel} | ${headLabel} | Change |`, '|---|--:|--:|--:|');
        firstViews.forEach(([key, h]) => {
            const bm = num((baseBytes[key] || {}).measured);
            const hm = num(h.measured);
            const bg = bm === null ? null : mgOf(bm);
            const hg = hm === null ? null : mgOf(hm);
            out.push(`| \`${h.page}\` | ${cell(bg, fmtMg)} | ${cell(hg, fmtMg)} | ${change(bg, hg, fmtMgChange)} |`);
        });
        out.push('', `Network transfer only: each page's first-view bytes, nothing cached, times the Sustainable Web Design constant this site's footer badge uses, ${GRAMS_PER_MB} g CO₂e per MB. ` +
            'It leaves out the energy of the reader\'s device, and it is an estimate, not a measurement.');
    }

    // Length, per page and window size.
    out.push('', '#### Scroll length, in screens (page height ÷ window height)', '');
    if (!headLength && !pages.some(p => vps.some(vp => lengthOf(null, head, p, vp)))) {
        out.push('Not measured on this branch: the browser pass did not finish. The job log says why.');
    } else {
        out.push(`| Page | Window | ${baseLabel} | ${headLabel} | Change | Ceiling |`, '|---|---|--:|--:|--:|---|');
        pages.forEach(page => vps.forEach((vp) => {
            const bm = lengthOf(baseLength, base, page, vp);
            const hm = lengthOf(headLength, head, page, vp);
            if (!bm && !hm) return;
            const c = ceilingOf(page, vp);
            // undefined when main was not measured; null where it has no ceiling.
            const was = base && base.length ? ceilingOf(page, vp, base) : undefined;
            let ceiling = '—';
            if (c !== null) {
                const held = hm ? heldLength(hm) : null;
                const mark = held === null ? '' : held > c ? '✗ over ' : '✓ ';
                ceiling = `${mark}${c}${moved(was, c, String)}${hm && hm.full ? ` (drawn full: ${fmtScreens(hm.full.screens)})` : ''}`;
            } else if (num(was) !== null) {
                ceiling = `none (was ${was})`;
            }
            const b = bm ? bm.screens : null;
            const h = hm ? hm.screens : null;
            out.push(`| \`${page}\` | ${size(vp, head)} | ${cell(b, fmtScreens)} | ${cell(h, fmtScreens)} | ${change(b, h, fmtScreens)} | ${ceiling} |`);
        }));
        if (!baseLength) out.push('', `${baseLabel}'s lengths were not measured, so there is no change to show.`);
    }

    // What could come down: more than 10% headroom on this branch.
    const lower = [];
    Object.values(head.bytes).forEach((b) => {
        if (num(b.couldLowerTo) !== null) lower.push(`${b.readme}: ${fmtCeiling(b.ceiling)} → ${fmtCeiling(b.couldLowerTo)}`);
    });
    pages.forEach(page => vps.forEach((vp) => {
        const m = lengthOf(headLength, head, page, vp);
        const c = ceilingOf(page, vp);
        const to = m && c !== null ? couldLowerTo(heldLength(m), c, 'screens') : null;
        if (to !== null) lower.push(`\`${page}\` at ${size(vp, head)}: ${c} → ${to} screens`);
    }));
    if (lower.length) {
        out.push('', '#### Could come down', '', 'More than 10% headroom on this branch; `npm run budget -- --ratchet` lowers every ceiling to what it measures plus 5%:', '');
        lower.forEach(l => out.push(`- ${l}`));
    }

    const browser = (headLength && headLength.browser) || (baseLength && baseLength.browser);
    out.push('', `<sub>Bytes by \`scripts/check-budget.js\` (text gzipped, as GitHub Pages serves it). ` +
        `Lengths by \`scripts/smoke.js --lengths-only\`${browser ? ` in ${browser}` : ''}, reduced motion, each page walked to the bottom first so every section is drawn at its real height.</sub>`);
    return out.join('\n') + '\n';
}

// ------------------------------------------------------------------
// CLI
// ------------------------------------------------------------------
if (require.main === module) {
    const argv = process.argv.slice(2);
    const opt = (name) => { const i = argv.indexOf(name); return i > -1 && argv[i + 1] ? argv[i + 1] : null; };
    // A side that could not be measured leaves no file, or an empty one;
    // the receipt says so rather than failing the job.
    const load = (name) => {
        const file = opt(name);
        if (!file || !fs.existsSync(file) || !fs.statSync(file).size) return null;
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    };
    try {
        process.stdout.write(receipt({
            base: load('--base'),
            head: load('--head'),
            baseLength: load('--base-length'),
            headLength: load('--head-length'),
            baseLabel: opt('--base-label') || 'main',
            headLabel: opt('--head-label') || 'This PR',
            baseSha: opt('--base-sha') || '',
            headSha: opt('--head-sha') || ''
        }));
    } catch (e) {
        console.error(`receipt: ${e.message}`);
        process.exit(1);
    }
}

module.exports = { receipt, MARKER, signed, fmtBytes, fmtByteChange, fmtMg, fmtMgChange, mgOf, lengthOf };
