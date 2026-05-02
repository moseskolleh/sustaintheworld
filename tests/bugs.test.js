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

// --- Bug 3: H/C keyboard shortcuts must not fire on Ctrl+C / Cmd+C / etc.,
//      and must not scroll the page while the project modal is open. ---
{
    const { window } = run('dark');
    const { document } = window;

    // Track every scrollIntoView call after we install the spy.
    const calls = [];
    window.HTMLElement.prototype.scrollIntoView = function () {
        calls.push(this.id || this.className || this.tagName);
    };

    // 3a) Ctrl+C must not navigate to #contact
    const ctrlC = new window.KeyboardEvent('keydown', {
        key: 'c', ctrlKey: true, bubbles: true, cancelable: true
    });
    document.body.dispatchEvent(ctrlC);
    const ctrlNavigated = calls.some(id => id === 'contact');
    assert(!ctrlNavigated, 'Bug3a: Ctrl+C must not scroll to #contact (calls=' + JSON.stringify(calls) + ')');

    // 3b) Cmd+H (mac) must not navigate to #home
    calls.length = 0;
    const metaH = new window.KeyboardEvent('keydown', {
        key: 'h', metaKey: true, bubbles: true, cancelable: true
    });
    document.body.dispatchEvent(metaH);
    assert(!calls.some(id => id === 'home'), 'Bug3b: Cmd/Meta+H must not scroll to #home (calls=' + JSON.stringify(calls) + ')');

    // 3c) Plain 'h' SHOULD still scroll (preserve the feature)
    calls.length = 0;
    const plainH = new window.KeyboardEvent('keydown', {
        key: 'h', bubbles: true, cancelable: true
    });
    document.body.dispatchEvent(plainH);
    assert(calls.some(id => id === 'home'), 'Bug3c: plain "h" should still scroll to #home (calls=' + JSON.stringify(calls) + ')');

    // 3d) When the project modal is open, plain 'c' must NOT scroll behind it
    calls.length = 0;
    const modal = document.getElementById('projectModal');
    modal.classList.add('active');
    const modalC = new window.KeyboardEvent('keydown', {
        key: 'c', bubbles: true, cancelable: true
    });
    document.body.dispatchEvent(modalC);
    assert(!calls.some(id => id === 'contact'), 'Bug3d: "c" while modal is open must not scroll behind it (calls=' + JSON.stringify(calls) + ')');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
} else {
    console.log('\nAll assertions passed');
}
