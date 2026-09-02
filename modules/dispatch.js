// ===================================================================
// FIELD DISPATCH — the spoken page
// ===================================================================
// The narration player. The core renders a "listen" control on every
// section; the first press loads voice-scripts.js and this file, which
// replaces those controls with its own and starts reading.
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
// Two voices for the same words, and the choice is the point.
//
//   browser voice — window.speechSynthesis. Zero bytes over the wire.
//   Moses         — narration rendered ahead of time, fetched only when
//                   asked for, labelled with exactly what it weighs.
//
// The recorded option stays hidden until assets/audio/voice-manifest.json
// exists, so this works the moment it ships and gets richer after the first
// `npm run voice`. Nothing here ever autoplays, in any mode.
(() => {
    // The storage adapter is script.js's; a module reaches it through window.
    const safeStorage = window.mksStorage;
    const SCRIPTS = (window.VoiceScripts && window.VoiceScripts.SCRIPTS) || [];
    if (!SCRIPTS.length || !safeStorage) return;

    const synth = window.speechSynthesis;
    const canSynth = typeof synth !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
    if (!canSynth && typeof window.Audio !== 'function') return;

    let manifest = null;       // null until we know whether narration exists
    let manifestTried = false;
    let mode = 'synth';        // 'synth' | 'human'
    let rate = 1;
    let current = null;        // { id, sentences, index }
    let audioEl = null;
    let keepAlive = null;

    // Distinguishes "the visitor picked a voice" from "nobody has chosen yet".
    // Only an explicit click is remembered, so the default below can change
    // without overriding someone's stated preference.
    let modeChosen = false;

    const savedMode = safeStorage.local.get('mks-voice-mode');
    if (savedMode === 'human' || savedMode === 'synth') { mode = savedMode; modeChosen = true; }
    const savedRate = parseFloat(safeStorage.local.get('mks-voice-rate'));
    if (savedRate >= 0.5 && savedRate <= 2) rate = savedRate;

    // Sentence splitting lives with the scripts themselves — see
    // voice-scripts.js for why it is more careful than a split on ".".
    const splitSentences = window.VoiceScripts.splitSentences;

    // ---------------------------------------------------------------
    // Voice choice. Offline voices are strongly preferred: Chrome's default
    // network voices round-trip audio through Google's servers, which would
    // quietly make the "0.00 g" claim false. When only a network voice is
    // available the badge says so rather than printing a number the page
    // cannot stand behind.
    // ---------------------------------------------------------------
    let chosenVoice = null;
    let voiceIsLocal = false;

    const pickVoice = () => {
        if (!canSynth) return;
        const voices = synth.getVoices() || [];
        if (!voices.length) { updateAvailability(); return; }
        const english = voices.filter(v => /^en(-|$)/i.test(v.lang || ''));
        const pool = english.length ? english : voices;
        const local = pool.filter(v => v.localService);
        const ranked = (local.length ? local : pool).slice().sort((a, b) => {
            const score = v => (/GB|IE|ZA|NG/i.test(v.lang || '') ? 0 : 1);
            return score(a) - score(b);
        });
        chosenVoice = ranked[0] || null;
        voiceIsLocal = !!(chosenVoice && chosenVoice.localService);
        updateAvailability();
    };

    // A speech engine that reports no voices — headless browsers, and Linux
    // builds without speech-dispatcher installed — accepts an utterance and
    // then silently drops it. Rather than shipping a button that blinks and
    // does nothing, the controls stay out of the page until there is either a
    // usable voice or a recorded track to fall back on.
    const canSpeak = () => !!(canSynth && (synth.getVoices() || []).length);

    function updateAvailability() {
        const usable = canSpeak() || !!manifest;
        document.querySelectorAll('.listen-wrap').forEach(w => { w.hidden = !usable; });
        if (!usable && current) stop();
    }

    // Voices arrive asynchronously in most browsers, and in Chrome the first
    // getVoices() is routinely empty. Wiring happens at the end of this module
    // instead of here, once the controls whose labels depend on the answer
    // actually exist.

    // ---------------------------------------------------------------
    // The manifest records what each recorded track actually weighs.
    // Fetched once, on demand, and only if a visitor reaches for it.
    // ---------------------------------------------------------------
    const loadManifest = async () => {
        if (manifestTried) return manifest;
        manifestTried = true;
        try {
            const res = await fetch('assets/audio/voice-manifest.json', { cache: 'force-cache' });
            if (!res.ok) return null;
            const data = await res.json();
            manifest = (data && data.tracks && Object.keys(data.tracks).length) ? data : null;
        } catch (e) {
            manifest = null; // narration not generated yet — the synth path still works
        }
        return manifest;
    };

    const trackFor = id => (manifest && manifest.tracks && manifest.tracks[id]) || null;

    // ---------------------------------------------------------------
    // What the numbers mean.
    //
    // The Sustainable Web Design model converts *transferred bytes* into
    // grams of CO₂e. That is the only thing it converts. It does not include
    // the energy your device spends decoding audio, driving a speaker, or —
    // for the browser voice — synthesising speech in the first place.
    //
    // The old label read "0.00 g" for the browser voice, which claimed the
    // listening was free. It is not free; it is free *of network transfer*.
    // Every figure here now says which of the two it is.
    // ---------------------------------------------------------------
    const TRANSFER_NOTE =
        'Estimated network-transfer emissions only (Sustainable Web Design model: 0.36 g CO₂e per MB). ' +
        'The energy your device spends synthesising, decoding and playing the audio is real and is not included.';

    const weightLabel = (id) => {
        if (mode === 'human') {
            const t = trackFor(id);
            if (!t) return 'not recorded yet';
            return `≈${t.grams.toFixed(2)} g transfer · ${Math.round(t.bytes / 1024)} KB`;
        }
        // A local (offline) voice moves no bytes. A network voice — Chrome's
        // default on some platforms — round-trips audio through a server, and
        // the page cannot see how much, so it must not print a figure.
        return voiceIsLocal ? '0 KB transferred' : 'streamed by your browser · size unknown';
    };

    const refreshCosts = () => {
        document.querySelectorAll('.listen-wrap').forEach(w => {
            const cost = w.querySelector('.listen-cost');
            if (!cost) return;
            cost.textContent = weightLabel(w.dataset.voiceId);
            cost.title = TRANSFER_NOTE;
        });
        if (el.weight) el.weight.title = TRANSFER_NOTE;
        refreshVoiceNote();
    };

    // Who is actually reading, in the player's own words. The recorded option
    // used to be labelled "Moses", which read as "this is his voice". It is a
    // stock synthetic voice from a TTS library; the manifest records which
    // one, and the page says so rather than implying otherwise.
    const refreshVoiceNote = () => {
        if (!el.voiceNote) return;
        if (mode === 'human' && manifest) {
            const title = manifest.voiceTitle || 'recorded narration';
            const synthetic = manifest.voiceKind !== 'human';
            el.voiceNote.textContent = synthetic
                ? `“${title}” — a synthetic voice${manifest.voiceProvider ? ` from ${manifest.voiceProvider}` : ''}, not a recording of Moses.`
                : `Read by ${title}.`;
            el.voiceNote.hidden = false;
            return;
        }
        if (mode === 'synth') {
            el.voiceNote.textContent = voiceIsLocal
                ? 'Your browser\'s own voice, running on your device — nothing crosses the network.'
                : 'Your browser\'s voice. This one is served over the network, so it is not transfer-free.';
            el.voiceNote.hidden = false;
            return;
        }
        el.voiceNote.hidden = true;
    };

    // ---------------------------------------------------------------
    // The dispatch bar
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
                <p class="dispatch-caption" aria-live="polite"></p>
            </div>
            <button class="dispatch-rate mono-label" type="button" aria-label="Playback speed">1&times;</button>
            <button class="dispatch-close" type="button" aria-label="Stop narration">&times;</button>
        </div>
        <div class="dispatch-progress" aria-hidden="true"><span></span></div>
        <div class="dispatch-foot">
            <div class="dispatch-voices" role="group" aria-label="Choose a voice">
                <button type="button" data-mode="synth" aria-pressed="true">browser voice</button>
                <button type="button" data-mode="human" aria-pressed="false" hidden>recorded</button>
            </div>
            <span class="dispatch-weight mono-label"></span>
        </div>
        <p class="dispatch-voice-note" hidden></p>`;

    const el = {
        play: bar.querySelector('.dispatch-play'),
        title: bar.querySelector('.dispatch-title'),
        caption: bar.querySelector('.dispatch-caption'),
        rate: bar.querySelector('.dispatch-rate'),
        close: bar.querySelector('.dispatch-close'),
        progress: bar.querySelector('.dispatch-progress span'),
        weight: bar.querySelector('.dispatch-weight'),
        voiceNote: bar.querySelector('.dispatch-voice-note'),
        modes: Array.prototype.slice.call(bar.querySelectorAll('.dispatch-voices button'))
    };

    const setIcon = (name) => {
        el.play.innerHTML = `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
        el.play.setAttribute('aria-label', name === 'pause' ? 'Pause narration' : 'Resume narration');
    };

    const setProgress = (frac) => {
        el.progress.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    };

    const syncModeButtons = () => {
        el.modes.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    };

    // ---------------------------------------------------------------
    // Playback — one engine per mode, one shared surface
    // ---------------------------------------------------------------
    const stopKeepAlive = () => { if (keepAlive) { clearInterval(keepAlive); keepAlive = null; } };

    // The floating theme and scroll-top buttons are fixed to the same corner
    // and outrank the player on z-index. On narrow screens, where the player
    // spans the full width, they get lifted clear of it instead of sitting
    // on top of the close button.
    const showBar = (visible) => {
        bar.hidden = !visible;
        document.body.classList.toggle('dispatch-open', visible);
    };

    const clearPlayingButtons = () => {
        document.querySelectorAll('.listen-btn.is-playing').forEach(b => {
            b.classList.remove('is-playing');
            b.setAttribute('aria-pressed', 'false');
        });
    };

    // The script a failed attempt was for, so the player's play button can
    // become a retry rather than doing nothing.
    let retryScript = null;

    const stop = () => {
        stopKeepAlive();
        if (canSynth) synth.cancel();
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); audioEl = null; }
        current = null;
        retryScript = null;
        bar.classList.remove('dispatch-failed');
        showBar(false);
        setProgress(0);
        clearPlayingButtons();
    };

    // Neither engine could produce sound.
    //
    // The old behaviour was to switch to 'synth' and call runSynth() no
    // matter what. Where no speech engine exists — headless browsers, Linux
    // without speech-dispatcher, browsers with speech disabled — that left a
    // player showing a pause icon over silence, with no way back and no
    // explanation. Now the player stops, says which engine failed, and turns
    // its play button into a retry.
    const failPlayback = (script, message) => {
        stopKeepAlive();
        if (canSynth) synth.cancel();
        if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); audioEl = null; }
        current = null;
        retryScript = script || null;
        setProgress(0);
        setIcon('play');
        showBar(true);
        bar.classList.add('dispatch-failed');
        el.caption.textContent = message;
        el.play.setAttribute('aria-label', retryScript ? 'Try playing the narration again' : 'Resume narration');
        clearPlayingButtons();
    };

    // Speaks `sentences` from `startAt`. Used for first play and for a rate
    // change mid-sentence, since an utterance's rate is fixed once it starts.
    const runSynth = (id, sentences, startAt) => {
        // Every path that falls back to the browser voice arrives here, so
        // this is the one place that has to establish there is a voice to
        // fall back to. Without the check, the next line throws on a browser
        // with no speech engine, or — worse — succeeds and plays nothing.
        if (!canSpeak()) {
            failPlayback(
                window.VoiceScripts.byId[id],
                'this browser has no speech voice available, and there is no recording to fall back on. Try another browser, or read the section instead.'
            );
            return;
        }

        current = { id, sentences, index: startAt };
        synth.cancel();

        const next = () => {
            if (!current || current.index >= sentences.length) { stop(); return; }
            const line = sentences[current.index];
            el.caption.textContent = line;
            setProgress(current.index / sentences.length);

            const u = new SpeechSynthesisUtterance(line);
            if (chosenVoice) u.voice = chosenVoice;
            u.lang = (chosenVoice && chosenVoice.lang) || 'en-GB';
            u.rate = rate;
            u.onend = () => { if (current) { current.index++; next(); } };
            u.onerror = () => { if (current) { current.index++; next(); } };
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

    const speakHuman = (script) => {
        const track = trackFor(script.id);
        if (!track) { runSynth(script.id, splitSentences(script.text), 0); return; }

        const sentences = splitSentences(script.text);
        current = { id: script.id, sentences, index: 0 };

        audioEl = new Audio();
        audioEl.preload = 'none';   // nothing crosses the wire until play()
        audioEl.src = track.file;
        audioEl.playbackRate = rate;

        // No per-word timings come back from the API, so captions advance by
        // position through the clip. Close enough to follow along, and never
        // presented as more than that.
        audioEl.addEventListener('timeupdate', () => {
            if (!audioEl || !audioEl.duration) return;
            const frac = audioEl.currentTime / audioEl.duration;
            setProgress(frac);
            const i = Math.min(sentences.length - 1, Math.floor(frac * sentences.length));
            if (current && i !== current.index) {
                current.index = i;
                el.caption.textContent = sentences[i];
            }
        });
        audioEl.addEventListener('ended', stop);
        audioEl.addEventListener('error', () => {
            audioEl = null;
            // Only switch engines if there is another engine. Switching into
            // a mode that cannot speak is how the player ended up dead.
            if (!canSpeak()) {
                failPlayback(script, 'that recording would not load, and this browser has no speech voice to fall back on. Press play to try again.');
                return;
            }
            el.caption.textContent = 'that recording would not load — using the browser voice instead.';
            setMode('synth', false);
            runSynth(script.id, sentences, 0);
        });

        el.caption.textContent = sentences[0];
        audioEl.play().catch(() => {
            // Autoplay policy, or a decode the browser refused. Either way it
            // is retryable, so keep the track loaded and hand back a play
            // button that actually restarts it.
            failPlayback(script, 'playback was blocked by the browser — press play to try again.');
        });
    };

    const play = async (script, btn) => {
        stop();
        if (mode === 'human') await loadManifest();

        showBar(true);
        setIcon('pause');
        setProgress(0);
        el.title.textContent = script.label;
        el.rate.innerHTML = `${rate}&times;`;
        el.weight.textContent = weightLabel(script.id);
        el.weight.title = TRANSFER_NOTE;
        syncModeButtons();
        refreshVoiceNote();

        if (btn) {
            btn.classList.add('is-playing');
            btn.setAttribute('aria-pressed', 'true');
        }

        // A recorded track also stands in when the browser has no voice of
        // its own, which is the only reason this feature works at all on some
        // Linux builds.
        if ((mode === 'human' || !canSpeak()) && trackFor(script.id)) speakHuman(script);
        else runSynth(script.id, splitSentences(script.text), 0);
    };

    const isPaused = () => (audioEl ? audioEl.paused : (canSynth && synth.paused));

    const togglePause = () => {
        // After a failure the play button is a retry, not a resume.
        if (!current) {
            if (!retryScript) return;
            const script = retryScript;
            play(script, document.querySelector(`.listen-btn[data-voice="${script.id}"]`));
            return;
        }
        if (audioEl) {
            if (audioEl.paused) { audioEl.play(); setIcon('pause'); }
            else { audioEl.pause(); setIcon('play'); }
            return;
        }
        if (synth.paused) { synth.resume(); setIcon('pause'); }
        else { synth.pause(); setIcon('play'); }
    };

    // `persist` is true only for a deliberate click on the voice switch.
    // Falling back automatically (no engine, missing track) must not be
    // recorded as a preference.
    function setMode(next, persist) {
        mode = next;
        if (persist) {
            modeChosen = true;
            safeStorage.local.set('mks-voice-mode', mode);
        }
        syncModeButtons();
        if (current) el.weight.textContent = weightLabel(current.id);
        refreshCosts();
    }

    // ---------------------------------------------------------------
    // Controls
    // ---------------------------------------------------------------
    el.play.addEventListener('click', togglePause);
    el.close.addEventListener('click', stop);

    el.rate.addEventListener('click', () => {
        const steps = [1, 1.25, 1.5, 0.85];
        const at = steps.indexOf(rate);
        rate = steps[(at + 1) % steps.length];
        el.rate.innerHTML = `${rate}&times;`;
        safeStorage.local.set('mks-voice-rate', String(rate));

        if (audioEl) { audioEl.playbackRate = rate; return; }
        // An utterance's rate cannot change once it is speaking, so the
        // current sentence restarts at the new rate rather than finishing old.
        if (current) runSynth(current.id, current.sentences, current.index);
    });

    el.modes.forEach(b => b.addEventListener('click', async () => {
        const nextMode = b.dataset.mode;
        if (nextMode === mode) return;
        const resume = current ? window.VoiceScripts.byId[current.id] : null;
        if (nextMode === 'human') await loadManifest();
        setMode(nextMode, true);
        if (resume) play(resume, document.querySelector(`.listen-btn[data-voice="${resume.id}"]`));
    }));

    // Talking after someone has left the page is a bug, not a feature.
    window.addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && current && !isPaused()) togglePause();
    });

    // ---------------------------------------------------------------
    // Buttons in the page
    // ---------------------------------------------------------------
    const makeButton = (script) => {
        const wrap = document.createElement('div');
        wrap.className = 'listen-wrap';
        wrap.dataset.voiceId = script.id;
        wrap.innerHTML = `
            <button class="listen-btn mono-label" type="button" data-voice="${script.id}"
                    aria-pressed="false" data-analytics="listen-${script.id}">
                <svg class="icon" aria-hidden="true" focusable="false"><use href="#i-play"></use></svg>
                <span>listen<span class="sr-only"> to ${script.label}</span></span>
            </button>
            <span class="listen-cost mono-label">${weightLabel(script.id)}</span>`;
        wrap.querySelector('.listen-btn').addEventListener('click', (e) => {
            if (current && current.id === script.id) { stop(); return; }
            play(script, e.currentTarget);
        });
        return wrap;
    };

    // The core rendered stand-in controls in these same places so the page
    // had something to press before this file existed. They step aside now.
    document.querySelectorAll('.listen-wrap').forEach(w => w.remove());

    SCRIPTS.forEach(script => {
        if (script.id === 'hero') {
            const cta = document.querySelector('.hero-cta');
            if (cta) cta.insertAdjacentElement('afterend', makeButton(script));
            return;
        }
        const section = document.getElementById(script.id);
        const header = section && section.querySelector('.section-header');
        if (header) header.appendChild(makeButton(script));
    });

    // Now that the controls exist, work out which voice we have and whether
    // the controls should be shown at all. A voice arriving late has to
    // refresh the cost labels too — "≈0 g · voice from your browser" becomes
    // "0.00 g · 0 KB" the moment an offline voice turns up.
    const onVoicesReady = () => {
        pickVoice();
        refreshCosts();
        updateAvailability();
    };

    onVoicesReady();
    if (canSynth) {
        if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', onVoicesReady);
        else synth.onvoiceschanged = onVoicesReady;
    }

    // Reveal the recorded-voice option only once we know it exists.
    //
    // Where a recording exists it becomes the default: it is a real human
    // reading, and it is the reason the narration was commissioned at all.
    // The browser voice stays one click away and still says 0.00 g, so the
    // lighter option is offered rather than imposed — and anyone who has
    // actually picked a side keeps their choice.
    loadManifest().then(m => {
        if (!m) return;
        const humanBtn = el.modes.filter(b => b.dataset.mode === 'human')[0];
        if (humanBtn) {
            // Name the voice on the control itself. "Moses" was misleading;
            // the manifest knows what was actually used, so use that.
            if (m.voiceTitle) {
                humanBtn.textContent = m.voiceTitle;
                humanBtn.title = m.voiceKind === 'human'
                    ? `Recorded narration read by ${m.voiceTitle}.`
                    : `“${m.voiceTitle}” — a synthetic text-to-speech voice${m.voiceProvider ? ` from ${m.voiceProvider}` : ''}. Not a recording of Moses Kolleh Sesay.`;
            }
            humanBtn.hidden = false;
        }
        if (!modeChosen || !canSpeak()) setMode('human', false);
        refreshCosts();
        updateAvailability();
    });

    syncModeButtons();
    document.body.appendChild(bar);

    // Exposed for the field terminal's `voice` command.
    window.FieldDispatch = {
        play: (id) => {
            const script = window.VoiceScripts.byId[id];
            if (!script) return false;
            play(script, document.querySelector(`.listen-btn[data-voice="${id}"]`));
            return true;
        },
        stop,
        setMode,
        hasRecorded: () => !!manifest,
        loadManifest,
        state: () => ({
            mode,
            playing: current ? current.id : null,
            voice: chosenVoice ? `${chosenVoice.name} (${chosenVoice.lang})` : 'none available',
            local: voiceIsLocal,
            recorded: !!manifest,
            // Who the recorded narrator actually is, so no caller has to
            // guess — and so nothing has to hardcode a name again.
            voiceTitle: manifest ? (manifest.voiceTitle || '') : '',
            voiceKind: manifest ? (manifest.voiceKind || '') : '',
            voiceProvider: manifest ? (manifest.voiceProvider || '') : '',
            ids: SCRIPTS.map(s => s.id)
        })
    };
})();
// Tells the loader in script.js that this module is in place.
(window.mksLoaded = window.mksLoaded || {}).dispatch = true;
