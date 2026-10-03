// The journey map on a phone, a chart a phone can read, and the field
// photos back with their stories, in a lightbox that steps through them.
//
// On a phone the journey map sat above the stops and flew out of sight as
// they came, and the Rhine delta's four names shared a patch 40px across
// (on a desktop they ran into each other at 20px). You Draw It printed its
// labels about 5px tall on a phone. The 25 field photos went with the
// homepage's dossiers and were shown nowhere, while the homepage kept a
// lightbox with nothing to open, one photo at a time. These pin what
// replaced them: the map follows the stop being read, below the band a
// phone pins it in, zooms in further on a narrow frame where the stops are
// close, keeps every name 11-14px and jumps when nothing may move; the
// chart is drawn as wide as it is shown; each case study carries its
// photos, each a link to the full photo, and the page's lightbox steps
// through them with buttons, arrow keys and a "2 of 5", keeps Tab inside
// and hands focus back. What only a browser can show (the band pinned and
// clear of the text; the labels' size on screen; the lightbox in both
// themes, under axe) is in scripts/smoke.js.
//
// Run with: node tests/phone.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { run, ROOT } = require('./harness.js');
const content = require('../scripts/lib/content.js');

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
const click = (window, el, init) => {
    const ev = new window.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, init || {}));
    el.dispatchEvent(ev);
    return ev;
};

// jsdom lays nothing out: every box is 0x0. Boxes are set by hand, per
// element, before the scripts that measure them run.
const boxes = (w) => {
    const set = new Map();
    const orig = w.Element.prototype.getBoundingClientRect;
    w.Element.prototype.getBoundingClientRect = function () {
        const b = set.get(this);
        if (!b) return orig.call(this);
        return Object.assign({ x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top }, b);
    };
    return (el, left, top, right, bottom) => set.set(el, { left, top, right, bottom });
};

// Width and height from a WebP's own header, as tests/portfolio.test.js reads them.
const webpSize = (rel) => {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    return null;
};

(async () => {
    // ===============================================================
    // The journey map: the stop being read, and a band on a phone
    // ===============================================================
    {
        const svgMarkup = read('assets/journey-map.svg');
        const observers = [];
        let place = null;
        const frame = { w: 340, h: 170 };
        const { window, errors } = run('dark', {
            before: (w) => {
                w.fetch = (url) => (String(url) === 'assets/journey-map.svg'
                    ? Promise.resolve({ ok: true, text: () => Promise.resolve(svgMarkup) })
                    : Promise.resolve({ ok: false, json: () => Promise.resolve(null) }));
                w.IntersectionObserver = class {
                    constructor(cb, opts) { this.cb = cb; this.opts = opts || {}; this.targets = []; observers.push(this); }
                    observe(t) { this.targets.push(t); }
                    unobserve() {}
                    disconnect() { this.gone = true; }
                };
                place = boxes(w);
                const el = w.document.getElementById('journeyMapFrame');
                Object.defineProperty(el, 'clientWidth', { get: () => frame.w });
                Object.defineProperty(el, 'clientHeight', { get: () => frame.h });
            }
        });
        const doc = window.document;
        const mapBox = doc.getElementById('journeyMap');
        const stops = Array.from(doc.querySelectorAll('.journey-stop'));
        // A 390x768 phone: the band pinned under the nav bar at 72px, 172px
        // tall, over the stops (style.css makes it sticky; jsdom reads no CSS).
        mapBox.style.position = 'sticky';
        mapBox.style.top = '72px';
        place(mapBox, 25, 72, 365, 244);
        place(doc.querySelector('.journey-track'), 25, 290, 367, 1900);
        // Each stop 290px tall, its name 25px down (under the coordinates).
        const stack = (tops) => stops.forEach((s, i) => {
            place(s, 25, tops[i], 367, tops[i] + 290);
            place(s.querySelector('h3'), 45, tops[i] + 25, 347, tops[i] + 55);
        });

        window.dispatchEvent(new window.Event('scroll'));
        await wait(30);
        const svg = doc.querySelector('#journeyMapFrame svg');
        assert(!!svg && errors.length === 0, `Map: the first scroll fetches and draws it (${errors.map(String).join('; ').slice(0, 160) || 'no errors'})`);

        const watching = () => observers.filter(o => !o.gone && o.targets.length && o.targets.every(t => t.closest('.journey-stop'))).pop();
        let io = watching();
        const vh = window.innerHeight;
        assert(!!io && parseFloat(io.opts.rootMargin) === -244 && io.targets.every(t => t.tagName === 'H3') && String(io.opts.threshold) === '0,1',
            `Map: on a phone it watches each stop's name cross the pinned band's edge, and come on screen (${io && io.opts.rootMargin}, ${io && io.targets.map(t => t.tagName).join(' ')})`);

        const active = () => { const a = doc.querySelector('.journey-stop.map-active'); return a ? a.getAttribute('data-stop') : null; };
        const readout = () => doc.getElementById('journeyMapReadout').textContent;
        // Bonn's name just under the band, Wageningen arriving below it.
        stack([-700, -376, 251, 575, 899]);
        io.cb([]);
        assert(active() === '2' && /Bonn$/.test(readout()), `Map: it shows the first stop whose name is below the band, not the next one arriving (${active()})`);
        // Bonn's name gone under the band, Wageningen's on screen below it:
        // by a reading line 30% down, still inside Bonn, Bonn stayed shown.
        stack([-900, -576, 200, 524, 848]);
        io.cb([]);
        assert(active() === '3', `Map: once a stop's name is under the band, the next stop, its name on screen, is the one shown (${active()})`);
        // Bonn's name under the band, Wageningen's not yet on screen.
        stack([-900, -576, 200, vh + 40, vh + 364]);
        io.cb([]);
        assert(active() === '2', `Map: until the next name is on screen, the stop just passed stays (${active()})`);
        // Past the last name.
        stack([-1900, -1576, -1252, -928, -100]);
        io.cb([]);
        assert(active() === '4', `Map: past the last stop's name, the last stop stays (${active()})`);

        const scaleOf = () => parseFloat((svg.style.transform.match(/scale\(([\d.]+)\)/) || [])[1]);
        const unit = () => scaleOf() * frame.w / 1000;
        const names = () => Array.from(svg.querySelectorAll('.map-stop-label, .map-site-label'));
        const sizes = () => names().map(t => parseFloat(t.style.fontSize) * unit());
        assert(Math.abs(scaleOf() - 7.5 * 660 / 340) < 0.01,
            `Map: a 340px band zooms further in on the Rhine delta, to keep its names as far apart as the desktop column does (scale ${scaleOf().toFixed(2)})`);
        assert(sizes().every(px => px >= 10.99 && px <= 14.01), `Map: every name on the band is 11-14px on screen (${sizes().map(px => px.toFixed(1)).join(', ')})`);
        assert(names().every(t => t.hasAttribute('x') && t.hasAttribute('y')) && !/<text[^>]+\sx=/.test(svgMarkup),
            'Map: the file carries no label positions, and the script places every name before the map is shown');

        stack([251, 575, 899, 1223, 1547]);
        io.cb([]);
        assert(active() === '0' && Math.abs(scaleOf() - 2.4) < 0.01, `Map: far from the delta the band keeps the plain zoom, and its context (stop ${active()}, scale ${scaleOf()})`);
        assert(sizes().every(px => px >= 10.99), `Map: Freetown's name too is 11px or more on a phone (${sizes().map(px => px.toFixed(1)).join(', ')})`);
        assert(!mapBox.classList.contains('map-still'), 'Map: with motion allowed, it flies');

        doc.body.classList.add('eco-mode');
        stack([-700, -376, 251, 575, 899]);
        io.cb([]);
        assert(active() === '2' && mapBox.classList.contains('map-still'), 'Map: in low-energy mode it jumps to the next stop instead of flying');
        doc.body.classList.remove('eco-mode');

        // A desktop: the map beside the stops, the whole screen theirs.
        frame.w = 663;
        frame.h = 481;
        place(mapBox, 145, 96, 808, 577);
        place(doc.querySelector('.journey-track'), 853, 200, 1295, 1700);
        window.dispatchEvent(new window.Event('resize'));
        await wait(260);
        io = watching();
        const deskLine = window.innerHeight * 0.45;
        assert(!!io && Math.abs(-parseFloat(io.opts.rootMargin) - (deskLine - 24)) <= 1,
            `Map: beside the stops, the reading line is 45% down the screen (strip from ${io && io.opts.rootMargin})`);
        stack([-700, -376, deskLine - 100, 800, 1100]);
        io.cb([]);
        assert(active() === '2' && Math.abs(scaleOf() - 5) < 0.01, `Map: a desktop column keeps the zoom it was tuned at (scale ${scaleOf()})`);
        await wait(20);
        window.close();
    }

    // The generator's names, placed off the legs they sit beside.
    {
        const gen = read('scripts/generate-journey-map.js');
        const svg = read('assets/journey-map.svg');
        assert(/wuppertal:\s*{ dx: -22/.test(gen) && /data-cx="280.7" data-cy="86.4" data-dx="-22"/.test(svg),
            'Map: Wuppertal\'s name starts clear of the Bonn-Wageningen leg, in the script and the file it writes');
        assert(/changsha:\s*{ dx: 0,\s+dy: 26,\s+anchor: 'middle' }/.test(gen), 'Map: Changsha\'s name sits under it, inside a 320px phone\'s band');
        assert(/\.map-stop-label \{[^}]*stroke-width: 0\.3em/.test(read('style.css')), 'Map: a name\'s halo is sized in ems, not map units that zoom to 15px of black');
    }

    // ===============================================================
    // You Draw It: drawn as wide as it is shown
    // ===============================================================
    {
        const resizers = [];
        const chart = (width) => {
            let setWidth = null;
            const { window, errors } = run('dark', {
                before: (w) => {
                    w.ResizeObserver = class { constructor(cb) { this.cb = cb; resizers.push(this); } observe(t) { this.t = t; } disconnect() {} };
                    if (!width) return;
                    const place = boxes(w);
                    const svg = w.document.getElementById('ydiSvg');
                    setWidth = (px) => place(svg, 0, 0, px, px * 0.8);
                    setWidth(width);
                }
            });
            return { window, errors, svg: window.document.getElementById('ydiSvg'), setWidth };
        };
        const inside = (svg) => {
            const [, , W, H] = svg.getAttribute('viewBox').split(' ').map(Number);
            const out = Array.from(svg.querySelectorAll('text')).filter((t) => {
                const x = +t.getAttribute('x'), y = +t.getAttribute('y');
                return !(x >= 0 && x <= W && y >= 0 && y <= H);
            }).map(t => t.textContent);
            return { W, H, out };
        };

        let c = chart(312);
        let v = inside(c.svg);
        assert(c.errors.length === 0 && v.W === 312 && v.H === 250,
            `Chart: shown 312px wide, it is drawn 312 units wide, so an 11-unit label is 11px (viewBox ${c.svg.getAttribute('viewBox')})`);
        const tilt = (c.svg.querySelector('.ydi-xlabel').getAttribute('transform') || '').match(/rotate\((-?\d+)/);
        assert(tilt && tilt[1] === '-45', `Chart: on a phone the model names slant steeper, into the room below (${tilt && tilt[1]})`);
        assert(v.out.length === 0, `Chart: every label is anchored inside the drawing (${v.out.join(', ') || 'all inside'})`);

        // Draw with the keyboard, then reveal: the callout lands inside too.
        const hit = c.svg.querySelector('.ydi-hit');
        hit.focus();
        key(c.window, 'ArrowUp', hit);
        c.window.document.getElementById('ydiReveal').click();
        const callout = c.svg.querySelector('.ydi-callout');
        v = inside(c.svg);
        assert(!!callout && c.svg.querySelectorAll('.ydi-real-dot').length === 10 && v.out.length === 0,
            `Chart: revealed, the estimates' ten dots and the callout join it, every label still inside (${v.out.join(', ') || 'all inside'})`);

        // Turned to landscape: redrawn at the new width, the reveal with it.
        const ro = resizers.find(r => r.t === c.svg);
        c.setWidth(600);
        ro.cb([]);
        v = inside(c.svg);
        const dot = c.svg.querySelector('.ydi-real-dot:last-of-type');
        assert(v.W === 600 && v.H === 356 && v.out.length === 0 && +dot.getAttribute('cx') > 500,
            `Chart: at a new width it is drawn again, the revealed estimates too (viewBox ${c.svg.getAttribute('viewBox')})`);
        c.window.document.getElementById('ydiReset').click();
        assert(!c.svg.querySelector('.ydi-callout, .ydi-real-dot'), 'Chart: Draw again takes the estimates and the callout away');
        await wait(20);
        c.window.close();

        c = chart(0);
        assert(c.svg.getAttribute('viewBox') === '0 0 640 380', `Chart: unmeasured (or 640px and wider), it is the 640-unit desktop drawing (${c.svg.getAttribute('viewBox')})`);
        await wait(20);
        c.window.close();

        // Units are never smaller than pixels now, so 11 units is enough.
        const css = read('style.css');
        const sizes = [...css.matchAll(/(\.ydi-[\w-]+)[^{}]*\{[^}]*font-size:\s*([\d.]+)px/g)];
        const small = sizes.filter(m => +m[2] < 11).map(m => `${m[1]} ${m[2]}px`);
        assert(sizes.length >= 2 && small.length === 0, `Chart: no label in style.css is set below 11 units (${small.join(', ') || `${sizes.length} sizes checked`})`);
        assert(/@container \(width < 479\.5px\) \{\s*\.ydi-svg \{ aspect-ratio: 5 \/ 4; \}/.test(css),
            'Chart: the stylesheet holds the phone shape (5:4) before the script draws it, so nothing below moves');
        // A finger's drag draws: touch-action on the <svg> itself. On the
        // <rect> inside, Chromium ignores it, and a drag was cancelled as a
        // scroll after two moves (smoke drags it with touch events).
        const svgRule = (css.replace(/\/\*[\s\S]*?\*\//g, '').match(/(?:^|\})\s*\.ydi-svg\s*\{([^}]*)\}/) || [])[1] || '';
        assert(/touch-action:\s*none/.test(svgRule), `Chart: a drag across the chart draws rather than scrolls (touch-action on .ydi-svg: ${(svgRule.match(/touch-action:\s*[^;]+/) || ['none set'])[0]})`);
    }

    // ===============================================================
    // The photos, back with their case studies
    // ===============================================================
    const { projects } = content.loadAll();
    const page = read('case-studies.html');
    // The six with a homepage card were the dossiers; a case study added
    // since (GAIA, kept off the homepage) has no photos to bring back.
    const dossiers = projects.caseStudies.filter(content.onHomepage);
    {
        const all = projects.caseStudies.flatMap(cs => (cs.gallery || []).map(p => ({ cs: cs.id, p })));
        assert(all.length === 25 && dossiers.every(cs => cs.gallery && cs.gallery.length),
            `Photos: all 25 of the dossiers' photos are back, each case study with its own (${projects.caseStudies.map(cs => `${cs.id} ${(cs.gallery || []).length}`).join(', ')})`);
        // The captions and alt text came from the homepage's dossiers, word for
        // word; the photo on each card is one of them.
        const cardPhotos = dossiers.filter(cs => cs.gallery.some(p => p.src === cs.photo.src));
        assert(cardPhotos.length === 6, 'Photos: each card\'s photo is one of its case study\'s own');
        const off = all.filter(({ p }) => { const s = webpSize(p.src); return !s || s.width !== p.width || s.height !== p.height; });
        assert(off.length === 0, `Photos: each is the size it declares, read from the file (${off.map(o => o.p.src).join(', ') || 'all 25'})`);
        const thumbs = all.filter(({ p }) => p.thumb);
        const badThumb = thumbs.filter(({ p }) => { const s = webpSize(p.thumb); return !s || s.width !== 480; });
        assert(thumbs.length === 6 && badThumb.length === 0, `Photos: the six with a 480px copy offer it (${thumbs.length}, bad: ${badThumb.map(t => t.p.thumb).join(', ') || 'none'})`);
    }

    // The markup the generator writes: without JavaScript, each photo is a
    // link to itself, in a row folded under one line.
    {
        const doc = new JSDOM(page).window.document;
        const wrong = [];
        projects.caseStudies.forEach((cs) => {
            const card = doc.getElementById(cs.id);
            const fold = card.querySelector('details.cs-photos');
            if (!cs.gallery) { if (fold) wrong.push(`${cs.id}: a photo row with no photos`); return; }
            if (!fold || fold.open || card.lastElementChild !== fold) { wrong.push(`${cs.id}: not a closed fold at the card's end`); return; }
            if (fold.querySelector('summary').textContent.trim() !== `${cs.gallery.length} photos`) wrong.push(`${cs.id}: summary "${fold.querySelector('summary').textContent}"`);
            const figs = Array.from(fold.querySelectorAll('li > figure.cs-photo'));
            if (figs.length !== cs.gallery.length) wrong.push(`${cs.id}: ${figs.length} photos`);
            cs.gallery.forEach((p, i) => {
                const f = figs[i];
                if (!f) return;
                const a = f.querySelector('a'), img = a && a.querySelector('img');
                const srcset = p.thumb ? `${p.thumb} 480w, ${p.src} ${p.width}w` : null;
                const problems = [
                    !a || a.getAttribute('href') !== p.src ? 'link' : '',
                    a && a.getAttribute('data-lightbox') !== cs.id ? 'group' : '',
                    a && a.getAttribute('data-caption') !== p.fullCaption ? 'full caption' : '',
                    !img || img.getAttribute('src') !== p.src || img.getAttribute('alt') !== p.alt ? 'img' : '',
                    img && (img.getAttribute('width') !== String(p.width) || img.getAttribute('height') !== String(p.height)) ? 'size' : '',
                    img && (img.getAttribute('loading') !== 'lazy' || img.getAttribute('srcset') !== srcset) ? 'lazy/srcset' : '',
                    f.querySelector('figcaption').textContent !== p.caption ? 'caption' : '',
                    f.classList.contains('cs-photo-wide') !== (p.layout === 'wide') || f.classList.contains('cs-photo-tall') !== (p.layout === 'tall') ? 'layout' : ''
                ].filter(Boolean);
                if (problems.length) wrong.push(`${cs.id} ${i + 1}: ${problems.join(', ')}`);
            });
        });
        assert(wrong.length === 0, `Photos: each case study ends with its photos folded under "N photos", each a lazy link to itself with its size, alt text and both captions word for word (${wrong.join('; ') || 'all six'})`);
        assert(!doc.getElementById('lightbox'), 'Photos: without JavaScript there is no dialog, only the links');
        // Folded, a lazy photo is not drawn, so not fetched: nothing of the
        // 2.2 MB is on the first view, whatever loading="lazy" decides.
        const budget = require('../scripts/check-budget.js');
        assert(!budget.criticalAssets('case-studies.html').some(a => /assets\/img\//.test(a)), 'Photos: none is in the case studies\' first view');
    }

    // The validator holds each photo to the rules.
    {
        const base = projects.caseStudies.find(cs => cs.id === 'wuppertal');
        const variant = (change) => { const cs = JSON.parse(JSON.stringify(base)); change(cs); return content.checkGallery('test', cs); };
        const says = (problems, re) => problems.some(p => re.test(p));
        assert(content.checkGallery('test', base).length === 0, 'Validator: a complete gallery passes');
        assert(content.checkGallery('test', { id: 'x' }).length === 0, 'Validator: a case study may have no gallery');
        assert(says(variant(cs => { cs.gallery = []; }), /list of photos/), 'Validator: an empty gallery is refused (leave it out instead)');
        assert(says(variant(cs => { cs.gallery[0].src = 'assets/img/nope.webp'; }), /not in the repository/), 'Validator: a photo not in the repository is refused');
        assert(says(variant(cs => { cs.gallery[0].thumb = 'https://example.com/x.webp'; }), /not a file in this repository/), 'Validator: a photo from off the site is refused');
        assert(says(variant(cs => { cs.gallery[1].alt = ' '; }), /no alt text/), 'Validator: a photo without alt text is refused');
        assert(says(variant(cs => { delete cs.gallery[1].caption; }), /no caption/), 'Validator: a photo without its caption is refused');
        assert(says(variant(cs => { cs.gallery[1].fullCaption = ''; }), /no fullCaption/), 'Validator: a photo without the caption the lightbox shows is refused');
        assert(says(variant(cs => { delete cs.gallery[2].width; }), /intrinsic width and height/), 'Validator: a photo without its size is refused');
        assert(says(variant(cs => { cs.gallery[2].layout = 'huge'; }), /not one of wide, tall/), 'Validator: a layout the page cannot draw is refused');
        assert(says(variant(cs => { cs.gallery[3].captoin = 'x'; }), /unknown field "captoin"/), 'Validator: a misspelt field is refused, not dropped');
        assert(says(variant(cs => { cs.gallery[4].src = cs.gallery[0].src; }), /already in this gallery/), 'Validator: the same photo twice is refused');
    }

    // ===============================================================
    // The lightbox: steps, keys, Tab and focus
    // ===============================================================
    {
        const tracked = [];
        const dom = new JSDOM(page, {
            runScripts: 'dangerously',
            url: 'https://example.com/case-studies.html',
            beforeParse(w) {
                w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
                w.mks = { track: (n) => tracked.push(n) };
            }
        });
        const { window } = dom;
        const doc = window.document;
        const errors = [];
        window.addEventListener('error', (e) => errors.push(e.error || e.message));
        const group = Array.from(doc.querySelectorAll('#wuppertal a[data-lightbox]'));
        assert(group.length === 5 && group.every(a => a.getAttribute('aria-haspopup') === 'dialog'), 'Lightbox: each photo link says it opens a dialog');

        // A press with a modifier is the browser's: a new tab, not the dialog.
        const tab = click(window, group[1], { ctrlKey: true });
        assert(!tab.defaultPrevented && !doc.getElementById('lightbox'), 'Lightbox: Ctrl+click still opens the photo in a new tab');

        group[1].focus();
        const opened = click(window, group[1]);
        const box = doc.getElementById('lightbox');
        const img = box && box.querySelector('img');
        const count = box && box.querySelector('.lightbox-count');
        const shown = () => ({ open: !box.hidden, count: count.textContent, src: img.getAttribute('src'), caption: doc.getElementById('lightboxCaption').textContent });
        let s = box && shown();
        const w2 = projects.caseStudies.find(cs => cs.id === 'wuppertal').gallery;
        assert(opened.defaultPrevented && !!box && s.open && s.count === '2 of 5' && s.src === w2[1].src && s.caption === w2[1].fullCaption && img.alt === w2[1].alt,
            `Lightbox: a press opens that photo here, with its full caption, its alt text and "2 of 5" (${s && s.count})`);
        assert(box.getAttribute('role') === 'dialog' && box.getAttribute('aria-modal') === 'true' && box.getAttribute('aria-labelledby') === 'lightboxCaption',
            'Lightbox: a modal dialog, named by the caption');
        assert(doc.activeElement === box.querySelector('.lightbox-close') && doc.documentElement.classList.contains('lightbox-open'),
            'Lightbox: focus moves into it, to Close, and the page behind stops scrolling');
        assert(img.getAttribute('width') === String(w2[1].width) && img.getAttribute('height') === String(w2[1].height),
            'Lightbox: the photo has its shape before it arrives');

        const next = box.querySelector('[data-step="1"]'), prev = box.querySelector('[data-step="-1"]');
        click(window, next);
        assert(shown().count === '3 of 5' && shown().src === w2[2].src, `Lightbox: Next shows the next photo (${shown().count})`);
        key(window, 'ArrowRight', doc.activeElement);
        key(window, 'ArrowRight', doc.activeElement);
        assert(shown().count === '5 of 5', `Lightbox: the right arrow steps forward (${shown().count})`);
        const round = key(window, 'ArrowRight', doc.activeElement);
        assert(shown().count === '1 of 5' && round.defaultPrevented, 'Lightbox: past the last photo it goes round to the first, and the key scrolls nothing');
        key(window, 'ArrowLeft', doc.activeElement);
        assert(shown().count === '5 of 5' && shown().src === w2[4].src, 'Lightbox: the left arrow steps back, round the other way');
        click(window, prev);
        assert(shown().count === '4 of 5', 'Lightbox: Previous steps back');

        const closeBtn = box.querySelector('.lightbox-close');
        closeBtn.focus();
        const ring = [];
        for (let i = 0; i < 3; i++) { key(window, 'Tab', doc.activeElement); ring.push(doc.activeElement.getAttribute('aria-label')); }
        key(window, 'Tab', doc.activeElement, { shiftKey: true });
        assert(ring.join(' / ') === 'Previous photo / Next photo / Close photo' && doc.activeElement === next,
            `Lightbox: Tab goes round Close, Previous and Next, never behind the dialog (${ring.join(' / ')}, then back to ${doc.activeElement.getAttribute('aria-label')})`);

        key(window, 'Escape', doc.activeElement);
        assert(box.hidden && !doc.documentElement.classList.contains('lightbox-open'), 'Lightbox: Escape closes it, and the page scrolls again');
        assert(doc.activeElement === group[1], 'Lightbox: focus goes back to the photo that opened it');
        const idle = key(window, 'ArrowRight');
        assert(!idle.defaultPrevented, 'Lightbox: closed, it leaves the arrow keys alone');

        // Another case study: its own photos, from the one pressed.
        const bonn = Array.from(doc.querySelectorAll('#un-disaster a[data-lightbox]'));
        click(window, bonn[2]);
        assert(!box.hidden && shown().count === '3 of 3' && doc.querySelectorAll('#lightbox').length === 1,
            `Lightbox: another case study's photo opens among its own (${shown().count}), in the same dialog`);
        click(window, closeBtn);
        assert(box.hidden && doc.activeElement === bonn[2], 'Lightbox: Close closes it, focus back on the photo');
        click(window, bonn[0]);
        click(window, box);
        assert(box.hidden, 'Lightbox: a press on the backdrop closes it');

        // A photo on its own, added after the page was built: a group of one
        // opens without steps, the arrows pass through, Tab stays on Close,
        // and with no caption the dialog is named by the alt text.
        const solo = doc.createElement('a');
        solo.href = 'assets/img/profile.webp';
        solo.setAttribute('data-lightbox', 'solo');
        solo.innerHTML = '<img src="assets/img/profile.webp" alt="A photo on its own" width="640" height="960">';
        doc.getElementById('main').appendChild(solo);
        click(window, solo);
        const lone = key(window, 'ArrowRight', doc.activeElement);
        key(window, 'Tab', doc.activeElement);
        assert(!box.hidden && box.querySelector('.lightbox-steps').hidden && !lone.defaultPrevented && doc.activeElement === closeBtn && shown().count === '1 of 1',
            'Lightbox: a photo on its own opens without steps, the arrows pass through, and Tab stays on Close');
        assert(!box.hasAttribute('aria-labelledby') && box.getAttribute('aria-label') === 'A photo on its own', 'Lightbox: with no caption, the dialog is named by the photo\'s alt text');
        key(window, 'Escape', doc.activeElement);
        assert(errors.length === 0 && tracked.length === 0, `Lightbox: no errors, and nothing counted (${errors.join('; ') || 'none'})`);
        assert(!box.classList.contains('lightbox-still'), 'Lightbox: with motion allowed it may fade in (content.css, never under reduced motion)');
        window.close();

        // Low-energy mode, chosen on the homepage, holds the fade still here
        // too; and storage refused outright costs nothing but the choice.
        for (const storage of ['eco', 'blocked']) {
            const quiet = new JSDOM(page, {
                runScripts: 'dangerously',
                url: 'https://example.com/case-studies.html',
                beforeParse(w) {
                    w.IntersectionObserver = class { observe() {} disconnect() {} };
                    if (storage === 'eco') w.localStorage.setItem('eco-mode', 'on');
                    else Object.defineProperty(w, 'localStorage', { configurable: true, get() { throw new w.DOMException('Access to storage is not allowed.', 'SecurityError'); } });
                }
            });
            const trouble = [];
            quiet.window.addEventListener('error', (e) => trouble.push(e.error || e.message));
            click(quiet.window, quiet.window.document.querySelector('a[data-lightbox]'));
            const b = quiet.window.document.getElementById('lightbox');
            if (storage === 'eco') assert(!!b && !b.hidden && b.classList.contains('lightbox-still'), 'Lightbox: in low-energy mode it opens without a fade');
            else assert(!!b && !b.hidden && trouble.length === 0, `Lightbox: with storage refused it still opens, without an error (${trouble.join('; ') || 'none'})`);
            quiet.window.close();
        }
    }

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
})().catch((e) => { console.error(e); process.exit(1); });
