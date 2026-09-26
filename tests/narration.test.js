// Tests for the narration player (modules/dispatch.js) and the one listen
// control in the nav that opens it.
//
// resilience.test.js covers what the player does when an engine is missing.
// These cover how the docked control behaves, the slot for Moses's own
// recorded introduction, and what happens when things arrive in an order the
// player did not expect — which is where the real bugs were:
//
//   - a speech engine delivers the end/error event of a cancelled utterance
//     after the next section has started (Chrome does, and so does the spec),
//     and the old handlers advanced the new section with the old sentences;
//   - stopping a recording before it began rejected play() with an
//     AbortError, and the player reported that as the browser blocking it.
//
// Run with: node tests/narration.test.js

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const click = (window, node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

// What voice-intro.js writes once Moses has recorded his introduction.
const INTRO_TRACK = {
    file: 'assets/audio/intro.mp3',
    bytes: 626688,
    grams: 0.215,
    seconds: 78.3,
    voiceKind: 'recorded',
    voiceTitle: 'Moses Kolleh Sesay'
};
const EMPTY = { tracks: {} };
const WITH_INTRO = { tracks: { intro: INTRO_TRACK } };

/** A speech engine that behaves like Chrome's: cancel() reports later. */
function fakeSpeech(window, spoken) {
    const queue = [];
    let speaking = null;
    const fire = (u, type) => setTimeout(() => { if (u['on' + type]) u['on' + type]({ type }); }, 0);
    const startNext = () => {
        if (speaking || !queue.length) return;
        const u = speaking = queue.shift();
        spoken.push(u.text);
        u.timer = setTimeout(() => { if (speaking === u) { speaking = null; fire(u, 'end'); startNext(); } }, 15);
    };
    const synth = {
        getVoices: () => [{ name: 'Fake', lang: 'en-GB', localService: true, default: true }],
        speak(u) { queue.push(u); startNext(); },
        cancel() {
            const s = speaking;
            speaking = null;
            if (s) { clearTimeout(s.timer); fire(s, 'error'); }
            queue.splice(0).forEach(u => fire(u, 'error'));
        },
        pause() {}, resume() {},
        get speaking() { return !!speaking; }, get paused() { return false; }, get pending() { return queue.length > 0; },
        addEventListener() {}, removeEventListener() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
}

/** Media elements that start after `delay`, and abort when paused first, as browsers do. */
function fakeAudio(window, played, delay) {
    const proto = window.HTMLMediaElement.prototype;
    proto.play = function () {
        played.push(this.getAttribute('src'));
        return new Promise((resolve, reject) => {
            this.pending = reject;
            setTimeout(() => { if (this.pending === reject) { this.pending = null; resolve(); } }, delay);
        });
    };
    proto.pause = function () {
        if (this.pending) {
            const reject = this.pending;
            this.pending = null;
            reject(new window.DOMException('The play() request was interrupted by a call to pause().', 'AbortError'));
        }
    };
    proto.load = function () {};
}

/** A manifest fetch that takes `delay` ms, like one on a real network. Counts what was asked for. */
const slowFetch = (window, delay, body, asked) => {
    window.fetch = (url) => {
        if (asked) asked.push(String(url));
        return new Promise((resolve) => setTimeout(() => resolve({
            ok: !!body,
            json: async () => body
        }), delay));
    };
};

(async () => {
    // --- A cancelled utterance must not drive the next section ------------
    {
        const spoken = [];
        const { window } = run('dark', {
            before: (w) => {
                fakeSpeech(w, spoken);
                slowFetch(w, 0, EMPTY);   // no recording: this is the browser voice alone
            }
        });
        const scripts = window.VoiceScripts.byId;

        window.FieldDispatch.play('about');
        await wait(30);
        assert(spoken.length > 0, 'Switching setup: the first section started speaking');

        const mark = spoken.length;
        window.FieldDispatch.play('projects');
        await wait(600);
        const after = spoken.slice(mark);

        const strays = after.filter(line => !scripts.projects.text.includes(line.trim()));
        assert(after.length > 1 && strays.length === 0, `Switching sections: only the new section is spoken (${strays.length} lines from elsewhere)`);

        const lastLine = after[after.length - 1] || '';
        assert(scripts.projects.text.trim().endsWith(lastLine.trim()), 'Switching sections: the new section is read to its last sentence');
        assert(window.FieldDispatch.state().playing === null, 'Switching sections: the player stops when the section ends');
    }

    // --- One control, docked, reading the section in view -----------------
    {
        const spoken = [];
        const asked = [];
        const { window } = run('dark', {
            before: (w) => {
                fakeSpeech(w, spoken);
                slowFetch(w, 0, EMPTY, asked);
            }
        });
        const doc = window.document;
        const wrap = doc.getElementById('navListen');
        const btn = doc.getElementById('listenBtn');
        const bar = doc.getElementById('dispatchBar');

        assert(doc.querySelectorAll('.listen-btn').length === 1, 'Docked: exactly one listen control on the page');
        assert(!!wrap && !wrap.hidden, 'Docked: with a voice available, the control is shown');
        assert(wrap.previousElementSibling === doc.getElementById('navMenu'), 'Docked: it sits in the nav, straight after the menu');
        assert(bar.previousElementSibling === wrap, 'Docked: the player comes right after it, so it is next in Tab order');
        assert(btn.getAttribute('aria-expanded') === 'false' && btn.getAttribute('aria-controls') === 'dispatchBar', 'Docked: the control is a disclosure for the player, closed on load');

        // Put the reader in the About section: everything above it has
        // scrolled past, everything below is still to come.
        const order = window.VoiceScripts.SCRIPTS.map(s => s.id);
        const aboutAt = order.indexOf('about');
        order.forEach((id, i) => {
            const node = doc.getElementById(id === 'hero' ? 'home' : id);
            node.getBoundingClientRect = () => ({ top: i < aboutAt ? -2000 : (i === aboutAt ? 80 : 1600 + i * 900), bottom: 0, left: 0, right: 0, width: 0, height: 0 });
        });

        // The player hangs below the nav bar, so jumps have to clear it too.
        bar.getBoundingClientRect = () => ({ top: 80, bottom: 180, left: 8, right: 382, width: 374, height: 100 });
        click(window, btn);
        await wait(30);
        assert(!bar.hidden && btn.getAttribute('aria-expanded') === 'true', 'Docked: a press opens the player');
        assert(doc.documentElement.style.scrollPaddingTop === '188px', `Docked: while open, jumps and Tab stops land below the player (scroll-padding-top ${doc.documentElement.style.scrollPaddingTop || 'unset'})`);
        assert(window.FieldDispatch.state().playing === 'about', `Docked: it reads the section in view (${window.FieldDispatch.state().playing})`);
        assert(/03 \/ 10 · the about section/i.test(bar.querySelector('.dispatch-title').textContent), `Docked: the player says which section, and where it is (${bar.querySelector('.dispatch-title').textContent})`);
        assert(/0 KB transferred/.test(bar.querySelector('.dispatch-weight').textContent), 'Docked: the browser voice is labelled 0 KB transferred');
        assert(!asked.some(u => /\.mp3/.test(u)), 'Docked: nothing but the manifest was fetched — no audio');

        // Moving between sections, from the player.
        const [prev, next] = Array.from(bar.querySelectorAll('.dispatch-step'));
        assert(/Next section: the experience log/.test(next.getAttribute('aria-label')), `Steps: "next" names where it goes (${next.getAttribute('aria-label')})`);
        click(window, next);
        await wait(30);
        assert(window.FieldDispatch.state().playing === 'experience', 'Steps: next reads the following section');
        assert(!bar.hidden, 'Steps: moving on does not close the player under the listener');
        click(window, prev);
        click(window, prev);
        await wait(30);
        assert(window.FieldDispatch.state().playing === 'journey', 'Steps: previous goes back a section at a time');

        window.FieldDispatch.play('hero');
        await wait(10);
        assert(prev.getAttribute('aria-disabled') === 'true' && !prev.disabled, 'Steps: at the first section, "previous" says it is unavailable but keeps focus');
        click(window, prev);
        await wait(10);
        assert(window.FieldDispatch.state().playing === 'hero', 'Steps: …and does nothing when pressed');

        // Closing hands the keyboard back.
        bar.querySelector('.dispatch-rate').focus();
        bar.querySelector('.dispatch-rate').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert(bar.hidden && btn.getAttribute('aria-expanded') === 'false', 'Close: Escape inside the player closes it');
        assert(doc.documentElement.style.scrollPaddingTop === '', 'Close: jumps go back to clearing the nav bar alone (style.css)');
        assert(doc.activeElement === btn, 'Close: focus returns to the Listen button, not the top of the page');

        click(window, btn);
        await wait(20);
        click(window, btn);
        await wait(20);
        assert(bar.hidden && window.FieldDispatch.state().playing === null, 'Close: a second press of Listen stops and closes');

        assert(/Playback speed 1×/.test(bar.querySelector('.dispatch-rate').getAttribute('aria-label')), 'Speed: the button\'s name includes what it shows');
        assert(bar.querySelector('.dispatch-offer').hidden, 'Intro: with no recording, there is no offer to hear one');
    }

    // --- Moses's introduction: offered once it exists, fetched on click ----
    {
        const spoken = [];
        const played = [];
        const { window } = run('dark', {
            before: (w) => {
                fakeSpeech(w, spoken);
                fakeAudio(w, played, 5);
                slowFetch(w, 30, WITH_INTRO);
            }
        });
        const doc = window.document;
        const bar = doc.getElementById('dispatchBar');
        const offer = bar.querySelector('.dispatch-offer');
        const introBtn = bar.querySelector('.dispatch-intro');

        window.FieldDispatch.play('about');
        await wait(60);   // the manifest has arrived
        assert(!offer.hidden, 'Intro: once the manifest lists it, the player offers it');
        assert(introBtn.textContent === 'Hear Moses introduce himself · 612 KB', `Intro: labelled with its transfer before the press (${introBtn.textContent})`);
        assert(played.length === 0, 'Intro: nothing is fetched until it is asked for');

        click(window, introBtn);
        await wait(20);
        assert(played.length === 1 && played[0] === 'assets/audio/intro.mp3', `Intro: the press plays his recording (${played.join(', ') || 'nothing'})`);
        const state = window.FieldDispatch.state();
        assert(state.playing === 'intro', 'Intro: the player is on the introduction');
        assert(bar.querySelector('.dispatch-title').textContent === window.VoiceScripts.INTRO.label, 'Intro: titled as his introduction');
        assert(window.VoiceScripts.INTRO.text.startsWith(bar.querySelector('.dispatch-caption').textContent), 'Intro: captions come from the script he read');
        assert(/612 KB/.test(bar.querySelector('.dispatch-weight').textContent) && /transfer/.test(bar.querySelector('.dispatch-weight').textContent), 'Intro: the weight shown is its transfer');
        assert(offer.hidden, 'Intro: the offer steps aside while it plays');
        assert(bar.querySelector('.dispatch-step').getAttribute('aria-disabled') === 'true', 'Intro: section steps are unavailable while he speaks');
    }

    // --- Only a recording of Moses is ever played ---------------------------
    {
        const spoken = [];
        const played = [];
        const synthetic = { tracks: {
            intro: Object.assign({}, INTRO_TRACK, { voiceKind: 'synthetic' }),
            hero: { file: 'assets/audio/hero.mp3', bytes: 344442, grams: 0.118 }
        } };
        const { window } = run('dark', {
            before: (w) => {
                fakeSpeech(w, spoken);
                fakeAudio(w, played, 5);
                slowFetch(w, 0, synthetic);
            }
        });
        await wait(10);
        const bar = window.document.getElementById('dispatchBar');

        window.FieldDispatch.play('hero');
        await wait(40);
        assert(played.length === 0 && spoken.length > 0, 'Only Moses: a section track in the manifest is never played — sections use the browser voice');
        assert(bar.querySelector('.dispatch-offer').hidden, 'Only Moses: an "intro" that is not a recording is never offered');
        assert(await window.FieldDispatch.playIntro() === false && played.length === 0, 'Only Moses: …and cannot be played another way');
    }

    // --- Stopping before the recording starts is not a failure ------------
    {
        const spoken = [];
        const played = [];
        const { window } = run('dark', {
            before: (w) => {
                fakeSpeech(w, spoken);
                fakeAudio(w, played, 200);
                slowFetch(w, 0, WITH_INTRO);
            }
        });
        const doc = window.document;
        const bar = doc.getElementById('dispatchBar');
        await wait(10);   // the manifest is in

        await window.FieldDispatch.playIntro();
        await wait(20);
        assert(played.length === 1, 'Close before start setup: the recording was asked to play');
        click(window, doc.querySelector('.dispatch-close'));
        await wait(20);
        assert(bar.hidden && !bar.classList.contains('dispatch-failed'), 'Close before start: the player closes instead of reporting a blocked recording');

        await window.FieldDispatch.playIntro();
        await wait(20);
        window.FieldDispatch.play('projects');
        await wait(20);
        assert(!bar.classList.contains('dispatch-failed') && window.FieldDispatch.state().playing === 'projects', 'Switch before start: the section plays without the failure styling');
    }

    // --- No voice, but a recording: the control still has something to say
    {
        const played = [];
        const { window } = run('dark', {
            speech: 'none',
            before: (w) => {
                fakeAudio(w, played, 5);
                slowFetch(w, 0, WITH_INTRO);
            }
        });
        await wait(10);
        const doc = window.document;
        assert(!doc.getElementById('navListen').hidden, 'No voice, recording: the control is shown for Moses\'s introduction');
        click(window, doc.getElementById('listenBtn'));
        await wait(30);
        assert(played.length === 1 && window.FieldDispatch.state().playing === 'intro', 'No voice, recording: Listen plays him rather than failing');
    }
})().then(() => {
    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    process.exit(0);   // the site script leaves timers running
}, (err) => {
    console.log('FAIL: narration tests threw', err);
    process.exit(1);
});
