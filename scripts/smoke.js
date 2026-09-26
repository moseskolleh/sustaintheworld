#!/usr/bin/env node
// ===================================================================
// SMOKE — the site in a real browser
//
//     npm run smoke                 every page, headless Chromium
//     npm run smoke -- --screens    also save a screenshot per page to .smoke/
//
// The jsdom suites in tests/ exercise the logic; this exercises the page.
// It serves the repository the way GitHub Pages does (text gzipped, images
// as they are), opens each page in headless Chromium, and fails on anything
// a visitor would hit that jsdom cannot see:
//
//   - an uncaught exception or a console error on load
//   - a request that fails, or that leaves this origin at all
//   - an on-demand module that does not arrive when its feature is used
//   - a first view heavier than scripts/check-budget.js claims
//
// The last one matters most. check-budget.js estimates the first view from
// the HTML; this measures it. Before the two were compared, the estimate was
// 234 KB and the truth was over 500 KB — the fonts were not counted, and the
// hero slideshow was quietly fetching its second 150 KB image on every visit.
// The estimate may now err on the heavy side, never the light: if the real
// figure comes in above it, this fails.
//
// Which browser: $SMOKE_CHROME if set, else Playwright's own Chromium if it
// is installed, else the system Chrome (GitHub's ubuntu runners ship one).
// With none of those, the run is skipped with a message — unless
// --require is passed, in which case it fails, which is what CI wants.
// ===================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const SCREENS = args.includes('--screens');
const REQUIRE = args.includes('--require');
const PORT = 8123 + Math.floor(Math.random() * 1000);

const PAGES = ['index.html', 'case-studies.html', 'research.html', 'carbon-ai.html', 'field-report.html', '404.html'];

// ------------------------------------------------------------------
// A static server that behaves like the host: gzip for text, nothing else.
// ------------------------------------------------------------------
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
    '.woff2': 'font/woff2', '.pdf': 'application/pdf'
};
const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    // GitHub Pages serves the site under /sustaintheworld/, and 404.html
    // links with that base path because it can be served from any URL.
    p = p.replace(/^\/sustaintheworld(?=\/|$)/, '');
    if (p === '' || p.endsWith('/')) p += 'index.html';
    if (!p.startsWith('/')) p = '/' + p;
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('not found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const body = fs.readFileSync(file);
    const text = /^(text\/|application\/(javascript|json|xml)|image\/svg)/.test(type);
    const gz = text && /gzip/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'content-type': type, ...(gz ? { 'content-encoding': 'gzip' } : {}) });
    res.end(gz ? zlib.gzipSync(body, { level: 9 }) : body);
});

// ------------------------------------------------------------------
// Find a browser
// ------------------------------------------------------------------
function findBrowser(chromium) {
    if (process.env.SMOKE_CHROME) return { executablePath: process.env.SMOKE_CHROME, label: process.env.SMOKE_CHROME };
    try {
        const p = chromium.executablePath();
        if (p && fs.existsSync(p)) return { executablePath: p, label: 'Playwright Chromium' };
    } catch (e) { /* not installed */ }
    for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        try {
            const p = execSync(`command -v ${candidate}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (p) return { executablePath: p, label: candidate };
        } catch (e) { /* keep looking */ }
    }
    return null;
}

const fmt = (b) => `${(b / 1024).toFixed(0)} KB`;
let failures = 0;
const ok = (msg) => console.log(`  · ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

// ------------------------------------------------------------------
// One page: load, listen, measure
// ------------------------------------------------------------------
async function visit(context, page, rel, origin) {
    const errors = [];
    const foreign = [];
    const failed = [];
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    page.removeAllListeners('requestfailed');
    page.removeAllListeners('request');
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
    page.on('requestfailed', (r) => failed.push(`${r.url()} — ${(r.failure() || {}).errorText}`));
    page.on('request', (r) => { if (!r.url().startsWith(origin)) foreign.push(r.url()); });

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    const sizes = new Map();
    cdp.on('Network.responseReceived', (e) => sizes.set(e.requestId, { url: e.response.url, bytes: 0 }));
    cdp.on('Network.loadingFinished', (e) => { const s = sizes.get(e.requestId); if (s) s.bytes = e.encodedDataLength; });

    await page.goto(`${origin}/${rel}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const arrival = Array.from(sizes.values()).filter(s => s.bytes > 0);
    const arrivalBytes = arrival.reduce((n, s) => n + s.bytes, 0);
    const bytesSince = () => Array.from(sizes.values()).reduce((n, s) => n + s.bytes, 0) - arrivalBytes;

    return { errors, foreign, failed, arrival, arrivalBytes, bytesSince, cdp };
}

(async () => {
    let chromium;
    try { chromium = require('playwright-core').chromium; }
    catch (e) { console.error('  playwright-core is not installed — run `npm install`'); process.exit(1); }

    const browserSpec = findBrowser(chromium);
    if (!browserSpec) {
        const msg = 'no Chromium found (set SMOKE_CHROME=/path/to/chrome)';
        if (REQUIRE) { console.error(`  ✗ ${msg}`); process.exit(1); }
        console.log(`  smoke: skipped — ${msg}`);
        process.exit(0);
    }

    await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${PORT}`;
    const browser = await chromium.launch({ executablePath: browserSpec.executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (SCREENS) fs.mkdirSync(path.join(ROOT, '.smoke'), { recursive: true });

    console.log(`\n  Smoke test in ${browserSpec.label}\n`);

    // The budget script's first-view estimate, to hold the measurement against.
    const estimate = require('./check-budget.js').measure().measured.criticalWire;

    const results = {};
    for (const rel of PAGES) {
        const page = await context.newPage();
        const r = await visit(context, page, rel, origin);
        results[rel] = r;
        console.log(`  ${rel}`);
        if (r.errors.length) r.errors.forEach(e => bad(e)); else ok('no console errors, no uncaught exceptions');
        if (r.failed.length) r.failed.forEach(f => bad(`request failed: ${f}`)); else ok('every request succeeded');
        if (r.foreign.length) r.foreign.forEach(f => bad(`left the origin: ${f}`)); else ok('no request left this origin');
        ok(`arrival: ${fmt(r.arrivalBytes)} over the wire in ${r.arrival.length} requests`);

        if (rel === 'index.html') await exerciseHomepage(page, r, origin);

        if (SCREENS) await page.screenshot({ path: path.join(ROOT, '.smoke', rel.replace('.html', '.png')) });
        await page.close();
    }

    await checkWithoutJs(browser, origin);

    // The homepage's measured first view against the budget's estimate. A
    // little slack for HTTP overhead, which the estimate does not model.
    const home = results['index.html'];
    if (home.arrivalBytes <= estimate * 1.02) {
        ok(`index.html: measured first view ${fmt(home.arrivalBytes)} is within the budget's estimate of ${fmt(estimate)}`);
    } else {
        bad(`index.html: measured first view ${fmt(home.arrivalBytes)} exceeds the budget's estimate of ${fmt(estimate)} — check-budget.js is missing something the page fetches on load`);
    }

    // The top nav at every desktop width: one line per item, nothing past the
    // right edge. It used to wrap "Case studies" and "AI, Weighed" at every
    // width and clip Contact off-screen up to 1373px — and body's
    // overflow-x:hidden meant nothing else would ever have noticed.
    {
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        const broken = [];
        for (let w = 1000; w <= 1920; w += 20) {
            await page.setViewportSize({ width: w, height: 800 });
            const r = await page.evaluate(() => {
                if (getComputedStyle(document.getElementById('navToggle')).display !== 'none') return null;
                return Array.from(document.querySelectorAll('.nav-menu .nav-link')).filter((a) => {
                    const box = a.getBoundingClientRect();
                    const line = parseFloat(getComputedStyle(a).lineHeight) || 20;
                    return box.right > innerWidth || box.height > line * 1.6 + 12;
                }).map(a => a.textContent.trim());
            });
            if (r && r.length) broken.push(`${w}px: ${r.join(', ')}`);
        }
        if (broken.length) broken.forEach(b => bad(`nav item wraps or is clipped at ${b}`));
        else ok('nav: every item on one line and on screen, 1000–1920px (or the menu button instead)');
        await page.close();
    }

    await browser.close();
    server.close();

    if (failures) { console.log(`\n  ${failures} problem(s)\n`); process.exit(1); }
    console.log('\n  Smoke test passed\n');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });

// ------------------------------------------------------------------
// The homepage's on-demand features, each used once
// ------------------------------------------------------------------
async function exerciseHomepage(page, r, origin) {
    const loadedNow = () => page.evaluate(() => Object.assign({}, window.mksLoaded || {}));

    const before = await loadedNow();
    ['interactives', 'dossier', 'terminal', 'dispatch'].forEach((m) => {
        if (before[m]) bad(`module "${m}" loaded on arrival — it should wait to be needed`);
    });
    if (!Object.values(before).some(Boolean)) ok('no on-demand module loaded on arrival');

    // A scroll fetches the journey map.
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(800);
    const mapSvg = await page.$('#journeyMapFrame svg');
    if (mapSvg) ok(`journey map arrived on first scroll (+${fmt(r.bytesSince())})`); else bad('journey map did not load after scrolling');

    // The first "listen" press fetches the player and swaps the controls.
    const listen = await page.$('.listen-btn');
    if (listen) {
        await listen.click();
        await page.waitForFunction(() => window.mksLoaded && window.mksLoaded.dispatch, null, { timeout: 5000 }).catch(() => null);
        const l = await loadedNow();
        if (l.dispatch) ok('narration player loaded on the first listen press'); else bad('narration player did not load on listen');
        const bar = await page.$('#dispatchBar');
        if (bar) ok('the player mounted'); else bad('no #dispatchBar after loading the player');
        await page.evaluate(() => window.FieldDispatch && window.FieldDispatch.stop());
    } else {
        ok('no listen control in headless Chromium (no speech voice and the recording is fetched on demand) — skipped');
    }

    // Opening the groundwater dossier fetches the games.
    const summary = await page.$('.project-card[data-project="groundwater"] .project-toggle');
    if (summary) {
        await summary.scrollIntoViewIfNeeded();
        await summary.click();
        await page.waitForFunction(() => window.mksLoaded && window.mksLoaded.dossier, null, { timeout: 5000 }).catch(() => null);
        const l = await loadedNow();
        if (l.dossier) ok('dossier games loaded when the dossier opened'); else bad('dossier games did not load on open');
        const scene = await page.$('#boreholeGame svg');
        if (scene) ok('the borehole scene was drawn'); else bad('no borehole scene inside the opened dossier');
    } else bad('groundwater dossier not found');

    // Section 05 coming into range fetches the interactives.
    await page.evaluate(() => document.getElementById('ecoprompt').scrollIntoView());
    await page.waitForFunction(() => window.mksLoaded && window.mksLoaded.interactives, null, { timeout: 5000 }).catch(() => null);
    const li = await loadedNow();
    if (li.interactives) ok('interactives loaded as section 05 came into range'); else bad('interactives did not load near section 05');
    const options = await page.$$eval('#ecoModel option', (o) => o.length);
    if (options > 0) ok(`"AI, Weighed" populated (${options} models)`); else bad('"AI, Weighed" model picker is empty');

    // The backtick opens the terminal.
    await page.keyboard.press('`');
    await page.waitForFunction(() => window.mksLoaded && window.mksLoaded.terminal, null, { timeout: 5000 }).catch(() => null);
    const lt = await loadedNow();
    if (lt.terminal) ok('terminal loaded on the backtick'); else bad('terminal did not load on the backtick');
    const open = await page.$('.field-terminal.open');
    if (open) ok('the terminal opened'); else bad('terminal did not open');
    await page.keyboard.press('Escape');

    if (r.errors.length) r.errors.forEach(e => bad(e)); else ok('still no errors after using every feature');
    ok(`using every feature above fetched ${fmt(r.bytesSince())} more — modules, the map, a narration track, and every image scrolled past`);
}

// ------------------------------------------------------------------
// Without JavaScript, before it, and when it arrives late
// ------------------------------------------------------------------
// <head> marks the page html.js and the stylesheet hides things only under
// that mark. With JavaScript off the preloader used to cover the page for
// good and every reveal sat at opacity 0, the no-JS contact form included.
// Each way script.js can fail to run is loaded here for real.
async function checkWithoutJs(browser, origin) {
    console.log('  without JavaScript');

    // What a reader can see: nothing covering the page, every reveal opaque,
    // every [hidden] element gone, and no control on show that only a script
    // could make do anything. A form's submit button works without one. The
    // dossier titles are buttons only script.js can open and close, but they
    // are the titles, and without it every dossier is already open.
    const inspect = (page) => page.evaluate(() => {
        const shown = (el) => {
            const box = el.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const pre = document.getElementById('preloader');
        const reveals = Array.from(document.querySelectorAll('.reveal'));
        return {
            covered: !!pre && getComputedStyle(pre).display !== 'none',
            reveals: reveals.length,
            dim: reveals.filter(el => parseFloat(getComputedStyle(el).opacity) < 1).length,
            leaks: Array.from(document.querySelectorAll('[hidden]')).filter(el => getComputedStyle(el).display !== 'none').map(el => '#' + el.id),
            dead: Array.from(document.querySelectorAll('button, select, [role="button"]'))
                .filter(el => shown(el) && !(el.type === 'submit' && el.form) && !el.classList.contains('project-toggle'))
                .map(el => el.id ? '#' + el.id : `${el.tagName.toLowerCase()}.${el.className}`),
            deadLinks: Array.from(document.querySelectorAll('a[href^="#"]'))
                .filter(a => a.getAttribute('href').length > 1 && shown(a))
                .filter((a) => {
                    const t = document.getElementById(a.getAttribute('href').slice(1));
                    return !t || !t.getClientRects().length;
                })
                .map(a => a.getAttribute('href'))
        };
    });
    const report = (label, r) => {
        if (r.covered) bad(`${label}: the preloader covers the page`);
        if (r.dim) bad(`${label}: ${r.dim} of ${r.reveals} reveal blocks are not fully visible`);
        if (r.leaks.length) bad(`${label}: [hidden] elements still displayed: ${r.leaks.join(', ')}`);
        if (!r.covered && !r.dim && !r.leaks.length) ok(`${label}: nothing covered, ${r.reveals} reveal blocks visible, every [hidden] element gone`);
    };

    // (a) JavaScript disabled, every page — and the homepage at phone width
    // too, which is where the menu button is.
    const offline = PAGES.map(p => [p, { width: 1280, height: 800 }]).concat([['index.html', { width: 390, height: 844 }]]);
    for (const [rel, viewport] of offline) {
        const context = await browser.newContext({ javaScriptEnabled: false, viewport });
        const page = await context.newPage();
        await page.goto(`${origin}/${rel}`, { waitUntil: 'load' });
        const label = `${rel} at ${viewport.width}px, JavaScript off`;
        const r = await inspect(page);
        report(label, r);
        if (r.dead.length) bad(`${label}: controls that do nothing without JavaScript: ${r.dead.join(', ')}`);
        else ok(`${label}: no control on show that needs JavaScript`);
        if (r.deadLinks.length) bad(`${label}: in-page links to nothing on show: ${r.deadLinks.join(', ')}`);

        if (rel === 'index.html') {
            // The contact form is the one thing a reader without JavaScript can
            // still do: it has to be there, and nothing may sit on top of it.
            const submit = page.locator('#contactForm button[type="submit"]');
            await submit.scrollIntoViewIfNeeded();
            const onTop = await submit.evaluate((b) => {
                const box = b.getBoundingClientRect();
                const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
                return !!hit && (hit === b || b.contains(hit));
            });
            if (await page.locator('#contactForm').isVisible() && onTop) ok(`${label}: the contact form is visible and its submit button is on top`);
            else bad(`${label}: the contact form is hidden or covered`);
        }
        await context.close();
    }

    // (b) JavaScript on, script.js blocked: its onerror takes the mark off and
    // the page is shown as it would be without JavaScript.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.route('**/script.js', (route) => route.abort());
        const page = await context.newPage();
        const t0 = Date.now();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => {
            const pre = document.getElementById('preloader');
            return !(pre && getComputedStyle(pre).display !== 'none') &&
                Array.from(document.querySelectorAll('.reveal')).every(el => parseFloat(getComputedStyle(el).opacity) === 1);
        }, null, { timeout: 6000 }).catch(() => null);
        report(`index.html, script.js blocked (shown after ${((Date.now() - t0) / 1000).toFixed(1)} s)`, await inspect(page));
        await context.close();
    }

    // (c) script.js late: 6 s, past the 4 s failsafe. The page is shown
    // without it first; when it does arrive it takes over without hiding
    // anything the reader has already seen, and without replaying the intro
    // or the count-up.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.route('**/script.js', async (route) => {
            await new Promise(res => setTimeout(res, 6000));
            await route.continue();
        });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'commit' });
        const gaveUp = await page.waitForFunction(() => document.querySelector('footer') && !document.documentElement.classList.contains('js'),
            null, { timeout: 5500 }).then(() => true, () => false);
        await page.waitForTimeout(900);   // the reveals fade in over 0.7 s
        if (gaveUp) report('index.html, script.js late — after the 4 s failsafe', await inspect(page));
        else bad('index.html, script.js late: the failsafe did not take the html.js mark off');

        const tookOver = await page.waitForFunction(() => window.mksReady === true, null, { timeout: 10000 }).then(() => true, () => false);
        const after = await page.evaluate(() => ({
            marked: document.documentElement.classList.contains('js'),
            preloader: !!document.getElementById('preloader'),
            dim: Array.from(document.querySelectorAll('.reveal')).filter(el => parseFloat(getComputedStyle(el).opacity) < 1).length,
            counters: Array.from(document.querySelectorAll('.hero-stat-number')).map(c => `${c.textContent}/${c.getAttribute('data-target')}`)
        }));
        const asWritten = after.counters.every(c => c.split('/')[0] === c.split('/')[1]);
        if (tookOver && after.marked && !after.preloader && !after.dim && asWritten) {
            ok('index.html, script.js late — once it arrives: marked html.js again, nothing hidden again, no intro, counters as written');
        } else {
            bad(`index.html, script.js late — takeover: ready ${tookOver}, marked ${after.marked}, preloader ${after.preloader}, ${after.dim} reveals dimmed, counters ${after.counters.join(' ')}`);
        }
        await context.close();
    }

    // (d) A normal visit keeps its intro, and the counters count up to exact
    // values. Under reduced motion or low-energy mode they never move. What
    // the page looked like at DOMContentLoaded is captured by a listener
    // registered before script.js's own, and every change to a counter after
    // it is counted.
    const capture = () => {
        document.addEventListener('DOMContentLoaded', () => {
            const pre = document.getElementById('preloader');
            window.__atReady = {
                intro: !!pre && getComputedStyle(pre).display === 'flex' && getComputedStyle(pre).position === 'fixed',
                counters: Array.from(document.querySelectorAll('.hero-stat-number')).map(c => c.textContent),
                changes: 0
            };
            new MutationObserver((list) => { window.__atReady.changes += list.length; })
                .observe(document.querySelector('.hero-stats'), { subtree: true, childList: true, characterData: true });
        });
    };
    const visits = [
        ['normal', {}, null],
        ['reduced motion', { reducedMotion: 'reduce' }, null],
        ['low-energy mode', {}, () => { try { localStorage.setItem('eco-mode', 'on'); } catch (e) { /* storage blocked */ } }]
    ];
    await Promise.all(visits.map(async ([label, options, seed]) => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
        if (seed) await context.addInitScript(seed);
        await context.addInitScript(capture);
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        // At 800px tall the figures sit just below the fold; they count when
        // seen. A count-up takes about 1.8 s, a frame at a time.
        await page.evaluate(() => document.querySelector('.hero-stats').scrollIntoView({ block: 'center' }));
        if (label === 'normal') {
            await page.waitForFunction(() => Array.from(document.querySelectorAll('.hero-stat-number'))
                .every(c => c.textContent === c.getAttribute('data-target')), null, { timeout: 8000 }).catch(() => null);
        } else {
            await page.waitForTimeout(2600);
        }
        const r = await page.evaluate(() => ({
            atReady: window.__atReady,
            preloader: !!document.getElementById('preloader'),
            marked: document.documentElement.classList.contains('js'),
            ready: window.mksReady === true,
            counters: Array.from(document.querySelectorAll('.hero-stat-number')).map(c => c.textContent),
            targets: Array.from(document.querySelectorAll('.hero-stat-number')).map(c => c.getAttribute('data-target'))
        }));
        const tag = `index.html, ${label}`;
        const exact = r.counters.join('|') === r.targets.join('|');
        if (!r.ready || !r.marked) bad(`${tag}: script.js did not take over (ready ${r.ready}, marked ${r.marked})`);
        if (r.preloader) bad(`${tag}: the preloader is still in the page after load`);
        if (!exact) bad(`${tag}: counters ended at ${r.counters.join(', ')}, not ${r.targets.join(', ')}`);
        if (label === 'normal') {
            const intro = r.atReady && r.atReady.intro;
            const fromZero = r.atReady && r.atReady.counters.every(c => c === '0');
            if (!intro) bad(`${tag}: the intro no longer covers the first paint`);
            if (!fromZero) bad(`${tag}: counters did not start from 0 (${r.atReady && r.atReady.counters.join(', ')})`);
            if (intro && fromZero && exact && !r.preloader) ok(`${tag}: intro shown then lifted, counters count up to ${r.counters.join(', ')} with nothing appended`);
        } else if (!r.atReady || r.atReady.counters.join('|') !== r.targets.join('|') || r.atReady.changes) {
            bad(`${tag}: counters moved (${r.atReady && r.atReady.counters.join(', ')} at DOMContentLoaded, ${r.atReady && r.atReady.changes} changes after)`);
        } else if (exact) {
            ok(`${tag}: counters never move from ${r.counters.join(', ')}`);
        }

        // One [hidden] rule for every element: the receipt panel and the You
        // Draw It legend used to show before they were wanted, because a
        // class-level display beat the browser's own [hidden].
        if (label === 'normal') {
            await page.evaluate(() => document.getElementById('ecoprompt').scrollIntoView());
            await page.waitForFunction(() => window.mksLoaded && window.mksLoaded.interactives, null, { timeout: 5000 }).catch(() => null);
            const h = await page.evaluate(() => ({
                leaks: Array.from(document.querySelectorAll('[hidden]')).filter(el => getComputedStyle(el).display !== 'none').map(el => '#' + (el.id || el.className)),
                count: document.querySelectorAll('[hidden]').length,
                named: ['receiptPanel', 'ydiLegend'].map((id) => {
                    const el = document.getElementById(id);
                    return !!el && el.hidden && getComputedStyle(el).display === 'none';
                })
            }));
            if (h.leaks.length) bad(`${tag}: [hidden] elements still displayed: ${h.leaks.join(', ')}`);
            else if (h.named.every(Boolean)) ok(`${tag}: all ${h.count} [hidden] elements are display:none, #receiptPanel and #ydiLegend included`);
            else bad(`${tag}: #receiptPanel or #ydiLegend is missing or showing before it is wanted`);
        }
        await context.close();
    }));
}
