// Static checks over every shipped HTML page.
//
// These are the classes of problem an HTML validator and an accessibility
// audit reported: buttons with no explicit type, unnamed navigation
// landmarks, a modal with no dialog semantics, and links pointing at files
// that are not there. None of them break the page loudly, which is exactly
// why they need a test — the site otherwise looks fine while being wrong.
//
// Deliberately dependency-free regex parsing rather than a full validator:
// this runs in CI on every push, and pulling a validator (and its network
// calls) in for six rules is not a trade worth making. A real validator run
// is still worth doing by hand when the markup changes shape.
//
// Run with: node tests/html.test.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGES = [
    'index.html',
    'carbon-ai.html',
    'case-studies.html',
    'research.html',
    'stats.html',
    'claims.html',
    'field-report.html',
    '404.html'
];

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// Comments are stripped first: a `<nav>` mentioned in a comment is not a
// landmark, and a commented-out <img> is not a request.
const read = (page) => fs.readFileSync(path.join(ROOT, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');

// The site is served from a subdirectory on GitHub Pages, so 404.html uses
// root-absolute paths — they are correct in the browser and meaningless
// against the repository root unless the base path is taken into account.
// Read it from the canonical URL rather than hardcoding it.
const BASE = (() => {
    const canonical = (read('index.html').match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [''])[0];
    const href = (canonical.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) return '/';
    try {
        return new URL(href).pathname.replace(/index\.html$/, '');
    } catch (e) {
        return '/';
    }
})();

/** Repo-relative path for a link, or null when it is not ours to resolve. */
function localTarget(ref) {
    if (!ref) return null;
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/i.test(ref)) return null;

    let target = ref.split('#')[0].split('?')[0];
    if (!target) return null;

    if (target.startsWith('/')) {
        if (!target.startsWith(BASE)) return target;      // outside the deployed base — a real error
        target = target.slice(BASE.length);
        if (!target) target = 'index.html';               // the base itself is the homepage
    }
    if (target.endsWith('/')) target += 'index.html';
    return target;
}
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];
const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
    return m ? m[1] : null;
};

PAGES.forEach((page) => {
    const html = read(page);

    // --- A <button> with no type submits the form it sits in ---------------
    // Inside a <form> the default is type="submit", so a decorative button
    // reloads the page. Being explicit costs nothing and removes the class.
    const untyped = tags(html, 'button').filter(t => !attr(t, 'type'));
    assert(untyped.length === 0, `${page}: every <button> declares a type (${untyped.length} without)`);

    const badType = tags(html, 'button')
        .map(t => attr(t, 'type'))
        .filter(t => t && !['button', 'submit', 'reset'].includes(t));
    assert(badType.length === 0, `${page}: no <button> has an invalid type (${badType.join(', ') || 'none'})`);

    // --- Landmarks need names when there is more than one ------------------
    const navs = tags(html, 'nav');
    if (navs.length > 1) {
        const unnamed = navs.filter(t => !attr(t, 'aria-label') && !attr(t, 'aria-labelledby'));
        assert(unnamed.length === 0, `${page}: all ${navs.length} <nav> landmarks are named (${unnamed.length} unnamed)`);

        const names = navs.map(t => attr(t, 'aria-label') || attr(t, 'aria-labelledby'));
        assert(new Set(names).size === names.length, `${page}: <nav> landmark names are distinct (${names.join(' / ')})`);
    } else if (navs.length === 1) {
        assert(
            !!(attr(navs[0], 'aria-label') || attr(navs[0], 'aria-labelledby')),
            `${page}: the <nav> landmark is named`
        );
    }

    assert((html.match(/<main\b/gi) || []).length === 1, `${page}: has exactly one <main> landmark`);
    assert(/<html[^>]+lang=/i.test(html), `${page}: declares a document language`);
    assert((html.match(/<h1\b/gi) || []).length === 1, `${page}: has exactly one <h1>`);

    // --- Duplicate ids break every getElementById and every label ----------
    const ids = (html.match(/\bid=["']([^"']+)["']/gi) || []).map(m => m.replace(/.*["']([^"']+)["']/, '$1'));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert(dupes.length === 0, `${page}: no duplicate ids (${[...new Set(dupes)].join(', ') || 'none'})`);

    // --- Images -----------------------------------------------------------
    const imgs = tags(html, 'img');
    const noAlt = imgs.filter(t => attr(t, 'alt') === null);
    assert(noAlt.length === 0, `${page}: every <img> has an alt attribute (${noAlt.length} without)`);

    // Intrinsic dimensions prevent the layout shifting as images arrive. An
    // <img> with no src would be exempt (the lightbox's is made by script
    // now, with the size of the photo it shows).
    const noDims = imgs.filter(t => attr(t, 'src') && (!attr(t, 'width') || !attr(t, 'height')));
    assert(noDims.length === 0, `${page}: every <img> with a src declares width and height (${noDims.length} without)`);

    // --- Form controls need an accessible name ----------------------------
    const labelled = new Set((html.match(/<label[^>]*\bfor=["']([^"']+)["']/gi) || [])
        .map(m => m.replace(/.*["']([^"']+)["']/, '$1')));
    const controls = ['input', 'select', 'textarea'].flatMap(n => tags(html, n));
    const unnamed = controls.filter((t) => {
        const type = attr(t, 'type');
        if (type && ['hidden', 'submit', 'button', 'reset'].includes(type)) return false;
        const id = attr(t, 'id');
        return !(
            (id && labelled.has(id)) ||
            attr(t, 'aria-label') ||
            attr(t, 'aria-labelledby') ||
            attr(t, 'title')
        );
    });
    assert(unnamed.length === 0, `${page}: every form control has an accessible name (${unnamed.length} without)`);

    // --- Local links and assets must resolve ------------------------------
    const refs = [
        ...(html.match(/\bhref=["']([^"']+)["']/gi) || []),
        ...(html.match(/\bsrc=["']([^"']+)["']/gi) || []),
        ...(html.match(/\bdata-bg=["']([^"']+)["']/gi) || [])
    ].map(m => m.replace(/.*["']([^"']*)["']/, '$1'));

    const broken = refs.filter((ref) => {
        const target = localTarget(ref);
        if (!target) return false;
        return !fs.existsSync(path.join(ROOT, target));
    });
    assert(broken.length === 0, `${page}: every local link and asset resolves (missing: ${[...new Set(broken)].join(', ') || 'none'})`);

    // --- Nothing a page needs comes from a third party --------------------
    // Fonts were the last cross-origin dependency: every visitor's IP went
    // to Google before a word rendered, and the bytes escaped the budget.
    // Links to other sites are fine; stylesheets, scripts, preloads and
    // fonts must be files in this repository. `npm run smoke` checks the
    // same thing at runtime.
    const remoteDeps = [
        ...tags(html, 'link').filter(t => /rel=["'](stylesheet|preload|modulepreload|preconnect|dns-prefetch)["']/i.test(t)),
        ...tags(html, 'script')
    ].map(t => attr(t, 'href') || attr(t, 'src')).filter(ref => ref && /^(https?:)?\/\//i.test(ref));
    assert(remoteDeps.length === 0, `${page}: no stylesheet, script, preload or preconnect points off this origin (${remoteDeps.join(', ') || 'none'})`);

    // --- Skip links must land somewhere -----------------------------------
    const skip = (html.match(/<a[^>]+class=["'][^"']*skip-link[^"']*["'][^>]*>/i) || [])[0];
    if (skip) {
        const target = (attr(skip, 'href') || '').slice(1);
        assert(
            target && new RegExp(`id=["']${target}["']`).test(html),
            `${page}: the skip link targets an element that exists (#${target})`
        );
    }

    // --- An entity escaped twice renders as its own source ----------------
    // The generator once passed "&middot;" through esc(), and two page
    // headers read "PROBLEM &middot; METHOD" in the browser.
    const doubled = html.match(/&amp;(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi) || [];
    assert(doubled.length === 0, `${page}: no entity is escaped twice (${[...new Set(doubled)].join(', ') || 'none'})`);

    // --- An aria-hidden container must not hold focusable children --------
    // Focus lands somewhere the screen reader has been told does not exist.
    const hiddenBlocks = html.match(/<(\w+)[^>]*aria-hidden=["']true["'][^>]*>/gi) || [];
    const hiddenWithTabindex = hiddenBlocks.filter(t => /tabindex=["'](?!-1)/.test(t));
    assert(hiddenWithTabindex.length === 0, `${page}: nothing is both aria-hidden and focusable`);
});

// --- Every icon a page draws is in that page's sprite ---------------------
// A <use> whose symbol is not there draws nothing, silently. index.html's
// sprite is one long line several changes touch at once (eleven unused
// symbols came out of it in one), so this holds every icon to it: those in
// the markup, and those the page's scripts write, the modules it fetches
// included (named outright, or by the few templates that pick one).
PAGES.forEach((page) => {
    const html = read(page);
    const symbols = new Set((html.match(/<symbol\b[^>]*\bid=["']([^"']+)["']/gi) || []).map(t => attr(t, 'id')));
    const scripts = new Set((html.match(/<script\b[^>]*\bsrc=["'][^"']+["']/gi) || []).map(t => attr(t, 'src')).filter(src => !/^(https?:)?\/\//.test(src)));
    const inline = (html.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || []).join('\n');
    // Code only: a module a comment mentions is not one the page fetches.
    const source = (src) => (fs.existsSync(path.join(ROOT, src)) ? fs.readFileSync(path.join(ROOT, src), 'utf8') : '')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // The modules a page's own scripts fetch (script.js's MODULES, the case
    // studies' loader, carbon-ai.html's Anatomy) are named in them as paths.
    [inline, ...Array.from(scripts).map(source)]
        .forEach(text => (text.match(/modules\/[\w-]+\.js/g) || []).forEach(m => scripts.add(m)));
    const code = inline + Array.from(scripts).map(source).join('\n');
    const drawn = new Set([
        ...(html.match(/<use\b[^>]*\bhref=["']#([^"']+)["']/gi) || []).map(t => attr(t, 'href').slice(1)),
        ...(code.match(/#i-[a-z0-9-]+/g) || []).map(m => m.slice(1)),
        // `#i-${light ? 'sun' : 'moon'}`, setIcon('pause'), icon: 'fa-leaf'
        ...(code.match(/#i-\$\{[^}]*\?[^}]*\}/g) || []).flatMap(t => (t.match(/'([a-z0-9-]+)'/g) || []).map(q => `i-${q.slice(1, -1)}`)),
        ...(/#i-\$\{name\}/.test(code) ? (code.match(/setIcon\('([a-z0-9-]+)'\)/g) || []).map(m => `i-${m.slice(9, -2)}`) : []),
        ...(/#i-\$\{t\.icon\.replace\('fa-', ''\)\}/.test(code) ? (code.match(/icon: 'fa-([a-z0-9-]+)'/g) || []).map(m => `i-${m.slice(10, -1)}`) : [])
    ].filter(id => id.startsWith('i-') && !/^i-(\$|$)/.test(id)));
    const missing = Array.from(drawn).filter(id => !symbols.has(id));
    assert(missing.length === 0, `${page}: every icon it draws (${drawn.size}) is a <symbol> in its sprite (missing: ${missing.join(', ') || 'none'})`);
});

// --- Structured data ------------------------------------------------------
// A <script type="application/ld+json"> block is raw text: HTML entities are
// NOT decoded inside it. Escaping an ampersand there — which is the right
// thing to do everywhere else on the page — puts a literal "&amp;" into the
// value Google reads back. Both halves are checked here.
PAGES.forEach((page) => {
    const raw = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const blocks = raw.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

    blocks.forEach((block, i) => {
        const body = block.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');

        let parsed = null;
        try {
            parsed = JSON.parse(body);
        } catch (err) {
            assert(false, `${page}: JSON-LD block ${i + 1} parses as JSON (${err.message})`);
            return;
        }
        assert(true, `${page}: JSON-LD block ${i + 1} parses as JSON`);

        const entities = body.match(/&(amp|lt|gt|quot|#\d+);/g) || [];
        assert(
            entities.length === 0,
            `${page}: JSON-LD block ${i + 1} contains no HTML entities — they are not decoded there (${[...new Set(entities)].join(', ') || 'none'})`
        );

        assert(!!parsed['@context'] && !!parsed['@type'], `${page}: JSON-LD block ${i + 1} declares @context and @type`);
    });
});

// --- The one request allowed to leave the site: the visit counter's --------
// Pages link to other sites, but at runtime nothing may be fetched from or
// sent to anywhere else, with exactly one exception: the Apps Script
// deployment the contact form posts to, which the visit counter (count.js)
// also posts to with ?action=count. This holds every script the site ships
// to that: the only absolute addresses any of them may contain are that
// deployment, that deployment with ?action=count, and the SVG namespace
// (a name, never fetched). `npm run smoke` checks the same at runtime and
// fails on any request to anywhere else.
{
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const js = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const GAS = (js('script.js').match(/const GOOGLE_APPS_SCRIPT_URL = '([^']+)'/) || [])[1] || '';
    const COUNT_URL = `${GAS}?action=count`;
    assert(/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(GAS), `Endpoint: script.js names one Apps Script deployment (${GAS || 'none'})`);

    const form = (read('index.html').match(/<form[^>]+id=["']contactForm["'][^>]*>/i) || [''])[0];
    assert(attr(form, 'action') === GAS, 'Endpoint: the contact form without JavaScript posts to the same deployment');

    const shipped = [
        'script.js', 'count.js', 'theme.js', 'carbon-ai.js', 'ai-carbon-data.js', 'voice-scripts.js',
        ...fs.readdirSync(path.join(ROOT, 'modules')).filter(f => f.endsWith('.js')).map(f => `modules/${f}`)
    ].map(rel => [rel, js(rel)]);
    PAGES.forEach((page) => {
        const inline = (read(page).match(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>[\s\S]*?<\/script>/gi) || []).join('\n');
        if (inline) shipped.push([`${page} (inline)`, inline]);
    });

    const allowed = new Set([GAS, COUNT_URL, SVG_NS]);
    const offenders = [];
    shipped.forEach(([rel, text]) => {
        (text.match(/['"`](?:https?:)?\/\/[^'"`\s$]*/g) || []).map(m => m.slice(1))
            .filter(url => !allowed.has(url))
            .forEach(url => offenders.push(`${rel}: ${url}`));
    });
    assert(offenders.length === 0, `Endpoint: no shipped script names any other off-site address (${offenders.join(', ') || 'none'})`);

    const count = js('count.js');
    const urls = count.match(/['"`](?:https?:)?\/\/[^'"`\s$]*/g) || [];
    assert(urls.length === 1 && urls[0].slice(1) === COUNT_URL, `Endpoint: count.js sends to that deployment with ?action=count and nowhere else (${urls.map(u => u.slice(1)).join(', ')})`);

    // sendBeacon always carries the browser's cookies for the address it
    // posts to, and cannot be told not to; count.js uses a keepalive fetch
    // with credentials: 'omit' instead. This keeps it that way.
    const beacons = shipped.filter(([, text]) => /\bsendBeacon\s*\(/.test(text)).map(([rel]) => rel);
    assert(beacons.length === 0, `Endpoint: nothing uses navigator.sendBeacon, which cannot leave cookies out (${beacons.join(', ') || 'none'})`);
}

// --- Every page is counted, by the one counter ------------------------------
PAGES.forEach((page) => {
    const scripts = tags(read(page), 'script').filter(t => /(^|\/)count\.js$/.test(attr(t, 'src') || ''));
    assert(scripts.length === 1, `${page}: loads count.js once (${scripts.length})`);
    if (scripts[0]) assert(/\bdefer\b/.test(scripts[0]), `${page}: count.js is deferred, so it never holds up the page`);
    if (page === '404.html' && scripts[0]) {
        assert(attr(scripts[0], 'data-page') === '404', '404.html: names itself to the counter, since its address is whatever was missing');
    }
});

// --- The lightbox is a modal and has to say so ----------------------------
// It went with the photos to case-studies.html, where the page's own script
// makes the dialog at the first press (tests/phone.test.js drives it, and
// scripts/smoke.js in a browser). What the page ships is a link per photo,
// to the photo itself: the whole feature, without JavaScript.
{
    assert(!/id=["']lightbox["']/.test(read('index.html')), 'index.html: no lightbox is left on the homepage');
    const html = read('case-studies.html');
    const links = html.match(/<a\b[^>]*data-lightbox=[^>]*>\s*<img\b[^>]*>/gi) || [];
    // The generator writes these in double quotes, and a caption may hold
    // an apostrophe ("I'm ready"), which attr() would stop at.
    const dq = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];
    const bad = links.filter((m) => {
        const a = m.match(/<a\b[^>]*>/i)[0], img = m.match(/<img\b[^>]*>/i)[0];
        const href = dq(a, 'href');
        return !href || href !== dq(img, 'src') || !fs.existsSync(path.join(ROOT, href)) || !dq(a, 'data-caption') ||
            !dq(img, 'alt') || dq(img, 'loading') !== 'lazy';
    });
    assert(links.length >= 20 && bad.length === 0,
        `case-studies.html: each of its ${links.length} photos is a link to the photo it shows, with a caption for the lightbox, alt text, and lazy (${bad.length} not)`);
    assert(!/id=["']lightbox["']/.test(html), 'case-studies.html: no dialog in the markup, where it would sit dead without JavaScript');

    // The dialog as its script makes it.
    const js = (html.match(/<script>[\s\S]*?<\/script>/g) || []).join('\n');
    const start = js.indexOf("querySelectorAll('a[data-lightbox]')");
    const block = start > -1 ? js.slice(start) : '';
    assert(/setAttribute\('role', 'dialog'\)/.test(block) && /setAttribute\('aria-modal', 'true'\)/.test(block),
        'Lightbox: declares role="dialog" and aria-modal="true"');
    assert(/'aria-labelledby', 'lightboxCaption'/.test(block) && /setAttribute\('aria-label'/.test(block),
        'Lightbox: carries an accessible name, its caption or else the alt text');
    assert(/opener = link/.test(block) && /opener\.focus\(\)/.test(block), 'Lightbox: returns focus to the photo that opened it');
    assert(/e\.key === 'Escape'/.test(block) && /e\.key === 'Tab'/.test(block), 'Lightbox: closes on Escape and keeps Tab inside the dialog');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
