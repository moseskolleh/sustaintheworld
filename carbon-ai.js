// ===================================================================
// ECOPROMPT COACH — web companion
// Mirrors the calculation model of github.com/moseskolleh/promptcoach v2
// (Digital Society School). Energy, water, and carbon per LLM query.
//
// Model benchmarks adapted from:
//   Jegham et al. (2025) "How Hungry is AI?" arXiv:2505.09598 (v6, Nov 2025)
//   Google (2025) arXiv:2508.15734 — 0.24 Wh median Gemini prompt
//   Mistral AI LCA (Jul 2025); Epoch AI (Feb 2025); Oviedo et al., Joule 2026
// Provider PUE/WUE disclosures: Google 2025, Microsoft FY2024, AWS 2024.
// All numbers are order-of-magnitude estimates, not measurements.
// The full v2 engine (per-token fit, uncertainty bands, relatable
// equivalents) lives in the promptcoach repo; this page keeps a
// deliberately simple Wh-per-1k-token approximation of the same data.
// ===================================================================

// Energy per 1k tokens (Wh, combined input+output, inference only).
// Derived from the v2 medium benchmark (1000 in / 1000 out) ÷ 2.
const MODELS = {
    'gpt-5':            { label: 'GPT-5 (Instant)',    provider: 'OpenAI',    energyPer1kTokens_Wh: 0.79, params: 'frontier (MoE)' },
    'gpt-5-thinking':   { label: 'GPT-5 (Thinking)',   provider: 'OpenAI',    energyPer1kTokens_Wh: 9.20, params: 'frontier, reasoning' },
    'gpt-4o':           { label: 'GPT-4o',             provider: 'OpenAI',    energyPer1kTokens_Wh: 0.61, params: '~200B (MoE)' },
    'gpt-4o-mini':      { label: 'GPT-4o mini',        provider: 'OpenAI',    energyPer1kTokens_Wh: 0.26, params: '~8B (distilled)' },
    'gpt-4-1-nano':     { label: 'GPT-4.1 nano',       provider: 'OpenAI',    energyPer1kTokens_Wh: 0.14, params: '~3B' },
    'claude-45-sonnet': { label: 'Claude Sonnet 4.5',  provider: 'Anthropic', energyPer1kTokens_Wh: 1.07, params: 'frontier class' },
    'claude-45-haiku':  { label: 'Claude Haiku 4.5',   provider: 'Anthropic', energyPer1kTokens_Wh: 0.21, params: 'small class' },
    'claude-37-sonnet': { label: 'Claude 3.7 Sonnet',  provider: 'Anthropic', energyPer1kTokens_Wh: 1.39, params: '~70B class' },
    'gemini-25-pro':    { label: 'Gemini 2.5 Pro',     provider: 'Google',    energyPer1kTokens_Wh: 0.59, params: 'frontier class' },
    'gemini-25-flash':  { label: 'Gemini 2.5 Flash',   provider: 'Google',    energyPer1kTokens_Wh: 0.23, params: 'Google-anchored: 0.24 Wh median prompt' },
    'gemini-20-flash':  { label: 'Gemini 2.0 Flash',   provider: 'Google',    energyPer1kTokens_Wh: 0.14, params: '~30B class' },
    'mistral-large':    { label: 'Mistral Large 2',    provider: 'Mistral',   energyPer1kTokens_Wh: 1.08, params: 'LCA-anchored (Jul 2025)' },
    'llama-4-scout':    { label: 'Llama 4 Scout',      provider: 'Meta',      energyPer1kTokens_Wh: 0.28, params: 'MoE' },
    'llama-33-70b':     { label: 'Llama 3.3 70B',      provider: 'Meta',      energyPer1kTokens_Wh: 0.43, params: '70B' },
    'llama-32-1b':      { label: 'Llama 3.2 1B',       provider: 'Meta',      energyPer1kTokens_Wh: 0.11, params: '1B' },
    'deepseek-v3':      { label: 'DeepSeek V3',        provider: 'DeepSeek',  energyPer1kTokens_Wh: 0.71, params: '671B (MoE)' },
    'deepseek-r1':      { label: 'DeepSeek-R1',        provider: 'DeepSeek',  energyPer1kTokens_Wh: 14.5, params: '671B (MoE), reasoning' },
    'grok-3':           { label: 'Grok 3',             provider: 'xAI',       energyPer1kTokens_Wh: 1.45, params: 'frontier class' }
};

// Reasoning models burn hidden chain-of-thought tokens — flagged in tips.
const REASONING_KEYS = ['gpt-5-thinking', 'deepseek-r1'];

// Grid carbon intensity (gCO2e/kWh). Ember 2024 + IEA Electricity 2025.
const REGIONS = {
    'no':     { label: 'Norway',                 intensity: 30  },
    'ca-qc':  { label: 'Canada — Quebec',        intensity: 30  },
    'se':     { label: 'Sweden',                 intensity: 41  },
    'fr':     { label: 'France',                 intensity: 56  },
    'br':     { label: 'Brazil',                 intensity: 95  },
    'us-wa':  { label: 'US — Washington',        intensity: 96  },
    'nl':     { label: 'Netherlands',            intensity: 268 },
    'us-avg': { label: 'US — national avg',      intensity: 384 },
    'de':     { label: 'Germany',                intensity: 381 },
    'cn':     { label: 'China',                  intensity: 538 },
    'au':     { label: 'Australia',              intensity: 549 },
    'pl':     { label: 'Poland',                 intensity: 662 },
    'in':     { label: 'India',                  intensity: 713 }
};

// Water Usage Effectiveness (litres of water per kWh consumed).
// Includes on-site cooling water; excludes thermoelectric scope-2 in 'low'.
const WUE_PROFILES = {
    'low':  { label: 'Hyperscaler disclosed (Google 1.15, ISO Cat 2)', wue_L_per_kWh: 1.15 },
    'avg':  { label: 'Industry typical (~1.8)',                        wue_L_per_kWh: 1.8 },
    'high': { label: 'Older / inland data centre (~5.0)',              wue_L_per_kWh: 5.0 }
};

const EQUIV = {
    GASOLINE_KM_GCO2: 170,         // EU avg gasoline car (EEA 2022)
    PHONE_CHARGE_GCO2: 8,          // Berners-Lee, "How Bad Are Bananas?"
    TREE_KG_PER_YEAR: 21,          // US Forest Service / EPA
    LED_BULB_W: 10,                // Standard 10W LED
    COFFEE_CUP_WH: 50,             // Drip coffee per cup, Berners-Lee
    BOTTLE_WATER_ML: 500           // Standard plastic water bottle
};

function calculate({ modelKey, regionKey, wueKey, inputTokens, outputTokens, queriesPerDay, pue }) {
    const model = MODELS[modelKey];
    const region = REGIONS[regionKey];
    const wue = WUE_PROFILES[wueKey];
    const totalTokens = Math.max(0, (inputTokens || 0) + (outputTokens || 0));
    const rawEnergy_kWh = (model.energyPer1kTokens_Wh * totalTokens / 1000) / 1000;
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
function suggest(params) {
    const baseline = calculate(params);
    const tips = [];

    // 1. Suggest a smaller model from the same family if available.
    const SMALLER = {
        'gpt-5': 'gpt-4o-mini',
        'gpt-5-thinking': 'gpt-5',
        'gpt-4o': 'gpt-4o-mini',
        'gpt-4o-mini': 'gpt-4-1-nano',
        'claude-45-sonnet': 'claude-45-haiku',
        'claude-37-sonnet': 'claude-45-haiku',
        'gemini-25-pro': 'gemini-25-flash',
        'gemini-25-flash': 'gemini-20-flash',
        'mistral-large': 'gpt-4o-mini',
        'llama-4-scout': 'llama-32-1b',
        'llama-33-70b': 'llama-32-1b',
        'deepseek-v3': 'gpt-4o-mini',
        'deepseek-r1': 'deepseek-v3',
        'grok-3': 'gpt-4o-mini'
    };
    if (SMALLER[params.modelKey]) {
        const altKey = SMALLER[params.modelKey];
        const alt = calculate({ ...params, modelKey: altKey });
        const saving = 1 - alt.carbonPerQuery_g / baseline.carbonPerQuery_g;
        if (saving > 0.1) {
            tips.push({
                icon: 'fa-compress',
                text: `Swap to <strong>${MODELS[altKey].label}</strong> for tasks that don't need frontier capability — cuts carbon by ${(saving * 100).toFixed(0)}%.`
            });
        }
    }

    // 2. Suggest a cleaner grid region.
    const greenest = Object.entries(REGIONS).sort((a, b) => a[1].intensity - b[1].intensity)[0];
    if (greenest[0] !== params.regionKey && REGIONS[params.regionKey].intensity > 100) {
        const cleanCarbon = baseline.energyPerQuery_Wh / 1000 * greenest[1].intensity;
        const saving = 1 - cleanCarbon / baseline.carbonPerQuery_g;
        tips.push({
            icon: 'fa-leaf',
            text: `Routing inference to <strong>${greenest[1].label}</strong> instead would cut carbon by ${(saving * 100).toFixed(0)}% (same energy, cleaner grid).`
        });
    }

    // 3. Long inputs warning.
    if (params.inputTokens > 1500) {
        const trimmed = calculate({ ...params, inputTokens: 500 });
        const saving = 1 - trimmed.carbonPerQuery_g / baseline.carbonPerQuery_g;
        tips.push({
            icon: 'fa-scissors',
            text: `Your prompt is ${params.inputTokens} tokens — trimming context to 500 tokens saves ${(saving * 100).toFixed(0)}% per call.`
        });
    }

    // 4. Reasoning model warning.
    if (REASONING_KEYS.includes(params.modelKey)) {
        tips.push({
            icon: 'fa-brain',
            text: `Reasoning models burn 10–70× more energy per answer (hidden chain-of-thought tokens). Reserve <strong>${MODELS[params.modelKey].label}</strong> for genuinely hard problems; route simple chat to a non-reasoning model.`
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
    module.exports = { MODELS, REGIONS, WUE_PROFILES, EQUIV, calculate, suggest };
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

        function readInputs() {
            return {
                modelKey: modelSelect.value,
                regionKey: regionSelect.value,
                wueKey: wueSelect.value,
                inputTokens: parseInt(inputTokens.value, 10) || 0,
                outputTokens: parseInt(outputTokens.value, 10) || 0,
                queriesPerDay: parseInt(queriesPerDay.value, 10) || 0,
                pue: parseFloat(pue.value) || 1.0
            };
        }

        function update() {
            const params = readInputs();
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
                list.innerHTML = '<li class="tip-clean"><i class="fas fa-check-circle"></i> Looks lean — small model, clean grid, tight prompt.</li>';
                return;
            }
            tips.forEach(t => {
                const li = document.createElement('li');
                li.innerHTML = `<i class="fas ${t.icon}"></i><span>${t.text}</span>`;
                list.appendChild(li);
            });
        }

        [modelSelect, regionSelect, wueSelect, inputTokens, outputTokens, queriesPerDay, pue, compareMode]
            .forEach(el => el.addEventListener('input', update));

        document.querySelectorAll('[data-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const presets = {
                    'chat':       { model: 'gpt-5',            region: 'nl',     wue: 'avg', input: 200,  output: 400,  qpd: 50,     pue: 1.2 },
                    'rag':        { model: 'claude-45-sonnet', region: 'fr',     wue: 'avg', input: 4000, output: 800,  qpd: 200,    pue: 1.2 },
                    'enterprise': { model: 'gpt-4o',           region: 'us-avg', wue: 'avg', input: 800,  output: 1200, qpd: 100000, pue: 1.4 },
                    'reasoning':  { model: 'gpt-5-thinking',   region: 'us-avg', wue: 'avg', input: 1500, output: 3000, qpd: 500,    pue: 1.3 },
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
