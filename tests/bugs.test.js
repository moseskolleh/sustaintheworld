// Focused repro for two bugs in script.js.
// Run with: npm i --no-save jsdom && node tests/bugs.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

function run(theme) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.com/' });
    const { window } = dom;

    // Seed localStorage before script runs
    window.localStorage.setItem('theme', theme);

    // Capture thrown errors from any listener (jsdom logs listener errors to console)
    const errors = [];
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
    const origConsoleError = window.console.error;
    window.console.error = (...args) => {
        errors.push(args.map(String).join(' '));
        // swallow to keep test output clean
    };
    // Node-level: jsdom uses process.emit('uncaughtException') for some paths
    const onUncaught = (err) => errors.push(err);
    process.on('uncaughtException', onUncaught);

    // Stub things the script touches but jsdom doesn't fully implement
    window.HTMLElement.prototype.scrollIntoView = function () {};
    window.scrollTo = () => {};
    window.IntersectionObserver = class {
        constructor() {}
        observe() {}
        unobserve() {}
        disconnect() {}
    };
    window.requestAnimationFrame = (fn) => setTimeout(fn, 0);

    // Execute the site script in the window context
    window.eval(js);

    return { window, errors };
}

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// --- Bug 1: clicking an <a href="#"> should not throw SyntaxError ---
{
    const { window, errors } = run('dark');
    const viewDetails = window.document.querySelector('.view-details-btn');
    assert(!!viewDetails, 'Bug1 setup: found a .view-details-btn with href="#"');

    // Dispatch a real click
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    viewDetails.dispatchEvent(ev);

    const threw = errors.some((e) => {
        const s = String((e && e.message) || e);
        return s.includes('Invalid selector') || s.includes('SyntaxError');
    });
    assert(!threw, 'Bug1: smooth-scroll handler must not throw on href="#"');
}

// --- Bug 2: theme-toggle icon must match persisted theme on load ---
{
    const { window } = run('light');
    const toggle = window.document.querySelector('.theme-toggle');
    assert(!!toggle, 'Bug2 setup: theme toggle exists');
    const icon = toggle && toggle.querySelector('i');
    const isLight = window.document.body.classList.contains('light-mode');
    assert(isLight, 'Bug2 setup: body is in light-mode from localStorage');
    assert(
        icon && icon.classList.contains('fa-sun'),
        'Bug2: icon should be fa-sun when loaded in light mode (was: ' + (icon && icon.className) + ')'
    );
}

// --- Bug 3: PUE tip must fire at the enterprise-preset value (1.4) ---
// carbon-ai.js's suggest() gated on `pue > 1.4`, so the enterprise preset
// (which sets pue: 1.4 exactly) never surfaced the warning it was designed
// to trigger. `>=` closes the discontinuity.
{
    const carbon = require('../carbon-ai.js');
    const base = {
        modelKey: 'gpt-4o',
        regionKey: 'us-avg',
        wueKey: 'avg',
        inputTokens: 800,
        outputTokens: 1200,
        queriesPerDay: 100000,
        pue: 1.4
    };
    const tips = carbon.suggest(base);
    const hasPueTip = tips.some((t) => /PUE/.test(t.text));
    assert(hasPueTip, 'Bug3: PUE tip fires at the enterprise preset value (pue = 1.4)');
}

// --- Bug 4: theme applied before first paint (no dark-mode FOUC in light mode) ---
// script.js sets body.light-mode near the end of <body>, so a returning
// light-mode visitor briefly renders in dark. An inline <script> early in
// <body> must apply the class before the DOM paints.
{
    const raw = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const bodyOpen = raw.indexOf('<body');
    const bodyEnd = raw.indexOf('>', bodyOpen) + 1;
    const firstNonScript = raw.indexOf('<div', bodyEnd);
    const preContent = raw.slice(bodyEnd, firstNonScript);
    const hasEarlyThemeScript =
        /<script[^>]*>[\s\S]*?localStorage[\s\S]*?theme[\s\S]*?light-mode[\s\S]*?<\/script>/i.test(preContent);
    assert(
        hasEarlyThemeScript,
        'Bug4: inline theme script runs before any renderable body content (avoids FOUC)'
    );
}

// --- Bug 5: contact-form success alert must not falsely claim delivery ---
// With mode: 'no-cors', fetch resolves opaquely for any server reply
// (200, 500, revoked deployment). The old alert claimed "submitted
// successfully" unconditionally — misleading on real failure. The new
// wording says "sent" and gives an email fallback.
{
    const scriptSrc = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    const noFalseClaim = !/submitted successfully/i.test(scriptSrc);
    assert(noFalseClaim, 'Bug5: contact-form alert does not claim "submitted successfully"');
    const hasFallback = /email me directly/i.test(scriptSrc);
    assert(hasFallback, 'Bug5: contact-form alert surfaces the direct-email fallback');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
} else {
    console.log('\nAll assertions passed');
    // The site script leaves timers running (slideshow, typewriter) which
    // would otherwise keep the process alive forever.
    process.exit(0);
}
