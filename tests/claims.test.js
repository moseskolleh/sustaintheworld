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
//   · a numeral on any page is neither marked nor one of the kinds that are
//     not claims (a year, a section number, a standard's name…), each
//     printed with its page and the words around it, so fixing is easy;
//   · the narration says a number in words that no entry backs;
//   · claims.html leaves an entry out, or says it appears somewhere it
//     does not.
//
// The scan reads the pages as shipped, with no script run, so a number a
// calculator works out in the browser is not on them: those hosts are named
// below, and must hold no figure of their own in the HTML.
//
// Run with: node tests/claims.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
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

// The pages a figure can be on. stats.html is the visit counter's own
// measurements, rewritten weekly, and says what each counts beside it.
const PAGES = ['index.html', 'case-studies.html', 'research.html', 'carbon-ai.html', 'field-report.html', '404.html', 'claims.html'];
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

// ===================================================================
// The scan: a numeral nobody marked
// ===================================================================
// Hosts whose numbers are worked out in the browser: model outputs, not
// claims. In the HTML as shipped each holds a placeholder.
const RUNTIME = {
    'index.html': ['#ydi', '#carbonBadgeText', '#receiptBody', '#assayResult'],
    'carbon-ai.html': ['.ca-out', '[id^="equiv"]', '#tipsList', '#chartBars', '.ca-hint', '#inputNotice',
        '#anatomyDraw', '#ledgerReviewed', '#ledgerTable', '#ledgerSources', 'select'],
    'case-studies.html': ['#drillResult', '#drillScore', '#floodNote', '#floodLevelLabel']
};
// Numerals made from the page's own structure, not claims about anything.
const COUNTED = {
    'index.html': [['.corelog-depth, .corelog-head', 'the core log\'s depth scale: time drawn as depth']],
    'case-studies.html': [['.cs-photos > summary', 'a count of the photos in the row, made from the gallery'],
        ['.flood-ticks', 'the river slider\'s steps, on a schematic not drawn to scale']],
    'research.html': [['.rs-summary', 'a count of the entries the page lists, made from them']]
};
const SKIP = 'script, style, svg, template, noscript, [data-claim]';
// The words around a numeral: its block, or the span it sits in (tags and
// chips run together without a space between them).
const BLOCK = 'span, p, li, dd, dt, h1, h2, h3, h4, h5, h6, td, th, figcaption, summary, label, a, button, div, section, header, footer, main, body';
const NUMERAL = /(?<![A-Za-z\d.,])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;

/** Every numeral in `root`'s text outside `skip`, with the words around it and the reason it is let through, if any. */
function numerals(doc, root, skip) {
    const found = [];
    const walk = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        if (!/\d/.test(node.textContent) || node.parentElement.closest(skip)) continue;
        const block = node.parentElement.closest(BLOCK) || root;
        let offset = 0;
        const inner = doc.createTreeWalker(block, 4);
        for (let t = inner.nextNode(); t && t !== node; t = inner.nextNode()) offset += t.textContent.length;
        const text = block.textContent;
        NUMERAL.lastIndex = 0;
        let m;
        while ((m = NUMERAL.exec(node.textContent))) {
            const at = offset + m.index;
            const words = text.slice(Math.max(0, at - 40), at + m[0].length + 40).replace(/\s+/g, ' ').trim();
            found.push({ numeral: m[0], words, why: figures.exemptAt(text, at, at + m[0].length) });
        }
    }
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

PAGES.forEach((page) => {
    const doc = docs[page];
    const runtime = RUNTIME[page] || [];
    const counted = COUNTED[page] || [];
    const skip = [SKIP].concat(runtime, counted.map(([sel]) => sel)).join(', ');
    const unmarked = numerals(doc, doc.body, skip).filter(n => !n.why);
    unmarked.forEach(n => console.log(`  unmarked: ${page}: ${n.numeral} in "…${n.words}…"`));
    assert(unmarked.length === 0,
        `${page}: every numeral is marked with its ledger entry, or is a year, a date, a section number, a standard's name or the like (${unmarked.length} unmarked${unmarked.length ? ', listed above' : ''})`);

    // A host the scan skips has to earn it: present, and with no figure typed into it.
    const typed = [];
    runtime.concat(counted.map(([sel]) => sel)).forEach((sel) => {
        const hosts = doc.querySelectorAll(sel);
        if (!hosts.length) typed.push(`${sel} is not on the page`);
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
    const constant = (name) => ((script.match(new RegExp(`const ${name} = ([\\d.]+);`)) || [])[1]);
    assert(figures.agrees(byId.get('median-page').value, constant('MEDIAN_PAGE_MB')) && figures.agrees(byId.get('web-carbon').value, constant('G_CO2_PER_MB')),
        `Ledger: the badge in script.js compares against the ledger's median page and weighs with its grams per MB (${constant('MEDIAN_PAGE_MB')}, ${constant('G_CO2_PER_MB')})`);

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
        figures.wordRuns(text).forEach((run) => {
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

    const { CLAIM_PAGES } = require('../scripts/build-content.js');
    const wrongWhere = [];
    const wrongCheck = [];
    items.forEach((li) => {
        const c = byId.get(li.id.replace(/^claim-/, ''));
        if (!c) return;
        const listed = Array.from(li.querySelectorAll('.cl-where a')).map(a => a.getAttribute('href').split('#')[0]).sort();
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
    assert(wrongWhere.length === 0, `claims.html: where each figure appears is where the pages mark it (${wrongWhere.join('; ') || 'all agree'})`);
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
