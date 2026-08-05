// ===================================================================
// AI CARBON DATA — single source of truth, with its evidence attached
//
// Shared by the homepage "AI, Weighed" widget (script.js) and the full
// EcoPrompt Coach tool (carbon-ai.js) so the two can never drift apart.
//
// EVERY NUMBER HERE CARRIES ITS EVIDENCE. A figure with no source, no
// publication date and no uncertainty range is an opinion wearing two decimal
// places, and this site's whole argument is that AI's footprint should be
// measured rather than asserted. So each factor records:
//
//   value      the point estimate used in the calculation
//   range      [low, high] — the plausible spread, not a confidence interval
//   source     a key into SOURCES below
//   vintage    what period the underlying measurement describes
//   updated    when a human last checked this entry against its source
//
// The tool renders this as a ledger, so a reader can audit any number without
// reading the code. tests/carbon.test.js fails if an entry loses its evidence.
//
// WHAT THESE NUMBERS ARE NOT: measurements of any specific deployment. They
// are order-of-magnitude public estimates, useful for comparing choices
// (this model vs that one, this grid vs that one) and not for reporting.
// ===================================================================
(function (root, factory) {
    const data = factory();
    root.AICarbonData = data;
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    // When a human last read every source below and confirmed the entries
    // still reflected them. Shown in the tool, so a visitor can judge how
    // fresh the evidence is instead of assuming it is current.
    const REVIEWED_ON = '2026-08-05';

    // ---------------------------------------------------------------
    // Sources
    // ---------------------------------------------------------------
    const SOURCES = {
        jegham2025: {
            citation: 'Jegham, Abedin, Ali, et al. (2025), "How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference"',
            published: '2025',
            kind: 'preprint',
            note: 'Per-query inference benchmarks across commercial and open models. Figures below are adapted to a per-1k-token basis.'
        },
        luccioni2023: {
            citation: 'Luccioni, Viguier & Ligozat (2023), "Power Hungry Processing: Watts Driving the Cost of AI Deployment?"',
            published: '2023',
            kind: 'peer-reviewed',
            note: 'Task-level inference energy; the basis for treating generation as far costlier than classification.'
        },
        patterson2021: {
            citation: 'Patterson et al. (2021), "Carbon Emissions and Large Neural Network Training"',
            published: '2021',
            kind: 'peer-reviewed',
            note: 'Training-side; used here only for data-centre efficiency context.'
        },
        devries2023: {
            citation: 'de Vries (2023), "The growing energy footprint of artificial intelligence", Joule 7(10)',
            published: '2023-10',
            kind: 'peer-reviewed'
        },
        ember2024: {
            citation: 'Ember, Yearly Electricity Data',
            published: '2024',
            kind: 'dataset',
            note: 'National average grid carbon intensity. Annual averages hide large hourly swings.'
        },
        iea2024: {
            citation: 'IEA, Electricity 2024',
            published: '2024-01',
            kind: 'report'
        },
        google2024: {
            citation: 'Google, Environmental Report 2024',
            published: '2024-07',
            kind: 'corporate disclosure',
            note: 'Fleet-wide PUE 1.10 and WUE ≈ 1.1 L/kWh. Individual best sites run lower; the fleet figure is the honest one to quote for "Google".'
        },
        microsoft2024: {
            citation: 'Microsoft, Environmental Sustainability Report 2024',
            published: '2024-05',
            kind: 'corporate disclosure'
        },
        aws2023: {
            citation: 'AWS, Sustainability — data centre efficiency disclosures',
            published: '2023',
            kind: 'corporate disclosure'
        },
        uptime2023: {
            citation: 'Uptime Institute, Global Data Center Survey',
            published: '2023',
            kind: 'industry survey',
            note: 'Industry-wide average PUE has been roughly flat at 1.55–1.6 for a decade; hyperscalers are the exception, not the norm.'
        },
        bernerslee2020: {
            citation: 'Berners-Lee, "How Bad Are Bananas? The Carbon Footprint of Everything" (2020 edition)',
            published: '2020',
            kind: 'book'
        },
        eea2022: {
            citation: 'European Environment Agency, average CO₂ emissions from new passenger cars',
            published: '2022',
            kind: 'dataset'
        },
        epaTrees: {
            citation: 'US EPA / US Forest Service, urban tree carbon sequestration',
            published: '2023',
            kind: 'agency estimate'
        },
        swd2023: {
            citation: 'Sustainable Web Design, "Estimating Digital Emissions" (model v3)',
            published: '2023',
            kind: 'methodology',
            note: 'The 0.36 g CO₂e/MB constant used for page and audio weight elsewhere on this site.'
        }
    };

    // ---------------------------------------------------------------
    // Energy per token
    //
    // The published benchmarks give one blended Wh-per-1k-tokens figure, but
    // input and output tokens are not the same work. Input is prefill: the
    // whole prompt goes through the model in parallel, saturating the GPU.
    // Output is decode: one token at a time, each pass reloading the weights
    // for a single token, which is far less efficient per token.
    //
    // Treating them as interchangeable — which this tool used to do — makes a
    // long prompt with a short answer look as expensive as a short prompt with
    // a long answer. They are not close.
    //
    // So: an output token is modelled as OUTPUT_MULTIPLIER input tokens, and
    // the per-1k figure is calibrated against a reference mix so that the
    // published benchmark is reproduced exactly at that mix. Any other mix
    // moves away from it in the direction the physics says it should.
    // ---------------------------------------------------------------
    const TOKEN_ENERGY = {
        outputMultiplier: 4,
        range: [2, 8],
        referenceMix: { input: 0.5, output: 0.5 },
        source: 'luccioni2023',
        vintage: '2023–2025',
        updated: REVIEWED_ON,
        note: 'Decode is memory-bandwidth bound and processes one token per forward pass; prefill is compute-bound and batches the whole prompt. Reported ratios range from about 2× to 8× depending on batch size, sequence length and KV-cache reuse. 4× is the middle of that spread. The published per-1k-token figures are reproduced exactly at a 50/50 input:output mix.'
    };

    /**
     * Input-token-equivalents for a query. This is the quantity the per-1k
     * energy figures are actually proportional to.
     */
    function effectiveTokens(inputTokens, outputTokens) {
        return (inputTokens || 0) + (outputTokens || 0) * TOKEN_ENERGY.outputMultiplier;
    }

    /**
     * Wh of IT energy (before PUE) for one query.
     *
     * Calibrated so that 1000 tokens at the reference mix costs exactly the
     * model's published energyPer1kTokens_Wh — the homepage widget quotes that
     * figure directly, and it must keep meaning the same thing.
     */
    function energyForQuery(model, inputTokens, outputTokens) {
        if (!model) return 0;
        const mix = TOKEN_ENERGY.referenceMix;
        const perReferenceThousand = 1000 * (mix.input + mix.output * TOKEN_ENERGY.outputMultiplier);
        const perEffectiveToken = model.energyPer1kTokens_Wh / perReferenceThousand;
        return perEffectiveToken * effectiveTokens(inputTokens, outputTokens);
    }

    // ---------------------------------------------------------------
    // Models
    //
    // `vintage` is the period the benchmark describes, and it is the field to
    // look at before trusting any of this: these are 2024–2025 model releases
    // measured in 2025. Providers ship faster than independent benchmarks are
    // published, so newer models are absent — not because they are efficient,
    // but because nobody has measured them in public yet. Adding a model with
    // a guessed number would be worse than leaving it out.
    // ---------------------------------------------------------------
    const MODELS = {
        'gpt-4o': {
            label: 'GPT-4o', provider: 'OpenAI', params: '~200B (MoE, est.)',
            energyPer1kTokens_Wh: 0.50, range: [0.30, 0.90],
            modelVersion: 'gpt-4o, 2024 releases', vintage: '2024–2025',
            source: 'jegham2025', updated: REVIEWED_ON,
            note: 'Parameter count is not disclosed; the energy figure is measured, the size is inferred.'
        },
        'gpt-4o-mini': {
            label: 'GPT-4o mini', provider: 'OpenAI', params: '~8B (distilled, est.)',
            energyPer1kTokens_Wh: 0.08, range: [0.05, 0.15],
            modelVersion: 'gpt-4o-mini, 2024', vintage: '2024–2025',
            source: 'jegham2025', updated: REVIEWED_ON
        },
        'gpt-4-1-nano': {
            label: 'GPT-4.1 nano', provider: 'OpenAI', params: '~3B (est.)',
            energyPer1kTokens_Wh: 0.03, range: [0.02, 0.06],
            modelVersion: 'gpt-4.1-nano, 2025', vintage: '2025',
            source: 'jegham2025', updated: REVIEWED_ON,
            note: 'Least-corroborated entry here — one source, small absolute numbers, wide relative uncertainty.'
        },
        'claude-37-sonnet': {
            label: 'Claude 3.7 Sonnet', provider: 'Anthropic', params: 'undisclosed',
            energyPer1kTokens_Wh: 0.40, range: [0.25, 0.70],
            modelVersion: 'claude-3-7-sonnet, 2025', vintage: '2025',
            source: 'jegham2025', updated: REVIEWED_ON
        },
        'gemini-20-flash': {
            label: 'Gemini 2.0 Flash', provider: 'Google', params: 'undisclosed',
            energyPer1kTokens_Wh: 0.15, range: [0.08, 0.30],
            modelVersion: 'gemini-2.0-flash, 2025', vintage: '2025',
            source: 'jegham2025', updated: REVIEWED_ON
        },
        'gemini-15-flash': {
            label: 'Gemini 1.5 Flash', provider: 'Google', params: 'undisclosed',
            energyPer1kTokens_Wh: 0.10, range: [0.06, 0.20],
            modelVersion: 'gemini-1.5-flash, 2024', vintage: '2024',
            source: 'jegham2025', updated: REVIEWED_ON
        },
        'gemini-15-pro': {
            label: 'Gemini 1.5 Pro', provider: 'Google', params: 'undisclosed',
            energyPer1kTokens_Wh: 0.60, range: [0.35, 1.10],
            modelVersion: 'gemini-1.5-pro, 2024', vintage: '2024',
            source: 'jegham2025', updated: REVIEWED_ON
        },
        'llama-33-70b': {
            label: 'Llama 3.3 70B', provider: 'Meta', params: '70B',
            energyPer1kTokens_Wh: 0.30, range: [0.15, 0.60],
            modelVersion: 'llama-3.3-70b-instruct', vintage: '2024–2025',
            source: 'jegham2025', updated: REVIEWED_ON,
            note: 'Open weights, so the spread is genuinely wide — the same model on different hardware and quantisation differs by more than the range shown.'
        },
        'llama-32-1b': {
            label: 'Llama 3.2 1B', provider: 'Meta', params: '1B',
            energyPer1kTokens_Wh: 0.005, range: [0.002, 0.012],
            modelVersion: 'llama-3.2-1b-instruct', vintage: '2024–2025',
            source: 'jegham2025', updated: REVIEWED_ON,
            note: 'Small enough to run on-device, where data-centre PUE and WUE do not apply at all.'
        },
        'deepseek-r1': {
            label: 'DeepSeek-R1', provider: 'DeepSeek', params: '671B (MoE), reasoning',
            energyPer1kTokens_Wh: 1.20, range: [0.60, 2.50],
            modelVersion: 'deepseek-r1, 2025', vintage: '2025',
            source: 'jegham2025', updated: REVIEWED_ON,
            note: 'Reasoning models emit long hidden chains before answering. Those tokens are billed as output and cost output-token energy, so the effective per-answer cost is higher than the per-token figure suggests.'
        }
    };

    // ---------------------------------------------------------------
    // Grid carbon intensity (gCO₂e/kWh), annual national averages.
    //
    // The range on each is not measurement error — it is the hourly spread
    // within a year. A grid averaging 268 can be at 80 on a windy night and
    // 500 at a still evening peak, which is why "when you run it" is a real
    // lever and not a rounding detail.
    // ---------------------------------------------------------------
    const REGION_SOURCE = { source: 'ember2024', vintage: '2023 data, published 2024', updated: REVIEWED_ON };
    const REGIONS = {
        'no':     Object.assign({ label: 'Norway',            intensity: 30,  range: [20, 60] }, REGION_SOURCE),
        'ca-qc':  Object.assign({ label: 'Canada — Quebec',   intensity: 30,  range: [20, 60] }, REGION_SOURCE),
        'se':     Object.assign({ label: 'Sweden',            intensity: 41,  range: [25, 90] }, REGION_SOURCE),
        'fr':     Object.assign({ label: 'France',            intensity: 56,  range: [30, 150] }, REGION_SOURCE),
        'br':     Object.assign({ label: 'Brazil',            intensity: 95,  range: [60, 200] }, REGION_SOURCE),
        'us-wa':  Object.assign({ label: 'US — Washington',   intensity: 96,  range: [50, 250] }, REGION_SOURCE),
        'nl':     Object.assign({ label: 'Netherlands',       intensity: 268, range: [80, 500] }, REGION_SOURCE),
        'us-avg': Object.assign({ label: 'US — national avg', intensity: 367, range: [150, 600] }, REGION_SOURCE),
        'de':     Object.assign({ label: 'Germany',           intensity: 381, range: [100, 650] }, REGION_SOURCE),
        'cn':     Object.assign({ label: 'China',             intensity: 538, range: [400, 700] }, REGION_SOURCE),
        'au':     Object.assign({ label: 'Australia',         intensity: 549, range: [250, 800] }, REGION_SOURCE),
        'pl':     Object.assign({ label: 'Poland',            intensity: 662, range: [500, 800] }, REGION_SOURCE),
        'in':     Object.assign({ label: 'India',             intensity: 713, range: [600, 800] }, REGION_SOURCE)
    };

    // ---------------------------------------------------------------
    // Water Usage Effectiveness — litres of water per kWh of IT energy.
    //
    // This is where two files used to disagree: the data called 0.5 L/kWh
    // "Google", while the methodology page cited Google's own 2024 report at
    // ≈1.1 L/kWh. Both numbers are real, but they describe different things —
    // 0.5 is what a good individual site achieves, 1.1 is Google's fleet
    // average. The labels now say which is which, and the fleet figure has
    // its own profile so nobody has to pick the wrong one to represent a
    // hyperscaler.
    //
    // On-site cooling water only. Water used to generate the electricity
    // itself (thermoelectric cooling, hydropower evaporation) is a larger and
    // much more location-dependent number, and is not modelled here.
    // ---------------------------------------------------------------
    const WUE_PROFILES = {
        'low':  {
            label: 'Best-in-class site (~0.5 L/kWh)', wue_L_per_kWh: 0.5, range: [0.2, 0.8],
            source: 'google2024', vintage: '2023–2024', updated: REVIEWED_ON,
            note: 'Achieved by individual air-cooled or reclaimed-water sites in favourable climates. Not representative of any provider fleet-wide.'
        },
        'fleet': {
            label: 'Hyperscaler fleet average (~1.1 L/kWh — Google 2024)', wue_L_per_kWh: 1.1, range: [0.8, 1.6],
            source: 'google2024', vintage: '2023 data, published 2024', updated: REVIEWED_ON,
            note: 'Google\'s disclosed fleet-wide WUE. Use this one when the question is "what does a big provider cost", not the best-site figure.'
        },
        'avg':  {
            label: 'Industry typical (~1.8 L/kWh)', wue_L_per_kWh: 1.8, range: [1.2, 2.6],
            source: 'uptime2023', vintage: '2023', updated: REVIEWED_ON,
            note: 'Across all commercial data centres, not just the efficient ones. The default here, because most inference does not run in a flagship facility.'
        },
        'high': {
            label: 'Older / inland facility (~5.0 L/kWh)', wue_L_per_kWh: 5.0, range: [3.0, 9.0],
            source: 'uptime2023', vintage: '2023', updated: REVIEWED_ON,
            note: 'Evaporative cooling in a hot, dry region — the worst realistic case, and the one where water matters more than carbon.'
        }
    };

    // Data-centre power overhead. 1.2 is a modern-but-not-flagship facility:
    // better than the industry average (~1.55), worse than a hyperscaler
    // (~1.10). PUE cannot be below 1.0 by definition.
    const PUE_FACTOR = {
        value: 1.2, range: [1.1, 1.6],
        source: 'uptime2023', vintage: '2023–2024', updated: REVIEWED_ON,
        note: 'Google reports 1.10 fleet-wide; the Uptime Institute puts the industry average near 1.55 and roughly flat for a decade.'
    };
    const PUE = PUE_FACTOR.value;

    // Everyday comparisons. These are the figures that make a number mean
    // something, so they carry sources too.
    const EQUIVALENTS = {
        GASOLINE_KM_GCO2:  { value: 170, range: [140, 200], unit: 'gCO₂e/km', label: 'EU average new petrol car', source: 'eea2022', updated: REVIEWED_ON },
        PHONE_CHARGE_GCO2: { value: 8,   range: [4, 15],    unit: 'gCO₂e',    label: 'One smartphone charge',      source: 'bernerslee2020', updated: REVIEWED_ON },
        TREE_KG_PER_YEAR:  { value: 21,  range: [10, 40],   unit: 'kgCO₂e/yr', label: 'One mature tree, per year', source: 'epaTrees', updated: REVIEWED_ON, note: 'Varies enormously by species, age and climate — the widest range on this page.' },
        LED_BULB_W:        { value: 10,  range: [7, 15],    unit: 'W',        label: 'Standard LED bulb',          source: 'bernerslee2020', updated: REVIEWED_ON },
        COFFEE_CUP_WH:     { value: 50,  range: [30, 80],   unit: 'Wh',       label: 'Brewing one cup of coffee',  source: 'bernerslee2020', updated: REVIEWED_ON },
        BOTTLE_WATER_ML:   { value: 500, range: [500, 500], unit: 'mL',       label: 'Standard water bottle',      source: null, updated: REVIEWED_ON, note: 'A definition, not an estimate.' }
    };

    // The constant used for page and audio transfer weight elsewhere on the
    // site. Kept here so there is exactly one of it.
    const TRANSFER = {
        gramsPerMB: { value: 0.36, range: [0.20, 0.60], unit: 'gCO₂e/MB', source: 'swd2023', vintage: '2023', updated: REVIEWED_ON,
                      note: 'Covers network transfer only — not the energy the receiving device spends rendering or playing what it received.' }
    };

    /**
     * Every factor in one flat list, for rendering the ledger and for the
     * test that checks nothing lost its evidence.
     */
    function ledger() {
        const rows = [];
        const push = (category, name, entry, valueKey, unit) => {
            rows.push({
                category,
                name,
                value: entry[valueKey],
                unit: unit || entry.unit || '',
                range: entry.range || null,
                source: entry.source ? SOURCES[entry.source] : null,
                sourceKey: entry.source || null,
                vintage: entry.vintage || null,
                version: entry.modelVersion || null,
                updated: entry.updated || null,
                note: entry.note || null
            });
        };

        Object.values(MODELS).forEach(m => push('Model energy', `${m.label} (${m.provider})`, m, 'energyPer1kTokens_Wh', 'Wh / 1k tokens'));
        Object.values(REGIONS).forEach(r => push('Grid intensity', r.label, r, 'intensity', 'gCO₂e/kWh'));
        Object.values(WUE_PROFILES).forEach(w => push('Water (WUE)', w.label, w, 'wue_L_per_kWh', 'L/kWh'));
        push('Data-centre overhead', 'PUE', PUE_FACTOR, 'value', '×');
        push('Token model', `Output-token cost multiplier`, TOKEN_ENERGY, 'outputMultiplier', '× an input token');
        Object.values(EQUIVALENTS).forEach(e => push('Equivalents', e.label, e, 'value'));
        push('Transfer', 'Sustainable Web Design constant', TRANSFER.gramsPerMB, 'value');

        return rows;
    }

    // Which models / regions the compact homepage widget shows, and in what order.
    const HOMEPAGE_MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-37-sonnet', 'gemini-20-flash', 'llama-33-70b', 'llama-32-1b', 'deepseek-r1'];
    const HOMEPAGE_REGIONS = ['no', 'fr', 'nl', 'us-avg', 'cn', 'in'];

    return {
        REVIEWED_ON,
        SOURCES,
        MODELS,
        REGIONS,
        WUE_PROFILES,
        PUE,
        PUE_FACTOR,
        TOKEN_ENERGY,
        EQUIVALENTS,
        TRANSFER,
        effectiveTokens,
        energyForQuery,
        ledger,
        HOMEPAGE_MODELS,
        HOMEPAGE_REGIONS
    };
});
