// Regression tests for the EcoPrompt Coach calculation model.
//
// These exist because the HTML min/max attributes were the only thing
// standing between a visitor and a nonsense reading. They are a browser
// convenience, not a guarantee — so negative queries/day produced negative
// annual emissions, a negative PUE produced negative carbon per query, and a
// scenario with zero tokens advised "cut carbon by NaN%". Validation now
// happens in carbon-ai.js at the calculation boundary; this file holds it
// there.
//
// Run with: node tests/carbon.test.js

const { LIMITS, sanitize, calculate, suggest, MODELS, REGIONS } = require('../carbon-ai.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const BASE = {
    modelKey: 'gpt-4o',
    regionKey: 'nl',
    wueKey: 'avg',
    inputTokens: 200,
    outputTokens: 400,
    queriesPerDay: 50,
    pue: 1.2
};

// Every numeric output a result carries. If any one of them goes negative or
// non-finite, the tool is lying to somebody.
const NUMERIC_OUTPUTS = [
    'energyPerQuery_Wh', 'carbonPerQuery_g', 'waterPerQuery_mL',
    'annualCarbon_kg', 'annualWater_L',
    'ledMinutes', 'coffeeCups', 'kmDriven', 'phoneCharges', 'treesPerYear', 'waterBottles'
];

function checkResult(label, params) {
    let result;
    try {
        result = calculate(params);
    } catch (err) {
        assert(false, `${label}: calculate() must not throw (threw: ${err.message})`);
        return null;
    }
    const bad = NUMERIC_OUTPUTS.filter((k) => !isFinite(result[k]) || result[k] < 0);
    assert(bad.length === 0, `${label}: every output is finite and non-negative (bad: ${bad.join(', ') || 'none'})`);
    return result;
}

// --- Negative values ------------------------------------------------------
// Reproduces the reported defect directly: negative queries/day and a
// negative PUE both used to produce negative emissions.
{
    checkResult('negative queries/day', { ...BASE, queriesPerDay: -100 });
    checkResult('negative PUE', { ...BASE, pue: -2 });
    checkResult('negative tokens', { ...BASE, inputTokens: -500, outputTokens: -500 });
    checkResult('all negative', { ...BASE, inputTokens: -1, outputTokens: -1, queriesPerDay: -1, pue: -1 });

    const negPue = calculate({ ...BASE, pue: -2 });
    const minPue = calculate({ ...BASE, pue: LIMITS.pue.min });
    assert(
        negPue.carbonPerQuery_g === minPue.carbonPerQuery_g,
        'Negative PUE clamps to the physical minimum of 1.0, not to a sign flip'
    );

    const negQ = calculate({ ...BASE, queriesPerDay: -100 });
    assert(negQ.annualCarbon_kg === 0, 'Negative queries/day yields zero annual carbon, never negative');
}

// --- Zero ----------------------------------------------------------------
{
    const zero = checkResult('zero tokens', { ...BASE, inputTokens: 0, outputTokens: 0 });
    assert(zero && zero.carbonPerQuery_g === 0, 'Zero tokens costs zero carbon');

    const tips = suggest({ ...BASE, inputTokens: 0, outputTokens: 0 });
    const nan = tips.filter(t => /NaN|Infinity|undefined/.test(t.text));
    assert(nan.length === 0, `Zero tokens produces no NaN advice (got: ${nan.map(t => t.text).join(' | ') || 'none'})`);
    assert(tips.length > 0, 'Zero tokens still explains why there is nothing to optimise');

    checkResult('zero queries', { ...BASE, queriesPerDay: 0 });
    checkResult('everything zero', { modelKey: 'gpt-4o', regionKey: 'nl', wueKey: 'avg', inputTokens: 0, outputTokens: 0, queriesPerDay: 0, pue: 1 });
}

// --- NaN, Infinity, and junk ---------------------------------------------
{
    [NaN, Infinity, -Infinity, undefined, null, '', 'abc', {}, []].forEach((junk) => {
        const label = `junk value ${JSON.stringify(junk) === undefined ? String(junk) : JSON.stringify(junk)}`;
        checkResult(`${label} in tokens`, { ...BASE, inputTokens: junk });
        checkResult(`${label} in PUE`, { ...BASE, pue: junk });
        checkResult(`${label} in queries`, { ...BASE, queriesPerDay: junk });
    });

    const nanPue = calculate({ ...BASE, pue: NaN });
    assert(isFinite(nanPue.carbonPerQuery_g), 'A NaN PUE does not propagate into the result');

    assert(sanitize({ ...BASE, pue: NaN }).params.pue === LIMITS.pue.fallback, 'A NaN PUE falls back to the documented default');
    assert(sanitize({}).params.pue === LIMITS.pue.fallback, 'Missing parameters fall back rather than throwing');
}

// --- Extreme values -------------------------------------------------------
{
    checkResult('astronomical tokens', { ...BASE, inputTokens: 1e18, outputTokens: 1e18 });
    checkResult('astronomical queries', { ...BASE, queriesPerDay: Number.MAX_SAFE_INTEGER });
    checkResult('astronomical PUE', { ...BASE, pue: 1e9 });

    const huge = sanitize({ ...BASE, inputTokens: 1e18, queriesPerDay: 1e18, pue: 1e9 }).params;
    assert(huge.inputTokens === LIMITS.inputTokens.max, 'Absurd token counts clamp to the documented ceiling');
    assert(huge.queriesPerDay === LIMITS.queriesPerDay.max, 'Absurd query volumes clamp to the documented ceiling');
    assert(huge.pue === LIMITS.pue.max, 'Absurd PUE clamps to the documented ceiling');

    // The clamped worst case must still be a number a human can read, not 1e300.
    const worst = calculate({ ...BASE, inputTokens: 1e18, outputTokens: 1e18, queriesPerDay: 1e18, pue: 1e9 });
    assert(isFinite(worst.annualCarbon_kg), 'The clamped worst case stays finite');
}

// --- Unknown keys ---------------------------------------------------------
// An unknown model key used to throw a TypeError and take the page with it.
{
    checkResult('unknown model', { ...BASE, modelKey: 'no-such-model' });
    checkResult('unknown region', { ...BASE, regionKey: 'atlantis' });
    checkResult('unknown water profile', { ...BASE, wueKey: 'nope' });
    checkResult('no parameters at all', undefined);

    const s = sanitize({ ...BASE, modelKey: 'no-such-model' });
    assert(!!MODELS[s.params.modelKey], 'An unknown model falls back to a real one');
    assert(s.notices.some(n => /unknown modelKey/.test(n)), 'An unknown model is reported, not hidden');
}

// --- Notices --------------------------------------------------------------
// Clamping silently would replace a wrong number with a different wrong
// number. The UI has to be able to say what it changed.
{
    assert(sanitize(BASE).notices.length === 0, 'A valid scenario produces no notices');

    const clamped = sanitize({ ...BASE, queriesPerDay: -100 });
    assert(clamped.notices.length === 1 && /queriesPerDay/.test(clamped.notices[0]), 'An out-of-range value produces exactly one named notice');

    // An in-range value that is only rounded is not "outside" anything.
    const rounded = sanitize({ ...BASE, queriesPerDay: 2.5 });
    assert(
        rounded.notices.length === 1 && /rounded to 3/.test(rounded.notices[0]) && !/outside/.test(rounded.notices[0]),
        `A fractional count says it was rounded, not out of range (${rounded.notices[0]})`
    );
}

// --- Suggestions stay well-formed across the whole input space ------------
{
    const scenarios = [
        { ...BASE },
        { ...BASE, inputTokens: 0, outputTokens: 0 },
        { ...BASE, inputTokens: -5, outputTokens: -5, queriesPerDay: -5, pue: -5 },
        { ...BASE, inputTokens: 1e18, queriesPerDay: 1e18 },
        { ...BASE, pue: NaN },
        { ...BASE, modelKey: 'llama-32-1b', regionKey: 'no', inputTokens: 10, outputTokens: 10, queriesPerDay: 1, pue: 1 },
        { ...BASE, modelKey: 'deepseek-r1', queriesPerDay: 100000, pue: 1.5 }
    ];

    const broken = [];
    scenarios.forEach((s, i) => {
        let tips;
        try {
            tips = suggest(s);
        } catch (err) {
            broken.push(`#${i} threw ${err.message}`);
            return;
        }
        tips.forEach((t) => {
            if (/NaN|Infinity|undefined|null/.test(t.text)) broken.push(`#${i}: ${t.text}`);
            const m = t.text.match(/by (-?\d+)%/);
            if (m && (Number(m[1]) < 0 || Number(m[1]) > 100)) broken.push(`#${i}: implausible percentage ${m[1]}%`);
        });
    });
    assert(broken.length === 0, `Suggestions never render NaN or impossible percentages (${broken.slice(0, 3).join(' | ') || 'none'})`);
}

// --- The model stays internally consistent -------------------------------
{
    const dirty = calculate({ ...BASE, regionKey: 'in' });
    const clean = calculate({ ...BASE, regionKey: 'no' });
    assert(dirty.carbonPerQuery_g > clean.carbonPerQuery_g, 'A dirtier grid yields more carbon for the same energy');
    assert(
        Math.abs(dirty.energyPerQuery_Wh - clean.energyPerQuery_Wh) < 1e-12,
        'Grid region changes carbon but not energy'
    );

    const more = calculate({ ...BASE, inputTokens: BASE.inputTokens * 2 });
    assert(more.energyPerQuery_Wh > BASE.inputTokens * 0 + calculate(BASE).energyPerQuery_Wh, 'More tokens costs more energy');

    // Every region and model must be evaluable — a broken entry in the shared
    // data file would otherwise only surface when a visitor selected it.
    const badModels = Object.keys(MODELS).filter(k => !isFinite(calculate({ ...BASE, modelKey: k }).carbonPerQuery_g));
    const badRegions = Object.keys(REGIONS).filter(k => !isFinite(calculate({ ...BASE, regionKey: k }).carbonPerQuery_g));
    assert(badModels.length === 0, `Every model in the shared data file evaluates (bad: ${badModels.join(', ') || 'none'})`);
    assert(badRegions.length === 0, `Every region in the shared data file evaluates (bad: ${badRegions.join(', ') || 'none'})`);
}

// --- Input and output tokens are priced differently ----------------------
// The model used to add them together, which made a 4000-token prompt with a
// 200-token answer look as costly as the reverse. Decode is the expensive half.
{
    const data = require('../ai-carbon-data.js');

    const promptHeavy = calculate({ ...BASE, inputTokens: 800, outputTokens: 200 });
    const answerHeavy = calculate({ ...BASE, inputTokens: 200, outputTokens: 800 });
    assert(
        answerHeavy.energyPerQuery_Wh > promptHeavy.energyPerQuery_Wh,
        'Tokens: the same total costs more when most of it is generated, not read'
    );

    const ratio = answerHeavy.energyPerQuery_Wh / promptHeavy.energyPerQuery_Wh;
    assert(ratio > 1.5 && ratio < 4, `Tokens: the input/output asymmetry is meaningful but not absurd (${ratio.toFixed(2)}×)`);

    // Calibration: the published per-1k benchmark must survive intact at the
    // reference mix, or every number the homepage widget quotes has moved.
    const mix = data.TOKEN_ENERGY.referenceMix;
    Object.entries(data.MODELS).forEach(([key, model]) => {
        const wh = data.energyForQuery(model, 1000 * mix.input, 1000 * mix.output);
        assert(
            Math.abs(wh - model.energyPer1kTokens_Wh) < 1e-9,
            `Tokens: ${key} reproduces its published Wh/1k at the reference mix (${wh} vs ${model.energyPer1kTokens_Wh})`
        );
    });

    assert(data.effectiveTokens(100, 0) === 100, 'Tokens: input tokens count as themselves');
    assert(
        data.effectiveTokens(0, 100) === 100 * data.TOKEN_ENERGY.outputMultiplier,
        'Tokens: output tokens count as the documented multiple'
    );
}

// --- The evidence ledger --------------------------------------------------
// Every factor the tool multiplies by has to carry its provenance. A number
// with no source, no vintage and no range is the thing this site argues
// against, sitting in the middle of the tool that makes the argument.
{
    const data = require('../ai-carbon-data.js');
    const rows = data.ledger();

    assert(rows.length > 0, `Ledger: renders rows (${rows.length})`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(data.REVIEWED_ON), `Ledger: declares a review date (${data.REVIEWED_ON})`);

    const noSource = rows.filter(r => !r.source && r.value !== 500);   // the bottle is a definition
    assert(noSource.length === 0, `Ledger: every factor cites a source (missing: ${noSource.map(r => r.name).join(', ') || 'none'})`);

    const noRange = rows.filter(r => !r.range);
    assert(noRange.length === 0, `Ledger: every factor states a range (missing: ${noRange.map(r => r.name).join(', ') || 'none'})`);

    const noUpdated = rows.filter(r => !r.updated);
    assert(noUpdated.length === 0, `Ledger: every factor records when it was checked (missing: ${noUpdated.map(r => r.name).join(', ') || 'none'})`);

    // A range that does not contain its own point estimate is a typo.
    const badRange = rows.filter(r => r.range && (r.value < r.range[0] || r.value > r.range[1]));
    assert(badRange.length === 0, `Ledger: every point estimate falls inside its own range (${badRange.map(r => `${r.name} ${r.value} not in ${r.range}`).join('; ') || 'none'})`);

    // Every source referenced must exist, and every source defined must be
    // referenced — an orphan citation is a claim nothing rests on.
    const referenced = new Set(rows.map(r => r.sourceKey).filter(Boolean));
    const defined = new Set(Object.keys(data.SOURCES));
    const dangling = [...referenced].filter(k => !defined.has(k));
    assert(dangling.length === 0, `Ledger: every cited source is defined (${dangling.join(', ') || 'none'})`);

    const noDate = Object.entries(data.SOURCES).filter(([, s]) => !s.published || !s.citation);
    assert(noDate.length === 0, `Ledger: every source has a citation and a publication date (${noDate.map(s => s[0]).join(', ') || 'none'})`);

    // Models must say which version was measured — "GPT-4o" alone stops
    // meaning anything once the provider ships a new snapshot under that name.
    const noVersion = Object.entries(data.MODELS).filter(([, m]) => !m.modelVersion || !m.vintage);
    assert(noVersion.length === 0, `Ledger: every model records the version and vintage measured (${noVersion.map(m => m[0]).join(', ') || 'none'})`);
}

// --- Water intensity must not contradict itself ---------------------------
// ai-carbon-data.js called 0.5 L/kWh "Google", while the methodology page
// cited Google's own report at ~1.1. Both are real figures for different
// things; only one of them can be labelled "Google".
{
    const data = require('../ai-carbon-data.js');
    const fs = require('fs');
    const path = require('path');
    const page = fs.readFileSync(path.join(__dirname, '..', 'carbon-ai.html'), 'utf8');

    const googleProfiles = Object.values(data.WUE_PROFILES).filter(w => /google/i.test(w.label));
    assert(googleProfiles.length <= 1, `Water: at most one profile is attributed to Google (${googleProfiles.map(g => g.label).join(', ')})`);
    googleProfiles.forEach((g) => {
        assert(
            g.wue_L_per_kWh >= 0.8 && g.wue_L_per_kWh <= 1.6,
            `Water: the Google-attributed figure matches its disclosed fleet WUE (${g.wue_L_per_kWh} L/kWh)`
        );
    });

    // The methodology page must no longer hardcode figures that can drift
    // away from the data file — the ledger is rendered from the data instead.
    assert(
        !/WUE\s*~?\s*1\.1\s*L\/kWh/.test(page.replace(/<!--[\s\S]*?-->/g, '')) || googleProfiles.length === 1,
        'Water: the page and the data file agree on the Google WUE figure'
    );

    const profiles = Object.values(data.WUE_PROFILES).map(w => w.wue_L_per_kWh);
    assert(
        profiles.every(v => v > 0 && v < 20),
        `Water: every WUE profile is physically plausible (${profiles.join(', ')})`
    );
}

// --- The tool page, end to end ------------------------------------------
// Everything above tests the model. This tests that a visitor typing a
// negative number into the real page sees the real correction.
{
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');
    const ROOT = path.join(__dirname, '..');

    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'carbon-ai.html'), 'utf8'), {
        runScripts: 'outside-only',
        url: 'https://example.com/'
    });
    const { window } = dom;
    const errors = [];
    window.console.error = (...args) => errors.push(args.join(' '));

    window.eval(fs.readFileSync(path.join(ROOT, 'ai-carbon-data.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(ROOT, 'carbon-ai.js'), 'utf8'));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const doc = window.document;
    const $ = (s) => doc.querySelector(s);
    const type = (id, value) => {
        const el = doc.getElementById(id);
        el.value = String(value);
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
    };

    assert(errors.length === 0, `Page: loads without errors (${errors.join('; ') || 'none'})`);

    const ledgerRows = doc.querySelectorAll('#ledgerTable tbody tr').length;
    assert(ledgerRows > 20, `Page: the evidence ledger renders (${ledgerRows} rows)`);
    assert(doc.querySelectorAll('#ledgerSources li').length > 5, 'Page: the source list renders');
    assert(/\d{4}-\d{2}-\d{2}/.test($('#ledgerReviewed').textContent), 'Page: the ledger states its review date');

    assert($('#inputNotice').hidden, 'Page: no correction notice on the default scenario');

    // A number no HTML min attribute can stop someone entering.
    type('queriesPerDay', -500);
    assert(!$('#inputNotice').hidden, 'Page: a negative value produces a visible notice');
    assert(/queriesPerDay/.test($('#inputNotice').textContent), 'Page: the notice names the field it changed');
    assert($('#outAnnualCarbon').textContent === '0', `Page: annual carbon reads zero, not negative (${$('#outAnnualCarbon').textContent})`);

    type('queriesPerDay', 50);
    assert($('#inputNotice').hidden, 'Page: the notice clears when the value becomes usable');

    // "2e" in a number field: the browser reports '' and flags badInput.
    // It used to be calculated as 0 tokens with nothing said.
    {
        const field = doc.getElementById('inputTokens');
        Object.defineProperty(field, 'validity', { configurable: true, value: { badInput: true } });
        type('inputTokens', '');
        assert(
            !$('#inputNotice').hidden && /inputTokens was not a number/.test($('#inputNotice').textContent),
            `Page: unparseable input is called out, not silently zeroed (${$('#inputNotice').textContent || 'no notice'})`
        );
        delete field.validity;
        type('inputTokens', 500);
        assert($('#inputNotice').hidden, 'Page: the notice clears once the field is a number again');
    }

    // Zero tokens: the scenario that produced "cut carbon by NaN%".
    type('inputTokens', 0);
    type('outputTokens', 0);
    const tipText = Array.from(doc.querySelectorAll('#tipsList li')).map(li => li.textContent).join(' ');
    assert(!/NaN/.test(tipText), `Page: zero tokens produces no NaN advice (${tipText.slice(0, 80)})`);

    const outputs = ['outEnergy', 'outCarbon', 'outWater', 'outAnnualCarbon', 'outAnnualWater'];
    const nan = outputs.filter(id => /NaN|Infinity/.test(doc.getElementById(id).textContent));
    assert(nan.length === 0, `Page: no output renders NaN or Infinity (${nan.join(', ') || 'none'})`);
}

// --- Number formatting ----------------------------------------------------
// The default scenario on carbon-ai.html drove a car "9.46e-4 km" and made
// "0.0 smartphone charges", which reads as free. Every number on both pages
// now goes through one formatter in ai-carbon-data.js; this holds it to
// tiny, ordinary and absurd values alike.
const EXPONENT = /\d[eE][-+]?\d/;
const ROUNDED_TO_NOTHING = /^0(\.0+)?$|\b0\.0+ /;
{
    const { formatNumber, formatQuantity } = require('../ai-carbon-data.js');
    const cases = [
        // [value, digits, maxDigits, expected, why]
        [0, 2, 2, '0', 'zero is zero'],
        [0.6, 3, 6, '0.600', 'ordinary values keep their decimals'],
        [5.8692, 1, 6, '5.9', 'ordinary values round to their digits'],
        [0.000946, 2, 6, '0.00095', 'tiny values keep two significant figures'],
        [0.000082, 2, 6, '0.000082', 'a small model on a clean grid is tiny, not free'],
        [0.002, 3, 6, '0.002', 'no trailing zeros past the significant figures'],
        [1e-7, 2, 6, '< 0.000001', 'below the precision it says "<", not 0'],
        [0.0201, 1, 2, '0.02', 'an everyday comparison below 0.1'],
        [0.034, 1, 1, '< 0.1', 'a comparison that would round to 0.0 says "< 0.1"'],
        [999.96, 1, 1, '1,000', 'rounding up to a thousand is grouped'],
        [52511.2, 1, 6, '52,511', 'thousands are grouped'],
        [2.5e6, 0, 0, '2.5 million', 'millions in words'],
        [4.68e13, 1, 6, '46.8 trillion', 'the top of the input range is readable'],
        [NaN, 2, 2, '—', 'NaN is a dash, not "NaN"'],
        [Infinity, 2, 2, '—', 'Infinity is a dash']
    ];
    cases.forEach(([n, d, max, expected, why]) => {
        const got = formatNumber(n, d, max);
        assert(got === expected, `Format: ${why} (${n} → "${got}", expected "${expected}")`);
    });

    const bad = [];
    for (let e = -14; e <= 24; e += 0.25) {
        const n = 1.37 * Math.pow(10, e);
        [[0, 0], [1, 2], [2, 3], [3, 6]].forEach(([d, max]) => {
            const s = formatNumber(n, d, max);
            if (EXPONENT.test(s) || ROUNDED_TO_NOTHING.test(s)) bad.push(`${n} → ${s}`);
        });
    }
    assert(bad.length === 0, `Format: from 1e-14 to 1e24, never exponent notation and never a rounded zero (${bad.slice(0, 3).join('; ') || 'none'})`);

    [
        [0.000946, 'km', '95 cm', 'the reported "9.46e-4 km" becomes centimetres'],
        [0.5, 'km', '500 m', 'under a kilometre is metres'],
        [1.24, 'km', '1.2 km', 'a kilometre or more stays in km'],
        [4.8e-7, 'km', '< 1 cm', 'below a centimetre says so'],
        [3.6, 'min', '3.6 min', 'minutes stay minutes'],
        [0.012, 'min', '0.7 s', 'under a minute is seconds'],
        [90, 'min', '1.5 h', 'over an hour is hours'],
        [12345, 'km', '12,345 km', 'large distances are grouped']
    ].forEach(([v, ladder, expected, why]) => {
        const got = formatQuantity(v, ladder);
        assert(got === expected, `Units: ${why} (${v} ${ladder} → "${got}")`);
    });
}

// --- The tool page shows those numbers ------------------------------------
{
    const fs = require('fs');
    const path = require('path');
    const { JSDOM } = require('jsdom');
    const ROOT = path.join(__dirname, '..');
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'carbon-ai.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://example.com/' });
    const { window } = dom;
    window.eval(fs.readFileSync(path.join(ROOT, 'ai-carbon-data.js'), 'utf8'));
    window.eval(fs.readFileSync(path.join(ROOT, 'carbon-ai.js'), 'utf8'));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    const doc = window.document;
    const shown = () => Array.from(doc.querySelectorAll('.ca-num, .ca-equiv li > span:last-child, .bar-value'))
        .map(el => `${el.id || el.className}: ${el.textContent.trim()}`);
    const check = (label) => {
        const values = shown();
        const exp = values.filter(v => EXPONENT.test(v));
        const zero = values.filter(v => ROUNDED_TO_NOTHING.test(v.split(': ')[1]));
        assert(exp.length === 0, `Page, ${label}: no exponent notation anywhere (${exp.join('; ') || 'none'})`);
        assert(zero.length === 0, `Page, ${label}: nothing non-zero shown as 0.0 (${zero.join('; ') || 'none'})`);
    };

    // The scenario the page opens with is the one that was reported.
    assert(doc.getElementById('equivKm').textContent === '95 cm', `Page: the default drive reads "95 cm", not "9.46e-4 km" (${doc.getElementById('equivKm').textContent})`);
    assert(doc.getElementById('equivPhone').textContent === '0.02', `Page: the default phone charges read "0.02", not "0.0" (${doc.getElementById('equivPhone').textContent})`);
    check('default scenario');

    doc.querySelector('[data-preset="edge"]').click();
    check('smallest model on the cleanest grid');
    assert(/^< /.test(doc.getElementById('equivPhone').textContent), `Page: a near-zero comparison says "<" (${doc.getElementById('equivPhone').textContent})`);

    const set = (id, v) => { const el = doc.getElementById(id); el.value = String(v); el.dispatchEvent(new window.Event('input', { bubbles: true })); };
    set('inputTokens', 1e7); set('outputTokens', 1e7); set('queriesPerDay', 1e9); set('pue', 3);
    check('the largest scenario the inputs allow');

    // The closed selects cannot wrap, so their options must be short enough
    // for a 320px phone; the detail they used to carry is in the hint.
    ['modelSelect', 'regionSelect', 'wueSelect'].forEach((id) => {
        const sel = doc.getElementById(id);
        const longest = Array.from(sel.options).reduce((a, o) => (o.textContent.length > a.length ? o.textContent : a), '');
        assert(longest.length <= 32, `Page: #${id} options fit a phone (longest ${longest.length} chars: "${longest}")`);
        const hint = doc.getElementById(sel.getAttribute('aria-describedby'));
        assert(hint && hint.textContent.trim().length > 0, `Page: #${id} describes the choice beneath it (${hint && hint.textContent})`);
    });
}

// --- The homepage widget prints through the same formatter ---------------
{
    const { run } = require('./harness.js');
    const { window, errors } = run('dark');
    const doc = window.document;
    const data = window.AICarbonData;
    const text = () => ['ecoEnergy', 'ecoCarbon', 'ecoWater', 'ecoEquiv'].map(id => doc.getElementById(id).textContent).join(' | ') +
        ' | ' + Array.from(doc.querySelectorAll('.eco-bar-val')).map(e => e.textContent).join(' ');
    assert(errors.length === 0, `Homepage: "AI, Weighed" renders without errors (${errors.map(String).join('; ') || 'none'})`);
    assert(!EXPONENT.test(text()), `Homepage: the default reading has no exponent notation (${text().slice(0, 120)})`);

    // The smallest model on the cleanest grid: tiny, never zero, never 1e-5.
    const model = doc.getElementById('ecoModel');
    const grid = doc.getElementById('ecoGrid');
    model.value = String(data.HOMEPAGE_MODELS.indexOf('llama-32-1b'));
    grid.value = String(data.HOMEPAGE_REGIONS.indexOf('no'));
    model.dispatchEvent(new window.Event('change'));
    const small = text();
    assert(!EXPONENT.test(small) && !/(^|\s)0(\.0+)?(\s|$)/.test(small), `Homepage: a tiny reading is neither exponent nor zero (${small.slice(0, 160)})`);
    assert(/\d (s|min|h)\b/.test(doc.getElementById('ecoEquiv').textContent) && /\d (cm|m|km)\b|< 1 cm/.test(doc.getElementById('ecoEquiv').textContent),
        `Homepage: the comparisons carry their own units (${doc.getElementById('ecoEquiv').textContent})`);
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);   // the homepage harness leaves timers running
