// ===================================================================
// INTERACTIVES — the homepage widgets that respond to the visitor
// ===================================================================
// The "AI, Weighed" widget, the share helpers, The Assay, Anatomy of a
// Prompt, You Draw It and The Receipt: about 77 KB of JavaScript that only
// matters once someone scrolls to section 05 or opens the footer receipt.
// Needs ai-carbon-data.js, which the loader fetches first.
//
// Loaded on demand by script.js (window.mksLoad('interactives')) — see the
// ON-DEMAND MODULES section there for when. This file is a classic script:
// it shares the page's global scope, so it declares nothing at the top
// level and talks to the core only through the window.mks* helpers.
//
// tests/harness.js evaluates it after script.js so the jsdom suites see the
// page fully initialised, the way a visitor who used every feature would.
// ===================================================================

// ===================================
// ECOPROMPT WIDGET — AI, weighed
// All numbers come from the shared source of truth (ai-carbon-data.js), the
// same one the full EcoPrompt Coach tool uses — so they can never disagree.
// ===================================
(() => {
    const modelSel = document.getElementById('ecoModel');
    const presetSel = document.getElementById('ecoPreset');
    const gridSel = document.getElementById('ecoGrid');
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!modelSel || !presetSel || !gridSel || !DATA) return;

    // Compact homepage view, derived from the shared data.
    const MODELS = DATA.HOMEPAGE_MODELS.map(k => ({
        key: k, label: DATA.MODELS[k].label, model: DATA.MODELS[k]
    }));
    const GRIDS = DATA.HOMEPAGE_REGIONS.map(k => ({
        key: k,
        label: `${DATA.REGIONS[k].label} — ${DATA.REGIONS[k].intensity} gCO₂e/kWh`,
        intensity: DATA.REGIONS[k].intensity
    }));
    const PUE = DATA.PUE;                              // data-centre overhead
    const WUE = DATA.WUE_PROFILES.avg.wue_L_per_kWh;   // L per kWh, typical cooling

    MODELS.forEach((m, i) => modelSel.add(new Option(m.label, i)));
    GRIDS.forEach((g, i) => gridSel.add(new Option(g.label, i)));
    modelSel.value = '0';
    gridSel.value = '2'; // Netherlands — where this research happens

    // The shared formatter the full tool uses (ai-carbon-data.js), so the two
    // print a number the same way. A small model on a clean grid is tiny,
    // not free: below a thousandth it says "< 0.001", never "0.000".
    const fmt = (n) => DATA.formatNumber(n, n >= 100 ? 0 : 1, 3);

    // Each workload is the split its label promises ("1,000 in / 8,000
    // out"), read from the option itself so the two cannot drift. Generated
    // tokens cost more than read ones, so spending every preset at a 50/50
    // mix under-counted a reasoning run by a third and over-counted a
    // document read by more than half.
    const workload = () => {
        const opt = presetSel.options[presetSel.selectedIndex];
        return { input: Number(opt.dataset.in) || 0, output: Number(opt.dataset.out) || 0 };
    };

    const footprint = (model, work, grid) => {
        const wh = DATA.energyForQuery(model.model, work.input, work.output);
        const kWh = (wh / 1000) * PUE;
        return {
            wh: kWh * 1000,
            carbon: kWh * grid.intensity,
            water: kWh * WUE * 1000
        };
    };

    const render = () => {
        const model = MODELS[modelSel.value];
        const grid = GRIDS[gridSel.value];
        const work = workload();
        const f = footprint(model, work, grid);

        document.getElementById('ecoEnergy').textContent = fmt(f.wh);
        document.getElementById('ecoCarbon').textContent = fmt(f.carbon);
        document.getElementById('ecoWater').textContent = fmt(f.water);

        // The comparisons carry their unit with them, so a tiny answer reads
        // "1.8 s" and "95 cm" rather than "0.03 min" and "0.95 m".
        const EQ = DATA.EQUIVALENTS;
        const ledMin = f.wh * 60 / EQ.LED_BULB_W.value;
        const carKm = f.carbon / EQ.GASOLINE_KM_GCO2.value;
        const teaspoons = f.water / 4.93;
        document.getElementById('ecoEquiv').innerHTML =
            `One answer &asymp; an LED bulb burning for <strong>${DATA.formatQuantity(ledMin, 'min')}</strong>, ` +
            `driving a petrol car <strong>${DATA.formatQuantity(carKm, 'km')}</strong>, ` +
            `and <strong>${DATA.formatNumber(teaspoons, 1, 2)} teaspoons</strong> of cooling water.`;

        const bars = document.getElementById('ecoBars');
        const results = MODELS.map(m => ({ m, f: footprint(m, work, grid) }))
            .sort((a, b) => a.f.carbon - b.f.carbon);
        const max = results[results.length - 1].f.carbon || 1;
        bars.innerHTML = results.map(({ m, f: mf }) => `
            <div class="eco-bar-row${m.key === model.key ? ' current' : ''}">
                <span class="eco-bar-name">${m.label}</span>
                <span class="eco-bar-track"><span class="eco-bar-fill" data-w="${(mf.carbon / max * 100).toFixed(1)}"></span></span>
                <span class="eco-bar-val">${fmt(mf.carbon)} g</span>
            </div>`).join('');
        requestAnimationFrame(() => {
            bars.querySelectorAll('.eco-bar-fill').forEach(el => {
                el.style.width = el.getAttribute('data-w') + '%';
            });
        });
    };

    [modelSel, presetSel, gridSel].forEach(el => el.addEventListener('change', render));
    render();
    // Announce changes from here on, not the first fill: that happens as the
    // section comes within a screen of the viewport, and was read out in the
    // middle of whatever the visitor was doing further up the page.
    document.getElementById('ecoEquiv').setAttribute('aria-live', 'polite');
})();


// ===================================
// SHARE HELPERS — let every interactive result leave with the visitor.
// Web Share where available (mobile), graceful fallbacks: images fall back to a
// download, text falls back to the clipboard. Every payload links home.
// ===================================
window.mksShare = (() => {
    const SITE = (location.hostname + location.pathname).replace(/\/+$/, '') || 'moseskolleh.github.io/sustaintheworld';
    // Restores the button's markup, not just its text: putting back
    // textContent dropped the icon for good. A second flash before the first
    // has finished keeps the original rather than saving "Copied ✓" as it.
    const flashing = new WeakMap();
    const flash = (btn, msg) => {
        if (!btn) return;
        const state = flashing.get(btn) || { html: btn.innerHTML };
        clearTimeout(state.timer);
        btn.textContent = msg;
        state.timer = setTimeout(() => { btn.innerHTML = state.html; flashing.delete(btn); }, 1700);
        flashing.set(btn, state);
    };
    return {
        site: SITE,
        async image(canvas, filename, text) {
            try {
                if (navigator.share && navigator.canShare) {
                    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                    if (blob) {
                        const file = new File([blob], filename, { type: 'image/png' });
                        if (navigator.canShare({ files: [file] })) {
                            try { await navigator.share({ files: [file], text: text || '' }); return; }
                            catch (e) { if (e && e.name === 'AbortError') return; }
                        }
                    }
                }
            } catch (e) { /* fall through to download */ }
            try {
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = filename;
                document.body.appendChild(a); a.click(); a.remove();
            } catch (e) { /* ignore */ }
        },
        async copy(str, btn) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(str);
                    flash(btn, 'Copied ✓');
                    return;
                }
            } catch (e) { /* fall through to legacy path */ }
            try {
                const ta = document.createElement('textarea');
                ta.value = str; ta.style.position = 'fixed'; ta.style.opacity = '0';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); ta.remove();
                flash(btn, 'Copied ✓');
            } catch (e) { flash(btn, 'Copy failed'); }
        }
    };
})();


// ===================================
// THE ASSAY — paste a JD, get a client-side fit grade, the evidence behind
// it, and the gaps. Deterministic matching over a hand-written rule set and
// the facts in content/profile.json: no AI, no model download, nothing
// leaves the browser — that restraint is the argument.
//
// It used to count keyword hits, and three made a "High-grade match": an ad
// asking for "Fluent Dutch · 5+ years Big Four · SAP" scored top marks with
// no gaps, because nothing looked for what the site cannot show. Now every
// requirement the site does not evidence is a gap, shown as prominently as a
// match; a hard gap caps the grade; and the top grade needs broad coverage
// of the ad. The rules are plain data so Phase 4 can move them into
// content/brief.json, where the validator can hold them to the case studies.
// ===================================
(() => {
    // ASSAY-FACTS:START — generated by scripts/build-content.js from content/profile.json. Do not edit by hand.
    const FACTS = {
        "languages": null,
        "experience": [
            {"title":"Researcher — Sustainable Artificial Intelligence","displayDates":"Sept 2025 — Present","start":"2025-09","end":null},
            {"title":"Cohort 7 Member — Sustainability Consulting Accelerator","displayDates":"Mar 2025 — Apr 2025","start":"2025-03","end":"2025-04"},
            {"title":"Climate Change Adaptation Intern","displayDates":"Jun 2023 — Oct 2023","start":"2023-06","end":"2023-10"},
            {"title":"Field Operations Manager","displayDates":"May 2019 — Sept 2019","start":"2019-05","end":"2019-09"},
            {"title":"Operations Supervisor","displayDates":"Sept 2018 — Apr 2019","start":"2018-09","end":"2019-04"}
        ],
        "degrees": ["MSc Environmental Sciences","MSc Industrial Engineering","BSc Honours Geology"]
    };
    // ASSAY-FACTS:END

    // Synonyms match whole words in any case, with an optional plural. A `re`
    // is a regular expression instead, for the names only case or punctuation
    // tells apart from ordinary words: "SAP", "R" (not "R&D"), "Excel".
    const RULES = {
        minWords: 20,                                   // fewer, and there is nothing to grade honestly
        high: { areas: 3, coverage: 0.6 },              // …and no hard gap at all
        workable: { areas: 2, coverage: 0.4, hardGaps: 1 },

        // A line with one of these asks for something even if nothing below
        // recognises it, and an unanswered one counts against coverage — the
        // thing that stops three matches in a long ad reading as a fit.
        // Stems: "manag" finds "management".
        requirementCues: ['experience', 'knowledge', 'skill', 'abilit', 'able to', 'degree', 'proficien',
            'familiar', 'understanding', 'background', 'expertise', 'you will', 'you\'ll', 'you have',
            'must', 'require', 'strong', 'proven', 'track record', 'responsib', 'manag', 'develop', 'lead',
            'support', 'deliver', 'conduct', 'analy', 'design', 'build', 'coordinat', 'prepar', 'writ',
            'qualif', 'certif', 'fluen', 'years', 'excellent', 'demonstrat', 'hands-on', 'master', 'bachelor'],
        // An unmet requirement on a line like this is listed but does not cap
        // the grade: the ad itself says it can do without it.
        softCues: ['a plus', 'nice to have', 'nice-to-have', 'desirable', 'preferred', 'preferably',
            'an advantage', 'advantageous', 'an asset', 'bonus', 'welcome', 'ideally', 'beneficial'],
        // Whole-line headings only: "Required: SAP" is a requirement.
        softHeading: '^(nice[- ]to[- ]haves?|preferred|desirable|bonus( points)?|pluses|good to have)( qualifications| skills)?\\s*:?$',
        hardHeading: '^(requirements?|required|must[- ]haves?|qualifications|what you bring|who you are|you have|your profile|profile|responsibilities|what you(\'ll| will) do)\\s*:?$',

        // Capability areas backed by delivered work, each with the evidence
        // and where on the site it is.
        strengths: [
            { label: 'ESG analysis & integration',
              syn: ['esg', 'environmental social', 'environmental, social', 'sustainability analyst', 'sustainability strategy', 'materiality', 'double materiality'],
              ev: [{ t: 'ESG Specialist Program certificate, Corporate Finance Institute (2024)', href: '#education' },
                   { t: 'Materiality assessments and transition planning in the OnePointFive accelerator', href: '#experience' }] },
            { label: 'Sustainability reporting (CSRD/ESRS & frameworks)',
              syn: ['csrd', 'esrs', 'sustainability report', 'sustainability reporting', 'non-financial report', 'disclosure', 'gri', 'sasb', 'ifrs s1', 'ifrs s2', 'tcfd', 'tnfd', 'cdp', 'sbti', 'reporting standard'],
              ev: [{ t: 'Framed the sustainable-AI assessment framework against CSRD/ESRS disclosure logic', href: 'case-studies.html#sustainable-ai' },
                   { t: 'SBTi, CDP, GHG Protocol, IFRS S1&S2, TCFD and TNFD covered in the OnePointFive accelerator', href: '#experience' }] },
            { label: 'GHG accounting & carbon footprinting',
              syn: ['ghg', 'greenhouse gas', 'scope 1', 'scope 2', 'scope 3', 'carbon accounting', 'carbon footprint', 'emissions inventory', 'ghg protocol'],
              ev: [{ t: 'Mapped generative AI’s footprint from Scope 2 electricity to Scope 3 hardware and cooling water', href: 'case-studies.html#sustainable-ai' },
                   { t: 'EcoPrompt Coach: energy, water and carbon per AI query, every factor sourced', href: 'carbon-ai.html' }] },
            { label: 'Climate risk, adaptation & disaster resilience',
              syn: ['climate risk', 'climate adaptation', 'resilience', 'physical risk', 'transition risk', 'disaster risk', 'hazard', 'vulnerability', 'sendai'],
              ev: [{ t: 'UNDRR: documented 54 global hazard information systems for the Sendai Framework', href: 'case-studies.html#un-disaster' },
                   { t: 'Flood-risk and adaptation consultancy for Wuppertal (academic consultancy)', href: 'case-studies.html#wuppertal' }] },
            { label: 'Water resources, hydrogeology & WASH',
              syn: ['wash', 'hydrogeology', 'groundwater', 'aquifer', 'borehole', 'water resource', 'water supply', 'water management', 'water sector', 'water security', 'drinking water', 'water point', 'hydrology', 'sanitation'],
              ev: [{ t: '164 water points in Sierra Leone: 100 wells rehabilitated, 50 boreholes built, 14 solar-powered', href: '#experience' },
                   { t: '70% aquifer strike rate using electrical-resistivity surveys', href: 'case-studies.html#groundwater' },
                   { t: 'Soft-path water management for Freetown (MSc thesis)', href: 'case-studies.html#water-management' }] },
            { label: 'GIS & geospatial analysis',
              syn: ['gis', 'qgis', 'arcgis', 'geospatial', 'spatial analysis', 'spatial data', 'remote sensing', 'cartography', 'hazard mapping', 'flood mapping', 'groundwater mapping'],
              ev: [{ t: 'GIS groundwater-potential maps of the Freetown Complex, validated by drilling', href: 'case-studies.html#groundwater' },
                   { t: 'Flood-risk assessment with GIS for Wuppertal', href: 'case-studies.html#wuppertal' }] },
            { label: 'Data analysis & visualization',
              syn: ['python', 'data analysis', 'data analytics', 'pandas', 'sql', 'statistic', 'tableau', 'power bi', 'data visualization', 'data visualisation', 'r programming'],
              ev: [{ t: 'Python for the global river-export pollution analysis (MSc thesis)', href: '#skills' },
                   { t: 'Google Advanced Data Analytics certificate (2024)', href: '#education' }] },
            { label: 'Sustainable AI & AI governance',
              syn: ['sustainable ai', 'ai governance', 'responsible ai', 'ai ethics', 'green ai', 'ai sustainability', 'generative ai', 'llm'],
              ev: [{ t: 'Researcher, Sustainable AI at the Digital Society School, with the Ministry of Finance as partner', href: 'case-studies.html#sustainable-ai' },
                   { t: 'EcoPrompt Coach: the public, runnable companion to the research prototype', href: 'carbon-ai.html' }] },
            { label: 'Water quality & environmental modelling',
              syn: ['pollution', 'water quality', 'contamination', 'nutrient', 'nitrogen', 'effluent', 'catchment', 'watershed', 'eutrophication', 'environmental modelling', 'environmental modeling'],
              ev: [{ t: 'MARINA-Multi pollution modelling across 10,226 sub-basins (MSc thesis)', href: 'case-studies.html#coastal' },
                   { t: 'Future storylines for African coastal water pollution', href: 'case-studies.html#coastal' }] },
            { label: 'Stakeholder engagement & facilitation',
              syn: ['stakeholder', 'facilitation', 'facilitate', 'workshop', 'engagement', 'cross-functional', 'interdisciplinary', 'capacity building', 'collaboration', 'community', 'communities'],
              ev: [{ t: 'Facilitated stakeholder workshops on flood vulnerability in Wuppertal', href: 'case-studies.html#wuppertal' },
                   { t: 'Tested the sustainable-AI prototype with managers and staff in public research sessions', href: 'case-studies.html#sustainable-ai' }] },
            { label: 'Field operations & project delivery',
              syn: ['project management', 'project delivery', 'project manager', 'field operations', 'operations management', 'programme management', 'program management', 'drilling', 'implementation'],
              ev: [{ t: 'Field Operations Manager: completion of 14 solar-powered boreholes, Sierra Leone', href: '#experience' },
                   { t: 'Operations Supervisor: 50 boreholes built and 100 hand-dug wells rehabilitated', href: '#experience' }] },
            { label: 'International & cross-cultural work',
              syn: ['international', 'multicultural', 'cross-cultural', 'multilingual', 'global south', 'developing country', 'developing countries', 'emerging market', 'fieldwork', 'field work'],
              ev: [{ t: 'Studied or worked in Sierra Leone, China, Germany and the Netherlands', href: '#experience' },
                   { t: 'Full Chinese Government MOFCOM scholarship, Hunan University', href: '#education' }] },
            { label: 'Applied research & methodology',
              syn: ['research', 'researcher', 'thesis', 'peer-review', 'methodology', 'literature review', 'academic', 'msc'],
              ev: [{ t: 'MSc Environmental Sciences (Wageningen) and MSc Industrial Engineering (Hunan)', href: '#education' },
                   { t: 'Research outputs, with how to reproduce them', href: 'research.html' }] }
        ],

        // Named methods, tools and platforms: matched only where this page
        // shows the tool (toolEvidence below), a gap anywhere else. A bare
        // name matches itself in any case.
        tools: ['Workiva', 'Enablon', 'Sphera', 'Persefoni', 'Novisto', 'Tableau', 'Python', 'QGIS', 'MATLAB',
            'SPSS', 'Stata', 'SimaPro', 'openLCA', 'GaBi', 'JavaScript', 'Machine learning',
            { name: 'SAP', re: '\\bSAP\\b' },
            { name: 'Excel', re: '\\bExcel\\b' },
            { name: 'R', re: '\\bR\\b(?![&+\'’-])|\\bRStudio\\b' },
            { name: 'Salesforce Net Zero Cloud', syn: ['net zero cloud', 'salesforce'] },
            { name: 'Microsoft Sustainability Manager', syn: ['microsoft sustainability manager', 'microsoft cloud for sustainability'] },
            { name: 'Watershed', syn: ['watershed platform', 'watershed climate'] },
            { name: 'Power BI', syn: ['power bi', 'powerbi'] },
            { name: 'SQL', syn: ['sql', 'postgresql', 'mysql'] },
            { name: 'ArcGIS', syn: ['arcgis', 'esri'] },
            { name: 'Google Earth Engine', syn: ['earth engine'] },
            { name: 'Life Cycle Assessment', re: '\\blife[- ]cycle (?:assessment|analysis)\\b|\\bLCAs?\\b' }],

        // Languages other than English. content/profile.json records none
        // today, so each one an ad asks for is a gap until it does.
        languages: ['German', 'Portuguese', 'Italian', 'Arabic', 'Japanese', 'Swedish', 'Danish', 'Norwegian', 'Polish',
            { name: 'Dutch', syn: ['dutch', 'nederlands', 'flemish'] },
            { name: 'French', syn: ['french', 'français', 'francais'] },
            { name: 'Spanish', syn: ['spanish', 'español', 'espanol'] },
            { name: 'Mandarin', syn: ['mandarin', 'chinese'] }],
        // "Dutch" on a line about a ministry is a nationality. On a line with
        // one of these, or a line of four words or fewer, it is a language.
        languageCues: ['fluent', 'fluency', 'native', 'mother tongue', 'proficient', 'proficiency', 'speak',
            'speaking', 'speaker', 'spoken', 'written', 'verbal', 'language', 'bilingual', 'command of',
            'working knowledge', 'english', 'vloeiend'],
        // Highest first: the first that matches a line is the level it asks
        // for. CEFR codes match in capitals only. No level stated means B2.
        levels: [
            { level: 7, label: 'native', re: '\\b(?:native|mother tongue|bilingual)\\b', flags: 'i' },
            { level: 6, label: 'C2', re: '\\bC2\\b' },
            { level: 5, label: 'C1 / fluent', re: '\\bC1\\b|\\b(?:fluent|fluency|vloeiend|excellent|full professional|professional working)\\b', flags: 'i' },
            { level: 4, label: 'B2', re: '\\bB2\\b|\\b(?:business[- ]level|good command|very good)\\b', flags: 'i' },
            { level: 3, label: 'B1', re: '\\bB1\\b|\\b(?:working knowledge|conversational|intermediate)\\b', flags: 'i' },
            { level: 2, label: 'A2', re: '\\bA2\\b|\\b(?:basic|elementary)\\b', flags: 'i' },
            { level: 1, label: 'A1', re: '\\bA1\\b' }
        ],
        defaultLevel: 4,

        // "5+ years", "minimum of 7 years", "at least three years", "3-5
        // years" (the lower bound). "5+" or "at least 5" is a requirement
        // anywhere; a bare "3 years" only beside an experience cue, and never
        // on a line about the contract or the calendar.
        years: {
            re: '(at least|minimum(?: of)?|min\\.?|over|more than)?\\s*\\b(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty)\\s*(\\+|plus)?\\s*(?:(?:-|–|to)\\s*\\d{1,2}\\s*\\+?\\s*)?years?\\b',
            cue: ['experience', 'experienced', 'background', 'track record', 'working', 'similar role', 'relevant', 'professional', 'senior', 'industry', 'sector', 'field'],
            not: ['contract', 'duration', 'ago', 'fixed-term', 'fixed term', 'old', 'of age', 'per year'],
            words: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 }
        },
        // Years are counted from content/profile.json, professional roles
        // only: a title with one of these is training or a placement.
        notCountedAsYears: ['intern', 'internship', 'cohort', 'accelerator', 'trainee', 'volunteer', 'student'],

        // Hard requirements the site cannot show, beyond tools, languages
        // and years. `cue` must also be on the line, so "As one of the Big
        // Four, we…" is not a demand; `not` rules a line out; {degrees} is
        // filled from content/profile.json.
        gaps: [
            { label: 'Big Four / consulting-firm experience',
              re: '\\bbig (?:four|4)\\b|\\bdeloitte\\b|\\bpwc\\b|pricewaterhouse|\\bkpmg\\b|ernst ?& ?young|\\bEY\\b|\\baccenture\\b|\\bmckinsey\\b|boston consulting|\\bBCG\\b|management consult|consult(?:ing|ancy) (?:firm|experience)',
              flags: 'i',
              cue: ['experience', 'background', 'years', 'worked', 'track record', 'previous', 'prior', 'alumni'],
              text: 'Not evidenced on this site: the consulting on it is an academic consultancy project (Wuppertal) and an accelerator cohort (OnePointFive), not employment at a consulting firm. Ask Moses.' },
            { label: 'Director / head-of level',
              syn: ['senior director', 'head of sustainability', 'head of esg', 'vice president', 'principal consultant', 'managing director', 'director level', 'director-level'],
              not: ['report to', 'reporting to', 'reports to', 'work with', 'working with'],
              text: 'No role at that level is listed on this site. Ask Moses.' },
            { label: 'Financial modelling / valuation',
              syn: ['financial model', 'financial modeling', 'financial modelling', 'valuation', 'cfa', 'equity research', 'fp&a'],
              text: 'Not evidenced on this site; the analysis here is environmental, not financial. Ask Moses.' },
            { label: 'A PhD',
              syn: ['phd required', 'doctorate required', 'phd in', 'phd degree', 'doctoral degree'],
              not: ['msc or', 'master or', 'master\'s or', 'masters or', 'or phd', 'or a phd'],
              text: 'Not evidenced on this site; the degrees listed are {degrees}. Ask Moses.' },
            { label: 'A law degree',
              syn: ['attorney', 'law degree', 'legal counsel', 'regulatory lawyer', 'bar admission', 'qualified lawyer'],
              text: 'Not evidenced on this site; the degrees listed are {degrees}. Ask Moses.' }
        ],

        // Facts only Moses can state. Never graded, always listed.
        confirm: [
            { label: 'Right to work', syn: ['right to work', 'work permit', 'eligible to work', 'authorised to work', 'authorized to work', 'work authorisation', 'work authorization', 'residence permit', 'eu citizen', 'eu citizenship', 'eu passport'] },
            { label: 'Visa sponsorship', syn: ['visa', 'sponsorship', 'kennismigrant', 'highly skilled migrant'] },
            { label: 'Security clearance', syn: ['security clearance', 'sc clearance', 'dv clearance', 'security vetting', 'background check', 'certificate of conduct', 'vog'] },
            { label: 'Driving licence', syn: ['driving licence', 'driving license', 'driver\'s licence', 'driver\'s license', 'drivers licence', 'drivers license'] },
            { label: 'Relocation', syn: ['relocate', 'relocation', 'willing to move'] }
        ]
    };

    // --- Matching ----------------------------------------------------------
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const cache = new Map();
    const rx = (source, flags) => {
        const key = source + '/' + (flags || '');
        if (!cache.has(key)) cache.set(key, new RegExp(source, flags || ''));
        return cache.get(key);
    };
    // Whole words, so "gis" does not match inside "logistics".
    const hit = (text, syns) => !!(syns && syns.length) &&
        rx('(?:^|[^\\w])(?:' + syns.map(esc).join('|') + ')(?:s|es)?(?!\\w)', 'i').test(text);
    const stemHit = (text, stems) => rx('\\b(?:' + stems.map(esc).join('|') + ')', 'i').test(text);
    const matches = (text, rule) => (rule.re ? rx(rule.re, rule.flags).test(text) : hit(text, rule.syn));
    const named = (x) => (typeof x === 'string' ? { name: x, syn: [x.toLowerCase()] } : x);
    const TOOLS = RULES.tools.map(named);
    const LANGUAGES = RULES.languages.map(named);
    const listJoin = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    // Where this page shows a tool, best proof first: the skills toolkit
    // (it carries a proof line), then the experience bullets, the project
    // tags, the courses and the skill chips. Read from the page itself, so a
    // tool the page stops showing stops being matched.
    const clean = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const up = (el, sel, inner) => clean(el.closest(sel) && el.closest(sel).querySelector(inner));
    const SOURCES = [
        ['#skills .toolkit-name', '#skills', (el) => `Skills: ${up(el, '.toolkit-item', '.toolkit-proof') || clean(el)}`],
        ['#experience li', '#experience', (el) => clean(el) + (up(el, '.timeline-content', 'h3') ? ` (${up(el, '.timeline-content', 'h3')})` : '')],
        ['#projects .project-tech span', '#projects', (el) => `Listed as a tool on the ${up(el, '.project-card', 'h3')} dossier`],
        ['#education li', '#education', (el) => `Covered in ${up(el, '.education-card', 'h3')}: ${clean(el)}`],
        ['#skills .chip, #skills .framework-card', '#skills', () => 'Listed under Skills & Expertise']
    ];
    function toolEvidence(tool, doc) {
        for (const [sel, href, say] of (doc ? SOURCES : [])) {
            const el = Array.from(doc.querySelectorAll(sel)).find(e => matches(clean(e), tool));
            if (el) return [{ t: say(el), href }];
        }
        return null;
    }

    // One line per requirement: a bullet, a sentence, a semicolon clause —
    // and "·", so "Fluent Dutch · 5+ years Big Four · SAP" is three.
    const splitLines = (raw) => raw
        .replace(/([.!?])\s+(?=[A-Z0-9(])/g, '$1\n')
        .split(/[\n\r;•·▪►]+/)
        .map(l => l.replace(/^\s*(?:[-–—*]+|\d{1,2}[.)])\s+/, '').trim())
        .filter(Boolean);

    const levelOf = (text) => RULES.levels.find(l => rx(l.re, l.flags).test(text)) || null;
    const month = (ym) => { const [y, m] = String(ym).split('-').map(Number); return y * 12 + m - 1; };
    const duration = (months) => {
        const y = Math.floor(months / 12);
        const m = months % 12;
        return y ? plural(y, 'year') + (m ? ' ' + plural(m, 'month') : '') : plural(m, 'month');
    };

    // Professional experience from content/profile.json, counted the
    // conservative way: each role from its first month to its last ("May
    // 2019 — Sept 2019" is four months, mid-month to mid-month), an open
    // role to this month, and internships, programmes and study not at all.
    function experienceCount(facts, now) {
        const skip = rx('\\b(?:' + RULES.notCountedAsYears.join('|') + ')\\b', 'i');
        const roles = facts.experience || [];
        const counted = roles.filter(r => !skip.test(r.title));
        const current = now.getFullYear() * 12 + now.getMonth();
        const months = counted.reduce((n, r) => n + Math.max(0, (r.end ? month(r.end) : current) - month(r.start)), 0);
        return { months, counted, skipped: roles.filter(r => skip.test(r.title)) };
    }

    /**
     * The whole assessment, as data. Pure apart from reading the page for
     * tool evidence; `opts.facts`, `opts.now` and `opts.doc` let a test pin
     * all three.
     */
    function analyse(raw, opts) {
        const o = opts || {};
        const facts = o.facts || FACTS;
        const doc = 'doc' in o ? o.doc : document;
        const text = String(raw || '');
        const words = (text.match(/[A-Za-z0-9À-ÿ][\w'’&+-]*/g) || []).length;
        if (words < RULES.minWords) return { status: words ? 'short' : 'empty', words };

        const exp = experienceCount(facts, o.now || new Date());
        const degrees = listJoin(facts.degrees || []) || 'not listed';
        const seen = {};
        const matched = [];     // capability areas, with their evidence
        const met = [];         // named requirements the site evidences
        const gaps = [];        // …and the ones it does not
        const confirm = [];
        const toolEv = {};
        let softSection = false;
        let asked = 0;
        let answered = 0;

        splitLines(text).forEach((line) => {
            const n = line.split(/\s+/).length;
            // A heading ("Requirements:", "Nice to have") asks for nothing
            // itself, but a soft one makes every line under it soft.
            const heading = /:$/.test(line);
            if (heading || n <= 4) {
                if (rx(RULES.softHeading, 'i').test(line)) { softSection = true; return; }
                if (rx(RULES.hardHeading, 'i').test(line)) { softSection = false; return; }
                if (heading) return;
            }
            const soft = softSection || hit(line, RULES.softCues);
            let recognised = false;
            let covered = false;
            let missing = false;
            let toConfirm = false;
            // One named requirement: met, with its evidence, or a gap. Asked
            // twice, it is listed once, hard if either time was.
            const need = (key, label, ev, note) => {
                recognised = true;
                if (ev) {
                    covered = true;
                    if (!seen[key]) met.push(seen[key] = { label, ev });
                    return;
                }
                missing = missing || !soft;
                if (!seen[key]) gaps.push(seen[key] = { label, text: note, hard: false });
                seen[key].hard = seen[key].hard || !soft;
            };

            RULES.strengths.forEach((s) => {
                if (!hit(line, s.syn)) return;
                recognised = covered = true;
                if (!seen[s.label]) matched.push(seen[s.label] = s);
            });

            TOOLS.forEach((tool) => {
                if (!matches(line, tool)) return;
                if (!(tool.name in toolEv)) toolEv[tool.name] = toolEvidence(tool, doc);
                need('tool:' + tool.name, tool.name, toolEv[tool.name], 'Not evidenced on this site. Ask Moses.');
            });

            if (hit(line, RULES.languageCues) || /\b[ABC][12]\b/.test(line) || n <= 4) {
                LANGUAGES.forEach((lang) => {
                    if (!hit(line, lang.syn)) return;
                    // The level beside this language, else the line's:
                    // "Native German, business-level French" asks for two.
                    const want = levelOf(line.split(/,|\/|\band\b/i).find(seg => hit(seg, lang.syn)) || '') || levelOf(line);
                    const has = (facts.languages || []).find(l => hit(String(l.language), lang.syn));
                    const hasLevel = has && levelOf(String(has.level));
                    const ok = hasLevel && hasLevel.level >= (want ? want.level : RULES.defaultLevel);
                    need(`lang:${lang.name}:${want ? want.level : ''}`, lang.name + (want ? ` (${want.label})` : ''),
                        ok && [{ t: `${lang.name} at ${has.level}, as listed on this site` }],
                        has ? `The level listed on this site is ${has.level}. Ask Moses.` : 'Not evidenced on this site. Ask Moses.');
                });
            }

            const Y = RULES.years;
            if (!hit(line, Y.not)) {
                let years = 0;
                for (const m of line.matchAll(rx(Y.re, 'gi'))) {
                    const count = Number(m[2]) || Y.words[m[2].toLowerCase()] || 0;
                    if (m[1] || m[3] || hit(line, Y.cue)) years = Math.max(years, count);
                }
                if (years) {
                    const have = duration(exp.months);
                    need('years:' + years, `${years}+ year${years === 1 ? '' : 's'} of experience`,
                        exp.months >= years * 12 && [{ t: `About ${have} across the professional roles listed on this site (internships, programmes and study not counted)`, href: '#experience' }],
                        `About ${have}, counting the professional roles listed on this site: ${listJoin(exp.counted.map(r => `${r.title} (${r.displayDates})`))}. ` +
                        `Not counted: ${listJoin(exp.skipped.map(r => r.title).concat('full-time study'))}. Ask Moses.`);
                }
            }

            RULES.gaps.forEach((g) => {
                if (!matches(line, g) || (g.cue && !hit(line, g.cue)) || hit(line, g.not)) return;
                need('gap:' + g.label, g.label, null, g.text.replace('{degrees}', degrees));
            });

            RULES.confirm.forEach((c) => {
                if (!hit(line, c.syn)) return;
                toConfirm = true;
                if (!seen[c.label]) confirm.push(seen[c.label] = c.label);
            });

            // Coverage: of the lines that ask for something, how many does
            // the site answer? A line with a hard gap is not answered, whatever
            // else it mentions; a line that only asks for something to
            // confirm (right to work, say) is not graded at all.
            if (toConfirm && !recognised) return;
            if (recognised || stemHit(line, RULES.requirementCues)) {
                asked++;
                if (covered && !missing) answered++;
            }
        });

        const hard = gaps.filter(g => g.hard);
        const areas = matched.length;
        const share = asked ? answered / asked : 0;
        const lines = `${answered} of ${plural(asked, 'requirement line')}`;
        let grade, cls, blurb;
        if (!areas && !met.length) {
            grade = 'Different field'; cls = 'marginal';
            blurb = 'Nothing here maps to the environmental, data or sustainability evidence on this site. Most likely a different field.';
        } else if (!hard.length && areas >= RULES.high.areas && share >= RULES.high.coverage) {
            grade = 'High-grade match'; cls = 'high';
            blurb = `${plural(areas, 'area')} of this ad map to delivered work on this site, answering ${lines}, with no hard gaps.`;
        } else if (hard.length <= RULES.workable.hardGaps && areas >= RULES.workable.areas && share >= RULES.workable.coverage) {
            grade = 'Workable match'; cls = 'workable';
            blurb = `${plural(areas, 'area')} map to delivered work, answering ${lines}` +
                (hard.length ? ', but one requirement is not evidenced here; it is listed first.' : '.');
        } else {
            grade = 'Marginal match'; cls = 'marginal';
            blurb = hard.length > 1
                ? `The work overlaps in ${plural(areas, 'area')}, but ${hard.length} hard requirements are not evidenced on this site. Read the gaps first.`
                : `The overlap is thin: ${plural(areas, 'area')}, answering ${lines}` +
                  (hard.length ? ', and one hard requirement is not evidenced here.' : '. Worth a conversation only if the rest can be learned on the job.');
        }
        if (confirm.length) blurb += ` Still to confirm: ${listJoin(confirm.map(c => c.toLowerCase()))}.`;

        return {
            status: 'graded', words, grade, cls, blurb, matched, met, confirm, hard,
            gaps: hard.concat(gaps.filter(g => !g.hard)),
            coverage: { answered, asked },
            experience: exp
        };
    }

    // For the tests, and for The Brief (Phase 4) to build on.
    window.mksAssay = { analyse, RULES, FACTS };

    // --- The page -------------------------------------------------------------
    const input = document.getElementById('assayInput');
    const runBtn = document.getElementById('assayRun');
    const clearBtn = document.getElementById('assayClear');
    const result = document.getElementById('assayResult');
    if (!input || !runBtn || !result) return;
    let lastAssayText = '';

    const row = (label, body, cls) => `<div class="assay-row${cls ? ' ' + cls : ''}"><div class="assay-req">${label}</div><div class="assay-ev">${body}</div></div>`;
    const block = (cls, heading, rows) => (rows.length
        ? `<div class="assay-map ${cls}"><div class="mono-label assay-map-h">${heading}</div>${rows.join('')}</div>` : '');
    const evidence = (list) => list.map(e => (e.href
        ? `<a href="${escHtml(e.href)}">${escHtml(e.t)}</a>`
        : `<span>${escHtml(e.t)}</span>`)).join('');

    const assay = () => {
        const a = analyse(input.value);
        result.hidden = false;
        if (a.status !== 'graded') {
            result.innerHTML = a.status === 'empty'
                ? '<p class="assay-empty">Paste a job description first. The requirements section is the part that matters.</p>'
                : `<p class="assay-empty">That is ${plural(a.words, 'word')}, too few to grade honestly. Paste the requirements section: ${RULES.minWords} words or more.</p>`;
            if (clearBtn) clearBtn.hidden = a.status === 'empty';
            return;
        }

        const found = a.met.concat(a.matched);
        const matchHtml = block('assay-matches', 'What you asked for → what backs it',
            found.map(m => row(escHtml(m.label), evidence(m.ev))));
        const gapHtml = block('assay-gaps', 'Gaps — what this site does not show', a.gaps.map(g => row(
            escHtml(g.label) + (g.hard ? '' : ' <span class="assay-soft">nice to have</span>'),
            `<span class="assay-miss">${escHtml(g.text)}</span>`, 'assay-row-gap')));
        let html = `<div class="assay-grade assay-grade-${a.cls}"><span class="assay-grade-tag">${a.grade}</span><p>${escHtml(a.blurb)}</p></div>`;
        // Hard gaps explain a capped grade, so they come before the matches
        // that would otherwise bury them. With none, the matches lead.
        html += a.hard.length ? gapHtml + matchHtml : matchHtml + gapHtml;
        html += block('assay-confirm', 'Confirm with Moses — not stated on this site',
            a.confirm.map(c => row(escHtml(c), '<span class="assay-ask">Not stated on this site. Confirm with Moses.</span>', 'assay-row-gap')));

        if (a.cls === 'high' || a.cls === 'workable') {
            const subject = encodeURIComponent(`Fit for your role — ${found.length} matching areas`);
            const body = encodeURIComponent(`Hi Moses,\n\nI ran your in-browser fit-check against a role and it flagged ${found.length} matching areas${a.gaps.length ? ` (and ${plural(a.gaps.length, 'gap')})` : ''}. I'd like to talk.\n\n`);
            html += `<div class="assay-cta-wrap"><a class="btn btn-primary btn-small" href="mailto:moseskollehsesay@gmail.com?subject=${subject}&body=${body}" data-analytics="assay-contact"><svg class="icon" aria-hidden="true"><use href="#i-paper-plane"></use></svg> This looks like a fit — get in touch</a></div>`;
        }
        // Plain-text version a recruiter can copy into notes or an email.
        let plain = `Moses Kolleh Sesay — fit assessment: ${a.grade}\n${a.blurb}\n`;
        if (a.gaps.length) plain += '\nGaps (not shown on the site):\n' + a.gaps.map(g => `• ${g.label}${g.hard ? '' : ' (nice to have)'}: ${g.text}\n`).join('');
        if (found.length) plain += '\nWhat backs the rest:\n' + found.map(t => `• ${t.label}\n` + t.ev.map(e => `   - ${e.t}\n`).join('')).join('');
        if (a.confirm.length) plain += '\nConfirm with Moses (not stated on the site):\n' + a.confirm.map(c => `• ${c}\n`).join('');
        lastAssayText = plain + `\n— ${window.mksShare ? window.mksShare.site : 'moseskolleh.github.io/sustaintheworld'}`;
        html += `<div class="assay-copy-wrap"><button type="button" class="btn btn-secondary btn-small assay-copy" data-analytics="assay-copy"><svg class="icon" aria-hidden="true"><use href="#i-copy"></use></svg> Copy this result</button></div>`;
        html += '<p class="assay-note">Deterministic matching against a hand-written evidence set and the facts on this site: no AI, no data sent anywhere. Anything the site does not show is a gap, not a guess. A starting point for a conversation, not a verdict.</p>';
        result.innerHTML = html;
        if (clearBtn) clearBtn.hidden = false;
        if (typeof window.trackEvent === 'function') window.trackEvent('assay-' + a.cls);
    };

    runBtn.addEventListener('click', assay);
    result.addEventListener('click', (e) => {
        const b = e.target.closest('.assay-copy');
        if (b && window.mksShare) window.mksShare.copy(lastAssayText, b);
    });
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            result.hidden = true;
            result.innerHTML = '';
            clearBtn.hidden = true;
            input.focus();
        });
    }

    // Instant demo: sample roles inject a realistic JD and grade it.
    const SAMPLES = {
        esg: 'ESG Analyst — support CSRD and ESRS reporting, build our GHG inventory across Scope 1, 2 and 3, run sustainability data analysis, and engage stakeholders across the business. Familiarity with GRI, TCFD and SBTi a plus.',
        climate: 'Climate Risk Consultant — assess physical and transition climate risk, build resilience and adaptation plans, analyse hazard and vulnerability data, and facilitate stakeholder workshops. GIS and scenario analysis welcome.',
        water: 'WASH Programme Officer — manage borehole drilling and groundwater projects, run hydrogeology surveys, produce GIS maps, and coordinate community water delivery in developing countries.'
    };
    document.querySelectorAll('.assay-sample').forEach(b => {
        b.addEventListener('click', () => {
            input.value = SAMPLES[b.getAttribute('data-sample')] || '';
            assay();
            result.scrollIntoView({ behavior: window.mksScrollMotion(), block: 'nearest' });
        });
    });
})();


// ===================================
// ANATOMY OF A PROMPT — one answer, split into Scope 2 / Scope 3 / water,
// each mapped to its ESRS disclosure line. Hand-drawn SVG flow, no library.
// ===================================
(() => {
    const svg = document.getElementById('anatomySvg');
    const sel = document.getElementById('anatomyModel');
    const summary = document.getElementById('anatomySummary');
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!svg || !sel || !DATA) return;

    const NS = 'http://www.w3.org/2000/svg';
    const mk = (name, attrs) => {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    };

    const gridSel = document.getElementById('anatomyGrid');
    const TOKENS = 1000;                              // everyday-chat workload
    const PUE = DATA.PUE;
    const WUE = DATA.WUE_PROFILES.avg.wue_L_per_kWh;
    // Embodied hardware carbon belongs on Scope 3 (capital goods), so the line
    // stays on the diagram, but without a number: the 0.05 gCO2e/Wh once typed
    // here had no source, and the full coach excludes embodied carbon. A sourced
    // factor in ai-carbon-data.js would bring it back on both pages at once.
    const EMBODIED_NOTE = 'not quantified';
    const ANSWERS_PER_YEAR = 20 * 220;               // 20 prompts/day × 220 working days
    let scale = 'answer';

    DATA.HOMEPAGE_MODELS.forEach(k => sel.add(new Option(DATA.MODELS[k].label, k)));
    sel.value = DATA.MODELS['gpt-4o'] ? 'gpt-4o' : DATA.HOMEPAGE_MODELS[0];
    if (gridSel) {
        DATA.HOMEPAGE_REGIONS.forEach(k => gridSel.add(new Option(`${DATA.REGIONS[k].label} — ${DATA.REGIONS[k].intensity} gCO₂e/kWh`, k)));
        gridSel.value = 'nl';
    }
    const gridNow = () => (gridSel && DATA.REGIONS[gridSel.value]) || DATA.REGIONS['nl'];

    const compute = (key, grid) => {
        // Split the workload at the reference mix the per-1k benchmarks are
        // calibrated against, so this widget and the full tool agree on what
        // "1000 tokens" costs even though the tool lets you change the split.
        const mix = DATA.TOKEN_ENERGY.referenceMix;
        const infWh = DATA.energyForQuery(DATA.MODELS[key], TOKENS * mix.input, TOKENS * mix.output);
        const wh = infWh * PUE;                                                // facility energy (grid + cooling overhead)
        const kwh = wh / 1000;
        return { scope2: kwh * grid.intensity, water: kwh * WUE * 1000 };
    };
    // With Scope 2 the only carbon term, its ribbon is scaled against the
    // dirtiest grid on offer, so switching grids still visibly moves it.
    const worstIntensity = Math.max(...DATA.HOMEPAGE_REGIONS.map(k => DATA.REGIONS[k].intensity));
    const fmt = (n) => (n === 0 ? '0' : n >= 1 ? n.toFixed(2) : n >= 0.001 ? n.toFixed(3) : '<0.001');

    const cy = 160, sx = 180, tx = 430, rows = [70, 160, 250];
    const ribbon = (x1, y1, x2, y2, w) => {
        const mx = (x1 + x2) / 2, t = w / 2;
        return `M ${x1} ${y1 - t} C ${mx} ${y1 - t}, ${mx} ${y2 - t}, ${x2} ${y2 - t} L ${x2} ${y2 + t} C ${mx} ${y2 + t}, ${mx} ${y1 + t}, ${x1} ${y1 + t} Z`;
    };

    const cards = [
        { t: 'Grid electricity · Scope 2', esrs: 'ESRS E1-6 · Scope 2 emissions', cls: 'r0' },
        { t: 'Embodied hardware · Scope 3', esrs: 'ESRS E1-6 · Scope 3 (capital goods)', cls: 'r1' },
        { t: 'Cooling water', esrs: 'ESRS E3-4 · Water consumption', cls: 'r2' }
    ];

    // static build
    svg.appendChild(mk('rect', { x: 20, y: cy - 38, width: 160, height: 76, rx: 10, class: 'anatomy-source' }));
    const st = mk('text', { x: 100, y: cy - 4, 'text-anchor': 'middle', class: 'anatomy-source-t' }); st.textContent = 'One AI answer'; svg.appendChild(st);
    const ss = mk('text', { x: 100, y: cy + 15, 'text-anchor': 'middle', class: 'anatomy-source-sub' }); ss.textContent = '~1,000 tokens'; svg.appendChild(ss);
    const ribbons = rows.map((ry, i) => { const p = mk('path', { class: 'anatomy-ribbon ' + cards[i].cls }); svg.appendChild(p); return p; });
    const vals = rows.map((ry, i) => {
        const title = mk('text', { x: tx + 10, y: ry - 14, class: 'anatomy-t-title ' + cards[i].cls }); title.textContent = cards[i].t; svg.appendChild(title);
        const val = mk('text', { x: tx + 10, y: ry + 8, class: 'anatomy-t-val' }); svg.appendChild(val);
        const esrs = mk('text', { x: tx + 10, y: ry + 28, class: 'anatomy-t-esrs' }); esrs.textContent = cards[i].esrs; svg.appendChild(esrs);
        return val;
    });

    const update = () => {
        const grid = gridNow();
        const d = compute(sel.value, grid);
        // Scope 3 keeps a hairline: the flow exists, its size is not claimed.
        const widths = [8 + (grid.intensity / worstIntensity) * 40, 2, 26];
        rows.forEach((ry, i) => ribbons[i].setAttribute('d', ribbon(sx, cy, tx, ry, widths[i])));
        const yr = scale === 'year';
        const m = yr ? ANSWERS_PER_YEAR : 1;
        const cDiv = yr ? 1000 : 1;                   // g -> kg, mL -> L
        const cu = yr ? 'kg' : 'g', wu = yr ? 'L' : 'mL';
        vals[0].textContent = `${fmt(d.scope2 * m / cDiv)} ${cu} CO₂e`;
        vals[1].textContent = EMBODIED_NOTE;
        vals[2].textContent = `${fmt(d.water * m / cDiv)} ${wu} water`;
        if (summary) {
            const basis = yr ? `at ~${ANSWERS_PER_YEAR.toLocaleString()} answers/analyst-year (20/day × 220 days)` : 'one everyday answer';
            summary.innerHTML = `<strong>${DATA.MODELS[sel.value].label}</strong>, ${basis} on the <strong>${grid.label}</strong> grid: <strong>${fmt(d.scope2 * m / cDiv)} ${cu}</strong> Scope 2 and <strong>${fmt(d.water * m / cDiv)} ${wu}</strong> cooling water — two ESRS lines quantified. Scope 3 embodied hardware is a third line, named but ${EMBODIED_NOTE}.`;
        }
    };

    update();
    // A status from here on; the first fill happens before anyone is looking.
    if (summary) { summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite'); }
    sel.addEventListener('change', update);
    if (gridSel) gridSel.addEventListener('change', update);
    const copyBtn = document.getElementById('anatomyCopy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
        const txt = (summary ? summary.textContent : '') + `\n— Moses Kolleh Sesay · ${window.mksShare ? window.mksShare.site : ''}`;
        if (window.mksShare) window.mksShare.copy(txt, copyBtn);
    });
    document.querySelectorAll('.anatomy-scale-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            scale = btn.getAttribute('data-scale');
            document.querySelectorAll('.anatomy-scale-btn').forEach(b => {
                const on = b === btn;
                b.classList.toggle('is-active', on);
                b.setAttribute('aria-pressed', String(on));
            });
            update();
        });
    });
})();


// ===================================
// YOU DRAW IT — predict AI's hidden energy curve, then reveal the truth
// The NYT "you draw it" mechanic, powered by the shared AI carbon data.
// ===================================
(() => {
    const svg = document.getElementById('ydiSvg');
    const revealBtn = document.getElementById('ydiReveal');
    const resetBtn = document.getElementById('ydiReset');
    const verdictEl = document.getElementById('ydiVerdict');
    const hintEl = document.getElementById('ydiHint');
    const tableEl = document.getElementById('ydiTable');
    const shareBtn = document.getElementById('ydiShare');
    const cardCanvas = document.getElementById('ydiCardCanvas');
    const legendEl = document.getElementById('ydiLegend');
    const DATA = (typeof window !== 'undefined') ? window.AICarbonData : null;
    if (!svg || !revealBtn || !DATA) return;
    let cardData = null;

    const NS = 'http://www.w3.org/2000/svg';
    const mk = (name, attrs) => {
        const e = document.createElementNS(NS, name);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    };

    const KEYS = ['llama-32-1b', 'gpt-4-1-nano', 'gpt-4o-mini', 'gemini-15-flash', 'gemini-20-flash', 'llama-33-70b', 'claude-37-sonnet', 'gpt-4o', 'gemini-15-pro', 'deepseek-r1'];
    const SHORT = { 'llama-32-1b': '1B', 'gpt-4-1-nano': 'nano', 'gpt-4o-mini': '4o-mini', 'gemini-15-flash': '1.5 Flash', 'gemini-20-flash': '2.0 Flash', 'llama-33-70b': '70B', 'claude-37-sonnet': 'Sonnet', 'gpt-4o': 'GPT-4o', 'gemini-15-pro': '1.5 Pro', 'deepseek-r1': 'R1' };
    const models = KEYS.filter(k => DATA.MODELS[k]).map(k => ({ key: k, label: DATA.MODELS[k].label, short: SHORT[k] || DATA.MODELS[k].label, wh: DATA.MODELS[k].energyPer1kTokens_Wh }));
    const n = models.length;
    if (n < 5) return;
    const KNOWN = 3;

    const W = 640, H = 380;
    const M = { l: 58, r: 18, t: 26, b: 86 };
    const plotW = W - M.l - M.r, plotH = H - M.t - M.b;
    const yMax = 1.6;
    const xAt = (i) => M.l + (i / (n - 1)) * plotW;
    const yAt = (wh) => M.t + (1 - Math.min(wh, yMax) / yMax) * plotH;
    const whAtY = (y) => Math.max(0, Math.min(yMax, (1 - (y - M.t) / plotH) * yMax));

    const guess = models.map((m, i) => (i < KNOWN ? m.wh : models[KNOWN - 1].wh));
    let revealed = false;
    let interacted = false;

    // --- static layer: gridlines + y labels ---
    [0, 0.5, 1.0, 1.5].forEach(v => {
        const y = yAt(v);
        svg.appendChild(mk('line', { x1: M.l, y1: y, x2: W - M.r, y2: y, class: 'ydi-grid' }));
        const t = mk('text', { x: M.l - 10, y: y + 4, class: 'ydi-axis-label', 'text-anchor': 'end' });
        t.textContent = v.toFixed(1);
        svg.appendChild(t);
    });
    const yTitle = mk('text', { x: M.l - 46, y: M.t - 10, class: 'ydi-axis-title', 'text-anchor': 'start' });
    yTitle.textContent = 'Wh / answer';
    svg.appendChild(yTitle);

    // x labels
    models.forEach((m, i) => {
        const x = xAt(i);
        const t = mk('text', { x: x, y: H - M.b + 20, class: 'ydi-xlabel' + (i < KNOWN ? ' known' : ''), 'text-anchor': 'end', transform: `rotate(-40 ${x} ${H - M.b + 20})` });
        t.textContent = m.short;
        svg.appendChild(t);
    });

    // divider + region labels
    const dividerX = (xAt(KNOWN - 1) + xAt(KNOWN)) / 2;
    svg.appendChild(mk('line', { x1: dividerX, y1: M.t, x2: dividerX, y2: M.t + plotH, class: 'ydi-divider' }));
    const pLabel = mk('text', { x: xAt(n - 1), y: M.t - 10, class: 'ydi-region-label predict', 'text-anchor': 'end' });
    pLabel.textContent = 'you predict →';
    svg.appendChild(pLabel);

    // known line + dots
    const knownPts = models.slice(0, KNOWN).map((m, i) => `${xAt(i)},${yAt(m.wh)}`).join(' ');
    svg.appendChild(mk('polyline', { points: knownPts, class: 'ydi-known-line' }));
    models.slice(0, KNOWN).forEach((m, i) => svg.appendChild(mk('circle', { cx: xAt(i), cy: yAt(m.wh), r: 4, class: 'ydi-known-dot' })));

    // the illustrative straight-line guess + the measured line (both revealed later)
    const intuitLine = mk('polyline', { points: '', class: 'ydi-intuit-line' });
    svg.appendChild(intuitLine);
    const realLine = mk('polyline', { points: '', class: 'ydi-real-line' });
    svg.appendChild(realLine);
    const realDots = [];

    // guess line + draggable dots
    const guessLine = mk('polyline', { points: '', class: 'ydi-guess-line' });
    svg.appendChild(guessLine);
    const guessDots = models.map((m, i) => {
        if (i < KNOWN) return null;
        const c = mk('circle', { cx: xAt(i), cy: yAt(guess[i]), r: 5, class: 'ydi-guess-dot' });
        svg.appendChild(c);
        return c;
    });

    const drawGuess = () => {
        const pts = [`${xAt(KNOWN - 1)},${yAt(models[KNOWN - 1].wh)}`];
        for (let i = KNOWN; i < n; i++) pts.push(`${xAt(i)},${yAt(guess[i])}`);
        guessLine.setAttribute('points', pts.join(' '));
        for (let i = KNOWN; i < n; i++) guessDots[i].setAttribute('cy', yAt(guess[i]));
    };
    drawGuess();
    // Pulse the first predict dot so people know the curve is grabbable.
    if (guessDots[KNOWN]) guessDots[KNOWN].classList.add('ydi-dot-pulse');
    // Device-aware hint: touch users tap or drag; pointer users drag.
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (hintEl && coarse) hintEl.textContent = 'tap or drag across to draw';

    // --- interaction (pointer + keyboard) ---
    let cursor = KNOWN;
    const cursorRing = mk('circle', { class: 'ydi-cursor', r: 9, cx: xAt(cursor), cy: yAt(guess[cursor]) });
    svg.appendChild(cursorRing);
    const hit = mk('rect', { x: M.l, y: M.t, width: plotW, height: plotH, class: 'ydi-hit', fill: 'transparent' });
    hit.setAttribute('tabindex', '0');
    hit.setAttribute('role', 'application');
    hit.setAttribute('aria-label', 'Draw your prediction: left/right arrows move between models, up/down arrows raise or lower the guessed energy, Enter reveals the real curve. The Reveal button and the data table below are equivalent.');
    svg.appendChild(hit);

    const markInteracted = () => {
        if (interacted) return;
        interacted = true;
        if (hintEl) hintEl.style.opacity = '0';
        if (guessDots[KNOWN]) guessDots[KNOWN].classList.remove('ydi-dot-pulse');
    };
    const toLocal = (evt) => {
        const rect = svg.getBoundingClientRect();
        return { x: (evt.clientX - rect.left) / rect.width * W, y: (evt.clientY - rect.top) / rect.height * H };
    };
    const paint = (p) => {
        if (revealed) return;
        let i = Math.round((p.x - M.l) / plotW * (n - 1));
        i = Math.max(KNOWN, Math.min(n - 1, i));
        guess[i] = whAtY(p.y);
        cursor = i;
        drawGuess();
        markInteracted();
    };
    let dragging = false;
    hit.addEventListener('pointerdown', (e) => {
        dragging = true;
        if (hit.setPointerCapture) { try { hit.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
        paint(toLocal(e));
        e.preventDefault();
    });
    hit.addEventListener('pointermove', (e) => { if (dragging) { paint(toLocal(e)); e.preventDefault(); } });
    window.addEventListener('pointerup', () => { dragging = false; });
    window.addEventListener('pointercancel', () => { dragging = false; });

    const moveCursor = () => {
        cursorRing.setAttribute('cx', xAt(cursor));
        cursorRing.setAttribute('cy', yAt(guess[cursor]));
        hit.setAttribute('aria-valuetext', `${models[cursor].short}: your guess ${guess[cursor].toFixed(2)} Wh per answer`);
    };
    hit.addEventListener('focus', () => { svg.classList.add('ydi-kbd'); moveCursor(); });
    hit.addEventListener('blur', () => { svg.classList.remove('ydi-kbd'); });
    hit.addEventListener('keydown', (e) => {
        if (revealed) return;
        const step = yMax / 24;
        const k = e.key;
        if (k === 'ArrowLeft') cursor = Math.max(KNOWN, cursor - 1);
        else if (k === 'ArrowRight') cursor = Math.min(n - 1, cursor + 1);
        else if (k === 'ArrowUp') guess[cursor] = Math.min(yMax, guess[cursor] + step);
        else if (k === 'ArrowDown') guess[cursor] = Math.max(0, guess[cursor] - step);
        else if (k === 'Enter' || k === ' ') { doReveal(); e.preventDefault(); return; }
        else return;
        e.preventDefault();
        markInteracted();
        drawGuess();
        moveCursor();
    });

    // --- reveal ---
    const nudge = () => {
        if (hintEl) {
            hintEl.style.opacity = '';
            hintEl.classList.add('ydi-hint-nudge');
            setTimeout(() => hintEl.classList.remove('ydi-hint-nudge'), 1200);
        }
        if (guessDots[KNOWN]) guessDots[KNOWN].classList.add('ydi-dot-pulse');
    };

    const doReveal = () => {
        if (revealed) return;
        if (!interacted) { nudge(); return; }   // draw first — don't grade a guess never made
        revealed = true;
        const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        realLine.setAttribute('points', models.map((m, i) => `${xAt(i)},${yAt(m.wh)}`).join(' '));
        svg.classList.add('revealed');
        // Draw the measured line in, left to right.
        if (!reduce && realLine.getTotalLength) {
            const len = realLine.getTotalLength();
            realLine.style.strokeDasharray = String(len);
            realLine.style.strokeDashoffset = String(len);
            realLine.getBoundingClientRect(); // force reflow before transitioning
            realLine.style.transition = 'stroke-dashoffset 0.85s ease';
            realLine.style.strokeDashoffset = '0';
        }
        models.forEach((m, i) => {
            const c = mk('circle', { cx: xAt(i), cy: yAt(m.wh), r: 4, class: 'ydi-real-dot' });
            svg.appendChild(c);
            realDots.push(c);
        });
        if (hintEl) hintEl.style.opacity = '0';
        if (resetBtn) resetBtn.hidden = false;
        revealBtn.hidden = true;

        const gWh = Math.max(guess[n - 1], 0);
        const rWh = models[n - 1].wh;
        const tiny = models[0].wh;
        const factorFrontier = Math.round(rWh / tiny);
        let msg;
        if (gWh < 0.02) {
            msg = `You put the biggest model near zero — it's actually ${rWh.toFixed(2)} Wh, a dramatic underestimate of the frontier.`;
        } else if (rWh / gWh >= 1.3) {
            msg = `You put the biggest model at ~${gWh.toFixed(2)} Wh. It's actually ${rWh.toFixed(2)} Wh — you underestimated the frontier by ${(rWh / gWh).toFixed(1)}×.`;
        } else if (gWh / rWh >= 1.3) {
            msg = `You had the frontier at ~${gWh.toFixed(2)} Wh; it's actually ${rWh.toFixed(2)} Wh — an overestimate of ${(gWh / rWh).toFixed(1)}×.`;
        } else {
            msg = `Close — you had the frontier near ${gWh.toFixed(2)} Wh; it's ${rWh.toFixed(2)} Wh.`;
        }
        msg += ` A 1B model answers for ${tiny.toFixed(3)} Wh — the frontier reasoning model burns roughly ${factorFrontier}× more for the same 1,000-token answer. That gap is exactly what the tools people prompt with never show them.`;
        // Shape grade: did they capture the frontier spike, not just a magnitude?
        let guessPeak = KNOWN;
        for (let i = KNOWN + 1; i < n; i++) if (guess[i] > guess[guessPeak]) guessPeak = i;
        const spread = guess[n - 1] - guess[KNOWN];
        let shape;
        if (guessPeak === n - 1 && rWh / Math.max(gWh, 0.001) < 1.6) shape = 'You nailed the shape — you saw the frontier spike.';
        else if (guessPeak === n - 1) shape = 'You saw the spike, but under-scaled how steep it gets.';
        else if (spread < 0.1) shape = 'You drew it nearly flat — the real curve hides a cliff at the frontier.';
        else shape = 'You underestimated the frontier — the reasoning model is the outlier.';
        if (verdictEl) { verdictEl.innerHTML = `<span class="ydi-shape">${shape}</span> ${msg}`; verdictEl.hidden = false; }
        cardData = { shape: shape, factor: factorFrontier };
        // Third line: a straight-line guess that misses the reasoning spike —
        // drawn, not measured, so the legend and the data table say illustrative.
        const intuitEnd = 0.55;
        intuitLine.setAttribute('points', models.map((m, i) => `${xAt(i)},${yAt(tiny + (i / (n - 1)) * (intuitEnd - tiny))}`).join(' '));
        // Callout on the frontier spike.
        const callout = mk('text', { x: xAt(n - 1) - 8, y: yAt(rWh) - 12, class: 'ydi-callout', 'text-anchor': 'end' });
        callout.textContent = `R1 · ~${factorFrontier}× a 1B model`;
        svg.appendChild(callout);
        realDots.push(callout);
        if (legendEl) legendEl.hidden = false;
        if (shareBtn) shareBtn.hidden = false;
    };
    revealBtn.addEventListener('click', doReveal);

    // Shareable result card (dark, on-brand) — reuses the canvas-PNG pattern.
    const wrapText = (ctx, text, maxWidth) => {
        const words = text.split(' ');
        const out = [];
        let line = '';
        words.forEach(w => {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > maxWidth && line) { out.push(line); line = w; }
            else line = test;
        });
        if (line) out.push(line);
        return out;
    };
    const drawCard = () => {
        if (!cardCanvas || !cardCanvas.getContext || !cardData) return;
        const scale = 2, W = 460, padX = 32, cw = W - padX * 2;
        let ctx = cardCanvas.getContext('2d');
        if (!ctx) return;
        ctx.font = "600 19px 'Space Grotesk', system-ui, sans-serif";
        const shapeLines = wrapText(ctx, cardData.shape, cw);
        ctx.font = "400 16px 'Inter', system-ui, sans-serif";
        const factorText = `The frontier reasoning model burns about ${cardData.factor}× more energy per answer than a 1-billion-parameter model.`;
        const factorLines = wrapText(ctx, factorText, cw);
        const headerH = 78;
        const H = headerH + 26 + shapeLines.length * 26 + 14 + factorLines.length * 23 + 66;
        cardCanvas.width = W * scale; cardCanvas.height = H * scale;
        ctx = cardCanvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#0b1705'; ctx.fillRect(0, 0, W, H);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#7CFC00'; ctx.font = "700 24px 'Space Grotesk', system-ui, sans-serif";
        ctx.fillText("AI's Hidden Curve", padX, 40);
        ctx.fillStyle = '#9fdf7a'; ctx.font = "400 13px 'IBM Plex Mono', monospace";
        ctx.fillText('I guessed what one AI answer really costs', padX, 62);
        let y = headerH + 22;
        ctx.fillStyle = '#eaffe0'; ctx.font = "600 19px 'Space Grotesk', system-ui, sans-serif";
        shapeLines.forEach(l => { ctx.fillText(l, padX, y); y += 26; });
        y += 12;
        ctx.fillStyle = '#cfe8c0'; ctx.font = "400 16px 'Inter', system-ui, sans-serif";
        factorLines.forEach(l => { ctx.fillText(l, padX, y); y += 23; });
        y += 24;
        ctx.fillStyle = '#7CFC00'; ctx.font = "600 15px 'Space Grotesk', system-ui, sans-serif";
        ctx.fillText('Moses Kolleh Sesay', padX, y);
        ctx.fillStyle = '#88a878'; ctx.font = "400 12px 'IBM Plex Mono', monospace";
        ctx.fillText(window.mksShare ? window.mksShare.site : 'moseskolleh.github.io/sustaintheworld', padX, y + 18);
    };
    if (shareBtn && cardCanvas) {
        shareBtn.addEventListener('click', () => {
            drawCard();
            const text = `${cardData ? cardData.shape : ''} I tried to guess what one AI answer costs. ${window.mksShare ? window.mksShare.site : ''}`;
            if (window.mksShare) window.mksShare.image(cardCanvas, 'ai-hidden-curve.png', text);
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            revealed = false;
            svg.classList.remove('revealed');
            realLine.setAttribute('points', '');
            realLine.style.strokeDasharray = '';
            realLine.style.strokeDashoffset = '';
            realLine.style.transition = '';
            intuitLine.setAttribute('points', '');
            if (legendEl) legendEl.hidden = true;
            realDots.forEach(d => d.remove());
            realDots.length = 0;
            for (let i = KNOWN; i < n; i++) guess[i] = models[KNOWN - 1].wh;
            drawGuess();
            if (verdictEl) { verdictEl.hidden = true; verdictEl.textContent = ''; }
            resetBtn.hidden = true;
            revealBtn.hidden = false;
            if (shareBtn) shareBtn.hidden = true;
            interacted = false;
            if (hintEl) hintEl.style.opacity = '';
            if (guessDots[KNOWN]) guessDots[KNOWN].classList.add('ydi-dot-pulse');
        });
    }

    // --- accessible, non-visual data table ---
    if (tableEl) {
        const rows = models.map(m => `<tr><td>${m.label}</td><td>${m.wh} Wh</td></tr>`).join('');
        tableEl.innerHTML = `<table><caption>Measured energy per 1,000-token answer by model (order-of-magnitude estimates). The chart's straight-line guess is illustrative — not a measured figure — so it is not listed here.</caption><thead><tr><th>Model</th><th>Wh per answer</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
})();


// ===================================
// THE RECEIPT — this page prints its own itemised carbon bill
// Reads the same Resource Timing data as the footer badge, groups it by asset
// class, and renders a thermal-receipt you can save as a PNG. Pure vanilla:
// the PNG is drawn on a <canvas>, no library, no gigabyte of anything.
// ===================================
(() => {
    const btn = document.getElementById('receiptBtn');
    const panel = document.getElementById('receiptPanel');
    const body = document.getElementById('receiptBody');
    const dlBtn = document.getElementById('receiptDownload');
    const canvas = document.getElementById('receiptCanvas');
    if (!btn || !panel || !body) return;

    // The footer badge (script.js) defines what a byte weighs and how a
    // resource is measured; the receipt uses the same definitions rather than
    // carrying a copy that could drift.
    const carbon = window.mksCarbon;
    if (!carbon) return;
    const G_CO2_PER_MB = carbon.gramsPerMB;
    const MEDIAN_MB = carbon.medianPageMB;
    const bytesOf = carbon.bytesOf;
    const pageOrigin = location.origin;
    const urlText = (location.hostname + location.pathname).replace(/\/+$/, '') || 'moseskolleh.github.io/sustaintheworld';
    let lastReceiptG = 0;

    const classify = (r) => {
        const t = r.initiatorType;
        const n = (r.name || '').toLowerCase();
        if (/\.(woff2?|ttf|otf|eot)(\?|$)/.test(n)) return 'Fonts';
        if (t === 'img' || /\.(webp|png|jpe?g|gif|svg|avif)(\?|$)/.test(n)) return 'Images';
        if (t === 'script' || /\.js(\?|$)/.test(n)) return 'Scripts';
        if (t === 'link' || t === 'css' || /\.css(\?|$)/.test(n)) return 'Styles';
        return 'Other';
    };

    const ORDER = ['HTML', 'Styles', 'Scripts', 'Fonts', 'Images', 'Other'];

    const gather = () => {
        const g = { HTML: 0, Styles: 0, Scripts: 0, Fonts: 0, Images: 0, Other: 0 };
        let unmeasured = 0;
        try {
            const nav = performance.getEntriesByType('navigation')[0];
            if (nav) g.HTML += bytesOf(nav);
            performance.getEntriesByType('resource').forEach(r => {
                const b = bytesOf(r);
                if (b === 0) {
                    if (r.name && r.name.indexOf(pageOrigin) !== 0) unmeasured++;
                    return;
                }
                g[classify(r)] += b;
            });
        } catch (e) { /* older browsers: receipt stays empty */ }
        return { g, unmeasured };
    };

    const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB');
    const fmtG = (grams) => (grams >= 1 ? grams.toFixed(2) : grams.toFixed(3)) + ' g';

    const buildLines = () => {
        const { g, unmeasured } = gather();
        let total = 0;
        ORDER.forEach(k => { total += g[k]; });
        const totalMb = total / 1048576;
        const totalG = totalMb * G_CO2_PER_MB;
        lastReceiptG = totalG;
        const dt = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}  ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;

        const lines = [];
        lines.push({ t: 'c', s: 'MKS · SUSTAINTHEWORLD', b: true });
        lines.push({ t: 'c', s: 'page-load carbon receipt' });
        lines.push({ t: 'c', s: stamp, dim: true });
        lines.push({ t: 'd' });
        ORDER.forEach(k => {
            if (g[k] > 0) {
                const grams = (g[k] / 1048576) * G_CO2_PER_MB;
                lines.push({ t: 'r', l: k, r: `${fmtSize(g[k])}   ${fmtG(grams)}` });
            }
        });
        lines.push({ t: 'd' });
        lines.push({ t: 'r', l: 'TOTAL', r: `${fmtSize(total)}   ${fmtG(totalG)}`, b: true });
        lines.push({ t: 'c', s: 'CO₂e · global avg grid', dim: true });
        lines.push({ t: 'd' });
        lines.push({ t: 'r', l: 'Median web page', r: `${MEDIAN_MB.toFixed(2)} MB` });
        if (totalMb < MEDIAN_MB) {
            lines.push({ t: 'c', s: `— you're ${Math.round((1 - totalMb / MEDIAN_MB) * 100)}% lighter —` });
        }
        lines.push({ t: 'r', l: 'Text-only report', r: '9 KB' });
        if (unmeasured) {
            lines.push({ t: 'c', s: `* ${unmeasured} third-party file${unmeasured > 1 ? 's' : ''} not counted`, dim: true });
        }
        lines.push({ t: 'd' });
        lines.push({ t: 'c', s: 'browsed lightly — say hello' });
        lines.push({ t: 'd' });
        lines.push({ t: 'c', s: 'MOSES KOLLEH SESAY', b: true });
        lines.push({ t: 'c', s: urlText, dim: true });
        lines.push({ t: 'c', s: 'climate · ESG · sustainable AI' });
        lines.push({ t: 'c', s: '||‖|‖||‖|||‖|‖||‖|||', mono: true });
        return lines;
    };

    const renderDOM = (lines) => {
        body.innerHTML = '';
        lines.forEach(ln => {
            let el;
            if (ln.t === 'd') {
                el = document.createElement('div');
                el.className = 'receipt-divider';
            } else if (ln.t === 'c') {
                el = document.createElement('div');
                el.className = 'receipt-center' + (ln.b ? ' receipt-strong' : '') + (ln.dim ? ' receipt-dim' : '') + (ln.mono ? ' receipt-barcode' : '');
                el.textContent = ln.s;
            } else {
                el = document.createElement('div');
                el.className = 'receipt-row' + (ln.b ? ' receipt-strong' : '');
                const l = document.createElement('span'); l.textContent = ln.l;
                const r = document.createElement('span'); r.textContent = ln.r;
                el.appendChild(l); el.appendChild(r);
            }
            body.appendChild(el);
        });
    };

    const drawCanvas = (lines) => {
        if (!canvas || !canvas.getContext) return;
        const scale = 2, W = 340, padX = 22, padY = 22, lh = 22;
        const H = padY * 2 + lines.length * lh;
        canvas.width = W * scale;
        canvas.height = H * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(scale, scale);
        ctx.fillStyle = '#f5f3ea';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'middle';
        let y = padY + lh / 2;
        lines.forEach(ln => {
            ctx.fillStyle = ln.dim ? '#6b665a' : '#1a1a1a';
            ctx.font = `${ln.b ? '700' : '400'} 13px 'IBM Plex Mono', ui-monospace, monospace`;
            if (ln.t === 'd') {
                ctx.strokeStyle = '#b7b1a1';
                ctx.setLineDash([2, 3]);
                ctx.beginPath(); ctx.moveTo(padX, y); ctx.lineTo(W - padX, y); ctx.stroke();
                ctx.setLineDash([]);
            } else if (ln.t === 'c') {
                ctx.textAlign = 'center';
                ctx.fillText(ln.s, W / 2, y);
            } else {
                ctx.textAlign = 'left';
                ctx.fillText(ln.l, padX, y);
                ctx.textAlign = 'right';
                ctx.fillText(ln.r, W - padX, y);
            }
            y += lh;
        });
    };

    let built = false;
    const build = () => {
        const lines = buildLines();
        renderDOM(lines);
        drawCanvas(lines);
        built = true;
    };

    btn.addEventListener('click', () => {
        const open = panel.hasAttribute('hidden');
        if (open) build();
        panel.toggleAttribute('hidden', !open);
        btn.setAttribute('aria-expanded', String(open));
        if (open) panel.scrollIntoView({ behavior: window.mksScrollMotion(), block: 'nearest' });
    });

    if (dlBtn && canvas) {
        dlBtn.addEventListener('click', () => {
            if (!built) build();
            const fn = 'carbon-receipt-' + lastReceiptG.toFixed(3).replace('.', '_') + 'g.png';
            if (!window.mksShare) return;
            const msg = `This whole climate portfolio cost ${lastReceiptG.toFixed(2)} g CO₂e to view — ${window.mksShare.site}`;
            window.mksShare.image(canvas, fn, msg);
        });
    }
})();

// Tells the loader in script.js that this module is in place.
(window.mksLoaded = window.mksLoaded || {}).interactives = true;
