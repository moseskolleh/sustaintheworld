// Less CPU, and tidier JavaScript behind it.
//
// Measured at 4x CPU slowdown, the homepage left alone spent about 1 s of
// every 3 s on the main thread (1.25 s mid-page) redrawing loops, most of
// them off screen; it laid out all nine sections on arrival, and re-measured
// them the moment anything asked. Behind that sat five document keydown
// listeners (four in the core, one the terminal added) that knew nothing of
// each other, eight separate "may this move?" checks, a 4 KB zone table in
// the core, and a dozen globals. These hold the replacements in place: one key
// router, one motion helper, the table fetched on demand, one namespace,
// one measurement a frame, loops held still out of sight, sections skipped
// past drawn once the page rests, and the stylesheet rules those depend on.
// What only a real browser can show (where a jump lands with
// content-visibility, whether reading back up moves the page, which loops
// are actually paused, how much the page idles) is in scripts/smoke.js.
//
// Run with: node tests/cpu.test.js

const fs = require('fs');
const path = require('path');
const { run, ROOT, MODULE_FILES } = require('./harness.js');

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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const key = (window, k, target, init) => {
    const ev = new window.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init || {}));
    (target || window.document.body).dispatchEvent(ev);
    return ev;
};

(async () => {
    // ===============================================================
    // One namespace
    // ===============================================================
    {
        let seeded = null;
        const { window, errors } = run('dark', { before: (w) => { seeded = w.mks = { track() {} }; } });
        const mks = window.mks;
        assert(errors.length === 0, `Globals: the page boots without errors (${errors.map(String).join('; ').slice(0, 160) || 'none'})`);
        assert(mks === seeded && typeof mks.track === 'function',
            'Globals: script.js adds to a window.mks another script made first (count.js), and never replaces it');

        const shared = ['storage', 'motionOK', 'scrollMotion', 'onKey', 'keyRank', 'load', 'loaded', 'carbon', 'ready',
            'terminal', 'narration', 'share', 'assay'];
        const missing = shared.filter(k => mks[k] === undefined);
        assert(missing.length === 0, `Globals: the core and its modules share everything through window.mks (missing: ${missing.join(', ') || 'none'})`);

        const OLD = ['mksStorage', 'mksScrollMotion', 'mksLoad', 'mksLoaded', 'mksCarbon', 'mksShare', 'mksAssay',
            'mksReady', 'FieldTerminal', 'FieldDispatch'];
        const left = OLD.filter(k => k in window);
        assert(left.length === 0, `Globals: none of the old names is left on window (${left.join(', ') || 'none'})`);
        assert(!('hold' in window) && !('releaseHold' in window), 'Globals: the hold that keeps a jump on target is the core\'s own, not a name on window');
        // A classic script's top-level function declaration is a property of
        // window, as these six were until they became const.
        const own = ['mksLoadFor', 'revealTarget', 'focusTarget', 'jumpTo', 'handleHashReveal', 'setMenuOpen'].filter(k => k in window);
        assert(own.length === 0, `Globals: the core's jump, focus and menu functions are its own, not names on window (${own.join(', ') || 'none'})`);
        const declared = [];
        ['script.js', 'count.js', ...MODULE_FILES].forEach((rel) => {
            (read(rel).match(/^(?:async\s+)?function\s*\*?\s*[\w$]+/gm) || []).forEach(m => declared.push(`${rel}: ${m}`));
        });
        assert(declared.length === 0, `Globals: no shipped script declares a function at the top level, where it would land on window (${declared.join(', ') || 'none'})`);
        const marked = ['terminal', 'interactives', 'dispatch'].filter(m => mks.loaded[m] !== true);
        assert(marked.length === 0, `Globals: every module marks itself in mks.loaded (unmarked: ${marked.join(', ') || 'none'})`);

        // No shipped script hangs a new name on window, the visit counter
        // included: its mks.track once had window.trackEvent beside it, the
        // name the old analytics dispatcher used, kept until nothing called it.
        // Nor does the case studies' module, which makes window.mks itself.
        const assigned = [];
        ['script.js', 'count.js', 'modules/dossier.js', ...MODULE_FILES].forEach((rel) => {
            (read(rel).match(/\bwindow\.[A-Za-z_$][\w$]*\s*=(?!=)/g) || []).forEach((m) => {
                const name = m.match(/window\.([\w$]+)/)[1];
                if (name !== 'mks') assigned.push(`${rel}: window.${name}`);
            });
        });
        assert(assigned.length === 0, `Globals: nothing else is assigned to window (${assigned.join(', ') || 'none'})`);

        // The other shipped scripts are not the homepage core. Each still puts
        // names on its page's window, and these are them, by name, so a new
        // one cannot slip in unnoticed: the data files export themselves for
        // both the browser and Node (the tests require them), and carbon-ai.js
        // is carbon-ai.html's own classic script, never loaded on the homepage
        // (EcoPromptCoach is how modules/anatomy.js reads what its calculator
        // is set to).
        const EXPECTED_ELSEWHERE = {
            'ai-carbon-data.js': ['AICarbonData'],
            'voice-scripts.js': ['VoiceScripts'],
            'carbon-ai.js': ['EcoPromptCoach', 'calculate', 'clampNumber', 'sanitize', 'suggest']
        };
        const found = {};
        Object.keys(EXPECTED_ELSEWHERE).forEach((rel) => {
            const src = read(rel);
            const names = new Set();
            (src.match(/\b(?:root|window|globalThis|self)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g) || [])
                .forEach(m => names.add(m.match(/\.([\w$]+)\s*=/)[1]));
            (src.match(/^(?:async\s+)?function\s*\*?\s*([\w$]+)/gm) || [])
                .forEach(m => names.add(m.replace(/^(?:async\s+)?function\s*\*?\s*/, '')));
            (src.match(/^var\s+([\w$]+)/gm) || []).forEach(m => names.add(m.replace(/^var\s+/, '')));
            found[rel] = Array.from(names).sort();
        });
        const drift = Object.keys(EXPECTED_ELSEWHERE)
            .filter(rel => JSON.stringify(found[rel]) !== JSON.stringify(EXPECTED_ELSEWHERE[rel]))
            .map(rel => `${rel}: ${found[rel].join(', ') || 'none'}`);
        assert(drift.length === 0,
            `Globals: the scripts outside the core put exactly their known names on window, and no new ones (${drift.join(' | ') || 'as listed'})`);
    }

    // ===============================================================
    // One keydown listener; one layer closes per Escape
    // ===============================================================
    {
        let onDocument = 0;
        const { window } = run('dark', {
            before: (w) => {
                const add = w.document.addEventListener;
                w.document.addEventListener = function (type, ...rest) {
                    if (type === 'keydown') onDocument++;
                    return add.call(this, type, ...rest);
                };
            }
        });
        const doc = window.document;
        const mks = window.mks;
        assert(onDocument === 1, `Keys: one keydown listener on the document, with every module loaded (${onDocument})`);
        const stray = ['script.js', 'modules/dossier.js', ...MODULE_FILES].filter(rel => (read(rel).match(/document\.addEventListener\(\s*['"]keydown/g) || []).length > (rel === 'script.js' ? 1 : 0));
        assert(stray.length === 0, `Keys: no module adds a document keydown listener of its own (${stray.join(', ') || 'none'})`);
        const ranks = mks.keyRank;
        assert(ranks.terminal > ranks.player && ranks.player > ranks.menu && ranks.menu > ranks.page,
            'Keys: the layers rank terminal, player, menu, page — the order Escape closes them in');
        // The photo lightbox left with the photos, for case-studies.html,
        // which answers its own keys (tests/phone.test.js).
        assert(!('lightbox' in ranks) && !doc.getElementById('lightbox'), 'Keys: the homepage has no lightbox layer left, nor a lightbox');

        const menu = doc.getElementById('navMenu');
        const toggle = doc.getElementById('navToggle');
        const menuOpen = () => menu.classList.contains('active');

        // The terminal over an open menu.
        toggle.click();
        mks.terminal.open();
        const prompt = doc.getElementById('ftInput');
        key(window, 'Escape', prompt);
        assert(!mks.terminal.isOpen() && menuOpen(), 'Escape: the terminal closes first, the menu stays open');
        key(window, 'Escape');
        assert(!menuOpen() && doc.activeElement === toggle, 'Escape: then the menu, and focus returns to its button');

        // Focus inside the open player, menu open behind it.
        const bar = doc.getElementById('dispatchBar');
        bar.hidden = false;
        toggle.click();
        const inBar = bar.querySelector('button');
        key(window, 'Escape', inBar);
        assert(bar.hidden && menuOpen(), 'Escape: inside the player it closes the player, and the menu stays open');
        key(window, 'Escape');
        assert(!menuOpen(), 'Escape: then the menu');

        // The backtick, one rule before and after the terminal is loaded.
        const term = mks.terminal;
        key(window, '`');
        assert(term.isOpen(), 'Backtick: opens the terminal from the page');
        const ev = key(window, '`', prompt);
        assert(!term.isOpen() && ev.defaultPrevented, 'Backtick: typed at the terminal prompt it closes the terminal, and types nothing');
        key(window, '`', doc.getElementById('message'));
        assert(!term.isOpen(), 'Backtick: typed in the contact form, it is a character, not a shortcut');
        const box = doc.createElement('div');
        box.setAttribute('role', 'textbox');
        box.tabIndex = 0;
        doc.body.appendChild(box);
        key(window, '`', box);
        assert(!term.isOpen(), 'Backtick: nor in anything that says it takes text (role="textbox")');
        key(window, '`', doc.body, { ctrlKey: true });
        assert(!term.isOpen(), 'Backtick: Ctrl+` is left to the browser');
        key(window, '`', doc.getElementById('themeToggle'));
        assert(term.isOpen(), 'Backtick: a focused button does not hold it back');
        key(window, '`');
        assert(!term.isOpen(), 'Backtick: pressed again, it closes the terminal');

        // A key a focused control has already used is not a shortcut.
        let scrolled = 0;
        window.HTMLElement.prototype.scrollIntoView = function () { scrolled++; };
        const widget = doc.createElement('div');
        widget.addEventListener('keydown', (e) => e.preventDefault());
        doc.body.appendChild(widget);
        key(window, 'c', widget);
        assert(scrolled === 0, 'Keys: a key a control has already used (preventDefault) does not also jump the page');
        key(window, 'c');
        assert(scrolled === 1, 'Keys: the same key on the page still jumps to Contact');
    }

    // ===============================================================
    // One motion helper, answered live
    // ===============================================================
    {
        const mq = { matches: false, media: '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
        const { window } = run('dark', {
            before: (w) => {
                w.matchMedia = (q) => (/prefers-reduced-motion/.test(q) ? mq : { matches: false, media: q, addEventListener() {}, removeEventListener() {} });
            }
        });
        const mks = window.mks;
        const doc = window.document;
        assert(mks.motionOK() === true && mks.scrollMotion() === 'smooth', 'Motion: with nothing asked for, things move and scrolls glide');
        mq.matches = true;
        assert(mks.motionOK() === false && mks.scrollMotion() === 'instant', 'Motion: reduced motion switched on mid-visit counts at once, with no reload');
        mq.matches = false;
        doc.getElementById('ecoModeToggle').click();
        assert(mks.motionOK() === false && mks.scrollMotion() === 'instant', 'Motion: so does low-energy mode, switched on from the footer');
        doc.getElementById('ecoModeToggle').click();
        assert(mks.motionOK() === true, 'Motion: and switched off again');

        // Every "may this move?" goes through the helper.
        const core = read('script.js');
        const inCore = (core.match(/prefers-reduced-motion/g) || []).length;
        assert(inCore === 1, `Motion: script.js asks the media query in one place, the helper (${inCore})`);
        const asking = MODULE_FILES.filter(rel => /prefers-reduced-motion/.test(read(rel)));
        assert(asking.length === 0, `Motion: no module asks the media query itself (${asking.join(', ') || 'none'})`);
    }
    // Low-energy mode is in force before the intro asks.
    for (const [eco, expectIntro] of [['on', false], ['off', true]]) {
        const { window } = run('dark', {
            before: (w) => {
                w.document.documentElement.classList.add('js');
                w.localStorage.setItem('eco-mode', eco);
            }
        });
        const doc = window.document;
        const intro = !!doc.getElementById('preloader');
        assert(intro === expectIntro, `Motion: low-energy mode ${eco} — the intro ${expectIntro ? 'plays' : 'is skipped'} (the mode is restored before the intro asks)`);
        assert(doc.getElementById('ecoModeLabel').textContent === `Low-energy mode: ${eco}`, `Motion: the footer switch names the restored mode (${eco})`);
        await wait(0);   // the player's manifest check settles before the window goes
        window.close();
    }

    // ===============================================================
    // The zone table, fetched only when the map needs it
    // ===============================================================
    {
        const core = read('script.js');
        assert(!/Europe\/Amsterdam|Pacific\/Auckland/.test(core), 'Zones: the table is no longer in script.js');
        let table = null;
        try { table = JSON.parse(read('assets/timezones.json')); } catch (e) { /* reported below */ }
        const zones = table && table.zones ? Object.entries(table.zones) : [];
        const bad = zones.filter(([zone, v]) => !/^[A-Z][A-Za-z_]+\/[A-Za-z_/]+$/.test(zone) || !Array.isArray(v) || v.length !== 3 ||
            typeof v[0] !== 'string' || !(v[1] >= -180 && v[1] <= 180) || !(v[2] >= -90 && v[2] <= 90));
        assert(zones.length >= 80 && bad.length === 0, `Zones: assets/timezones.json holds ${zones.length} zones, each a city, longitude and latitude (bad: ${bad.map(b => b[0]).join(', ') || 'none'})`);
        const { onDemandAssets, criticalAssets } = require(path.join(ROOT, 'scripts/check-budget.js'));
        assert(onDemandAssets().includes('assets/timezones.json') && !criticalAssets().includes('assets/timezones.json'),
            'Zones: the budget counts the table on demand, not in the first view');

        const svgMarkup = read('assets/journey-map.svg');
        const visit = async (zone, respond) => {
            const fetched = [];
            const { window } = run('dark', {
                before: (w) => {
                    w.fetch = (url) => {
                        fetched.push(String(url));
                        return respond ? respond() : Promise.resolve({ ok: true, json: () => Promise.resolve(table) });
                    };
                    w.Intl.DateTimeFormat = function () { return { resolvedOptions: () => ({ timeZone: zone }) }; };
                }
            });
            const doc = window.document;
            const box = doc.createElement('div');
            box.innerHTML = svgMarkup;
            doc.body.appendChild(box);
            let rescaled = 0;
            const since = fetched.length;   // the narration player asks for its manifest on load
            doc.dispatchEvent(new window.CustomEvent('journeymap:ready', { detail: { svg: box.querySelector('svg'), mapBox: box, rescale: () => { rescaled++; } } }));
            await wait(20);
            const mark = box.querySelector('.map-you');
            const readout = box.querySelector('.journey-you-readout');
            return { fetched: fetched.slice(since), mark, readout: readout ? readout.textContent : '', rescaled, window };
        };

        let r = await visit('Europe/Amsterdam');
        assert(r.fetched.length === 1 && r.fetched[0] === 'assets/timezones.json', `Zones: once the map is ready, the table is fetched from this site, once (${r.fetched.join(', ')})`);
        assert(!!r.mark && /^you: ~Amsterdam · [\d,]+ km from Freetown$/.test(r.readout), `Zones: a visitor in Amsterdam is marked on the map (${r.readout})`);
        assert(r.rescaled === 1, 'Zones: the late mark asks the map to size it with the rest');
        r.window.close();

        r = await visit('Asia/Tokyo');
        assert(!r.mark && /^you: ~Tokyo, off this map's edge/.test(r.readout), `Zones: a zone beyond the map's crop says so instead of drawing (${r.readout})`);
        r.window.close();

        r = await visit('Etc/Nowhere');
        assert(!r.mark && r.readout === '', 'Zones: a zone not in the table marks nothing');
        r.window.close();

        r = await visit('');
        assert(r.fetched.length === 0, 'Zones: a browser that names no zone fetches nothing');
        r.window.close();

        r = await visit('Europe/Amsterdam', () => Promise.reject(new Error('offline')));
        assert(!r.mark, 'Zones: with the table unreachable the map is simply left unmarked');
        r.window.close();
    }

    // ===============================================================
    // The sections are measured once a frame, and a jump holds its course
    // ===============================================================
    {
        const frames = [];
        const resizers = [];
        let reads = 0;
        const { window } = run('dark', {
            before: (w) => {
                w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
                w.ResizeObserver = class {
                    constructor(cb) { this.cb = cb; this.els = []; resizers.push(this); }
                    observe(el) { this.els.push(el); }
                    unobserve() {}
                    disconnect() { this.els = []; }
                };
                const offsetTop = Object.getOwnPropertyDescriptor(w.HTMLElement.prototype, 'offsetTop');
                Object.defineProperty(w.HTMLElement.prototype, 'offsetTop', {
                    configurable: true,
                    get() {
                        if (this.matches('section[id], header[id]')) reads++;
                        return offsetTop.get.call(this);
                    }
                });
            }
        });
        const doc = window.document;
        const flush = () => { const due = frames.splice(0); due.forEach(fn => fn(0)); return due.length; };
        const sectionCount = doc.querySelectorAll('section[id], header[id]').length;
        const sized = resizers.find(o => o.els.includes(doc.getElementById('about')));
        assert(!!sized && sized.els.length === sectionCount, 'Relayout: one ResizeObserver watches every section, for heights that arrive late');

        flush();
        reads = 0;
        window.dispatchEvent(new window.Event('load'));
        window.dispatchEvent(new window.Event('load'));
        if (sized) { sized.cb([]); sized.cb([]); }
        window.dispatchEvent(new window.Event('scroll'));
        assert(reads === 0, `Relayout: asking to re-measure reads no offsets there and then (${reads} reads)`);
        const queued = flush();
        assert(queued === 1 && reads === sectionCount, `Relayout: four asks in one frame are one measurement, in one frame (${queued} frames, ${reads} reads for ${sectionCount} sections)`);
        reads = 0;
        window.dispatchEvent(new window.Event('scroll'));
        flush();
        assert(reads === 0, 'Relayout: a plain scroll re-measures nothing');

        // A jump lands again as the sections it passes take their real
        // heights: each one drawn changes the page's height, which the jump's
        // hold (a ResizeObserver on <body>, tests/navigation.test.js) sees.
        let pageHeight = 20000;
        doc.body.getBoundingClientRect = () => ({ top: 0, left: 0, right: 1280, bottom: pageHeight, width: 1280, height: pageHeight });
        const held = () => resizers.filter(o => o.els.includes(doc.body));
        const drawn = (grew) => { pageHeight += grew; held().forEach(o => o.cb([])); };
        const scrolled = [];
        window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
        doc.querySelector('.nav-menu a[href="#experience"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert(scrolled.join() === 'experience', 'Course: a nav link scrolls to its section');
        drawn(-713);   // a section passed on the way is drawn, shorter than its estimate
        assert(scrolled.join() === 'experience,experience', 'Course: a section drawn at its real height mid-jump lands it again, on the same target');
        window.dispatchEvent(new window.Event('wheel'));
        drawn(297);
        assert(scrolled.length === 2 && held().length === 0, 'Course: once the reader scrolls for themselves, the page stops steering');
        key(window, 'c');
        drawn(1084);
        assert(scrolled.slice(-2).join() === 'contact,contact', 'Course: the c shortcut holds its course the same way');
    }

    // ===============================================================
    // What the page moved past undrawn is drawn once it rests
    // ===============================================================
    // Skipped by a jump or a dragged scroll bar, a section keeps its
    // estimated height until the reader goes back up to it; drawn then, it
    // moved what they were reading (scroll anchoring missed it in Chrome).
    const restAt = (reading) => {
        const { window } = run('dark');
        const doc = window.document;
        const parts = Array.from(doc.querySelectorAll('main > section'));
        const at = reading === 'footer' ? parts.length : parts.indexOf(doc.getElementById(reading));
        // Everything before where the reader is sits above the screen; drawn,
        // that is 700px taller than its estimates, and what is on screen
        // moves down by as much.
        const grown = () => (parts.some(p => p.classList.contains('drawn')) ? 700 : 0);
        const box = (top) => ({ top, bottom: top + 2000, left: 0, right: 1280, width: 1280, height: 2000 });
        parts.forEach((s, i) => { s.getBoundingClientRect = () => box((i - at) * 2000 - 50 + grown()); });
        doc.querySelector('body > footer').getBoundingClientRect = () => box((parts.length - at) * 2000 - 50 + grown());
        const by = [];
        window.scrollBy = (o) => { by.push(o.top); };
        const drawn = () => parts.filter(s => s.classList.contains('drawn')).map(s => s.id);
        return { window, parts, at, by, drawn };
    };
    {
        const { window, parts, at, by, drawn } = restAt('skills');
        window.dispatchEvent(new window.Event('scroll'));
        await wait(60);
        window.dispatchEvent(new window.Event('scroll'));
        assert(!drawn().length, 'Drawn: nothing is drawn while the page is still moving');
        await wait(250);
        const expect = parts.slice(0, at).map(s => s.id);
        assert(drawn().join() === expect.join(), `Drawn: once the page rests, every section above the screen is drawn for good, and none below (${drawn().join(', ')})`);
        assert(by.join() === '700', `Drawn: and what is on screen is put back where it was (scrolled by ${by.join(', ') || 'nothing'})`);
        window.dispatchEvent(new window.Event('scroll'));
        await wait(250);
        assert(by.length === 1, 'Drawn: at the next rest there is nothing left to draw, and nothing moves');
        window.close();
    }
    {
        // At the very end only the footer is on screen, below every section.
        const { window, parts, by, drawn } = restAt('footer');
        window.dispatchEvent(new window.Event('scroll'));
        await wait(250);
        assert(drawn().length === parts.length && by.join() === '700', `Drawn: at the end of the page all are drawn, and the footer held still (scrolled by ${by.join(', ') || 'nothing'})`);
        window.close();
    }
    // A lazy image holds the shape its width and height give it until it
    // arrives. The portrait said 640x640 and is 640x960: arriving above a
    // reader on their way back up, it moved the page 159px (390px wide).
    {
        const shape = (rel) => {
            const b = fs.readFileSync(path.join(ROOT, rel));
            if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
            const kind = b.toString('ascii', 12, 16);
            if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
            if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
            if (kind === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; }
            return null;
        };
        const wrong = [];
        let checked = 0;
        fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach((page) => {
            (read(page).match(/<img\b[^>]*>/g) || []).forEach((tag) => {
                const src = (tag.match(/\ssrc="([^"]+\.webp)"/) || [])[1];
                const w = +(tag.match(/\swidth="(\d+)"/) || [])[1];
                const h = +(tag.match(/\sheight="(\d+)"/) || [])[1];
                const real = src && fs.existsSync(path.join(ROOT, src)) ? shape(src) : null;
                if (!real) return;
                checked++;
                if (!(Math.abs(w / h - real[0] / real[1]) <= 0.01 * real[0] / real[1])) wrong.push(`${page}: ${src} says ${w}x${h}, is ${real.join('x')}`);
            });
        });
        assert(checked >= 6 && wrong.length === 0, `Images: all ${checked} say their real shape, so one arriving late moves nothing (${wrong.join('; ') || 'none wrong'})`);
    }

    // ===============================================================
    // Loops pause out of sight, and in a hidden tab
    // ===============================================================
    {
        const observers = [];
        const { window } = run('dark', {
            before: (w) => {
                w.IntersectionObserver = class {
                    constructor(cb, opts) { this.cb = cb; this.opts = opts || {}; this.els = []; observers.push(this); }
                    observe(el) { this.els.push(el); }
                    unobserve() {}
                    disconnect() {}
                };
            }
        });
        const doc = window.document;
        const blocks = Array.from(doc.querySelectorAll('body > header, main > section, body > footer'));
        const loops = observers.find(o => o.els.includes(doc.querySelector('footer')) && o.els.includes(doc.getElementById('projects')));
        assert(!!loops && blocks.every(b => loops.els.includes(b)), `Loops: one observer watches the hero, all ${blocks.length - 2} sections and the footer`);
        const on = (b) => b.classList.contains('onscreen');
        assert(!blocks.some(on), 'Loops: every block starts still, before anything is known to be in view');
        const projects = doc.getElementById('projects');
        if (loops) {
            loops.cb([{ target: projects, isIntersecting: true }]);
            assert(on(projects), 'Loops: a block coming into view is marked .onscreen');
            loops.cb([{ target: projects, isIntersecting: false }]);
            assert(!on(projects), 'Loops: and unmarked as it leaves');
            loops.cb(blocks.map((b, i) => ({ target: b, isIntersecting: i === 0 })));
        }
        const hero = blocks[0];
        assert(on(hero) && !blocks.slice(1).some(on), 'Loops: at the top of the page only the hero moves');
        Object.defineProperty(doc, 'hidden', { configurable: true, get: () => true });
        doc.dispatchEvent(new window.Event('visibilitychange'));
        assert(!blocks.some(on), 'Loops: in a hidden tab nothing moves, the block in view included');
        Object.defineProperty(doc, 'hidden', { configurable: true, get: () => false });
        doc.dispatchEvent(new window.Event('visibilitychange'));
        assert(on(hero) && !blocks.slice(1).some(on), 'Loops: back in the tab, what is in view moves again and nothing else');

        // Every loop lives inside a block the observer watches, or is one
        // that is never out of sight while it runs.
        const EXEMPT = {
            '.icon-spin': 'spins only on the send button while a message is sending',
            '.preloader-bar span': 'runs only during the intro, gone once the page shows',
            '.listen-btn.is-playing .icon': 'in the fixed nav bar, always in view, and only while speaking'
        };
        const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const loopSelectors = [];
        (css.match(/[^{}]+\{[^{}]*animation(-iteration-count)?\s*:[^;{}]*\binfinite\b[^{}]*\}/g) || []).forEach((rule) => {
            rule.slice(0, rule.indexOf('{')).split(',').map(x => x.trim()).forEach(x => loopSelectors.push(x));
        });
        const outside = [];
        loopSelectors.filter(sel => !EXEMPT[sel]).forEach((sel) => {
            doc.querySelectorAll(sel.replace(/::(after|before)$/, '')).forEach((el) => {
                if (!blocks.some(b => b.contains(el))) outside.push(sel);
            });
        });
        assert(loopSelectors.length >= 8 && outside.length === 0,
            `Loops: all ${loopSelectors.length} looping rules sit inside a watched block, or are exempt for a reason (outside: ${[...new Set(outside)].join(', ') || 'none'})`);
    }

    // ===============================================================
    // The stylesheet rules behind all of that
    // ===============================================================
    {
        // A small brace-matching walk: every rule with its selector, inside
        // @media and @supports too, and every @keyframes body by name.
        const css = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const rules = [];
        const keyframes = {};
        const walk = (text, context) => {
            let i = 0;
            while (i < text.length) {
                const open = text.indexOf('{', i);
                if (open === -1) break;
                const prelude = text.slice(i, open).trim();
                let depth = 1, j = open + 1;
                while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
                const body = text.slice(open + 1, j - 1);
                const kf = prelude.match(/^@keyframes\s+([\w-]+)/);
                if (kf) keyframes[kf[1]] = body;
                else if (/^@(media|supports)/.test(prelude)) walk(body, prelude);
                else if (!prelude.startsWith('@')) rules.push({ selector: prelude.replace(/\s+/g, ' '), body, context });
                i = j;
            }
        };
        walk(css, '');

        const loops = rules.filter(r => /animation(-iteration-count)?\s*:[^;]*\binfinite\b/.test(r.body));
        const named = (body) => (body.match(/animation\s*:\s*([^;]+)/) || ['', ''])[1].split(/\s+/).filter(t => keyframes[t]);
        const offMain = [];
        loops.forEach((r) => named(r.body).forEach((name) => {
            const props = (keyframes[name].match(/[\w-]+(?=\s*:)/g) || []).filter(p => p !== 'transform' && p !== 'opacity');
            if (props.length) offMain.push(`${name} (${[...new Set(props)].join(', ')})`);
        }));
        assert(loops.length >= 8 && offMain.length === 0, `Loops: all ${loops.length} infinite animations move only transform and opacity, which the compositor runs (off it: ${offMain.join('; ') || 'none'})`);

        const BLOCK = 'html.js :is(body > header, main > section, body > footer):not(.onscreen) ';
        const still = rules.find(r => r.selector === `${BLOCK}*, ${BLOCK}*::before, ${BLOCK}*::after`);
        assert(!!still && /animation-play-state\s*:\s*paused\s*!important/.test(still.body) && /transition\s*:\s*none\s*!important/.test(still.body),
            'Loops: nothing loops or transitions in a block until it is marked in view, from the first paint (one left running in a section no longer drawn kept Chrome making frames)');

        const cv = rules.find(r => r.selector === 'html.js main > section' && /content-visibility\s*:\s*auto/.test(r.body));
        assert(!!cv && /contain-intrinsic-size\s*:\s*auto\s+\d+px/.test(cv.body),
            'Sections: drawn only near the screen (content-visibility: auto), with a remembered height (contain-intrinsic-size: auto)');
        assert(!!cv && /^@supports\s*\(\s*overflow-anchor\s*:\s*auto\s*\)$/.test(cv.context),
            'Sections: only where the browser anchors scrolling, so an estimate turning real above the reader moves nothing (Safari has no anchoring)');
        assert(rules.some(r => r.selector === 'html.js main > section.drawn' && /content-visibility\s*:\s*visible/.test(r.body) && cv && r.context === cv.context),
            'Sections: a section marked .drawn (the reader has passed it) stays drawn');
        assert(!rules.some(r => !/^html\.js/.test(r.selector) && /content-visibility\s*:\s*auto/.test(r.body)),
            'Sections: only with script.js running, which keeps jumps on target as real heights arrive');
        assert(rules.some(r => /print/.test(r.context) && /main > section/.test(r.selector) && /content-visibility\s*:\s*visible/.test(r.body)),
            'Sections: printing draws every section');
    }

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    // The slideshow leaves timers running, which would keep the process alive.
    process.exit(0);
})().catch((err) => {
    console.log('FAIL: cpu checks threw', err);
    process.exit(1);
});
