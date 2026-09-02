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

    // The homepage's measured first view against the budget's estimate. A
    // little slack for HTTP overhead, which the estimate does not model.
    const home = results['index.html'];
    if (home.arrivalBytes <= estimate * 1.02) {
        ok(`index.html: measured first view ${fmt(home.arrivalBytes)} is within the budget's estimate of ${fmt(estimate)}`);
    } else {
        bad(`index.html: measured first view ${fmt(home.arrivalBytes)} exceeds the budget's estimate of ${fmt(estimate)} — check-budget.js is missing something the page fetches on load`);
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
    const summary = await page.$('.project-card[data-project="groundwater"] .project-summary');
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
