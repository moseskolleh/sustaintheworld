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
// Each marks itself in window.mks.loaded, which is how the core's loader
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
 *   before:  function(window)     runs after the stubs, before any site
 *                                 script — for installing fakes (a speech
 *                                 engine, a slow fetch) the scripts will see
 *   clock:   true                 the window's timers run on a fake clock
 *                                 that only moves when the test calls
 *                                 `await clock.tick(ms)` (see fakeClock)
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
    const clock = opts.clock ? fakeClock(window, errors) : null;

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

    // What index.html's <head> does before any of it: mark the page html.js.
    // Without the mark, script.js sees a late start (the failsafe took the
    // mark off), which a test asks for with `before` removing it.
    window.document.documentElement.classList.add('js');

    if (typeof opts.before === 'function') opts.before(window);

    // Execute the site scripts in the window context, in the order the
    // browser would: the two data files a module depends on, the core, then
    // the modules the core would have fetched on demand.
    window.eval(voiceJs);
    window.eval(dataJs);
    window.eval(js);
    moduleJs.forEach((src) => window.eval(src));

    process.removeListener('uncaughtException', onUncaught);

    return { window, errors, dom, clock };
}

/**
 * A clock for the window's timers that only moves when the test says so.
 *
 * The suites that exercise timing (a copy button restoring its icon after
 * 1.7 s, a player waiting on a slow manifest) used to sleep for real, which
 * made them the slowest thing in `npm test` and left the outcome to the
 * machine's load. Here setTimeout, setInterval and requestAnimationFrame
 * queue their callbacks, and `await clock.tick(ms)` runs every one that falls
 * due within ms, in time order, letting promise chains settle after each —
 * so a fetch mock that resolves, then a handler that awaits it, then a timer
 * that handler sets, all happen inside the same tick, as they would in ms of
 * real time. Date is left alone: nothing the suites drive measures elapsed
 * time with it. Fakes a test installs should use window.setTimeout, not
 * Node's, so they run on the same clock.
 */
function fakeClock(window, errors) {
    const timers = new Map();
    let now = 0;
    let nextId = 1;
    const schedule = (fn, ms, args, repeat) => {
        const id = nextId++;
        const delay = Math.max(0, Number(ms) || 0);
        timers.set(id, { at: now + delay, fn, args, every: repeat ? Math.max(1, delay) : 0 });
        return id;
    };
    const cancel = (id) => { timers.delete(id); };
    window.setTimeout = (fn, ms, ...args) => schedule(fn, ms, args, false);
    window.setInterval = (fn, ms, ...args) => schedule(fn, ms, args, true);
    window.clearTimeout = cancel;
    window.clearInterval = cancel;
    window.requestAnimationFrame = (fn) => schedule(() => fn(now), 16, [], false);
    window.cancelAnimationFrame = cancel;

    // One turn of Node's event loop: every queued microtask runs first.
    const settle = () => new Promise((resolve) => setImmediate(resolve));

    const tick = async (ms) => {
        const until = now + Math.max(0, Number(ms) || 0);
        await settle();
        // A timer that keeps rescheduling itself at 0 ms would never let
        // time reach `until`; a browser would throttle it, this reports it.
        for (let fired = 0; ; fired++) {
            if (fired > 100000) { errors.push(new Error('fake clock: 100000 timers in one tick — one keeps rescheduling itself')); break; }
            let due = null;
            timers.forEach((t, id) => {
                if (t.at <= until && (!due || t.at < due.t.at)) due = { id, t };
            });
            if (!due) break;
            now = due.t.at;
            if (due.t.every) due.t.at = now + due.t.every; else timers.delete(due.id);
            // A timer that throws is reported the way the browser reports
            // it, and the clock carries on.
            try { if (typeof due.t.fn === 'function') due.t.fn(...due.t.args); } catch (err) { errors.push(err); }
            await settle();
        }
        now = until;
    };

    return { tick, now: () => now, pending: () => timers.size };
}

module.exports = { run, ROOT, html, js, voiceJs, MODULE_FILES };
