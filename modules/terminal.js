// ===================================================================
// FIELD TERMINAL — press ` or the footer button
// ===================================================================
// A hidden feature costs nothing until it is found: the core listens for
// the backtick and the footer button, and fetches this on the first press.
//
// Loaded on demand by script.js (window.mksLoad('terminal')) — see the
// ON-DEMAND MODULES section there for when. This file is a classic script:
// it shares the page's global scope, so it declares nothing at the top
// level and talks to the core only through the window.mks* helpers.
//
// tests/harness.js evaluates it after script.js so the jsdom suites see the
// page fully initialised, the way a visitor who used every feature would.
// ===================================================================

// ===================================
// FIELD TERMINAL — press ` or the footer button
// ===================================
(() => {
    const toggleBtn = document.getElementById('terminalToggle');
    let overlay = null, screen = null, input = null, lastFocus = null;
    const history = [];
    let histIdx = -1;

    const print = (text, cls) => {
        const line = document.createElement('div');
        line.className = 'ft-row' + (cls ? ' ' + cls : '');
        line.textContent = text;
        screen.appendChild(line);
        screen.scrollTop = screen.scrollHeight;
    };

    const calm = () => document.body.classList.contains('eco-mode');

    const COMMANDS = {
        help: () => {
            print('available commands:');
            [['journey', 'the route, Freetown to Amsterdam'],
             ['projects', 'list the six project dossiers'],
             ['drill', 'spud in a borehole right here'],
             ['co2', 'how much this visit weighed'],
             ['whoami', 'who runs this place'],
             ['cv', 'download the CV (PDF)'],
             ['map', 'fly to the journey map'],
             ['eco', 'toggle low-energy mode'],
             ['voice', 'read a section aloud — try \'voice about\''],
             ['theme', 'toggle light/dark'],
             ['kushe', 'a greeting from Freetown'],
             ['clear', 'wipe the screen'],
             ['exit', 'close the terminal']
            ].forEach(([c, d]) => print(`  ${c.padEnd(10)} ${d}`));
        },
        whoami: () => {
            print('Moses Kolleh Sesay — geologist by training, sustainability analyst by conviction.');
            print('currently: Amsterdam, NL (52.3676° N, 4.9041° E). previously: see \'journey\'.');
        },
        journey: () => {
            [['2013–2019', 'Freetown, SL', '8.4657° N, 13.2317° W', 'BSc Geology · 164 water points'],
             ['2019–2021', 'Changsha, CN', '28.2282° N, 112.9388° E', 'MSc Industrial Engineering'],
             ['2023', 'Bonn, DE', '50.7374° N, 7.0982° E', 'UNDRR · 54 hazard systems'],
             ['2021–2024', 'Wageningen, NL', '51.9692° N, 5.6654° E', 'MSc Env. Sciences · 10,226 sub-basins'],
             ['2025–now', 'Amsterdam, NL', '52.3676° N, 4.9041° E', 'Sustainable AI research']
            ].forEach(s => print(`  ${s[0].padEnd(10)} ${s[1].padEnd(16)} ${s[2].padEnd(24)} ${s[3]}`));
            print('run \'map\' to fly the route.');
        },
        projects: () => {
            ['Sustainable Generative AI — Digital Society School × Ministry of Finance',
             'Coastal Water Pollution — 10,226 sub-basins, futures for Africa\'s coasts',
             'Flood-Resilient Wuppertal — don\'t let the Schwebebahn become a boat',
             'UN Disaster Risk Reduction — Sendai Framework data, Bonn',
             'Soft Path Water Management — beyond cement, steel and pipes',
             'Groundwater Potential Mapping — geophysics with a 70% strike rate'
            ].forEach((p, i) => print(`  [${i + 1}] ${p}`));
            print('dossiers open in section 04 — PROJECTS.');
        },
        co2: () => {
            const badge = document.getElementById('carbonBadgeText');
            print(badge ? badge.textContent : 'the scale is still warming up — scroll to the footer.');
            print('methodology: Resource Timing API × Sustainable Web Design model.');
            print('this counts network transfer only — not the energy your device spends rendering it.');
            const fd = window.FieldDispatch;
            if (fd) {
                const st = fd.state();
                print(st.mode === 'human'
                    ? `narration: ${st.voiceTitle || 'recorded voice'} — each section is a file, and the player prints its transfer weight before you press play.`
                    : 'narration: your browser\'s own voice. it transfers nothing, so it adds nothing to the figure above — though your device still does the work.');
            }
        },
        drill: (args, done) => {
            const steps = [
                'spudding in…',
                '── 12 m  laterite, red-brown, moist',
                '── 26 m  saprolite, weathered gabbro',
                '── 38 m  fractured gabbro — conductivity rising',
                'STRIKE 💧 water at 38 m. static level −6 m, yield looks good.',
                '(odds are 7/10 when you read the resistivity curve first — see the Groundwater dossier.)'
            ];
            if (calm()) { steps.forEach(s => print(s)); return; }
            let i = 0;
            const tick = () => {
                print(steps[i]);
                i++;
                if (i < steps.length) setTimeout(tick, 420);
                else done();
            };
            tick();
            return true; // async
        },
        cv: () => {
            print('fetching Moses_Kolleh_Sesay_CV.pdf …');
            const a = document.createElement('a');
            a.href = 'assets/Moses_Kolleh_Sesay_CV.pdf';
            a.download = '';
            document.body.appendChild(a);
            a.click();
            a.remove();
        },
        map: () => {
            close();
            const j = document.getElementById('journey');
            if (j) j.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth' });
        },
        eco: () => {
            const b = document.getElementById('ecoModeToggle');
            if (b) b.click();
            print('low-energy mode: ' + (document.body.classList.contains('eco-mode') ? 'on' : 'off'));
        },
        voice: (args, done) => {
            // The player is its own module; fetch it on the first `voice`.
            if (!window.FieldDispatch && window.mksLoad && !window.mksLoaded.dispatch) {
                print('loading the narration player…');
                window.mksLoad('dispatch').then(
                    () => { COMMANDS.voice(args, () => {}); done(); },
                    () => { print('the narration player could not be loaded.', 'ft-err'); done(); }
                );
                return true; // async
            }
            const fd = window.FieldDispatch;
            if (!fd) { print('no speech engine in this browser — the page stays quiet.', 'ft-err'); return; }
            const state = fd.state();
            const arg = (args && args[0]) || '';

            if (!arg) {
                print('usage: voice <section> — one of: ' + state.ids.join(', '));
                print('       voice stop      — shut it up');
                print('       voice recorded  — switch to the recorded narration, if it has been rendered');
                print('       voice browser   — switch back to your browser\'s own voice (0 bytes)');
                print(`current: ${state.mode === 'human' ? (state.voiceTitle || 'recorded narration') : 'browser voice — ' + state.voice}`);
                if (state.mode === 'human' && state.voiceKind && state.voiceKind !== 'human') {
                    print('note: that is a synthetic text-to-speech voice, not a recording of Moses.');
                }
                if (state.mode !== 'human') {
                    print(state.local
                        ? 'that voice is installed on your device. it transfers nothing over the network.'
                        : 'heads up: your browser has no offline voice, so it streams the audio from its vendor.');
                }
                return;
            }
            if (arg === 'stop') { fd.stop(); print('narration stopped.'); return; }
            // 'moses' still works as an alias — it was the documented word —
            // but it is no longer what the command prints back, because the
            // recorded narration is not Moses's voice.
            if (arg === 'recorded' || arg === 'human' || arg === 'moses') {
                fd.loadManifest().then(() => {
                    if (!fd.hasRecorded()) { print('the recorded narration has not been rendered yet — staying on the browser voice.', 'ft-err'); return; }
                    fd.setMode('human', true);
                    const now = fd.state();
                    print(`voice: ${now.voiceTitle || 'recorded narration'}${now.voiceKind && now.voiceKind !== 'human' ? ' (synthetic)' : ''}.`);
                    print('each section is a file now — the player shows what it transfers.');
                });
                return;
            }
            if (arg === 'browser' || arg === 'synth') {
                fd.setMode('synth', true);
                print('voice: your browser\'s. nothing crosses the wire — though your device still does the work.');
                return;
            }
            if (fd.play(arg)) { close(); return; }
            print(`no section called '${arg}'. try: ${state.ids.join(', ')}`, 'ft-err');
        },
        theme: () => {
            const b = document.querySelector('.theme-toggle');
            if (b) b.click();
            print('theme: ' + (document.body.classList.contains('light-mode') ? 'light' : 'dark'));
        },
        kushe: () => {
            print('Kushe! Aw di bodi?');
            print('(Krio — "hello, how are you?". greetings from Freetown.)');
        },
        clear: () => { screen.innerHTML = ''; },
        exit: () => close()
    };

    const runCommand = (raw) => {
        const cmd = raw.trim().toLowerCase();
        print('moses@sustaintheworld:~$ ' + raw, 'ft-echo');
        if (!cmd) return;
        history.push(raw);
        histIdx = history.length;
        const [name, ...args] = cmd.split(/\s+/);
        const fn = COMMANDS[name];
        if (!fn) { print(`command not found: ${name} — try 'help'`, 'ft-err'); return; }
        input.disabled = true;
        const done = () => { input.disabled = false; input.focus(); };
        if (fn(args, done) !== true) done();
    };

    const build = () => {
        overlay = document.createElement('div');
        overlay.className = 'field-terminal';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Field terminal');
        overlay.innerHTML = `
            <div class="ft-panel">
                <div class="ft-bar">
                    <span class="mono-label">field terminal — sustaintheworld</span>
                    <button class="ft-close" aria-label="Close terminal">×</button>
                </div>
                <div class="ft-screen" aria-live="polite"></div>
                <form class="ft-line">
                    <label class="ft-prompt" for="ftInput">moses@sustaintheworld:~$</label>
                    <input id="ftInput" class="ft-input" type="text" autocomplete="off" spellcheck="false" autocapitalize="off">
                </form>
            </div>`;
        document.body.appendChild(overlay);
        screen = overlay.querySelector('.ft-screen');
        input = overlay.querySelector('.ft-input');
        overlay.querySelector('.ft-close').addEventListener('click', close);
        overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
        // aria-modal promises focus stays inside — trap Tab between the
        // dialog's two focusable controls (close button and prompt input)
        overlay.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            const focusables = [overlay.querySelector('.ft-close'), input]
                .filter(el => el && !el.disabled);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
        overlay.querySelector('.ft-line').addEventListener('submit', (e) => {
            e.preventDefault();
            runCommand(input.value);
            input.value = '';
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' && history.length) {
                histIdx = Math.max(0, histIdx - 1);
                input.value = history[histIdx] || '';
                e.preventDefault();
            } else if (e.key === 'ArrowDown' && history.length) {
                histIdx = Math.min(history.length, histIdx + 1);
                input.value = history[histIdx] || '';
                e.preventDefault();
            }
        });
        print('SUSTAINTHEWORLD field terminal');
        print('from bedrock to cloud. type \'help\' to see what\'s down here.');
        print('');
    };

    const open = () => {
        if (!overlay) build();
        lastFocus = document.activeElement;
        overlay.classList.add('open');
        input.focus();
    };
    function close() {
        if (!overlay) return;
        overlay.classList.remove('open');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    const isOpen = () => overlay && overlay.classList.contains('open');

    if (toggleBtn) toggleBtn.addEventListener('click', () => (isOpen() ? close() : open()));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen()) { close(); return; }
        if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        const typing = t && t !== input && (
            t.tagName === 'TEXTAREA' || t.isContentEditable ||
            (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/.test(t.type))
        );
        if (typing) return;
        e.preventDefault();
        isOpen() ? close() : open();
    });

    // The core's trigger hands over to this the moment it exists.
    window.FieldTerminal = { open, close, isOpen };
})();

// Tells the loader in script.js that this module is in place.
(window.mksLoaded = window.mksLoaded || {}).terminal = true;
