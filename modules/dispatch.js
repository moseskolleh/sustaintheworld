// ===================================================================
// FIELD DISPATCH — the spoken page
// ===================================================================
// The narration player. The core shows one "Listen" button in the nav bar;
// its first press loads voice-scripts.js and this file, which opens a
// compact player just under the nav and reads the section in view.
//
// Loaded on demand by script.js (window.mksLoad('dispatch')) — see the
// ON-DEMAND MODULES section there for when. This file is a classic script:
// it shares the page's global scope, so it declares nothing at the top
// level and talks to the core only through the window.mks* helpers.
//
// tests/harness.js evaluates it after script.js so the jsdom suites see the
// page fully initialised, the way a visitor who used every feature would.
// ===================================================================

// ===================================
// FIELD DISPATCH — the spoken page
// ===================================
// Two things can speak here, and each says what it costs.
//
//   browser voice — window.speechSynthesis reads any section aloud. Zero
//                   bytes over the wire, so it is the default.
//   Moses         — one recording, his own introduction, in his own voice.
//                   Offered only when assets/audio/voice-manifest.json lists
//                   it, fetched only when asked for, labelled with its weight.
//
// There used to be ten recorded section tracks in a stock text-to-speech
// voice. They repeated claims the page no longer makes, every copy edit made
// them stale and cost credits to re-render, and a synthetic voice reading
// first-person lines was never Moses. They are gone, and nothing here plays a
// recording that is not a recording of him. Nothing ever autoplays.
(() => {
    // The storage adapter is script.js's; a module reaches it through window.
    const safeStorage = window.mksStorage;
    const VS = window.VoiceScripts;
    const SCRIPTS = (VS && VS.SCRIPTS) || [];
    if (!SCRIPTS.length || !safeStorage) return;

    const synth = window.speechSynthesis;
    const canSynth = typeof synth !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
    if (!canSynth && typeof window.Audio !== 'function') return;

    // The words of Moses's recording, used as its captions. Never spoken by
    // the browser voice: they are his to say.
    const INTRO = VS.INTRO || null;

    let manifest = null;       // null until we know whether a recording exists
    let manifestLoad = null;   // the one fetch, shared by everyone who asks
    let rate = 1;
    let current = null;        // { id, sentences, index }
    let audioEl = null;
    let keepAlive = null;
    // The section the player is on, so previous/next have somewhere to
    // step from even after the section has finished.
    let at = 0;

    const savedRate = parseFloat(safeStorage.local.get('mks-voice-rate'));
    if (savedRate >= 0.5 && savedRate <= 2) rate = savedRate;

    // Sentence splitting lives with the scripts themselves — see
    // voice-scripts.js for why it is more careful than a split on ".".
    const splitSentences = VS.splitSentences;

    // The nav control the core rendered. The player is placed right after
    // it, so for a keyboard the controls are the next thing Tab reaches.
    const listenWrap = document.getElementById('navListen');
    const listenBtn = listenWrap && document.getElementById('listenBtn');

    // ---------------------------------------------------------------
    // Voice choice. Offline voices are strongly preferred: Chrome's default
    // network voices round-trip audio through Google's servers, which would
    // quietly make the "0 KB" claim false. When only a network voice is
    // available the label says so rather than printing a number the page
    // cannot stand behind.
    // ---------------------------------------------------------------
    let chosenVoice = null;
    let voiceIsLocal = false;

    const pickVoice = () => {
        if (!canSynth) return;
        const voices = synth.getVoices() || [];
        if (!voices.length) return;
        const english = voices.filter(v => /^en(-|$)/i.test(v.lang || ''));
        const pool = english.length ? english : voices;
        const local = pool.filter(v => v.localService);
        const ranked = (local.length ? local : pool).slice().sort((a, b) => {
            const score = v => (/GB|IE|ZA|NG/i.test(v.lang || '') ? 0 : 1);
            return score(a) - score(b);
        });
        chosenVoice = ranked[0] || null;
        voiceIsLocal = !!(chosenVoice && chosenVoice.localService);
    };

    // A speech engine that reports no voices — headless browsers, and Linux
    // builds without speech-dispatcher installed — accepts an utterance and
    // then silently drops it. Rather than a button that blinks and does
    // nothing, the control stays out of the page until there is either a
    // usable voice or Moses's recording to offer instead.
    const canSpeak = () => !!(canSynth && (synth.getVoices() || []).length);

    // ---------------------------------------------------------------
    // The manifest says whether Moses has recorded his introduction yet.
    // Fetched once, on demand. Until he has, it lists no tracks and the
    // offer to hear him simply never appears.
    // ---------------------------------------------------------------
    const loadManifest = () => manifestLoad || (manifestLoad = (async () => {
        try {
            const res = await fetch('assets/audio/voice-manifest.json', { cache: 'force-cache' });
            if (res.ok) manifest = await res.json();
        } catch (e) {
            manifest = null; // no manifest — the browser voice still works
        }
        return manifest;
    })());

    // The one recording this player will play. It has to say it is a
    // recording (not synthesised speech) and there have to be captions for
    // it; anything else in the manifest — section tracks someone rendered
    // with `npm run voice -- --sections`, say — is ignored.
    const introTrack = () => {
        const t = manifest && manifest.tracks && manifest.tracks.intro;
        return (t && INTRO && t.voiceKind === 'recorded' && t.file && t.bytes > 0) ? t : null;
    };

    // ---------------------------------------------------------------
    // What the numbers mean.
    //
    // The Sustainable Web Design model converts *transferred bytes* into
    // grams of CO₂e. That is the only thing it converts. It does not include
    // the energy your device spends decoding audio, driving a speaker, or —
    // for the browser voice — synthesising speech in the first place.
    // So every figure here says "transfer", and the browser voice is
    // "0 KB transferred", never "0 g" — it is not free, only free of network.
    // ---------------------------------------------------------------
    const TRANSFER_NOTE =
        'Estimated network-transfer emissions only (Sustainable Web Design model: 0.36 g CO₂e per MB). ' +
        'The energy your device spends synthesising, decoding and playing the audio is real and is not included.';

    const kb = bytes => Math.round(bytes / 1024);
    const gramsOf = t => (typeof t.grams === 'number' ? t.grams : (t.bytes / (1024 * 1024)) * 0.36);

    const weightLabel = (id) => {
        const t = id === 'intro' ? introTrack() : null;
        if (t) return `recorded · ≈${gramsOf(t).toFixed(2)} g transfer · ${kb(t.bytes)} KB`;
        // A local (offline) voice moves no bytes. A network voice — Chrome's
        // default on some platforms — round-trips audio through a server, and
        // the page cannot see how much, so it must not print a figure.
        return voiceIsLocal ? 'browser voice · 0 KB transferred' : 'browser voice · streamed, size unknown';
    };

    // ---------------------------------------------------------------
    // The player: one row to control it, one line of progress, one row to
    // move between sections, and — once Moses has recorded it — one offer.
    // Compact on purpose: on a phone it sits under the nav and must leave
    // the page readable, the contact form's button included.
    // ---------------------------------------------------------------
    const bar = document.createElement('div');
    bar.className = 'dispatch-bar';
    bar.id = 'dispatchBar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Narration player');
    bar.innerHTML = `
        <div class="dispatch-row">
            <button class="dispatch-play" type="button" aria-label="Pause narration">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-pause"></use></svg>
            </button>
            <div class="dispatch-info">
                <span class="dispatch-title mono-label"></span>
                <p class="dispatch-caption"></p>
                <p class="sr-only dispatch-status" role="status"></p>
            </div>
            <button class="dispatch-close" type="button" aria-label="Stop narration and close the player">&times;</button>
        </div>
        <div class="dispatch-progress" aria-hidden="true"><span></span></div>
        <div class="dispatch-foot">
            <button class="dispatch-step" type="button" data-step="-1">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-chevron-down"></use></svg>
            </button>
            <button class="dispatch-step" type="button" data-step="1">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-chevron-down"></use></svg>
            </button>
            <button class="dispatch-rate mono-label" type="button"></button>
            <span class="dispatch-weight mono-label"></span>
        </div>
        <p class="dispatch-offer" hidden><button class="dispatch-intro" type="button" data-analytics="listen-intro"></button></p>`;

    const el = {
        play: bar.querySelector('.dispatch-play'),
        title: bar.querySelector('.dispatch-title'),
        caption: bar.querySelector('.dispatch-caption'),
        // The caption follows the voice sentence by sentence; a live region
        // there read every sentence out over the voice reading it. Only what
        // a listener would otherwise miss — a failure — is said.
        status: bar.querySelector('.dispatch-status'),
        rate: bar.querySelector('.dispatch-rate'),
        close: bar.querySelector('.dispatch-close'),
        progress: bar.querySelector('.dispatch-progress span'),
        steps: Array.prototype.slice.call(bar.querySelectorAll('.dispatch-step')),
        weight: bar.querySelector('.dispatch-weight'),
        offer: bar.querySelector('.dispatch-offer'),
        intro: bar.querySelector('.dispatch-intro')
    };

    // The Listen button pulses only while something is actually speaking.
    const setIcon = (name) => {
        el.play.innerHTML = `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
        el.play.setAttribute('aria-label', name === 'pause' ? 'Pause narration' : 'Resume narration');
        if (listenBtn) listenBtn.classList.toggle('is-playing', name === 'pause' && !bar.hidden);
    };

    const setProgress = (frac) => {
        el.progress.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    };

    // The visible "1×" is part of the button's name, so what a sighted
    // listener sees and what a screen reader says stay the same thing.
    const showRate = () => {
        el.rate.innerHTML = `${rate}&times;`;
        el.rate.setAttribute('aria-label', `Playback speed ${rate}×`);
    };

    const two = n => String(n).padStart(2, '0');

    // Previous/next name the section they go to. At either end the button
    // stays focusable and says so — disabling it would drop the keyboard's
    // focus on the floor mid-press.
    const syncSteps = () => {
        const onIntro = !!(current && current.id === 'intro');
        el.steps.forEach((b) => {
            const dir = Number(b.dataset.step);
            const target = SCRIPTS[at + dir];
            const off = onIntro || !target;
            b.setAttribute('aria-disabled', String(off));
            b.setAttribute('aria-label', target
                ? `${dir < 0 ? 'Previous' : 'Next'} section: ${target.label}`
                : `No ${dir < 0 ? 'earlier' : 'later'} section`);
        });
    };

    // The offer to hear Moses: there once his recording exists, and not while
    // it is already playing. Its label carries the weight before the press,
    // the way every recording on this site has.
    const syncOffer = () => {
        const t = introTrack();
        const show = !!t && !(current && current.id === 'intro');
        if (t) {
            el.intro.textContent = `Hear Moses introduce himself · ${kb(t.bytes)} KB`;
            el.intro.title = TRANSFER_NOTE;
        }
        if (!show && el.offer.contains(document.activeElement)) el.play.focus();
        el.offer.hidden = !show;
    };

    // ---------------------------------------------------------------
    // Showing and hiding. The nav button is a disclosure for the player, so
    // it says whether the player is open, and closing the player hands the
    // keyboard back to it instead of dropping focus onto the page.
    // ---------------------------------------------------------------
    const showBar = (visible) => {
        if (!visible && bar.contains(document.activeElement) && listenBtn && !listenWrap.hidden) listenBtn.focus();
        bar.hidden = !visible;
        if (listenBtn) {
            listenBtn.setAttribute('aria-expanded', String(visible));
            listenBtn.classList.toggle('is-playing', visible && !!current);
        }
    };

    function updateAvailability() {
        const usable = canSpeak() || !!introTrack();
        if (listenWrap) listenWrap.hidden = !usable;
        if (!usable && current) stop();
    }

    // ---------------------------------------------------------------
    // Playback — one engine per kind, one shared surface
    // ---------------------------------------------------------------
    const stopKeepAlive = () => { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } };

    // What a failed attempt was for, so the play button can become a retry
    // rather than doing nothing.
    let retry = null;

    // Silence both engines without touching the player's visibility, so
    // moving from one section to the next never closes the player under the
    // listener's finger (and never throws their focus back to the nav).
    const halt = () => {
        stopKeepAlive();
        el.status.textContent = '';
        if (canSynth) synth.cancel();
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); audioEl = null; }
        current = null;
        retry = null;
        bar.classList.remove('dispatch-failed');
        setProgress(0);
    };

    const stop = () => {
        halt();
        showBar(false);
        syncOffer();
    };

    // Neither engine could produce sound. The player stops, says what
    // failed, and turns its play button into a retry — rather than showing
    // a pause icon over silence with no way back.
    const failPlayback = (again, message) => {
        halt();
        retry = again || null;
        setIcon('play');
        bar.classList.add('dispatch-failed');
        el.caption.textContent = el.status.textContent = message;
        el.play.setAttribute('aria-label', retry ? 'Try playing the narration again' : 'Resume narration');
        showBar(true);
        syncSteps();
        syncOffer();
    };

    // Speaks `sentences` from `startAt`. Used for first play and for a rate
    // change mid-sentence, since an utterance's rate is fixed once it starts.
    const runSynth = (script, sentences, startAt) => {
        // Every path into the browser voice arrives here, so this is the one
        // place that has to establish there is a voice. Without the check,
        // the next line throws on a browser with no speech engine, or —
        // worse — succeeds and plays nothing.
        if (!canSpeak()) {
            failPlayback(
                () => play(script),
                introTrack()
                    ? 'this browser has no speech voice to read the page with. Moses\'s recorded introduction is below.'
                    : 'this browser has no speech voice available. Try another browser, or read the section instead.'
            );
            return;
        }

        // cancel() ends the utterance that was speaking, and its end/error
        // event arrives later — after `current` already belongs to this run.
        // Handlers that only asked "is anything playing?" advanced the new
        // run with the old one's sentences: two sections interleaved. Each
        // run now only answers to its own utterances.
        const run = current = { id: script.id, sentences, index: startAt };
        synth.cancel();

        const next = () => {
            if (current !== run) return;
            if (run.index >= sentences.length) { stop(); return; }
            const line = sentences[run.index];
            el.caption.textContent = line;
            setProgress(run.index / sentences.length);

            const u = new SpeechSynthesisUtterance(line);
            if (chosenVoice) u.voice = chosenVoice;
            u.lang = (chosenVoice && chosenVoice.lang) || 'en-GB';
            u.rate = rate;
            let settled = false;
            const advance = () => {
                if (settled || current !== run) return;
                settled = true;
                run.index++;
                next();
            };
            u.onend = advance;
            u.onerror = advance;
            synth.speak(u);
        };
        next();

        // Chrome drops long speech on the floor after ~15s of engine idle.
        // A pause/resume tick keeps it alive without affecting playback.
        stopKeepAlive();
        keepAlive = setInterval(() => {
            if (!current || audioEl) { stopKeepAlive(); return; }
            if (synth.speaking && !synth.paused) { synth.pause(); synth.resume(); }
        }, 10000);
    };

    // Reads one section with the browser voice.
    const play = (script) => {
        halt();
        at = Math.max(0, SCRIPTS.indexOf(script));
        setIcon('pause');
        el.title.textContent = `${two(at + 1)} / ${two(SCRIPTS.length)} · ${script.label}`;
        showRate();
        el.weight.textContent = weightLabel(script.id);
        el.weight.title = TRANSFER_NOTE;
        runSynth(script, splitSentences(script.text), 0);
        if (current) showBar(true);
        syncSteps();
        syncOffer();
    };

    // Plays Moses's recording. Nothing crosses the wire until this runs:
    // the element is created here, on the press, with preload="none".
    const playIntro = () => {
        const track = introTrack();
        if (!track) return false;
        halt();

        const sentences = splitSentences(INTRO.text);
        current = { id: 'intro', sentences, index: 0 };
        setIcon('pause');
        el.title.textContent = INTRO.label;
        showRate();
        el.weight.textContent = weightLabel('intro');
        el.weight.title = TRANSFER_NOTE;

        const thisEl = audioEl = new Audio();
        audioEl.preload = 'none';
        audioEl.src = track.file;
        audioEl.playbackRate = rate;

        // A recording carries no sentence timings, so captions advance by
        // position through the clip. Close enough to follow along, and never
        // presented as more than that.
        audioEl.addEventListener('timeupdate', () => {
            if (audioEl !== thisEl || !audioEl.duration) return;
            const frac = audioEl.currentTime / audioEl.duration;
            setProgress(frac);
            const i = Math.min(sentences.length - 1, Math.floor(frac * sentences.length));
            if (current && i !== current.index) {
                current.index = i;
                el.caption.textContent = sentences[i];
            }
        });
        audioEl.addEventListener('ended', () => { if (audioEl === thisEl) stop(); });
        // The browser voice never stands in for Moses: if his recording will
        // not load, the player says so and offers to try again.
        audioEl.addEventListener('error', () => {
            if (audioEl !== thisEl) return;   // a recording already let go
            audioEl = null;
            failPlayback(playIntro, 'the recording would not load. Press play to try again.');
        });

        el.caption.textContent = sentences[0];
        showBar(true);
        syncSteps();
        syncOffer();
        audioEl.play().catch((err) => {
            // Stopping, or starting a section, pauses this element before it
            // has begun, which rejects play() with an AbortError. That is
            // the listener changing their mind, not a failure.
            if (audioEl !== thisEl || (err && err.name === 'AbortError')) return;
            // Autoplay policy, or a decode the browser refused. Either way it
            // is retryable, so hand back a play button that restarts it.
            failPlayback(playIntro, 'playback was blocked by the browser. Press play to try again.');
        });
        return true;
    };

    const isPaused = () => (audioEl ? audioEl.paused : (canSynth && synth.paused));

    const togglePause = () => {
        // After a failure the play button is a retry, not a resume.
        if (!current) {
            if (retry) retry();
            return;
        }
        if (audioEl) {
            if (audioEl.paused) { audioEl.play().catch(() => setIcon('play')); setIcon('pause'); }
            else { audioEl.pause(); setIcon('play'); }
            return;
        }
        if (synth.paused) { synth.resume(); setIcon('pause'); }
        else { synth.pause(); setIcon('play'); }
    };

    // ---------------------------------------------------------------
    // Where the reader is. The section whose top has passed a line a third
    // of the way down the screen is the one being read; the hero's element
    // is #home, every other script's id is its section's.
    // ---------------------------------------------------------------
    const sectionOf = id => document.getElementById(id === 'hero' ? 'home' : id);

    const inView = () => {
        const line = (window.innerHeight || 800) / 3;
        let found = 0;
        SCRIPTS.forEach((s, i) => {
            const node = sectionOf(s.id);
            if (node && node.getBoundingClientRect().top <= line) found = i;
        });
        return found;
    };

    // Stepping to a section brings the page along, heading clear of the nav
    // and the player, so what is being read is what is on screen. It moves
    // only on a press of previous/next — never while a section is read.
    const bringIntoView = (script) => {
        const node = sectionOf(script.id);
        if (!node || typeof window.scrollTo !== 'function') return;
        const head = (script.id !== 'hero' && node.querySelector('.section-header')) || node;
        const clear = bar.hidden ? 80 : bar.getBoundingClientRect().bottom + 16;
        const y = script.id === 'hero' ? 0 : head.getBoundingClientRect().top + (window.pageYOffset || 0) - clear;
        const motion = typeof window.mksScrollMotion === 'function' ? window.mksScrollMotion() : 'auto';
        window.scrollTo({ top: Math.max(0, y), behavior: motion });
    };

    const step = (dir) => {
        if (current && current.id === 'intro') return;
        const script = SCRIPTS[at + dir];
        if (!script) return;
        bringIntoView(script);
        play(script);
    };

    // The nav button: open the player on the section in view, or close it.
    // With no voice to read the page, the only thing it can offer is Moses.
    const toggle = () => {
        if (!bar.hidden) { stop(); return; }
        if (canSpeak()) { play(SCRIPTS[inView()]); return; }
        // play() reaches runSynth, which explains that there is no voice.
        loadManifest().then(() => { if (!playIntro()) play(SCRIPTS[inView()]); });
    };

    // ---------------------------------------------------------------
    // Controls
    // ---------------------------------------------------------------
    el.play.addEventListener('click', togglePause);
    el.close.addEventListener('click', stop);
    el.intro.addEventListener('click', playIntro);
    el.steps.forEach(b => b.addEventListener('click', () => {
        if (b.getAttribute('aria-disabled') !== 'true') step(Number(b.dataset.step));
    }));

    el.rate.addEventListener('click', () => {
        const steps = [1, 1.25, 1.5, 0.85];
        const i = steps.indexOf(rate);
        rate = steps[(i + 1) % steps.length];
        showRate();
        safeStorage.local.set('mks-voice-rate', String(rate));

        if (audioEl) { audioEl.playbackRate = rate; return; }
        // An utterance's rate cannot change once it is speaking, so the
        // current sentence restarts at the new rate rather than finishing old.
        if (current) runSynth(SCRIPTS[at], current.sentences, current.index);
    });

    // Escape inside the player closes it, and the keyboard lands back on
    // the Listen button it came from.
    bar.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); stop(); }
    });

    // Talking after someone has left the page is a bug, not a feature.
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && current && !isPaused()) togglePause();
    });

    // Now that the player exists, work out which voice we have and whether
    // the control should be shown at all. A voice arriving late has to
    // refresh the label too — "streamed, size unknown" becomes
    // "0 KB transferred" the moment an offline voice turns up.
    const onVoicesReady = () => {
        pickVoice();
        if (current && current.id !== 'intro') el.weight.textContent = weightLabel(current.id);
        updateAvailability();
    };

    showRate();
    syncSteps();
    if (listenWrap) listenWrap.insertAdjacentElement('afterend', bar);
    else document.body.appendChild(bar);
    if (listenBtn) listenBtn.setAttribute('aria-controls', bar.id);

    onVoicesReady();
    if (canSynth) {
        if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onVoicesReady);
        else synth.onvoiceschanged = onVoicesReady;
    }

    // Offer Moses's recording once we know it exists — and only then.
    loadManifest().then(() => {
        syncOffer();
        updateAvailability();
    });

    // Used by the nav button (script.js) and the field terminal's `voice`.
    window.FieldDispatch = {
        toggle,
        play: (id) => {
            const script = VS.byId[id];
            if (!script) return false;
            play(script);
            return true;
        },
        playIntro: () => loadManifest().then(playIntro),
        stop,
        loadManifest,
        hasIntro: () => !!introTrack(),
        state: () => {
            const t = introTrack();
            return {
                playing: current ? current.id : null,
                voice: chosenVoice ? `${chosenVoice.name} (${chosenVoice.lang})` : 'none available',
                local: voiceIsLocal,
                intro: t ? { bytes: t.bytes, seconds: t.seconds || null, readBy: t.voiceTitle || INTRO.readBy } : null,
                ids: SCRIPTS.map(s => s.id)
            };
        }
    };
})();
// Tells the loader in script.js that this module is in place.
(window.mksLoaded = window.mksLoaded || {}).dispatch = true;
