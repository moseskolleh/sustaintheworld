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
        if (rel === 'index.html') await exerciseAssay(page, r);
        if (rel === 'carbon-ai.html') await exerciseCarbonTool(page, r);

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

    await exerciseNavigation(browser, origin);

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
        else ok('nav: every item on one line and on screen, 1000–1920px (or the menu button instead)');
        await page.close();
    }

    await exerciseNarration(browser, origin);

    await browser.close();
    server.close();

    if (failures) { console.log(`\n  ${failures} problem(s)\n`); process.exit(1); }
    console.log('\n  Smoke test passed\n');
})().catch((e) => { console.error(e); server.close(); process.exit(1); });

// ------------------------------------------------------------------
// The Assay: grades an ad in the page, and sends nothing while it does
// ------------------------------------------------------------------
async function exerciseAssay(page, r) {
    const sent = [];
    const onRequest = (q) => sent.push(q.url());
    page.on('request', onRequest);
    await page.evaluate(() => document.getElementById('assay').scrollIntoView());
    await page.waitForFunction(() => window.mksAssay, null, { timeout: 5000 }).catch(() => null);
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
    // the box, less its padding and the arrow. It clipped at every width
    // from a 320px phone to a 1440px desktop.
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => document.fonts.ready);
        const clipped = await page.evaluate(() => {
            const ctx = document.createElement('canvas').getContext('2d');
            const out = [];
            document.querySelectorAll('select').forEach((sel) => {
                const cs = getComputedStyle(sel);
                ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
                const room = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 20;
                Array.from(sel.options).forEach((o) => {
                    if (ctx.measureText(o.textContent).width > room) out.push(`#${sel.id} "${o.textContent}"`);
                });
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
    await page.setViewportSize({ width: 1280, height: 800 });
    if (r.errors.length) r.errors.forEach(e => bad(e));
}

// ------------------------------------------------------------------
// In-page links, the theme switch and back to top, as a visitor meets them
// ------------------------------------------------------------------
// What jsdom cannot show: where the next Tab goes after the skip link, what
// Back does after a nav link, and what the one floating button covers on a
// phone's real layout. Reduced motion, so every jump lands at once.
async function exerciseNavigation(browser, origin) {
    console.log('  index.html — links, theme switch, back to top');
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
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
    await page.click('.nav-menu a[href="#skills"]');
    await page.goBack();
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ hash: location.hash, focus: document.activeElement.id }));
    if (back.hash === '#about' && back.focus === 'about') ok('Back after two nav links returns to #about, focus with it');
    else bad(`Back after two nav links: address ${back.hash || 'with no fragment'}, focus on "${back.focus}"`);

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
            light: document.body.classList.contains('light-mode'),
            chrome: document.querySelector('meta[name="theme-color"]').content,
            name: document.getElementById('themeToggle').getAttribute('aria-label')
        }));
        if (flipped.light && flipped.chrome === '#f4f6f0' && flipped.name === 'Switch to dark theme') ok('theme switch: a tap turns the page, the browser chrome and its own name to light');
        else bad(`theme switch: after a tap, light=${flipped.light}, theme-color ${flipped.chrome}, name "${flipped.name}"`);
    }
    await desk.close();

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
    const GUARDED = ['.hero-availability', '.hero-cta .btn', '.btn-submit', '.carbon-badge', '.receipt-btn', '.footer-fieldreport a', '.eco-mode-toggle', '.terminal-toggle'];
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
    else ok(`back to top: covers none of the hero's line and buttons, the send button or the footer's controls (${passes} crossings checked at 390x844)`);
    await phone.close();
}

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
    ok(`using every feature above fetched ${fmt(r.bytesSince())} more — modules, the map, and every image scrolled past`);
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
        let lo = 1000, hi = 1920;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (await fullMenu(mid)) hi = mid; else lo = mid; }
        const off = [];
        for (const w of new Set([320, 360, 390, 430, 768, lo, hi].concat(Array.from({ length: 47 }, (_, i) => 1000 + i * 20)))) {
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
                return null;
            });
            if (r) off.push(`${w}px: ${r}`);
        }
        if (off.length) off.forEach((o) => bad(`listen control ${o}`));
        else ok('listen control visible in the nav at every width, 320–1920px, without opening the menu');

        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => document.getElementById('about').scrollIntoView({ behavior: 'instant' }));
        await page.click('#listenBtn');
        const opened = await page.waitForFunction(() => window.mksLoaded && window.mksLoaded.dispatch &&
            !document.getElementById('dispatchBar').hidden, null, { timeout: 5000 }).then(() => true, () => false);
        if (!opened) { bad('pressing Listen did not open the player'); await context.close(); return; }

        const st = await page.evaluate(() => ({
            playing: window.FieldDispatch.state().playing,
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
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.evaluate(() => document.querySelector('.nav-menu a[href="#experience"]').click());
        await page.waitForTimeout(400);
        const landed = await page.evaluate(() => ({
            heading: Math.round(document.querySelector('#experience .section-title').getBoundingClientRect().top),
            player: Math.round(document.getElementById('dispatchBar').getBoundingClientRect().bottom)
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
    const withIntro = async (voice) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.addInitScript(voice ? STAND_IN_VOICE : NO_VOICE);
        const hits = [];
        await context.route('**/assets/audio/voice-manifest.json', (route) => route.fulfill({ json: manifest }));
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
        const fetched = await page.waitForFunction(() => window.FieldDispatch.state().playing === 'intro', null, { timeout: 5000 })
            .then(() => page.waitForTimeout(500)).then(() => hits.length > 0, () => false);
        if (fetched) ok('pressing it fetches assets/audio/intro.mp3 and plays Moses');
        else bad('pressing the offer did not fetch the recording');
        await context.close();
    }

    // No voice at all, but a recording: the control appears for him alone.
    {
        const { context, page, hits } = await withIntro(false);
        const shown = await page.waitForFunction(() => !document.getElementById('navListen').hidden, null, { timeout: 6000 })
            .then(() => true, () => false);
        if (shown && hits.length === 0) ok('no voice but a recording: the control appears (and still fetches nothing)');
        else bad(`no voice but a recording: the control ${shown ? 'appeared but fetched audio early' : 'never appeared'}`);
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
