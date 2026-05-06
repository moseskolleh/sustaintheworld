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

    // Record scrollIntoView targets so tests can assert on navigation behavior
    const scrollTargets = [];
    window.HTMLElement.prototype.scrollIntoView = function () {
        scrollTargets.push(this.id || this.tagName);
    };
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

    return { window, errors, scrollTargets };
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

// --- Bug 3: Ctrl+C / Cmd+C must not hijack the universal Copy shortcut ---
//   Pre-fix repro: pressing Ctrl+C anywhere outside a form field scrolled
//   the page to #contact, stealing the user's clipboard shortcut.
{
    const { window, scrollTargets } = run('dark');
    scrollTargets.length = 0;
    const ev = new window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
    window.document.body.dispatchEvent(ev);
    assert(
        !scrollTargets.includes('contact'),
        'Bug3: Ctrl+C must not scroll the page to #contact (got: ' + scrollTargets.join(',') + ')'
    );
}

// --- Bug 4: search 'un' substring must not pre-empt longer keys ---
//   Pre-fix repro: query "Wageningen University" matched 'un' inside
//   "University" before reaching the 'wageningen' key, routing to the
//   experience timeline instead of the education section.
{
    const { window, scrollTargets } = run('dark');
    scrollTargets.length = 0;
    const heroSearch = window.document.getElementById('heroSearch');
    const searchBtn = window.document.querySelector('.search-btn');
    heroSearch.value = 'Wageningen University';
    searchBtn.click();
    assert(
        scrollTargets.includes('education') && !scrollTargets.includes('experience'),
        'Bug4: "Wageningen University" should route to #education, not #experience (got: ' + scrollTargets.join(',') + ')'
    );
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
} else {
    console.log('\nAll assertions passed');
}
