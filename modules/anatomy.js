// ===================================================================
// ANATOMY OF A PROMPT — one query, split onto the report lines it lands on
// ===================================================================
// Scope 2, Scope 3 and cooling water, each on its ESRS line, drawn as an
// SVG flow on carbon-ai.html, which fetches this (and anatomy.css) as the
// section nears. No inputs and no sums of its own: the query is whatever
// the calculator is set to, and the numbers are its calculate(), so the two
// cannot disagree. The homepage version had its own pickers and sums.
// ===================================================================
(() => {
    const coach = window.EcoPromptCoach;
    const DATA = window.AICarbonData;
    const box = document.getElementById('anatomyDraw');
    if (!coach || !DATA || !box) return;

    // Made here, so a visit that never scrolls this far carries none of it.
    box.innerHTML = '<p class="ca-anatomy-try">Choose Norway under <strong>Grid region</strong> in the inputs, and watch Scope 2 fall.</p>' +
        '<div class="anatomy-scale" role="group" aria-label="Reporting scale">' +
        '<button type="button" class="anatomy-scale-btn is-active" data-scale="query" aria-pressed="true">per query</button>' +
        '<button type="button" class="anatomy-scale-btn" data-scale="year" aria-pressed="false">per year</button></div>' +
        '<svg class="anatomy-svg" id="anatomySvg" role="img" aria-label="One query split into Scope 2 grid electricity, Scope 3 embodied hardware (not quantified) and data-centre cooling water, each on its ESRS disclosure line. The summary below says the same in words."></svg>' +
        '<p class="anatomy-summary" id="anatomySummary"></p>' +
        '<button type="button" class="anatomy-copy" id="anatomyCopy" data-analytics="anatomy-copy">Copy figure</button>';
    const svg = document.getElementById('anatomySvg');
    const summary = document.getElementById('anatomySummary');
    const copyBtn = document.getElementById('anatomyCopy');
    const mk = (name, attrs, text) => {
        const e = document.createElementNS('http://www.w3.org/2000/svg', name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        if (text !== undefined) e.textContent = text;
        return svg.appendChild(e);
    };

    // The lines of whoever runs the model (a buyer of a hosted one reports
    // the carbon as its Scope 3, category 1, as the foot and summary say).
    // Embodied hardware is on the diagram without a number: the 0.05 gCO2e/Wh
    // once typed here had no source, and the calculator excludes it too. A
    // sourced factor in ai-carbon-data.js would bring it back in both.
    const EMBODIED_NOTE = 'not quantified';
    const LINES = [
        { name: 'Grid electricity', scope: 'Scope 2', esrs: 'ESRS E1-6', what: 'Scope 2 emissions', cls: 'r0' },
        { name: 'Embodied hardware', scope: 'Scope 3', esrs: 'ESRS E1-6', what: 'Scope 3 (capital goods)', cls: 'r1' },
        { name: 'Cooling water', scope: '', esrs: 'ESRS E3-4', what: 'Water consumption', cls: 'r2' }
    ];
    // Scope 2's ribbon is scaled against the dirtiest grid, so a change of
    // grid visibly moves it.
    const worst = Math.max(...Object.values(DATA.REGIONS).map(r => r.intensity));
    // The calculator's precision: two decimals a query, one a year.
    const fmt = (n, digits) => DATA.formatNumber(n, digits, 6);
    const count = (n) => DATA.formatNumber(n, 0);
    let params = null;
    let scale = 'query';

    // One SVG unit to one CSS pixel: the viewBox is the box's own width, so
    // an 11px label is 11px on any screen. The homepage's fixed 720 units put
    // its ESRS lines at about 5px on a phone, and its sideways-scrolling frame
    // cut the labels off. Wide, the flow runs left to right; narrow, the three
    // lines stack under the source, each ribbon turning in from a trunk.
    const MAX = 760;
    let drawnAt = 0;
    const draw = () => {
        if (!params) return;
        const r = coach.calculate(params);
        const yr = scale === 'year';
        const carbon = yr ? `${fmt(r.annualCarbon_kg, 1)} kg` : `${fmt(r.carbonPerQuery_g, 2)} g`;
        const water = yr ? `${fmt(r.annualWater_L, 1)} L` : `${fmt(r.waterPerQuery_mL, 2)} mL`;
        const tokens = count(params.inputTokens + params.outputTokens);
        const W = drawnAt = Math.min(MAX, Math.round(box.clientWidth) || 720);
        const wide = W >= 560;
        const grid = DATA.REGIONS[params.regionKey] || DATA.REGIONS.nl;
        // Scope 3 keeps a hairline: the flow exists, its size is not claimed.
        const widths = [8 + (grid.intensity / worst) * 40, 2, 26].map((w, i) => (wide || i === 1 ? w : w / 2));
        const values = [`${carbon} CO₂e`, EMBODIED_NOTE, `${water} water`];
        const source = yr ? [count(params.queriesPerDay * 365), 'queries a year'] : ['One query', `${tokens} tokens`];

        svg.textContent = '';
        let H = 300;
        if (wide) {
            const cy = 150, sx = 150, lx = W - 250, tx = lx - 12, mx = (sx + tx) / 2;
            mk('rect', { x: 1, y: cy - 38, width: sx - 2, height: 76, rx: 10, class: 'anatomy-source' });
            mk('text', { x: sx / 2, y: cy - 5, 'text-anchor': 'middle', class: 'anatomy-source-t' }, source[0]);
            mk('text', { x: sx / 2, y: cy + 16, 'text-anchor': 'middle', class: 'anatomy-source-sub' }, source[1]);
            [60, 150, 240].forEach((ry, i) => {
                const L = LINES[i], t = widths[i] / 2;
                mk('path', {
                    class: 'anatomy-ribbon ' + L.cls,
                    d: `M ${sx} ${cy - t} C ${mx} ${cy - t}, ${mx} ${ry - t}, ${tx} ${ry - t} L ${tx} ${ry + t} C ${mx} ${ry + t}, ${mx} ${cy + t}, ${sx} ${cy + t} Z`
                });
                mk('text', { x: lx, y: ry - 16, class: 'anatomy-t-title ' + L.cls }, L.scope ? `${L.name} · ${L.scope}` : L.name);
                mk('text', { x: lx, y: ry + 6, class: 'anatomy-t-val' }, values[i]);
                mk('text', { x: lx, y: ry + 26, class: 'anatomy-t-esrs' }, `${L.esrs} · ${L.what}`);
            });
        } else {
            // The first line's ribbon is the right-most in the trunk, so it
            // turns off without crossing the two that carry on down.
            const top = 56, lx = 76, rad = 16, step = 88, xs = [];
            H = top + 14 + 3 * step;
            mk('rect', { x: 1, y: 1, width: W - 2, height: top - 2, rx: 10, class: 'anatomy-source' });
            mk('text', { x: W / 2, y: 25, 'text-anchor': 'middle', class: 'anatomy-source-t' }, source[0]);
            mk('text', { x: W / 2, y: 44, 'text-anchor': 'middle', class: 'anatomy-source-sub' }, source[1]);
            let edge = 12;
            [2, 1, 0].forEach((i) => { xs[i] = edge + widths[i] / 2; edge += widths[i] + 4; });
            LINES.forEach((L, i) => {
                const ty = top + 30 + i * step, ry = ty + 20;
                mk('path', {
                    class: 'anatomy-ribbon anatomy-ribbon-line ' + L.cls,
                    'stroke-width': widths[i],
                    d: `M ${xs[i]} ${top} L ${xs[i]} ${ry - rad} Q ${xs[i]} ${ry} ${xs[i] + rad} ${ry} L ${lx - 8} ${ry}`
                });
                mk('text', { x: lx, y: ty + 12, class: 'anatomy-t-title ' + L.cls }, L.name);
                mk('text', { x: lx, y: ty + 32, class: 'anatomy-t-val' }, values[i]);
                mk('text', { x: lx, y: ty + 50, class: 'anatomy-t-esrs' }, L.esrs);
                mk('text', { x: lx, y: ty + 65, class: 'anatomy-t-esrs' }, L.what);
            });
        }
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        const model = (DATA.MODELS[params.modelKey] || {}).label || params.modelKey;
        const basis = yr ? `at ${count(params.queriesPerDay)} queries a day for a year (${source[0]} queries)` : `one query of ${tokens} tokens`;
        summary.innerHTML = `<strong>${model}</strong>, ${basis} on the <strong>${grid.label}</strong> grid, for whoever runs the model: ` +
            `<strong>${carbon}</strong> Scope 2 and <strong>${water}</strong> cooling water, two ESRS lines quantified. ` +
            `Scope 3 embodied hardware is a third line, named but ${EMBODIED_NOTE}. A buyer of the hosted model reports the carbon as Scope 3, category 1.`;
    };

    box.hidden = false;
    // Read out when its own buttons change it, not on the first fill or on
    // every keystroke in the calculator's fields, far above.
    coach.onChange((p) => { params = p; summary.setAttribute('aria-live', 'off'); draw(); });
    summary.setAttribute('role', 'status');
    // Laid out for the width it has, so drawn again when that changes.
    const refit = () => { if (Math.min(MAX, Math.round(box.clientWidth)) !== drawnAt) draw(); };
    if (typeof ResizeObserver === 'function') new ResizeObserver(refit).observe(box);
    else window.addEventListener('resize', refit);

    const scaleBtns = box.querySelectorAll('.anatomy-scale-btn');
    scaleBtns.forEach((btn) => btn.addEventListener('click', () => {
        scale = btn.getAttribute('data-scale');
        scaleBtns.forEach((b) => {
            b.classList.toggle('is-active', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
        });
        summary.setAttribute('aria-live', 'polite');
        draw();
    }));

    // The figure leaves as text, attributed. This page has none of the
    // homepage's share helpers, so the copy is here; the button says what
    // happened, then goes back to its name.
    let timer = null;
    copyBtn.addEventListener('click', async () => {
        const text = `${summary.textContent}\n— Moses Kolleh Sesay · ${(location.hostname + location.pathname).replace(/\/+$/, '')}`;
        let done = false;
        try {
            await navigator.clipboard.writeText(text);
            done = true;
        } catch (e) {
            // No clipboard API, or no permission: the old way.
            const ta = Object.assign(document.createElement('textarea'), { value: text });
            ta.style.cssText = 'position:fixed;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            try { done = document.execCommand('copy'); } catch (x) { /* not copied */ }
            ta.remove();
        }
        clearTimeout(timer);
        copyBtn.textContent = done ? 'Copied ✓' : 'Copy failed';
        timer = setTimeout(() => { copyBtn.textContent = 'Copy figure'; }, 1700);
    });
})();
