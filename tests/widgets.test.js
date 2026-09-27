// The two project games, where they live now: case-studies.html.
//
// "Seven in ten" and the borehole game were two widgets making one point,
// and with the flood slider they sat inside the homepage's collapsed
// dossiers, where most readers never opened them. They are one widget and
// one slider now, each under the result it is about, loaded only when a
// reader scrolls near it, on a page that has no script.js to lean on. What
// follows boots that page in jsdom: the loader that fetches them, the
// module on its own, a round of each, the labels that keep the illustrative
// 30% honest, and the page without JavaScript. A real browser plays them
// too, and measures their labels on a phone (scripts/smoke.js).
//
// Run with: node tests/widgets.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const page = read('case-studies.html');
const moduleJs = read('modules/dossier.js');
const moduleCss = read('modules/dossier.css');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

/**
 * case-studies.html with the module evaluated, as the loader leaves it.
 *   storage: 'blocked'   the storage getters throw, as under a strict policy
 *   eco:     'on'        low-energy mode, as stored on the homepage
 *   reduced: true        prefers-reduced-motion matches
 *   width:   px          how wide each drawing is shown
 */
function boot(opts = {}) {
    const dom = new JSDOM(page, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.com/case-studies.html' });
    const { window } = dom;
    const errors = [];
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    window.console.error = (...a) => errors.push(a.join(' '));
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    const frames = [];
    window.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
    window.cancelAnimationFrame = () => {};
    window.matchMedia = (q) => ({ matches: !!opts.reduced && /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} });
    if (opts.eco) window.localStorage.setItem('eco-mode', opts.eco);
    if (opts.storage === 'blocked') {
        ['localStorage', 'sessionStorage'].forEach((name) => Object.defineProperty(window, name, {
            configurable: true, get() { throw new window.DOMException('Access to storage is not allowed.', 'SecurityError'); }
        }));
    }
    // jsdom lays nothing out: each drawing is given the width a browser would.
    const width = opts.width || 700;
    window.SVGElement.prototype.getBoundingClientRect = function () {
        return { left: 0, top: 0, right: width, bottom: width / 2, width, height: width / 2 };
    };
    let caught = null;
    try { window.eval(moduleJs); } catch (err) { caught = err; }
    // Animation frames run only when a test asks for them.
    const flush = (t) => { const now = frames.splice(0); now.forEach(fn => fn(t)); return now.length; };
    return { window, doc: window.document, errors, caught, flush };
}

const click = (window, el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const key = (window, el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

// ===================================================================
// The loader: nothing on arrival, the module once a host nears the screen
// ===================================================================
{
    const observers = [];
    const tracked = [];
    const dom = new JSDOM(page, {
        runScripts: 'dangerously',
        url: 'https://example.com/case-studies.html',
        beforeParse(w) {
            w.IntersectionObserver = class {
                constructor(cb, o) { this.cb = cb; this.o = o; this.els = []; this.off = false; observers.push(this); }
                observe(el) { this.els.push(el); }
                unobserve() {}
                disconnect() { this.off = true; }
            };
            w.mks = { track: (n) => tracked.push(n) };
        }
    });
    const { window } = dom;
    const doc = window.document;
    const fetched = () => Array.from(doc.head.querySelectorAll('link[rel="stylesheet"], script[src]')).map(e => e.getAttribute('href') || e.getAttribute('src')).filter(u => /dossier/.test(u));

    const io = observers.find(o => o.els.some(e => e.hasAttribute('data-widget')));
    assert(!!io && io.els.length === 2 && io.els.every(e => e.hasAttribute('data-widget')), 'Loader: both widget hosts are watched');
    assert(!!io && /^100%/.test(io.o.rootMargin), `Loader: it starts a screen ahead of them (rootMargin ${io && io.o.rootMargin})`);
    assert(fetched().length === 0, 'Loader: nothing of the widgets is fetched on arrival');

    io.cb([{ target: io.els[0], isIntersecting: false }]);
    assert(fetched().length === 0, 'Loader: a host still out of range fetches nothing');
    io.cb([{ target: io.els[1], isIntersecting: true }]);
    assert(fetched().join() === 'modules/dossier.css' && io.off, `Loader: in range, the stylesheet comes first, and the watch ends (${fetched().join(', ')})`);
    doc.head.querySelector('link[href="modules/dossier.css"]').onload();
    assert(fetched().join() === 'modules/dossier.css,modules/dossier.js', `Loader: the script follows once the styles are in (${fetched().join(', ')})`);
    io.cb([{ target: io.els[0], isIntersecting: true }]);
    assert(fetched().length === 2, 'Loader: a second host in range fetches nothing twice');
    doc.head.querySelector('script[src="modules/dossier.js"]').onload();
    assert(tracked.join() === 'module-dossier', `Loader: the visit counter hears the feature was reached, by the name it knows (${tracked.join(', ')})`);

    // No IntersectionObserver: the widgets load at once rather than never.
    const bare = new JSDOM(page, { runScripts: 'dangerously', url: 'https://example.com/case-studies.html', beforeParse(w) { delete w.IntersectionObserver; } });
    assert(!!bare.window.document.head.querySelector('link[href="modules/dossier.css"]'), 'Loader: without IntersectionObserver it loads them straight away');
}

// ===================================================================
// The module, on a page without script.js
// ===================================================================
{
    const before = new JSDOM(page).window.document;
    assert(Array.from(before.querySelectorAll('.dw-live')).every(l => l.hidden), 'Module: before it runs, every host hides its controls');

    const { window, doc, errors, caught } = boot();
    assert(!caught && errors.length === 0, `Module: runs on case-studies.html, which has no script.js, without an error (${caught || errors.join('; ') || 'none'})`);
    assert(window.mks && window.mks.loaded && window.mks.loaded.dossier === true, 'Module: makes its own window.mks and marks itself loaded');
    const hosts = Array.from(doc.querySelectorAll('[data-widget]'));
    assert(hosts.length === 2 && hosts.every(h => h.classList.contains('is-live') && !h.querySelector('.dw-live').hidden),
        'Module: shows each host\'s controls once it has wired them');
    assert(!!doc.querySelector('#boreholeStage svg') && !!doc.querySelector('#floodStage svg'), 'Module: draws both scenes');

    // A classic script on a page with other scripts: no top-level names.
    const topLevel = moduleJs.split('\n').filter(l => /^(const|let|var|class|function|async function)\s/.test(l));
    assert(topLevel.length === 0, `Module: declares nothing at the top level (${topLevel.join(' | ') || 'none'})`);
    assert(!/document\.addEventListener\(\s*['"]keydown/.test(moduleJs), 'Module: listens for keys on its own controls, never on the document');

    const blocked = boot({ storage: 'blocked' });
    assert(!blocked.caught && blocked.errors.length === 0 && blocked.doc.querySelector('[data-widget="borehole"]').classList.contains('is-live'),
        'Module: storage that throws on access does not take it down');

    // Where the homepage core is there, its helpers answer.
    const withCore = new JSDOM(page, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.com/case-studies.html' });
    let asked = 0;
    withCore.window.mks = { motionOK: () => { asked++; return false; }, storage: { local: { get: () => null } } };
    withCore.window.IntersectionObserver = class { observe() {} disconnect() {} };
    withCore.window.eval(moduleJs);
    click(withCore.window, withCore.window.document.getElementById('drillBtn'));
    assert(asked > 0 && !/Drilling…/.test(withCore.window.document.getElementById('drillResult').textContent),
        'Module: with the core present it asks mks.motionOK, and a calm answer drills at once');
}

// ===================================================================
// Seven in ten: one round, and a scoreboard that keeps the 30% honest
// ===================================================================
{
    const { window, doc, errors } = boot({ eco: 'on' });   // low-energy: every drill finishes at once
    const host = doc.querySelector('[data-widget="borehole"]');
    const stage = doc.getElementById('boreholeStage');
    const result = doc.getElementById('drillResult');
    const score = doc.getElementById('drillScore');
    const rows = Array.from(host.querySelectorAll('.strike-row'));
    const cells = (row, cls) => row.querySelectorAll(`.strike-cell${cls ? '.' + cls : ''}`).length;

    assert(rows.length === 3 && rows.every(r => cells(r) === 10), 'Scoreboard: three rows of ten, one board, no slider of its own');
    assert(!host.querySelector('input[type="range"]'), 'Scoreboard: one set of controls: the game\'s');
    assert(cells(rows[1], 'water') === 7 && cells(rows[2], 'water') === 3, 'Scoreboard: the fixed rows show 7 and 3 in 10');
    assert(/7 in 10, field records/.test(text(rows[1])) && /3 in 10, illustrative/.test(text(rows[2])), `Scoreboard: each fixed row says what it is (${text(rows[1])} | ${text(rows[2])})`);
    assert(rows.every(r => r.querySelector('.strike-waffle').getAttribute('aria-hidden') === 'true'), 'Scoreboard: the cells are decoration; each label carries its numbers');
    assert(cells(rows[0], 'water') + cells(rows[0], 'dry') === 0 && /drill to fill this row/.test(text(score)), 'Scoreboard: your row starts empty and says how to fill it');

    // One round: walk the rig along the profile, drilling, until water.
    for (let i = 0; i < 80; i++) key(window, stage, 'ArrowLeft');
    let struck = false, holes = 0;
    for (let i = 0; i < 80 && !struck; i++) {
        click(window, doc.getElementById('drillBtn'));
        if (!/already/i.test(result.textContent)) holes++;   // a known zone re-drilled is not a new hole
        struck = /STRIKE/.test(result.textContent);
        if (!struck) for (let k = 0; k < 2; k++) key(window, stage, 'ArrowRight');
    }
    assert(struck && errors.length === 0, `Round: walking the rig along the profile finds water (${holes} holes)`);
    const m = text(score).match(/(\d+) of (\d+) struck water/);
    assert(!!m && +m[1] >= 1 && +m[2] === holes, `Round: the score counts every new hole and every strike (${text(score)})`);
    assert(cells(rows[0], 'water') === Math.min(+m[1], 10) || holes > 10, 'Round: your row fills with your strikes');
    assert(cells(rows[0], 'water') + cells(rows[0], 'dry') === Math.min(holes, 10), `Round: one cell per hole, the last ten (${cells(rows[0], 'water')} water, ${cells(rows[0], 'dry')} dry of ${holes})`);
    assert(/\(\d+\/\d+\)/.test(result.textContent), 'Round: each hole\'s message carries the tally, for a screen reader (the result is a live region)');
    assert(stage.getAttribute('aria-valuetext').startsWith('rig at ') && /resistivity (very low|low|slightly low|high)/.test(stage.getAttribute('aria-valuetext')),
        `Round: the rig's position and the curve under it are spoken (${stage.getAttribute('aria-valuetext')})`);

    // Bug 11, as it was on the homepage: a strike re-drilled is no new strike.
    const tally = text(score);
    click(window, doc.getElementById('drillBtn'));
    click(window, doc.getElementById('drillBtn'));
    assert(text(score) === tally, `Bug11: re-drilling the same strike leaves the score alone (${tally} → ${text(score)})`);
    assert(/Already struck/.test(result.textContent), 'Bug11: and says why it did not count');

    // A new site: new zones, the score kept.
    click(window, doc.getElementById('drillResetBtn'));
    assert(text(score) === tally && /New site surveyed/.test(result.textContent), 'Round: a new site keeps your score and says it is new');

    // The 30% has no recorded source. Wherever the widget shows it, it says so.
    const lines = Array.from(host.querySelectorAll('h4, p, span')).filter(el => !el.children.length || el.matches('p'))
        .map(text).filter(t => /30%|3 in 10|blind/i.test(t));
    assert(lines.length >= 2 && lines.every(t => /illustrative/.test(t)),
        `Illustrative: every line of the widget that mentions blind drilling says illustrative (${lines.join(' / ')})`);
    assert(/illustrative\s+—\s+not a measured figure/.test(text(host.querySelector('.cs-play-summary'))), 'Illustrative: the summary says the 30% is not measured');
}

// The curve is the whole of the information, and a screen reader hears it:
// walking the rig to where the reading says "very low" and drilling there
// finds water, as reading the resistivity curve did in the field.
{
    const hits = [];
    for (let run = 0; run < 10; run++) {
        const { window, doc } = boot({ eco: 'on' });
        const stage = doc.getElementById('boreholeStage');
        for (let k = 0; k < 30; k++) key(window, stage, 'ArrowLeft');
        let struck = false;
        for (let hole = 0; hole < 3 && !struck; hole++) {
            for (let k = 0; k < 56 && !/very low/.test(stage.getAttribute('aria-valuetext')); k++) key(window, stage, 'ArrowRight');
            key(window, stage, 'Enter');
            struck = /STRIKE/.test(doc.getElementById('drillResult').textContent);
            for (let k = 0; k < 6; k++) key(window, stage, 'ArrowRight');
        }
        hits.push(struck);
    }
    assert(hits.every(Boolean), `Round: drilling where the spoken reading says "very low" strikes water within three holes (${hits.filter(Boolean).length} of 10 sites)`);
}

// Ten holes and more: the row shows the last ten and says so.
{
    // One hole per freshly surveyed site: twelve holes, none of them a repeat.
    const { window, doc } = boot({ eco: 'on' });
    for (let i = 0; i < 12; i++) {
        click(window, doc.getElementById('drillBtn'));
        click(window, doc.getElementById('drillResetBtn'));
    }
    const score = text(doc.getElementById('drillScore'));
    const row = doc.querySelector('.strike-row');
    assert(/ of 12 struck water, the last 10 shown$/.test(score) && row.querySelectorAll('.strike-cell.water, .strike-cell.dry').length === 10,
        `Round: past ten holes, your row keeps the last ten and says so (${score})`);
}

// Motion: the drill runs down over frames, unless the reader asked for calm.
{
    const moving = boot();
    click(moving.window, moving.doc.getElementById('drillBtn'));
    assert(/Drilling…/.test(moving.doc.getElementById('drillResult').textContent) && moving.doc.getElementById('drillBtn').disabled,
        'Motion: with motion allowed the hole is drilled over frames, the button held until it lands');
    let guard = 0;
    while (moving.flush(1e6) && guard++ < 5);
    assert(!/Drilling…/.test(moving.doc.getElementById('drillResult').textContent) && !moving.doc.getElementById('drillBtn').disabled, 'Motion: and when it lands, the result is told and the button is back');

    const reduced = boot({ reduced: true });
    click(reduced.window, reduced.doc.getElementById('drillBtn'));
    assert(!/Drilling…/.test(reduced.doc.getElementById('drillResult').textContent), 'Motion: under reduced motion the hole is drilled at once');
    const eco = boot({ eco: 'on' });
    click(eco.window, eco.doc.getElementById('drillBtn'));
    assert(!/Drilling…/.test(eco.doc.getElementById('drillResult').textContent), 'Motion: and in the low-energy mode the reader chose on the homepage');
}

// ===================================================================
// Labels a phone can read
// ===================================================================
{
    // The drawings are 800 units wide; the module tells the stylesheet how
    // many units a CSS pixel is as drawn, and the stylesheet sizes every
    // label in those units. At a fixed 12 units a label was ~5px on a phone.
    const phone = boot({ width: 290 });
    const svg = phone.doc.querySelector('#boreholeStage svg');
    const k = parseFloat(svg.style.getPropertyValue('--k'));
    assert(Math.abs(k - 800 / 290) < 0.01, `Labels: a drawing shown 290px wide is told its scale (--k ${k})`);
    const flood = parseFloat(phone.doc.querySelector('#floodStage svg').style.getPropertyValue('--k'));
    assert(Math.abs(flood - 800 / 290) < 0.01, `Labels: so is the flood scene (--k ${flood})`);
    const labels = Array.from(svg.querySelectorAll('text'));
    const onShow = labels.filter(t => t.style.display !== 'none').map(t => t.textContent);
    assert(!onShow.includes('high') && !onShow.includes('low') && onShow.some(t => /dips read low/.test(t)),
        `Labels: where "high" and "low" would sit on the curve, they give way and the title says which way is low (${onShow.join(' | ')})`);

    const desk = boot({ width: 760 });
    const deskLabels = Array.from(desk.doc.querySelectorAll('#boreholeStage svg text')).filter(t => t.style.display !== 'none').map(t => t.textContent);
    assert(deskLabels.includes('high') && deskLabels.includes('low'), `Labels: with room, the curve keeps its "high" and "low" (${deskLabels.join(' | ')})`);

    // What the stylesheet does with the scale: 12px, 11 for small print,
    // and no drawing label at a fixed size anywhere.
    assert(/\.bh-label,\s*\.fl-label\s*\{[^}]*font-size:\s*calc\(12px \* var\(--k, 1\)\)/.test(moduleCss) &&
        /\.bh-label-dim\s*\{[^}]*font-size:\s*calc\(11px \* var\(--k, 1\)\)/.test(moduleCss),
        'Labels: the stylesheet sizes drawing labels at 12px and 11px times the scale');
    const fixed = (moduleCss.match(/\.(?:bh|fl)-[\w-]+[^{]*\{[^}]*font-size:\s*[\d.]+px\s*;/g) || []);
    assert(fixed.length === 0, `Labels: no drawing label has a fixed size in drawing units (${fixed.join(' | ') || 'none'})`);
    assert(/\.dw-label,\s*\.flood-ticks,\s*\.strike-row-label\s*\{[^}]*font-size:\s*0\.72rem/.test(moduleCss), 'Labels: the labels around the drawings are 0.72rem, 11.5px');
}

// ===================================================================
// Don't let it become a boat: the river rises, and says so
// ===================================================================
{
    const { window, doc, errors, flush } = boot();
    const slider = doc.getElementById('floodSlider');
    const water = () => +doc.querySelector('#floodStage rect.fl-water[x="252"]').getAttribute('y');
    const calm = water();
    const set = (v) => { slider.value = String(v); slider.dispatchEvent(new window.Event('input', { bubbles: true })); };

    set(3);
    let guard = 0;
    while (flush(1e6) && guard++ < 5);
    const flood = water();
    assert(flood < calm - 80, `Flood: raised to July 2021, the channel water climbs towards the cars (y ${calm} → ${flood})`);
    assert(doc.getElementById('floodLevelLabel').textContent === 'July 2021' && /2021 flood/.test(doc.getElementById('floodNote').textContent),
        'Flood: the level and the note follow the slider');
    assert(slider.getAttribute('aria-valuetext') === 'river at the July 2021 flood level', `Flood: the slider speaks the level, not a number (${slider.getAttribute('aria-valuetext')})`);
    set(1);
    assert(slider.getAttribute('aria-valuetext') === 'river +1 m above normal', `Flood: a step up is spoken as one (${slider.getAttribute('aria-valuetext')})`);
    set(0);
    while (flush(1e6) && guard++ < 10);
    assert(water() === calm && slider.getAttribute('aria-valuetext') === 'normal river level', 'Flood: and back down to a calm day');
    assert(errors.length === 0, 'Flood: no errors');

    // Under reduced motion the water is set, not animated.
    const still = boot({ reduced: true });
    const s2 = still.doc.getElementById('floodSlider');
    s2.value = '2';
    s2.dispatchEvent(new still.window.Event('input', { bubbles: true }));
    assert(+still.doc.querySelector('#floodStage rect.fl-water[x="252"]').getAttribute('y') === 222, 'Flood: under reduced motion the river is set at once');
}

// ===================================================================
// A game arriving above the reader does not move what they are reading
// ===================================================================
{
    // The loader starts a screen early, so the flood host can go live just
    // above a reader of the next case study. It grows by its whole widget;
    // a browser without scroll anchoring (Safari) moved the page ~500px.
    // jsdom lays nothing out, so each host is given a box: the flood host
    // above the screen, 60px tall as a summary and 560px live; the borehole
    // host below it. `anchors` plays a browser that absorbs growth itself.
    const run = (anchors) => {
        const dom = new JSDOM(page, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.com/case-studies.html' });
        const { window } = dom;
        window.IntersectionObserver = class { observe() {} disconnect() {} };
        window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
        window.SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 700, bottom: 350, width: 700, height: 350 });
        let y = 4000;
        const scrolls = [];
        Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
        window.scrollBy = (x, dy) => { scrolls.push(dy); y += dy; };
        const flood = window.document.getElementById('play-flood');
        const bore = window.document.getElementById('play-borehole');
        let absorbed = false;
        flood.getBoundingClientRect = () => {
            const h = flood.classList.contains('is-live') ? 560 : 60;
            if (h === 560 && anchors && !absorbed) { absorbed = true; y += 500; }
            const top = -100 - (y - 4000);
            return { left: 0, right: 700, width: 700, top, bottom: top + h, height: h };
        };
        bore.getBoundingClientRect = () => {
            const h = bore.classList.contains('is-live') ? 700 : 60;
            return { left: 0, right: 700, width: 700, top: 900, bottom: 900 + h, height: h };
        };
        window.eval(moduleJs);
        return scrolls;
    };
    const plain = run(false);
    assert(plain.length === 1 && plain[0] === 500, `Hold: a host going live above the screen scrolls the page by its growth, once, and one below it does not (${plain.join(', ') || 'no scroll'})`);
    const anchored = run(true);
    assert(anchored.length === 0, `Hold: where the browser has already absorbed the growth, it does not scroll again (${anchored.join(', ') || 'no scroll'})`);
}

// ===================================================================
// Without JavaScript, and every way into them
// ===================================================================
{
    const doc = new JSDOM(page).window.document;
    const hosts = Array.from(doc.querySelectorAll('[data-widget]'));
    hosts.forEach((h) => {
        const summary = text(h.querySelector('.cs-play-summary'));
        assert(summary.length > 60 && !h.querySelector('.cs-play-summary [hidden]'), `No JS: #${h.id} shows one line in place of its widget ("${summary.slice(0, 60)}…")`);
    });
    assert(/schematic, not to scale/.test(text(doc.querySelector('#play-flood .cs-play-summary'))), 'No JS: the flood summary says the drawing is a schematic');

    // Links into the games, from anywhere on the site, land on a host.
    const ids = new Set(hosts.map(h => h.id));
    const links = [];
    ['index.html', 'case-studies.html', 'research.html', 'field-report.html', 'carbon-ai.html'].forEach((rel) => {
        (read(rel).match(/href="(?:case-studies\.html)?#play-[a-z-]+"/g) || []).forEach(h => links.push(`${rel}: ${h}`));
    });
    const dead = links.filter(l => !ids.has(l.split('#')[1].replace('"', '')));
    assert(links.length >= 3 && dead.length === 0, `Links: every link into a game lands on its host (${links.length} links; dead: ${dead.join(', ') || 'none'})`);
    const stale = ['index.html', 'case-studies.html', 'modules/terminal.js', 'README.md', '404.html']
        .filter(rel => /#(?:boreholeGame|strikeWidget|floodSim)\b/.test(read(rel)));
    assert(stale.length === 0, `Links: nothing still points at the dossier ids the games had (${stale.join(', ') || 'none'})`);
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
