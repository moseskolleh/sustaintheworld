// ===================================================================
// DOSSIER WIDGETS — the two interactives the case studies host
// ===================================================================
// "Seven in ten" (groundwater) and "Don't let it become a boat" (Wuppertal)
// used to sit in the homepage's collapsed dossiers; now each sits under the
// result it is about. case-studies.html loads this, after dossier.css, when
// a host nears the screen. The generator writes each host whole
// (build-content.js, WIDGET_HOSTS); this wires its controls and only then
// shows them, so a host it never reaches keeps its summary, not dead
// controls. That page has no script.js: window.mks helpers are used where
// present, with an answer of its own where not.
// ===================================================================
(() => {
    const mks = (window.mks = window.mks || {});
    const NS = 'http://www.w3.org/2000/svg';

    // May this move? Without the core to ask: reduced motion, or the
    // low-energy mode the reader stored on the homepage ('eco-mode').
    const reduced = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const lowEnergy = () => {
        if (document.body && document.body.classList.contains('eco-mode')) return true;
        // The core's storage adapter where there is one; here, a read that
        // storage refused (it throws on access) cannot take down.
        if (mks.storage) return mks.storage.local.get('eco-mode') === 'on';
        try { return window.localStorage.getItem('eco-mode') === 'on'; } catch (e) { return false; }
    };
    const calm = () => (typeof mks.motionOK === 'function'
        ? !mks.motionOK()
        : !!(reduced && reduced.matches) || lowEnergy());

    // Labels a phone can read: a drawing 800 units wide shown ~290px wide
    // made a 12px label ~5px. --k (units per CSS pixel as drawn) lets
    // dossier.css size labels in real pixels; `then` gets it too, for
    // labels that must give way. Returns the fit, for a redraw.
    const fitLabels = (box, width, then) => {
        const fit = () => {
            const svg = box.querySelector('svg');
            const shown = svg ? svg.getBoundingClientRect().width : 0;
            if (!shown) return;
            const k = width / shown;
            svg.style.setProperty('--k', k.toFixed(3));
            if (then) then(k);
        };
        if ('ResizeObserver' in window) new ResizeObserver(fit).observe(box);
        else window.addEventListener('resize', fit, { passive: true });
        fit();
        return fit;
    };

    // A host going live grows by its whole widget, and the loader starts a
    // screen early, so it can be above the reader: one who followed a link
    // to the next case study. Without scroll anchoring (Safari) that pushed
    // what they were reading 400-500px down. So a host wholly above the
    // screen is measured before, and the call this returns, once the widget
    // is drawn, scrolls by whatever growth the browser has not already
    // absorbed itself (none, where it anchors).
    const goLive = (host) => {
        const box = host.getBoundingClientRect();
        const above = box.height > 0 && box.bottom <= 0;
        const y = window.scrollY;
        const live = host.querySelector('.dw-live');
        if (live) live.hidden = false;
        host.classList.add('is-live');
        return () => {
            if (!above) return;
            const lag = host.getBoundingClientRect().height - box.height - (window.scrollY - y);
            if (lag >= 1) window.scrollBy(0, lag);
        };
    };

    // ===================================
    // SEVEN IN TEN — site the borehole, and keep score against the records
    // ===================================
    // One widget where there were two: the game is the play, and the waffle
    // (once a slider of its own) is the scoreboard: your holes beside the
    // field records' 7 in 10 and blind drilling's ~3 in 10, which has no
    // recorded source and is labelled illustrative wherever it appears.
    (() => {
        const host = document.querySelector('[data-widget="borehole"]');
        const stage = document.getElementById('boreholeStage');
        const drillBtn = document.getElementById('drillBtn');
        const resetBtn = document.getElementById('drillResetBtn');
        const result = document.getElementById('drillResult');
        const score = document.getElementById('drillScore');
        if (!host || !stage || !drillBtn || !resetBtn || !result || !score) return;

        const W = 800, H = 430;
        const SURFACE = 190, HOLE_BOTTOM = 380;
        const CURVE_TOP = 55, CURVE_BOT = 150;
        const ROW = 10;
        let zones = [];          // {center, half, kind: 'water'|'clay'}
        let rigX = 400;
        let drilling = false;
        let drillRun = 0;        // invalidates in-flight drill animations on reset
        const holes = [];        // true for a strike, in the order drilled
        let svg, rigEl, holesEl, revealEl, title, sideLabels = [], fit = null;

        const el = (tag, attrs, parent) => {
            const n = document.createElementNS(NS, tag);
            for (const k in attrs) n.setAttribute(k, attrs[k]);
            (parent || svg).appendChild(n);
            return n;
        };

        // Apparent resistivity along the profile: high background with
        // gaussian lows over the hidden zones (water reads lowest, clay close).
        const resistivityAt = (x) => {
            let r = 1 + 0.08 * Math.sin(x / 47) + 0.05 * Math.sin(x / 23 + 2);
            zones.forEach(z => {
                const depth = z.kind === 'water' ? 0.75 : 0.55;
                r -= depth * Math.exp(-((x - z.center) ** 2) / (2 * (z.half * 0.8) ** 2));
            });
            return Math.max(0.08, Math.min(1.15, r));
        };
        const curveY = (x) => CURVE_BOT - resistivityAt(x) * (CURVE_BOT - CURVE_TOP) / 1.15;

        const newZones = () => {
            const kinds = ['water', 'water', 'clay'].sort(() => Math.random() - 0.5);
            const centers = [];
            while (centers.length < 3) {
                const c = 90 + Math.random() * (W - 180);
                if (centers.every(o => Math.abs(o - c) > 150)) centers.push(c);
            }
            zones = centers.map((c, i) => ({ center: c, half: 26 + Math.random() * 14, kind: kinds[i] }));
        };

        const surfaceY = (x) => SURFACE + 4 * Math.sin(x / 90) + 2 * Math.sin(x / 31);

        // Where "high" and "low" at a readable size would sit on the curve,
        // they give way and the title says which way is low, in fewer words
        // where it would run past the edge.
        const roomFor = (k) => {
            const tight = k > 1.6;
            title.textContent = tight ? 'apparent resistivity: dips read low' : 'apparent resistivity along the profile';
            if (tight && title.getComputedTextLength && title.getComputedTextLength() > W - 20) title.textContent = 'resistivity: dips read low';
            sideLabels.forEach(t => { t.style.display = tight ? 'none' : ''; });
        };

        const drawScene = () => {
            stage.innerHTML = '';
            svg = document.createElementNS(NS, 'svg');
            svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
            svg.setAttribute('class', 'borehole-svg');
            svg.setAttribute('aria-hidden', 'true');
            stage.appendChild(svg);

            // curve panel
            title = el('text', { x: 10, y: 30, class: 'bh-label' });
            sideLabels = [
                el('text', { x: 10, y: CURVE_TOP + 8, class: 'bh-label bh-label-dim' }),
                el('text', { x: 10, y: CURVE_BOT, class: 'bh-label bh-label-dim' })
            ];
            sideLabels[0].textContent = 'high';
            sideLabels[1].textContent = 'low';
            let d = '';
            for (let x = 40; x <= W - 12; x += 6) d += (d ? ' L ' : 'M ') + x + ' ' + curveY(x).toFixed(1);
            el('path', { d, class: 'bh-curve' });

            // ground
            let gd = `M 0 ${surfaceY(0)}`;
            for (let x = 10; x <= W; x += 10) gd += ` L ${x} ${surfaceY(x).toFixed(1)}`;
            el('path', { d: gd + ` L ${W} ${H} L 0 ${H} Z`, class: 'bh-ground' });
            el('path', { d: gd, class: 'bh-surface' });
            el('text', { x: W - 12, y: SURFACE + 26, 'text-anchor': 'end', class: 'bh-label bh-label-dim' }).textContent = 'weathered regolith';
            el('text', { x: W - 12, y: 300, 'text-anchor': 'end', class: 'bh-label bh-label-dim' }).textContent = 'gabbro bedrock';
            el('line', { x1: 0, y1: 250, x2: W, y2: 250, class: 'bh-strata' });

            revealEl = el('g', {});
            holesEl = el('g', {});

            // rig: base + derrick
            rigEl = el('g', { class: 'bh-rig' });
            el('rect', { x: -22, y: -12, width: 44, height: 8, rx: 2, class: 'bh-rig-base' }, rigEl);
            el('path', { d: 'M -14 -12 L 0 -64 L 14 -12', class: 'bh-rig-mast' }, rigEl);
            el('line', { x1: -9, y1: -28, x2: 9, y2: -28, class: 'bh-rig-mast' }, rigEl);
            el('line', { x1: -5, y1: -46, x2: 5, y2: -46, class: 'bh-rig-mast' }, rigEl);
            placeRig(rigX);
            if (fit) fit(); else fit = fitLabels(stage, W, roomFor);
        };

        // The drawing is aria-hidden, and the curve is the whole of the
        // information: without this a screen reader could only guess where to
        // drill. It grades the dip the way the picture does — deeper or
        // shallower — without saying what is down there.
        const reading = (r) => (r < 0.45 ? 'very low — a deep dip in the curve'
            : r < 0.7 ? 'low — a dip in the curve'
            : r < 0.9 ? 'slightly low — the edge of a dip'
            : 'high — no dip here');

        function placeRig(x) {
            rigX = Math.max(50, Math.min(W - 50, x));
            rigEl.setAttribute('transform', `translate(${rigX.toFixed(1)} ${surfaceY(rigX).toFixed(1)})`);
            const pct = Math.round((rigX - 50) / (W - 100) * 100);
            stage.setAttribute('aria-valuenow', String(pct));
            stage.setAttribute('aria-valuetext', `rig at ${pct}% along the profile; resistivity ${reading(resistivityAt(rigX))}`);
        }

        const toViewX = (clientX) => {
            const r = svg.getBoundingClientRect();
            return (clientX - r.left) * (W / r.width);
        };

        // The scoreboard: yours (your last ten holes) and the two fixed
        // rows. Each label carries its numbers; the cells are aria-hidden.
        const rows = Array.from(host.querySelectorAll('.strike-waffle')).map((waffle) => {
            const cells = [];
            for (let i = 0; i < ROW; i++) {
                const c = document.createElement('span');
                c.className = 'strike-cell';
                waffle.appendChild(c);
                cells.push(c);
            }
            // A fixed row scatters its strikes: 3 is coprime with 10, so
            // (i*3)%10 visits every cell once, the same way every time.
            const n = Number(waffle.getAttribute('data-row'));
            if (n >= 0) for (let i = 0; i < ROW; i++) cells[(i * 3) % ROW].classList.add(i < n ? 'water' : 'dry');
            return { you: waffle.getAttribute('data-row') === 'you', cells };
        });
        const yours = (rows.find(r => r.you) || { cells: [] }).cells;

        const updateScore = () => {
            const shown = holes.slice(-ROW);
            yours.forEach((c, i) => {
                c.classList.toggle('water', i < shown.length && shown[i]);
                c.classList.toggle('dry', i < shown.length && !shown[i]);
            });
            const strikes = holes.filter(Boolean).length;
            score.textContent = !holes.length
                ? 'Your holes · drill to fill this row'
                : `Your holes · ${strikes} of ${holes.length} struck water` +
                  (holes.length > ROW ? `, the last ${ROW} shown` : '');
        };

        const finishHole = (x) => {
            const zone = zones.find(z => Math.abs(x - z.center) <= z.half);
            const sy = surfaceY(x);
            // A zone already drilled tells you nothing new. Counting it again let
            // one strike be re-drilled into any score you liked, which is the
            // opposite of the point: the curve has to be read for each new hole.
            if (zone && zone.drilled) {
                result.textContent = zone.kind === 'water'
                    ? 'Already struck here — that fracture zone is yours. Move the rig and read the curve for the next one.'
                    : 'That\'s the clay pocket you already found. Move the rig and read the curve again.';
                drilling = false;
                drillBtn.disabled = false;
                return;
            }
            if (zone) zone.drilled = true;
            const struck = !!(zone && zone.kind === 'water');
            holes.push(struck);
            const tally = `(${holes.filter(Boolean).length}/${holes.length})`;
            if (struck) {
                el('ellipse', { cx: zone.center, cy: 330, rx: zone.half * 1.5, ry: 26, class: 'bh-reveal-water' }, revealEl);
                el('line', { x1: x, y1: 330, x2: x, y2: sy, class: 'bh-water-col' }, holesEl);
                const gush = el('path', { d: `M ${x} ${sy} q -14 -30 -24 -38 M ${x} ${sy} q 0 -36 0 -44 M ${x} ${sy} q 14 -30 24 -38`, class: 'bh-gush' }, holesEl);
                if (!calm()) gush.classList.add('bh-gush-anim');
                result.textContent = `STRIKE — water at ~${Math.round(38 + Math.random() * 14)} m. That dip was a saturated fracture zone. ${tally}`;
            } else if (zone) {
                el('ellipse', { cx: zone.center, cy: 300, rx: zone.half * 1.4, ry: 20, class: 'bh-reveal-clay' }, revealEl);
                result.textContent = `Low resistivity… but it was a clay pocket, not water. Even good surveys get fooled — that's why we also ran pumping tests. ${tally}`;
            } else {
                result.textContent = `Dry hole — hard gabbro all the way down. The curve was high here: high resistivity, no fractures, no water. ${tally}`;
            }
            updateScore();
            drilling = false;
            drillBtn.disabled = false;
        };

        const drill = () => {
            if (drilling) return;
            drilling = true;
            drillBtn.disabled = true;
            const run = ++drillRun;
            const x = rigX, sy = surfaceY(x);
            const hole = el('line', { x1: x, y1: sy, x2: x, y2: sy, class: 'bh-hole' }, holesEl);
            result.textContent = 'Drilling…';
            if (calm()) {
                hole.setAttribute('y2', HOLE_BOTTOM);
                finishHole(x);
                return;
            }
            const t0 = performance.now();
            const step = (t) => {
                if (run !== drillRun) return; // site was reset mid-drill
                const p = Math.min(1, Math.max(0, (t - t0) / 900));
                hole.setAttribute('y2', (sy + (HOLE_BOTTOM - sy) * p).toFixed(1));
                if (p < 1) requestAnimationFrame(step);
                else finishHole(x);
            };
            requestAnimationFrame(step);
        };

        const reset = () => {
            drillRun++; // abandon any drill still in progress
            drilling = false;
            drillBtn.disabled = false;
            newZones();
            drawScene();
            result.textContent = 'New site surveyed. Read the curve, place the rig, drill.';
        };

        // Shown first: the scene is measured to fit its labels.
        const settle = goLive(host);
        newZones();
        drawScene();
        updateScore();
        settle();

        let dragging = false;
        stage.addEventListener('pointerdown', (e) => {
            if (drilling) return;
            dragging = true;
            stage.setPointerCapture(e.pointerId);
            placeRig(toViewX(e.clientX));
        });
        stage.addEventListener('pointermove', (e) => {
            if (dragging && !drilling) placeRig(toViewX(e.clientX));
        });
        stage.addEventListener('pointerup', () => { dragging = false; });
        stage.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { placeRig(rigX - 14); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { placeRig(rigX + 14); e.preventDefault(); }
            else if (e.key === 'Enter' || e.key === ' ') { drill(); e.preventDefault(); }
        });
        drillBtn.addEventListener('click', drill);
        resetBtn.addEventListener('click', reset);
    })();


    // ===================================
    // DON'T LET IT BECOME A BOAT — Wupper flood-level slider (Wuppertal)
    // ===================================
    (() => {
        const host = document.querySelector('[data-widget="flood"]');
        const stageBox = document.getElementById('floodStage');
        const slider = document.getElementById('floodSlider');
        const levelLabel = document.getElementById('floodLevelLabel');
        const note = document.getElementById('floodNote');
        if (!host || !stageBox || !slider || !levelLabel || !note) return;

        const W = 800, H = 340;
        const BED = 303, BANK = 240, CH_L = 252, CH_R = 548;
        const CAR_BOTTOM = 178;

        const LEVELS = [
            { y: 278, label: 'normal',
              note: 'A calm day — the Wupper runs its channel, well below the suspended track.' },
            { y: 248, label: '+1 m',
              note: 'Riverside paths go under. In a warming climate, days like this come more often.' },
            { y: 222, label: '+2 m',
              note: 'Over the banks: streets and basements flood, and the city\'s lowest infrastructure is in the water.' },
            { y: CAR_BOTTOM + 5, label: 'July 2021',
              note: 'The 2021 flood pushed the Wupper towards the hanging cars — the "boat" scenario. Our roadmap: early warning, room for the river, unsealed surfaces.' }
        ];

        const settle = goLive(host);
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'flood-svg');
        svg.setAttribute('aria-hidden', 'true');
        stageBox.appendChild(svg);
        const el = (tag, attrs, parent) => {
            const n = document.createElementNS(NS, tag);
            for (const k in attrs) n.setAttribute(k, attrs[k]);
            (parent || svg).appendChild(n);
            return n;
        };

        // banks + riverbed
        el('path', { d: `M 0 ${BANK} L ${CH_L} ${BANK} L ${CH_L + 14} ${BED} L 0 ${BED} Z`, class: 'fl-bank' });
        el('path', { d: `M ${W} ${BANK} L ${CH_R} ${BANK} L ${CH_R - 14} ${BED} L ${W} ${BED} Z`, class: 'fl-bank' });
        el('rect', { x: 0, y: BED, width: W, height: H - BED, class: 'fl-bank' });
        // buildings on the banks
        [[30, 150, 60], [110, 170, 46], [660, 160, 52], [730, 145, 50]].forEach(([x, y, w]) => {
            el('rect', { x, y, width: w, height: BANK - y, class: 'fl-building' });
            for (let wy = y + 12; wy < BANK - 12; wy += 22)
                for (let wx = x + 8; wx < x + w - 10; wx += 16)
                    el('rect', { x: wx, y: wy, width: 6, height: 8, class: 'fl-window' });
        });

        // water (overbank sheet + channel), drawn behind the structure
        const overbank = el('rect', { x: 40, y: BANK, width: W - 80, height: 0, class: 'fl-water' });
        const channel = el('rect', { x: CH_L, y: LEVELS[0].y, width: CH_R - CH_L, height: BED - LEVELS[0].y, class: 'fl-water' });

        // July 2021 reference line
        el('line', { x1: 46, y1: LEVELS[3].y, x2: W - 46, y2: LEVELS[3].y, class: 'fl-refline' });
        el('text', { x: 52, y: LEVELS[3].y - 6, class: 'fl-label' }).textContent = 'July 2021';

        // Schwebebahn: pylons, track beam, hanging car
        [290, 510].forEach(px => {
            el('path', { d: `M ${px - 44} ${BANK} L ${px} 112 L ${px + 44} ${BANK}`, class: 'fl-pylon' });
        });
        el('rect', { x: 210, y: 104, width: 380, height: 10, rx: 3, class: 'fl-beam' });
        el('line', { x1: 400, y1: 114, x2: 400, y2: 140, class: 'fl-pylon' });
        const car = el('g', { class: 'fl-car-g' });
        el('rect', { x: 352, y: 140, width: 96, height: 38, rx: 10, class: 'fl-car' }, car);
        [362, 382, 402, 422].forEach(wx => el('rect', { x: wx, y: 148, width: 14, height: 12, rx: 2, class: 'fl-car-window' }, car));
        fitLabels(stageBox, W);

        let anim = null;
        const setWater = (y, instant) => {
            const chFrom = +channel.getAttribute('y');
            const obTarget = Math.max(0, BANK - y);
            const obFrom = +overbank.getAttribute('height');
            const apply = (p) => {
                const cy = chFrom + (y - chFrom) * p;
                channel.setAttribute('y', cy.toFixed(1));
                channel.setAttribute('height', (BED - cy).toFixed(1));
                const oh = obFrom + (obTarget - obFrom) * p;
                overbank.setAttribute('height', oh.toFixed(1));
                overbank.setAttribute('y', (BANK - oh).toFixed(1));
            };
            if (anim) cancelAnimationFrame(anim);
            anim = null;
            if (instant || calm()) { apply(1); return; }
            const t0 = performance.now();
            const step = (t) => {
                // Held at 0 (the drill's too): a frame's time is when it began,
                // often before t0, and below 0 the ease-out drew a negative height.
                const p = Math.min(1, Math.max(0, (t - t0) / 650));
                apply(p * (2 - p)); // ease-out
                anim = p < 1 ? requestAnimationFrame(step) : null;
            };
            anim = requestAnimationFrame(step);
        };

        const update = (instant) => {
            const lv = LEVELS[+slider.value] || LEVELS[0];
            levelLabel.textContent = lv.label;
            note.textContent = lv.note;
            slider.setAttribute('aria-valuetext', lv.label === 'normal' ? 'normal river level'
                : /^\+/.test(lv.label) ? `river ${lv.label} above normal` : `river at the ${lv.label} flood level`);
            setWater(lv.y, instant);
        };
        slider.addEventListener('input', () => update(false));
        update(true);
        settle();
    })();

    (mks.loaded = mks.loaded || {}).dossier = true;
})();
