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

// --- Project cards: a heading and one named link each, nothing to open ---
// The six dossiers opened from a button and hid their stories until then.
// The cards that replaced them hide nothing: each is a heading, its text,
// and one link to the whole story, named for the project it leads to.
{
    const { window, errors } = run('dark');
    const doc = window.document;
    const cards = Array.from(doc.querySelectorAll('#projects .project-card'));
    assert(cards.length === 6 && errors.length === 0, `Cards: six project cards, and the page boots without errors (${cards.length}, ${errors.length} errors)`);
    const links = cards.map(c => Array.from(c.querySelectorAll('a[href]')));
    assert(links.every(l => l.length === 1 && /^case-studies\.html#[a-z-]+$/.test(l[0].getAttribute('href'))),
        'Cards: each has exactly one link, to its case study by id');
    const names = links.map(l => l[0].textContent.replace(/\s+/g, ' ').trim());
    assert(names.every((n, i) => n === `Read the case study: ${cards[i].querySelector('h3').textContent.trim()}`),
        `Cards: each link is named for its project, so six links do not all read the same (${names[0]})`);
    assert(!doc.querySelector('#projects button, #projects [aria-expanded], #projects [inert]'),
        'Cards: nothing on a card opens, closes or is held back');
}

// --- Bug 2: theme-toggle icon must match persisted theme on load ---
{
    const { window } = run('light');
    const toggle = window.document.querySelector('.theme-toggle');
    assert(!!toggle, 'Bug2 setup: theme toggle exists');
    const use = toggle && toggle.querySelector('use');
    const href = use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
    const isLight = window.document.documentElement.classList.contains('light-mode');
    assert(isLight, 'Bug2 setup: the page is in light-mode from localStorage');
    assert(
        href === '#i-sun',
        'Bug2: icon should be the sun symbol when loaded in light mode (was: ' + href + ')'
    );
}

// --- Accessibility & contact-form guarantees ---
// (The photos and their lightbox moved to case-studies.html with the
// stories they belong to: tests/phone.test.js holds them to theirs.)
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
    assert(window.mks.narration.state().playing === null, 'Bug6: the player has nothing playing on load');

    const open = Array.from(doc.querySelectorAll('.listen-btn'))
        .filter((b) => b.getAttribute('aria-expanded') !== 'false');
    assert(open.length === 0, 'Bug6: the listen control reports aria-expanded="false" on load');
}

// --- Bug 8: the calculator spends the split it is given ---
// The homepage's "AI, Weighed" presets were spent at a 50/50 mix whatever
// their labels said, so a "1,000 in / 8,000 out" reasoning run came out a
// third too light. That calculator did the same job as the one on
// carbon-ai.html and has been merged into it, where the split is typed in;
// this holds that page to it, and the homepage to having no second one.
{
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');
    const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

    const home = run('dark').window.document;
    assert(!home.querySelector('#ecoModel, #ecoPreset, .eco-widget'), 'Bug8: the homepage carries no second calculator (it is on carbon-ai.html)');

    const w = new JSDOM(read('carbon-ai.html'), { runScripts: 'outside-only', url: 'https://example.com/carbon-ai.html' }).window;
    w.eval(read('ai-carbon-data.js'));
    w.eval(read('carbon-ai.js'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    const doc = w.document;
    const data = w.AICarbonData;
    const set = (id, v) => { const el = doc.getElementById(id); el.value = String(v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };

    set('modelSelect', 'gpt-4o');
    set('pue', data.PUE);
    set('inputTokens', 1000);
    set('outputTokens', 8000);
    const shown = Number(doc.getElementById('outEnergy').textContent);
    const expected = data.energyForQuery(data.MODELS['gpt-4o'], 1000, 8000) * data.PUE;
    assert(Math.abs(shown - expected) / expected < 0.01, `Bug8: a reasoning run is costed at 1,000 in / 8,000 out (${shown} Wh vs ${expected.toFixed(3)})`);

    // Small is not zero: the smallest model's quick question, on every grid.
    set('modelSelect', 'llama-32-1b');
    set('inputTokens', 100);
    set('outputTokens', 300);
    const cells = [];
    Array.from(doc.getElementById('regionSelect').options).forEach((g) => {
        set('regionSelect', g.value);
        cells.push(...Array.from(doc.querySelectorAll('#outCarbon, #outWater, #outEnergy')).map(e => e.textContent.trim()));
    });
    const zeros = cells.filter(t => /^0(\.0+)?$/.test(t));
    assert(cells.length > 30 && zeros.length === 0, `Bug8: no non-zero footprint is printed as 0 (${[...new Set(zeros)].join(', ') || 'none'} in ${cells.length})`);
}

// --- Bug 10: opening the terminal twice still returns focus on close ---
// A double press while the module loaded called open() twice; the second
// recorded the terminal's own input as where focus should go back to.
{
    const { window } = run('dark');
    const doc = window.document;
    const toggle = doc.getElementById('terminalToggle');
    toggle.focus();
    window.mks.terminal.open();
    window.mks.terminal.open();
    assert(window.mks.terminal.isOpen(), 'Bug10 setup: the terminal is open');
    window.mks.terminal.close();
    assert(doc.activeElement === toggle, `Bug10: closing returns focus to what had it before (${doc.activeElement && (doc.activeElement.id || doc.activeElement.tagName)})`);
}

// --- Bug 11: re-drilling a struck zone does not farm the score ---
// The borehole game moved to the groundwater case study with its fix:
// tests/widgets.test.js holds it there.

// --- Bug 12: You Draw It hands focus on when the pressed button goes ---
// Reveal hid itself while focused, and so did "Draw again": focus dropped to
// the page, and a screen reader said nothing of where it had gone.
{
    const { window } = run('dark');
    const doc = window.document;
    const hit = doc.querySelector('#ydiSvg .ydi-hit');
    const reveal = doc.getElementById('ydiReveal');
    const share = doc.getElementById('ydiShare');
    const reset = doc.getElementById('ydiReset');
    hit.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    reveal.focus();
    reveal.click();
    assert(reveal.hidden && !share.hidden && doc.activeElement === share,
        `Bug12: after Reveal, focus is on "Share result", which takes its place (on ${doc.activeElement && (doc.activeElement.id || doc.activeElement.tagName)})`);
    reset.focus();
    reset.click();
    assert(reset.hidden && !reveal.hidden && doc.activeElement === reveal,
        `Bug12: after "Draw again", focus is back on Reveal (on ${doc.activeElement && (doc.activeElement.id || doc.activeElement.tagName)})`);
    hit.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    hit.focus();
    hit.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(reveal.hidden && doc.activeElement === hit, 'Bug12: revealing from the chart with Enter leaves focus on the chart');
}

// --- You Draw It: the guess being drawn is spoken ---
// The chart was role=application, where a value is not allowed, so the
// guess each arrow set was dropped and a screen reader heard nothing (axe:
// aria-allowed-attr, critical, once the chart had focus). It is a slider
// now, its value the guess at the cursor, kept up to date as it moves.
{
    const { window } = run('dark');
    const doc = window.document;
    const hit = doc.querySelector('#ydiSvg .ydi-hit');
    const press = (k) => hit.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const said = () => ({ now: hit.getAttribute('aria-valuenow'), text: hit.getAttribute('aria-valuetext') || '' });
    const agrees = (s) => s.now !== null && s.text.includes(`your guess ${s.now} Wh`);
    const before = said();
    assert(hit.getAttribute('role') === 'slider' && hit.getAttribute('aria-valuemin') === '0' && +hit.getAttribute('aria-valuemax') > 1 && agrees(before),
        `YDI: the chart is a slider whose value is the guess at its cursor, before any key (${hit.getAttribute('role')}, ${before.now}, "${before.text}")`);
    press('ArrowUp');
    const up = said();
    press('ArrowRight');
    const right = said();
    assert(agrees(up) && +up.now > +before.now && agrees(right) && right.text !== up.text,
        `YDI: raising the guess and moving to the next model each change what it says ("${up.text}", then "${right.text}")`);
    // The keys a slider promises. Home, End and the Page keys fell through
    // to the page, which scrolled to its top or its footer and left focus on
    // a chart out of sight, its guess still moving with the next arrow.
    const max = hit.getAttribute('aria-valuemax');
    const taken = (k) => {
        const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
        hit.dispatchEvent(ev);
        return { k, kept: ev.defaultPrevented, now: said().now };
    };
    const home = taken('Home'), pgUp = taken('PageUp'), arrow = taken('ArrowUp'), end = taken('End'), pgDown = taken('PageDown');
    const keys = [home, pgUp, end, pgDown];
    assert(keys.every(x => x.kept) && +home.now === 0 && (+pgUp.now - +home.now) > 3 * (+arrow.now - +pgUp.now) &&
        end.now === Number(max).toFixed(2) && +pgDown.now < +end.now && agrees(said()) && /Home, End/.test(hit.getAttribute('aria-label')),
        `YDI: Home and End set the guess to the axis's ends, the Page keys move it four arrow steps, none scrolls the page, and the name says so (${keys.map(x => `${x.k} ${x.now}`).join(', ')})`);
    const other = taken('Tab');
    assert(!other.kept, 'YDI: any other key, Tab among them, is left to the browser');
    // An image's content is not read, so it may hold no control (axe:
    // nested-interactive): the chart is a group, and its drawn words are
    // hidden, as the data table says them.
    const svg = doc.getElementById('ydiSvg');
    const loud = Array.from(svg.querySelectorAll('text')).filter(t => t.getAttribute('aria-hidden') !== 'true');
    assert(svg.getAttribute('role') === 'group' && !!svg.getAttribute('aria-label') && svg.querySelectorAll('text').length > 10 && loud.length === 0,
        `YDI: the chart is a named group around its slider, its ${svg.querySelectorAll('text').length} drawn words hidden from a screen reader (${loud.length} not)`);
}

// --- Bug 7: a message the endpoint turns down says why ---
// The Apps Script answers a rejection with a reason written for the visitor
// ("a valid email address", "wait a moment"). The form used to throw that
// away and show the same generic error it shows when the network is down.
const formChecks = (async () => {
    const submit = async (respond) => {
        const { window, clock } = run('dark', { clock: true });
        const doc = window.document;
        window.fetch = respond;
        doc.getElementById('name').value = 'Ada';
        doc.getElementById('email').value = 'ada@example.com';
        doc.getElementById('message').value = 'A question about groundwater.';
        doc.getElementById('contactForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        await clock.tick(20);
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
        const { window, clock } = run('dark', { clock: true });
        // The Assay's copy button: Anatomy's, the first one reported, is on
        // carbon-ai.html now, with its own copy (tests/carbon.test.js).
        window.document.querySelector('.assay-sample').click();
        const btn = window.document.querySelector('.assay-copy');
        const before = btn.innerHTML;
        window.navigator.clipboard = { writeText: async () => {} };
        await window.mks.share.copy('x', btn);
        await window.mks.share.copy('x', btn);   // pressed again while it still says Copied
        assert(/Copied/.test(btn.textContent), 'Bug9: the button confirms the copy');
        await clock.tick(1800);
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
