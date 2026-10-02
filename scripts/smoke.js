#!/usr/bin/env node
// ===================================================================
// SMOKE — the site in a real browser
//
//     npm run smoke                      every page, headless Chromium
//     npm run smoke -- --browser firefox the same pass in Firefox
//     npm run smoke -- --screens         also save a screenshot per page to .smoke/
//     npm run smoke -- --lengths-only    only measure how long each page is
//                                        (--lengths-out FILE, --root DIR: see
//                                        checkLengths below)
//
// The jsdom suites in tests/ exercise the logic; this exercises the page.
// It serves the repository the way GitHub Pages does (text gzipped, images
// as they are), opens each page in headless Chromium, and fails on anything
// a visitor would hit that jsdom cannot see:
//
//   - an uncaught exception or a console error on load
//   - a request that fails, or that leaves this origin at all, bar the one
//     the visit counter is allowed, and that one carrying anything but
//     the documented fields, going out twice for one page view, or going
//     out at all under Do Not Track or GPC or with JavaScript off
//   - an on-demand module that does not arrive when its feature is used
//   - an accessibility violation axe-core can find, on any page, at desktop
//     and phone width, in either theme (see the end of this file)
//   - a first view heavier than scripts/check-budget.js claims, or one
//     (1440x900, 390x844) without the hero's figures, its photo caption,
//     the at-a-glance strip and one primary action, or with the play index,
//     today or with every at-a-glance fact filled in at the longest
//     content.js accepts; a photo caption over the eyebrow or the name,
//     down to 320px
//   - a page that, with JavaScript off (or script.js blocked or late), is
//     covered, leaves content invisible, shows a [hidden] element or a
//     control only a script could drive, or hides the contact form
//   - a skip link, nav link or Back that does not land where it says; a
//     link to a game, a case study or Anatomy of a Prompt that lands it
//     under the other pages' nav bar; a theme switch or nav item off the
//     bar; back to top over a control
//   - a page whose theme does not follow the reader's choice (or, with none,
//     the system's; the homepage from its first frame), or a page other
//     than the homepage with no room on a 320px phone for its nav and its
//     call to action, or whose nav moves as its theme switch appears
//   - on a phone, a journey map out of view while its stops are read, over
//     the text of the stop it shows, or showing another; a name on the map
//     under 11px, or on a desktop over another name, the frame's edge or
//     the route; a You Draw It label under 11px or cut off
//   - a case study's photos fetched before their row is opened, or a
//     lightbox that will not step through them (buttons, arrow keys, "2 of
//     5"), lets Tab out, or does not hand focus back on Escape, in either
//     theme, with motion or without
//   - more than one listen control, a nav bar that moves when it appears,
//     a player that covers more than 20% of a phone screen or the send
//     button, or a recording fetched unasked
//   - an Assay that grades a mismatched ad well, or sends anything; one
//     whose box is not folded behind a named button, by pointer and keys
//   - an experience card that is not short, or whose More sits on its text
//   - a case-study game fetched before a reader nears it, that will not
//     play, whose labels are under 11px on a phone or run past its edge,
//     or that moves the page under a reader when it arrives above them
//   - a page longer than its length budget in scripts/check-budget.js, at
//     1440x900 or 390x844, once it has settled (the homepage's is under
//     the plan's 10 and 18 screens)
//   - a clipped dropdown or an unreadable number on carbon-ai.html
//   - stats.html, drawn full from fixture totals, splitting a word in a
//     table to make room for the figures, or scrolling sideways, on a phone
//   - a jump that misses once sections are drawn at their real height, a
//     page that moves under a reader going back up, a section find-in-page
//     or print cannot reach, a loop running off screen, or a page busy on
//     the main thread while nobody touches it
//
// The first-view weight matters most. check-budget.js estimates it from
// the HTML; this measures it. Before the two were compared, the estimate was
// 234 KB and the truth was over 500 KB — the fonts were not counted, and the
// hero slideshow was quietly fetching its second 150 KB image on every visit.
// The estimate may now err on the heavy side, never the light: if the real
// figure comes in above it, this fails.
//
// Which browser: $SMOKE_CHROME if set, else Playwright's own Chromium if it
// is installed, else the system Chrome. CI installs the Chromium build that
// matches the pinned playwright-core, so a run there is repeatable rather
// than whatever Chrome the runner image shipped that week. With none of
// those, the run is skipped with a message — unless --require is passed, in
// which case it fails, which is what CI wants.
//
// With --browser firefox it uses Playwright's Firefox ($SMOKE_FIREFOX, or
// the build `npx playwright-core install firefox` puts in place; a stock
// Firefox cannot be driven). Everything runs the same except the byte
// counts, which come from the Chrome DevTools Protocol: Firefox has no
// equivalent, so the weights are checked in the Chromium run only.
// ===================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const argValue = (name) => { const i = args.indexOf(name); return i > -1 && args[i + 1] ? args[i + 1] : null; };
// --root serves another checkout with this script: the pull-request
// receipt measures main's lengths with the pull request's own method.
const ROOT = path.resolve(argValue('--root') || path.join(__dirname, '..'));
const SCREENS = args.includes('--screens');
const REQUIRE = args.includes('--require');
const LENGTHS_ONLY = args.includes('--lengths-only');
const BROWSER = (() => {
    const i = args.findIndex(a => a === '--browser' || a.startsWith('--browser='));
    if (i === -1) return 'chromium';
    return (args[i].includes('=') ? args[i].split('=')[1] : args[i + 1] || '').toLowerCase();
})();
const CHROMIUM = BROWSER === 'chromium';
const PORT = 8123 + Math.floor(Math.random() * 1000);

// Every page at the root, the homepage first. Read from the directory so a
// new page is covered the day it exists, not the day someone lists it.
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
    .sort((a, b) => (b === 'index.html') - (a === 'index.html') || a.localeCompare(b));

// The one request allowed to leave this origin: the visit counter's POST to
// the contact form's Apps Script deployment, with ?action=count, and only
// that exact address. It is read from count.js so there is one copy, and
// checked for shape so this cannot quietly allow anything broader. No run of
// this script ever lets it reach the real endpoint: see quietCounter().
const COUNT_URL = (() => {
    const m = fs.readFileSync(path.join(ROOT, 'count.js'), 'utf8').match(/'(https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\?action=count)'/);
    if (!m) throw new Error('count.js does not name its endpoint in the expected form');
    return m[1];
})();
const BEACON_KEYS = ['v', 'page', 'lens', 'deepest', 'features', 'ref', 'vp', 'kb'];

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
function findBrowser(engine) {
    if (!CHROMIUM) {
        if (process.env.SMOKE_FIREFOX) return { executablePath: process.env.SMOKE_FIREFOX, label: process.env.SMOKE_FIREFOX };
        try {
            const p = engine.executablePath();
            if (p && fs.existsSync(p)) return { executablePath: p, label: 'Playwright Firefox' };
        } catch (e) { /* not installed */ }
        return null;
    }
    if (process.env.SMOKE_CHROME) return { executablePath: process.env.SMOKE_CHROME, label: process.env.SMOKE_CHROME };
    try {
        const p = engine.executablePath();
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
    page.on('request', (r) => { if (!r.url().startsWith(origin) && r.url() !== COUNT_URL) foreign.push(r.url()); });

    // Bytes over the wire come from the DevTools protocol, which only
    // Chromium speaks; in Firefox the weights go unmeasured (see the top).
    const cdp = CHROMIUM ? await context.newCDPSession(page) : null;
    const sizes = new Map();
    if (cdp) {
        await cdp.send('Network.enable');
        cdp.on('Network.responseReceived', (e) => sizes.set(e.requestId, { url: e.response.url, bytes: 0 }));
        cdp.on('Network.loadingFinished', (e) => { const s = sizes.get(e.requestId); if (s) s.bytes = e.encodedDataLength; });
    }

    await page.goto(`${origin}/${rel}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    const arrival = Array.from(sizes.values()).filter(s => s.bytes > 0);
    const arrivalBytes = arrival.reduce((n, s) => n + s.bytes, 0);
    const bytesSince = () => Array.from(sizes.values()).reduce((n, s) => n + s.bytes, 0) - arrivalBytes;

    return { errors, foreign, failed, arrival, arrivalBytes, bytesSince, cdp, measured: !!cdp };
}

(async () => {
    if (!['chromium', 'firefox'].includes(BROWSER)) {
        console.error(`  ✗ --browser ${BROWSER}: this smoke test runs in chromium or firefox`);
        process.exit(1);
    }
    if (LENGTHS_ONLY && !CHROMIUM) {
        console.error('  ✗ --lengths-only: lengths are measured in Chromium, where their ceilings were set');
        process.exit(1);
    }
    let engine;
    try { engine = require('playwright-core')[BROWSER]; }
    catch (e) { console.error('  playwright-core is not installed — run `npm install`'); process.exit(1); }

    const browserSpec = findBrowser(engine);
    if (!browserSpec) {
        const msg = CHROMIUM
            ? 'no Chromium found (set SMOKE_CHROME=/path/to/chrome)'
            : 'no Playwright Firefox found (run `npx playwright-core install firefox`, or set SMOKE_FIREFOX)';
        if (REQUIRE) { console.error(`  ✗ ${msg}`); process.exit(1); }
        console.log(`  smoke: skipped — ${msg}`);
        process.exit(0);
    }

    await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${PORT}`;
    const browser = await engine.launch({
        executablePath: browserSpec.executablePath,
        args: CHROMIUM ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
    });
    // Every context opened from here on has the visit counter quietened (see
    // quietCounter()), so a check added later cannot forget to. The one
    // exception is exerciseCounter(), which is handed the unquietened opener.
    const openContext = browser.newContext.bind(browser);
    browser.newContext = async (options) => {
        const c = await openContext(options);
        await quietCounter(c);
        return c;
    };
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (SCREENS) fs.mkdirSync(path.join(ROOT, '.smoke'), { recursive: true });

    console.log(`\n  Smoke test in ${browserSpec.label} ${browser.version()}\n`);

    if (LENGTHS_ONLY) {
        await checkLengths(browser, origin);
        await browser.close();
        server.close();
        if (failures) { console.log(`\n  ${failures} problem(s)\n`); process.exit(1); }
        console.log('\n  Every page within its length budget\n');
        return;
    }

    // The budget script's first-view estimates, to hold the measurements against.
    const budget = require('./check-budget.js');
    const estimates = budget.measure().measured;

    const results = {};
    for (const rel of PAGES) {
        const page = await context.newPage();
        const r = await visit(context, page, rel, origin);
        results[rel] = r;
        console.log(`  ${rel}`);
        if (r.errors.length) r.errors.forEach(e => bad(e)); else ok('no console errors, no uncaught exceptions');
        if (r.failed.length) r.failed.forEach(f => bad(`request failed: ${f}`)); else ok('every request succeeded');
        if (r.foreign.length) r.foreign.forEach(f => bad(`left the origin: ${f}`)); else ok('no request left this origin');
        if (r.measured) ok(`arrival: ${fmt(r.arrivalBytes)} over the wire in ${r.arrival.length} requests`);

        if (rel === 'index.html') await exerciseHomepage(page, r, origin);
        if (rel === 'index.html') await exerciseAssay(page, r);
        if (rel === 'carbon-ai.html') await exerciseCarbonTool(page, r);
        if (rel === 'case-studies.html') await exerciseCaseStudyGames(page, r);

        if (SCREENS) await page.screenshot({ path: path.join(ROOT, '.smoke', (CHROMIUM ? '' : `${BROWSER}-`) + rel.replace('.html', '.png')) });
        await page.close();
    }

    await checkWithoutJs(browser, origin);
    await exerciseShell(browser, origin);

    // Each budgeted page's measured first view against the budget's
    // estimate. The estimate counts bodies; every response also carries a
    // status line and headers, which it does not model — about 210 bytes a
    // response from this server — so each request is allowed 300 bytes on
    // top. (A flat 2% did that job for the homepage, but on a 90 KB page it
    // left room for barely one more request.) The pages come from
    // check-budget.js, so a page that gains a budget there is measured here.
    if (!CHROMIUM) ok(`first-view weights: not measured in ${BROWSER} (no DevTools protocol) — the Chromium run checks them`);
    else Object.entries(budget.PAGE_BUDGETS).forEach(([rel, key]) => {
        const r = results[rel];
        const estimate = estimates[key];
        if (!r) return bad(`${rel}: has a budget in check-budget.js but is not a page here`);
        if (r.arrivalBytes <= estimate + 300 * r.arrival.length) {
            ok(`${rel}: measured first view ${fmt(r.arrivalBytes)} is within the budget's estimate of ${fmt(estimate)}`);
        } else {
            bad(`${rel}: measured first view ${fmt(r.arrivalBytes)} exceeds the budget's estimate of ${fmt(estimate)} — check-budget.js is missing something the page fetches on load`);
        }
    });

    await checkLengths(browser, origin);

    await exerciseFirstView(browser, origin);
    await exerciseLongestStrip(browser, origin);
    await exerciseNavigation(browser, origin);
    await exerciseSections(browser, origin);
    await exerciseCpu(browser, origin);
    await exerciseJourneyAndChart(browser, origin);
    await exerciseStatsPage(browser, origin);

    // The top nav at every desktop width: one line per item, nothing past the
    // right edge. It used to wrap "Case studies" and "AI, Weighed" at every
    // width and clip Contact off-screen up to 1373px — and body's
    // overflow-x:hidden meant nothing else would ever have noticed.
    {
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        const broken = [];
        for (let w = 880; w <= 1920; w += 20) {
            await page.setViewportSize({ width: w, height: 800 });
            const r = await page.evaluate(() => {
                if (getComputedStyle(document.getElementById('navToggle')).display !== 'none') return null;
                const links = Array.from(document.querySelectorAll('.nav-menu .nav-link'));
                const off = links.filter((a) => {
                    const box = a.getBoundingClientRect();
                    const line = parseFloat(getComputedStyle(a).lineHeight) || 20;
                    return box.right > innerWidth || box.height > line * 1.6 + 12;
                }).map(a => a.textContent.trim());
                // The theme switch shares the bar: on screen, clear of the links.
                const sw = document.querySelector('.nav-container > #themeToggle');
                const t = sw ? sw.getBoundingClientRect() : { width: 0 };
                if (!t.width || t.left < 0 || t.right > links[0].getBoundingClientRect().left) off.push('theme switch');
                return off;
            });
            if (r && r.length) broken.push(`${w}px: ${r.join(', ')}`);
        }
        if (broken.length) broken.forEach(b => bad(`nav item wraps or is clipped at ${b}`));
        else ok('nav: every item on one line and on screen, 880–1920px (or the menu button instead)');
        await page.close();
    }

    await exerciseNarration(browser, origin);
    await exerciseCounter(openContext, origin, results['index.html'].arrivalBytes);

    await accessibilityPass(browser, origin);

    await browser.close();
    server.close();

    if (failures) { console.log(`\n  ${failures} problem(s)\n`); process.exit(1); }
    console.log('\n  Smoke test passed\n');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });

// Wait until the page has done its own deferred work: at least 1.6 s past
// the load event (script.js's one post-load check runs at 1.5 s) and no
// request started or finished for `quietMs`. Gives up after `maxMs` rather
// than hang; whatever is still in flight then will show up in the check.
async function quietNetwork(page, quietMs = 800, maxMs = 8000) {
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ['request', 'requestfinished', 'requestfailed'];
    events.forEach((e) => page.on(e, bump));
    const start = Date.now();
    await page.waitForFunction(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        return document.readyState === 'complete' && nav && nav.loadEventEnd > 0 &&
            performance.now() - nav.loadEventEnd > 1600;
    }, null, { timeout: maxMs, polling: 100 }).catch(() => null);
    while (Date.now() - last < quietMs && Date.now() - start < maxMs) await page.waitForTimeout(100);
    events.forEach((e) => page.off(e, bump));
}

// ------------------------------------------------------------------
// Length: how far a reader has to scroll, held like the bytes
// ------------------------------------------------------------------
// Length is a cost to a busy reader too. The homepage was held to the
// plan's targets (Phase 2, step 3: 10 screens on a desktop and 18 on a
// phone; it was 19.4 and 32.7) until it met them, every other page to what
// it measured when its ceiling was set, plus 5%; the ratchet only lowers
// them (check-budget.js, LENGTH).
//
// Every page at the two sizes in check-budget.js's VIEWPORTS, measured once
// it has settled: fonts loaded; walked top to bottom, so every section is
// drawn at its real height (content-visibility sizes one by a 2000px
// estimate until it nears the screen) and whatever is fetched on the way
// (the journey map, section 05, the case studies' games, Anatomy of a
// Prompt) arrives and is drawn; then walked again until the height holds.
// Nothing is opened (the player, the terminal, an experience card's More).
// Reduced motion, so no reveal is caught half-way. A length is scrollHeight over innerHeight, to
// two places. stats.html is measured drawn full as well (drawStats, a busy
// quarter), and its budget holds whichever is longer.
//
// What it measured is written to .smoke/length.json (--lengths-out FILE to
// put it elsewhere), which `npm run budget -- --ratchet --lengths` and
// scripts/receipt.js read. Chromium only, like the weights: the ceilings
// were measured there, and another engine's line breaks move a long page
// by more than the 5% a ceiling allows.
const LENGTH_PARALLEL = 4;

async function measureLength(browser, origin, rel, size, html) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, reducedMotion: 'reduce' });
    try {
        const page = await context.newPage();
        if (html) await page.route(`${origin}/${rel}`, route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
        await page.goto(`${origin}/${rel}`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const walk = () => page.evaluate(async () => {
            // Two frames a step: one lays out what came into view, the next
            // draws it. The timer stands in if frames are held back.
            const settle = () => new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 150); });
            const root = document.documentElement;
            for (let y = 0; y < root.scrollHeight; y += innerHeight / 2) {
                scrollTo({ top: y, behavior: 'instant' });
                await settle();
            }
            scrollTo({ top: root.scrollHeight, behavior: 'instant' });
            await settle();
            scrollTo({ top: 0, behavior: 'instant' });
            await settle();
            return root.scrollHeight;
        });
        let px = await walk();
        await quietNetwork(page);
        for (let i = 0; i < 4; i++) {
            const again = await walk();
            if (again === px) break;
            px = again;
            await quietNetwork(page, 400);
        }
        // Where the length is: each part of the page in the flow (main's
        // sections one by one), so a page over its ceiling says where.
        const { height, parts } = await page.evaluate(() => {
            const flow = el => el.getBoundingClientRect().height >= 1 && !/^(fixed|absolute)$/.test(getComputedStyle(el).position);
            const list = Array.from(document.body.children).flatMap(el => (el.localName === 'main' ? Array.from(el.children) : [el])).filter(flow);
            const name = el => el.id || (el.getAttribute('class') || el.localName).split(' ')[0];
            return { height: innerHeight, parts: list.map(el => `${name(el)} ${(el.getBoundingClientRect().height / innerHeight).toFixed(2)}`).join(', ') };
        });
        return { px, screens: Math.round((px / height) * 100) / 100, parts };
    } finally {
        await context.close();
    }
}

async function checkLengths(browser, origin) {
    console.log('  Length — every page settled, in screens (page height ÷ window height)');
    if (!CHROMIUM) return ok(`lengths: not measured in ${BROWSER} — the Chromium run holds them to their budgets`);
    const budget = require('./check-budget.js');
    const sizes = Object.entries(budget.VIEWPORTS);
    const jobs = [];
    PAGES.forEach(rel => sizes.forEach(([vp, size]) => {
        jobs.push({ rel, vp, size });
        if (rel === 'stats.html') jobs.push({ rel, vp, size, full: true });
    }));
    let fullStats = null;
    const got = new Map();
    const partsOf = new Map();   // printed, not written: length.json holds lengths
    let next = 0;
    const worker = async () => {
        while (next < jobs.length) {
            const job = jobs[next++];
            try {
                const html = job.full ? (fullStats = fullStats || drawStats(500, 12)) : null;
                const { parts, ...m } = await measureLength(browser, origin, job.rel, job.size, html);
                got.set(`${job.rel} ${job.vp}${job.full ? ' full' : ''}`, m);
                if (!job.full) partsOf.set(`${job.rel} ${job.vp}`, parts);
            } catch (e) {
                bad(`${job.rel} at ${job.vp}${job.full ? ', drawn full' : ''}: length not measured (${e.message.split('\n')[0]})`);
            }
        }
    };
    await Promise.all(Array.from({ length: LENGTH_PARALLEL }, worker));

    // In page and viewport order, whatever order the measurements finished in.
    const pages = {};
    PAGES.forEach((rel) => {
        pages[rel] = {};
        sizes.forEach(([vp]) => {
            const m = got.get(`${rel} ${vp}`);
            const full = got.get(`${rel} ${vp} full`);
            if (m) pages[rel][vp] = full ? { ...m, full } : m;
        });
    });
    const measured = { schema: budget.SCHEMA, browser: `Chromium ${browser.version()}`, viewports: budget.VIEWPORTS, pages };
    const file = path.resolve(argValue('--lengths-out') || path.join(ROOT, '.smoke', 'length.json'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(measured, null, 2) + '\n');

    PAGES.forEach((rel) => {
        const ceilings = budget.LENGTH[rel];
        if (!ceilings) return bad(`${rel}: has no length budget — give it one in LENGTH, scripts/check-budget.js`);
        sizes.forEach(([vp]) => {
            const m = pages[rel][vp];
            if (!m) return;
            const held = budget.heldLength(m);
            const two = n => n.toFixed(2);
            const shown = `${two(m.screens)} screens${m.full ? ` (${two(m.full.screens)} drawn full)` : ''}`;
            // The homepage's parts are always printed: its length is the
            // plan's own target, and whatever grows it next will ask where
            // to cut.
            const where = held > ceilings[vp] || rel === 'index.html' ? ` — ${partsOf.get(`${rel} ${vp}`)}` : '';
            if (held <= ceilings[vp]) ok(`${rel} at ${vp}: ${shown}, within ${two(ceilings[vp])}${where}`);
            else bad(`${rel} at ${vp}: ${shown}, over its ceiling of ${two(ceilings[vp])} — shorten the page; a ceiling only moves down${where}`);
        });
    });
    Object.keys(budget.LENGTH).filter(rel => !PAGES.includes(rel))
        .forEach(rel => bad(`${rel}: has a length budget in check-budget.js but is not a page here`));
    budget.hints(budget.budgetJson({}, measured)).forEach(h => ok(h));
    const where = path.relative(process.cwd(), file);
    ok(`lengths written to ${where.startsWith('..') ? file : where}`);
}

// ------------------------------------------------------------------
// The Assay: grades an ad in the page, and sends nothing while it does
// ------------------------------------------------------------------
async function exerciseAssay(page, r) {
    const sent = [];
    const onRequest = (q) => sent.push(q.url());
    await page.evaluate(() => document.getElementById('assay').scrollIntoView());
    await page.waitForFunction(() => (window.mks || {}).assay, null, { timeout: 5000 }).catch(() => null);
    // Only the grading is watched. Scrolling here pulls in lazy images, and
    // a browser with no speech voice asks the voice manifest once, 1.5 s
    // after load — CI's headless Chrome has none, and scrolling through the
    // features above can push load late enough that the check landed inside
    // this window. Neither is the Assay's request, so let the page go quiet
    // first: past that deferred check, and no request for 800 ms.
    await quietNetwork(page);
    page.on('request', onRequest);
    await page.click('#assay .assay-open');   // its box is folded until asked for
    await page.fill('#assayInput', [
        'Senior ESG Reporting Consultant. Help clients prepare for CSRD and ESRS reporting.',
        '- Fluent Dutch and English',
        '- 5+ years of experience at a Big Four firm',
        '- Hands-on experience with SAP',
        '- Strong knowledge of GHG accounting and stakeholder engagement'
    ].join('\n'));
    await page.click('#assayRun');
    await page.waitForTimeout(300);
    page.off('request', onRequest);

    const out = await page.evaluate(() => {
        const result = document.getElementById('assayResult');
        const tag = result.querySelector('.assay-grade-tag');
        const gaps = Array.from(result.querySelectorAll('.assay-row-gap')).filter(el => el.getBoundingClientRect().height > 0);
        return { grade: tag && tag.textContent, gaps: gaps.length };
    });
    if (out.grade && out.grade !== 'High-grade match' && out.gaps >= 4) ok(`the Assay grades the Dutch / Big Four / SAP ad "${out.grade}" with ${out.gaps} visible gaps`);
    else bad(`the Assay graded the Dutch / Big Four / SAP ad "${out.grade}" with ${out.gaps} visible gaps`);
    if (sent.length === 0) ok('the Assay sent nothing while grading'); else bad(`the Assay made requests while grading: ${sent.join(', ')}`);
    if (r.errors.length) r.errors.forEach(e => bad(e));
}

// ------------------------------------------------------------------
// carbon-ai.html: numbers a person can read, selects that do not clip
// ------------------------------------------------------------------
async function exerciseCarbonTool(page, r) {
    // A closed select cannot wrap, so the widest option has to fit inside
    // the box. It clipped at every width from a 320px phone to a 1440px
    // desktop. Each option is measured the way this browser sizes a select
    // for it: a copy beside it, as wide as that one option needs, padding
    // and arrow included (Firefox's arrow is not Chromium's 20px).
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        const clipped = await page.evaluate(() => {
            const out = [];
            document.querySelectorAll('select').forEach((sel) => {
                const probe = sel.cloneNode(false);
                probe.removeAttribute('id');
                probe.style.cssText = 'position:absolute;visibility:hidden;width:auto;min-width:0;max-width:none';
                sel.parentNode.appendChild(probe);
                Array.from(sel.options).forEach((o) => {
                    probe.replaceChildren(new Option(o.textContent));
                    if (probe.getBoundingClientRect().width > sel.getBoundingClientRect().width + 0.5) out.push(`#${sel.id} "${o.textContent}"`);
                });
                probe.remove();
            });
            if (document.documentElement.scrollWidth > innerWidth) out.push(`the page scrolls sideways (${document.documentElement.scrollWidth}px)`);
            return out;
        });
        if (clipped.length) clipped.forEach(c => bad(`carbon-ai.html at ${width}px: ${c} is cut off`));
        else ok(`carbon-ai.html at ${width}px: every select option fits, nothing scrolls sideways`);
    }

    // Every preset, every number: no exponent, no "0.0" for something that
    // is not zero.
    const presets = await page.$$eval('[data-preset]', (b) => b.map(x => x.getAttribute('data-preset')));
    const problems = [];
    for (const preset of presets) {
        await page.click(`[data-preset="${preset}"]`);
        const values = await page.$$eval('.ca-num, .ca-equiv li > span:last-child, .bar-value', (els) => els.map(e => e.textContent.trim()));
        values.filter(v => /\d[eE][-+]?\d/.test(v) || /^0\.0+\b/.test(v)).forEach(v => problems.push(`${preset}: "${v}"`));
    }
    if (problems.length) problems.forEach(p => bad(`carbon-ai.html prints ${p}`));
    else ok(`carbon-ai.html: ${presets.length} presets, no exponent notation and no rounded-away zero`);

    // Anatomy of a Prompt, moved here from the homepage: not part of the
    // first view, fetched as its section nears, drawn from the calculator's
    // numbers, and every label 11px or more and inside the drawing. On the
    // homepage its labels came out at about 5px on a phone, and a frame
    // that scrolled sideways cut them off.
    if (r.arrival.some(s => /modules\/anatomy\./.test(s.url))) bad('carbon-ai.html: Anatomy\'s script or stylesheet arrived with the page, not on demand');
    else ok('carbon-ai.html: Anatomy\'s script and stylesheet are not part of the first view');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => document.getElementById('anatomy').scrollIntoView());
    const drawn = await page.waitForSelector('#anatomyDraw:not([hidden])', { timeout: 5000 }).then(() => true, () => false);
    if (!drawn) bad('carbon-ai.html: Anatomy of a Prompt was not fetched and drawn as it came into view');
    else {
        const same = await page.evaluate(() => {
            const v = document.querySelector('#anatomySvg .anatomy-t-val');
            return { anatomy: v && v.textContent, calculator: document.getElementById('outCarbon').textContent };
        });
        if (same.anatomy === `${same.calculator} g CO₂e`) ok(`carbon-ai.html: Anatomy draws the calculator's own figure (${same.anatomy})`);
        else bad(`carbon-ai.html: Anatomy shows ${same.anatomy}, the calculator ${same.calculator} g`);
        for (const width of [320, 390, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await page.waitForTimeout(300);   // its ResizeObserver redraws for the new width
            await page.evaluate(() => document.getElementById('anatomy').scrollIntoView());
            const a = await page.evaluate(() => {
                const svg = document.getElementById('anatomySvg');
                const box = svg.getBoundingClientRect();
                const scale = box.width / svg.viewBox.baseVal.width;
                const texts = Array.from(svg.querySelectorAll('text'));
                return {
                    n: texts.length,
                    small: texts.filter(t => parseFloat(getComputedStyle(t).fontSize) * scale < 10.95).map(t => `"${t.textContent}" ${(parseFloat(getComputedStyle(t).fontSize) * scale).toFixed(1)}px`),
                    cut: texts.filter((t) => {
                        const b = t.getBoundingClientRect();
                        return b.left < box.left - 0.5 || b.right > box.right + 0.5 || b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5;
                    }).map(t => `"${t.textContent}"`),
                    sideways: document.documentElement.scrollWidth > innerWidth
                };
            });
            const trouble = a.small.map(s => `${s} is under 11px`).concat(a.cut.map(c => `${c} is cut off`));
            if (a.sideways) trouble.push(`the page scrolls sideways`);
            if (trouble.length) trouble.forEach(t => bad(`carbon-ai.html at ${width}px, Anatomy: ${t}`));
            else ok(`carbon-ai.html at ${width}px: Anatomy's ${a.n} labels are all 11px or more and inside the drawing`);
        }
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    if (r.errors.length) r.errors.forEach(e => bad(e));
}

// ------------------------------------------------------------------
// The first view, as a recruiter meets it
// ------------------------------------------------------------------
// Who, what and how to reach him in the first screen, with the figures
// behind it: the hero's stats sat at 883px of a 900px desktop and 1,010px
// of a phone's 844, its photo caption at 1,019px, and the play index was
// the next thing down. Measured once the page has settled: fonts in, the
// loading screen gone, nothing scrolled. Besides the plan's two screens,
// two laptops' browser windows, which are shorter than their screens: a
// 1366x768 laptop leaves about 1366x657, and the figures sat wholly below
// it; at 1280x720 the fold cut through the digits.
const FIRST_VIEWS = [[1440, 900], [390, 844], [1366, 657], [1280, 720]];
async function exerciseFirstView(browser, origin) {
    console.log('  index.html — the first view');
    for (const [width, height] of FIRST_VIEWS) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => !document.getElementById('preloader'), null, { timeout: 5000 }).catch(() => null);
        const r = await page.evaluate(() => {
            const inView = (el) => {
                const b = el && el.getBoundingClientRect();
                return !!b && b.width > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth;
            };
            const onTop = (el) => {
                const b = el.getBoundingClientRect();
                const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
                return !!hit && el.contains(hit);
            };
            const at = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().bottom);
            const caption = document.getElementById('heroCaption');
            return {
                scrolled: scrollY,
                stats: inView(document.querySelector('.hero-stats')), statsAt: at('.hero-stats'),
                caption: inView(caption) && onTop(caption), captionAt: at('#heroCaption'),
                glance: inView(document.querySelector('.at-a-glance')),
                primary: document.querySelectorAll('#home .btn-primary').length,
                act: inView(document.querySelector('#home .btn-primary')),
                play: Math.round(document.querySelector('.play-index').getBoundingClientRect().top),
                links: document.querySelectorAll('#navMenu a').length
            };
        });
        const at = `at ${width}x${height}`;
        if (r.scrolled) bad(`first view ${at}: the page opened scrolled to ${r.scrolled}px`);
        if (r.stats) ok(`first view ${at}: the hero's figures are on the first screen (they end at ${r.statsAt}px)`);
        else bad(`first view ${at}: the hero's figures end at ${r.statsAt}px, below the first screen`);
        if (r.caption) ok(`first view ${at}: the photo's caption is on the first screen, uncovered (ends at ${r.captionAt}px)`);
        else bad(`first view ${at}: the photo's caption is off the first screen or covered (ends at ${r.captionAt}px)`);
        if (r.glance && r.act) ok(`first view ${at}: the at-a-glance strip and the primary action are on the first screen`);
        else bad(`first view ${at}: ${r.glance ? '' : 'the at-a-glance strip '}${r.act ? '' : 'the primary action '}not on the first screen`);
        if (r.primary === 1) ok(`first view ${at}: one primary button in the hero`); else bad(`first view ${at}: ${r.primary} primary buttons in the hero`);
        if (r.play >= height) ok(`first view ${at}: the play index is below the fold (${r.play}px)`);
        else bad(`first view ${at}: the play index is in the first screen (${r.play}px)`);
        if (r.links <= 7) ok(`first view ${at}: ${r.links} links in the nav`); else bad(`first view ${at}: ${r.links} links in the nav — at most 7`);
        await context.close();
    }

    // The caption now sits over the eyebrow's corner, and the slideshow
    // swaps in longer ones: each must stay clear of the eyebrow and the
    // name, down to a 320px phone, where the longest takes two lines.
    const captions = (fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8')
        .match(/heroSlideCaptions = \[([^\]]*)\]/) || ['', ''])[1].match(/'[^']+'/g) || [];
    if (!captions.length) bad('first view: could not read the slideshow\'s captions from script.js');
    for (const [width, height] of [[320, 568], [390, 844], [1440, 900]]) {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        const clash = await page.evaluate((list) => list.filter((text) => {
            document.getElementById('heroCaptionText').textContent = text;
            const c = document.getElementById('heroCaption').getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(document.querySelector('.hero-eyebrow'));
            const others = Array.from(range.getClientRects()).concat(document.querySelector('.hero-title').getBoundingClientRect());
            return c.left < 0 || c.right > innerWidth ||
                others.some(o => c.left < o.right && o.left < c.right && c.top < o.bottom && o.top < c.bottom);
        }), captions.map(s => s.slice(1, -1)));
        if (clash.length) bad(`first view at ${width}px: the photo caption covers the eyebrow or the name, or leaves the screen, with ${clash.join(' / ')}`);
        else ok(`first view at ${width}px: all ${captions.length} photo captions clear of the eyebrow and the name`);
        await context.close();
    }
}

// ------------------------------------------------------------------
// The first view once Moses has filled in the at-a-glance strip
// ------------------------------------------------------------------
// Today the strip has one fact; four more wait for him (seniority, start
// date, languages, right to work). Laid out a line each, they pushed the
// figures off a 390x844 screen, so filling them in, the only way to finish
// the strip, would have failed the check above. Here the strip is drawn by
// build-content.js's own renderer from a fixture profile with every fact
// at the longest content.js accepts, served in place of index.html's, and
// the first view is checked again. The values are fixtures: none of them
// reaches a page.
async function exerciseLongestStrip(browser, origin) {
    console.log('  index.html — the first view, every at-a-glance fact at its longest');
    const { GLANCE_LIMITS: L, glanceLanguages, checkAtAGlance } = require('./lib/content.js');
    const { renderAtAGlance } = require('./build-content.js');
    // Words of a common length, cut to exactly n characters, so each fact
    // wraps as prose of its full length would.
    const fill = (n) => {
        const words = ['Fixture', 'wording', 'at', 'the', 'longest', 'this', 'fact', 'may', 'run'];
        let s = '';
        for (let i = 0; s.length < n; i++) s += (s ? ' ' : '') + words[i % words.length];
        return s.slice(0, n).replace(/ $/, 'x');
    };
    const languages = [];
    const one = () => ({ language: 'Language', level: languages.length % 2 ? 'native' : 'C2' });
    while (glanceLanguages(languages.concat(one())).length <= L.languages) languages.push(one());
    languages[languages.length - 1].language += 'x'.repeat(L.languages - glanceLanguages(languages).length);
    const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'profile.json'), 'utf8'));
    profile.languages = languages;
    profile.atAGlance = {
        targetRoles: fill(L.targetRoles),
        workArea: [fill(L.workArea)],
        seniority: fill(L.seniority),
        availableFrom: '2031-09-30',          // the longest a date is written: "30 Sep 2031"
        rightToWork: fill(L.rightToWork)
    };
    const refused = checkAtAGlance(profile.atAGlance, profile.languages);
    if (refused.length) return bad(`the longest strip: content.js refuses the fixture (${refused.join('; ')})`);

    const START = '            <!-- AT-A-GLANCE:START', END = '<!-- AT-A-GLANCE:END -->';
    const page0 = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const html = page0.slice(0, page0.indexOf(START)) + renderAtAGlance(profile) + page0.slice(page0.indexOf(END) + END.length);
    for (const [width, height] of FIRST_VIEWS) {
        const context = await browser.newContext({ viewport: { width, height } });
        await context.route(`${origin}/index.html`, (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => !document.getElementById('preloader'), null, { timeout: 5000 }).catch(() => null);
        const r = await page.evaluate(() => {
            const bottom = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().bottom);
            return {
                facts: document.querySelectorAll('#home .glance-fact').length,
                glance: bottom('.at-a-glance'), act: bottom('#home .btn-primary'), stats: bottom('.hero-stats'),
                wide: document.documentElement.scrollWidth > innerWidth
            };
        });
        const at = `longest strip at ${width}x${height}`;
        if (r.facts !== 5) bad(`${at}: ${r.facts} facts drawn, not 5`);
        if (Math.max(r.glance, r.act, r.stats) <= height) ok(`${at}: the strip, the primary action and the figures are on the first screen (the figures end at ${r.stats}px)`);
        else bad(`${at}: the strip ends at ${r.glance}px, the primary action at ${r.act}px and the figures at ${r.stats}px, past the first ${height}px`);
        if (r.wide) bad(`${at}: the page scrolls sideways`);
        await context.close();
    }
}

// ------------------------------------------------------------------
// case-studies.html: the two games, fetched as a reader nears them
// ------------------------------------------------------------------
// They used to open inside the homepage's dossiers. Now each is under the
// result it is about, and the page fetches them (modules/dossier.css, then
// .js) only when a host comes within a screen of view: nothing of them is
// in the first view. Played here once each, as a reader would, and their
// labels measured on a phone, where a 12px label in an 800-unit drawing
// used to come out at about 5px.
async function playGames(page) {
    await page.evaluate(() => document.getElementById('play-flood').scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => window.mks && window.mks.loaded && window.mks.loaded.dossier &&
        document.querySelectorAll('.cs-play.is-live').length === 2, null, { timeout: 5000 });
    // One round of the borehole game, played by reading the curve the way a
    // screen reader hears it: walk the rig to the deepest dip, drill there.
    await page.evaluate(() => document.getElementById('play-borehole').scrollIntoView({ block: 'center' }));
    await page.focus('#boreholeStage');
    for (let k = 0; k < 30; k++) await page.keyboard.press('ArrowLeft');
    for (let hole = 0; hole < 3; hole++) {
        for (let k = 0; k < 56; k++) {
            if (/very low/.test(await page.getAttribute('#boreholeStage', 'aria-valuetext'))) break;
            await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !document.getElementById('drillBtn').disabled, null, { timeout: 3000 });
        if (/STRIKE/.test(await page.textContent('#drillResult'))) break;
        for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight');   // past this dip
    }
    // The river raised to July 2021 by keyboard, as the slider allows.
    await page.focus('#floodSlider');
    await page.keyboard.press('End');
    await page.waitForTimeout(800);   // the water rises over 650 ms
}

async function exerciseCaseStudyGames(page, r) {
    const fetched = () => page.evaluate(() => performance.getEntriesByType('resource').filter(e => /modules\/dossier\./.test(e.name)).map(e => e.name.split('/').pop()));
    const early = await fetched();
    if (!early.length) ok('the games are not fetched on arrival');
    else bad(`the games were fetched on arrival: ${early.join(', ')}`);

    const before = r.bytesSince();
    try {
        await playGames(page);
    } catch (e) {
        bad(`the games did not load and play: ${String(e.message || e).split('\n')[0]}`);
        return;
    }
    const got = await fetched();
    if (got.join() === 'dossier.css,dossier.js') ok(`scrolling near them fetched their stylesheet, then their script${r.measured ? ` (+${fmt(r.bytesSince() - before)})` : ''}`);
    else bad(`near the games, fetched: ${got.join(', ') || 'nothing'}`);

    const played = await page.evaluate(() => ({
        score: document.getElementById('drillScore').textContent,
        yours: document.querySelectorAll('.strike-row:first-child .strike-cell.water, .strike-row:first-child .strike-cell.dry').length,
        level: document.getElementById('floodLevelLabel').textContent,
        water: +document.querySelector('#floodStage rect.fl-water[x="252"]').getAttribute('y')
    }));
    if (/[1-9]\d* of \d+ struck water/.test(played.score) && played.yours > 0) ok(`reading the curve to its deepest dip strikes water, and the game keeps score ("${played.score}")`);
    else bad(`the borehole game: score "${played.score}", ${played.yours} holes on the board`);
    if (played.level === 'July 2021' && played.water < 200) ok(`the flood slider raises the Wupper to July 2021 (water line at ${played.water})`);
    else bad(`the flood slider: level "${played.level}", water line at ${played.water}`);

    // Every label a reader needs, drawn at 11px or more and whole (the
    // borehole's title ran past the drawing's edge on a 320px phone, cut
    // at "dips reac"), at a phone's width and a small one; and nothing
    // pushes the page sideways.
    for (const [width, height] of [[390, 844], [320, 700]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => {
            const small = [];
            const cut = [];
            // A text's box is its font's full height, a few pixels taller
            // than its letters; the letters are what must stay inside.
            const ink = document.createElement('canvas').getContext('2d');
            document.querySelectorAll('.cs-play svg').forEach((svg) => {
                const box = svg.getBoundingClientRect();
                const scale = box.width / svg.viewBox.baseVal.width;
                svg.querySelectorAll('text').forEach((t) => {
                    if (getComputedStyle(t).display === 'none') return;
                    const px = parseFloat(getComputedStyle(t).fontSize) * scale;
                    if (px < 10.95) small.push(`"${t.textContent}" ${px.toFixed(1)}px`);
                    ink.font = `${px}px ${getComputedStyle(t).fontFamily}`;
                    const f = ink.measureText(t.textContent);
                    const b = t.getBoundingClientRect();
                    const top = b.top + f.fontBoundingBoxAscent - f.actualBoundingBoxAscent;
                    const bottom = b.bottom - (f.fontBoundingBoxDescent - f.actualBoundingBoxDescent);
                    if (b.left < box.left - 1 || b.right > box.right + 1 || top < box.top - 1 || bottom > box.bottom + 1) cut.push(`"${t.textContent}"`);
                });
            });
            document.querySelectorAll('.cs-play.is-live :is(p, span, label, button)').forEach((el) => {
                if (!el.getClientRects().length || !el.textContent.trim() || el.closest('svg')) return;
                const px = parseFloat(getComputedStyle(el).fontSize);
                if (px < 10.95) small.push(`${el.className || el.tagName} ${px}px`);
            });
            return { small, cut, wide: document.documentElement.scrollWidth > innerWidth };
        });
        if (!m.small.length) ok(`case-studies.html at ${width}px: every game label is 11px or more`);
        else bad(`case-studies.html at ${width}px: game labels under 11px: ${m.small.join(', ')}`);
        if (!m.cut.length) ok(`case-studies.html at ${width}px: every game label inside its drawing`);
        else bad(`case-studies.html at ${width}px: game labels past the drawing's edge: ${m.cut.join(', ')}`);
        if (m.wide) bad(`case-studies.html at ${width}px: the page scrolls sideways`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    if (r.errors.length) r.errors.forEach(e => bad(e)); else ok('the games played without an error');
    if (r.foreign.length) r.foreign.forEach(f => bad(`left the origin: ${f}`));

    await holdReaderBelowGame(page.context().browser(), new URL(page.url()).origin);
    await exercisePhotos(page.context().browser(), new URL(page.url()).origin);
}

// A reader who has scrolled on to the case study after Wuppertal's, with
// the flood game's host just above the screen, when the games arrive (the
// loader starts a screen early). The host grows by its whole widget, and
// without scroll anchoring, as in Safari, that pushed what they were
// reading 400-500px down the page. The script is held back until the
// reader is in place, so the growth lands on them.
async function holdReaderBelowGame(browser, origin) {
    for (const [width, height] of [[1280, 800], [390, 844]]) {
        const context = await browser.newContext({ viewport: { width, height } });
        await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('style');
            s.textContent = '* { overflow-anchor: none !important; }';
            document.head.appendChild(s);
        }));
        let release;
        const gate = new Promise(res => { release = res; });
        await context.route('**/modules/dossier.js', async (route) => { await gate; await route.continue(); });
        const page = await context.newPage();
        await page.goto(`${origin}/case-studies.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);
        await page.evaluate(() => scrollTo({ top: document.getElementById('un-disaster').getBoundingClientRect().top + scrollY - 90, behavior: 'instant' }));
        await page.waitForTimeout(400);
        const at = () => page.evaluate(() => ({
            top: Math.round(document.getElementById('un-disaster').getBoundingClientRect().top),
            host: Math.round(document.getElementById('play-flood').getBoundingClientRect().bottom)
        }));
        const seen = await at();
        release();
        const live = await page.waitForFunction(() => document.querySelectorAll('.cs-play.is-live').length === 2, null, { timeout: 5000 }).then(() => true, () => false);
        await page.waitForTimeout(300);
        const now = await at();
        const tag = `case-studies.html at ${width}px, no scroll anchoring, reading on below the flood game`;
        if (!live || seen.host > 0) bad(`${tag}: the games did not arrive above the reader (live: ${live}, host's foot at ${seen.host}px)`);
        else if (Math.abs(now.top - seen.top) <= 2) ok(`${tag}: it arrives above and nothing moves (${seen.top}px, then ${now.top}px)`);
        else bad(`${tag}: the page moved ${now.top - seen.top}px as the game arrived above`);
        await context.close();
    }
}

// ------------------------------------------------------------------
// case-studies.html: the photos, and the lightbox they open in
// ------------------------------------------------------------------
// The 25 field photos went with the homepage's dossiers and were shown
// nowhere; the homepage kept a lightbox that opened one photo at a time.
// They are back with their case studies, folded under a line each, and
// the page's own lightbox steps through a case study's photos. Checked on
// a phone and a small one, in both themes, with and without motion: the
// photos wait until their row is opened, then previous, next, the arrow
// keys and "2 of 5", Tab kept inside, and Escape handing focus back to the
// photo pressed. axe checks the open lightbox in accessibilityPass().
async function exercisePhotos(browser, origin) {
    const runs = [[390, 844, 'dark', 'reduce'], [390, 844, 'light', 'no-preference'], [320, 700, 'dark', 'no-preference'], [320, 700, 'light', 'reduce']];
    for (const [width, height, theme, motion] of runs) {
        const where = `case-studies.html photos at ${width}x${height}, ${theme}, ${motion === 'reduce' ? 'reduced motion' : 'with motion'}`;
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, reducedMotion: motion });
        await context.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch (e) { /* blocked */ } }, theme);
        const page = await context.newPage();
        const photos = [];
        page.on('request', (q) => { if (/assets\/img\/wuppertal-resilience/.test(q.url())) photos.push(q.url().split('/').pop()); });
        await page.goto(`${origin}/case-studies.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.querySelector('#wuppertal details.cs-photos').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForTimeout(400);
        const folded = photos.length;
        await page.click('#wuppertal details.cs-photos > summary');
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#wuppertal .cs-photo img')).slice(0, 2).every(i => i.complete && i.naturalWidth), null, { timeout: 5000 }).catch(() => null);
        const steps = [];
        const expect = (what, got, want) => { if (got !== want) steps.push(`${what}: ${got}, not ${want}`); };
        if (folded) steps.push(`${folded} of its photos were fetched before the row was opened`);
        if (!photos.length) steps.push('opening the row fetched none of its photos');
        const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (wide) steps.push('with the row open, the page scrolls sideways');

        const state = () => page.evaluate(() => {
            const box = document.getElementById('lightbox');
            const el = document.activeElement;
            return {
                open: !!box && !box.hidden,
                count: box ? box.querySelector('.lightbox-count').textContent : '',
                src: box ? (box.querySelector('img').getAttribute('src') || '').split('/').pop() : '',
                focus: el.getAttribute('aria-label') || el.getAttribute('href') || el.tagName,
                moving: box ? getComputedStyle(box).animationName !== 'none' : false   // what it would do, not whether it is done
            };
        });
        await page.focus('#wuppertal .cs-photo a >> nth=1');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => { const b = document.getElementById('lightbox'); return b && !b.hidden; }, null, { timeout: 3000 }).catch(() => null);
        let s = await state();
        expect('opened', `${s.open} ${s.count} ${s.src} ${s.focus}`, 'true 2 of 5 wuppertal-resilience-2.webp Close photo');
        if (motion === 'reduce' ? s.moving : !s.moving) steps.push(`it ${s.moving ? 'fades in with reduced motion asked for' : 'does not fade in with motion allowed'}`);
        const controls = await page.evaluate(() => Array.from(document.querySelectorAll('#lightbox button')).map((b) => {
            const r = b.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight && hit === b;
        }));
        if (controls.length !== 3 || !controls.every(Boolean)) steps.push('Close, Previous and Next are not all on screen, 44px or more, and uncovered');
        await page.waitForFunction(() => { const i = document.querySelector('#lightbox img'); return i.complete && i.naturalWidth; }, null, { timeout: 5000 }).catch(() => null);
        const art = await page.evaluate(() => {
            const img = document.querySelector('#lightbox img').getBoundingClientRect();
            const cap = document.getElementById('lightboxCaption').getBoundingClientRect();
            return { ok: img.top >= 0 && img.width > 0 && cap.bottom <= innerHeight && img.right <= innerWidth,
                at: `photo ${Math.round(img.left)},${Math.round(img.top)} ${Math.round(img.width)}x${Math.round(img.height)}, caption to ${Math.round(cap.bottom)} of ${innerHeight}` };
        });
        if (!art.ok) steps.push(`the photo or its caption is off the screen (${art.at})`);
        await page.click('#lightbox [data-step="1"]');
        s = await state();
        expect('Next', `${s.count} ${s.src}`, '3 of 5 wuppertal-resilience-3.webp');
        await page.keyboard.press('ArrowRight');
        expect('the right arrow', (await state()).count, '4 of 5');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        expect('the right arrow past the end', (await state()).count, '1 of 5');
        await page.keyboard.press('ArrowLeft');
        expect('the left arrow past the start', (await state()).count, '5 of 5');
        await page.click('#lightbox [data-step="-1"]');
        expect('Previous', (await state()).count, '4 of 5');
        await page.focus('#lightbox .lightbox-close');
        const ring = [];
        for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); ring.push((await state()).focus); }
        expect('Tab from Close', ring.join(', '), 'Previous photo, Next photo, Close photo, Previous photo');
        await page.keyboard.press('Escape');
        s = await state();
        expect('Escape', `${s.open} ${s.focus}`, 'false assets/img/wuppertal-resilience-2.webp');
        if (steps.length) steps.forEach(t => bad(`${where}: ${t}`));
        else ok(`${where}: fetched when opened; previous, next, the arrow keys and "2 of 5" step through; Tab stays inside; Escape returns focus`);
        await context.close();
    }
}

// ------------------------------------------------------------------
// A phone: the journey band, the Rhine's names, You Draw It's labels
// ------------------------------------------------------------------
// On a phone the journey map sat above the stops and flew out of sight as
// they came; on any screen the Rhine delta's names ran into each other;
// You Draw It printed its labels about 5px tall on a phone. What jsdom
// cannot show (tests/phone.test.js has the rest): where the pinned band
// sits against the stop it illustrates, and what size a label is once its
// drawing is scaled to fit.
const LABEL_MIN_PX = 11;

async function exerciseJourneyAndChart(browser, origin) {
    console.log('  index.html — the journey map on a phone, its names, You Draw It\'s labels');
    const mapReady = (page) => page.mouse.wheel(0, 300)
        .then(() => page.waitForFunction(() => document.querySelector('#journeyMapFrame svg'), null, { timeout: 5000 }))
        .catch(() => null);

    for (const [width, height] of [[390, 844], [320, 700]]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'Europe/Amsterdam' });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await mapReady(page);
        const where = `journey band at ${width}x${height}`;
        const trouble = [];
        const small = new Set();
        for (let i = 0; i < 5; i++) {
            // Met as a reader meets each stop: its top just under the band.
            await page.evaluate((i) => {
                const map = document.getElementById('journeyMap');
                const band = parseFloat(getComputedStyle(map).top) + map.getBoundingClientRect().height;
                const card = document.querySelector(`.journey-stop[data-stop="${i}"]`);
                scrollBy({ top: card.getBoundingClientRect().top - band - 16, behavior: 'instant' });
            }, i);
            await page.waitForTimeout(400);
            const r = await page.evaluate((i) => {
                const map = document.getElementById('journeyMap');
                const m = map.getBoundingClientRect();
                const bar = document.getElementById('navbar').getBoundingClientRect().bottom;
                const hit = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2);
                const card = document.querySelector(`.journey-stop[data-stop="${i}"]`);
                const covered = [];
                card.querySelectorAll('.journey-coords, h3, .journey-years, p').forEach((el) => {
                    const b = el.getBoundingClientRect();
                    [[b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + b.width / 2, b.top + b.height / 2], [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4]]
                        .filter(([, y]) => y > 0 && y < innerHeight)
                        .forEach(([x, y]) => {
                            const at = document.elementFromPoint(x, y);
                            if (!at || !card.contains(at)) covered.push(`${el.tagName.toLowerCase()} under ${at ? (at.closest('[id]') || at).id || at.tagName : 'nothing'}`);
                        });
                });
                return {
                    seen: m.top >= bar - 1 && m.bottom <= innerHeight && !!hit && map.contains(hit),
                    where: `${Math.round(m.top)}-${Math.round(m.bottom)}px`,
                    share: m.height / innerHeight,
                    flew: (map.querySelector('.map-stop.active') || {}).id,
                    active: (document.querySelector('.journey-stop.map-active') || { dataset: {} }).dataset.stop,
                    covered,
                    // A name's size on screen: its font size in map units,
                    // times its box on screen over its box in map units.
                    labels: Array.from(map.querySelectorAll('.map-stop.active text, .map-stop.visited text, .map-site.active text')).map((t) => {
                        const bb = t.getBBox();
                        return [t.textContent, bb.height ? parseFloat(getComputedStyle(t).fontSize) * t.getBoundingClientRect().height / bb.height : 0];
                    })
                };
            }, i);
            if (!r.seen) trouble.push(`stop ${i}: the band is not on screen and uncovered (${r.where})`);
            if (r.share > 0.25) trouble.push(`stop ${i}: the band takes ${(r.share * 100).toFixed(0)}% of the screen`);
            if (r.flew !== `mapStop${i}` || r.active !== String(i)) trouble.push(`stop ${i}: the map shows ${r.flew}, the page marks stop ${r.active}`);
            r.covered.forEach(c => trouble.push(`stop ${i}: its ${c}`));
            r.labels.filter(([, px]) => px < LABEL_MIN_PX - 0.05).forEach(([name, px]) => small.add(`${name} ${px.toFixed(1)}px`));
        }
        if (trouble.length) trouble.forEach(t => bad(`${where}, ${t}`));
        else ok(`${where}: pinned on screen at each of the five stops, showing that stop, over none of its text`);
        if (small.size) bad(`${where}: names under ${LABEL_MIN_PX}px (${Array.from(small).join(', ')})`);
        else ok(`${where}: every name on it ${LABEL_MIN_PX}px or more`);

        // Scrolled through: whenever a stop can be read below it, it is in view.
        const sweep = await page.evaluate(async () => {
            const map = document.getElementById('journeyMap');
            const section = document.getElementById('journey');
            const stops = Array.from(document.querySelectorAll('.journey-stop'));
            const frames = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
            const out = [];
            let checked = 0;
            const start = section.getBoundingClientRect().top + scrollY;
            for (let y = start - innerHeight; y < start + section.offsetHeight; y += 120) {
                scrollTo({ top: y, behavior: 'instant' });
                await frames();
                const m = map.getBoundingClientRect();
                const reading = stops.some((s) => { const b = s.getBoundingClientRect(); return b.top < innerHeight - 40 && b.bottom > m.bottom + 40; });
                if (!reading) continue;
                checked++;
                if (m.top < document.getElementById('navbar').getBoundingClientRect().bottom - 1 || m.bottom > innerHeight) out.push(`${Math.round(y)}px (band at ${Math.round(m.top)}-${Math.round(m.bottom)})`);
            }
            return { out, checked, still: map.classList.contains('map-still') };
        });
        if (sweep.out.length || sweep.checked < 5) bad(`${where}: out of view with a stop to read at ${sweep.out.join(', ') || `only ${sweep.checked} positions checked`}`);
        else ok(`${where}: in view at all ${sweep.checked} scroll positions with a stop to read below it`);
        if (sweep.still) ok(`${where}: with reduced motion it jumps from stop to stop`); else bad(`${where}: it flies with reduced motion asked for`);
        await context.close();
    }

    // The Rhine delta on a desktop, every name showing, for a visitor in
    // Amsterdam (their mark on the Amsterdam stop) and in Brussels (theirs
    // beside Wuppertal's name): no name on another or cut by the frame, and
    // no stop's or site's name across the route.
    for (const zone of ['Europe/Amsterdam', 'Europe/Brussels']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', timezoneId: zone });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await mapReady(page);
        const clash = [];
        let count = 0;
        for (const i of [3, 4]) {
            await page.evaluate((i) => document.querySelector(`.journey-stop[data-stop="${i}"]`).scrollIntoView({ block: 'center', behavior: 'instant' }), i);
            await page.waitForFunction((i) => document.querySelector(`#mapStop${i}.active`) && document.querySelector('.map-you'), i, { timeout: 5000 }).catch(() => null);
            await page.waitForTimeout(300);
            const r = await page.evaluate(() => {
                const shown = (t) => { for (let e = t; e && e.tagName !== 'svg'; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) < 0.1) return false; return true; };
                const frame = document.getElementById('journeyMapFrame').getBoundingClientRect();
                // The glyphs' band, not the line box around them.
                const box = (t) => { const b = t.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top + b.height * 0.2, b: b.bottom - b.height * 0.15, name: t.textContent, you: t.classList.contains('map-you-label') }; };
                // The names in the frame (Freetown's is still drawn, a map away).
                const names = Array.from(document.querySelectorAll('#journeyMapFrame text')).filter(shown).map(box)
                    .filter(n => n.r > frame.left && n.l < frame.right && n.b > frame.top && n.t < frame.bottom);
                const out = [];
                names.forEach((a, k) => names.slice(k + 1).forEach((b) => {
                    if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) out.push(`"${a.name}" on "${b.name}"`);
                }));
                names.filter(n => n.l < frame.left || n.r > frame.right || n.t < frame.top || n.b > frame.bottom).forEach(n => out.push(`"${n.name}" cut by the frame`));
                // The legs flown so far, as points on screen: the map's box on
                // screen over its viewBox (the flight is a CSS transform).
                const svg = document.querySelector('#journeyMapFrame svg');
                const R = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
                document.querySelectorAll('#journeyMapFrame .map-arc.drawn').forEach((arc) => {
                    const len = arc.getTotalLength();
                    for (let k = 0; k <= 400; k++) {
                        const q = arc.getPointAtLength(len * k / 400);
                        const p = { x: R.left + (q.x - vb.x) * R.width / vb.width, y: R.top + (q.y - vb.y) * R.height / vb.height };
                        const on = names.find(n => !n.you && p.x > n.l && p.x < n.r && p.y > n.t && p.y < n.b);
                        if (on) { out.push(`"${on.name}" across the route (${arc.id})`); break; }
                    }
                });
                return { count: names.length, out };
            });
            count = Math.max(count, r.count);
            r.out.forEach(c => clash.push(`at stop ${i}, ${c}`));
        }
        const where = `journey map at 1440x900, a visitor in ${zone.split('/')[1]}`;
        if (clash.length) bad(`${where}: ${Array.from(new Set(clash)).join('; ')}`);
        else if (count < 5) bad(`${where}: only ${count} names showing at the delta`);
        else ok(`${where}: all ${count} names at the delta clear of each other, of the frame's edge and of the route`);
        await context.close();
    }

    // You Draw It at phone widths, drawn and revealed: every label, the
    // callout and the legend 11px or more, once the chart is scaled to fit.
    for (const [width, height] of [[390, 844], [320, 700]]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.getElementById('ydi').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForFunction(() => document.querySelector('#ydiSvg .ydi-hit'), null, { timeout: 8000 }).catch(() => null);
        await page.evaluate(() => document.getElementById('ydi').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.focus('#ydiSvg .ydi-hit').catch(() => null);
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        const r = await page.evaluate((min) => {
            const svg = document.getElementById('ydiSvg');
            const s = svg.getBoundingClientRect();
            const scale = s.width / svg.viewBox.baseVal.width;
            const texts = Array.from(svg.querySelectorAll('text'));
            const small = texts.map(t => [t.textContent, parseFloat(getComputedStyle(t).fontSize) * scale]).filter(([, px]) => px < min - 0.05);
            const clipped = texts.filter((t) => { const b = t.getBoundingClientRect(); return b.left < s.left - 1 || b.right > s.right + 1 || b.top < s.top - 1 || b.bottom > s.bottom + 1; }).map(t => t.textContent);
            const legend = document.getElementById('ydiLegend');
            return {
                count: texts.length, callout: !!svg.querySelector('.ydi-callout'),
                small: small.map(([n, px]) => `${n} ${px.toFixed(1)}px`), clipped,
                legend: legend.hidden ? 0 : Math.min(...Array.from(legend.querySelectorAll('.ydi-leg')).map(l => parseFloat(getComputedStyle(l).fontSize)))
            };
        }, LABEL_MIN_PX);
        const where = `You Draw It at ${width}x${height}`;
        if (!r.callout || r.count < 17) bad(`${where}: the chart did not draw and reveal (${r.count} labels)`);
        else if (r.small.length) bad(`${where}: labels under ${LABEL_MIN_PX}px: ${r.small.join(', ')}`);
        else if (r.clipped.length) bad(`${where}: labels cut off at the chart's edge: ${r.clipped.join(', ')}`);
        else if (r.legend < LABEL_MIN_PX) bad(`${where}: the legend is ${r.legend}px`);
        else ok(`${where}: all ${r.count} labels, the callout and the legend ${LABEL_MIN_PX}px or more, none cut off`);
        await context.close();
    }

    // You Draw It's own small print, in both themes: the hint's pill was
    // dark's grey on the light chart (green on it at 1.9:1), and the models
    // already plotted were faded to 2.1:1. axe cannot see either: the hint
    // is aria-hidden and the labels are inside role=img.
    for (const scheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.getElementById('ydi').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForFunction(() => document.querySelector('#ydiSvg .ydi-xlabel.known'), null, { timeout: 8000 }).catch(() => null);
        const c = await page.evaluate(() => {
            const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
            const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
            const over = (fg, bg, a = fg.length > 3 ? fg[3] : 1) => [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a));
            const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
            const chart = rgb(getComputedStyle(document.querySelector('.ydi-chart')).backgroundColor);
            const hint = getComputedStyle(document.getElementById('ydiHint'));
            const known = Array.from(document.querySelectorAll('#ydiSvg .ydi-xlabel.known')).map((t) => {
                const s = getComputedStyle(t);
                return ratio(over(rgb(s.fill), chart, parseFloat(s.opacity)), chart);
            });
            return { light: document.documentElement.classList.contains('light-mode'), hint: ratio(rgb(hint.color), over(rgb(hint.backgroundColor), chart)), known };
        });
        const where = `You Draw It, ${scheme} theme`;
        if (c.light !== (scheme === 'light')) bad(`${where}: the page opened in the other theme`);
        else if (c.hint >= 4.5 && c.known.length && c.known.every(k => k >= 4.5)) ok(`${where}: the hint reads at ${c.hint}:1 and the plotted models' names at ${Math.min(...c.known)}:1`);
        else bad(`${where}: the hint reads at ${c.hint}:1 and the plotted models' names at ${c.known.join(', ') || 'none found'} (want 4.5:1)`);
        await context.close();
    }

    // You Draw It drawn with a finger: one drag across the chart sets every
    // guess. touch-action sat on the SVG <rect> the pointer handlers are on,
    // where Chromium ignores it; the <svg> was 'auto', so the browser took
    // the drag for a scroll and cancelled it after two moves, and one column
    // moved. Touch is sent through DevTools, so Chromium only.
    if (browser.browserType().name() === 'chromium') {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.getElementById('ydi').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForFunction(() => document.querySelector('#ydiSvg .ydi-hit'), null, { timeout: 8000 }).catch(() => null);
        await page.evaluate(() => document.getElementById('ydi').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await page.waitForTimeout(300);
        const box = await page.evaluate(() => {
            const hit = document.querySelector('#ydiSvg .ydi-hit');
            const seen = (window.__ydiTouch = { pointerdown: 0, pointermove: 0, pointerup: 0, pointercancel: 0 });
            Object.keys(seen).forEach((type) => hit.addEventListener(type, () => { seen[type]++; }));
            const dots = Array.from(document.querySelectorAll('#ydiSvg .ydi-guess-dot'));
            window.__ydiBefore = dots.map(d => d.getAttribute('cy'));
            const h = hit.getBoundingClientRect();
            // From the first column to guess (the first dot) to the last.
            return { x0: dots[0].getBoundingClientRect().left + 5, x1: h.right - 2, top: h.top, bottom: h.bottom, n: dots.length };
        });
        const cdp = await context.newCDPSession(page);
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
        const STEPS = 20;
        const yAt = (k) => box.bottom - (box.bottom - box.top) * (0.15 + 0.7 * k / STEPS);   // low to high
        await touch('touchStart', box.x0, yAt(0));
        for (let k = 1; k <= STEPS; k++) await touch('touchMove', box.x0 + (box.x1 - box.x0) * k / STEPS, yAt(k));
        await touch('touchEnd');
        await page.waitForTimeout(200);
        const r = await page.evaluate(() => ({
            events: window.__ydiTouch,
            moved: Array.from(document.querySelectorAll('#ydiSvg .ydi-guess-dot')).map((d, i) => d.getAttribute('cy') !== window.__ydiBefore[i]),
            touchAction: getComputedStyle(document.getElementById('ydiSvg')).touchAction,
            url: location.pathname
        }));
        const still = r.moved.map((m, i) => (m ? null : i + 1)).filter(Boolean);
        if (box.n && !still.length && !r.events.pointercancel && r.events.pointerup === 1) {
            ok(`You Draw It at 390x844 by touch: one drag sets all ${box.n} guesses, no pointercancel (${r.events.pointermove} moves; the chart's touch-action is ${r.touchAction})`);
        } else bad(`You Draw It at 390x844 by touch: guesses ${still.join(', ') || 'none'} of ${box.n} unmoved, events ${JSON.stringify(r.events)}, touch-action ${r.touchAction}, now on ${r.url}`);
        await context.close();
    }
}

// ------------------------------------------------------------------
// In-page links, the theme switch and back to top, as a visitor meets them
// ------------------------------------------------------------------
// What jsdom cannot show: where the next Tab goes after the skip link, what
// Back does after a nav link, and what the one floating button covers on a
// phone's real layout. Reduced motion, so every jump lands at once.
async function exerciseNavigation(browser, origin) {
    console.log('  index.html — links, theme switch, back to top');
    // A dark system: with nothing stored the homepage follows it, and the
    // switch below is pressed from dark to light.
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await desk.newPage();
    await page.goto(`${origin}/index.html`, { waitUntil: 'load' });

    // The skip link, by keyboard: Tab, Enter, Tab.
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement.className);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => {
        const a = document.activeElement;
        const main = document.querySelector('main');
        const r = a.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + Math.min(r.width, 16) / 2, r.top + Math.min(r.height, 16) / 2);
        return { inside: a !== main && main.contains(a), seen: !!hit && (hit === a || a.contains(hit)), what: a.textContent.trim().slice(0, 40) || a.tagName };
    });
    if (first === 'skip-link' && next.inside) ok(`skip link: the next Tab lands inside <main> ("${next.what}")`);
    else bad(`skip link: Tab, Enter, Tab ends on "${next.what}", not inside <main> (first stop: .${first})`);
    if (next.seen) ok('skip link: that stop is in sight, not under the fixed nav bar');
    else bad(`skip link: "${next.what}" has focus but is hidden under the nav bar`);

    // Back after following two nav links.
    await page.click('.nav-menu a[href="#about"]');
    await page.click('.nav-menu a[href="#experience"]');
    await page.goBack();
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement.id }));
    if (back.hash === '#about' && back.focus === 'about') ok('Back after two nav links returns to #about, focus with it');
    else bad(`Back after two nav links: address ${back.hash || 'with no fragment'}, focus on "${back.focus}"`);

    // Back twice more, past the skip link's #main to the entry before any
    // jump: focus goes back to the link that left it, the skip link. It used
    // to stay on the last target, so the next Tab jumped thousands of pixels
    // down from a page back at its top.
    await page.goBack();
    await page.waitForTimeout(300);
    await page.goBack();
    await page.waitForTimeout(300);
    const start = await page.evaluate(() => ({ hash: location.hash, y: Math.round(scrollY), on: document.activeElement.className || document.activeElement.id || document.activeElement.tagName }));
    await page.keyboard.press('Tab');
    const then = await page.evaluate(() => Math.round(scrollY));
    if (start.hash === '' && start.on === 'skip-link' && Math.abs(then - start.y) < 200) ok(`Back to the first entry returns focus to the link that left it (.${start.on}), and the next Tab stays near the top`);
    else bad(`Back to the first entry: address ${start.hash || 'with no fragment'}, focus on "${start.on}", the next Tab scrolled from ${start.y}px to ${then}px`);

    // The theme switch on a phone: in the bar, clear of its neighbours, and
    // working without opening the menu.
    if (!(await page.$('.nav-container > #themeToggle'))) bad('theme switch: no #themeToggle in the nav bar');
    else {
        for (const w of [320, 390]) {
            await page.setViewportSize({ width: w, height: 800 });
            const t = await page.evaluate(() => {
                const b = document.getElementById('themeToggle');
                const r = b.getBoundingClientRect();
                const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                const clear = (sel) => { const o = document.querySelector(sel).getBoundingClientRect(); return r.right <= o.left || r.left >= o.right; };
                return { seen: !!hit && b.contains(hit), clear: r.left >= 0 && r.right <= innerWidth && clear('.nav-logo') && clear('#navToggle') };
            });
            if (t.seen && t.clear) ok(`theme switch: in the bar at ${w}px, clear of the logo and the menu button`);
            else bad(`theme switch at ${w}px: ${t.seen ? 'overlaps the logo or the menu button' : 'not visible'}`);
        }
        await page.click('#themeToggle');
        const flipped = await page.evaluate(() => ({
            light: document.documentElement.classList.contains('light-mode'),
            chrome: document.querySelector('meta[name="theme-color"]').content,
            name: document.getElementById('themeToggle').getAttribute('aria-label')
        }));
        if (flipped.light && flipped.chrome === '#f4f6f0' && flipped.name === 'Switch to dark theme') ok('theme switch: a tap turns the page, the browser chrome and its own name to light');
        else bad(`theme switch: after a tap, light=${flipped.light}, theme-color ${flipped.chrome}, name "${flipped.name}"`);
    }
    await desk.close();

    // A first jump into or past section 05 fetches its module, and the
    // widgets it fills grow above the target. The jump used to land once and
    // leave the target 250-320px down the screen. Where it sits 2.5 s later:
    const landings = [
        [1280, 800, '.nav-menu a[href="#contact"]', 'contact', 'nav link to Contact'],
        [1280, 800, '.play-index a[href="#ydi"]', 'ydi', 'play-index link "draw the AI energy curve"'],
        [390, 844, '.play-index a[href="#ydi"]', 'ydi', 'play-index link "draw the AI energy curve"']
    ];
    for (const [width, height, sel, id, what] of landings) {
        for (const reducedMotion of ['reduce', 'no-preference']) {
            const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
            const pg = await ctx.newPage();
            await pg.goto(`${origin}/index.html`, { waitUntil: 'load' });
            await pg.waitForTimeout(600);
            await pg.evaluate((s) => document.querySelector(s).click(), sel);
            await pg.waitForTimeout(2500);
            const r = await pg.evaluate((i) => ({
                top: Math.round(document.getElementById(i).getBoundingClientRect().top),
                bar: Math.round(document.getElementById('navbar').getBoundingClientRect().bottom),
                loaded: !!(window.mks && window.mks.loaded.interactives)
            }), id);
            const tag = `first jump by the ${what} at ${width}px${reducedMotion === 'reduce' ? ', reduced motion' : ''}`;
            if (Math.abs(r.top - r.bar) <= 4) ok(`${tag}: #${id} lands under the nav bar and stays (${r.top}px, bar ends at ${r.bar}px)`);
            else bad(`${tag}: #${id} sits at ${r.top}px, the nav bar ends at ${r.bar}px (module loaded: ${r.loaded})`);
            await ctx.close();
        }
    }

    // A shared link straight into section 05 lands a task after load, and
    // the module it fetches often arrives within the next frame. The hold
    // skipped the observer's first report as "only the current size", so
    // growth inside that frame was never landed for: /#assay and /#anatomy
    // stopped 250-440px short on about one visit in three, the cache warm
    // from an earlier page. Each is opened a few times. (Anatomy is on
    // carbon-ai.html now; You Draw It is the homepage's section-05 widget.)
    for (const id of ['ydi', 'assay']) {
        const misses = [];
        for (let run = 0; run < 3; run++) {
            const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const warm = await ctx.newPage();
            await warm.goto(`${origin}/index.html#ydi`, { waitUntil: 'load' });
            await warm.waitForTimeout(1500);
            await warm.close();
            const pg = await ctx.newPage();
            await pg.goto(`${origin}/index.html#${id}`, { waitUntil: 'load' });
            await pg.waitForTimeout(3000);
            const r = await pg.evaluate((i) => ({
                top: Math.round(document.getElementById(i).getBoundingClientRect().top),
                bar: Math.round(document.getElementById('navbar').getBoundingClientRect().bottom),
                // A link to the Assay opens its folded box as it lands.
                shut: i === 'assay' && document.getElementById('assayInput').getClientRects().length === 0
            }), id);
            if (Math.abs(r.top - r.bar) > 4) misses.push(`${r.top}px against ${r.bar}px`);
            if (r.shut) misses.push('its box still folded');
            await ctx.close();
        }
        if (misses.length) bad(`shared link /#${id} at 390px: stopped short of the nav bar, or shut (${misses.join(', ')})`);
        else ok(`shared link /#${id} at 390px: lands under the nav bar${id === 'assay' ? ', open' : ''}, 3 of 3 times with the cache warm`);
    }

    // Without script the switch could not switch anything, so it must not show.
    const noScript = await browser.newContext({ viewport: { width: 390, height: 800 }, javaScriptEnabled: false });
    const bare = await noScript.newPage();
    await bare.goto(`${origin}/index.html`, { waitUntil: 'load' });
    if (await bare.isVisible('#themeToggle')) bad('theme switch: shows with JavaScript off, where it cannot work');
    else ok('theme switch: absent with JavaScript off');
    await noScript.close();

    // Back to top on a 390x844 phone: not before one full screen, and never
    // over the controls it floats beside. Each is scrolled across the
    // button's corner (its foot, middle and head on the button's centre),
    // and wherever the two overlap, a tap there must not reach the button.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await phone.newPage();
    await p.goto(`${origin}/index.html`, { waitUntil: 'load' });
    const settle = () => p.waitForTimeout(120);
    const shown = () => p.evaluate(() => document.getElementById('scrollTop').classList.contains('visible'));
    await p.evaluate(() => scrollTo(0, innerHeight - 10));
    await settle();
    const early = await shown();
    await p.evaluate(() => scrollTo(0, innerHeight * 2));
    await settle();
    const later = await shown();
    if (!early && later) ok('back to top: hidden for the first screen, shown after it');
    else bad(`back to top: shown ${early ? 'before' : 'only after'} one full screen (${early}, ${later})`);

    // Everything below loads on the way down first, so nothing moves mid-check.
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(800);
    // The controls in between used to be sat on: the calculator's selects
    // (on carbon-ai.html now), a sample chip, the dossier titles (now the
    // project cards' links), the toolkit's proof links. The experience
    // cards' More buttons are new, and the Assay's open button (its sample
    // chips are folded away until it is pressed).
    const GUARDED = ['.hero-availability', '.hero-cta .btn', '.corelog-more', '#ydiReveal', '.assay-open', '.project-link', '.toolkit-proof',
        '.btn-submit', '.carbon-badge', '.receipt-btn', '.footer-fieldreport a', '.eco-mode-toggle', '.terminal-toggle'];
    const covered = [];
    let passes = 0;
    for (const sel of GUARDED) {
        const n = await p.$$eval(sel, (els) => els.length);
        if (!n) { bad(`back to top: nothing matches ${sel} any more — update the guarded list`); continue; }
        for (let i = 0; i < n; i++) {
            for (const at of [1, 0.5, 0]) {
                await p.evaluate(({ sel, i, at }) => {
                    const r = document.querySelectorAll(sel)[i].getBoundingClientRect();
                    const b = document.getElementById('scrollTop').getBoundingClientRect();
                    scrollTo(0, r.top + scrollY + r.height * at - (b.top + b.height / 2));
                }, { sel, i, at });
                await settle();
                const hit = await p.evaluate(({ sel, i }) => {
                    const r = document.querySelectorAll(sel)[i].getBoundingClientRect();
                    const btn = document.getElementById('scrollTop');
                    const b = btn.getBoundingClientRect();
                    const x1 = Math.max(r.left, b.left), x2 = Math.min(r.right, b.right);
                    const y1 = Math.max(r.top, b.top), y2 = Math.min(r.bottom, b.bottom);
                    if (x2 <= x1 || y2 <= y1) return null;   // not beneath the button here
                    const h = document.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2);
                    return { covered: !!h && btn.contains(h) };
                }, { sel, i });
                if (!hit) continue;
                passes++;
                if (hit.covered) covered.push(`${sel}${n > 1 ? `[${i}]` : ''}`);
            }
        }
    }
    if (covered.length) Array.from(new Set(covered)).forEach((c) => bad(`back to top covers ${c} at 390x844`));
    else ok(`back to top: covers none of the controls it floats past, hero to footer (${passes} crossings checked at 390x844)`);

    // The last screen is where a way back up is most wanted, and nothing
    // there is under the button's corner. The whole footer used to hide it.
    for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
        await p.setViewportSize(size);
        await p.waitForTimeout(300);   // the band is re-cut for the new size
        await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await p.waitForTimeout(300);
        if (await shown()) ok(`back to top: shown at the very bottom of the page at ${size.width}x${size.height}`);
        else bad(`back to top: hidden at the very bottom of the page at ${size.width}x${size.height}`);
    }

    await phone.close();
}

// ------------------------------------------------------------------
// stats.html with figures in it
// ------------------------------------------------------------------
// The page is committed empty until counting starts, so it is drawn here as
// it will look, from fixture totals put through the real fetch-stats.js and
// renderer, and served in place of the committed file. A table's label must
// never split a word to make room for the figures (at 320-390px the tables
// once broke "Sustainable AI" after "Sustainabl" and "Homepage" after
// "Homepag"), and the page must not scroll sideways. Host names may break
// anywhere: they have no spaces to break at.
//
// drawStats(perDay, weeks) is that page, `perDay` visits a day for `weeks`
// whole weeks; checkLengths holds the page's length budget to it drawn full.
function drawStats(perDay, weeks) {
    const fetchStats = require('./fetch-stats.js');
    const { renderStats } = require('./build-content.js');
    const { lenses, projects } = require('./lib/content.js').loadAll();
    const known = fetchStats.knownNames();
    const today = '2026-10-05';                        // a Monday
    const sections = ['journey', 'about', 'experience', 'projects', 'skills', 'contact'].concat(projects.caseStudies.map(c => c.id));
    const rows = [];
    const n = f => Math.max(1, Math.round(perDay * f));
    const others = ['case-studies', 'research', 'carbon-ai', 'field-report', 'stats', '404'];
    for (let d = fetchStats.addDays(today, -7 * weeks); d < today; d = fetchStats.addDays(d, 1)) {
        rows.push([d, 'visits', '', perDay], [d, 'kb', '', perDay * 260]);
        others.forEach(p => rows.push([d, 'page', p, n(0.06)]));
        rows.push([d, 'page', 'index', perDay - others.length * n(0.06)]);
        rows.push([d, 'vp', 's', n(0.4)], [d, 'vp', 'm', n(0.1)], [d, 'vp', 'l', perDay - n(0.4) - n(0.1)]);
        known.lenses.forEach(l => rows.push([d, 'lens', l, n(0.1)]));
        known.features.forEach(f => rows.push([d, 'feature', f, n(0.05)]));
        sections.forEach(id => rows.push([d, 'deepest', id, n(0.05)]));
        rows.push([d, 'ref', 'www.linkedin.com', n(0.1)]);
        for (let h = 0; h < 16; h++) rows.push([d, 'ref', `referring-site-${h}.example-company.com`, n(0.02)]);
    }
    const stats = fetchStats.transform(fetchStats.cleanRows(rows, known, today).rows, { today, known });
    return renderStats({ stats, lenses });
}

async function exerciseStatsPage(browser, origin) {
    const draw = drawStats;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    for (const [label, html] of [['a modest five weeks', draw(20, 5)], ['a busy quarter, five-figure totals', draw(500, 12)]]) {
        await context.unroute('**/stats.html');
        await context.route('**/stats.html', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
        const trouble = [];
        for (const width of [320, 360, 375, 390, 414, 430, 1440]) {
            await page.setViewportSize({ width, height: 844 });
            await page.goto(`${origin}/stats.html`, { waitUntil: 'load' });
            await page.evaluate(() => document.fonts.ready);
            const found = await page.evaluate(() => {
                const split = [];
                const range = document.createRange();
                document.querySelectorAll('.st-table th, .st-table td').forEach((cell) => {
                    const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
                    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
                        if (node.parentElement.closest('.st-host')) continue;
                        const text = node.textContent;
                        let top = null;
                        for (let i = 0; i < text.length; i++) {
                            range.setStart(node, i);
                            range.setEnd(node, i + 1);
                            const r = range.getClientRects()[0];
                            if (!r) continue;
                            if (top !== null && r.top > top + 2 && /[\p{L}\p{N}]/u.test(text[i]) && /[\p{L}\p{N}]/u.test(text[i - 1])) {
                                split.push(`"${text.trim()}" after "${text.slice(0, i).trim()}"`);
                            }
                            top = r.top;
                        }
                    }
                });
                return { split, wide: document.documentElement.scrollWidth > innerWidth };
            });
            if (found.split.length) trouble.push(`${width}px: ${found.split.slice(0, 4).join('; ')}`);
            if (found.wide) trouble.push(`${width}px: the page scrolls sideways`);
        }
        if (trouble.length) trouble.forEach(t => bad(`stats.html full (${label}) — ${t}`));
        else ok(`stats.html full (${label}): no table splits a word, and nothing scrolls sideways, 320-430px and 1440px`);
    }
    if (errors.length) errors.forEach(e => bad(`stats.html full: uncaught ${e}`));
    await context.close();
}

// ------------------------------------------------------------------
// The shorter sections: experience as short cards, the Assay under the
// form behind one button
// ------------------------------------------------------------------
// The experience log was 5.3 screens on a 390px phone and 2.6 on a
// desktop. Each role is now its dates, title, organisation and first line,
// the rest a press away, at every width; a desktop keeps the core log's
// depths and draws a shut card as one row. The contact form comes first in
// #contact, the Assay under it, its box behind a button that says what it
// does. body's overflow-x:hidden hides a card that runs off the side, so the
// cards themselves are measured. Reduced motion throughout: nothing either
// disclosure shows may wait on a transition.
async function exerciseSections(browser, origin) {
    console.log('  index.html — experience as short cards, the Assay under the form');
    for (const [width, height] of [[320, 700], [390, 844], [1280, 800]]) {
        const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        const page = await ctx.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.getElementById('experience').scrollIntoView());
        await page.waitForTimeout(400);
        const look = () => page.evaluate(() => {
            const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
            const cards = Array.from(document.querySelectorAll('#experience .timeline-content'));
            const small = [];
            cards.forEach(c => c.querySelectorAll('h3, h4, .timeline-date, li, .corelog-more').forEach((el) => {
                if (shown(el) && parseFloat(getComputedStyle(el).fontSize) < 12) small.push(`"${el.textContent.trim().slice(0, 24)}"`);
            }));
            // The button sits in the card's top right corner, on the dates'
            // line: over nothing, and inside its card.
            const hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
            const clash = cards.filter((c) => {
                const btn = c.querySelector('.corelog-more');
                if (!shown(btn)) return false;
                const b = btn.getBoundingClientRect();
                const card = c.getBoundingClientRect();
                const inside = b.left >= card.left && b.right <= card.right && b.top >= card.top && b.bottom <= card.bottom;
                const over = Array.from(c.querySelectorAll('.timeline-date, h3, h4, .partner, li')).filter(shown).some((el) => {
                    const r = document.createRange();
                    r.selectNodeContents(el);
                    return Array.from(r.getClientRects()).some(t => hit(t, b));
                });
                return !inside || over;
            }).map(c => c.querySelector('h3').textContent.trim().slice(0, 24));
            return {
                n: cards.length,
                heads: cards.every(c => ['h3', 'h4', '.timeline-date', 'li'].every(s => shown(c.querySelector(s)))),
                folded: cards.reduce((n, c) => n + Array.from(c.querySelectorAll('li')).filter(li => !shown(li)).length, 0),
                tags: cards.filter(c => shown(c.querySelector('.tags'))).length,
                buttons: cards.filter(c => shown(c.querySelector('.corelog-more'))).length,
                depths: Array.from(document.querySelectorAll('#experience .corelog-depth')).filter(shown).length,
                off: cards.filter(c => c.getBoundingClientRect().right > innerWidth + 0.5 || c.getBoundingClientRect().left < -0.5).length,
                screens: +(document.getElementById('experience').getBoundingClientRect().height / innerHeight).toFixed(2),
                small,
                clash
            };
        });
        const x = await look();
        const tag = `experience at ${width}px`;
        if (x.off || x.small.length) bad(`${tag}: ${x.off} card(s) run off the screen; text under 12px: ${x.small.join(', ') || 'none'}`);
        else ok(`${tag}: every card on screen, no text under 12px`);
        if (x.heads && x.folded > 0 && x.tags === 0 && x.buttons === x.n) ok(`${tag}: ${x.n} short cards — dates, role, organisation and one line each, ${x.folded} lines and the tags a press away (${x.screens} screens)`);
        else bad(`${tag}: not short cards (every head and first line shown ${x.heads}, lines folded ${x.folded}, tags shown ${x.tags}, More buttons ${x.buttons} of ${x.n})`);
        if (x.clash.length) bad(`${tag}: a More button sits over its card's text or outside it (${x.clash.join(', ')})`);
        else ok(`${tag}: each More button in its card's corner, over none of its text`);
        if (width < 600 ? x.depths === 0 : x.depths === x.n) ok(`${tag}: ${width < 600 ? 'the depth column gives its width to the text' : 'the core log keeps its depths'}`);
        else bad(`${tag}: ${x.depths} depth labels shown`);
        const ceiling = { 390: 2.5, 1280: 1.6 }[width];
        if (ceiling && x.screens > ceiling) bad(`${tag}: ${x.screens} screens tall; short cards should keep it under ${ceiling} (5.3 and 2.6 as the full log)`);
        // One card opened and closed again, by its button.
        await page.click('#experience .corelog-more');
        const open = await page.evaluate(() => {
            const card = document.querySelector('#experience .timeline-content');
            const btn = card.querySelector('.corelog-more');
            return { all: Array.from(card.querySelectorAll('li, .tags')).every(el => el.getClientRects().length > 0), expanded: btn.getAttribute('aria-expanded'), name: btn.textContent };
        });
        await page.click('#experience .corelog-more');
        const shut = await page.evaluate(() => document.querySelector('#experience .corelog-more').getAttribute('aria-expanded'));
        if (open.all && open.expanded === 'true' && shut === 'false' && /Researcher/.test(open.name)) ok(`${tag}: "More" opens the whole card and "Less" folds it (named "${open.name.trim()}")`);
        else bad(`${tag}: More showed the whole card ${open.all}, aria-expanded ${open.expanded} then ${shut}, name "${open.name}"`);

        // The contact form first, the Assay under it.
        const c = await page.evaluate(() => {
            const form = document.getElementById('contactForm');
            const assay = document.getElementById('assay');
            const first = document.querySelector('#contact input, #contact textarea');
            return {
                after: !!(form.compareDocumentPosition(assay) & Node.DOCUMENT_POSITION_FOLLOWING) && !!assay.closest('#contact'),
                below: assay.getBoundingClientRect().top >= form.getBoundingClientRect().bottom,
                first: !!first && first.closest('form') === form
            };
        });
        if (c.after && c.below && c.first) ok(`contact at ${width}px: the form comes first, the Assay below it`);
        else bad(`contact at ${width}px: the Assay after the form ${c.after}, below it ${c.below}, the form's fields first ${c.first}`);

        // The Assay's question and promise in view, its box a button away:
        // opened and shut by pointer and by keyboard, shown at once.
        const assay = () => page.evaluate(() => {
            const btn = document.querySelector('#assay .assay-open');
            const box = document.getElementById('assayInput');
            const head = document.querySelector('#assay .assay-lede');
            return {
                name: btn ? btn.textContent.trim() : null,
                expanded: btn && btn.getAttribute('aria-expanded'),
                box: !!box && box.getClientRects().length > 0 && getComputedStyle(box).visibility !== 'hidden',
                promise: !!head && head.getClientRects().length > 0 && /never leaves this page/.test(head.textContent)
            };
        });
        const shutAt = await assay();
        await page.click('#assay .assay-open');
        const opened = await assay();
        await page.focus('#assay .assay-open');
        await page.keyboard.press('Enter');
        const byEnter = await assay();
        await page.keyboard.press('Space');
        const bySpace = await assay();
        const at = `the Assay at ${width}px`;
        if (shutAt.name === 'Grade a job description' && shutAt.expanded === 'false' && !shutAt.box && shutAt.promise) ok(`${at}: its question and promise in view, its box behind "${shutAt.name}"`);
        else bad(`${at}: on arrival the button is "${shutAt.name}" (aria-expanded ${shutAt.expanded}), the box shown ${shutAt.box}, the promise shown ${shutAt.promise}`);
        if (opened.box && opened.expanded === 'true' && !byEnter.box && byEnter.expanded === 'false' && bySpace.box && bySpace.expanded === 'true') ok(`${at}: a press opens it at once, and Enter and Space fold and open it again`);
        else bad(`${at}: pressed ${opened.box}/${opened.expanded}, Enter ${byEnter.box}/${byEnter.expanded}, Space ${bySpace.box}/${bySpace.expanded}`);
        await ctx.close();
    }
}

// ------------------------------------------------------------------
// The homepage's on-demand features, each used once
// ------------------------------------------------------------------
async function exerciseHomepage(page, r, origin) {
    const loadedNow = () => page.evaluate(() => Object.assign({}, window.mks.loaded));

    const before = await loadedNow();
    ['interactives', 'terminal', 'dispatch'].forEach((m) => {
        if (before[m]) bad(`module "${m}" loaded on arrival — it should wait to be needed`);
    });
    if (!Object.values(before).some(Boolean)) ok('no on-demand module loaded on arrival');

    // A scroll fetches the journey map.
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(800);
    const mapSvg = await page.$('#journeyMapFrame svg');
    if (mapSvg) ok(`journey map arrived on first scroll${r.measured ? ` (+${fmt(r.bytesSince())})` : ''}`); else bad('journey map did not load after scrolling');

    // The manifest lists no recording, so the listen control is there only
    // if this browser has a speech voice. Headless Chromium has none; a
    // branded Chrome may. Either way it must not offer a button that says
    // nothing. (It is exercised with a stand-in voice in exerciseNarration.)
    const listening = await page.evaluate(() => {
        const wrap = document.getElementById('navListen');
        const voices = window.speechSynthesis ? (window.speechSynthesis.getVoices() || []).length : 0;
        return { state: wrap ? (wrap.hidden ? 'hidden' : 'shown') : 'missing', voices };
    });
    if (listening.state === (listening.voices ? 'shown' : 'hidden')) {
        ok(listening.voices
            ? `listen control shown: this browser has ${listening.voices} speech voice(s)`
            : 'no voice and no recording: the listen control stays hidden');
    } else bad(`listen control is ${listening.state} in a browser with ${listening.voices} speech voice(s) and no recording`);

    // The projects are six cards now, and the games live on the case
    // studies: reading past them fetches no game, and each card leads out.
    await page.evaluate(() => document.getElementById('projects').scrollIntoView());
    await page.waitForTimeout(600);
    const cards = await page.evaluate(() => ({
        n: document.querySelectorAll('#projects .project-card').length,
        out: Array.from(document.querySelectorAll('#projects .project-link')).every(a => /^case-studies\.html#[a-z-]+$/.test(a.getAttribute('href'))),
        games: performance.getEntriesByType('resource').filter(e => /modules\/dossier\./.test(e.name)).length + (window.mks.loaded.dossier ? 1 : 0)
    }));
    if (cards.n === 6 && cards.out) ok('six project cards, each linking to its case study'); else bad(`project cards: ${cards.n}, each linking out: ${cards.out}`);
    if (!cards.games) ok('reading past the projects fetches no game: they live on the case studies'); else bad('the homepage fetched the case studies\' games');

    // Section 05 coming into range fetches the interactives.
    await page.evaluate(() => document.getElementById('ecoprompt').scrollIntoView());
    await page.waitForFunction(() => window.mks.loaded.interactives, null, { timeout: 5000 }).catch(() => null);
    const li = await loadedNow();
    if (li.interactives) ok('interactives loaded as section 05 came into range'); else bad('interactives did not load near section 05');
    const dots = await page.$$eval('#ydiSvg .ydi-guess-dot', (d) => d.length);
    if (dots > 0) ok(`"AI, Weighed": You Draw It drawn (${dots} points to guess)`); else bad('"AI, Weighed": You Draw It is empty');

    // The backtick opens the terminal.
    await page.keyboard.press('`');
    await page.waitForFunction(() => window.mks.loaded.terminal, null, { timeout: 5000 }).catch(() => null);
    const lt = await loadedNow();
    if (lt.terminal) ok('terminal loaded on the backtick'); else bad('terminal did not load on the backtick');
    const open = await page.$('.field-terminal.open');
    if (open) ok('the terminal opened'); else bad('terminal did not open');
    await page.keyboard.press('Escape');

    if (r.errors.length) r.errors.forEach(e => bad(e)); else ok('still no errors after using every feature');
    if (r.measured) ok(`using every feature above fetched ${fmt(r.bytesSince())} more — modules, the map, and every image scrolled past`);
}

// ------------------------------------------------------------------
// The spoken page: one listen control, docked in the nav
// ------------------------------------------------------------------
// Headless Chromium has no speech voice, and the player rightly will not
// offer to read with none, so these pages get a stand-in engine that
// accepts every utterance and never finishes one: the player stays open to
// be measured. What is checked is what a listener would meet:
//
//   - exactly one control, on screen at every width, without the menu
//   - pressing it reads with the browser voice and fetches no audio at all
//   - the open player is small on a phone (it used to cover ~45% of one)
//     and never sits over the contact form's button
//   - Moses's recorded introduction, once the manifest lists it, is offered
//     with its weight and fetched only when pressed
const STAND_IN_VOICE = () => {
    const spoken = (window.__spoken = []);
    const synth = {
        getVoices: () => [{ name: 'Smoke', lang: 'en-GB', localService: true, default: true, voiceURI: 'smoke' }],
        speak(u) { spoken.push(u.text); },
        cancel() {}, pause() {}, resume() {},
        get speaking() { return spoken.length > 0; }, get paused() { return false; }, get pending() { return false; },
        addEventListener() {}, removeEventListener() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
};

// Silent MPEG-1 Layer III frames (mono, 64 kbps, 44.1 kHz): a real,
// decodable MP3 of about five seconds, standing in for Moses's take.
const silentMp3 = () => {
    const frame = Buffer.alloc(208);
    frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x50; frame[3] = 0xc4;
    return Buffer.concat(Array.from({ length: 192 }, () => frame));
};

// The opposite: a speech engine with no voices, as headless Chromium and
// Linux builds without speech-dispatcher have — made certain here, since a
// branded Chrome may bring voices of its own.
const NO_VOICE = () => {
    const synth = {
        getVoices: () => [], speak() {}, cancel() {}, pause() {}, resume() {},
        speaking: false, paused: false, pending: false, addEventListener() {}, removeEventListener() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
};

// Voices that turn up after the first paint, as Chrome's routinely do: none
// until voiceschanged, 1.2 s after load.
const LATE_VOICE = () => {
    const heard = [];
    let voices = [];
    const synth = {
        getVoices: () => voices, speak() {}, cancel() {}, pause() {}, resume() {},
        speaking: false, paused: false, pending: false,
        addEventListener(type, fn) { if (type === 'voiceschanged') heard.push(fn); }, removeEventListener() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
    window.addEventListener('load', () => setTimeout(() => {
        voices = [{ name: 'Late', lang: 'en-GB', localService: true, default: true, voiceURI: 'late' }];
        heard.forEach((fn) => fn(new Event('voiceschanged')));
    }, 1200));
};

// Where each thing in the nav bar sits: what must not move when Listen shows.
const barPlaces = (page) => page.evaluate(() => ['.nav-logo', '#themeToggle', '#navToggle', '.nav-menu .nav-link', '.nav-menu .contact-btn'].map((sel) => {
    const el = document.querySelector(sel);
    const r = el && getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null;
    return `${sel} ${r && r.width ? Math.round(r.left) : '-'}`;
}).join(', '));

const PLAYER_CEILING = 0.20;   // share of a 390×844 viewport the open player may cover

async function exerciseNarration(browser, origin) {
    console.log('  narration (a stand-in speech voice)');
    const errors = [];
    const watch = (page) => {
        page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
        page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
    };
    const coverage = (page) => page.evaluate(() => {
        const r = document.getElementById('dispatchBar').getBoundingClientRect();
        return (r.width * r.height) / (innerWidth * innerHeight);
    });

    // --- the browser voice ------------------------------------------------
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.addInitScript(STAND_IN_VOICE);
        const page = await context.newPage();
        watch(page);
        const audio = [];
        page.on('request', (req) => { if (req.resourceType() === 'media' || /\.(mp3|wav|ogg|opus|m4a)(\?|$)/.test(req.url())) audio.push(req.url()); });
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });

        const count = await page.$$eval('.listen-btn', (els) => els.length);
        if (count === 1) ok('exactly one listen control on the page'); else bad(`${count} listen controls — there should be one`);

        // On screen at every width, inside the bar, and clear of the logo,
        // the theme switch and the menu button. The tightest width is the
        // first with the full menu, so that one is found and checked too:
        // the bar used to run 14px past its edge there.
        const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const fullMenu = async (w) => {
            await page.setViewportSize({ width: w, height: 844 });
            await settle();
            return page.evaluate(() => getComputedStyle(document.getElementById('navToggle')).display === 'none');
        };
        let lo = 600, hi = 1920;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await fullMenu(mid)) hi = mid; else lo = mid; }
        const off = [];
        for (const w of new Set([320, 360, 390, 430, 768, lo, hi].concat(Array.from({ length: 52 }, (_, i) => 900 + i * 20)))) {
            await page.setViewportSize({ width: w, height: 844 });
            // Two frames, so anything the breakpoint change set moving has settled.
            await settle();
            const r = await page.evaluate(() => {
                const box = (el) => (el && getComputedStyle(el).display !== 'none' ? el.getBoundingClientRect() : null);
                const b = box(document.getElementById('listenBtn'));
                if (!b || !b.width) return 'not shown';
                const hit = (o) => o && o.width && !(o.right <= b.left || o.left >= b.right || o.bottom <= b.top || o.top >= b.bottom);
                if (b.left < 0 || b.right > innerWidth) return 'off screen';
                const bar = document.querySelector('.nav-container');
                const edge = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
                if (b.right > edge + 0.5) return `${Math.round(b.right - edge)}px past the bar's edge`;
                if (hit(box(document.querySelector('.nav-logo'))) || hit(box(document.getElementById('navToggle')))) return 'overlapping the logo or menu button';
                if (hit(box(document.getElementById('themeToggle')))) return 'overlapping the theme switch';
                const last = box(document.querySelector('.nav-menu .contact-btn'));
                if (getComputedStyle(document.getElementById('navToggle')).display === 'none' && hit(last)) return 'overlapping Contact';
                // It sits first in the right-hand group, so what it costs shows at the far end.
                const end = getComputedStyle(document.getElementById('navToggle')).display === 'none' ? last : box(document.getElementById('navToggle'));
                if (end && end.right > edge + 0.5) return `pushing ${end === last ? 'Contact' : 'the menu button'} ${Math.round(end.right - edge)}px past the bar's edge`;
                return null;
            });
            if (r) off.push(`${w}px: ${r}`);
        }
        if (off.length) off.forEach((o) => bad(`listen control ${o}`));
        else ok('listen control visible in the nav at every width, 320–1920px, without opening the menu');

        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => document.getElementById('about').scrollIntoView({ behavior: 'instant' }));
        await page.click('#listenBtn');
        const opened = await page.waitForFunction(() => window.mks.loaded.dispatch &&
            !document.getElementById('dispatchBar').hidden, null, { timeout: 5000 }).then(() => true, () => false);
        if (!opened) { bad('pressing Listen did not open the player'); await context.close(); return; }

        const st = await page.evaluate(() => ({
            playing: window.mks.narration.state().playing,
            spoke: window.__spoken.length,
            weight: document.querySelector('.dispatch-weight').textContent,
            styled: getComputedStyle(document.getElementById('dispatchBar')).position,
            expanded: document.getElementById('listenBtn').getAttribute('aria-expanded')
        }));
        if (st.playing === 'about' && st.spoke > 0) ok('Listen reads the section in view with the browser voice');
        else bad(`Listen should read the section in view (#about) — got ${st.playing}, ${st.spoke} utterances`);
        if (!audio.length && /0 KB transferred/.test(st.weight)) ok(`the browser voice fetched no audio — "${st.weight}"`);
        else bad(`the browser voice fetched audio: ${audio.join(', ') || st.weight}`);
        if (st.styled === 'absolute') ok('the player\'s stylesheet arrived with it'); else bad('the player is unstyled — modules/dispatch.css did not load');
        if (st.expanded === 'true') ok('the control reports the player open'); else bad('aria-expanded did not follow the player');

        const share = await coverage(page);
        if (share <= PLAYER_CEILING) ok(`open player covers ${(share * 100).toFixed(1)}% of a 390×844 screen (ceiling ${PLAYER_CEILING * 100}%)`);
        else bad(`open player covers ${(share * 100).toFixed(1)}% of a 390×844 screen — ceiling ${PLAYER_CEILING * 100}%`);

        // The contact form's button, reached the way a reader reaches it.
        const covered = [];
        for (const block of ['end', 'center']) {
            const r = await page.evaluate((b) => {
                const submit = document.querySelector('#contactForm [type="submit"]');
                submit.scrollIntoView({ block: b, behavior: 'instant' });
                const s = submit.getBoundingClientRect();
                const p = document.getElementById('dispatchBar').getBoundingClientRect();
                return !(p.bottom <= s.top || p.top >= s.bottom || p.right <= s.left || p.left >= s.right);
            }, block);
            if (r) covered.push(block);
        }
        if (covered.length) bad(`the open player covers the contact form's submit button (scrolled to ${covered.join(', ')})`);
        else ok('the open player never sits over the contact form\'s submit button');

        // A nav link followed with the player open lands its heading below
        // the player: style.css pads jumps for the nav bar alone.
        // Where it settles: the sections it passes swap their estimated
        // heights for real ones, and script.js re-aims the jump as they do
        // (Firefox was still moving at 400 ms, with the heading at 21px).
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => document.querySelector('.nav-menu a[href="#experience"]').click());
        const landed = await page.evaluate(() => new Promise((resolve) => {
            const at = () => ({
                heading: Math.round(document.querySelector('#experience .section-title').getBoundingClientRect().top),
                player: Math.round(document.getElementById('dispatchBar').getBoundingClientRect().bottom)
            });
            let last = at();
            let still = 0;
            const started = performance.now();
            const poll = () => {
                const now = at();
                still = now.heading === last.heading ? still + 1 : 0;
                last = now;
                if (still >= 3 || performance.now() - started > 5000) resolve(now);
                else setTimeout(poll, 100);
            };
            setTimeout(poll, 100);
        }));
        if (landed.heading >= landed.player) ok(`a nav jump with the player open lands its heading below it (${landed.heading}px, player ends at ${landed.player}px)`);
        else bad(`a nav jump with the player open hides its heading under the player (${landed.heading}px, player ends at ${landed.player}px)`);
        await page.emulateMedia({ reducedMotion: null });

        // The keyboard: the player is next in Tab order, and Escape hands
        // focus back to the control.
        await page.focus('#listenBtn');
        await page.keyboard.press('Tab');
        const into = await page.evaluate(() => document.activeElement && document.activeElement.className);
        await page.keyboard.press('Escape');
        const back = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id, hidden: document.getElementById('dispatchBar').hidden }));
        if (/dispatch-play/.test(into || '') && back.hidden && back.id === 'listenBtn') ok('Tab goes from Listen into the player; Escape closes it and returns focus');
        else bad(`keyboard: Tab reached "${into}", Escape left focus on #${back.id} (player hidden: ${back.hidden})`);

        await context.close();
    }

    // --- Moses's recorded introduction ------------------------------------
    // Served in place of the real manifest, as if he had run voice:intro.
    const mp3 = silentMp3();
    const manifest = { tracks: { intro: {
        file: 'assets/audio/intro.mp3', bytes: mp3.length, grams: 0.013, seconds: 5, voiceKind: 'recorded', voiceTitle: 'Moses Kolleh Sesay'
    } } };
    const withIntro = async (voice, latency = 0) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.addInitScript(voice ? STAND_IN_VOICE : NO_VOICE);
        const hits = [];
        await context.route('**/assets/audio/voice-manifest.json', async (route) => {
            if (latency) await new Promise((r) => setTimeout(r, latency));
            route.fulfill({ json: manifest });
        });
        await context.route('**/assets/audio/intro.mp3', (route) => { hits.push(route.request().url()); route.fulfill({ contentType: 'audio/mpeg', body: mp3 }); });
        const page = await context.newPage();
        watch(page);
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        return { context, page, hits };
    };

    {
        const { context, page, hits } = await withIntro(true);
        await page.click('#listenBtn');
        const offered = await page.waitForFunction(() => {
            const o = document.querySelector('.dispatch-offer');
            return o && !o.hidden && document.querySelector('.dispatch-intro').textContent;
        }, null, { timeout: 5000 }).then((h) => h.jsonValue(), () => null);
        const kb = Math.round(mp3.length / 1024);
        if (offered === `Hear Moses introduce himself · ${kb} KB`) ok(`the player offers "${offered}"`);
        else bad(`with an intro in the manifest, the offer read "${offered}"`);

        const share = await coverage(page);
        if (share <= PLAYER_CEILING) ok(`…and with the offer showing, still covers only ${(share * 100).toFixed(1)}% of the screen`);
        else bad(`with the intro offer, the player covers ${(share * 100).toFixed(1)}% — ceiling ${PLAYER_CEILING * 100}%`);

        if (hits.length === 0) ok('the recording is not fetched before it is asked for');
        else bad(`the recording was fetched before anyone asked (${hits.length} requests)`);
        await page.click('.dispatch-intro');
        const fetched = await page.waitForFunction(() => window.mks.narration.state().playing === 'intro', null, { timeout: 5000 })
            .then(() => page.waitForTimeout(500)).then(() => hits.length > 0, () => false);
        if (fetched) ok('pressing it fetches assets/audio/intro.mp3 and plays Moses');
        else bad('pressing the offer did not fetch the recording');
        await context.close();
    }

    // No voice at all, but a recording: the control appears for him alone.
    // Then pressed by keyboard, with the manifest slow to answer the player:
    // the player used to hide the control while it waited, focus and all.
    {
        const { context, page, hits } = await withIntro(false, 300);
        const before = await barPlaces(page);
        const shown = await page.waitForFunction(() => !document.getElementById('navListen').hidden, null, { timeout: 6000 })
            .then(() => true, () => false);
        if (shown && hits.length === 0) ok('no voice but a recording: the control appears (and still fetches nothing)');
        else bad(`no voice but a recording: the control ${shown ? 'appeared but fetched audio early' : 'never appeared'}`);
        const after = await barPlaces(page);
        if (before === after) ok('no voice but a recording: the control appears 1.5 s after load, and nothing else in the bar moves');
        else bad(`no voice but a recording: the bar moved when the control appeared (${before} → ${after})`);
        if (shown) {
            await page.evaluate(() => {
                window.__listenHidden = 0;
                new MutationObserver(() => { if (document.getElementById('navListen').hidden) window.__listenHidden++; })
                    .observe(document.getElementById('navListen'), { attributes: true, attributeFilter: ['hidden'] });
            });
            await page.focus('#listenBtn');
            await page.keyboard.press('Enter');
            const played = await page.waitForFunction(() => window.mks.narration && window.mks.narration.state().playing === 'intro', null, { timeout: 5000 })
                .then(() => page.waitForTimeout(500)).then(() => true, () => false);
            const after = await page.evaluate(() => ({
                focus: document.activeElement === document.getElementById('listenBtn') || document.getElementById('dispatchBar').contains(document.activeElement),
                on: document.activeElement.id || document.activeElement.tagName,
                blinked: window.__listenHidden
            }));
            if (played && after.focus && !after.blinked) ok('no voice but a recording: Enter on Listen plays him, and the control and focus stay put');
            else bad(`no voice but a recording, Enter on Listen: playing ${played}, focus on ${after.on}, the control hid ${after.blinked} time(s)`);
        }
        await context.close();
    }

    // --- Listen shows late, and nothing else in the bar moves -----------------
    // It used to be the last thing in the bar: shown when the voices came,
    // it pushed the theme switch and the menu button 56px left and took the
    // menu button's spot, so a tap meant for the menu opened the player.
    for (const width of [390, 1440]) {
        const context = await browser.newContext({ viewport: { width, height: 844 } });
        await context.addInitScript(LATE_VOICE);
        const page = await context.newPage();
        watch(page);
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        const before = await barPlaces(page);
        const hidden = await page.evaluate(() => document.getElementById('navListen').hidden);
        const shown = await page.waitForFunction(() => !document.getElementById('navListen').hidden, null, { timeout: 5000 }).then(() => true, () => false);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const after = await barPlaces(page);
        if (!hidden || !shown) bad(`late voices at ${width}px: the control was ${hidden ? 'never shown' : 'shown before any voice'}`);
        else if (before === after) ok(`late voices at ${width}px: Listen appears and nothing else in the bar moves`);
        else bad(`late voices at ${width}px: the bar moved when Listen appeared (${before} → ${after})`);
        await context.close();
    }

    if (errors.length) errors.forEach((e) => bad(e)); else ok('no console errors, no uncaught exceptions');
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
    // could make do anything. A form's submit button works without one.
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
                .filter(el => shown(el) && !(el.type === 'submit' && el.form))
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

    // (a) JavaScript disabled, every page — and the homepage at phone and
    // tablet width too, where the menu button is.
    const offline = PAGES.map(p => [p, { width: 1280, height: 800 }])
        .concat([['index.html', { width: 390, height: 844 }], ['index.html', { width: 1024, height: 768 }]]);
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
        // Nor copy on show that points at what JavaScript would have drawn:
        // the journey map, carbon-ai's ledger or Anatomy's diagram, a click
        // to open dossiers that are open already, a live widget.
        const pointing = await page.evaluate(() => (document.body.innerText.match(/Watch the route unfold|the ledger below|click any one to open|the live widget on this page|watch Scope 2 fall/gi) || []));
        if (pointing.length) bad(`${label}: copy on show points at what needs JavaScript: ${pointing.join(', ')}`);

        if (rel === 'index.html') {
            // The menu button only script.js can work, so without it every nav
            // link has to be on show at every width. Below 1280px there used
            // to be none, and research.html had no other link on the page.
            const nav = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('#navMenu a'));
                const seen = links.filter((a) => {
                    const r = a.getBoundingClientRect();
                    return r.width > 0 && r.left >= 0 && r.right <= innerWidth && getComputedStyle(a).visibility === 'visible';
                });
                return { seen: seen.length, of: links.length, research: seen.some(a => a.getAttribute('href') === 'research.html') };
            });
            if (nav.of && nav.seen === nav.of && nav.research) ok(`${label}: all ${nav.of} nav links on show, Research included`);
            else bad(`${label}: ${nav.seen} of ${nav.of} nav links on show${nav.research ? '' : ', Research not among them'}`);

            // No control on show says "collapsed" over content it cannot hide.
            const closed = await page.evaluate(() => Array.from(document.querySelectorAll('[aria-expanded="false"]'))
                .filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden')
                .map(el => el.textContent.trim().slice(0, 30) || el.id));
            if (closed.length) bad(`${label}: controls announced as collapsed with nothing to expand: ${closed.join(', ')}`);
            else ok(`${label}: no control on show is announced as collapsed`);

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

    // (b2) The same on carbon-ai.html: its calculator's script blocked brings
    // back the note that stands in for it, not blank selects and dashes.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.route('**/carbon-ai.js', (route) => route.abort());
        const page = await context.newPage();
        await page.goto(`${origin}/carbon-ai.html`, { waitUntil: 'load' });
        const r = await page.evaluate(() => ({
            note: !!document.querySelector('.nojs-note') && getComputedStyle(document.querySelector('.nojs-note')).display !== 'none',
            grid: !!document.querySelector('.ca-grid') && getComputedStyle(document.querySelector('.ca-grid')).display !== 'none'
        }));
        if (r.note && !r.grid) ok('carbon-ai.html, carbon-ai.js blocked: the note is shown in place of an empty calculator');
        else bad(`carbon-ai.html, carbon-ai.js blocked: note shown ${r.note}, empty calculator shown ${r.grid}`);
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

        // A reader in the project cards by then: what they are reading. (The
        // six dossiers there used to fold shut under them when the mark went
        // back; the cards have nothing to fold.)
        const reading = () => page.evaluate(() => {
            const line = window.__line || (window.__line = document.elementFromPoint(innerWidth / 2, innerHeight / 3));
            return {
                top: Math.round(line.getBoundingClientRect().top),
                what: line.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)
            };
        });
        await page.evaluate(() => {
            const d = document.querySelectorAll('#projects .project-card')[4];
            scrollTo({ top: d.getBoundingClientRect().top + scrollY + 150, behavior: 'instant' });
        });
        await page.waitForTimeout(200);
        const seen = await reading();

        const tookOver = await page.waitForFunction(() => (window.mks || {}).ready === true, null, { timeout: 10000 }).then(() => true, () => false);
        await page.waitForTimeout(1200);   // the modules arrive and fill in
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
        const now = await reading();
        if (Math.abs(now.top - seen.top) <= 4) ok(`index.html, script.js late — the line being read stays put ("${seen.what}" at ${seen.top}px, then ${now.top}px)`);
        else bad(`index.html, script.js late — the line being read ("${seen.what}") moved from ${seen.top}px to ${now.top}px`);
        await context.close();
    }

    // (c2) The same, with no scroll anchoring, as in Safari, and the reader
    // further down: in the project cards, and in Skills, below all of
    // section 05, whose widgets come back with the mark and grow it. Chromium's
    // anchoring had been doing the holding; without it the line slid
    // 760-2,800px in the 2.5 s after the takeover.
    await Promise.all([
        ['the project cards', '[data-project="water-management"]'],
        ['Skills', '#skills']
    ].map(async ([where, sel]) => {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
            const s = document.createElement('style');
            s.textContent = '* { overflow-anchor: none !important; }';
            document.head.appendChild(s);
        }));
        await context.route('**/script.js', async (route) => {
            await new Promise(res => setTimeout(res, 6000));
            await route.continue();
        });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'commit' });
        await page.waitForFunction(() => document.querySelector('footer') && !document.documentElement.classList.contains('js'), null, { timeout: 5500 }).catch(() => null);
        await page.waitForTimeout(900);
        await page.evaluate((q) => scrollTo({ top: document.querySelector(q).getBoundingClientRect().top + scrollY + 150, behavior: 'instant' }), sel);
        await page.waitForTimeout(200);
        const line = () => page.evaluate(() => {
            const l = window.__line || (window.__line = document.elementFromPoint(innerWidth / 2, innerHeight / 3));
            return { top: Math.round(l.getBoundingClientRect().top), what: l.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) };
        });
        const seen = await line();
        const tookOver = await page.waitForFunction(() => (window.mks || {}).ready === true, null, { timeout: 10000 }).then(() => true, () => false);
        await page.waitForTimeout(2500);
        const now = await line();
        const tag = `index.html, script.js late, no scroll anchoring, reading ${where}`;
        if (tookOver && Math.abs(now.top - seen.top) <= 4) ok(`${tag}: the line stays put while the page fills in ("${seen.what}" at ${seen.top}px, then ${now.top}px)`);
        else bad(`${tag}: the line ("${seen.what}") moved from ${seen.top}px to ${now.top}px (took over: ${tookOver})`);
        await context.close();
    }));

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
        // What a screen reader has to read while the digits count up from 0,
        // which used to be all it heard.
        const unseen = (await page.locator('.hero-stats').ariaSnapshot()).replace(/\s+/g, ' ');
        // The figures are on the first screen, and count from the first
        // frame. A count-up takes about 1.8 s, a frame at a time.
        await page.evaluate(() => document.querySelector('.hero-stats').scrollIntoView({ block: 'center' }));
        if (label === 'normal') {
            await page.waitForFunction(() => Array.from(document.querySelectorAll('.hero-stat-number'))
                .every(c => c.textContent === c.getAttribute('data-target')) && !document.querySelector('.hero-stats .sr-only'), null, { timeout: 8000 }).catch(() => null);
        } else {
            await page.waitForTimeout(2600);
        }
        const r = await page.evaluate(() => ({
            atReady: window.__atReady,
            preloader: !!document.getElementById('preloader'),
            marked: document.documentElement.classList.contains('js'),
            ready: (window.mks || {}).ready === true,
            counters: Array.from(document.querySelectorAll('.hero-stat-number')).map(c => c.textContent),
            targets: Array.from(document.querySelectorAll('.hero-stat-number')).map(c => c.getAttribute('data-target')),
            said: Array.from(document.querySelectorAll('.hero-stat')).map(s => `${s.querySelector('.hero-stat-number').getAttribute('data-target')} ${s.querySelector('.hero-stat-label').textContent}`),
            copies: document.querySelectorAll('.hero-stats .sr-only, .hero-stat-number[aria-hidden]').length
        }));
        const tag = `index.html, ${label}`;
        const missed = r.said.filter(t => !unseen.includes(t));
        if (missed.length) bad(`${tag}: before the stats are scrolled to, the accessibility tree lacks ${missed.join('; ')} (${unseen})`);
        else ok(`${tag}: before the stats are scrolled to, a screen reader reads ${r.said.join(', ')}`);
        if (r.copies) bad(`${tag}: ${r.copies} screen-reader copies or hidden digits left once the count ended`);
        const exact = r.counters.join('|') === r.targets.join('|');
        if (!r.ready || !r.marked) bad(`${tag}: script.js did not take over (ready ${r.ready}, marked ${r.marked})`);
        if (r.preloader) bad(`${tag}: the preloader is still in the page after load`);
        if (!exact) bad(`${tag}: counters ended at ${r.counters.join(', ')}, not ${r.targets.join(', ')}`);
        if (label === 'normal') {
            const intro = r.atReady && r.atReady.intro;
            // By DOMContentLoaded (which waits for count.js) the first frame
            // may have come and the count begun: each is below its target,
            // zeroed before that frame, never the target shown first.
            const fromZero = r.atReady && r.atReady.counters.every((c, i) => /^\d+$/.test(c) && +c < +r.targets[i]);
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
            await page.waitForFunction(() => window.mks.loaded.interactives, null, { timeout: 5000 }).catch(() => null);
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

// ------------------------------------------------------------------
// Accessibility: axe-core on every page, at two sizes, in both themes
//
// An audit once took the site from 241 axe violations to none, and nothing
// held it there. This does. Every page is loaded at 1440×900 and 390×844, in
// the dark theme and the light one, axe-core is injected from node_modules
// (so nothing leaves this origin), and any violation fails the run. The
// homepage is also checked scrolled through — the only time section 05's
// interactives, the journey map and every reveal are in the page — and in
// the states a visitor opens: the Assay's verdict on an ad it
// finds gaps in, the carbon receipt, the docked narration player, the menu
// on a phone and the terminal, each checked on its own. The homepage and
// carbon-ai.html are checked once more with their scripts blocked, which is
// the layout a reader without JavaScript gets (every nav link on show,
// the calculator's note in place of the calculator). The case studies are
// checked with both games loaded and played, with a row of photos open, and
// with the lightbox open on one.
//
// Each size and theme gets its own browser context with reduced motion, so
// axe judges what a reader settles on rather than an element halfway
// through a transition. The four run side by side.
// ------------------------------------------------------------------
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const AXE_VIEWS = [];
[{ width: 1440, height: 900 }, { width: 390, height: 844 }].forEach((viewport) => {
    ['dark', 'light'].forEach((theme) => AXE_VIEWS.push({ viewport, theme, name: `${viewport.width}×${viewport.height} ${theme}` }));
});

// The pages whose script swaps in a different layout, so the one a reader
// without JavaScript gets is checked as well. (With its scripts blocked the
// homepage still takes its theme from mks.theme, inline in its <head>;
// carbon-ai.css follows the system's setting by itself.)
const AXE_NO_SCRIPT = ['index.html', 'carbon-ai.html'];

// What the player offers once Moses has recorded his introduction (see
// exerciseNarration): served in place of today's empty manifest, so the
// player is checked with the offer it will carry. Nothing is played.
const AXE_MANIFEST = { tracks: { intro: {
    file: 'assets/audio/intro.mp3', bytes: silentMp3().length, grams: 0.013, seconds: 5, voiceKind: 'recorded', voiceTitle: 'Moses Kolleh Sesay'
} } };

async function axeRun(page, scope) {
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE_PATH });
    return page.evaluate(async (sel) => {
        const result = await window.axe.run(sel || document, { resultTypes: ['violations'] });
        return result.violations.map(v => ({ id: v.id, help: v.help, targets: v.nodes.map(n => n.target.join(' ')) }));
    }, scope || null);
}

async function accessibilityPass(browser, origin) {
    const t0 = Date.now();
    const found = new Map();     // page · state · rule · element → the views it failed in
    const states = new Map();    // page → the states checked
    const trouble = [];          // a state that could not be opened, or an axe run that threw
    const note = (rel, state, view, violations) => {
        if (!states.has(rel)) states.set(rel, new Set());
        states.get(rel).add(state);
        violations.forEach(v => v.targets.forEach((target) => {
            const key = [rel, state, v.id, target].join('\t');
            if (!found.has(key)) found.set(key, { rel, state, id: v.id, help: v.help, target, views: [] });
            found.get(key).views.push(view.name);
        }));
    };

    await Promise.all(AXE_VIEWS.map(view => axeView(browser, origin, view, note, trouble)));

    const version = require('axe-core/package.json').version;
    console.log(`\n  Accessibility — axe-core ${version}, ${AXE_VIEWS.map(v => v.name).join(', ')} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
    trouble.forEach(t => bad(t));
    PAGES.forEach((rel) => {
        const mine = Array.from(found.values()).filter(f => f.rel === rel);
        const checked = Array.from(states.get(rel) || []);
        if (!mine.length) return ok(`${rel}: no violations (${checked.join(', ')})`);
        mine.forEach(f => bad(`${rel}, ${f.state}: [${f.id}] ${f.target} — ${f.help} (${f.views.join('; ')})`));
    });
}

async function axeView(browser, origin, view, note, trouble) {
    // axe goes in as an inline script, which a Content-Security-Policy would
    // otherwise be entitled to refuse.
    const context = await browser.newContext({ viewport: view.viewport, colorScheme: view.theme, reducedMotion: 'reduce', bypassCSP: true });
    // The homepage and the pages on carbon-ai.css keep their theme in
    // localStorage; field-report.html follows the system setting, which
    // colorScheme sets. The 404 page has one theme, simply checked twice.
    await context.addInitScript((theme) => {
        try { localStorage.setItem('theme', theme); } catch (e) { /* storage blocked */ }
    }, view.theme);
    // A speech voice, as nearly every real browser has and headless ones do
    // not, so the nav shows its listen control and the player can open.
    await context.addInitScript(STAND_IN_VOICE);
    await context.route('**/assets/audio/voice-manifest.json', (route) => route.fulfill({ json: AXE_MANIFEST }));
    // Four more visits to every page: none of them may reach a real endpoint
    // (the contact form's, or anything added later), whatever the page does.
    await context.route((url) => !url.href.startsWith(origin), (route) => route.abort());
    const attempt = async (what, fn) => {
        try { await fn(); } catch (e) { trouble.push(`${what} (${view.name}): ${String(e.message || e).split('\n')[0]}`); }
    };
    try {
        for (const rel of PAGES) {
            const page = await context.newPage();
            await attempt(`${rel}: axe on arrival`, async () => {
                await page.goto(`${origin}/${rel}`, { waitUntil: 'load' });
                await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
                await page.waitForTimeout(250);
                note(rel, 'on arrival', view, await axeRun(page));
            });
            if (rel === 'index.html') await axeHomepageStates(page, view, note, attempt);
            // Anatomy of a Prompt is drawn only as its section comes near.
            if (rel === 'carbon-ai.html') {
                await attempt(`${rel}: axe on Anatomy of a Prompt`, async () => {
                    await page.evaluate(() => document.getElementById('anatomy').scrollIntoView());
                    await page.waitForSelector('#anatomyDraw:not([hidden])', { timeout: 5000 });
                    note(rel, 'Anatomy drawn', view, await axeRun(page, '#anatomy'));
                });
            }
            if (rel === 'case-studies.html') {
                await attempt(`${rel}: axe with the games played`, async () => {
                    await playGames(page);
                    for (const host of ['#play-borehole', '#play-flood']) note(rel, 'the games played', view, await axeRun(page, host));
                });
                await attempt(`${rel}: axe on a row of photos and the lightbox`, async () => {
                    await page.evaluate(() => { const d = document.querySelector('#wuppertal details.cs-photos'); d.open = true; d.scrollIntoView({ block: 'center' }); });
                    await page.waitForTimeout(300);
                    note(rel, 'a row of photos open', view, await axeRun(page, '#wuppertal .cs-photos'));
                    await page.click('#wuppertal .cs-photo a');
                    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 3000 });
                    await page.waitForTimeout(300);
                    note(rel, 'the lightbox open', view, await axeRun(page, '#lightbox'));
                    await page.keyboard.press('Escape');
                });
            }
            await page.close();
            if (!AXE_NO_SCRIPT.includes(rel)) continue;
            const bare = await context.newPage();
            await bare.route('**/*.js', (route) => route.abort());
            await attempt(`${rel}: axe with its scripts blocked`, async () => {
                await bare.goto(`${origin}/${rel}`, { waitUntil: 'load' });
                await bare.waitForFunction(() => !document.documentElement.classList.contains('js'), null, { timeout: 5000 });
                note(rel, 'scripts blocked', view, await axeRun(bare));
            });
            await bare.close();
        }
    } finally {
        await context.close();
    }
}

async function axeHomepageStates(page, view, note, attempt) {
    const rel = 'index.html';
    const within = { timeout: 5000 };

    await attempt(`${rel}: axe scrolled through`, async () => {
        await page.evaluate(async () => {
            for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
                scrollTo(0, y);
                await new Promise(r => setTimeout(r, 50));
            }
        });
        await page.waitForFunction(() => window.mks && window.mks.loaded && window.mks.loaded.interactives, null, within);
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(250);
        note(rel, 'scrolled through', view, await axeRun(page));
    });

    // The Assay's verdict, with rows for what matched and for the gaps.
    await attempt(`${rel}: axe on the Assay's verdict`, async () => {
        await page.click('#assay .assay-open', within);
        await page.fill('#assayInput','ESG Reporting Consultant for CSRD and ESRS. Fluent Dutch. ' +
            '5+ years at a Big Four firm. Hands-on SAP. GHG accounting and stakeholder engagement.');
        await page.click('#assayRun', within);
        await page.waitForSelector('#assayResult .assay-row-gap', within);
        note(rel, 'the Assay\'s verdict', view, await axeRun(page, '#assay'));
    });

    // The page's own carbon receipt, printed from the footer.
    await attempt(`${rel}: axe on the carbon receipt`, async () => {
        await page.click('#receiptBtn', within);
        await page.waitForSelector('#receiptBody :first-child', within);
        note(rel, 'the carbon receipt', view, await axeRun(page, '#receiptPanel'));
        await page.click('#receiptBtn', within);
    });

    // The docked player, opened from the nav, offering the introduction.
    await attempt(`${rel}: axe on the narration player`, async () => {
        await page.click('#listenBtn', within);
        await page.waitForSelector('#dispatchBar .dispatch-offer', { state: 'visible', ...within });
        note(rel, 'the narration player', view, await axeRun(page, '#dispatchBar'));
        await page.click('#listenBtn', within);   // a second press stops and closes
        await page.waitForSelector('#dispatchBar', { state: 'hidden', ...within });
    });

    // On a phone the nav's links sit behind the menu button.
    if (await page.isVisible('#navToggle')) {
        await attempt(`${rel}: axe with the menu open`, async () => {
            await page.click('#navToggle', within);
            await page.waitForSelector('#navMenu.active', within);
            note(rel, 'the menu open', view, await axeRun(page, '.navbar'));
            await page.keyboard.press('Escape');
        });
    }

    await attempt(`${rel}: axe on the terminal`, async () => {
        await page.click('#terminalToggle', within);
        await page.waitForSelector('.field-terminal.open', within);
        note(rel, 'the terminal', view, await axeRun(page, '.field-terminal'));
        await page.keyboard.press('Escape');
    });
}

// ------------------------------------------------------------------
// The shared shell: one theme from page to page, and room on a phone
// ------------------------------------------------------------------
// Every page but the homepage carries the same nav and a closing call to
// action, and those built on carbon-ai.css the theme switch (written by
// build-content.js; tests/shell.test.js holds the markup). What jsdom
// cannot show: the switch pressed for real, the choice followed through
// the nav to the next page, to the homepage and back, the system's setting
// honoured with nothing stored and with JavaScript off, every page on a
// 320px phone, a link to a game, a card or Anatomy of a Prompt landing it
// clear of the bar, and the switch arriving without moving the page. Both
// themes go through axe with every page (see accessibilityPass).
async function exerciseShell(browser, origin) {
    console.log('  the other pages — shared nav, theme, 320px');
    const LIGHT_BG = 'rgb(244, 246, 240)';
    const look = (page) => page.evaluate(() => {
        const b = document.getElementById('themeToggle');
        return {
            theme: document.documentElement.getAttribute('data-theme'),
            bg: getComputedStyle(document.body).backgroundColor,
            name: b && !b.hidden ? b.getAttribute('aria-label') : null
        };
    });
    const follow = (page, sel) => Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click(sel)]);

    // (a) A dark system and nothing stored: the switch picks light, and light
    // is what the next page and the homepage open in; dark picked on the
    // homepage is dark back on the page before it and on carbon-ai.html.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', reducedMotion: 'reduce' });
        const page = await context.newPage();
        await page.goto(`${origin}/case-studies.html`, { waitUntil: 'load' });
        const before = await look(page);
        await page.click('#themeToggle');
        const after = await look(page);
        if (before.theme === 'dark' && after.theme === 'light' && after.bg === LIGHT_BG && after.name === 'Switch to dark theme') {
            ok(`theme switch on case-studies.html: dark to light, the page with it (${before.bg} to ${after.bg})`);
        } else bad(`theme switch on case-studies.html: ${JSON.stringify(before)}, then ${JSON.stringify(after)}`);

        await follow(page, '.ca-nav-links a[href="research.html"]');
        const next = await look(page);
        if (next.theme === 'light' && next.bg === LIGHT_BG) ok('theme: the choice follows the nav to research.html');
        else bad(`theme: research.html opened ${next.theme} (${next.bg}) after light was chosen`);

        await follow(page, '.ca-nav-links a[href="index.html"]');
        await page.waitForFunction(() => !document.getElementById('themeToggle').hidden, null, { timeout: 8000 });
        const home = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
        if (home) ok('theme: ...and to the homepage, which reads the same stored choice');
        else bad('theme: the homepage opened dark after light was chosen on another page');

        await page.evaluate(() => document.getElementById('themeToggle').click());
        await page.goBack({ waitUntil: 'load' });
        const back = await look(page);
        if (back.theme === 'dark' && back.name === 'Switch to light theme') ok('theme: dark chosen on the homepage is dark on Back to research.html, and its switch says so');
        else bad(`theme: Back to research.html after the homepage switched to dark: ${JSON.stringify(back)}`);
        await page.goto(`${origin}/carbon-ai.html`, { waitUntil: 'load' });
        const ca = await look(page);
        if (ca.theme === 'dark' && ca.name === 'Switch to light theme') ok('theme: ...and on carbon-ai.html');
        else bad(`theme: carbon-ai.html opened ${JSON.stringify(ca)} after the homepage switched to dark`);
        await context.close();
    }

    // (b) A light system and nothing stored: light without a press, and
    // nothing stored on the reader's behalf. Without JavaScript the
    // stylesheet follows the system by itself.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
        const page = await context.newPage();
        await page.goto(`${origin}/stats.html`, { waitUntil: 'load' });
        const r = await look(page);
        const stored = await page.evaluate(() => localStorage.getItem('theme'));
        if (r.theme === 'light' && r.bg === LIGHT_BG && stored === null) ok('theme: a system set to light gets light on stats.html, and nothing is stored for it');
        else bad(`theme: with a light system and nothing stored, stats.html is ${JSON.stringify(r)} (stored: ${stored})`);

        // The homepage too, from its first frame: what the page is in, and
        // the colour its body is painted, when the first frame that has a
        // body is drawn, recorded before any of the page's scripts run.
        // (With the theme set at the top of <body>, after the stylesheet,
        // about one run in ten drew that frame dark.)
        await context.addInitScript(() => {
            const seen = () => {
                if (!document.body) return requestAnimationFrame(seen);
                window.__firstFrame = document.documentElement.classList.contains('light-mode')
                    && getComputedStyle(document.body).backgroundColor !== 'rgb(10, 10, 10)' ? 'light' : 'dark';
            };
            requestAnimationFrame(seen);
        });
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__firstFrame && !document.getElementById('themeToggle').hidden, null, { timeout: 8000 }).catch(() => null);
        const home = await page.evaluate(() => ({
            first: window.__firstFrame,
            now: document.documentElement.classList.contains('light-mode') ? 'light' : 'dark',
            name: document.getElementById('themeToggle').getAttribute('aria-label'),
            bar: document.querySelector('meta[name="theme-color"]').content,
            stored: localStorage.getItem('theme')
        }));
        if (home.first === 'light' && home.now === 'light' && home.name === 'Switch to dark theme' && home.bar === '#f4f6f0' && home.stored === null) {
            ok('theme: ...and on the homepage, light from its first frame, the switch and the browser bar with it, nothing stored');
        } else bad(`theme: with a light system and nothing stored, the homepage is ${JSON.stringify(home)}`);
        await context.close();
        for (const scheme of ['light', 'dark']) {
            const bare = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme, javaScriptEnabled: false });
            const p = await bare.newPage();
            await p.goto(`${origin}/carbon-ai.html`, { waitUntil: 'load' });
            const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
            const want = scheme === 'light' ? LIGHT_BG : 'rgb(0, 0, 0)';
            if (bg === want) ok(`theme: with JavaScript off, carbon-ai.html follows a ${scheme} system (${bg})`);
            else bad(`theme: with JavaScript off and a ${scheme} system, carbon-ai.html's background is ${bg}, not ${want}`);
            await bare.close();
        }
    }

    // (c) Every page on a 320px phone: nothing wider than the screen, the
    // five nav links on it without touching (on one row where the nav is
    // carbon-ai.css's), the switch clear of the logo, the call to action
    // whole, and back to top all the way up.
    {
        const context = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: 'reduce' });
        for (const rel of PAGES.filter(p => p !== 'index.html')) {
            const page = await context.newPage();
            await page.goto(`${origin}/${rel}`, { waitUntil: 'load' });
            await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
            const r = await page.evaluate(() => {
                const box = el => el.getBoundingClientRect();
                const inside = (el) => { const b = box(el); return b.width > 0 && b.left >= 0 && b.right <= innerWidth; };
                const nav = document.querySelector('nav[aria-label="Main"]');
                const links = nav ? Array.from(nav.querySelectorAll('a')).filter(a => /^(Home|Case studies|Research|CV|Contact)$/.test(a.textContent.trim())) : [];
                const touching = links.slice(1).filter((a, i) => box(a).top === box(links[i]).top && box(a).left < box(links[i]).right).length;
                const mail = document.querySelector('main a[href^="mailto:"]');
                const cta = mail && mail.closest('section, p');
                const sw = document.getElementById('themeToggle');
                const logo = document.querySelector('.ca-nav-logo');
                return {
                    wide: document.documentElement.scrollWidth - innerWidth,
                    links: links.filter(inside).length,
                    touching,
                    rows: nav && nav.classList.contains('ca-nav') ? new Set(links.map(a => Math.round(box(a).top))).size : 1,
                    cta: !!cta && inside(cta) && Array.from(cta.querySelectorAll('a')).every(a => Array.from(a.getClientRects()).every(b => b.left >= 0 && b.right <= innerWidth)),
                    toggle: !sw || (!sw.hidden && inside(sw) && box(sw).left >= box(logo).right)
                };
            });
            const problems = [];
            if (r.wide > 0) problems.push(`${r.wide}px wider than the screen`);
            if (r.links !== 5) problems.push(`${r.links} of the 5 nav links on screen`);
            if (r.touching) problems.push(`${r.touching} nav links run into the one before`);
            if (r.rows !== 1) problems.push(`the nav's links on ${r.rows} rows`);
            if (!r.cta) problems.push('the call to action runs off the screen');
            if (!r.toggle) problems.push('the theme switch is off screen or over the logo');
            const top = await page.$('main a[href="#top"]');
            if (top) {
                await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
                await top.click();
                await page.waitForTimeout(150);
                const y = await page.evaluate(() => scrollY);
                if (y !== 0) problems.push(`back to top stops at ${Math.round(y)}px`);
            }
            if (problems.length) bad(`${rel} at 320px: ${problems.join('; ')}`);
            else ok(`${rel} at 320px: fits the screen, the five nav links and the call to action on it${top ? ', back to top goes to the top' : ''}`);
            await page.close();
        }
        await context.close();
    }

    // (d) A link to anything on these pages lands it clear of the bar, on a
    // desktop, where the bar stays put. Room was made for the case-study
    // and research cards, not for the games or Anatomy of a Prompt, whose
    // headings landed under it. Loaded by address, followed from the
    // homepage's play index, and followed from a link on the page itself.
    {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const clear = async (where) => {
            await page.waitForTimeout(1200);   // a game may arrive meanwhile
            const r = await page.evaluate(() => {
                const t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
                const head = t && t.querySelector('h2, h3, h4');
                const bar = Math.round(document.querySelector('.ca-nav').getBoundingClientRect().bottom);
                return t && { top: Math.round(t.getBoundingClientRect().top), head: head && Math.round(head.getBoundingClientRect().top), bar };
            });
            if (r && r.top >= r.bar && (r.head === null || r.head >= r.bar)) ok(`${where}: lands clear of the nav bar (at ${r.top}px; the bar ends at ${r.bar}px)`);
            else bad(`${where}: lands under the nav bar ${JSON.stringify(r)}`);
        };
        await page.goto(`${origin}/research.html`, { waitUntil: 'load' });
        const item = await page.evaluate(() => document.querySelector('.rs-item[id]').id);
        for (const url of ['case-studies.html#play-borehole', 'case-studies.html#groundwater', 'carbon-ai.html#anatomy', `research.html#${item}`]) {
            await page.goto(`${origin}/${url}`, { waitUntil: 'load' });
            await clear(url);
        }
        for (const [rel, href] of [['index.html', 'case-studies.html#play-borehole'], ['index.html', 'carbon-ai.html#anatomy'], ['case-studies.html', '#play-flood'], ['carbon-ai.html', '#anatomy']]) {
            await page.goto(`${origin}/${rel}`, { waitUntil: 'load' });
            const link = page.locator(`a[href="${href}"]`).first();
            await link.scrollIntoViewIfNeeded();
            await Promise.all([rel === 'index.html' ? page.waitForNavigation({ waitUntil: 'load' }) : null, link.click()]);
            await clear(`${rel}, its link to ${href}`);
        }
        await context.close();
    }

    // (e) Nothing moves as the page finishes arriving. The theme switch is
    // shipped hidden and shown once the page's scripts are in; on a phone,
    // where it shares the first row with the logo, it arriving then pushed
    // the links and everything under them 10px down (a layout shift of
    // 0.09 on carbon-ai.html). The scripts are held back 1.5 s here, as on a
    // slow connection, so that late arrival is what is measured. Chromium
    // only: Firefox does not report layout shifts.
    if (CHROMIUM) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        await context.route(/\.js$/, async (route) => {
            if (!/\/theme\.js$/.test(new URL(route.request().url()).pathname)) await new Promise(r => setTimeout(r, 1500));
            await route.fallback();
        });
        await context.addInitScript(() => {
            window.__shifts = [];
            new PerformanceObserver((list) => list.getEntries().forEach((e) => {
                if (!e.hadRecentInput) window.__shifts.push({ value: e.value, nodes: e.sources.map(x => x.node).filter(Boolean) });
            })).observe({ type: 'layout-shift', buffered: true });
        });
        const withSwitch = PAGES.filter(rel => /id="themeToggle"/.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')) && rel !== 'index.html');
        for (const rel of withSwitch) {
            const page = await context.newPage();
            await page.goto(`${origin}/${rel}`, { waitUntil: 'load' });
            await page.waitForTimeout(500);
            const r = await page.evaluate(() => {
                const nav = document.querySelector('.ca-nav');
                const main = document.getElementById('main');
                const moved = window.__shifts.filter(e => e.nodes.some(n => nav.contains(n) || n === main));
                return {
                    shown: !document.getElementById('themeToggle').hidden,
                    moved: +moved.reduce((n, e) => n + e.value, 0).toFixed(4),
                    all: +window.__shifts.reduce((n, e) => n + e.value, 0).toFixed(4)
                };
            });
            if (r.shown && r.moved === 0) ok(`${rel} at 390px, scripts late: the theme switch arrives without moving the nav or the page (layout shift ${r.all} in all)`);
            else bad(`${rel} at 390px, scripts late: ${r.shown ? `the nav and the page moved as it arrived (layout shift ${r.moved})` : 'the theme switch never appeared'}`);
            await page.close();
        }
        await context.close();
    }
}

// ------------------------------------------------------------------
// CPU: sections drawn near the screen, loops only where they are seen
// ------------------------------------------------------------------
// content-visibility lets the browser skip a section's layout and paint
// until it nears the screen, sizing it by an estimate until then, and that
// estimate moves whatever a jump aims at; script.js re-aims a jump as the
// real heights arrive. What jsdom cannot show: where jumps actually land,
// whether find-in-page and printing still reach every section, which loops
// are really paused, and how busy the main thread is while nobody touches
// the page (at 4x CPU slowdown it was about 0.7 s in every 2 s before).
const IDLE_CEILING_MS = 100;   // main-thread work per 2 s idle, at 4x slowdown

async function exerciseCpu(browser, origin) {
    console.log('  index.html — sections drawn near the screen, loops paused out of sight');
    const landed = (page, id) => page.evaluate((id) => new Promise((resolve) => {
        // Where the section's top should sit: under the fixed nav bar.
        const want = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
        const el = document.getElementById(id);
        let still = 0;
        const started = performance.now();
        const poll = () => {
            const top = Math.round(el.getBoundingClientRect().top);
            still = Math.abs(top - want) <= 2 ? still + 1 : 0;
            if (still >= 3 || performance.now() - started > 5000) resolve({ top, want });
            else setTimeout(poll, 100);
        };
        poll();
    }), id);
    const lands = async (page, id, how) => {
        const r = await landed(page, id);
        if (Math.abs(r.top - r.want) <= 2) ok(`${how} to #${id} lands its top under the nav bar (${r.top}px)`);
        else bad(`${how} to #${id} lands ${r.top}px from the top of the screen, not ${r.want}px`);
    };

    // Desktop, motion allowed: the jump glides past sections still sized by
    // their estimates, which is the hard case.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        const cv = await page.evaluate(() => Array.from(document.querySelectorAll('main > section'))
            .filter(s => getComputedStyle(s).contentVisibility === 'auto').length);
        if (cv) ok(`${cv} sections are drawn only as they near the screen (content-visibility: auto)`);
        else bad('no section has content-visibility: auto');
        for (const id of ['contact', 'about', 'experience']) {
            await page.click(`.nav-menu a[href="#${id}"]`);
            await lands(page, id, 'a nav link');
        }
        const lit = () => page.evaluate(() => Array.from(document.querySelectorAll('.nav-link.active')).map(a => a.textContent.trim()).join() || 'none');
        const spy = await lit();
        if (spy === 'Experience') ok('the nav highlights the section it landed on'); else bad(`the nav highlights ${spy}, not Experience`);
        // Work leads to the case studies, and stands for this page's own
        // projects while the reader is on them. The wheel lets go of the jump.
        await page.mouse.wheel(0, 10);
        await page.evaluate(() => document.getElementById('projects').scrollIntoView({ behavior: 'instant' }));
        await page.waitForTimeout(400);
        const work = await lit();
        if (work === 'Work') ok('the nav lights Work on this page\'s projects'); else bad(`on #projects the nav lights ${work}, not Work`);

        // Find-in-page, from the top, reaches a section not yet drawn. (The
        // field notes that used to be looked for are in About now, near the
        // top; the certificates are far down, in Skills & Education.)
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        const found = await page.evaluate(() => {
            const heading = document.querySelector('#education .certification:last-child .cert-title');
            const text = heading ? heading.textContent.trim() : '';
            const hit = !!text && window.find(text);
            const sel = getSelection();
            return { text, hit, inside: !!(sel.anchorNode && document.getElementById('education').contains(sel.anchorNode)) };
        });
        if (found.hit && found.inside) ok(`find-in-page reaches a section not yet drawn ("${found.text}")`);
        else bad(`find-in-page could not find "${found.text}" in #education from the top of the page`);

        await page.emulateMedia({ media: 'print' });
        const printed = await page.evaluate(() => Array.from(document.querySelectorAll('main > section'))
            .filter(s => getComputedStyle(s).contentVisibility !== 'visible').map(s => '#' + s.id));
        if (printed.length) bad(`printing would skip ${printed.join(', ')}`); else ok('printing draws every section');
        await page.emulateMedia({ media: null });
        await context.close();
    }

    // A deep link, and a phone.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html#skills`, { waitUntil: 'load' });
        await lands(page, 'skills', 'a shared link');
        await context.close();
    }
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        // The journey map still flies with its stops (one column on a phone)
        // as the section around them is drawn.
        await page.mouse.wheel(0, 300);
        await page.waitForFunction(() => document.querySelector('#journeyMapFrame svg'), null, { timeout: 5000 }).catch(() => null);
        const readAt = async (i) => {
            await page.evaluate((i) => document.querySelector(`.journey-stop[data-stop="${i}"]`).scrollIntoView({ block: 'center', behavior: 'instant' }), i);
            await page.waitForTimeout(600);
            return page.evaluate(() => document.getElementById('journeyMapReadout').textContent.split('—').pop().trim());
        };
        const early = await readAt(1);
        const late = await readAt(4);
        if (late === 'Amsterdam' && early !== late) ok(`the journey map flies with the stops (${early}, then ${late})`);
        else bad(`the journey map did not follow the stops (${early}, then ${late})`);
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await page.click('#navToggle');
        await page.click('.nav-menu a[href="#experience"]');
        await lands(page, 'experience', 'on a phone, a menu link');
        await context.close();
    }
    // Reading back up after the page skipped ahead: an instant jump (reduced
    // motion) or a scroll bar dragged to the end. The sections passed were
    // never drawn, so each took its real height as the reader got back to it,
    // just above what they were reading, and Chrome's scroll anchoring missed
    // it: at 390px the page moved up to 2,376px at a time. script.js draws
    // them once the page rests. (A few pixels is a hover lift, not this.)
    for (const [how, arrive] of [
        ['after a shared link to #contact with reduced motion', async (page) => {
            await page.goto(`${origin}/index.html#contact`, { waitUntil: 'load' });
            await lands(page, 'contact', 'with reduced motion, a shared link');
            // The reader takes over with the wheel, which lets go of the jump.
            await page.mouse.move(195, 422);
            await page.mouse.wheel(0, -150);
            await page.mouse.move(2, 2);
        }],
        ['after dragging the scroll bar to the end', async (page) => {
            await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
            await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        }]
    ]) {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: /reduced/.test(how) ? 'reduce' : 'no-preference' });
        const page = await context.newPage();
        await arrive(page);
        await page.waitForTimeout(1200);
        const moved = await page.evaluate(async () => {
            const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const out = [];
            while (scrollY > 0) {
                const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
                const was = el.getBoundingClientRect().top, y = scrollY;
                scrollBy({ top: -150, behavior: 'instant' });
                const step = y - scrollY;
                await frames();
                const off = Math.round(el.getBoundingClientRect().top - was - step);
                if (Math.abs(off) > 24) out.push(`${off}px at ${Math.round(scrollY)}`);
            }
            return out;
        });
        if (!moved.length) ok(`reading back up ${how}, nothing on screen moves as the sections passed are drawn`);
        else bad(`reading back up ${how}, what was on screen moved ${moved.join(', ')}`);
        await context.close();
    }

    // Loops: running where they can be seen, paused elsewhere and in a
    // hidden tab. Then the main thread, left alone, at 4x slowdown.
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        const loops = () => page.evaluate(() => document.getAnimations()
            .filter(a => a.effect && a.effect.getTiming().iterations === Infinity)
            .map((a) => {
                const el = a.effect.target;
                return { name: a.animationName, state: a.playState, away: !(el && el.closest('.onscreen')) };
            }));
        const atTop = await loops();
        const wrong = atTop.filter(l => (l.away ? l.state !== 'paused' : l.state !== 'running'));
        const shown = atTop.filter(l => !l.away).length;
        if (atTop.length && shown && !wrong.length) ok(`${atTop.length} loops: the ${shown} in view run, the ${atTop.length - shown} out of view are paused`);
        else bad(`loops at the top of the page: ${wrong.map(l => `${l.name} ${l.state}${l.away ? ' off screen' : ' in view'}`).join(', ') || 'none found'}`);

        const setHidden = (hidden) => page.evaluate((hidden) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
            document.dispatchEvent(new Event('visibilitychange'));
        }, hidden);
        await setHidden(true);
        const running = (await loops()).filter(l => l.state !== 'paused');
        if (!running.length) ok('in a hidden tab every loop is paused'); else bad(`in a hidden tab ${running.map(l => l.name).join(', ')} still run`);
        await setHidden(false);

        // The main thread's own clock is a Chromium DevTools figure.
        if (browser.browserType().name() !== 'chromium') {
            ok('idle main-thread work: not measured in this browser (a Chromium DevTools figure)');
            await context.close();
            return;
        }
        // "Left alone" starts once the hero's figures have counted up. They
        // are on the first screen, so the count starts at load; timed from
        // the clock, it is over 1.8 s after it starts, however slow the
        // frames. (Counted in frames, it ran on under a busy runner into
        // the window below, and the reading went over at random.)
        const counted = await page.waitForFunction(() => !document.querySelector('.hero-stat-number[aria-hidden]')
            && [...document.querySelectorAll('.hero-stat-number')].every(c => c.textContent === c.dataset.target), null, { timeout: 4000 })
            .then(() => true, () => false);
        if (counted) ok('the hero figures have counted up to their exact values within 4 s of load');
        else bad(`the hero figures are still counting 4 s after load: ${await page.evaluate(() => [...document.querySelectorAll('.hero-stat-number')].map(c => c.textContent).join('/'))}`);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Performance.enable');
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.waitForTimeout(1000);   // let the checks above settle first
        const busy = async () => {
            const at = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value;
            const t0 = await at();
            await page.waitForTimeout(2000);
            return Math.round((await at() - t0) * 1000);
        };
        const top = await busy();
        await page.evaluate(() => document.getElementById('projects').scrollIntoView({ behavior: 'instant' }));
        await page.waitForTimeout(2000);
        const mid = await busy();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        if (top <= IDLE_CEILING_MS && mid <= IDLE_CEILING_MS) ok(`left alone, the main thread works ${top} ms at the top and ${mid} ms mid-page per 2 s at 4x slowdown (ceiling ${IDLE_CEILING_MS} ms)`);
        else bad(`left alone, the main thread works ${top} ms at the top and ${mid} ms mid-page per 2 s at 4x slowdown — ceiling ${IDLE_CEILING_MS} ms`);
        await context.close();
    }
}

// ------------------------------------------------------------------
// The visit counter, kept off the real endpoint
// ------------------------------------------------------------------
// Closing a page fires pagehide, and count.js sends its count then. A
// request made while a page is closing cannot be intercepted (Chromium
// sends it after the page's routes are gone), so it would reach the real
// Apps Script and count a smoke run as a visit. So every page opened in a
// context passed through here browses with Global Privacy Control on, which
// is the counter's own opt-out, and anything sent while a page is still
// open is answered locally. Every context this script opens is passed
// through here as it is opened (see the wrapper around browser.newContext),
// bar exerciseCounter()'s, which never closes a page the counter is armed on.
async function quietCounter(context) {
    await context.addInitScript(() => {
        Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { configurable: true, get: () => true });
    });
    await context.route((url) => url.href === COUNT_URL, (route) => route.fulfill({ status: 204, body: '' }));
}

// ------------------------------------------------------------------
// The visit counter: what one visit sends, and when it sends nothing
// ------------------------------------------------------------------
// The privacy promise is that the count holds only the documented fields,
// and this is the test that enforces it: a real visit, three features used,
// the page left, and the request that leaves the browser taken apart.
// openContext is the browser's own newContext, without the quietening.
async function exerciseCounter(openContext, origin, arrivalBytes) {
    console.log('  the visit counter');
    const sent = [];
    const record = (context) => context.route((url) => url.href === COUNT_URL, async (route) => {
        const req = route.request();
        sent.push({ method: req.method(), headers: await req.allHeaders(), body: req.postData() || '' });
        await route.fulfill({ status: 204, body: '' });
    });
    const context = await openContext({ viewport: { width: 1280, height: 800 } });
    // A voice, so the Listen control shows, as it does for most visitors.
    await context.addInitScript(STAND_IN_VOICE);
    await record(context);
    const counts = (page) => sent.filter((s) => { try { return JSON.parse(s.body).page === page; } catch (e) { return false; } });
    const settle = async (page, n) => {
        for (let i = 0; i < 30 && sent.length < n; i++) await page.waitForTimeout(100);
        await page.waitForTimeout(300);   // and a moment more, for anything that should not arrive
    };

    // Leaving a page, without letting go of it. A real navigation fires
    // pagehide too, but the request count.js makes then is not reliably
    // caught by a route: measured here, about one navigation in three let
    // it straight past, to the real endpoint. So the events are dispatched
    // while the page is still open (the same listeners, the same fetch, and
    // every request caught), and a page is only navigated away or closed
    // once its counter has already sent, when it cannot send again.
    const leave = (p) => p.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    const visibility = (p, state) => p.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);

    const page = await context.newPage();
    const foreign = [];
    const errors = [];
    page.on('request', (r) => { if (!r.url().startsWith(origin) && r.url() !== COUNT_URL && !r.url().startsWith('about:')) foreign.push(r.url()); });
    page.on('pageerror', (e) => errors.push(e.message));

    // Arrive from LinkedIn on a lens link, use three features, read to the end.
    await page.goto(`${origin}/index.html?lens=water`, { waitUntil: 'load', referer: 'https://www.linkedin.com/feed/' });
    await page.click('#receiptBtn');                          // data-analytics="receipt-open"; fetches the interactives
    await page.waitForFunction(() => window.mks && window.mks.loaded && window.mks.loaded.interactives, null, { timeout: 5000 }).catch(() => null);
    await page.keyboard.press('`');                           // fetches the terminal
    await page.waitForFunction(() => window.mks && window.mks.loaded && window.mks.loaded.terminal, null, { timeout: 5000 }).catch(() => null);
    await page.keyboard.press('Escape');
    await page.click('#listenBtn');                           // data-analytics="listen"; fetches the player
    await page.waitForFunction(() => window.mks && window.mks.loaded && window.mks.loaded.dispatch, null, { timeout: 5000 }).catch(() => null);
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('contact').scrollIntoView({ behavior: 'instant' }));
    await page.waitForTimeout(400);
    if (sent.length) bad(`the counter sent ${sent.length} request(s) while the page was still open and visible`);

    await leave(page);
    await settle(page, 1);

    const home = counts('index');
    if (home.length !== 1) {
        bad(`leaving the homepage sent ${home.length} counts, not 1`);
    } else {
        const s = home[0];
        let body = null;
        try { body = JSON.parse(s.body); } catch (e) { /* reported below */ }
        const keys = body ? Object.keys(body) : [];
        if (JSON.stringify(keys) === JSON.stringify(BEACON_KEYS)) ok(`one count on leaving, with exactly the documented keys: ${keys.join(', ')}`);
        else bad(`the count's keys are not the documented set: ${keys.join(', ') || s.body}`);

        const shaped = !!body && body.v === 1 &&
            ['page', 'lens', 'deepest', 'ref', 'vp'].every(k => typeof body[k] === 'string') &&
            ['s', 'm', 'l'].includes(body.vp) &&
            Array.isArray(body.features) && body.features.length <= 20 &&
            body.features.every(f => typeof f === 'string' && /^[a-z0-9-]{1,40}$/.test(f)) &&
            new Set(body.features).size === body.features.length &&
            Number.isInteger(body.kb) && body.kb >= 0 && body.kb <= 100000;
        if (shaped) ok('every value has its documented type and shape'); else bad(`a value has the wrong type or shape: ${s.body}`);

        if (body) {
            const want = { page: 'index', lens: 'water', deepest: 'contact', ref: 'www.linkedin.com', vp: 'l' };
            const wrong = Object.keys(want).filter(k => body[k] !== want[k]);
            if (wrong.length) bad(`the count got the visit wrong: ${wrong.map(k => `${k}=${JSON.stringify(body[k])}`).join(', ')}`);
            else ok(`it says what the visit did: ${Object.keys(want).map(k => `${k} ${want[k]}`).join(', ')}`);

            const used = ['receipt-open', 'module-interactives', 'module-terminal', 'listen', 'module-dispatch'];
            const missing = used.filter(f => !(body.features || []).includes(f));
            if (missing.length) bad(`features used but not counted: ${missing.join(', ')} (got ${(body.features || []).join(', ')})`);
            else ok(`features: ${body.features.join(', ')}`);

            const floor = Math.floor((arrivalBytes / 1024) * 0.8);
            if (body.kb >= floor) ok(`kb: ${body.kb}, no less than the ${fmt(arrivalBytes)} the homepage took to arrive`);
            else bad(`kb is ${body.kb}, below the ${fmt(arrivalBytes)} measured for the homepage's arrival`);
        }

        const h = s.headers;
        if (s.method === 'POST' && !h.cookie && !h.referer && /^text\/plain/.test(h['content-type'] || '')) ok('a plain-text POST, with no cookie and no Referer header');
        else bad(`the request carried more than its body: ${s.method} cookie=${!!h.cookie} referer=${h.referer || ''} type=${h['content-type']}`);
    }

    // A reader who comes back after the count has gone finds it on the
    // page's own bill: a request to another site whose bytes the browser
    // will not report, so the badge says "+" and the Receipt names it as
    // what it is, not as a third-party file.
    await visibility(page, 'visible');
    await page.click('#receiptBtn');
    await page.click('#receiptBtn');
    await page.waitForTimeout(300);
    const bill = await page.evaluate(() => ({
        badge: document.getElementById('carbonBadgeText').textContent,
        receipt: document.getElementById('receiptBody').textContent
    }));
    if (/^This page weighs \+ /.test(bill.badge) && /\* 1 off-site request not counted/.test(bill.receipt)) ok(`after the count: the badge reads "${bill.badge.slice(0, 32)}…" and the Receipt "* 1 off-site request not counted"`);
    else bad(`after the count, the badge reads "${bill.badge}" and the Receipt ${/off-site request/.test(bill.receipt) ? 'names' : 'does not name'} the request`);

    // Once per page view: after the count has gone, hidden, shown, hidden
    // again and left again, then really navigated away, and nothing more.
    await visibility(page, 'hidden');
    await leave(page);
    await page.goto(`${origin}/field-report.html`, { waitUntil: 'load' });
    await settle(page, 2);
    if (counts('index').length === 1) ok('once per page view: hiding and leaving again, then navigating away, sent nothing more');
    else bad(`the homepage sent ${counts('index').length} counts for one view`);

    // The first time the page is hidden is enough (a phone switching apps
    // may never fire pagehide at all).
    await visibility(page, 'hidden');
    await settle(page, 2);
    if (counts('field-report').length === 1) ok('hiding a page sends its count, as leaving does');
    else bad(`hiding the field report sent ${counts('field-report').length} counts, not 1`);
    await page.goto('about:blank');

    // Every page counts itself, under its own name and with the same eight
    // keys, and each count is one the server's own schema check (Code.gs,
    // run here as it is in the unit tests) accepts. The 404 page is served
    // at an address that does not exist, as GitHub Pages serves it.
    {
        const vm = require('vm');
        const gas = vm.createContext({});
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'google-apps-script', 'Code.gs'), 'utf8'), gas);
        await context.route('**/sustaintheworld/no/such/page', (route) => route.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', path: path.join(ROOT, '404.html') }));
        const everyPage = PAGES.filter(rel => rel !== '404.html').map(rel => [rel, rel.replace(/\.html$/, '')])
            .concat([['sustaintheworld/no/such/page', '404']]);
        const wrong = [];
        for (const [rel, name] of everyPage) {
            const p = await context.newPage();
            p.on('pageerror', (e) => errors.push(e.message));
            const before = sent.length;
            await p.goto(`${origin}/${rel}`, { waitUntil: 'load' });
            await leave(p);
            await settle(p, before + 1);
            const got = sent.slice(before).map((s) => { try { return JSON.parse(s.body); } catch (e) { return s.body; } });
            const b = got[0];
            if (got.length !== 1 || !b || JSON.stringify(Object.keys(b)) !== JSON.stringify(BEACON_KEYS) || b.page !== name || !gas.isBeaconV1(b)) {
                wrong.push(`${rel}: ${got.length} count(s) ${JSON.stringify(got)}`);
            }
            await p.close();   // its count has gone, so closing cannot send another
        }
        if (wrong.length) wrong.forEach(w => bad(`the count from ${w}`));
        else ok(`every page counts itself once, by name, with the documented keys, and the server accepts each: ${everyPage.map(([, n]) => n).join(', ')}`);
    }

    for (const [label, prop, value] of [['Do Not Track', 'doNotTrack', '1'], ['Global Privacy Control', 'globalPrivacyControl', true]]) {
        const p = await context.newPage();
        p.on('pageerror', (e) => errors.push(e.message));
        await p.addInitScript(([k, v]) => Object.defineProperty(Navigator.prototype, k, { configurable: true, get: () => v }), [prop, value]);
        const before = sent.length;
        await p.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await p.click('#receiptBtn');
        await visibility(p, 'hidden');
        await leave(p);
        await p.waitForTimeout(800);
        if (sent.length === before) ok(`nothing at all is sent under ${label}`);
        else bad(`the counter sent ${sent.length - before} request(s) under ${label}`);
        await p.goto('about:blank');
        await p.close();
    }

    // With JavaScript off there is no counter, so a visit sends nothing:
    // a hook followed and the page really left, and not one request made.
    {
        const bare = await openContext({ viewport: { width: 1280, height: 800 }, javaScriptEnabled: false });
        await record(bare);
        const p = await bare.newPage();
        p.on('request', (r) => { if (!r.url().startsWith(origin)) foreign.push(r.url()); });
        const before = sent.length;
        await p.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await p.click('[data-analytics="contact-hero"]');
        const ran = await p.evaluate(() => typeof window.mks !== 'undefined');
        await p.goto(`${origin}/field-report.html`, { waitUntil: 'load' });
        await p.waitForTimeout(500);
        if (sent.length === before && !ran) ok('nothing is sent with JavaScript off: the counter never runs');
        else bad(`with JavaScript off, the counter ${ran ? 'ran' : 'did not run'} and ${sent.length - before} count(s) went out`);
        await bare.close();
    }

    // script.js blocked: the page falls back to its no-JavaScript layout, but
    // the counter does not depend on script.js, and still counts the visit.
    {
        const blocked = await openContext({ viewport: { width: 1280, height: 800 } });
        await blocked.route('**/script.js', (route) => route.abort());
        await record(blocked);
        const p = await blocked.newPage();
        p.on('request', (r) => { if (!r.url().startsWith(origin) && r.url() !== COUNT_URL && !r.url().startsWith('about:')) foreign.push(r.url()); });
        p.on('pageerror', (e) => errors.push(e.message));
        const before = sent.length;
        await p.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await p.click('[data-analytics="contact-hero"]');
        await leave(p);
        await settle(p, before + 1);
        const got = sent.slice(before);
        let body = null;
        try { body = JSON.parse(got[0].body); } catch (e) { /* reported below */ }
        if (got.length === 1 && body && JSON.stringify(Object.keys(body)) === JSON.stringify(BEACON_KEYS) &&
            body.page === 'index' && body.features.includes('contact-hero')) {
            ok(`script.js blocked: still one count, with the documented keys and the hook followed (${body.features.join(', ')})`);
        } else {
            bad(`script.js blocked: ${got.length} count(s) — ${got.map(s => s.body).join(' | ') || 'none'}`);
        }
        // Had the count not gone, leaving now would send it past the route:
        // take its fetch away first.
        await p.evaluate(() => { window.fetch = () => Promise.resolve(); });
        await p.goto('about:blank');
        await blocked.close();
    }

    if (foreign.length) foreign.forEach(f => bad(`left the origin: ${f}`)); else ok('nothing but the count left the origin');
    if (errors.length) errors.forEach(e => bad(`uncaught: ${e}`)); else ok('no errors on the way');
    await page.close();
    await context.close();
}
