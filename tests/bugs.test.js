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
// The dossier toggles used to be the page's href="#" links; they are buttons
// now, so a probe is put in the page before the scroll handler binds.
{
    const { window, errors } = run('dark', {
        before: (w) => {
            const a = w.document.createElement('a');
            a.href = '#';
            a.className = 'bug1-probe';
            w.document.body.appendChild(a);
        }
    });
    const viewDetails = window.document.querySelector('.bug1-probe');
    assert(!!viewDetails, 'Bug1 setup: an <a href="#"> is on the page');

    // Dispatch a real click
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    viewDetails.dispatchEvent(ev);

    const threw = errors.some((e) => {
        const s = String((e && e.message) || e);
        return s.includes('Invalid selector') || s.includes('SyntaxError');
    });
    assert(!threw, 'Bug1: smooth-scroll handler must not throw on href="#"');
}

// --- Dossiers open from a real button, by keyboard as well as mouse ---
{
    const { window } = run('dark');
    const doc = window.document;
    const cards = Array.from(doc.querySelectorAll('.project-card'));
    const toggles = cards.map(c => c.querySelector('h3 > button.project-toggle[type="button"]'));
    assert(cards.length > 0 && toggles.every(Boolean), `A11y: every dossier title is a button inside its heading (${toggles.filter(Boolean).length}/${cards.length})`);
    assert(!doc.querySelector('.project-summary[href], a.project-summary'), 'A11y: the summary is no longer one link around the whole card');

    const first = toggles[0];
    const details = doc.getElementById(first.getAttribute('aria-controls') || '');
    assert(!!details && details.classList.contains('project-details'), 'A11y: the button controls its dossier');
    first.click();   // what Enter or Space does to a button
    assert(first.getAttribute('aria-expanded') === 'true' && cards[0].classList.contains('expanded'), 'A11y: the button opens the dossier and says so');

    cards[1].querySelector('.project-head p').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert(cards[1].classList.contains('expanded') && !cards[0].classList.contains('expanded'), 'Mouse: clicking anywhere on a summary still opens it, and closes the other');
    assert(first.getAttribute('aria-expanded') === 'false', 'A11y: the closed dossier\'s button says collapsed');
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

    // A real button inside each figure; role=button on the <figure> itself
    // is not allowed and hides the caption from assistive technology.
    const item = doc.querySelector('.gallery-item');
    const open = item && item.querySelector('button.gallery-open');
    assert(
        !!open && open.getAttribute('type') === 'button' && /^View larger: ./.test(open.getAttribute('aria-label') || '') && !!open.querySelector('img'),
        'A11y: every gallery photo is inside a named button'
    );
    assert(!doc.querySelector('.gallery-item[role], .gallery-item[tabindex]'), 'A11y: the <figure> keeps its own semantics');

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
    const { SCRIPTS, INTRO, splitSentences } = require('../voice-scripts.js');

    assert(SCRIPTS.length > 0, 'Bug4 setup: voice scripts are defined');

    // Moses's introduction is split the same way, for its captions.
    let lossy = [];
    let fragmented = [];
    SCRIPTS.concat(INTRO ? [INTRO] : []).forEach((script) => {
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

// --- Bug 5: every narration script must name a section the player can find ---
// The one listen control reads the section in view and steps between them,
// finding each by its script's id (the hero's element is #home). A script
// whose id matches no section could never be reached; a section with no
// script would be skipped by "next" without a word.
{
    const { window } = run('dark');
    const doc = window.document;
    const { SCRIPTS } = require('../voice-scripts.js');

    const orphans = SCRIPTS.filter((s) => {
        if (s.id === 'hero') return !doc.getElementById('home');
        const section = doc.getElementById(s.id);
        return !(section && section.querySelector('.section-header'));
    }).map((s) => s.id);

    assert(orphans.length === 0, `Bug5: every voice script names a section on the page (orphans: ${orphans.join(', ') || 'none'})`);

    const headed = Array.from(doc.querySelectorAll('section[id]'))
        .filter((s) => s.querySelector('.section-header'))
        .map((s) => s.id);
    const scripted = new Set(SCRIPTS.map((s) => s.id));
    const unscripted = headed.filter((id) => !scripted.has(id));
    assert(unscripted.length === 0, `Bug5: every section header has a narration script the player can read (missing: ${unscripted.join(', ') || 'none'})`);

    // Ten per-section controls used to add eight-plus Tab stops. One now.
    const buttons = doc.querySelectorAll('.listen-btn');
    assert(buttons.length === 1, `Bug5: exactly one listen control (found ${buttons.length})`);
    assert(!!buttons[0] && !!buttons[0].closest('#navbar'), 'Bug5: the listen control is docked in the nav');

    // The sprite must carry the icons the control and player reference.
    ['i-play', 'i-pause', 'i-waveform', 'i-chevron-down'].forEach((id) => {
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
    assert(window.FieldDispatch.state().playing === null, 'Bug6: the player has nothing playing on load');

    const open = Array.from(doc.querySelectorAll('.listen-btn'))
        .filter((b) => b.getAttribute('aria-expanded') !== 'false');
    assert(open.length === 0, 'Bug6: the listen control reports aria-expanded="false" on load');
}

// --- Bug 8: "AI, Weighed" spends the split each workload's label promises ---
// Every preset used to be spent at a 50/50 mix whatever its label said, so a
// "1,000 in / 8,000 out" reasoning run came out a third too light.
{
    const { window } = run('dark');
    const doc = window.document;
    const data = window.AICarbonData;
    const preset = doc.getElementById('ecoPreset');
    const model = data.MODELS[data.HOMEPAGE_MODELS[0]];

    Array.from(preset.options).forEach((opt) => {
        const nums = (opt.textContent.match(/([\d,]+) in \/ ([\d,]+) out/) || []).slice(1).map(n => Number(n.replace(/,/g, '')));
        assert(
            nums.length === 2 && nums[0] === Number(opt.dataset.in) && nums[1] === Number(opt.dataset.out),
            `Bug8: the "${opt.value}" workload's data matches its label (${nums.join('/')} vs ${opt.dataset.in}/${opt.dataset.out})`
        );
    });

    doc.getElementById('ecoModel').value = '0';
    preset.value = 'reasoning';
    preset.dispatchEvent(new window.Event('change'));
    const shown = Number(doc.getElementById('ecoEnergy').textContent);
    const expected = data.energyForQuery(model, 1000, 8000) * data.PUE;
    assert(Math.abs(shown - expected) / expected < 0.05, `Bug8: a reasoning run is costed at 1,000 in / 8,000 out (${shown} Wh vs ${expected.toFixed(2)})`);

    // Small is not zero.
    const cells = Array.from(doc.querySelectorAll('#ecoCarbon, #ecoWater, #ecoEnergy, .eco-bar-val')).map(e => e.textContent.trim());
    const grids = doc.getElementById('ecoGrid');
    Array.from(grids.options).forEach((g) => {
        grids.value = g.value;
        preset.value = 'short';
        grids.dispatchEvent(new window.Event('change'));
        cells.push(...Array.from(doc.querySelectorAll('#ecoCarbon, .eco-bar-val')).map(e => e.textContent.trim()));
    });
    const zeros = cells.filter(t => /^0\.0+( g)?$/.test(t));
    assert(zeros.length === 0, `Bug8: no non-zero footprint is printed as 0.000 (${[...new Set(zeros)].join(', ') || 'none'})`);
}

// --- Bug 10: opening the terminal twice still returns focus on close ---
// A double press while the module loaded called open() twice; the second
// recorded the terminal's own input as where focus should go back to.
{
    const { window } = run('dark');
    const doc = window.document;
    const toggle = doc.getElementById('terminalToggle');
    toggle.focus();
    window.FieldTerminal.open();
    window.FieldTerminal.open();
    assert(window.FieldTerminal.isOpen(), 'Bug10 setup: the terminal is open');
    window.FieldTerminal.close();
    assert(doc.activeElement === toggle, `Bug10: closing returns focus to what had it before (${doc.activeElement && (doc.activeElement.id || doc.activeElement.tagName)})`);
}

// --- Bug 11: re-drilling a struck zone does not farm the score ---
// Each repeat of a known strike used to count as a new strike, so the score
// that is meant to converge on "read the curve: 70%" could be pushed to 100%.
{
    const { window } = run('dark');
    const doc = window.document;
    doc.body.classList.add('eco-mode');   // drilling finishes at once
    const stage = doc.getElementById('boreholeStage');
    const drillBtn = doc.getElementById('drillBtn');
    const result = doc.getElementById('drillResult');
    const score = doc.getElementById('drillScore');
    const key = (k) => stage.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const drill = () => drillBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    for (let i = 0; i < 80; i++) key('ArrowLeft');
    let struck = false;
    for (let i = 0; i < 80 && !struck; i++) {
        drill();
        struck = /STRIKE/.test(result.textContent);
        if (!struck) key('ArrowRight');
    }
    assert(struck, 'Bug11 setup: walking the rig along the profile finds water');

    const tally = score.textContent.match(/Strikes: (\d+)\/(\d+)/);
    drill();
    drill();
    const again = score.textContent.match(/Strikes: (\d+)\/(\d+)/);
    assert(
        !!tally && !!again && tally[1] === again[1] && tally[2] === again[2],
        `Bug11: re-drilling the same strike leaves the score alone (${tally && tally[0]} → ${again && again[0]})`
    );
    assert(/Already struck/.test(result.textContent), 'Bug11: and says why it did not count');
}

// --- Bug 7: a message the endpoint turns down says why ---
// The Apps Script answers a rejection with a reason written for the visitor
// ("a valid email address", "wait a moment"). The form used to throw that
// away and show the same generic error it shows when the network is down.
const formChecks = (async () => {
    const submit = async (respond) => {
        const { window } = run('dark');
        const doc = window.document;
        window.fetch = respond;
        doc.getElementById('name').value = 'Ada';
        doc.getElementById('email').value = 'ada@example.com';
        doc.getElementById('message').value = 'A question about groundwater.';
        doc.getElementById('contactForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 20));
        return doc.getElementById('formStatus');
    };
    const answer = (body) => async () => ({ ok: true, json: async () => body });

    const turnedDown = await submit(answer({ status: 'error', message: 'You just sent a message — please wait a moment before sending another.' }));
    assert(
        turnedDown.classList.contains('error') && /not sent/.test(turnedDown.textContent) && /wait a moment/.test(turnedDown.textContent),
        `Bug7: a rejection shows the endpoint's reason (${turnedDown.textContent})`
    );

    const offline = await submit(async () => { throw new TypeError('Failed to fetch'); });
    assert(
        offline.classList.contains('error') && /email me directly/.test(offline.textContent),
        'Bug7: when the endpoint cannot be reached, the visitor is pointed at email'
    );

    const sent = await submit(answer({ status: 'success', message: 'Response recorded successfully!' }));
    assert(sent.classList.contains('success') && !sent.hidden, 'Bug7: a recorded message is reported as sent');

    // --- Bug 9: a copy button gets its icon back after "Copied ✓" ---
    {
        const { window } = run('dark');
        const btn = window.document.getElementById('anatomyCopy');
        const before = btn.innerHTML;
        window.navigator.clipboard = { writeText: async () => {} };
        await window.mksShare.copy('x', btn);
        await window.mksShare.copy('x', btn);   // pressed again while it still says Copied
        assert(/Copied/.test(btn.textContent), 'Bug9: the button confirms the copy');
        await new Promise((resolve) => setTimeout(resolve, 1800));
        assert(btn.innerHTML === before && !!btn.querySelector('svg'), 'Bug9: the button is restored with its icon');
    }
})();

formChecks.then(() => {
    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    } else {
        console.log('\nAll assertions passed');
        // The site script leaves timers running (slideshow, typewriter) which
        // would otherwise keep the process alive forever.
        process.exit(0);
    }
}, (err) => {
    console.log('FAIL: form checks threw', err);
    process.exit(1);
});
