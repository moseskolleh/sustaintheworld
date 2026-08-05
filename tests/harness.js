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

    // Execute the site scripts in the window context, in page order —
    // script.js reads window.VoiceScripts, so this one has to land first.
    window.eval(voiceJs);
    window.eval(js);

    process.removeListener('uncaughtException', onUncaught);

    return { window, errors, dom };
}

module.exports = { run, ROOT, html, js, voiceJs };
