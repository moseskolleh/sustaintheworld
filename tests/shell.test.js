// The shared shell: every page but the homepage leads somewhere, and keeps
// the reader's theme.
//
// The lens links sent recruiters to case-studies.html, which had one way
// out ("Back to portfolio") and no way to reach Moses. And content.css and
// carbon-ai.css had no light theme (deferred in #41), so a reader who chose
// light on the homepage was back in dark one click later. Now every page
// but the homepage carries the same small nav (Home, Case studies,
// Research, CV, Contact) and closes with a call to action (the address, a
// message, the CV); the pages built on carbon-ai.css have the homepage's
// theme switch, and theme.js applies the choice the homepage stores before
// the first paint.
//
// What is checked here, without a browser: the nav, the call to action and
// back to top on each page, the page marked as current, the switch only
// where a script can drive it, the hand-authored pages' regions exactly as
// build-content.js writes them, theme.js from a stored choice or the
// system's, pressed, with storage blocked and back from the page cache,
// one choice shared with the homepage's script.js, the homepage with none
// opening in the theme theme.js would (mks.theme), and the light palette,
// twice and the same, the homepage's. What needs a real browser (both
// themes through axe, the choice followed from page to page, every page at
// 320px) is in scripts/smoke.js.
//
// Run with: node tests/shell.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { run, ROOT, themeJs: themeHome } = require('./harness.js');
const { shellFacts, shellRegions, shellMarkers } = require('../scripts/build-content.js');

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
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const profile = JSON.parse(read('content/profile.json'));

// Every page at the root but the homepage, read from the directory so a new
// page is held to the shell the day it exists.
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && f !== 'index.html').sort();
// The pages built on carbon-ai.css, which can carry the theme switch.
const THEMED = PAGES.filter(p => /<link[^>]+href="carbon-ai\.css"/.test(read(p)));

// Where a link goes, as a repository path and fragment: 404.html's links are
// root-absolute (/sustaintheworld/#contact is index.html#contact).
const BASE = new URL(profile.links.site).pathname;
const where = (href) => {
    let h = href || '';
    if (h.startsWith(BASE)) h = h.slice(BASE.length);
    if (h === '' || h.startsWith('#')) h = 'index.html' + h;
    return h;
};

const NAV = [
    ['Home', 'index.html'],
    ['Case studies', 'case-studies.html'],
    ['Research', 'research.html'],
    ['CV', profile.links.cv],
    ['Contact', 'index.html#contact']
];

assert(PAGES.length >= 6 && ['carbon-ai.html', 'case-studies.html', 'research.html', 'stats.html'].every(p => THEMED.includes(p)),
    `Pages: every page but the homepage is checked (${PAGES.join(', ')}), four of them on carbon-ai.css`);

// ===================================================================
// The nav: the same five places on every page, the current one marked
// ===================================================================
PAGES.forEach((page) => {
    const doc = new JSDOM(read(page)).window.document;
    const navs = doc.querySelectorAll('nav[aria-label="Main"]');
    assert(navs.length === 1, `${page}: one nav named Main (${navs.length})`);
    const nav = navs[0];
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll('a')).filter(a => !a.classList.contains('ca-nav-logo'));
    const got = links.map(a => [text(a), where(a.getAttribute('href'))]);
    assert(JSON.stringify(got) === JSON.stringify(NAV),
        `${page}: the nav is Home, Case studies, Research, CV and Contact, in that order, each where it says (${got.map(g => g.join(' → ')).join(', ')})`);
    const main = doc.querySelector('main');
    assert(!!main && (nav.compareDocumentPosition(main) & 4) !== 0, `${page}: the nav comes before <main>, at the top of the page`);

    const cv = links.find(a => text(a) === 'CV');
    assert(!!cv && cv.hasAttribute('download') && /^cv-download-[a-z0-9-]+$/.test(cv.getAttribute('data-analytics') || ''),
        `${page}: the nav's CV link downloads the file and is counted as a CV download`);

    // The lens switcher on the case studies has aria-current of its own;
    // only the nav's links are this page's place in the site.
    const current = links.filter(a => a.hasAttribute('aria-current'));
    const expected = NAV.filter(([, target]) => target === page).map(([label]) => label);
    assert(JSON.stringify(current.map(text)) === JSON.stringify(expected) && current.every(a => a.getAttribute('aria-current') === 'page'),
        `${page}: aria-current="page" marks ${expected.join(', ') || 'no link'} in the nav (marked: ${current.map(text).join(', ') || 'none'})`);
});

// ===================================================================
// The closing call to action: the address, a message and the CV
// ===================================================================
PAGES.forEach((page) => {
    const doc = new JSDOM(read(page)).window.document;
    const main = doc.querySelector('main');
    if (!main) return assert(false, `${page}: has a <main>`);
    const offers = (el) => {
        const hrefs = Array.from(el.querySelectorAll('a')).map(a => where(a.getAttribute('href')));
        const cv = Array.from(el.querySelectorAll('a[download]')).map(a => where(a.getAttribute('href')));
        return hrefs.includes(`mailto:${profile.person.email}`) && hrefs.includes('index.html#contact') && cv.includes(profile.links.cv);
    };
    // The smallest blocks that offer all three: one per page.
    const blocks = Array.from(main.querySelectorAll('section, p')).filter(el => offers(el) && !Array.from(el.children).some(offers));
    assert(blocks.length === 1, `${page}: one call to action in <main> with profile.json's address, the contact form and the CV download (${blocks.length})`);
    const cta = blocks[0];
    if (!cta) return;
    const mail = cta.querySelector('a[href^="mailto:"]');
    assert(text(mail) === profile.person.email && /^email-[a-z0-9-]+$/.test(mail.getAttribute('data-analytics') || ''),
        `${page}: the call to action shows the address itself, and a click on it is counted`);
    assert(Array.from(cta.querySelectorAll('a')).some(a => where(a.getAttribute('href')) === 'index.html#contact' && /send a message/i.test(text(a))),
        `${page}: "Send a message" goes to the contact form on the homepage`);

    if (THEMED.includes(page)) {
        // The generated pages' last word: the call to action, then back to top.
        const tail = Array.from(main.children).slice(-2);
        assert(tail[0] === cta && tail[0].matches('section.ca-cta') && tail[1].matches('p.ca-top'),
            `${page}: <main> ends with the call to action and back to top (${tail.map(el => el.tagName.toLowerCase() + '.' + el.className).join(', ')})`);
        assert(text(cta).includes(`Open to ${profile.atAGlance.targetRoles}`),
            `${page}: the call to action says who Moses is open to hearing from in profile.json's words`);
        const top = tail[1] && tail[1].querySelector('a');
        assert(!!top && top.getAttribute('href') === '#top' && doc.body.id === 'top' && text(top) === 'Back to top',
            `${page}: back to top goes to <body id="top">`);
    }
});

// ===================================================================
// The theme switch: only where theme.js runs, hidden until it does
// ===================================================================
PAGES.forEach((page) => {
    const src = read(page);
    const doc = new JSDOM(src).window.document;
    const head = src.slice(0, src.indexOf('</head>'));
    const toggle = doc.getElementById('themeToggle');
    const themeTags = head.match(/<script\b[^>]*\bsrc="theme\.js"[^>]*>/g) || [];
    if (THEMED.includes(page)) {
        const nav = doc.querySelector('nav[aria-label="Main"]');
        assert(!!toggle && nav && nav.contains(toggle) && toggle.getAttribute('type') === 'button' && toggle.hidden,
            `${page}: the theme switch is a button in the nav, shipped hidden (without its script it could switch nothing)`);
        assert(!!toggle && toggle.getAttribute('aria-label') === 'Switch to light theme' && !!toggle.querySelector('use[href="#i-moon"]'),
            `${page}: it ships named for what a press does, as the homepage's is`);
        assert(['i-moon', 'i-sun'].every(id => doc.getElementById(id) && doc.getElementById(id).tagName.toLowerCase() === 'symbol'),
            `${page}: both of its icons are in the page's sprite`);
        const firstSheet = head.search(/<link[^>]+rel="stylesheet"/);
        assert(themeTags.length === 1 && !/\b(defer|async)\b/.test(themeTags[0]) && head.indexOf(themeTags[0]) < firstSheet &&
            head.indexOf(themeTags[0]) > head.search(/<meta name="theme-color"/),
            `${page}: theme.js runs in <head>, after the theme-color meta it sets and before the stylesheets, not deferred`);
    } else {
        assert(!toggle && themeTags.length === 0, `${page}: no theme switch and no theme script (nothing there could drive them)`);
    }
});
{
    // The text-only edition stays text: one script, the visit counter.
    const scripts = read('field-report.html').match(/<script\b[^>]*>/g) || [];
    assert(scripts.length === 1 && /src="count\.js"/.test(scripts[0]), `field-report.html: the only script is the visit counter (${scripts.length})`);
}

// ===================================================================
// The hand-authored pages: the shell exactly as build-content.js writes it
// ===================================================================
['carbon-ai.html', 'field-report.html', '404.html'].forEach((page) => {
    const src = read(page);
    const regions = shellRegions(page, shellFacts(profile));
    Object.entries(regions).forEach(([name, block]) => {
        const [START, END] = shellMarkers(name);
        const start = src.indexOf(START);
        const end = src.indexOf(END);
        const once = start > -1 && end > start && src.indexOf(START, start + 1) === -1;
        const inside = once ? src.slice(start + START.length, end).split('\n').slice(1, -1).map(l => l.trim()).join('\n') : null;
        assert(once && inside === block.split('\n').map(l => l.trim()).join('\n'),
            `${page}: the ${name} region is there once and is exactly what build-content.js writes (npm run build:check fails otherwise)`);
    });
});
{
    // The 404 page answers at any address, so its links cannot be relative.
    const doc = new JSDOM(read('404.html')).window.document;
    const rel = Array.from(doc.querySelectorAll('a[href]')).map(a => a.getAttribute('href'))
        .filter(h => !h.startsWith(BASE) && !h.startsWith('mailto:') && !/^https?:/.test(h));
    assert(rel.length === 0, `404.html: every link is root-absolute (${rel.join(', ') || 'all are'})`);
}

// ===================================================================
// theme.js, as the browser runs it: in <head>, before the page is ready
// ===================================================================
const themeJs = read('theme.js');
const casePage = read('case-studies.html');

/**
 * case-studies.html with theme.js run where it sits, before the rest of the
 * document is ready. `stored` is what localStorage holds under 'theme'
 * (undefined: nothing); `system` what prefers-color-scheme answers ('light',
 * 'dark', or 'none' for a browser without matchMedia); storage 'blocked'
 * makes the property access itself throw, as a browser does with storage
 * disabled.
 */
async function open({ stored, system = 'dark', storage = 'ok', html = casePage } = {}) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.com/case-studies.html' });
    const { window } = dom;
    const errors = [];
    window.addEventListener('error', e => errors.push(e.error || e.message));
    if (storage === 'blocked') {
        ['localStorage', 'sessionStorage'].forEach(name => Object.defineProperty(window, name, {
            configurable: true,
            get() { throw new window.DOMException('The operation is insecure.', 'SecurityError'); }
        }));
    } else if (stored !== undefined) {
        window.localStorage.setItem('theme', stored);
    }
    if (system !== 'none') {
        window.matchMedia = (q) => ({ matches: q === '(prefers-color-scheme: light)' && system === 'light', media: q });
    }
    try { window.eval(themeJs); } catch (e) { errors.push(e); }
    const early = {
        readyState: window.document.readyState,
        theme: window.document.documentElement.getAttribute('data-theme'),
        bar: window.document.querySelector('meta[name="theme-color"]').getAttribute('content')
    };
    await new Promise(r => window.document.addEventListener('DOMContentLoaded', () => setTimeout(r, 0)));
    return { window, doc: window.document, early, errors };
}

const state = (doc) => {
    const b = doc.getElementById('themeToggle');
    return {
        theme: doc.documentElement.getAttribute('data-theme'),
        bar: doc.querySelector('meta[name="theme-color"]').getAttribute('content'),
        hidden: b ? b.hidden : null,
        name: b ? b.getAttribute('aria-label') : null,
        icon: b ? b.querySelector('use').getAttribute('href') : null
    };
};

(async () => {
    // --- before the first paint -----------------------------------------
    {
        const { early, doc, errors } = await open({ stored: 'light' });
        assert(early.readyState === 'loading' && early.theme === 'light' && early.bar === '#f4f6f0',
            `First paint: a stored choice of light is on <html>, and on the browser bar, while the page is still loading (${JSON.stringify(early)})`);
        const s = state(doc);
        assert(s.hidden === false && s.name === 'Switch to dark theme' && s.icon === '#i-sun',
            `Light: once the page is ready the switch shows, named for a press to dark, with the sun (${JSON.stringify(s)})`);
        assert(errors.length === 0, `Light: no errors (${errors.map(String).join('; ') || 'none'})`);
    }

    // --- what decides, in order -------------------------------------------
    {
        const a = await open({ stored: 'dark', system: 'light' });
        assert(a.early.theme === 'dark', 'Order: a stored choice wins over the system\'s setting');
        const b = await open({ system: 'light' });
        assert(b.early.theme === 'light' && b.window.localStorage.getItem('theme') === null,
            'Order: with nothing stored a light system gets light, and nothing is stored for the reader');
        const c = await open({});
        assert(c.early.theme === 'dark' && state(c.doc).name === 'Switch to light theme' && state(c.doc).icon === '#i-moon',
            'Order: with nothing stored and a dark system, dark, the switch offering light');
        const d = await open({ stored: 'sepia', system: 'light' });
        assert(d.early.theme === 'light', 'Order: a stored value that is not a theme is ignored');
        const e = await open({ system: 'none' });
        assert(e.early.theme === 'dark' && e.errors.length === 0, 'Order: a browser with no matchMedia gets dark, without an error');
    }

    // --- the switch ---------------------------------------------------------
    {
        const { window, doc, errors } = await open({ system: 'light' });
        doc.getElementById('themeToggle').click();
        let s = state(doc);
        assert(s.theme === 'dark' && s.bar === '#0a0a0a' && s.name === 'Switch to light theme' && s.icon === '#i-moon',
            `Switch: a press from light goes dark on <html>, the bar and the switch itself (${JSON.stringify(s)})`);
        assert(window.localStorage.getItem('theme') === 'dark', 'Switch: the choice is stored under the homepage\'s key');
        doc.getElementById('themeToggle').click();
        s = state(doc);
        assert(s.theme === 'light' && window.localStorage.getItem('theme') === 'light', 'Switch: and back to light, stored again');
        assert(errors.length === 0, 'Switch: no errors');
    }

    // --- storage blocked ------------------------------------------------------
    {
        const { doc, errors } = await open({ storage: 'blocked', system: 'light' });
        assert(errors.length === 0 && state(doc).theme === 'light',
            `Blocked storage: no error, and the system's setting decides (${errors.map(String).join('; ') || 'no errors'})`);
        doc.getElementById('themeToggle').click();
        assert(state(doc).theme === 'dark' && errors.length === 0, 'Blocked storage: the switch still switches this page; it just cannot remember');
    }

    // --- back from the page cache --------------------------------------------
    {
        const { window, doc } = await open({ stored: 'dark' });
        window.localStorage.setItem('theme', 'light');   // chosen on another page meanwhile
        const shown = new window.Event('pageshow');
        shown.persisted = true;
        window.dispatchEvent(shown);
        const s = state(doc);
        assert(s.theme === 'light' && s.name === 'Switch to dark theme', `Back: a page restored whole takes up the choice made elsewhere since (${s.theme})`);
    }

    // --- a page with no switch ----------------------------------------------
    {
        const bare = casePage.replace(/<button[^>]*id="themeToggle"[\s\S]*?<\/button>/, '');
        const { doc, errors } = await open({ stored: 'light', html: bare });
        assert(errors.length === 0 && state(doc).theme === 'light', 'No switch: the theme still applies, without an error');
    }

    // --- one choice, shared with the homepage --------------------------------
    // The homepage keeps its theme through script.js; a choice made on either
    // is the theme on the other.
    {
        const quiet = { before: (w) => { w.console.log = () => {}; } };
        const home = run('dark', quiet);
        home.window.document.getElementById('themeToggle').click();
        const written = home.window.localStorage.getItem('theme');
        const next = await open({ stored: written });
        assert(written === 'light' && next.early.theme === 'light',
            `Shared: light chosen on the homepage (stored "${written}") is light on the next page`);

        const here = await open({ stored: 'dark', system: 'dark' });
        here.doc.getElementById('themeToggle').click();
        const back = run(here.window.localStorage.getItem('theme'), quiet);
        assert(back.window.document.documentElement.classList.contains('light-mode'), 'Shared: light chosen here is the homepage\'s theme too');
        // Left open: a homepage closed while the suite still awaits has its
        // timers fire into a window with no document.
    }

    // --- the homepage with nothing stored: the system's, as here -------------
    // It opened dark whatever the system said, so a reader on a light system
    // who had never pressed a switch met light on every page but the first.
    // mks.theme, inline in index.html's <head>, decides now, by the rule
    // theme.js uses: a stored choice, else the system's, else dark.
    {
        const system = (scheme) => (w) => {
            w.console.log = () => {};
            if (scheme === 'none') return;
            w.matchMedia = (q) => ({ matches: q === '(prefers-color-scheme: light)' && scheme === 'light', media: q,
                addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
        };
        const home = (stored, scheme, storage) => {
            const r = run(stored, { before: system(scheme), storage });
            const doc = r.window.document;
            const b = doc.getElementById('themeToggle');
            const s = {
                light: doc.documentElement.classList.contains('light-mode'),
                name: b.getAttribute('aria-label'),
                icon: b.querySelector('use').getAttribute('href'),
                bar: doc.querySelector('meta[name="theme-color"]').getAttribute('content'),
                stored: storage === 'blocked' ? null : r.window.localStorage.getItem('theme')
            };
            return Object.assign(r, { doc, s });
        };

        // It sat at the top of <body>, after the stylesheet's <link>. An
        // inline script after a stylesheet still loading waits for it, and
        // Chromium could draw a frame in between: dark, on a light system,
        // in about one smoke run in ten. Before the stylesheet nothing makes
        // it wait, and <html> is there to take the class.
        const html = read('index.html');
        const head = html.slice(0, html.indexOf('</head>'));
        const at = head.search(/<script>[^<]*\bmks\.theme\(\)<\/script>/);
        const sheet = head.indexOf('rel="stylesheet"');
        assert(at > -1 && sheet > -1 && at < sheet,
            `Homepage: mks.theme is inline in <head>, before the stylesheet, so nothing holds it back from the first frame (script at ${at}, stylesheet at ${sheet})`);
        assert(/documentElement\.classList\.toggle\('light-mode'/.test(themeHome) && !/document\.body\b/.test(themeHome),
            'Homepage: it marks <html>, which exists in <head>, not <body>, which does not yet');

        // The browser's bar with it. Only script.js set it, a 76 KB script at
        // the foot of the page: a light page sat under a dark bar until it
        // ran, and for good if it failed. Here mks.theme runs alone, before
        // the stylesheet and with no script.js, as a browser runs it in <head>.
        const bar = head.search(/<meta name="theme-color"/);
        assert(bar > -1 && bar < at, `Homepage: the theme-color meta comes before mks.theme, which sets it (meta at ${bar}, script at ${at})`);
        const alone = (stored, scheme) => {
            const w = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' }).window;
            if (stored) w.localStorage.setItem('theme', stored);
            w.matchMedia = (q) => ({ matches: q === '(prefers-color-scheme: light)' && scheme === 'light' });
            w.eval(themeHome);
            return w.document.querySelector('meta[name="theme-color"]').getAttribute('content');
        };
        const bars = [alone(null, 'light'), alone(null, 'dark'), alone('dark', 'light'), alone('light', 'dark')];
        assert(JSON.stringify(bars) === JSON.stringify(['#f4f6f0', '#0a0a0a', '#0a0a0a', '#f4f6f0']),
            `Homepage: mks.theme on its own sets the bar to the theme it chose, stored or the system's, before script.js (${bars.join(', ')})`);
        const homeCss = read('style.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const bodyKeyed = (homeCss.match(/body\.light-mode[^{]*/g) || []).concat((read('modules/dispatch.css').match(/body\.light-mode[^{]*/g) || []));
        assert(bodyKeyed.length === 0 && /html\.light-mode\s*{/.test(homeCss),
            `Homepage: the light palette is keyed on html.light-mode, where mks.theme puts it (${bodyKeyed.join('; ') || 'nothing on body'})`);
        // Under reduced motion every element transitions for 0.01ms, so a
        // change of theme eased body's colour from dark's white, and what
        // was styled in that frame kept white text on the light page until
        // next restyled (axe caught it, one smoke run in four). Body never
        // transitions.
        const calm = (read('style.css').match(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{[\s\S]*?\n\}/) || [''])[0];
        assert(/transition-duration: 0\.01ms !important/.test(calm) && /\n\s*body \{ transition: none !important; \}/.test(calm),
            'Homepage: under reduced motion, where everything else transitions for 0.01ms, body does not, so a change of theme is not eased in');

        const lit = home(undefined, 'light');
        assert(lit.s.light && lit.s.name === 'Switch to dark theme' && lit.s.icon === '#i-sun' && lit.s.bar === '#f4f6f0' && lit.s.stored === null && lit.errors.length === 0,
            `Homepage: a light system and nothing stored opens light, the switch and the browser bar with it, and nothing is stored for it (${JSON.stringify(lit.s)})`);
        lit.doc.getElementById('themeToggle').click();
        assert(!lit.doc.documentElement.classList.contains('light-mode') && lit.window.localStorage.getItem('theme') === 'dark',
            'Homepage: a press from the system\'s light is dark, and that choice is stored');
        const dark = home(undefined, 'dark');
        assert(!dark.s.light && dark.s.name === 'Switch to light theme' && dark.s.bar === '#0a0a0a', `Homepage: a dark system and nothing stored opens dark (${JSON.stringify(dark.s)})`);
        const blocked = home(undefined, 'light', 'blocked');
        assert(blocked.s.light && blocked.errors.length === 0, 'Homepage: with storage blocked it still follows a light system, without an error');

        // The same answer as theme.js, for every choice and every system.
        const differ = [];
        for (const stored of [undefined, 'light', 'dark', 'purple']) {
            for (const scheme of ['light', 'dark', 'none']) {
                const h = home(stored, scheme);
                const other = await open({ stored, system: scheme });
                if (h.s.light !== (other.early.theme === 'light')) differ.push(`${stored}/${scheme}: home ${h.s.light ? 'light' : 'dark'}, theme.js ${other.early.theme}`);
                other.window.close();   // the homepages stay open: closed, their timers throw
            }
        }
        assert(differ.length === 0, `Homepage: it opens in the theme theme.js would, stored light, dark, junk or nothing, on a light, dark or older browser (${differ.join('; ') || 'all 12 agree'})`);

        // Back to a homepage the browser kept whole, after light was chosen
        // on another page: it takes up the choice, switch and bar with it.
        const kept = home('dark', 'dark');
        kept.window.localStorage.setItem('theme', 'light');
        const shown = new kept.window.Event('pageshow');
        shown.persisted = true;
        kept.window.dispatchEvent(shown);
        const now = { light: kept.doc.documentElement.classList.contains('light-mode'), name: kept.doc.getElementById('themeToggle').getAttribute('aria-label'), bar: kept.doc.querySelector('meta[name="theme-color"]').getAttribute('content') };
        assert(now.light && now.name === 'Switch to dark theme' && now.bar === '#f4f6f0', `Homepage: Back to a kept page takes up the choice made elsewhere since (${JSON.stringify(now)})`);
    }

    // ===================================================================
    // The palette: the light one twice and the same, and the homepage's
    // ===================================================================
    {
        const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
        const css = strip(read('carbon-ai.css'));
        const tokens = (body) => Object.fromEntries((body.match(/--[\w-]+:\s*[^;]+/g) || []).map(d => d.split(/:\s*/)));
        const dark = tokens((css.match(/:root\s*{([^}]*)}/) || [])[1] || '');
        const explicit = tokens((css.match(/:root\[data-theme="light"\]\s*{([^}]*)}/) || [])[1] || '');
        const system = tokens((css.match(/@media \(prefers-color-scheme: light\)\s*{\s*:root:not\(\[data-theme\]\)\s*{([^}]*)}/) || [])[1] || '');
        assert(Object.keys(explicit).length >= 10 && JSON.stringify(explicit) === JSON.stringify(system),
            `Palette: the light tokens are the same set by theme.js and by the system setting alone (${Object.keys(explicit).length} and ${Object.keys(system).length})`);
        const unpaired = Object.keys(explicit).filter(k => !(k in dark)).concat(Object.keys(dark).filter(k => !(k in explicit)));
        assert(unpaired.length === 0, `Palette: every token has a dark and a light value (${unpaired.join(', ') || 'all paired'})`);

        const home = tokens((strip(read('style.css')).match(/html\.light-mode\s*{([^}]*)}/) || [])[1] || '');
        const same = { '--primary-green': '--primary-green', '--card-bg': '--card-bg', '--text-primary': '--text-primary',
            '--text-secondary': '--text-secondary', '--text-dim': '--text-dim', '--amber': '--accent-amber', '--border': '--line-color' };
        const differ = Object.entries(same).filter(([mine, theirs]) => explicit[mine] !== home[theirs])
            .map(([mine, theirs]) => `${mine} ${explicit[mine]} vs ${theirs} ${home[theirs]}`);
        assert(differ.length === 0, `Palette: the light colours are the homepage's (${differ.join(', ') || 'all match'})`);
        const bar = (themeHome.match(/content=t\?'([^']+)'/) || [])[1];
        assert(explicit['--darker-bg'] === bar && themeJs.includes(`'${bar}'`),
            `Palette: the light page is the colour of the homepage's light browser bar, and theme.js sets that bar (${bar})`);

        // Text follows the theme only if it takes its colour from a token.
        const literal = ['carbon-ai.css', 'content.css', 'stats.css']
            .flatMap(f => (strip(read(f)).match(/(?<![-\w])color:(?!\s*var\()[^;]+/g) || []).map(d => `${f}: ${d}`));
        assert(literal.length === 0, `Palette: every text colour on these pages is a token (${literal.join('; ') || 'none fixed'})`);
        // A line drawn in white (or black) is there in one theme only: the
        // calculator's rows and the equivalence list lost their dividers on
        // the light page. A tinted line shows on both; a neutral one is a token.
        const neutral = ['carbon-ai.css', 'content.css', 'stats.css']
            .flatMap(f => (strip(read(f)).match(/(?<![-\w])border[\w-]*:[^;]*(?:rgba?\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\b|#f{3}\b|#f{6}\b|#0{3}\b|#0{6}\b|\bwhite\b|\bblack\b)[^;]*/gi) || []).map(d => `${f}: ${d}`));
        assert(neutral.length === 0, `Palette: no line on these pages is a fixed white or black, which one theme cannot see (${neutral.join('; ') || 'none'})`);
        // Anatomy of a Prompt's accents: carbon-ai.html has no html.light-mode.
        const anatomy = strip(read('modules/anatomy.css'));
        assert(/\[data-theme=["']?light["']?\]\s+\.ca-anatomy\s*{/.test(anatomy) && !/light-mode/.test(anatomy),
            'Palette: Anatomy of a Prompt takes its light accents from data-theme, which is what carbon-ai.html sets');
    }

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    process.exit(0);   // the homepage booted above leaves timers running
})().catch((e) => { console.error(e); process.exit(1); });
