// ===================================================================
// DOSSIER WIDGETS — the games inside the project dossiers
// ===================================================================
// "Site the borehole", "Don't let it become a boat" and "Seven in Ten" live
// inside collapsed project dossiers. Until one of those dossiers is opened
// none of this can be seen, so none of it is loaded.
//
// Loaded on demand by script.js (window.mksLoad('dossier')) — see the
// ON-DEMAND MODULES section there for when. This file is a classic script:
// it shares the page's global scope, so it declares nothing at the top
// level and talks to the core only through the window.mks* helpers.
//
// tests/harness.js evaluates it after script.js so the jsdom suites see the
// page fully initialised, the way a visitor who used every feature would.
// ===================================================================

// ===================================
// SITE THE BOREHOLE — resistivity mini-game (groundwater dossier)
// ===================================
(() => {
    const stage = document.getElementById('boreholeStage');
    const drillBtn = document.getElementById('drillBtn');
    const resetBtn = document.getElementById('drillResetBtn');
    const result = document.getElementById('drillResult');
    const score = document.getElementById('drillScore');
    if (!stage || !drillBtn) return;

    const NS = 'http://www.w3.org/2000/svg';
    const W = 800, H = 430;
    const SURFACE = 190, HOLE_BOTTOM = 380;
    const CURVE_TOP = 55, CURVE_BOT = 150;
    let zones = [];          // {center, half, kind: 'water'|'clay'}
    let rigX = 400;
    let drilling = false;
    let drillRun = 0;        // invalidates in-flight drill animations on reset
    let attempts = 0, strikes = 0;
    let svg, curveEl, rigEl, holesEl, revealEl;

    const el = (tag, attrs, parent) => {
        const n = document.createElementNS(NS, tag);
        for (const k in attrs) n.setAttribute(k, attrs[k]);
        (parent || svg).appendChild(n);
        return n;
    };
    const calm = () => document.body.classList.contains('eco-mode') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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

    const drawScene = () => {
        stage.innerHTML = '';
        svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'borehole-svg');
        svg.setAttribute('aria-hidden', 'true');
        stage.appendChild(svg);

        // curve panel
        el('text', { x: 10, y: 30, class: 'bh-label' }).textContent = 'apparent resistivity along the profile';
        el('text', { x: 10, y: CURVE_TOP + 8, class: 'bh-label bh-label-dim' }).textContent = 'high';
        el('text', { x: 10, y: CURVE_BOT, class: 'bh-label bh-label-dim' }).textContent = 'low';
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
    };

    function placeRig(x) {
        rigX = Math.max(50, Math.min(W - 50, x));
        rigEl.setAttribute('transform', `translate(${rigX.toFixed(1)} ${surfaceY(rigX).toFixed(1)})`);
    }

    const toViewX = (clientX) => {
        const r = svg.getBoundingClientRect();
        return (clientX - r.left) * (W / r.width);
    };

    const updateScore = () => {
        if (!attempts) { score.textContent = ''; return; }
        let t = `Strikes: ${strikes}/${attempts}`;
        if (attempts >= 3) t += ' · blind drilling here hits ~30% — our crews read the curve and hit 70%';
        score.textContent = t;
    };

    const finishHole = (x) => {
        const zone = zones.find(z => Math.abs(x - z.center) <= z.half);
        const sy = surfaceY(x);
        attempts++;
        if (zone && zone.kind === 'water') {
            strikes++;
            el('ellipse', { cx: zone.center, cy: 330, rx: zone.half * 1.5, ry: 26, class: 'bh-reveal-water' }, revealEl);
            el('line', { x1: x, y1: 330, x2: x, y2: sy, class: 'bh-water-col' }, holesEl);
            const gush = el('path', { d: `M ${x} ${sy} q -14 -30 -24 -38 M ${x} ${sy} q 0 -36 0 -44 M ${x} ${sy} q 14 -30 24 -38`, class: 'bh-gush' }, holesEl);
            if (!calm()) gush.classList.add('bh-gush-anim');
            result.textContent = `STRIKE — water at ~${Math.round(38 + Math.random() * 14)} m. That dip was a saturated fracture zone. (${strikes}/${attempts})`;
        } else if (zone) {
            el('ellipse', { cx: zone.center, cy: 300, rx: zone.half * 1.4, ry: 20, class: 'bh-reveal-clay' }, revealEl);
            result.textContent = 'Low resistivity… but it was a clay pocket, not water. Even good surveys get fooled — that\'s why we also ran pumping tests.';
        } else {
            result.textContent = 'Dry hole — hard gabbro all the way down. The curve was high here: high resistivity, no fractures, no water.';
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
            const p = Math.min(1, (t - t0) / 900);
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

    newZones();
    drawScene();

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
// DON'T LET IT BECOME A BOAT — Wupper flood-level slider (Wuppertal dossier)
// ===================================
(() => {
    const stageBox = document.getElementById('floodStage');
    const slider = document.getElementById('floodSlider');
    const levelLabel = document.getElementById('floodLevelLabel');
    const note = document.getElementById('floodNote');
    if (!stageBox || !slider) return;

    const NS = 'http://www.w3.org/2000/svg';
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

    const calm = () => document.body.classList.contains('eco-mode') ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
        if (instant || calm()) { apply(1); return; }
        if (anim) cancelAnimationFrame(anim);
        const t0 = performance.now();
        const step = (t) => {
            const p = Math.min(1, (t - t0) / 650);
            apply(p * (2 - p)); // ease-out
            if (p < 1) anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
    };

    const update = (instant) => {
        const lv = LEVELS[+slider.value] || LEVELS[0];
        levelLabel.textContent = lv.label;
        note.textContent = lv.note;
        setWater(lv.y, instant);
    };
    slider.addEventListener('input', () => update(false));
    update(true);
})();


// ===================================
// SEVEN IN TEN — the 70% strike rate as a felt human delta
// A 100-dot waffle of boreholes; the slider moves the strike rate from blind
// drilling in hard rock up to the field-proven 70%, flipping dry holes to water.
// ===================================
(() => {
    const waffle = document.getElementById('strikeWaffle');
    const slider = document.getElementById('strikeSlider');
    const counter = document.getElementById('strikeCounter');
    const out = document.getElementById('strikeOut');
    if (!waffle || !slider || !counter) return;

    const N = 100;
    // Deterministic scatter: 37 is coprime with 100, so (k*37)%100 is a fixed
    // permutation of every cell — the same rate always paints the same picture,
    // no Math.random, no fake variation.
    const order = Array.from({ length: N }, (_, k) => (k * 37) % N);

    const cells = [];
    for (let i = 0; i < N; i++) {
        const c = document.createElement('span');
        c.className = 'strike-cell';
        waffle.appendChild(c);
        cells.push(c);
    }

    const render = (rate) => {
        const water = new Set(order.slice(0, rate));
        for (let i = 0; i < N; i++) cells[i].classList.toggle('water', water.has(i));
        const dry = N - rate;
        const moreThanBlind = rate - 30;
        if (out) out.textContent = rate + '%';
        // Announce a meaningful value on the slider itself instead of spamming a
        // live region on every 1% step.
        slider.setAttribute('aria-valuetext', `${rate}% strike rate — ${rate} of 100 boreholes strike water`);
        let msg = `<strong>${rate} of 100</strong> boreholes strike water — <strong>${dry}</strong> come up dry.`;
        if (rate <= 32) {
            msg += ' Blind drilling in hard rock: about 7 in 10 are dry holes a community paid for.';
        } else if (rate >= 68) {
            msg += ` Reading the resistivity curve first: <strong>7 in 10 strike water</strong> — ${moreThanBlind} more communities served per 100 boreholes, same rigs, same budget.`;
        } else {
            msg += ` That's <strong>${moreThanBlind} more</strong> communities with water than blind drilling — same rigs, same budget.`;
        }
        counter.innerHTML = msg;
    };

    let userInteracted = false;
    slider.addEventListener('input', () => { userInteracted = true; render(+slider.value); });
    // Soft snap to the two meaningful anchors on release.
    slider.addEventListener('change', () => {
        const v = +slider.value;
        if (Math.abs(v - 30) <= 3) { slider.value = 30; render(30); }
        else if (Math.abs(v - 70) <= 3) { slider.value = 70; render(70); }
    });
    render(+slider.value);

    // Auto-demo: on first scroll-into-view, sweep 30 -> 70 so every visitor sees
    // the dry holes turn to water and the slider rests on the win. The cell
    // transitions give the staggered fill. Reduced-motion / eco-mode stay at 70.
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && 'IntersectionObserver' in window) {
        let played = false;
        const io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting) && !played && !userInteracted && !document.body.classList.contains('eco-mode')) {
                played = true;
                io.disconnect();
                slider.value = 30; render(30);
                let v = 30;
                const step = () => {
                    if (userInteracted) return;
                    v += 2;
                    if (v >= 70) { slider.value = 70; render(70); return; }
                    slider.value = v; render(v);
                    setTimeout(step, 45);
                };
                setTimeout(step, 400);
            }
        }, { threshold: 0.35 });
        io.observe(document.getElementById('strikeWidget') || waffle);
    }
})();

// Tells the loader in script.js that this module is in place.
(window.mksLoaded = window.mksLoaded || {}).dossier = true;
