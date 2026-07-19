// Regression tests for script.js + index.html.
// Run with: npm install && npm test

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
    const use = toggle && toggle.querySelector('use');
    const href = use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
    const isLight = window.document.body.classList.contains('light-mode');
    assert(isLight, 'Bug2 setup: body is in light-mode from localStorage');
    assert(
        href === '#i-sun',
        'Bug2: icon should be the sun symbol when loaded in light mode (was: ' + href + ')'
    );
}

// --- Accessibility & contact-form guarantees ---
{
    const { window } = run('dark');
    const doc = window.document;

    const toggle = doc.getElementById('navToggle');
    assert(!!toggle && toggle.tagName === 'BUTTON', 'A11y: nav toggle is a real <button>');
    assert(toggle && toggle.getAttribute('aria-expanded') === 'false', 'A11y: nav toggle starts collapsed');
    if (toggle) {
        toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        assert(toggle.getAttribute('aria-expanded') === 'true', 'A11y: nav toggle aria-expanded follows open state');
    }

    const item = doc.querySelector('.gallery-item');
    assert(
        !!item && item.getAttribute('tabindex') === '0' && item.getAttribute('role') === 'button',
        'A11y: gallery items are keyboard-focusable buttons'
    );

    assert(!!doc.getElementById('website'), 'Form: honeypot field is present');
    assert(!!doc.getElementById('formStatus'), 'Form: inline status element is present');

    const skip = doc.querySelector('.skip-link');
    assert(
        !!skip && skip.getAttribute('href') === '#main' && !!doc.getElementById('main'),
        'A11y: static skip link targets #main'
    );
}

// --- Bug 3: terminal 'drill' command in eco-mode must not double-fire done() ---
// Before the fix, the calm-mode branch invoked done() inline AND returned
// undefined, so runCommand (which calls done() unless fn returns true) fired
// the input.focus()/input.disabled=false side-effects a second time.
{
    const { window } = run('dark');
    const doc = window.document;
    doc.body.classList.add('eco-mode');

    const termToggle = doc.getElementById('terminalToggle');
    assert(!!termToggle, 'Bug3 setup: footer terminal toggle exists');
    termToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const ftInput = doc.getElementById('ftInput');
    assert(!!ftInput, 'Bug3 setup: terminal input mounted after toggle');

    // Count focus() calls AFTER the initial open() so we measure only the drill dispatch.
    let focusCount = 0;
    if (ftInput) ftInput.focus = () => { focusCount++; };

    ftInput.value = 'drill';
    const form = ftInput.closest('form');
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    assert(
        focusCount === 1,
        `Bug3: calm-mode drill should invoke done() exactly once (focus count was ${focusCount})`
    );
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
