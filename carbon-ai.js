// ===================================================================
// CARBON-AWARE AI DASHBOARD
// Estimates energy + carbon footprint of LLM queries.
// All numbers are publicly-sourced order-of-magnitude estimates,
// not measurements. See methodology section in carbon-ai.html.
// ===================================================================

// Energy per 1k tokens (Wh) — combined input+output, inference only.
// Sources: Patterson et al. 2021, Luccioni et al. 2023 ("Power Hungry
// Processing"), de Vries 2023. Frontier figure leans on Epoch AI's 2024
// estimate of ~0.3 Wh per ChatGPT-class request for a few hundred tokens.
const MODELS = {
    'frontier': {
        label: 'Frontier (GPT-4 / Claude Opus / Gemini Ultra class)',
        energyPer1kTokens_Wh: 1.0,
        params: '~1T (sparse MoE)'
    },
    'mid': {
        label: 'Mid-size (GPT-3.5 / Llama-3-70B class)',
        energyPer1kTokens_Wh: 0.3,
        params: '~70B'
    },
    'small': {
        label: 'Small open model (Llama-3-8B / Mistral-7B)',
        energyPer1kTokens_Wh: 0.05,
        params: '~7-8B'
    },
    'tiny': {
        label: 'Tiny / distilled (Phi-3-mini, Gemma-2B)',
        energyPer1kTokens_Wh: 0.01,
        params: '~2-3B'
    }
};

// Grid carbon intensity (gCO2e/kWh).
// Source: Ember Climate "Yearly Electricity Data" 2023 + IEA 2023.
const REGIONS = {
    'no': { label: 'Norway',                 intensity: 30  },
    'se': { label: 'Sweden',                 intensity: 41  },
    'fr': { label: 'France',                 intensity: 56  },
    'br': { label: 'Brazil',                 intensity: 95  },
    'us-wa': { label: 'US — Washington',     intensity: 96  },
    'ca-qc': { label: 'Canada — Quebec',     intensity: 30  },
    'nl': { label: 'Netherlands',            intensity: 268 },
    'us-avg': { label: 'US — national avg',  intensity: 367 },
    'de': { label: 'Germany',                intensity: 381 },
    'cn': { label: 'China',                  intensity: 538 },
    'au': { label: 'Australia',              intensity: 549 },
    'pl': { label: 'Poland',                 intensity: 662 },
    'in': { label: 'India',                  intensity: 713 }
};

// Equivalence constants.
//  - Gasoline car: EU avg ~170 gCO2e/km tailpipe (EEA 2022).
//  - Smartphone full charge: ~8 gCO2e (Berners-Lee, "How Bad Are Bananas?").
//  - Mature tree CO2 sequestration: ~21 kg/year (US Forest Service / EPA).
//  - 1 LED bulb 10W running for an hour: 10 Wh.
const EQUIV = {
    GASOLINE_KM_GCO2: 170,
    PHONE_CHARGE_GCO2: 8,
    TREE_KG_PER_YEAR: 21,
    LED_BULB_HOUR_WH: 10
};

function calculate({ modelKey, regionKey, inputTokens, outputTokens, queriesPerDay, pue }) {
    const model = MODELS[modelKey];
    const region = REGIONS[regionKey];
    const totalTokens = Math.max(0, (inputTokens || 0) + (outputTokens || 0));
    // Wh -> kWh: divide by 1000.
    const rawEnergy_kWh = (model.energyPer1kTokens_Wh * totalTokens / 1000) / 1000;
    const energy_kWh = rawEnergy_kWh * pue;
    const carbon_g = energy_kWh * region.intensity;
    const annualCarbon_kg = (carbon_g * queriesPerDay * 365) / 1000;
    return {
        energyPerQuery_Wh: energy_kWh * 1000,
        carbonPerQuery_g: carbon_g,
        annualCarbon_kg,
        ledHoursEquiv: (energy_kWh * 1000) / EQUIV.LED_BULB_HOUR_WH,
        kmDriven: carbon_g / EQUIV.GASOLINE_KM_GCO2,
        phoneCharges: carbon_g / EQUIV.PHONE_CHARGE_GCO2,
        treesPerYear: annualCarbon_kg / EQUIV.TREE_KG_PER_YEAR
    };
}

// Expose for the unit test runner (Node).
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MODELS, REGIONS, EQUIV, calculate };
}

// ===================================================================
// UI — runs only in the browser.
// ===================================================================
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const $ = (sel) => document.querySelector(sel);

        const modelSelect = $('#modelSelect');
        const regionSelect = $('#regionSelect');
        const inputTokens = $('#inputTokens');
        const outputTokens = $('#outputTokens');
        const queriesPerDay = $('#queriesPerDay');
        const pue = $('#pue');
        const compareMode = $('#compareMode');

        // Populate selects.
        Object.entries(MODELS).forEach(([key, m]) => {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = `${m.label} — ${m.energyPer1kTokens_Wh} Wh/1k tok`;
            modelSelect.appendChild(o);
        });
        Object.entries(REGIONS).forEach(([key, r]) => {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = `${r.label} — ${r.intensity} gCO₂e/kWh`;
            regionSelect.appendChild(o);
        });
        modelSelect.value = 'frontier';
        regionSelect.value = 'nl';

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
            $('#outAnnual').textContent = fmt(r.annualCarbon_kg, 1);

            $('#equivLed').textContent = fmt(r.ledHoursEquiv, 2);
            $('#equivKm').textContent = fmt(r.kmDriven, 3);
            $('#equivPhone').textContent = fmt(r.phoneCharges, 1);
            $('#equivTrees').textContent = fmt(r.treesPerYear, 1);

            renderChart(params);
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
            } else {
                rows = Object.entries(MODELS).map(([key, model]) => {
                    const r = calculate({ ...params, modelKey: key });
                    return { label: model.label, value: r.carbonPerQuery_g, highlight: key === params.modelKey };
                });
            }
            rows.sort((a, b) => b.value - a.value);
            const max = Math.max(...rows.map(r => r.value), 1e-9);
            rows.forEach(row => {
                const wrap = document.createElement('div');
                wrap.className = 'bar-row' + (row.highlight ? ' bar-row-highlight' : '');
                wrap.innerHTML = `
                    <div class="bar-label">${row.label}</div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${(row.value / max * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="bar-value">${fmt(row.value, 2)} g</div>
                `;
                chart.appendChild(wrap);
            });
        }

        [modelSelect, regionSelect, inputTokens, outputTokens, queriesPerDay, pue, compareMode]
            .forEach(el => el.addEventListener('input', update));

        // Preset scenarios.
        document.querySelectorAll('[data-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.getAttribute('data-preset');
                const presets = {
                    'chat': { model: 'frontier', region: 'nl', input: 200, output: 400, qpd: 50, pue: 1.2 },
                    'rag': { model: 'mid', region: 'fr', input: 4000, output: 800, qpd: 200, pue: 1.2 },
                    'enterprise': { model: 'frontier', region: 'us-avg', input: 800, output: 1200, qpd: 100000, pue: 1.4 },
                    'edge': { model: 'tiny', region: 'se', input: 200, output: 200, qpd: 1000, pue: 1.0 }
                };
                const p = presets[preset];
                if (!p) return;
                modelSelect.value = p.model;
                regionSelect.value = p.region;
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
