// The page without JavaScript, before it, and after it arrives late.
//
// With JavaScript off, or with script.js failing to load, the preloader used
// to cover the page for good and every .reveal block sat at opacity 0 —
// including the contact form, the one thing a visitor without JavaScript
// could still have used. The hero counters were written as 0 in the HTML and
// animated to "164+", a figure the rest of the site gives as exact. And the
// browser's [hidden] rule lost to class-level display six times, each one
// patched separately.
//
// The real browser checks are in scripts/smoke.js (every page with
// JavaScript disabled, script.js blocked, script.js late). What follows is
// the part jsdom can hold still: the markup and stylesheets that make the
// no-JavaScript page true, and the counter and takeover logic in script.js.
//
// Run with: node tests/nojs.test.js

const fs = require('fs');
const path = require('path');
const { run, ROOT, html } = require('./harness.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Every flat rule in a stylesheet as { selectors, body }. Rules nested in an
// @media block are included; the @media line itself is not a selector.
function rules(css) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(stripComments(css)))) {
        const selectors = m[1].split(',').map(s => s.trim()).filter(Boolean);
        out.push({ selectors, body: m[2] });
    }
    return out;
}

// ===================================================================
// <head> marks the page before first paint, and can take the mark back
// ===================================================================
{
    const head = html.slice(0, html.indexOf('</head>'));
    const mark = head.indexOf("document.documentElement.classList.add('js')");
    const firstStylesheet = head.indexOf('rel="stylesheet"');
    assert(mark > -1, 'Head: index.html marks the page html.js in <head>');
    assert(mark > -1 && (firstStylesheet === -1 || mark < firstStylesheet), 'Head: the mark is set before the stylesheet can paint anything');

    const inline = (head.match(/<script>([^<]*classList\.add\('js'\)[^<]*)<\/script>/) || [])[1] || '';
    assert(/setTimeout\(/.test(inline) && /\bmks\b[\s\S]*\.ready\b/.test(inline) && /classList\.remove\('js'\)/.test(inline),
        'Head: a failsafe takes the mark off again if script.js never reports ready');

    const tag = (html.match(/<script\b[^>]*\bsrc=["']script\.js["'][^>]*>/) || [''])[0];
    assert(/onerror=["'][^"']*classList\.remove\('js'\)/.test(tag), 'Head: a script.js that fails to load drops the mark at once (onerror)');

    const js = read('script.js');
    assert(/\bmks\.ready\s*=\s*true/.test(js), 'script.js: reports ready (mks.ready), so the failsafe can stand down');
}

// ===================================================================
// The hero figures are true before any script runs
// ===================================================================
{
    const stats = html.match(/<span class="hero-stat-number"[^>]*>[^<]*<\/span>/g) || [];
    assert(stats.length === 4, `Counters: four hero figures in the HTML (${stats.length})`);
    const wrong = stats.filter((s) => {
        const target = (s.match(/data-target="(\d+)"/) || [])[1];
        const text = (s.match(/>([^<]*)</) || [])[1];
        return !target || text !== target;
    });
    assert(wrong.length === 0, `Counters: each is written as its real value, not 0 (${wrong.join(' ') || 'none wrong'})`);

    const js = read('script.js');
    assert(!/target\s*\+\s*['"]\+['"]/.test(js), 'Counters: script.js appends no "+" to an exact count');
}

// ===================================================================
// The projects need nothing from JavaScript, and neither do their games
// ===================================================================
{
    // The six dossiers were collapsed by script.js, and their markup had to
    // say "expanded" for the reader without it. The cards that replaced
    // them have nothing to open: every word and link is in the HTML.
    const { JSDOM } = require('jsdom');
    const doc = new JSDOM(html).window.document;
    const cards = Array.from(doc.querySelectorAll('#projects .project-card'));
    assert(cards.length === 6 && cards.every(c => c.querySelector('h3') && c.querySelector('.project-claim') && c.querySelector('a.project-link[href]')),
        `Projects: six cards, each with its title, headline result and link in the served HTML (${cards.length})`);
    assert(!doc.querySelector('#projects button, #projects [aria-expanded]'), 'Projects: no control on a card that only a script could work');

    // The games moved to the case studies. Without JavaScript each host is
    // its heading and a line; the controls ship [hidden], and only the
    // module that wires them shows them.
    const cs = new JSDOM(read('case-studies.html')).window.document;
    const hosts = Array.from(cs.querySelectorAll('[data-widget]'));
    assert(hosts.length === 2 && hosts.every(h => h.querySelector('.dw-live[hidden]') && h.querySelector('.cs-play-summary').textContent.trim().length > 40),
        `Games: each host ships its controls hidden and a summary on show (${hosts.map(h => h.id).join(', ')})`);
    assert(hosts.every(h => Array.from(h.querySelectorAll('button, input, [tabindex]')).every(c => c.closest('[hidden]'))),
        'Games: no control of theirs is on show before the module has wired it');
}

// ===================================================================
// Copy that promises what only JavaScript does hides with it
// ===================================================================
{
    // Without JavaScript the section-05 chart is a note, so copy that
    // promises what only a script does must go with it. ("Click any one to
    // open" went with the dossiers; "the live widget on this page" with the
    // calculator to carbon-ai.html. Neither may come back outside .needs-js.)
    const { JSDOM } = require('jsdom');
    const doc = new JSDOM(html).window.document;
    ['click any one to open', 'the live widget on this page'].forEach((phrase) => {
        const holders = Array.from(doc.querySelectorAll('body *'))
            .filter(el => Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.includes(phrase)));
        assert(holders.every(el => el.closest('.needs-js')), `Copy: "${phrase}" is not promised where JavaScript cannot run`);
    });
    ['Watch the route unfold'].forEach((phrase) => {
        const holders = Array.from(doc.querySelectorAll('body *'))
            .filter(el => Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.includes(phrase)));
        assert(holders.length > 0 && holders.every(el => el.closest('.needs-js')), `Copy: "${phrase}" is inside .needs-js, so it goes when JavaScript cannot run`);
    });
}

// ===================================================================
// One [hidden] rule, and nothing hidden only because JavaScript is expected
// ===================================================================
['style.css', 'carbon-ai.css', 'content.css'].forEach((sheet) => {
    const all = rules(read(sheet));
    const patches = all.filter(r => r.selectors.some(s => /\[hidden\]/.test(s) && s !== '[hidden]'));
    assert(patches.length === 0, `${sheet}: no element-by-element [hidden] patch (${patches.map(r => r.selectors.join(', ')).join('; ') || 'none'})`);
});
{
    const global = rules(read('style.css')).filter(r => r.selectors.length === 1 && r.selectors[0] === '[hidden]');
    assert(global.length === 1 && /display:\s*none\s*!important/.test(global[0].body), 'style.css: one global [hidden] { display: none !important }');
    const shell = rules(read('carbon-ai.css')).filter(r => r.selectors.length === 1 && r.selectors[0] === '[hidden]');
    assert(shell.length === 1 && /display:\s*none\s*!important/.test(shell[0].body), 'carbon-ai.css: the same global rule (content.css pages load it too)');
}
{
    const all = rules(read('style.css'));
    // Each pair: something only script.js undoes, and the declaration that
    // hides it. Every rule that makes that declaration must be scoped to
    // html.js, or a visitor without JavaScript never sees what is behind it.
    const checks = [
        ['.preloader', /position:\s*fixed/, 'the preloader only covers the page when script.js can lift it'],
        ['.reveal', /opacity:\s*0\s*;/, 'reveal blocks are only transparent when script.js can show them'],
        ['.impact-seg', /width:\s*0\s*;/, 'impact bars are only empty when script.js can grow them']
    ];
    checks.forEach(([cls, decl, what]) => {
        const escaped = cls.replace('.', '\\.');
        const offenders = all.filter(r => decl.test(r.body))
            .flatMap(r => r.selectors)
            .filter(s => new RegExp(`${escaped}(?![\\w-])[^\\s]*$`).test(s))
            .filter(s => !/^html\.js\b/.test(s));
        assert(offenders.length === 0, `style.css: ${what} (unscoped: ${offenders.join(', ') || 'none'})`);
    });
}

// ===================================================================
// Other pages: a page whose stylesheet offers script-driven controls says
// in <head> that JavaScript is on
// ===================================================================
['carbon-ai.html', 'case-studies.html'].forEach((page) => {
    const src = read(page);
    const head = src.slice(0, src.indexOf('</head>'));
    assert(/<script>document\.documentElement\.classList\.add\('js'\)<\/script>/.test(head), `${page}: marks html.js in <head>`);
});
{
    const src = read('carbon-ai.html');
    assert(/class="nojs-note"/.test(src), 'carbon-ai.html: a note stands in for the calculator without JavaScript');
    // A calculator whose scripts never arrived showed blank selects and
    // dashes, with the note hidden because JavaScript was on. The visit
    // counter is not one of the calculator's scripts: a blocker that stops it
    // must not take the calculator down with it.
    const tags = (src.match(/<script\b[^>]*\bsrc=[^>]*>/g) || []).filter(t => !/\bsrc=["']count\.js["']/.test(t));
    assert(tags.length === 2 && tags.every(t => /onerror=["'][^"']*classList\.remove\('js'\)/.test(t)),
        `carbon-ai.html: each script that fails to load brings the note back (onerror on ${tags.filter(t => /onerror/.test(t)).length} of ${tags.length})`);
    assert(/class="nojs-note"/.test(html), 'index.html: a note stands in for the section-05 calculators without JavaScript');
}

// ===================================================================
// Counter behaviour in script.js
// ===================================================================
// A fake IntersectionObserver the test can fire by hand, and a matchMedia
// that answers only the reduced-motion question.
function fakes(window, { reduce = false, markJs = true, eco = null } = {}) {
    const observers = [];
    window.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
        observe(el) { this.targets.push(el); }
        unobserve(el) { this.targets = this.targets.filter(t => t !== el); }
        disconnect() { this.targets = []; }
    };
    window.matchMedia = (q) => ({
        matches: reduce && /prefers-reduced-motion:\s*reduce/.test(q),
        media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
    });
    window.document.documentElement.classList.toggle('js', markJs);
    if (eco) window.localStorage.setItem('eco-mode', eco);
    return observers;
}

// Everything the hero counters show, in order, from the moment script.js
// starts: a MutationObserver installed before it runs.
function recordCounters(window) {
    const seen = [];
    const doc = window.document;
    const snapshot = () => Array.from(doc.querySelectorAll('.hero-stat-number')).map(c => c.textContent).join('|');
    seen.push(snapshot());
    new window.MutationObserver(() => seen.push(snapshot()))
        .observe(doc.querySelector('.hero-stats'), { subtree: true, childList: true, characterData: true });
    return seen;
}

function fireStats(window, observers) {
    const stats = window.document.querySelector('.hero-stats');
    observers.filter(o => o.targets.includes(stats)).forEach(o => o.cb([{ isIntersecting: true, target: stats }], o));
}

const tick = (ms) => new Promise(r => setTimeout(r, ms));
const targets = (doc) => Array.from(doc.querySelectorAll('.hero-stat-number')).map(c => c.getAttribute('data-target')).join('|');

async function waitFor(fn, ms = 4000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (fn()) return true;
        await tick(20);
    }
    return fn();
}

// What a screen reader, Find or Reader mode meets in the stats: the text,
// minus anything aria-hidden.
function spoken(el) {
    return Array.from(el.childNodes).map((n) => (n.nodeType === 3 ? n.textContent
        : n.getAttribute('aria-hidden') === 'true' ? '' : spoken(n))).join(' ').replace(/\s+/g, ' ').trim();
}
const statsSaid = (doc) => Array.from(doc.querySelectorAll('.hero-stat'))
    .map(s => `${s.querySelector('.hero-stat-number').getAttribute('data-target')} ${s.querySelector('.hero-stat-label').textContent}`).join(' ');

async function counterCase(label, options, expectMotion) {
    let observers = [];
    let seen = [];
    const { window, errors } = run('dark', {
        before(w) {
            observers = fakes(w, options);
            seen = recordCounters(w);
        }
    });
    const doc = window.document;
    const written = targets(doc);

    await tick(0);   // the microtask that zeroes the counters, if they will move
    const beforeView = doc.querySelectorAll('.hero-stat-number')[0].textContent;
    const saidBefore = spoken(doc.querySelector('.hero-stats'));
    fireStats(window, observers);
    // Done when every count has ended (the digits can show the figure a
    // frame before the count ends, since they round up).
    const done = await waitFor(() => Array.from(doc.querySelectorAll('.hero-stat-number')).every(c => c.textContent === c.getAttribute('data-target'))
        && !doc.querySelector('.hero-stats .sr-only'));
    const final = Array.from(doc.querySelectorAll('.hero-stat-number')).map(c => c.textContent).join('|');

    assert(errors.length === 0, `${label}: no errors (${errors.map(String).join('; ').slice(0, 120) || 'none'})`);
    assert(done && final === written, `${label}: each counter ends on its exact value, nothing appended (${final})`);
    assert(!/\+/.test(seen.join('|')), `${label}: no "+" is ever shown`);
    // The stats sit below the fold, so until a scroll a zeroed counter used
    // to be all a screen reader heard: "0 Water points delivered".
    assert(saidBefore === statsSaid(doc), `${label}: before they are seen, the stats read as their real figures (${saidBefore})`);
    assert(spoken(doc.querySelector('.hero-stats')) === statsSaid(doc) && !doc.querySelector('.hero-stats .sr-only, .hero-stat-number[aria-hidden]'),
        `${label}: once counted, the figures are read from the digits again, with no copy left behind`);
    if (expectMotion) {
        assert(beforeView === '0', `${label}: set to 0 before it comes into view, to count up from (${beforeView})`);
        assert(seen.length > 3, `${label}: it counts up (${seen.length} states seen)`);
    } else {
        const states = [...new Set(seen)];
        assert(seen.every(s => s === written), `${label}: never moves from the value written in the HTML (${states.slice(0, 3).join(' → ')}${states.length > 3 ? ` → … ${states.length} states` : ''})`);
    }
    window.close();
}

// ===================================================================
// Taking over, on time and late
// ===================================================================
async function takeoverCase(label, markJs) {
    const { window, errors } = run('dark', { before(w) { fakes(w, { markJs }); } });
    const doc = window.document;
    const reveals = Array.from(doc.querySelectorAll('.reveal'));

    assert(errors.length === 0, `${label}: no errors`);
    assert(window.mks.ready === true, `${label}: script.js reports ready`);
    assert(doc.documentElement.classList.contains('js'), `${label}: the page is marked html.js once script.js has run`);
    if (markJs) {
        assert(reveals.some(el => !el.classList.contains('visible')), `${label}: reveals still wait to scroll into view`);
    } else {
        // A late start: <head> already showed everything. Putting the mark
        // back must not hide any of it again, and the intro must not replay.
        assert(reveals.length > 0 && reveals.every(el => el.classList.contains('visible')), `${label}: every reveal is marked done before the mark goes back (${reveals.filter(el => !el.classList.contains('visible')).length} not)`);
        assert(!doc.getElementById('preloader'), `${label}: the intro does not replay over a page already on screen`);
    }
    await tick(0);   // let the counters' microtask run before the window goes
    window.close();
}

// A late start puts the line being read back where it was, and holds it
// there while the widgets html.js brings back fill in. The one correction
// at takeover left the rest to scroll anchoring, which Safari does not do:
// with it off, the line slid hundreds to thousands of pixels away.
async function lateLineCase() {
    const observers = [];
    let lineTop = 240;
    let bodyHeight = 30000;
    const scrolls = [];
    const { window, errors } = run('dark', {
        before(w) {
            fakes(w, { markJs: false });
            w.ResizeObserver = class {
                constructor(cb) { this.cb = cb; this.on = false; observers.push(this); }
                observe(el) { this.on = el === w.document.body; }
                unobserve() {}
                disconnect() { this.on = false; }
            };
            const line = w.document.querySelector('#skills .section-description') || w.document.getElementById('skills');
            w.document.elementFromPoint = () => line;
            line.getBoundingClientRect = () => ({ top: lineTop, bottom: lineTop + 40, left: 0, right: 800, width: 800, height: 40 });
            line.getClientRects = () => [line.getBoundingClientRect()];   // on show, which jsdom cannot tell
            w.document.body.getBoundingClientRect = () => ({ top: 0, left: 0, right: 1280, bottom: bodyHeight, width: 1280, height: bodyHeight });
            w.scrollTo = (o) => { scrolls.push(o.top); lineTop -= o.top - w.pageYOffset; w.pageYOffset = o.top; };
        }
    });
    const report = () => observers.filter(o => o.on).forEach(o => o.cb([{ target: window.document.body }], o));

    assert(errors.length === 0, 'Late start, held line: no errors');
    lineTop = 1000;   // a section above grows to fit its widget, pushing the line down
    bodyHeight = 30760;
    report();
    assert(lineTop === 240 && scrolls.length === 1, `Late start, held line: when the page grows above it, the line is put back (at ${lineTop}px after ${scrolls.length} scroll(s))`);
    report();
    assert(scrolls.length === 1, 'Late start, held line: a report of the same height moves nothing');
    window.dispatchEvent(new window.Event('touchstart'));
    assert(observers.every(o => !o.on), 'Late start, held line: the reader\'s own touch lets go of it');
    await tick(20);   // let the modules' own start-up settle before the window goes
    window.close();
}

(async () => {
    await takeoverCase('Takeover (on time)', true);
    await takeoverCase('Takeover (late)', false);
    await lateLineCase();

    await counterCase('Counters (motion allowed)', {}, true);
    await counterCase('Counters (reduced motion)', { reduce: true }, false);
    await counterCase('Counters (low-energy mode)', { eco: 'on' }, false);
    await counterCase('Counters (late start)', { markJs: false }, false);

    // Low-energy mode switched on after the counters were zeroed but before
    // they came into view: they are put straight back, not counted up.
    {
        let observers = [];
        const { window } = run('dark', { before(w) { observers = fakes(w); } });
        const doc = window.document;
        await tick(0);
        const zeroed = doc.querySelector('.hero-stat-number').textContent;
        doc.getElementById('ecoModeToggle').click();
        fireStats(window, observers);
        const shown = Array.from(doc.querySelectorAll('.hero-stat-number')).map(c => c.textContent).join('|');
        assert(zeroed === '0' && shown === targets(doc), `Counters (low-energy mode switched on late): straight back to ${shown}, no count-up`);
        assert(spoken(doc.querySelector('.hero-stats')) === statsSaid(doc) && !doc.querySelector('.hero-stats .sr-only, .hero-stat-number[aria-hidden]'),
            'Counters (low-energy mode switched on late): read from the digits again, with no copy left behind');
        window.close();
    }

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    process.exit(0);
})().catch((err) => {
    console.log('FAIL:', err && err.stack || err);
    process.exit(1);
});
