// Timing tests for the narration player (modules/dispatch.js).
//
// resilience.test.js covers what the player does when an engine is missing.
// These cover what it does when things happen in an order it did not expect,
// which is where the real bugs were:
//
//   - a speech engine delivers the end/error event of a cancelled utterance
//     after the next section has started (Chrome does, and so does the spec),
//     and the old handlers advanced the new section with the old sentences;
//   - a listen press that arrives while the manifest is still being fetched
//     was told there was no recording;
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
const MANIFEST = require('../assets/audio/voice-manifest.json');

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

/** A manifest fetch that takes `delay` ms, like one on a real network. */
const slowFetch = (window, delay, body) => {
    window.fetch = () => new Promise((resolve) => setTimeout(() => resolve({
        ok: !!body,
        json: async () => body
    }), delay));
};

(async () => {
    // --- A cancelled utterance must not drive the next section ------------
    {
        const spoken = [];
        const { window } = run('dark', {
            before: (w) => {
                w.localStorage.setItem('mks-voice-mode', 'synth');
                fakeSpeech(w, spoken);
                slowFetch(w, 0, null);   // no recording: this is the browser voice alone
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

    // --- A press during the manifest fetch still finds the recording ------
    {
        const played = [];
        const { window } = run('dark', {
            speech: 'none',
            before: (w) => {
                fakeAudio(w, played, 5);
                slowFetch(w, 40, MANIFEST);
            }
        });
        const bar = window.document.getElementById('dispatchBar');

        window.FieldDispatch.play('hero');   // before the manifest has arrived
        await wait(120);

        assert(!bar.classList.contains('dispatch-failed'), `Early press: the player does not claim there is no recording (${bar.querySelector('.dispatch-caption').textContent.slice(0, 60)})`);
        assert(played.length === 1 && /hero\.mp3$/.test(played[0] || ''), `Early press: the recorded track plays (${played.join(', ') || 'nothing'})`);
    }

    // --- Stopping before the recording starts is not a failure ------------
    {
        const played = [];
        const { window } = run('dark', {
            speech: 'none',
            before: (w) => {
                fakeAudio(w, played, 200);
                slowFetch(w, 0, MANIFEST);
            }
        });
        const doc = window.document;
        const bar = doc.getElementById('dispatchBar');
        await wait(10);   // the manifest is in: this is the recorded path

        window.FieldDispatch.play('about');
        await wait(20);
        assert(played.length === 1, 'Close before start setup: the recording was asked to play');
        doc.querySelector('.dispatch-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        await wait(20);
        assert(bar.hidden && !bar.classList.contains('dispatch-failed'), 'Close before start: the player closes instead of reporting a blocked recording');

        window.FieldDispatch.play('about');
        await wait(20);
        window.FieldDispatch.play('projects');
        await wait(20);
        assert(!bar.classList.contains('dispatch-failed') && window.FieldDispatch.state().playing === 'projects', 'Switch before start: the new section plays without the failure styling');
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
