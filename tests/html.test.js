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
const PAGES = ['index.html', 'carbon-ai.html', 'field-report.html', '404.html'];

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

    // Intrinsic dimensions prevent the layout shifting as images arrive. The
    // lightbox's placeholder has no src until it is opened, so it is exempt.
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

    // --- Skip links must land somewhere -----------------------------------
    const skip = (html.match(/<a[^>]+class=["'][^"']*skip-link[^"']*["'][^>]*>/i) || [])[0];
    if (skip) {
        const target = (attr(skip, 'href') || '').slice(1);
        assert(
            target && new RegExp(`id=["']${target}["']`).test(html),
            `${page}: the skip link targets an element that exists (#${target})`
        );
    }

    // --- An aria-hidden container must not hold focusable children --------
    // Focus lands somewhere the screen reader has been told does not exist.
    const hiddenBlocks = html.match(/<(\w+)[^>]*aria-hidden=["']true["'][^>]*>/gi) || [];
    const hiddenWithTabindex = hiddenBlocks.filter(t => /tabindex=["'](?!-1)/.test(t));
    assert(hiddenWithTabindex.length === 0, `${page}: nothing is both aria-hidden and focusable`);
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

// --- The lightbox is a modal and has to say so ----------------------------
{
    const html = read('index.html');
    const dialog = (html.match(/<div[^>]+id=["']lightbox["'][^>]*>/i) || [])[0];
    assert(!!dialog, 'index.html: the lightbox container is present');
    if (dialog) {
        assert(attr(dialog, 'role') === 'dialog', 'Lightbox: declares role="dialog"');
        assert(attr(dialog, 'aria-modal') === 'true', 'Lightbox: declares aria-modal="true"');
        assert(
            !!(attr(dialog, 'aria-labelledby') || attr(dialog, 'aria-label')),
            'Lightbox: carries an accessible name'
        );
        assert(attr(dialog, 'aria-hidden') === 'true', 'Lightbox: starts hidden from assistive tech');
    }

    // Focus management is in script.js, and a dialog without it is worse than
    // no dialog — the keyboard ends up behind the overlay.
    const js = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    const block = js.slice(js.indexOf("getElementById('lightbox')"), js.indexOf("getElementById('lightbox')") + 3000);
    assert(/lastFocus\s*=\s*document\.activeElement/.test(block), 'Lightbox: remembers what had focus before opening');
    assert(/lastFocus[\s\S]{0,80}\.focus\(\)/.test(block), 'Lightbox: returns focus when it closes');
    assert(/e\.key === 'Escape'/.test(block), 'Lightbox: closes on Escape');
    assert(/e\.key === 'Tab'/.test(block), 'Lightbox: keeps Tab inside the dialog');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
