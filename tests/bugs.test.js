// Regression tests for script.js + index.html.
// Run with: npm install && npm test

const { run } = require('./harness.js');

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

// --- Bug 4: narration sentence-splitting must not corrupt the scripts ---
// The splitter parks initialisms (A.I., E.S.G., Arc.G.I.S.) behind a sentinel
// so a sentence break is never taken mid-acronym, then restores them. An
// earlier version used a bare-digit sentinel, which chewed through the real
// numbers in the copy ("164 water points"). Both halves are asserted here.
{
    const { SCRIPTS, splitSentences } = require('../voice-scripts.js');

    assert(SCRIPTS.length > 0, 'Bug4 setup: voice scripts are defined');

    let lossy = [];
    let fragmented = [];
    SCRIPTS.forEach((script) => {
        const parts = splitSentences(script.text);
        const norm = (s) => s.replace(/\s+/g, ' ').trim();
        if (norm(parts.join(' ')) !== norm(script.text)) lossy.push(script.id);
        // A sentence starting lowercase means the break landed mid-thought —
        // the tell for a split taken inside an abbreviation.
        parts.forEach((p) => { if (/^[a-z]/.test(p)) fragmented.push(`${script.id}:"${p.slice(0, 30)}"`); });
    });

    assert(lossy.length === 0, `Bug4: every script must round-trip through splitSentences (lossy: ${lossy.join(', ') || 'none'})`);
    assert(fragmented.length === 0, `Bug4: no sentence should start mid-word (${fragmented.slice(0, 3).join(', ') || 'none'})`);

    const journey = splitSentences(SCRIPTS.find((s) => s.id === 'journey').text).join(' ');
    assert(journey.includes('a hundred and sixty-four'), 'Bug4: spelled-out numbers survive the sentinel round-trip');

    const skills = splitSentences(SCRIPTS.find((s) => s.id === 'skills').text);
    assert(
        skills.some((p) => p.includes('Q.G.I.S. and Arc.G.I.S.')),
        'Bug4: initialisms stay intact across a sentence boundary'
    );
}

// --- Bug 5: every narration script must have somewhere to mount ---
// A script whose id does not match a section leaves its listen button
// silently unrendered, which is invisible until someone goes looking for it.
{
    const { window } = run('dark');
    const doc = window.document;
    const { SCRIPTS } = require('../voice-scripts.js');

    const orphans = SCRIPTS.filter((s) => {
        if (s.id === 'hero') return !doc.querySelector('.hero-cta');
        const section = doc.getElementById(s.id);
        return !(section && section.querySelector('.section-header'));
    }).map((s) => s.id);

    assert(orphans.length === 0, `Bug5: every voice script has a mount point (orphans: ${orphans.join(', ') || 'none'})`);

    // The reverse holds too. The player loads on demand, so until someone
    // presses "listen" the core renders a stand-in control in every section
    // header. A header for a section with no narration script would get a
    // button that loads the player and then reads nothing.
    const headed = Array.from(doc.querySelectorAll('section[id]'))
        .filter((s) => s.querySelector('.section-header'))
        .map((s) => s.id);
    const scripted = new Set(SCRIPTS.map((s) => s.id));
    const unscripted = headed.filter((id) => !scripted.has(id));
    assert(unscripted.length === 0, `Bug5: every section header has a narration script behind its listen control (missing: ${unscripted.join(', ') || 'none'})`);

    const buttons = doc.querySelectorAll('.listen-btn');
    assert(
        buttons.length === SCRIPTS.length,
        `Bug5: one listen button per script (expected ${SCRIPTS.length}, found ${buttons.length})`
    );

    // The sprite must carry the icons the buttons and player reference.
    ['i-play', 'i-pause'].forEach((id) => {
        assert(!!doc.getElementById(id), `Bug5: sprite defines #${id}`);
    });
}

// --- Bug 6: narration must never start on its own ---
// Autoplaying audio is the failure mode this feature has to avoid, and it
// would also violate the page's low-energy contract.
{
    const { window } = run('dark');
    const doc = window.document;

    const bar = doc.getElementById('dispatchBar');
    assert(!!bar, 'Bug6 setup: the dispatch bar is mounted');
    assert(bar.hidden === true, 'Bug6: the player stays hidden until asked for');

    const playing = doc.querySelectorAll('.listen-btn.is-playing');
    assert(playing.length === 0, 'Bug6: no section is narrating on load');

    const pressed = Array.from(doc.querySelectorAll('.listen-btn'))
        .filter((b) => b.getAttribute('aria-pressed') !== 'false');
    assert(pressed.length === 0, 'Bug6: every listen button reports aria-pressed="false" on load');
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
