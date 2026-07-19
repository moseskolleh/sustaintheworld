// ===================================================================
// AI CARBON DATA — single source of truth
// Shared by the homepage "AI, Weighed" widget (script.js) and the full
// EcoPrompt Coach tool (carbon-ai.js) so the two can never drift apart.
// Edit the numbers here and both update.
//
// Energy figures adapted from Jegham, Abedin, Ali, et al. (2025), "How Hungry
// is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference."
// Grid intensities: Ember 2023 + IEA 2024. Provider PUE/WUE disclosures.
// All numbers are order-of-magnitude estimates, not measurements.
// ===================================================================
(function (root, factory) {
    const data = factory();
    root.AICarbonData = data;
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    // Energy per 1k tokens (Wh, combined input+output, inference only).
    const MODELS = {
        'gpt-4o':           { label: 'GPT-4o',            provider: 'OpenAI',    energyPer1kTokens_Wh: 0.50, params: '~200B (MoE)' },
        'gpt-4o-mini':      { label: 'GPT-4o mini',       provider: 'OpenAI',    energyPer1kTokens_Wh: 0.08, params: '~8B (distilled)' },
        'gpt-4-1-nano':     { label: 'GPT-4.1 nano',      provider: 'OpenAI',    energyPer1kTokens_Wh: 0.03, params: '~3B' },
        'claude-37-sonnet': { label: 'Claude 3.7 Sonnet', provider: 'Anthropic', energyPer1kTokens_Wh: 0.40, params: '~70B class' },
        'gemini-20-flash':  { label: 'Gemini 2.0 Flash',  provider: 'Google',    energyPer1kTokens_Wh: 0.15, params: '~30B class' },
        'gemini-15-flash':  { label: 'Gemini 1.5 Flash',  provider: 'Google',    energyPer1kTokens_Wh: 0.10, params: '~20B class' },
        'gemini-15-pro':    { label: 'Gemini 1.5 Pro',    provider: 'Google',    energyPer1kTokens_Wh: 0.60, params: '~340B class' },
        'llama-33-70b':     { label: 'Llama 3.3 70B',     provider: 'Meta',      energyPer1kTokens_Wh: 0.30, params: '70B' },
        'llama-32-1b':      { label: 'Llama 3.2 1B',      provider: 'Meta',      energyPer1kTokens_Wh: 0.005, params: '1B' },
        'deepseek-r1':      { label: 'DeepSeek-R1',       provider: 'DeepSeek',  energyPer1kTokens_Wh: 1.20, params: '671B (MoE), reasoning' }
    };

    // Grid carbon intensity (gCO2e/kWh).
    const REGIONS = {
        'no':     { label: 'Norway',                 intensity: 30  },
        'ca-qc':  { label: 'Canada — Quebec',        intensity: 30  },
        'se':     { label: 'Sweden',                 intensity: 41  },
        'fr':     { label: 'France',                 intensity: 56  },
        'br':     { label: 'Brazil',                 intensity: 95  },
        'us-wa':  { label: 'US — Washington',        intensity: 96  },
        'nl':     { label: 'Netherlands',            intensity: 268 },
        'us-avg': { label: 'US — national avg',      intensity: 367 },
        'de':     { label: 'Germany',                intensity: 381 },
        'cn':     { label: 'China',                  intensity: 538 },
        'au':     { label: 'Australia',              intensity: 549 },
        'pl':     { label: 'Poland',                 intensity: 662 },
        'in':     { label: 'India',                  intensity: 713 }
    };

    // Water Usage Effectiveness (litres of water per kWh consumed).
    const WUE_PROFILES = {
        'low':  { label: 'Hyperscaler best-in-class (Google ~0.5)', wue_L_per_kWh: 0.5 },
        'avg':  { label: 'Industry typical (~1.8)',                 wue_L_per_kWh: 1.8 },
        'high': { label: 'Older / inland data centre (~5.0)',       wue_L_per_kWh: 5.0 }
    };

    const PUE = 1.2; // data-centre power overhead (industry-typical)

    // Which models / regions the compact homepage widget shows, and in what order.
    const HOMEPAGE_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-37-sonnet', 'gemini-20-flash', 'llama-33-70b', 'llama-32-1b', 'deepseek-r1'];
    const HOMEPAGE_REGIONS = ['no', 'fr', 'nl', 'us-avg', 'cn', 'in'];

    return { MODELS, REGIONS, WUE_PROFILES, PUE, HOMEPAGE_MODELS, HOMEPAGE_REGIONS };
});
