// Tests for the visit counter (count.js) and what feeds it.
//
// The counter's whole promise is what it does NOT send, so these check the
// payload it builds field by field: which page, which lens, how far down the
// reader got, which features, the referrer's host and nothing more of it,
// the viewport class, and the KB. Then the rules around sending: once per
// page view, never under Do Not Track or Global Privacy Control, and never
// an error on the page. Every payload built here is also run through the
// server's own schema check from google-apps-script/Code.gs, so the client
// cannot drift into sending something the server throws away.
//
// scripts/smoke.js repeats the key-set check in a real browser, against the
// request that actually leaves the page.
//
// Run with: node tests/count.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const COUNT = read('count.js');
const SCRIPT = read('script.js');
const INDEX = read('index.html');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const KEYS = ['v', 'page', 'lens', 'deepest', 'features', 'ref', 'vp', 'kb'];
const GAS = (SCRIPT.match(/const GOOGLE_APPS_SCRIPT_URL = '([^']+)'/) || [])[1];
const ENDPOINT = `${GAS}?action=count`;
const SITE = 'https://moseskolleh.github.io/sustaintheworld/';

// The server's schema check, straight from Code.gs: it defines functions and
// constants at the top level and calls no Apps Script service until asked.
const server = vm.createContext({});
vm.runInContext(read('google-apps-script/Code.gs'), server);
const serverAccepts = (payload) => server.isBeaconV1(JSON.parse(JSON.stringify(payload)));

/** An intersection observer the test drives: show(el) is "el came on screen". */
function observerRig() {
    const observers = [];
    class FakeIO {
        constructor(cb) { this.cb = cb; this.targets = new Set(); observers.push(this); }
        observe(t) { this.targets.add(t); }
        unobserve(t) { this.targets.delete(t); }
        disconnect() { this.targets.clear(); }
    }
    const show = (el) => observers.forEach(o => o.targets.has(el) && o.cb([{ target: el, isIntersecting: true }], o));
    return { FakeIO, show, observers };
}

const SECTIONS = `
    <header id="home"><h1>Hero</h1></header>
    <main id="main">
        <nav class="play-index"><a href="#two">jump</a></nav>
        <section id="one"><button type="button" data-analytics="cv-download-hero">CV</button><a href="#one" data-analytics="cv-download-nav">CV</a></section>
        <section id="two">
            <section id="inner">nested, not top-level</section>
            <button type="button" data-analytics="listen"><svg><use href="#i-waveform"></use></svg><span>Listen</span></button>
        </section>
        <div>no id</div>
        <section id="has space">an id the server would refuse</section>
        <section id="three">three</section>
    </main>`;

/**
 * A page with count.js in it, loaded the way a browser would: as a real
 * <script>, so document.currentScript (and data-page) behave.
 */
function load(options = {}) {
    const calls = [];
    const listened = [];
    const rig = observerRig();
    const attr = options.dataPage ? ` data-page="${options.dataPage}"` : '';
    const html = `<!DOCTYPE html><html><body>${options.body || SECTIONS}<script${attr}>${COUNT}</script></body></html>`;
    const dom = new JSDOM(html, {
        url: options.url || SITE,
        referrer: options.referrer,
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        beforeParse(window) {
            window.fetch = options.fetch || ((url, opts) => { calls.push({ url, opts }); return Promise.resolve({}); });
            if (options.io !== false) window.IntersectionObserver = rig.FakeIO;
            else delete window.IntersectionObserver;
            Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => options.width || 1280 });
            if (options.dnt !== undefined) Object.defineProperty(window.navigator, 'doNotTrack', { configurable: true, get: () => options.dnt });
            if (options.gpc !== undefined) Object.defineProperty(window.navigator, 'globalPrivacyControl', { configurable: true, get: () => options.gpc });
            window.performance.getEntriesByType = options.entries || ((type) => (type === 'navigation'
                ? [{ transferSize: 30 * 1024 }]
                : [{ transferSize: 100 * 1024 }, { transferSize: 0 }, {}]));
            // Record every listener the counter adds, to prove there is no scroll handler.
            [window, window.document].forEach((target) => {
                const add = target.addEventListener.bind(target);
                target.addEventListener = (type, ...rest) => { listened.push(type); return add(type, ...rest); };
            });
            if (options.before) options.before(window);
        }
    });
    const { window } = dom;
    const doc = window.document;
    let visibility = 'visible';
    Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => visibility });
    return {
        window,
        doc,
        calls,
        listened,
        show: (id) => rig.show(doc.getElementById(id)),
        click: (sel) => doc.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
        leave: () => window.dispatchEvent(new window.Event('pagehide')),
        setVisibility: (state) => { visibility = state; doc.dispatchEvent(new window.Event('visibilitychange')); },
        // {} when nothing was sent, so a check fails rather than throws.
        payload: () => (calls.length ? JSON.parse(calls[calls.length - 1].opts.body) : {})
    };
}

// --- The request itself --------------------------------------------------
{
    const p = load();
    p.leave();
    assert(p.calls.length === 1, 'Request: leaving the page sends one request');
    const call = p.calls[0] || { opts: {} };
    assert(!!GAS && call.url === ENDPOINT, `Request: it goes to the contact form's own endpoint with ?action=count, nowhere else (${call.url})`);
    assert(call.opts.method === 'POST' && call.opts.keepalive === true, 'Request: a POST that outlives the page (keepalive)');
    assert(call.opts.credentials === 'omit', 'Request: no cookies go with it, not even the browser\'s own for script.google.com');
    assert(call.opts.referrerPolicy === 'no-referrer', 'Request: no Referer header either');
    assert(call.opts.mode === 'no-cors' && typeof call.opts.body === 'string', 'Request: a plain-text body, so no CORS preflight and nothing to read back');

    const body = p.payload();
    assert(JSON.stringify(Object.keys(body)) === JSON.stringify(KEYS), `Payload: exactly the eight schema-v1 keys, in order (${Object.keys(body).join(', ')})`);
    assert(body.v === 1 && body.page === 'index' && body.lens === '' && body.deepest === '' && body.ref === '',
        'Payload: the homepage, no lens, nothing seen yet, no referrer');
    assert(Array.isArray(body.features) && body.features.length === 0, 'Payload: no features used');
    assert(body.kb === 130, `Payload: kb is transferSize summed over navigation and resources, in whole KB (30 + 100 → ${body.kb})`);
    assert(serverAccepts(body), "Payload: the server's own schema check accepts it");
}

// --- page ------------------------------------------------------------------
{
    const name = (url, extra = {}) => { const p = load({ url, ...extra }); p.leave(); return p.payload().page; };
    assert(name(`${SITE}index.html`) === 'index', 'page: index.html is "index"');
    assert(name(`${SITE}case-studies.html?lens=water#groundwater`) === 'case-studies', 'page: the file stem, without query or fragment');
    assert(name(`${SITE}research`) === 'research', 'page: an address without .html gives the same name');
    assert(name(`${SITE}Field-Report.html`) === 'field-report', 'page: lower-cased');
    assert(name(`${SITE}no/such/place.html`, { dataPage: '404' }) === '404', 'page: 404.html names itself with data-page, whatever address it answers');

    const odd = load({ url: `${SITE}%E2%9C%93.html` });
    odd.leave();
    assert(odd.calls.length === 0, 'page: a name the server would refuse is not sent at all');
}

// --- lens ------------------------------------------------------------------
{
    const lens = (query) => { const p = load({ url: `${SITE}case-studies.html${query}` }); p.leave(); return p.payload().lens; };
    assert(lens('?lens=water') === 'water', 'lens: ?lens=water is "water"');
    assert(lens('?x=1&lens=climate-risk') === 'climate-risk', 'lens: found wherever it sits in the query');
    assert(lens('?lens=Water') === '' && lens('?lens=%3Cscript%3E') === '' && lens(`?lens=${'a'.repeat(41)}`) === '',
        'lens: anything that is not a lens-shaped name is sent as ""');

    const p = load({ url: `${SITE}case-studies.html?lens=water` });
    p.window.history.pushState({}, '', 'case-studies.html?lens=sustainable-ai');
    p.leave();
    assert(p.payload().lens === 'water', 'lens: it is the lens the visit arrived with, not one switched to later');
}

// --- deepest ---------------------------------------------------------------
{
    const p = load();
    p.show('two');
    p.show('one');
    p.show('inner');
    p.leave();
    assert(p.payload().deepest === 'two', `deepest: the furthest part seen, not the last one seen (${p.payload().deepest})`);

    const q = load();
    q.show('three');
    q.leave();
    assert(q.payload().deepest === 'three', 'deepest: a jump straight to the last part counts as reaching it');

    const nested = load();
    nested.show('inner');
    nested.leave();
    assert(nested.payload().deepest === '', 'deepest: only direct children of <main> count, not a section inside one');

    assert(!p.listened.includes('scroll') && !p.listened.includes('wheel'), `deepest: no scroll handler — one IntersectionObserver does it (${[...new Set(p.listened)].join(', ')})`);

    const none = load({ io: false });
    none.leave();
    assert(none.calls.length === 1 && none.payload().deepest === '', 'deepest: without IntersectionObserver the visit is still counted, with deepest ""');

    const late = load();
    late.setVisibility('hidden');
    late.show('three');
    late.setVisibility('visible');
    late.leave();
    assert(late.calls.length === 1 && late.payload().deepest === '', 'deepest: what is seen after the count has gone does not send another');
}

// --- features --------------------------------------------------------------
{
    const p = load();
    p.click('[data-analytics="cv-download-hero"]');
    p.click('[data-analytics="cv-download-hero"]');
    p.click('[data-analytics="listen"] use');
    p.window.mks.track('module-dossier');
    ['Bad Name', '', undefined, null, 42, 'x'.repeat(41), 'semi;colon'].forEach(n => p.window.mks.track(n));
    p.window.mks.track('assay-high');
    p.leave();
    const f = p.payload().features || [];
    assert(JSON.stringify(f) === JSON.stringify(['cv-download-hero', 'cv-download', 'listen', 'module-dossier', 'assay-high']),
        `features: clicks on [data-analytics] (even on an icon inside one) and mks.track(), each once, in order (${f.join(', ')})`);

    // Every CV link has a name of its own, and a view that used any of them
    // also carries "cv-download", once: the CV-downloads figure counts page
    // views, and two CV links clicked in one view are one of those.
    const two = load();
    two.click('[data-analytics="cv-download-nav"]');
    two.click('[data-analytics="cv-download-hero"]');
    two.click('[data-analytics="cv-download-nav"]');
    two.leave();
    const t = two.payload().features || [];
    assert(JSON.stringify(t) === JSON.stringify(['cv-download-nav', 'cv-download', 'cv-download-hero']),
        `features: two CV links in one view send both names and "cv-download" once (${t.join(', ')})`);
    const none = load();
    none.click('[data-analytics="listen"]');
    none.leave();
    assert(!(none.payload().features || []).includes('cv-download'), 'features: a view with no CV link clicked does not carry "cv-download"');
    assert(!('trackEvent' in p.window), 'features: mks.track is the one name for it, with no window.trackEvent beside it');

    const many = load();
    for (let i = 0; i < 25; i++) many.window.mks.track(`f-${i}`);
    many.leave();
    const m = many.payload().features || [];
    assert(m.length === 20 && m[0] === 'f-0' && m[19] === 'f-19', `features: capped at the first 20 distinct names (${m.length})`);
    assert(serverAccepts(many.payload()), "features: a full list still passes the server's check");

    const kept = load({ before: (w) => { w.mks = { keep: true }; } });
    assert(kept.window.mks.keep === true && typeof kept.window.mks.track === 'function', 'features: an existing window.mks is added to, never replaced');
}

// --- ref -------------------------------------------------------------------
{
    const ref = (referrer) => { const p = load({ referrer }); p.leave(); return p.payload().ref; };
    assert(ref('https://www.linkedin.com/feed/?trk=abc#x') === 'www.linkedin.com', 'ref: the referring host only — no path, no query');
    assert(ref(`${SITE}case-studies.html`) === '', 'ref: a link from this site is not a referrer');
    assert(ref(undefined) === '', 'ref: no referrer is ""');
    assert(ref('http://localhost:8080/draft') === 'localhost:8080', 'ref: a port stays with its host');
    assert(ref('android-app://com.linkedin.android/') === 'com.linkedin.android', 'ref: an app referrer is its package name, which is its host');
}

// --- vp --------------------------------------------------------------------
{
    const vp = (width) => { const p = load({ width }); p.leave(); return p.payload().vp; };
    const got = [320, 599, 600, 1023, 1024, 1920].map(vp).join('');
    assert(got === 'ssmmll', `vp: s under 600px, m under 1024px, l from 1024px (${got})`);
}

// --- kb --------------------------------------------------------------------
{
    const big = load({ entries: () => [{ transferSize: 500 * 1024 * 1024 }] });
    big.leave();
    assert(big.payload().kb === 100000, 'kb: capped where the server stops believing it (100000)');

    const cached = load({ entries: (t) => (t === 'navigation' ? [{ transferSize: 300 }] : [{ transferSize: 0, encodedBodySize: 50000 }]) });
    cached.leave();
    assert(cached.payload().kb === 0, 'kb: what came from cache weighs nothing — transferSize, not encodedBodySize');

    const noTiming = load({ entries: () => { throw new Error('no Resource Timing'); } });
    noTiming.leave();
    assert(noTiming.calls.length === 1 && noTiming.payload().kb === 0, 'kb: without Resource Timing the visit is still counted, as 0 KB');
}

// --- Once per page view -----------------------------------------------------
{
    const p = load();
    p.setVisibility('visible');
    assert(p.calls.length === 0, 'Once: becoming visible sends nothing');
    p.setVisibility('hidden');
    assert(p.calls.length === 1, 'Once: the first time the page is hidden, the count goes');
    p.setVisibility('visible');
    p.click('[data-analytics="cv-download-hero"]');
    p.setVisibility('hidden');
    p.leave();
    assert(p.calls.length === 1, `Once: hiding again and then leaving send nothing more (${p.calls.length} requests)`);
}

// --- Do Not Track and Global Privacy Control --------------------------------
{
    const quiet = (opts, label) => {
        const p = load(opts);
        p.click('[data-analytics="cv-download-hero"]');
        p.show('three');
        p.setVisibility('hidden');
        p.leave();
        assert(p.calls.length === 0, `Privacy: nothing at all is sent under ${label}`);
        assert(typeof p.window.mks.track === 'function', `Privacy: mks.track still exists under ${label}, so callers need no guard`);
    };
    quiet({ dnt: '1' }, 'Do Not Track');
    quiet({ gpc: true }, 'Global Privacy Control');
    quiet({ dnt: '1', gpc: true }, 'both');

    const off = load({ dnt: '0', gpc: false });
    off.leave();
    assert(off.calls.length === 1, 'Privacy: DNT "0" and GPC false are not a refusal, and the visit is counted');
}

// --- Never an error on the page ---------------------------------------------
{
    const errors = [];
    const throwing = load({ fetch: () => { throw new Error('blocked by an extension'); } });
    throwing.window.addEventListener('error', (e) => errors.push(e.message));
    throwing.leave();
    let rejected = false;
    const onRejection = () => { rejected = true; };
    process.on('unhandledRejection', onRejection);
    const rejecting = load({ fetch: () => Promise.reject(new TypeError('offline')) });
    rejecting.leave();
    setTimeout(() => {
        process.removeListener('unhandledRejection', onRejection);
        assert(errors.length === 0, 'Errors: a fetch that throws is swallowed');
        assert(!rejected, 'Errors: a fetch that fails leaves no unhandled rejection');
        finish();
    }, 20);
}

// --- The documented example is the real thing -------------------------------
{
    const example = (COUNT.match(/^\/\/ (\{"v":1,.*\})$/m) || [])[1];
    let parsed = null;
    try { parsed = JSON.parse(example); } catch (e) { /* reported below */ }
    assert(!!parsed && JSON.stringify(Object.keys(parsed)) === JSON.stringify(KEYS), 'Docs: the example payload at the top of count.js has exactly the schema keys');
    assert(!!parsed && serverAccepts(parsed), "Docs: ...and the server's schema check accepts it");
    const readme = read('google-apps-script/README.md');
    assert(!!example && readme.includes(example), 'Docs: google-apps-script/README.md shows the same example, character for character');
}

// --- What feeds it on the homepage -----------------------------------------
// script.js runs before the deferred count.js, as it does in the browser. A
// module fetched on demand, the Listen control and the player it fetches,
// and the contact form being sent all land in the list.
{
    const calls = [];
    const dom = new JSDOM(INDEX, { runScripts: 'outside-only', pretendToBeVisual: true, url: SITE });
    const { window } = dom;
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.scrollTo = () => {};
    window.IntersectionObserver = observerRig().FakeIO;
    window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    window.fetch = (url, opts) => {
        calls.push({ url, opts });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
    };
    window.console.error = () => {};
    window.console.log = () => {};         // the site's hello in the console
    window.eval(SCRIPT);
    window.eval(COUNT);

    // jsdom will not fetch a module, so the test plays the network: it waits
    // for the loader to inject each file in turn, then says it loaded.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const served = [];
    const serve = (files) => files.reduce((p, src) => p.then(tick).then(() => {
        const el = window.document.head.querySelector(`script[src="${src}"], link[href="${src}"]`);
        if (el) { served.push(src); el.dispatchEvent(new window.Event('load')); }
    }), Promise.resolve());
    const settled = (loading) => Promise.race([loading, new Promise((resolve) => setTimeout(resolve, 2000))]);

    const loaded = window.mks.load('terminal');
    // The one Listen control in the nav fetches the player on its first
    // press: its stylesheet, the scripts it reads, then the player.
    const dispatchFiles = ['modules/dispatch.css', 'voice-scripts.js', 'modules/dispatch.js'];
    const pending = serve(['modules/terminal.js']).then(() => settled(loaded)).then(() => {
        window.document.getElementById('listenBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        return serve(dispatchFiles);
    }).then(tick);

    const form = window.document.getElementById('contactForm');
    ['name', 'email', 'message'].forEach((id) => { window.document.getElementById(id).value = id === 'email' ? 'ada@example.com' : 'Ada'; });
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    window.document.querySelector('[data-analytics="contact-hero"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    pending.then(() => {
        window.dispatchEvent(new window.Event('pagehide'));
        const count = calls.filter(c => c.url === ENDPOINT);
        const features = count.length ? JSON.parse(count[0].opts.body).features : [];
        assert(served.includes('modules/terminal.js'), 'Homepage: mksLoad injects the module it was asked for');
        assert(features.includes('module-terminal'), `Homepage: a module fetched on demand is counted as module-<name> (${features.join(', ')})`);
        assert(served.length === 1 + dispatchFiles.length && features.includes('listen') && features.includes('module-dispatch'),
            `Homepage: pressing Listen counts the press and the player it fetches (${served.join(', ')})`);
        assert(features.includes('contact-form-submit'), 'Homepage: sending the contact form is counted');
        assert(features.includes('contact-hero'), 'Homepage: a [data-analytics] hook in the real page is counted');
        assert(count.length === 1, `Homepage: one count for the visit (${count.length})`);
        finish();
    });
}

// deepest names a direct child of <main>. On the homepage those are its
// sections, and every section the nav links to is one of them, so the
// deepest part reached reads as a place in the page a person would name.
{
    const doc = new JSDOM(INDEX).window.document;
    const parts = [...doc.querySelectorAll('main > [id]')].map(el => el.id);
    const linked = [...doc.querySelectorAll('.nav-menu a[href^="#"]')].map(a => a.getAttribute('href').slice(1));
    const missing = linked.filter(id => !parts.includes(id));
    assert(linked.length > 0 && missing.length === 0, `deepest: every section the homepage nav links to is a part the counter watches (${parts.join(', ')}; not watched: ${missing.join(', ') || 'none'})`);
    assert(parts.every(id => /^[\w-]{1,40}$/.test(id)) && parts[parts.length - 1] === 'contact',
        'deepest: every one is an id the server accepts, and the last is #contact');
}

// Every CV link and every email link on a page that counts its visits has a
// hook, or its clicks are missing from the CV-downloads figure and from the
// features table. The text-only field report's two once had none.
{
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && /<script[^>]*src="(?:\/sustaintheworld\/)?count\.js"/.test(read(f)));
    const bare = [];
    pages.forEach((rel) => {
        const doc = new JSDOM(read(rel)).window.document;
        doc.querySelectorAll('a[href$="Moses_Kolleh_Sesay_CV.pdf"]').forEach((a) => {
            if (!/^cv-download-[a-z0-9-]+$/.test(a.getAttribute('data-analytics') || '')) bare.push(`${rel}: CV link "${a.textContent.trim()}"`);
        });
        doc.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
            if (!a.hasAttribute('data-analytics')) bare.push(`${rel}: email link "${a.textContent.trim()}"`);
        });
    });
    assert(pages.includes('field-report.html') && bare.length === 0,
        `Hooks: every CV link is a cv-download-* hook and every email link a hook, on every counted page (${bare.join('; ') || 'all hooked'})`);
    // The terminal's `cv` command fetches the CV without a link on the page.
    const { run } = require('./harness.js');
    const tracked = [];
    const { window } = run('dark', {
        before: (w) => {
            w.mks = { track: n => tracked.push(n) };
            w.HTMLAnchorElement.prototype.click = () => {};   // jsdom cannot follow a download
        }
    });
    window.mks.terminal.open();
    window.document.getElementById('ftInput').value = 'cv';
    window.document.querySelector('.ft-line').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    assert(tracked.join() === 'cv-download-terminal,cv-download', `Hooks: the terminal's cv command counts as a CV download too (${tracked.join(', ') || 'nothing'})`);

    // The Assay's grade is counted, so its label cannot say nothing is sent;
    // what it can say is that the ad is not.
    const tracksGrade = /mks\.track\(\s*'assay-'/.test(read('modules/interactives.js'));
    const label = new JSDOM(INDEX).window.document.querySelector('.assay-privacy').textContent;
    assert(!tracksGrade || (!/nothing sent/.test(label) && /the ad is never sent/.test(label)),
        `Hooks: while the Assay's grade is counted, its label says the ad is never sent, not that nothing is ("${label.trim()}")`);
}

// Every hook name in the markup must be one the counter will keep: a name it
// silently drops is a feature nobody ever sees used. Every page and every
// module is read, so a hook added anywhere is held to the same rule.
{
    const sources = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
        .concat(fs.readdirSync(path.join(ROOT, 'modules')).filter(f => f.endsWith('.js')).map(f => `modules/${f}`), ['script.js']);
    const names = [];
    sources.forEach((rel) => {
        (read(rel).match(/data-analytics="([^"]+)"/g) || []).forEach((m) => names.push([rel, m.slice(16, -1)]));
    });
    // The Assay reports its grade as assay-<class>, one per grade it can give.
    (read('modules/interactives.js').match(/\bcls = '([^']+)'/g) || [])
        .forEach((m) => names.push(['modules/interactives.js', `assay-${m.slice(7, -1)}`]));
    const literal = names.filter(([, n]) => !n.includes('${'));
    const distinct = new Set(literal.map(([, n]) => n));
    const bad = literal.filter(([, n]) => !/^[a-z0-9-]{1,40}$/.test(n));
    assert(distinct.size >= 23, `Hooks: at least the 23 data-analytics hooks the plan counted are found (${distinct.size} distinct names)`);
    assert(bad.length === 0, `Hooks: every name is one the counter keeps (${bad.map(b => b.join(': ')).join(', ') || 'all fine'})`);
    // The one listen control in the nav, and the player's offer of Moses's
    // own introduction, are features like any other.
    assert(distinct.has('listen') && distinct.has('listen-intro') && distinct.has('assay-high'),
        `Hooks: the nav's Listen control, the player's introduction and the Assay's grades are among them (${[...distinct].filter(n => /^(listen|assay-)/.test(n)).join(', ')})`);
}

// A message sent from a browser that asks not to be tracked says so, and
// Code.gs leaves it out of the public contact tally: stats.html promises
// such a visitor is in none of its figures, and the endpoint cannot see the
// request's headers to know. A message from any other browser says nothing.
(async () => {
    const { run } = require('./harness.js');
    const bodies = {};
    for (const [label, prop, value] of [['plain', null, null], ['GPC', 'globalPrivacyControl', true], ['DNT', 'doNotTrack', '1']]) {
        const { window, clock } = run('dark', {
            clock: true,
            before: (w) => { if (prop) Object.defineProperty(w.navigator, prop, { configurable: true, get: () => value }); }
        });
        const sent = [];
        window.fetch = async (url, opts) => { sent.push({ url, opts }); return { ok: true, json: async () => ({ status: 'success' }) }; };
        const doc = window.document;
        doc.getElementById('name').value = 'Ada';
        doc.getElementById('email').value = 'ada@example.com';
        doc.getElementById('message').value = 'A question about groundwater.';
        doc.getElementById('contactForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        await clock.tick(20);
        const post = sent.find(c => c.url === GAS);
        bodies[label] = post ? JSON.parse(post.opts.body) : null;
        window.close();
    }
    assert(!!bodies.plain && !('count' in bodies.plain), 'Contact: a message from an ordinary browser carries no count field');
    assert(!!bodies.GPC && bodies.GPC.count === false, 'Contact: under Global Privacy Control the message says count: false');
    assert(!!bodies.DNT && bodies.DNT.count === false, 'Contact: under Do Not Track too');
    // tests/apps-script.test.js holds Code.gs to its side: told count: false,
    // it records and sends the message and leaves the tally alone.
    finish();
})();

// Three suites above finish asynchronously; report once all have.
let pendingSuites = 3;
function finish() {
    if (--pendingSuites > 0) return;
    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    process.exit(0);   // the site script leaves timers running
}
