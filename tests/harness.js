// Shared JSDOM harness for the site tests.
//
// Boots index.html with voice-scripts.js and script.js evaluated in page
// order, stubs the handful of APIs jsdom does not implement, and collects
// anything that threw so a test can assert on it.
//
// `options.storage` is the interesting one: 'blocked' replaces both storage
// objects with property getters that throw a SecurityError, which is what a
// browser does when storage is disabled by policy, by Lockdown Mode, or by
// third-party-cookie blocking inside an iframe. That reproduces the failure
// where one unguarded `localStorage.getItem` at module scope took the rest of
// script.js down with it.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
const voiceJs = fs.readFileSync(path.join(ROOT, 'voice-scripts.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(ROOT, 'ai-carbon-data.js'), 'utf8');

// The on-demand modules script.js fetches in the browser. Here they are
// evaluated straight after the core, in the order a visitor who used every
// feature would have loaded them, so the suites see the page fully built.
// Each marks itself in window.mksLoaded, which is how the core's loader
// knows not to inject a <script> for it.
const MODULE_FILES = [
    'modules/dossier.js',
    'modules/terminal.js',
    'modules/interactives.js',
    'modules/dispatch.js'
];
const moduleJs = MODULE_FILES.map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/**
 * @param {string} theme  value seeded into localStorage before the script runs
 * @param {object} options
 *   storage: 'ok' | 'blocked'   how window.localStorage/sessionStorage behave
 *   speech:  'none' | undefined  remove the speech synthesis API entirely
 */
function run(theme, options) {
    const opts = options || {};
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.com/' });
    const { window } = dom;

    if (opts.storage !== 'blocked') {
        // Seed localStorage before the script runs
        window.localStorage.setItem('theme', theme);
    }

    // Capture thrown errors from any listener (jsdom logs listener errors to console)
    const errors = [];
    window.addEventListener('error', (e) => errors.push(e.error || e.message));
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

    if (opts.storage === 'blocked') {
        // The throw is on the property access itself, not on getItem — which
        // is precisely why a try/catch around the call site was not enough.
        ['localStorage', 'sessionStorage'].forEach((name) => {
            Object.defineProperty(window, name, {
                configurable: true,
                get() {
                    const err = new window.DOMException(
                        'Access to storage is not allowed from this context.',
                        'SecurityError'
                    );
                    throw err;
                }
            });
        });
    }

    if (opts.speech === 'none') {
        delete window.speechSynthesis;
        delete window.SpeechSynthesisUtterance;
    }

    // Execute the site scripts in the window context, in the order the
    // browser would: the two data files a module depends on, the core, then
    // the modules the core would have fetched on demand.
    window.eval(voiceJs);
    window.eval(dataJs);
    window.eval(js);
    moduleJs.forEach((src) => window.eval(src));

    process.removeListener('uncaughtException', onUncaught);

    return { window, errors, dom };
}

module.exports = { run, ROOT, html, js, voiceJs, MODULE_FILES };
