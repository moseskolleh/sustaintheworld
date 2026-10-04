// Check my numbers: every figure on the site is in the claims ledger.
//
// content/claims.json holds each number the site prints, with its basis and
// whether a reader can check it, and claims.html publishes it. The pages
// mark each figure with its entry, <span data-claim="water-points">164</span>,
// by hand on index.html, carbon-ai.html, field-report.html and 404.html, and
// by npm run build:content on the pages it generates. This fails when:
//
//   · a marked figure disagrees with its entry, or names no entry;
//   · an entry has no basis, or a basis that does not say the same number
//     (scripts/lib/content.js; the bad ledgers below prove it still fires);
//   · a number on any page, in digits or in words, in its text or in the
//     labels, titles, photo descriptions and captions a reader is shown, is
//     neither marked nor one of the kinds that are not claims (a year, a
//     section number, a standard's name, "one", a count of what the page
//     shows in full…), each printed with its page and the words around it,
//     so fixing is easy;
//   · a count of what a page shows in full ("seven case studies") is not
//     the count content/ holds;
//   · a size said in words ("a fifth of a kettle", "twice as much") is
//     neither reworded into a figure nor one the factor set is held to;
//   · a script prints a figure of its own the ledger does not hold: the
//     field terminal, the Assay's evidence, the receipt, You Draw It, the
//     coach's tips and the rest of what fills a host the scan skips, read
//     from their source; or the footer's badge prints a fixed one;
//   · a copy of the grams per MB (the narration player's, the build's)
//     parts from the ledger's;
//   · a rule the open counts page states (30 counts a minute, nothing
//     under 5) parts from the counter's code;
//   · the narration says a number in words that no entry backs;
//   · claims.html leaves an entry out, says it appears somewhere it does
//     not, or links it to a place where it is folded away while the page
//     shows it elsewhere, or into a fold the link neither opens nor names.
//
// The scan reads the pages as shipped, with no script run, so a number a
// calculator works out in the browser is not on them: those hosts are named
// below, and must hold no figure of their own in the HTML. What the scripts
// print of their own into them, and the terminal's lines, is read from
// their source.
//
// Run with: node tests/claims.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { run } = require('./harness.js');
const content = require('../scripts/lib/content.js');
const figures = require('../scripts/lib/claims.js');

const ROOT = content.ROOT;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

let data;
try {
    data = content.loadAll();
    assert(true, 'Ledger: content/claims.json loads and every entry validates');
} catch (err) {
    assert(false, `Ledger: validation failed —\n${err.message}`);
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
const CLAIMS = data.claims.claims;
const byId = new Map(CLAIMS.map(c => [c.id, c]));

// The pages a figure can be on. stats.html's counts are the visit
// counter's own, rewritten weekly, and skipped (figures.DRAWN); what that
// page says of the counter's rules (30 counts a minute, nothing under 5)
// is about the site itself, and is read like any page's, each rule marked
// [data-rule] and held to the code that sets it.
const PAGES = ['index.html', 'case-studies.html', 'research.html', 'carbon-ai.html', 'field-report.html', '404.html', 'claims.html', 'stats.html'];
const docs = Object.fromEntries(PAGES.map(p => [p, new JSDOM(read(p)).window.document]));

// ===================================================================
// Reading a figure
// ===================================================================
{
    const q = (s) => JSON.stringify(figures.quantity(s));
    assert(['70%', '7 in 10', '7 times out of 10', 'seventy per cent', 'seven holes in ten'].every(s => figures.agrees('70%', s)),
        'Reading: 70%, 7 in 10, 7 times out of 10 and "seventy per cent" are one strike rate');
    assert(!figures.agrees('70%', '70') && !figures.agrees('70%', '7.0'), 'Reading: a share is not the same as a count');
    assert(figures.agrees('164', 'a hundred and sixty-four water points') && figures.agrees('10,226', 'ten thousand two hundred and twenty-six'),
        'Reading: numbers in words, "and" and hyphens included');
    assert(figures.agrees('10,226', 'more than ten thousand') && !figures.agrees('10,226', 'more than eleven thousand'),
        'Reading: "more than" agrees with a figure above it, and only above');
    assert(q('2–8×') === '{"lo":2,"hi":8}' && figures.agrees('7.8/10', '7.8/10') && figures.agrees('~275', '275'),
        'Reading: a range, a score out of ten, and an approximation mark that changes nothing');
    const runs = figures.wordRuns('Between twenty-thirteen and twenty-nineteen I delivered a hundred and sixty-four water points.');
    assert(runs.map(r => r.value).join() === '2013,2019,164', `Reading: two years and a count, not one long number (${runs.map(r => r.value).join(', ')})`);
}

// ===================================================================
// The ledger's own rules, fed bad entries
// ===================================================================
{
    const good = { id: 'team-size', value: '23', unit: 'people in the team', basis: { profile: 'experience.4.teamSize' }, checkable: 'not-checkable' };
    const refuses = (label, entry, why) => {
        const problems = content.checkClaims({ claims: [entry] }, { profile: data.profile, projects: data.projects, factors: content.loadFactors() });
        assert(problems.some(p => why.test(p)), `Validator refuses ${label} (${problems.join('; ') || 'it passed'})`);
    };
    assert(content.checkClaims({ claims: [good] }, { profile: data.profile, projects: data.projects, factors: content.loadFactors() }).length === 0,
        'Validator: a sound entry passes');
    refuses('an entry with no basis', { ...good, basis: undefined }, /exactly one basis/);
    refuses('an entry with two bases', { ...good, basis: { profile: 'experience.4.teamSize', illustrative: 'why' } }, /exactly one basis/);
    refuses('a profile basis that says another number', { ...good, value: '24' }, /is 23, not 24/);
    refuses('a result that does not state the figure', { id: 'x', value: '65%', unit: 'strike rate', basis: { result: 'groundwater' } }, /no result .* states 65%/);
    refuses('a result entry that sets its own checkability', { id: 'x', value: '70%', unit: 'strike rate', basis: { result: 'groundwater' }, checkable: 'public' }, /the case study's/);
    refuses('a calculator input that says another number', { id: 'x', value: '0.4', unit: 'g per MB', basis: { factor: 'TRANSFER.gramsPerMB.value' }, checkable: 'public', check: 'carbon-ai.html' }, /is not 0\.4/);
    refuses('a cited source with an untrusted url', { id: 'x', value: '2.5', unit: 'MB', basis: { source: 'Somebody', url: 'https://example.com/x' }, checkable: 'public', check: 'carbon-ai.html' }, /not a host/);
    refuses('"checkable from outside" with nowhere to check', { ...good, checkable: 'public' }, /says where/);
    refuses('a link on a figure no one can check', { ...good, check: 'carbon-ai.html' }, /reads as checkable/);
    refuses('an illustrative figure called checkable', { id: 'x', value: '30%', unit: 'baseline', basis: { illustrative: 'none' }, checkable: 'on-request' }, /illustrative/);
    refuses('narration that says another number', { ...good, spoken: ['twenty-four people'] }, /does not say 23/);
    refuses('a figure inside the unit', { ...good, unit: 'people, of 40 on site' }, /figure in it/);
    refuses('an unknown field', { ...good, source: 'x' }, /unknown field/);
    refuses('a derived figure from nothing', { id: 'x', value: '0.004', unit: 'g', basis: { derived: 'how', from: ['nope'] }, checkable: 'not-checkable' }, /not an entry/);
    const twice = content.checkClaims({ claims: [good, { ...good, id: 'other' }] }, { profile: data.profile, projects: data.projects, factors: content.loadFactors() });
    assert(twice.some(p => /also how "team-size" is written/.test(p)), 'Validator refuses two entries written alike, which the pages could not tell apart');
}

// ===================================================================
// The marker: what the generator wraps in content/ text
// ===================================================================
{
    const cut = figures.marker(CLAIMS);
    const marked = (s) => cut(s).filter(([, id]) => id).map(([t, id]) => `${t}=${id}`).join(' ');
    assert(marked('164 water points, 10,226 sub-basins and a 70% strike rate') === '164=water-points 10,226=sub-basins 70%=strike-rate',
        `Marker: finds the ledger's figures in prose (${marked('164 water points, 10,226 sub-basins and a 70% strike rate')})`);
    assert(marked('1640 wells, Scope 2, Natural Earth 50 m coastlines, a 50/50 split') === '50/50=reference-mix',
        'Marker: leaves a longer number, a standard\'s name and a dataset\'s name alone, and a split is the split, not 50 boreholes');
    assert(marked('50 boreholes, but 50 people') === '50=boreholes-constructed' && marked('54 global systems, 54 times') === '54=hazard-systems',
        'Marker: a bare pair of digits only with its unit after it');
    assert(marked('two master\'s degrees, 2 of them') === '', 'Marker: never a single digit, never words');
}

// ===================================================================
// Every mark on every page agrees with its entry
// ===================================================================
const MARKS = new Map();       // claim id → pages that mark it
PAGES.forEach((page) => {
    const doc = docs[page];
    const wrong = [];
    doc.querySelectorAll('[data-claim]').forEach((el) => {
        const id = el.getAttribute('data-claim');
        const c = byId.get(id);
        const shown = el.textContent.trim();
        if (!c) wrong.push(`"${id}" is not in the ledger ("${shown}")`);
        else if (!figures.agrees(c.value, shown)) wrong.push(`${id} shows "${shown}", the ledger ${c.value}`);
        // The hero's figures count up to data-target, which is the figure too.
        else if (el.hasAttribute('data-target') && !figures.agrees(c.value, el.getAttribute('data-target'))) {
            wrong.push(`${id} counts up to ${el.getAttribute('data-target')}, the ledger says ${c.value}`);
        }
        if (page !== 'claims.html') {
            if (!MARKS.has(id)) MARKS.set(id, new Set());
            MARKS.get(id).add(page);
        }
    });
    assert(wrong.length === 0, `${page}: every marked figure is a ledger entry and says what it says (${wrong.join('; ') || `${doc.querySelectorAll('[data-claim]').length} marks`})`);
});

// The open counts page states the counter's rules: how many counts a minute
// it takes, the threshold under which nothing is published, how many
// features a page view sends. They were typed into the page, true when
// typed and held to nothing. Each is marked with its rule now and must say
// what the code says (scripts/lib/content.js, counterRules, which reads
// Code.gs, count.js and scripts/fetch-stats.js).
{
    const rules = Object.assign(content.counterRules(), { baselineWeeks: require('../scripts/build-content.js').BASELINE_WEEKS });
    const wrong = [];
    let n = 0;
    PAGES.forEach(page => docs[page].querySelectorAll('[data-rule]').forEach((el) => {
        n++;
        const key = el.getAttribute('data-rule');
        if (page !== 'stats.html') wrong.push(`${page} marks a counter rule (${key}); only the open counts page states them`);
        else if (!(key in rules)) wrong.push(`"${key}" is not one of the counter's rules`);
        else if (!figures.agrees(String(rules[key]), el.textContent.trim())) wrong.push(`${key} says "${el.textContent.trim()}", the code ${rules[key]}`);
    }));
    const used = new Set(Array.from(docs['stats.html'].querySelectorAll('[data-rule]')).map(el => el.getAttribute('data-rule')));
    // How many referring sites are named is said with the table of them, once counting has started.
    const unsaid = ['perMinute', 'lockSeconds', 'suppressBelow', 'featuresMax', 'vpSmall', 'vpMediumMax', 'baselineWeeks']
        .concat(data.stats.status === 'collecting' ? ['referrersListed', 'vpLarge'] : []).filter(k => !used.has(k));
    assert(n > 10 && wrong.length === 0 && unsaid.length === 0,
        `stats.html: every rule of the counter it states says what the code sets (${n} marks; ${wrong.concat(unsaid.map(k => `${k} unmarked`)).join('; ') || 'all agree'})`);
    // The fetcher writes its threshold into content/stats.json, and the page prints that.
    assert(data.stats.suppressBelow === rules.suppressBelow, `stats.json suppresses below the fetcher's threshold (${data.stats.suppressBelow}, ${rules.suppressBelow})`);
}

// ===================================================================
// The scan: a numeral nobody marked
// ===================================================================
// Hosts a script fills in the browser. In the HTML as shipped each holds a
// placeholder. What the script works out there, a grade, a footprint, a
// guess at a curve, is a model output, not a claim. What it prints of its
// own is not: the Assay's "164 water points" and the coach's tips were
// typed into scripts, skipped here with the hosts, and nothing held them.
// So each host names the script that fills it, and what that script
// prints of its own is read from its source below (PRINTED) and held to
// the ledger as the pages are.
const RUNTIME = {
    'index.html': { '#ydi': 'ydi', '#carbonBadgeText': 'badge', '#receiptBody': 'receipt', '#assayResult': 'assay' },
    'carbon-ai.html': Object.assign(Object.fromEntries(['.ca-out', '[id^="equiv"]', '#tipsList', '#chartBars', '.ca-hint', '#inputNotice',
        '#ledgerReviewed', '#ledgerTable', '#ledgerSources', 'select'].map(sel => [sel, 'coach'])), { '#anatomyDraw': 'anatomy' }),
    'case-studies.html': { '#drillResult': 'games', '#drillScore': 'games', '#floodNote': 'games', '#floodLevelLabel': 'games' }
};
// Numerals made from the page's own structure, not claims about anything,
// and the open counts page's counts (scripts/lib/claims.js, DRAWN, which
// claims.html's "Not on this list" is written from).
const COUNTED = Object.fromEntries(Object.entries(figures.DRAWN).map(([page, list]) => [page, list.map(d => [d.sel, d.why, d.once])]));
// A mark: [data-claim] holds a figure to the ledger, [data-rule] one of
// the counter's rules to its code (held below).
const SKIP = 'script, style, svg, template, noscript, [data-claim], [data-rule]';
// The words around a numeral: its block, or the span it sits in (tags and
// chips run together without a space between them).
const BLOCK = 'span, p, li, dd, dt, h1, h2, h3, h4, h5, h6, td, th, figcaption, summary, label, a, button, div, section, header, footer, main, body';
const NUMERAL = /(?<![A-Za-z\d.,])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

/** Every number in `root`'s text outside `skip`, in digits or in words, with the words around it and the reason it is let through, if any. */
function numerals(doc, root, skip) {
    const found = [];
    const walk = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        if (!/[\dA-Za-z]/.test(node.textContent) || node.parentElement.closest(skip)) continue;
        const block = node.parentElement.closest(BLOCK) || root;
        let offset = 0;
        const inner = doc.createTreeWalker(block, 4);
        for (let t = inner.nextNode(); t && t !== node; t = inner.nextNode()) offset += t.textContent.length;
        const text = block.textContent;
        const words = (at, end) => text.slice(Math.max(0, at - 40), end + 40).replace(/\s+/g, ' ').trim();
        NUMERAL.lastIndex = 0;
        let m;
        while ((m = NUMERAL.exec(node.textContent))) {
            const at = offset + m.index;
            found.push({ numeral: m[0], words: words(at, at + m[0].length), why: figures.exemptAt(text, at, at + m[0].length) });
        }
        figures.wordRuns(node.textContent).concat(figures.sizeRuns(node.textContent)).forEach((r) => {
            const run = Object.assign({}, r, { index: offset + r.index, end: offset + r.end });
            found.push({ numeral: r.text, words: words(run.index, run.end), why: figures.wordExempt(text, run) });
        });
    }
    return found;
}

/**
 * The same for a text that cannot carry a mark (an attribute, a string a
 * script prints): a figure the ledger knows is the one the marker finds
 * there, written as the ledger writes it, so "15 solar-powered boreholes"
 * is caught where "14" is not.
 */
const cut = figures.marker(CLAIMS);
function numeralsIn(text, why = () => null) {
    const marked = [];
    let at = 0;
    cut(text).forEach(([t, id]) => { if (id) marked.push([at, at + t.length]); at += t.length; });
    const inMark = (a, b) => marked.some(([x, y]) => x <= a && y >= b);
    const found = [];
    const words = (a, b) => text.slice(Math.max(0, a - 40), b + 40).replace(/\s+/g, ' ').trim();
    NUMERAL.lastIndex = 0;
    let m;
    while ((m = NUMERAL.exec(text))) {
        const [a, b] = [m.index, m.index + m[0].length];
        if (!inMark(a, b)) found.push({ numeral: m[0], words: words(a, b), why: figures.exemptAt(text, a, b) || why(text, a, b) });
    }
    figures.wordRuns(text).concat(figures.sizeRuns(text)).forEach((r) => {
        if (!inMark(r.index, r.end)) found.push({ numeral: r.text, words: words(r.index, r.end), why: figures.wordExempt(text, r) || why(text, r.index, r.end, r) });
    });
    return found;
}

// The scan itself, on a page written to be caught: it has to find the
// unmarked figure and let the year, the standard and the marked one by.
{
    const doc = new JSDOM('<main><p>In 2019 I managed a team of 23 on Scope 2, and <span data-claim="water-points">164</span> water points.</p><ul><li><span>SDG 12 &amp; 13</span><span>4.2 stars</span></li></ul></main>').window.document;
    const found = numerals(doc, doc.body, SKIP).filter(n => !n.why).map(n => n.numeral);
    assert(JSON.stringify(found) === '["23","4.2"]', `Scan: catches the unmarked figures in a test page and nothing else (${found.join(', ')})`);
}

// The names a numeral can be part of without being a figure, which the
// GAIA case and the repositories brought (a version, a GRI disclosure, a
// span of scopes, a return period, a section, an ISO date), are let through,
// and only as names: the same numbers counting something are caught.
{
    const doc = new JSDOM('<main><p>GAIA 1.0 and version 2 map to GRI 302/303/305, and GRI 302, 303 and 305, over Scope 1 to 3 and Scope 2 and 3, with 20-year return levels (section 8; Field note 03, reviewed 2026-08-05).</p><p>It found 302 sites, 2 versions of 20 models and 8 sections.</p></main>').window.document;
    const found = numerals(doc, doc.body, SKIP).filter(n => !n.why).map(n => n.numeral);
    assert(JSON.stringify(found) === '["302","2","20","8"]', `Scan: lets through a version, a GRI line, a span of scopes, a return period, a section and an ISO date as names, and catches the same numbers as counts (${found.join(', ')})`);
}

// In words: the count is a figure unless it is "one" or a count of what
// the page shows in full; the same words marked are let by.
{
    const doc = new JSDOM('<main><p>A team of six, one thread, Net Zero, seven case studies and a <span data-claim="wuppertal-team">six</span>-person team.</p><p>Five months, and the four modules, Ground, Assess, Interpret and Act.</p></main>').window.document;
    const found = numerals(doc, doc.body, SKIP).filter(n => !n.why).map(n => n.numeral);
    assert(JSON.stringify(found) === '["six","Five"]', `Scan: catches a count in words, and lets "one", a name and a count of what is shown by (${found.join(', ')})`);
    const attr = numeralsIn('164 water points: 100 hand-dug wells rehabilitated, 50 boreholes constructed, 15 solar-powered boreholes, for six weeks').filter(n => !n.why).map(n => n.numeral);
    assert(JSON.stringify(attr) === '["15","six"]', `Scan: in a label, a figure written as the ledger writes it passes and one it does not hold is caught (${attr.join(', ')})`);
}

// A size in words is a quantity with no numeral: "a fifth of a kettle" had
// no basis, and nothing saw it. It is caught now, an ordinal is not, and
// the one the factor set is held to below is let by.
{
    const doc = new JSDOM('<main><p>This answer boiled a fifth of a kettle, nearly twice as much, across millions of queries: the third tip.</p><p>The models are an order of magnitude apart.</p></main>').window.document;
    const found = numerals(doc, doc.body, SKIP).filter(n => !n.why).map(n => n.numeral);
    assert(JSON.stringify(found) === '["a fifth","twice","millions"]', `Scan: catches a fraction, a multiplier and a magnitude in words, and lets an ordinal and a held size by (${found.join(', ')})`);
}

PAGES.forEach((page) => {
    const doc = docs[page];
    const runtime = Object.keys(RUNTIME[page] || {});
    const counted = COUNTED[page] || [];
    const skip = [SKIP].concat(runtime, counted.map(([sel]) => sel)).join(', ');
    const unmarked = numerals(doc, doc.body, skip).filter(n => !n.why);
    unmarked.forEach(n => console.log(`  unmarked: ${page}: ${n.numeral} in "…${n.words}…"`));
    assert(unmarked.length === 0,
        `${page}: every number, in digits or in words, is marked with its ledger entry, or is a year, a date, a section number, a standard's name, "one", a count of what the page shows, or the like (${unmarked.length} unmarked${unmarked.length ? ', listed above' : ''})`);

    // What a reader is shown or told that is not text: a label, a tooltip,
    // a photo's caption in the lightbox, a photo's description, the page's
    // description. The impact bar's tooltips once said "14 solar-powered
    // boreholes" where nothing held them to the ledger.
    const inAttrs = [];
    const described = () => 'a photo\'s description, saying what is in it';
    doc.querySelectorAll('[title], [aria-label], [data-caption], img[alt], meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]').forEach((el) => {
        if (el.closest(['script, style, template'].concat(runtime).join(', '))) return;
        ['title', 'aria-label', 'data-caption', 'alt', 'content'].filter(a => el.hasAttribute(a)).forEach((a) => {
            numeralsIn(el.getAttribute(a), a === 'alt' ? (t, x, y, run) => (run ? described() : null) : undefined)
                .filter(n => !n.why).forEach(n => inAttrs.push(`${a}: ${n.numeral} in "…${n.words}…"`));
        });
    });
    inAttrs.forEach(n => console.log(`  unmarked: ${page}: ${n}`));
    assert(inAttrs.length === 0, `${page}: every number in a label, a title, a caption or a description is one the ledger holds, written as it writes it, or the like (${inAttrs.length} not${inAttrs.length ? ', listed above' : ''})`);

    // A host the scan skips has to earn it: present, and with no figure typed into it.
    const typed = [];
    const once = new Map(counted.filter(c => c[2]).map(([sel, , state]) => [sel, state]));
    runtime.concat(counted.map(([sel]) => sel)).forEach((sel) => {
        const hosts = doc.querySelectorAll(sel);
        if (!hosts.length && !(once.has(sel) && !(page === 'stats.html' && data.stats.status === 'collecting'))) typed.push(`${sel} is not on the page`);
        if (runtime.includes(sel)) {
            hosts.forEach(h => numerals(doc, h, 'script, style, svg, [data-claim]').filter(n => !n.why)
                .forEach(n => typed.push(`${sel} holds ${n.numeral} ("${n.words}")`)));
        }
    });
    if (runtime.length || counted.length) {
        assert(typed.length === 0, `${page}: each host the scan skips is on the page, and the calculators' hosts hold no figure until they run (${typed.join('; ') || runtime.concat(counted.map(([sel]) => sel)).join(', ')})`);
    }
});

// An illustrative figure says so wherever it is shown.
{
    const unlabelled = [];
    PAGES.filter(p => p !== 'claims.html').forEach((page) => {
        docs[page].querySelectorAll('[data-claim]').forEach((el) => {
            const c = byId.get(el.getAttribute('data-claim'));
            if (!c || c.basis.illustrative === undefined) return;
            const block = el.closest('p, li, dd, figcaption');
            if (!block || !/illustrative/i.test(block.textContent)) unlabelled.push(`${page}: "${(block || el).textContent.trim().slice(0, 80)}"`);
        });
    });
    assert(unlabelled.length === 0, `Illustrative: every illustrative figure is labelled so where it is shown (${unlabelled.join('; ') || 'all are'})`);
}

// ===================================================================
// What the scripts print of their own
// ===================================================================
/**
 * The string literals in a script's source, a template's ${…} read as a gap
 * (its own literals are taken too). A regular expression is skipped whole:
 * a quote inside one ("[\w'’]") once read the code after it as a string.
 */
function literals(src) {
    const out = [];
    let i = 0;
    const quoted = (q) => {
        let j = i + 1;
        let buf = '';
        while (j < src.length && src[j] !== q) {
            if (src[j] === '\\') { buf += src[j + 1]; j += 2; } else buf += src[j++];
        }
        i = j + 1;
        return buf;
    };
    const template = () => {
        let j = i + 1;
        let buf = '';
        while (j < src.length && src[j] !== '`') {
            if (src[j] === '\\') { buf += src[j + 1]; j += 2; continue; }
            if (src[j] === '$' && src[j + 1] === '{') {
                let depth = 1;
                let k = j + 2;
                while (k < src.length && depth) {
                    const ch = src[k];
                    if (ch === "'" || ch === '"' || ch === '`') { i = k; out.push(ch === '`' ? template() : quoted(ch)); k = i; continue; }
                    if (ch === '{') depth++;
                    if (ch === '}') depth--;
                    k++;
                }
                buf += ' ';
                j = k;
                continue;
            }
            buf += src[j++];
        }
        i = j + 1;
        return buf;
    };
    // A slash starts a regular expression where a value is expected: after
    // an operator, a bracket, a comma, an arrow or `return`, never after a
    // name or `)`.
    const regexAt = () => /(?:[(,=:[!&|?{};>]|\breturn|\btypeof)\s*$/.test(src.slice(Math.max(0, i - 12), i));
    const regex = () => {
        let j = i + 1;
        let inClass = false;
        while (j < src.length && src[j] !== '\n' && (inClass || src[j] !== '/')) {
            if (src[j] === '\\') j++;
            else if (src[j] === '[') inClass = true;
            else if (src[j] === ']') inClass = false;
            j++;
        }
        i = j + 1;
    };
    while (i < src.length) {
        const ch = src[i];
        if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; }
        else if (ch === '/' && src[i + 1] === '*') i = src.indexOf('*/', i) + 2;
        else if (ch === '/' && regexAt()) regex();
        else if (ch === "'" || ch === '"') out.push(quoted(ch));
        else if (ch === '`') out.push(template());
        else i++;
    }
    return out;
}

/** The part of a source between two markers, which must both be there. */
function between(src, from, to, file) {
    const a = src.indexOf(from);
    const b = a < 0 ? -1 : src.indexOf(to, a + from.length);
    if (a < 0 || b < 0) throw new Error(`${file}: "${from}" … "${to}" is not in the source; the test reads what it prints from there`);
    return src.slice(a, b);
}
// The literals that read as words a person is shown, not an id, a class, a
// colour or an SVG path: two letters together, and a space.
const readAsWords = (list) => list.filter(t => /[A-Za-z]{2,}/.test(t) && /\s/.test(t.trim()));
// Of a string of markup, what a reader is shown: its text and its labels,
// not data-step="-1".
const shownOf = (t) => (!/<[a-z]/i.test(t) ? t
    : [t.replace(/<[^>]*>/g, ' ')].concat([...t.matchAll(/\b(?:aria-label|title|alt)="([^"]*)"/g)].map(m => m[1])).join(' '));

// The Assay's rules are data the page builds from, so they are read as the
// page has them: the homepage booted with its scripts.
const assay = run(null, { clock: true, before: (w) => { w.console.log = () => {}; } }).window.mks.assay;

/**
 * What each script prints of its own, read from its source: `texts` the
 * strings, `sure` one line it must have found (so a renamed marker cannot
 * read nothing and pass), and `why` a numeral it lets by, with the reason.
 */
const interactives = read('modules/interactives.js');
const terminalSrc = read('modules/terminal.js');
const drillLog = literals(between(terminalSrc, 'drill: (', 'cv: (', 'modules/terminal.js'));
const PRINTED = {
    // The field terminal on the homepage (press `) prints the record in its
    // own words: 164 water points, 10,226 sub-basins, a 70% strike rate,
    // "odds are 7/10". The drill command's log is a game: its depths are made
    // up, and its first line says so. Only a depth in metres is let by, and
    // only there.
    terminal: { what: 'the field terminal (modules/terminal.js)', texts: literals(terminalSrc), sure: /164 water points/,
        why: (text, a, b) => (drillLog.some(t => /made-up/.test(t)) && drillLog.includes(text) && /^\s*m\b/.test(text.slice(b)) ? 'a depth in the drill\'s made-up log' : null) },
    // The footer's badge prints what this visit weighed, worked out in the
    // browser; when the browser cannot say, it printed a fixed "under ~1 MB
    // per visit" that nothing held. It prints no figure of its own now.
    badge: { what: 'the footer\'s badge (script.js)', sure: /./,
        texts: [...read('script.js').matchAll(/badgeText\.textContent\s*=\s*(['"`][\s\S]*?['"`]);/g)].map(m => literals(m[1]).join(' ')) },
    // The Assay grades an ad in the browser, but beside each area it matches
    // it prints the record behind it, typed into its rules: "164 water
    // points…", "a 70% aquifer strike rate", "54 global hazard information
    // systems". Those, its gaps and the lines around them.
    assay: { what: 'the Assay\'s evidence, gaps and messages (modules/interactives.js)', sure: /164 water points/,
        texts: assay.RULES.strengths.flatMap(r => [r.label].concat(r.ev.map(e => e.t)))
            .concat(assay.RULES.gaps.flatMap(g => [g.label, g.text]), assay.RULES.confirm.map(c => c.label),
                assay.RULES.languages.map(l => l.confirm || ''),
                literals(between(interactives, '// --- The page', '// YOU DRAW IT', 'modules/interactives.js'))) },
    // The receipt sums the visit's own bytes, and beside them the field
    // report's size, typed in.
    receipt: { what: 'the receipt\'s fixed lines (modules/interactives.js)', sure: /Text-only report/,
        texts: literals(between(interactives, 'const lines = [];', 'return lines;', 'modules/interactives.js')) },
    // You Draw It's verdict, card and table: the estimates come from the
    // factor set; its own words name the answer it prices.
    ydi: { what: 'You Draw It\'s verdict, card and table (modules/interactives.js)', sure: /1,000-token answer/,
        texts: readAsWords(literals(between(interactives, 'const est = ', '// Shape grade', 'modules/interactives.js'))
            .concat(literals(between(interactives, 'let shape;', 'cardData = {', 'modules/interactives.js')),
                literals(between(interactives, 'callout.textContent', 'svg.appendChild(callout)', 'modules/interactives.js')),
                literals(between(interactives, 'const factorText', 'const factorLines', 'modules/interactives.js')),
                literals(between(interactives, '// --- accessible', '// THE RECEIPT', 'modules/interactives.js')))) },
    // The coach: its outputs, its hints, its notices, its evidence ledger and
    // its tips. Three tips once quoted ranges nothing sourced ("4–10× more
    // energy per token").
    coach: { what: 'the EcoPrompt Coach (carbon-ai.js)', texts: readAsWords(literals(read('carbon-ai.js'))), sure: /hidden output tokens/ },
    anatomy: { what: 'Anatomy of a Prompt (modules/anatomy.js)', texts: readAsWords(literals(read('modules/anatomy.js'))), sure: /Scope 2/ },
    games: { what: 'the borehole and flood games (modules/dossier.js)', texts: readAsWords(literals(read('modules/dossier.js'))), sure: /STRIKE/ },
    // The narration player is built when Listen is pressed, so no page's
    // HTML holds it: its weight label's tooltip typed in "0.36 g CO₂e per
    // MB", and nothing held that copy. It prints the badge's figure now; a
    // figure typed in again is caught here. Its browser voice moves no
    // bytes, and says so.
    player: { what: 'the narration player (modules/dispatch.js)', texts: readAsWords(literals(read('modules/dispatch.js'))).map(shownOf),
        sure: /Sustainable Web Design model/,
        why: (text, a, b) => (/^browser voice · 0 KB transferred$/.test(text) && text.slice(a, b) === '0' ? 'nothing transferred: the browser voice moves no bytes' : null) }
};
{
    const hosts = Object.entries(RUNTIME).flatMap(([page, map]) => Object.entries(map).map(([sel, key]) => `${page} ${sel} → ${key}`));
    const unheld = hosts.filter(h => !PRINTED[h.split(' → ')[1]]);
    assert(unheld.length === 0, `Scripts: every host the scan skips names the script that fills it, and what that script prints of its own is read (${unheld.join('; ') || `${hosts.length} hosts`})`);
    Object.entries(PRINTED).forEach(([key, p]) => {
        const found = p.texts.length > 0 && p.texts.some(t => p.sure.test(t));
        const loose = p.texts.flatMap(t => numeralsIn(t, p.why).filter(n => !n.why).map(n => `${n.numeral} in "${n.words}"`));
        loose.forEach(n => console.log(`  unmarked: ${key}: ${n}`));
        assert(found && loose.length === 0, `Scripts: every figure ${p.what} prints of its own is one the ledger holds, written as it writes it (${p.texts.length} strings read; ${loose.length} not${loose.length ? ', listed above' : ''})`);
    });
    assert(PRINTED.terminal.texts.some(t => /odds are 7\/10/.test(t)) && drillLog.some(t => /made-up/.test(t)), 'Scripts: the terminal\'s drill log says it is made up, and only its depths are let by');
    assert(PRINTED.badge.texts.length >= 2, `Scripts: the badge's lines are read (${PRINTED.badge.texts.length})`);
}

// Proof that the hold bites, on the figures the review changed in a copy
// of the Assay: 164 → 200 water points, 14 → 50 solar-powered, 54 → 10
// hazard systems, and the receipt's 10 KB → 9 KB. Each is caught.
{
    const drifted = ['200 water points in Sierra Leone: 100 wells rehabilitated, 50 boreholes built, 14 solar-powered',
        '164 water points in Sierra Leone: 100 wells rehabilitated, 50 boreholes built, 50 solar-powered',
        'UNDRR: documented 10 global hazard information systems for the Sendai Framework', '9 KB']
        .map(t => numeralsIn(t).filter(n => !n.why).map(n => n.numeral).join());
    assert(JSON.stringify(drifted) === '["200","50","10","9"]', `Scripts: a figure drifted in a script's evidence line is caught (${drifted.join(' | ')})`);
}

// A count of what a page shows in full is let through as one, so it has to
// be that count: "seven case studies" with an eighth in projects.json would
// be a figure nobody holds.
{
    const said = PAGES.map(p => docs[p].body.textContent + ' ' + docs[p].head.textContent)
        .concat([data.narration.intro ? data.narration.intro.text : ''], data.narration.scripts.map(x => x.text))
        .concat(Object.values(PRINTED).flatMap(p => p.texts)).join(' ');
    const wrong = [];
    let checked = 0;
    const held = Object.assign({ page: p => docs[p], source: read }, data);
    figures.SHOWN_IN_FULL.filter(c => c.count).forEach((c) => {
        c.re.lastIndex = 0;
        let m;
        while ((m = c.re.exec(said))) {
            checked++;
            const n = figures.wordRuns(m[0])[0].value;
            if (n !== c.count(held)) wrong.push(`"${m[0]}" where there are ${c.count(held)} (${c.what})`);
        }
    });
    assert(checked > 5 && figures.SHOWN_IN_FULL.every(c => c.count || c.named) && wrong.length === 0, `Counts: each count of what a page shows in full is the count of what it shows (${checked} said; ${wrong.join('; ') || 'all agree'})`);
}

// A size said in words that the scan lets by sums up the factor set, and
// still does: "an order of magnitude" is how far apart the models are and
// how far each estimate is good to.
{
    const factors = content.loadFactors();
    const results = figures.HELD_SIZES.map(h => Object.assign({ what: h.what }, h.holds(factors)));
    assert(results.every(r => r.ok), `Sizes: each size in words the pages say sums up the factor set and still does (${results.map(r => `${r.what}: ${r.said}`).join('; ')})`);
}

// ===================================================================
// Every entry is somewhere, and its basis holds today
// ===================================================================
const narration = [data.narration.intro ? data.narration.intro.text : ''].concat(data.narration.scripts.map(s => s.text)).join(' ');
{
    const said = (c) => (c.spoken || []).some(s => narration.toLowerCase().includes(s.toLowerCase()));
    const nowhere = CLAIMS.filter(c => !MARKS.has(c.id) && !said(c)).map(c => c.id);
    assert(nowhere.length === 0, `Ledger: every entry is on a page or in the narration — none is left over from a figure that has gone (${nowhere.join(', ') || 'none'})`);

    // The site's own measurements, as npm run budget makes them today.
    const { measure, BUDGETS } = require('../scripts/check-budget.js');
    const { measured } = measure();
    const off = CLAIMS.filter(c => c.basis.budget !== undefined).filter((c) => {
        if (!BUDGETS[c.basis.budget] || typeof measured[c.basis.budget] !== 'number') return true;
        return !figures.agrees(c.value, String(Math.round(measured[c.basis.budget] / 1024)));
    }).map(c => `${c.id}: ${c.value} against ${Math.round(measured[c.basis.budget] / 1024)} KB measured`);
    assert(off.length === 0, `Ledger: each figure the budget measures is what it measures, rounded (${off.join('; ') || CLAIMS.filter(c => c.basis.budget).map(c => `${c.id} ${c.value} KB`).join(', ')})`);

    // The field report's carbon is its size times the web's grams per MB.
    const grams = (measured.fieldReport / 1048576) * Number(byId.get('web-carbon').value);
    assert(byId.get('field-report-carbon').value === grams.toFixed(3),
        `Ledger: the field report's ${byId.get('field-report-carbon').value} g CO₂e is its ${measured.fieldReport} bytes at ${byId.get('web-carbon').value} g per MB (${grams.toFixed(4)})`);

    // The footer's badge carries its own copies of two inputs.
    const script = read('script.js');
    const constant = (name, src = script) => ((src.match(new RegExp(`const ${name} = ([\\d.]+);`)) || [])[1]);
    assert(figures.agrees(byId.get('median-page').value, constant('MEDIAN_PAGE_MB')) && figures.agrees(byId.get('web-carbon').value, constant('G_CO2_PER_MB')),
        `Ledger: the badge in script.js compares against the ledger's median page and weighs with its grams per MB (${constant('MEDIAN_PAGE_MB')}, ${constant('G_CO2_PER_MB')})`);

    // The grams per MB, wherever the site weighs a transfer. The badge
    // shares its constant as mks.carbon, which the receipt and the
    // narration player read; the player once typed in a copy of its own,
    // and so did a note in the factor set, and moving the ledger's figure
    // would have left both behind with every test passing. The build's
    // copy weighs the recording and the PR receipt.
    const dispatch = read('modules/dispatch.js');
    const build = constant('GRAMS_PER_MB', read('scripts/lib/voice-signature.js'));
    const typed = ['script.js', 'carbon-ai.js', 'ai-carbon-data.js'].concat(fs.readdirSync(path.join(ROOT, 'modules')).filter(f => f.endsWith('.js')).map(f => `modules/${f}`))
        .flatMap(f => literals(read(f)).flatMap(t => [...t.matchAll(/(\d+(?:\.\d+)?)\s*g CO₂e(?: per |\/)MB/g)].map(m => `${f}: ${m[1]}`)));
    assert(/const \{ gramsPerMB \} = mks\.carbon;/.test(dispatch) && /\* gramsPerMB\b/.test(dispatch) && !/\d\.\d+ g CO₂e/.test(literals(dispatch).join(' '))
        && figures.agrees(byId.get('web-carbon').value, build) && typed.every(t => figures.agrees(byId.get('web-carbon').value, t.split(': ')[1])),
        `Ledger: every copy of the grams per MB is the ledger's ${byId.get('web-carbon').value}: the player weighs with the badge's (mks.carbon), the build's is ${build}, and a script that writes the figure writes it (${typed.join('; ') || 'none does'})`);

    // The borehole game's scoreboard draws the two rates as rows of ten.
    const rows = Array.from(docs['case-studies.html'].querySelectorAll('.strike-waffle[data-row]')).filter(w => /^\d+$/.test(w.getAttribute('data-row')));
    const drawn = rows.map(w => [w.getAttribute('data-row'), w.parentElement.querySelector('[data-claim]')]);
    assert(drawn.length === 2 && drawn.every(([n, mark]) => mark && figures.agrees(byId.get(mark.getAttribute('data-claim')).value, `${n} in 10`)),
        `Ledger: the borehole game's scoreboard draws the field records' rate and the illustrative one as the ledger has them (${drawn.map(([n, mark]) => `${n} → ${mark && mark.getAttribute('data-claim')}`).join(', ')})`);
}

// ===================================================================
// The narration: every number it says, in words, is an entry's
// ===================================================================
{
    const texts = [['intro', data.narration.intro ? data.narration.intro.text : '']].concat(data.narration.scripts.map(s => [s.id, s.text]));
    const unbacked = [];
    let backed = 0;
    texts.forEach(([id, text]) => {
        const lower = text.toLowerCase();
        const spans = [];
        CLAIMS.forEach(c => (c.spoken || []).forEach((s) => {
            for (let i = lower.indexOf(s.toLowerCase()); i > -1; i = lower.indexOf(s.toLowerCase(), i + 1)) spans.push([i, i + s.length, c.id]);
        }));
        figures.wordRuns(text).concat(figures.sizeRuns(text)).forEach((run) => {
            if (figures.spokenExempt(text, run)) return;
            const span = spans.find(([a, b]) => a <= run.index && b >= run.end);
            if (span) backed++;
            else unbacked.push(`${id}: "${run.text}" in "…${text.slice(Math.max(0, run.index - 40), run.end + 40)}…"`);
        });
    });
    unbacked.forEach(u => console.log(`  unbacked: ${u}`));
    assert(unbacked.length === 0, `Narration: every number said aloud is a ledger entry's spoken form (${backed} said; ${unbacked.length} with no entry${unbacked.length ? ', listed above' : ''})`);

    const unused = CLAIMS.flatMap(c => (c.spoken || []).filter(s => !narration.toLowerCase().includes(s.toLowerCase())).map(s => `${c.id}: "${s}"`));
    assert(unused.length === 0, `Narration: every spoken form in the ledger is something the narration says (${unused.join('; ') || 'all are'})`);
}

// ===================================================================
// claims.html: every entry, where it is, and how to check it
// ===================================================================
{
    const doc = docs['claims.html'];
    const items = Array.from(doc.querySelectorAll('li.cl-item'));
    const ids = items.map(li => li.id.replace(/^claim-/, ''));
    assert(JSON.stringify(ids.slice().sort()) === JSON.stringify(CLAIMS.map(c => c.id).sort()) && new Set(ids).size === ids.length,
        `claims.html: lists every entry once (${ids.length} of ${CLAIMS.length})`);
    const unvalued = items.filter((li) => {
        const v = li.querySelector('.cl-figure [data-claim]');
        return !v || v.getAttribute('data-claim') !== li.id.replace(/^claim-/, '');
    }).map(li => li.id);
    assert(unvalued.length === 0, `claims.html: each entry opens with its figure, marked (${unvalued.join(', ') || 'all do'})`);

    const { CLAIM_PAGES, marksIn } = require('../scripts/build-content.js');
    // Where the generator sends a reader, on a page written to test it: the
    // figure in sight wins over the same figure folded earlier in a field
    // note; a figure only in a [hidden] note is addressed inside it, named
    // by the control that opens it; a heading with an id is a place up to
    // the next heading; "hidden" inside a class is not the attribute.
    const probe = marksIn('<main id="main"><section id="about"><details class="fieldnote"><summary>Note</summary><p><span data-claim="a">70%</span></p></details></section>' +
        '<section id="projects"><p><span data-claim="a">70%</span></p></section><footer><button type="button" aria-controls="note" aria-label="How">?</button>' +
        '<div id="note" hidden><p><span data-claim="b">0.36</span></p></div></footer><h2 id="log">Log</h2><dl><dd><span data-claim="c">23</span></dd></dl>' +
        '<h2>Next</h2><p class="a hidden b"><span data-claim="d">5</span></p></main>');
    const said = (id) => JSON.stringify(probe.get(id));
    assert(probe.get('a').place === '#projects' && !probe.get('a').fold && probe.get('b').place === '#note' && probe.get('b').fold.kind === 'hidden' &&
        probe.get('b').fold.name === 'How' && probe.get('c').place === '#log' && probe.get('d').place === '' && !probe.get('d').fold,
        `Where: a figure in sight wins, a folded one is addressed inside its fold and named, a heading is a place (${['a', 'b', 'c', 'd'].map(said).join(' ')})`);
    const wrongWhere = [];
    const wrongCheck = [];
    const wrongPlace = [];
    items.forEach((li) => {
        const c = byId.get(li.id.replace(/^claim-/, ''));
        if (!c) return;
        const listed = Array.from(li.querySelectorAll('.cl-where a')).map(a => a.getAttribute('href').split(/[?#]/)[0]).sort();
        // Each link lands where the figure is, in sight: in the place it
        // names, or in the view of the case studies that shows it. A bare
        // link went to the top of a page up to sixteen screens long; the
        // homepage's four footer figures sat in the badge's [hidden] method
        // note, the research page's two in a closed fold, and strike-rate
        // went to a folded field note while #projects showed 70% in the
        // open. So a link goes to a mark in sight when the page has one;
        // when every mark is folded, it points into the fold (each page's
        // script opens a fold its address points into) and says where it
        // waits. Only the one-screen 404 page is linked bare.
        li.querySelectorAll('.cl-where a').forEach((a) => {
            const [, file, lens, frag] = a.getAttribute('href').match(/^([^?#]+)(?:\?lens=([\w-]+))?(?:#(.+))?$/) || [];
            const doc = docs[file];
            const place = frag ? doc && doc.getElementById(frag) : lens ? doc && doc.querySelector(`[data-lens-panel="${lens}"]`) : null;
            // A heading's place runs to the next heading of its rank or above
            // (the field report is one flat page under its headings).
            const region = [];
            for (let el = place; el && (el === place || !(/^H[1-6]$/.test(el.tagName) && el.tagName <= place.tagName)); el = /^H[1-6]$/.test(place.tagName) ? el.nextElementSibling : null) region.push(el);
            const marks = region.flatMap(el => (el.matches(`[data-claim="${c.id}"]`) ? [el] : []).concat(Array.from(el.querySelectorAll(`[data-claim="${c.id}"]`))));
            const inSight = (el) => !figures.foldAround(el) && !el.closest('[data-lens-panel][hidden]');
            const elsewhere = doc ? Array.from(doc.querySelectorAll(`[data-claim="${c.id}"]`)).some(inSight) : false;
            const fold = marks.length && !marks.some(el => !figures.foldAround(el)) ? figures.foldAround(marks[0]) : null;
            const why = !(frag || lens) ? (file === '404.html' ? '' : 'a bare link, to the top of the page')
                : !marks.length ? 'no mark of it there'
                    : fold && elsewhere ? 'folded there, while the page shows it in sight elsewhere'
                        : fold && !fold.contains(place) ? 'folded, and the address is outside the fold, so nothing opens it'
                            : fold && !/, (?:in|under|behind) /.test(a.textContent) ? 'folded, and the link does not say where it waits' : '';
            if (why) wrongPlace.push(`${c.id}: ${a.getAttribute('href')} (${why})`);
        });
        const actual = Array.from(MARKS.get(c.id) || []).sort();
        if (JSON.stringify(listed) !== JSON.stringify(actual)) wrongWhere.push(`${c.id}: says ${listed.join(', ') || 'nowhere'}, marked on ${actual.join(', ') || 'none'}`);
        const spoken = /the narration/.test(li.querySelector('.cl-where').textContent);
        if (spoken !== (c.spoken || []).some(s => narration.toLowerCase().includes(s.toLowerCase()))) wrongWhere.push(`${c.id}: the narration ${spoken ? 'named but silent' : 'says it, unnamed'}`);

        const checkable = content.checkabilityOf(c, data.projects);
        const chip = li.querySelector('.cl-check');
        if (!chip || !chip.classList.contains(`cl-check-${checkable}`)) wrongCheck.push(`${c.id}: shown as ${chip && chip.className}, is ${checkable}`);
        const link = li.querySelector('.cl-meta > a');
        if (checkable === 'public' && !link) wrongCheck.push(`${c.id}: checkable, with nowhere to check`);
        if (checkable !== 'public' && link) wrongCheck.push(`${c.id}: not checkable, yet linked as if it were`);
        if (link && !/^https?:/.test(link.getAttribute('href'))) {
            const [file, frag] = link.getAttribute('href').split('#');
            if (!docs[file] && !fs.existsSync(path.join(ROOT, file))) wrongCheck.push(`${c.id}: ${file} is not a page`);
            else if (frag && docs[file] && !docs[file].getElementById(frag)) wrongCheck.push(`${c.id}: ${file} has no #${frag}`);
        }
    });
    assert(Object.keys(CLAIM_PAGES).every(p => PAGES.includes(p)), 'claims.html: reads the marks on every page this test scans');

    // "Not on this list" names what the scan lets by. The core log's depths
    // and the flood game's steps were let by here and named nowhere there;
    // the open counts page was excused for its counts, not its rules.
    const notListed = doc.querySelector('.cl-not-listed').textContent.replace(/\s+/g, ' ');
    const unnamed = Object.values(figures.DRAWN).flat().filter(d => d.listed && !notListed.toLowerCase().includes(d.listed.toLowerCase())).map(d => d.sel)
        .concat(Object.values(figures.DRAWN).flat().filter(d => !d.listed && !/^(?:a count of|the visit counter's own counts|the example of)/.test(d.why)).map(d => d.sel));
    assert(unnamed.length === 0 && /rules it states[^.]*printed there from the counter’s code, and a test fails the build/.test(notListed),
        `claims.html: "Not on this list" names every kind of numeral the scan lets by, and says the open counts page's rules are held to the code (${unnamed.join(', ') || 'all named'})`);
    assert(wrongWhere.length === 0, `claims.html: where each figure appears is where the pages mark it (${wrongWhere.join('; ') || 'all agree'})`);
    assert(wrongPlace.length === 0, `claims.html: each "Where" link lands on a section or a view that shows the figure, and every one into the case studies has one (${wrongPlace.join('; ') || 'all do'})`);
    assert(wrongCheck.length === 0, `claims.html: each says whether it can be checked as the ledger does, and a checkable one links to a place that exists (${wrongCheck.join('; ') || 'all do'})`);
}

// ===================================================================
// The way in: the homepage's figures, the footers, the field report
// ===================================================================
{
    const home = docs['index.html'];
    const stats = home.querySelector('.hero-stats');
    const link = stats && stats.nextElementSibling && stats.nextElementSibling.querySelector('a[href="claims.html"]');
    assert(!!link && /every number on this site, with its basis/i.test(link.textContent),
        `Homepage: right under the hero's figures, a link to every number on the site with its basis (${link ? link.textContent.trim() : 'none'})`);
    assert(Array.from(stats.querySelectorAll('.hero-stat-number')).every(n => n.hasAttribute('data-claim')), 'Homepage: each of the hero\'s figures is marked');
    assert(!!home.querySelector('footer a[href="claims.html"]'), 'Homepage: the footer links the ledger too');

    // Every page with the shell's footer links it, the ledger itself marked as here.
    const footed = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).filter(f => /<footer class="ca-foot">/.test(read(f)));
    const missing = footed.filter((f) => {
        const a = new JSDOM(read(f)).window.document.querySelector('footer.ca-foot a[href="claims.html"]');
        return !a || (f === 'claims.html') !== (a.getAttribute('aria-current') === 'page');
    });
    assert(footed.length >= 5 && missing.length === 0, `Shell: every footer links "Check my numbers", marked current on its own page (${footed.length} footers; wrong: ${missing.join(', ') || 'none'})`);
    assert(!!docs['field-report.html'].querySelector('main a[href="claims.html"]'), 'Field report: its evidence list links the ledger');
    // The 404 page has no shell footer, and it marks a figure too.
    assert(!!docs['404.html'].querySelector('main nav a[href$="/claims.html"]'), '404: beside the open counts, a link to the ledger');

    // A page like any other: in the sitemap, with a byte budget and a length budget.
    const budget = require('../scripts/check-budget.js');
    assert(data.profile.pages.some(p => p.path === 'claims.html'), 'claims.html: in profile.json\'s pages, so in the sitemap');
    assert(budget.PAGE_BUDGETS['claims.html'] && budget.BUDGETS[budget.PAGE_BUDGETS['claims.html']] && budget.LENGTH['claims.html'],
        'claims.html: has a first-view budget and a length budget in scripts/check-budget.js');
    assert(/GENERATED by scripts\/build-content\.js/.test(read('claims.html').slice(0, 900)), 'claims.html: generated, never hand-edited');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
