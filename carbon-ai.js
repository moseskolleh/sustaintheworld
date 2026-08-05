// ===================================================================
// ECOPROMPT COACH — web companion
// Mirrors the calculation model of github.com/moseskolleh/promptcoach
// (Digital Society School). Energy, water, and carbon per LLM query.
//
// Model benchmarks adapted from:
//   Jegham, Abedin, Ali, et al. (2025) "How Hungry is AI? Benchmarking
//   Energy, Water, and Carbon Footprint of LLM Inference."
// Provider PUE/WUE disclosures: Google 2024, Microsoft 2024, AWS 2023.
// All numbers are order-of-magnitude estimates, not measurements.
// ===================================================================

// Model, grid, and water-cooling data come from the shared single source of
// truth (ai-carbon-data.js) so this tool and the homepage "AI, Weighed" widget
// can never quote different numbers.
const _AICD = (typeof window !== 'undefined' && window.AICarbonData)
    ? window.AICarbonData
    : require('./ai-carbon-data.js');
const MODELS = _AICD.MODELS;
const REGIONS = _AICD.REGIONS;
const WUE_PROFILES = _AICD.WUE_PROFILES;

// Every equivalence figure now lives in the shared data file with its source
// and range attached, rather than as a bare number with a comment. Unwrapped
// here so the arithmetic below stays readable.
const EQUIV = Object.keys(_AICD.EQUIVALENTS).reduce((acc, key) => {
    acc[key] = _AICD.EQUIVALENTS[key].value;
    return acc;
}, {});

// ===================================================================
// INPUT VALIDATION
//
// The HTML carries min/max/step attributes, but those are a hint to the
// browser, not a guarantee to this module: a visitor can type past them,
// paste a value, use the keyboard in a browser that does not enforce them,
// or reach calculate() from the console or a test. Everything below is
// therefore clamped HERE, at the calculation boundary, because that is the
// only place every caller has to pass through.
//
// What went wrong without it: a negative queries/day produced negative
// annual emissions, a negative PUE produced negative carbon per query
// (physically impossible — PUE is facility energy over IT energy, so it
// cannot be below 1), a NaN anywhere propagated silently through every
// output, and zero tokens produced "cut carbon by NaN%".
// ===================================================================

// min/max are physical or practical bounds; fallback is what a missing or
// unparseable value becomes. Upper bounds are generous — the point is to keep
// arithmetic finite and meaningful, not to police plausible scenarios.
const LIMITS = {
    // A million tokens per query is already past every production context
    // window; beyond it the result stops being a scenario and starts being
    // a floating-point stunt.
    inputTokens:   { min: 0, max: 1e7, fallback: 0, integer: true },
    outputTokens:  { min: 0, max: 1e7, fallback: 0, integer: true },
    // A billion queries/day is ~10x the daily volume any public LLM service
    // has reported, so it is a ceiling nobody legitimately reaches.
    queriesPerDay: { min: 0, max: 1e9, fallback: 0, integer: true },
    // PUE is total facility energy ÷ IT energy. Below 1.0 would mean the
    // building produces energy. Above 3.0 is worse than any measured
    // commercial data centre.
    pue:           { min: 1, max: 3, fallback: 1.2, integer: false }
};

const DEFAULT_KEYS = { modelKey: 'gpt-4o', regionKey: 'nl', wueKey: 'avg' };

function clampNumber(value, limit) {
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !isFinite(n)) return limit.fallback;
    const clamped = Math.min(limit.max, Math.max(limit.min, n));
    return limit.integer ? Math.round(clamped) : clamped;
}

/**
 * Coerces any caller's parameters into a set the model can actually be
 * evaluated on. Returns the safe params plus a list of human-readable
 * adjustments, so the UI can say what it changed instead of silently
 * disagreeing with what is typed in the box.
 */
function sanitize(params) {
    const p = params || {};
    const notices = [];
    const safe = {};

    Object.keys(LIMITS).forEach((field) => {
        const limit = LIMITS[field];
        const value = clampNumber(p[field], limit);
        safe[field] = value;

        const raw = typeof p[field] === 'string' ? Number(p[field]) : p[field];
        if (raw === undefined || raw === null) return;
        if (typeof raw !== 'number' || !isFinite(raw)) {
            notices.push(`${field} was not a number — using ${value}`);
        } else if (raw !== value) {
            notices.push(`${field} ${raw} is outside ${limit.min}–${limit.max} — using ${value}`);
        }
    });

    // An unknown key used to throw on the next line and take the whole page
    // with it. Falling back keeps the tool usable and says what happened.
    [['modelKey', MODELS], ['regionKey', REGIONS], ['wueKey', WUE_PROFILES]].forEach(([field, table]) => {
        if (table[p[field]]) { safe[field] = p[field]; return; }
        safe[field] = DEFAULT_KEYS[field];
        if (p[field] !== undefined) notices.push(`unknown ${field} "${p[field]}" — using ${safe[field]}`);
    });

    return { params: safe, notices };
}

function calculate(rawParams) {
    const { modelKey, regionKey, wueKey, inputTokens, outputTokens, queriesPerDay, pue } = sanitize(rawParams).params;
    const model = MODELS[modelKey];
    const region = REGIONS[regionKey];
    const wue = WUE_PROFILES[wueKey];

    // Input and output tokens are not the same work — prefill batches the
    // whole prompt in parallel, decode emits one token per forward pass. The
    // shared data file holds the multiplier and the calibration; see
    // TOKEN_ENERGY there for why it is 4 and what its range is.
    const rawEnergy_kWh = _AICD.energyForQuery(model, inputTokens, outputTokens) / 1000;
    const energy_kWh = rawEnergy_kWh * pue;
    const carbon_g = energy_kWh * region.intensity;
    const water_mL = energy_kWh * wue.wue_L_per_kWh * 1000;
    const annualCarbon_kg = (carbon_g * queriesPerDay * 365) / 1000;
    const annualWater_L = (water_mL * queriesPerDay * 365) / 1000;
    return {
        energyPerQuery_Wh: energy_kWh * 1000,
        carbonPerQuery_g: carbon_g,
        waterPerQuery_mL: water_mL,
        annualCarbon_kg,
        annualWater_L,
        // Equivalents
        ledMinutes: (energy_kWh * 1000 * 60) / EQUIV.LED_BULB_W,
        coffeeCups: (energy_kWh * 1000) / EQUIV.COFFEE_CUP_WH,
        kmDriven: carbon_g / EQUIV.GASOLINE_KM_GCO2,
        phoneCharges: carbon_g / EQUIV.PHONE_CHARGE_GCO2,
        treesPerYear: annualCarbon_kg / EQUIV.TREE_KG_PER_YEAR,
        waterBottles: water_mL / EQUIV.BOTTLE_WATER_ML
    };
}

// Generate optimization suggestions based on the current scenario.
function suggest(rawParams) {
    const params = sanitize(rawParams).params;
    const baseline = calculate(params);
    const tips = [];

    // Every percentage tip below is a ratio against the baseline. With zero
    // tokens the baseline is zero, and "cut carbon by NaN%" is what a visitor
    // saw. A scenario with no tokens has nothing to optimise, so say that.
    const comparable = isFinite(baseline.carbonPerQuery_g) && baseline.carbonPerQuery_g > 0;
    if (!comparable) {
        if (params.inputTokens + params.outputTokens === 0) {
            tips.push({
                icon: 'fa-scissors',
                text: 'Set input or output tokens above zero — a query with no tokens has no footprint to reduce.'
            });
        }
        return tips;
    }

    // Percentages are only meaningful between 0 and 100; anything outside is
    // a sign the comparison did not apply, and is dropped rather than shown.
    const pct = (saving) => (isFinite(saving) ? Math.round(Math.min(1, Math.max(0, saving)) * 100) : null);

    // 1. Suggest a smaller model from the same family if available.
    const SMALLER = {
        'gpt-4o': 'gpt-4o-mini',
        'gpt-4o-mini': 'gpt-4-1-nano',
        'gemini-15-pro': 'gemini-15-flash',
        'gemini-20-flash': 'gemini-15-flash',
        'claude-37-sonnet': 'gpt-4o-mini',
        'llama-33-70b': 'llama-32-1b',
        'deepseek-r1': 'gpt-4o-mini'
    };
    if (SMALLER[params.modelKey]) {
        const altKey = SMALLER[params.modelKey];
        const alt = calculate({ ...params, modelKey: altKey });
        const saving = pct(1 - alt.carbonPerQuery_g / baseline.carbonPerQuery_g);
        if (saving !== null && saving > 10) {
            tips.push({
                icon: 'fa-compress',
                text: `Swap to <strong>${MODELS[altKey].label}</strong> for tasks that don't need frontier capability — cuts carbon by ${saving}%.`
            });
        }
    }

    // 2. Suggest a cleaner grid region.
    const greenest = Object.entries(REGIONS).sort((a, b) => a[1].intensity - b[1].intensity)[0];
    if (greenest[0] !== params.regionKey && REGIONS[params.regionKey].intensity > 100) {
        const cleanCarbon = baseline.energyPerQuery_Wh / 1000 * greenest[1].intensity;
        const saving = pct(1 - cleanCarbon / baseline.carbonPerQuery_g);
        if (saving !== null && saving > 0) {
            tips.push({
                icon: 'fa-leaf',
                text: `Routing inference to <strong>${greenest[1].label}</strong> instead would cut carbon by ${saving}% (same energy, cleaner grid).`
            });
        }
    }

    // 3. Long inputs warning.
    if (params.inputTokens > 1500) {
        const trimmed = calculate({ ...params, inputTokens: 500 });
        const saving = pct(1 - trimmed.carbonPerQuery_g / baseline.carbonPerQuery_g);
        if (saving !== null && saving > 0) {
            tips.push({
                icon: 'fa-scissors',
                text: `Your prompt is ${params.inputTokens.toLocaleString()} tokens — trimming context to 500 tokens saves ${saving}% per call.`
            });
        }
    }

    // 4. Reasoning model warning.
    if (params.modelKey === 'deepseek-r1') {
        tips.push({
            icon: 'fa-brain',
            text: `Reasoning models burn 4–10× more energy per token. Reserve <strong>DeepSeek-R1</strong> for genuinely hard problems; route simple chat to a non-reasoning model.`
        });
    }

    // 5. PUE high.
    if (params.pue > 1.4) {
        tips.push({
            icon: 'fa-temperature-low',
            text: `PUE ${params.pue} is on the high side. Modern hyperscalers run 1.10–1.20; older facilities pull 1.5+.`
        });
    }

    // 6. Cache / batch nudge for very high volume.
    if (params.queriesPerDay >= 10000) {
        tips.push({
            icon: 'fa-database',
            text: `At ${params.queriesPerDay.toLocaleString()} queries/day, prompt caching and request batching typically reclaim 20–40% of energy.`
        });
    }

    return tips;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MODELS, REGIONS, WUE_PROFILES, EQUIV, LIMITS, sanitize, calculate, suggest };
}

// ===================================================================
// UI — runs only in the browser.
// ===================================================================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const $ = (sel) => document.querySelector(sel);

        const modelSelect = $('#modelSelect');
        const regionSelect = $('#regionSelect');
        const wueSelect = $('#wueSelect');
        const inputTokens = $('#inputTokens');
        const outputTokens = $('#outputTokens');
        const queriesPerDay = $('#queriesPerDay');
        const pue = $('#pue');
        const compareMode = $('#compareMode');

        Object.entries(MODELS).forEach(([key, m]) => {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = `${m.label} (${m.provider}) — ${m.energyPer1kTokens_Wh} Wh/1k tok`;
            modelSelect.appendChild(o);
        });
        Object.entries(REGIONS).forEach(([key, r]) => {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = `${r.label} — ${r.intensity} gCO₂e/kWh`;
            regionSelect.appendChild(o);
        });
        Object.entries(WUE_PROFILES).forEach(([key, w]) => {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = w.label;
            wueSelect.appendChild(o);
        });
        modelSelect.value = 'gpt-4o';
        regionSelect.value = 'nl';
        wueSelect.value = 'avg';

        const fmt = (n, digits = 2) => {
            if (!isFinite(n)) return '—';
            if (n === 0) return '0';
            if (Math.abs(n) < 0.01) return n.toExponential(2);
            if (Math.abs(n) >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
            return n.toFixed(digits);
        };

        // Raw field values, straight from the DOM and deliberately unclamped —
        // sanitize() is the single place that decides what is usable, so the
        // UI never has its own second opinion about the bounds.
        function readInputs() {
            return {
                modelKey: modelSelect.value,
                regionKey: regionSelect.value,
                wueKey: wueSelect.value,
                inputTokens: inputTokens.value === '' ? 0 : Number(inputTokens.value),
                outputTokens: outputTokens.value === '' ? 0 : Number(outputTokens.value),
                queriesPerDay: queriesPerDay.value === '' ? 0 : Number(queriesPerDay.value),
                pue: pue.value === '' ? LIMITS.pue.fallback : Number(pue.value)
            };
        }

        // Says out loud when a typed value is not the value being calculated
        // with. Silently substituting would be worse than the original bug:
        // the visitor would read a number that does not answer their question.
        const notice = $('#inputNotice');
        function showNotices(list) {
            if (!notice) return;
            if (!list.length) {
                notice.hidden = true;
                notice.textContent = '';
                return;
            }
            notice.hidden = false;
            notice.textContent = `Adjusted to a usable range — ${list.join('; ')}.`;
        }

        function update() {
            const raw = readInputs();
            const checked = sanitize(raw);
            const params = checked.params;
            showNotices(checked.notices);
            const r = calculate(params);

            $('#outEnergy').textContent = fmt(r.energyPerQuery_Wh, 3);
            $('#outCarbon').textContent = fmt(r.carbonPerQuery_g, 2);
            $('#outWater').textContent = fmt(r.waterPerQuery_mL, 2);
            $('#outAnnualCarbon').textContent = fmt(r.annualCarbon_kg, 1);
            $('#outAnnualWater').textContent = fmt(r.annualWater_L, 1);

            $('#equivLed').textContent = fmt(r.ledMinutes, 1);
            $('#equivCoffee').textContent = fmt(r.coffeeCups, 3);
            $('#equivKm').textContent = fmt(r.kmDriven, 3);
            $('#equivPhone').textContent = fmt(r.phoneCharges, 1);
            $('#equivTrees').textContent = fmt(r.treesPerYear, 1);
            $('#equivBottles').textContent = fmt(r.waterBottles, 2);

            renderChart(params);
            renderTips(params);
        }

        function renderChart(params) {
            const mode = compareMode.value;
            const chart = $('#chartBars');
            chart.innerHTML = '';
            let rows;
            if (mode === 'regions') {
                rows = Object.entries(REGIONS).map(([key, region]) => {
                    const r = calculate({ ...params, regionKey: key });
                    return { label: region.label, value: r.carbonPerQuery_g, highlight: key === params.regionKey };
                });
            } else if (mode === 'models') {
                rows = Object.entries(MODELS).map(([key, model]) => {
                    const r = calculate({ ...params, modelKey: key });
                    return { label: `${model.label} (${model.provider})`, value: r.carbonPerQuery_g, highlight: key === params.modelKey };
                });
            } else {
                rows = Object.entries(MODELS).map(([key, model]) => {
                    const r = calculate({ ...params, modelKey: key });
                    return { label: `${model.label} (${model.provider})`, value: r.waterPerQuery_mL, highlight: key === params.modelKey };
                });
            }
            rows.sort((a, b) => b.value - a.value);
            const max = Math.max(...rows.map(r => r.value), 1e-9);
            const unit = mode === 'water' ? 'mL' : 'g';
            rows.forEach(row => {
                const wrap = document.createElement('div');
                wrap.className = 'bar-row' + (row.highlight ? ' bar-row-highlight' : '');
                wrap.innerHTML = `
                    <div class="bar-label">${row.label}</div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${(row.value / max * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="bar-value">${fmt(row.value, 2)} ${unit}</div>
                `;
                chart.appendChild(wrap);
            });
        }

        function renderTips(params) {
            const list = $('#tipsList');
            list.innerHTML = '';
            const tips = suggest(params);
            if (tips.length === 0) {
                list.innerHTML = '<li class="tip-clean"><svg class="icon" aria-hidden="true"><use href="#i-check-circle"></use></svg> Looks lean — small model, clean grid, tight prompt.</li>';
                return;
            }
            tips.forEach(t => {
                const li = document.createElement('li');
                li.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${t.icon.replace('fa-', '')}"></use></svg><span>${t.text}</span>`;
                list.appendChild(li);
            });
        }

        // ---------------------------------------------------------------
        // Evidence ledger — rendered from the same objects the calculation
        // uses, so it cannot describe numbers other than the real ones.
        // ---------------------------------------------------------------
        function renderLedger() {
            const table = $('#ledgerTable');
            const list = $('#ledgerSources');
            const reviewed = $('#ledgerReviewed');
            if (!table || !list) return;

            if (reviewed) {
                reviewed.textContent = `All entries last reviewed against their sources on ${_AICD.REVIEWED_ON}.`;
            }

            const rows = _AICD.ledger();
            const body = table.querySelector('tbody');
            body.innerHTML = '';

            // Number the sources once, so each row can point at one.
            const used = [];
            rows.forEach(r => { if (r.sourceKey && !used.includes(r.sourceKey)) used.push(r.sourceKey); });

            let lastCategory = null;
            rows.forEach((r) => {
                if (r.category !== lastCategory) {
                    const head = document.createElement('tr');
                    head.className = 'ca-ledger-group';
                    const th = document.createElement('th');
                    th.setAttribute('colspan', '6');
                    th.setAttribute('scope', 'colgroup');
                    th.textContent = r.category;
                    head.appendChild(th);
                    body.appendChild(head);
                    lastCategory = r.category;
                }

                const tr = document.createElement('tr');
                const cells = [
                    r.name + (r.version ? ` — ${r.version}` : ''),
                    `${r.value} ${r.unit}`.trim(),
                    r.range ? `${r.range[0]} – ${r.range[1]}` : '—',
                    r.sourceKey ? `[${used.indexOf(r.sourceKey) + 1}]` : '—',
                    r.vintage || '—',
                    r.updated || '—'
                ];
                cells.forEach((text, i) => {
                    const td = document.createElement('td');
                    td.textContent = text;
                    if (i === 0 && r.note) td.title = r.note;
                    tr.appendChild(td);
                });
                body.appendChild(tr);

                if (r.note) {
                    const noteRow = document.createElement('tr');
                    noteRow.className = 'ca-ledger-note';
                    const td = document.createElement('td');
                    td.setAttribute('colspan', '6');
                    td.textContent = r.note;
                    noteRow.appendChild(td);
                    body.appendChild(noteRow);
                }
            });

            list.innerHTML = '';
            used.forEach((key) => {
                const src = _AICD.SOURCES[key];
                const li = document.createElement('li');
                li.textContent = `${src.citation} — ${src.kind}, ${src.published}.${src.note ? ` ${src.note}` : ''}`;
                list.appendChild(li);
            });
        }

        renderLedger();

        [modelSelect, regionSelect, wueSelect, inputTokens, outputTokens, queriesPerDay, pue, compareMode]
            .forEach(el => el.addEventListener('input', update));

        document.querySelectorAll('[data-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const presets = {
                    'chat':       { model: 'gpt-4o',           region: 'nl',     wue: 'avg', input: 200,  output: 400,  qpd: 50,     pue: 1.2 },
                    'rag':        { model: 'claude-37-sonnet', region: 'fr',     wue: 'avg', input: 4000, output: 800,  qpd: 200,    pue: 1.2 },
                    'enterprise': { model: 'gpt-4o',           region: 'us-avg', wue: 'avg', input: 800,  output: 1200, qpd: 100000, pue: 1.4 },
                    'reasoning':  { model: 'deepseek-r1',      region: 'us-avg', wue: 'avg', input: 1500, output: 3000, qpd: 500,    pue: 1.3 },
                    'edge':       { model: 'llama-32-1b',      region: 'se',     wue: 'low', input: 200,  output: 200,  qpd: 1000,   pue: 1.0 }
                };
                const p = presets[btn.getAttribute('data-preset')];
                if (!p) return;
                modelSelect.value = p.model;
                regionSelect.value = p.region;
                wueSelect.value = p.wue;
                inputTokens.value = p.input;
                outputTokens.value = p.output;
                queriesPerDay.value = p.qpd;
                pue.value = p.pue;
                update();
            });
        });

        update();
    });
}
