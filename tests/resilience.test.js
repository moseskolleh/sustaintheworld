// Regression tests for the ways the page is expected to degrade rather than
// break: storage the browser refuses to hand over, keyboard shortcuts firing
// while a form control has focus, and narration with no engine to play it.
//
// Run with: node tests/resilience.test.js

const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// ===================================================================
// Blocked storage must not abort the script
// ===================================================================
// `localStorage.getItem('theme')` used to sit at module scope. With storage
// blocked the property access throws SecurityError, and everything defined
// after it — the theme toggle, low-energy mode, the narration player, the
// terminal — never initialised at all.
{
    const { window, errors } = run('dark', { storage: 'blocked' });
    const doc = window.document;

    const securityErrors = errors.filter((e) => {
        const s = String((e && e.message) || e);
        return /SecurityError|Access to storage/.test(s);
    });
    assert(securityErrors.length === 0, `Storage: a blocked store raises no uncaught error (${securityErrors.length} seen)`);

    // Each of these is defined at a different point in script.js. If an early
    // throw aborted the file, the later ones are the ones that go missing.
    assert(!!doc.querySelector('.theme-toggle'), 'Storage blocked: the theme toggle still mounts');
    assert(!!doc.getElementById('dispatchBar'), 'Storage blocked: the narration player still mounts (defined late in the file)');
    assert(doc.querySelectorAll('.listen-btn').length > 0, 'Storage blocked: listen buttons still render');
    assert(!!doc.getElementById('terminalToggle'), 'Storage blocked: the field terminal is still wired');
    assert(typeof window.FieldDispatch === 'object' && window.FieldDispatch !== null, 'Storage blocked: FieldDispatch is still exported');

    // The adapter itself must be usable and honest about what it can promise.
    const store = window.mksStorage;
    assert(!!store, 'Storage blocked: the safe adapter is exposed');
    assert(store.local.persistent === false, 'Storage blocked: the adapter reports that nothing will persist');
    assert(store.local.get('nothing-here', 'fallback') === 'fallback', 'Storage blocked: reads fall back to the supplied default');
    assert(store.local.set('k', 'v') === false, 'Storage blocked: a write reports that it did not persist');
    assert(store.local.get('k') === 'v', 'Storage blocked: the write is still readable in-memory for this session');
    store.local.remove('k');
    assert(store.local.get('k') === null, 'Storage blocked: remove clears the in-memory copy');

    // Interactions that write a preference must not throw either.
    const toggle = doc.querySelector('.theme-toggle');
    let threw = null;
    try {
        toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch (err) { threw = err; }
    assert(!threw, `Storage blocked: toggling the theme does not throw (${threw && threw.message})`);
    assert(doc.body.classList.contains('light-mode'), 'Storage blocked: the theme still changes, it just is not remembered');

    const eco = doc.getElementById('ecoModeToggle');
    threw = null;
    try {
        eco.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch (err) { threw = err; }
    assert(!threw, `Storage blocked: toggling low-energy mode does not throw (${threw && threw.message})`);
}

// With storage working, preferences must still actually persist — the point
// is graceful degradation, not silently dropping everyone's settings.
{
    const { window } = run('dark');
    const store = window.mksStorage;
    assert(store.local.persistent === true, 'Storage available: the adapter reports that writes persist');
    assert(store.local.set('mks-test', 'value') === true, 'Storage available: a write reports success');
    assert(window.localStorage.getItem('mks-test') === 'value', 'Storage available: the value really reaches localStorage');
    assert(store.local.get('theme') === 'dark', 'Storage available: seeded values are read back');
}

// No direct storage access may creep back into the shipped scripts.
{
    const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    const body = src.slice(src.indexOf('// PRELOADER'));   // skip the adapter itself
    const direct = body.match(/(?<!\.)\b(?:window\.)?(?:local|session)Storage\s*\./g) || [];
    assert(direct.length === 0, `Storage: nothing in script.js reaches past the adapter (found: ${direct.join(', ') || 'none'})`);
}

// ===================================================================
// Keyboard shortcuts must not hijack form controls
// ===================================================================
// Pressing "c" with a <select> focused scrolled the page to Contact instead
// of jumping to the option starting with C.
{
    const { window } = run('dark');
    const doc = window.document;

    // Record every scroll the shortcut handler would perform.
    let scrolled = [];
    window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id || this.tagName); };

    const press = (key, target, init) => {
        scrolled = [];
        const ev = new window.KeyboardEvent('keydown', Object.assign({ key, bubbles: true, cancelable: true }, init || {}));
        target.dispatchEvent(ev);
        return scrolled;
    };

    // A control genuinely on the page — the homepage widget's model picker is
    // exactly the case reported.
    const select = doc.querySelector('select');
    assert(!!select, 'Shortcut setup: the page has a <select> to focus');
    if (select) {
        assert(press('c', select).length === 0, 'Shortcut: "c" on a <select> does not scroll to Contact');
        assert(press('h', select).length === 0, 'Shortcut: "h" on a <select> does not scroll home');
    }

    const button = doc.querySelector('button');
    assert(press('c', button).length === 0, 'Shortcut: "c" on a <button> is ignored');

    const input = doc.getElementById('name');
    assert(!!input && press('c', input).length === 0, 'Shortcut: "c" in a text input is ignored');

    const textarea = doc.getElementById('message');
    assert(!!textarea && press('c', textarea).length === 0, 'Shortcut: "c" in a textarea is ignored');

    // contenteditable is not present in the markup, so build one.
    const editable = doc.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    doc.body.appendChild(editable);
    assert(press('c', editable).length === 0, 'Shortcut: "c" in a contenteditable region is ignored');

    // A child of a control counts as the control — events bubble from the
    // <span> inside a button, not from the button itself.
    const nested = doc.querySelector('button span') || (() => {
        const b = doc.createElement('button');
        const s = doc.createElement('span');
        b.appendChild(s);
        doc.body.appendChild(b);
        return s;
    })();
    assert(press('c', nested).length === 0, 'Shortcut: a keystroke on a control\'s child is ignored too');

    // Modified keystrokes are somebody else's: Ctrl+C is copy.
    assert(press('c', doc.body, { ctrlKey: true }).length === 0, 'Shortcut: Ctrl+C is left alone');
    assert(press('c', doc.body, { metaKey: true }).length === 0, 'Shortcut: Cmd+C is left alone');
    assert(press('c', doc.body, { altKey: true }).length === 0, 'Shortcut: Alt+C is left alone');

    // …and the shortcut must still work where it is supposed to.
    assert(press('c', doc.body).length === 1, 'Shortcut: "c" on the page body still jumps to Contact');
    assert(press('h', doc.body).length === 1, 'Shortcut: "h" on the page body still jumps home');
    assert(press('C', doc.body).length === 1, 'Shortcut: the uppercase form still works');
}

// ===================================================================
// Narration must not leave a dead player
// ===================================================================
// A failed recording used to switch into synth mode unconditionally. On a
// browser with no speech engine — headless Chrome, Linux without
// speech-dispatcher — that meant a player showing "playing" and no audio,
// with no way back.
{
    const { window, errors } = run('dark', { speech: 'none' });
    const doc = window.document;

    const speechErrors = errors.filter((e) => /speechSynthesis|SpeechSynthesisUtterance/.test(String((e && e.message) || e)));
    assert(speechErrors.length === 0, `No speech engine: nothing throws on load (${speechErrors.map(String).join('; ')})`);

    // Without an engine and without a manifest fetch resolving in jsdom, the
    // listen controls must stay hidden rather than offering a dead button.
    const wraps = Array.from(doc.querySelectorAll('.listen-wrap'));
    assert(wraps.length > 0, 'No speech engine: the listen controls are still built');
    assert(wraps.every(w => w.hidden), 'No speech engine and no recording: the listen controls stay hidden');

    const bar = doc.getElementById('dispatchBar');
    assert(!!bar && bar.hidden, 'No speech engine: the player is not left showing');
}

// The source-level guarantee: the failure path may not call into the speech
// engine without first checking that one exists.
{
    const src = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    const start = src.indexOf('const runSynth =');
    const body = src.slice(start, src.indexOf('const speakHuman', start));
    assert(start > -1, 'Fallback setup: found runSynth in script.js');
    assert(
        /if \(!canSpeak\(\)\)/.test(body) || /if \(!canSynth\)/.test(body),
        'Fallback: runSynth refuses to run when there is no speech engine'
    );

    const errorHandler = src.slice(src.indexOf("audioEl.addEventListener('error'"), src.indexOf("audioEl.addEventListener('error'") + 900);
    assert(
        /canSpeak\(\)|canSynth/.test(errorHandler),
        'Fallback: a failed recording checks for a speech engine before switching to it'
    );
}

// The behaviour itself: ask for narration on a browser with no speech engine
// and no recording, and see what the player actually does. play() awaits the
// manifest fetch, so the result lands a tick later.
function finish() {
    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    // The site script leaves timers running (slideshow, typewriter) which
    // would otherwise keep the process alive forever.
    process.exit(0);
}

{
    const { window } = run('dark', { speech: 'none' });
    const doc = window.document;
    const fd = window.FieldDispatch;

    fd.setMode('human', false);
    fd.play('hero');

    setTimeout(() => {
        const bar = doc.getElementById('dispatchBar');

        assert(!bar.hidden, 'Dead player: the bar stays up to explain itself rather than vanishing');
        assert(bar.classList.contains('dispatch-failed'), 'Dead player: the failure is visually distinct from being paused');

        const caption = bar.querySelector('.dispatch-caption').textContent;
        assert(/no speech voice|no recording|would not load/.test(caption), `Dead player: the caption says what failed ("${caption.slice(0, 60)}")`);

        assert(
            /again/i.test(bar.querySelector('.dispatch-play').getAttribute('aria-label') || ''),
            'Dead player: the play button offers a retry, not a resume'
        );
        assert(
            doc.querySelectorAll('.listen-btn.is-playing').length === 0,
            'Dead player: no listen button is left stuck in the playing state'
        );

        // Pressing the retry must not throw, whatever state it lands in.
        let threw = null;
        try {
            bar.querySelector('.dispatch-play').dispatchEvent(
                new window.MouseEvent('click', { bubbles: true, cancelable: true })
            );
        } catch (err) { threw = err; }
        assert(!threw, `Dead player: pressing retry does not throw (${threw && threw.message})`);

        finish();
    }, 150);
}
