// ===================================================================
// INTERACTIVES — the homepage widgets that respond to the visitor
// ===================================================================
// The "AI, Weighed" widget, the share helpers, The Assay, Anatomy of a
// Prompt, You Draw It and The Receipt: about 50 KB of JavaScript that only
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
    const PRESET_TOKENS = { short: 400, chat: 1000, doc: 5000, reasoning: 9000 };
    const PUE = DATA.PUE;                              // data-centre overhead
    const WUE = DATA.WUE_PROFILES.avg.wue_L_per_kWh;   // L per kWh, typical cooling

    MODELS.forEach((m, i) => modelSel.add(new Option(m.label, i)));
    GRIDS.forEach((g, i) => gridSel.add(new Option(g.label, i)));
    modelSel.value = '0';
    gridSel.value = '2'; // Netherlands — where this research happens

    const fmt = (n) => {
        if (n >= 100) return n.toFixed(0);
        if (n >= 1) return n.toFixed(1);
        if (n >= 0.01) return n.toFixed(2);
        return n.toFixed(3);
    };

    const footprint = (model, tokens, grid) => {
        // Presets are a token budget, not a split, so they are spent at the
        // reference mix the benchmarks are calibrated against. The full tool
        // is where the input/output split becomes a control.
        const mix = DATA.TOKEN_ENERGY.referenceMix;
        const wh = DATA.energyForQuery(model.model, tokens * mix.input, tokens * mix.output);
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
        const tokens = PRESET_TOKENS[presetSel.value];
        const f = footprint(model, tokens, grid);

        document.getElementById('ecoEnergy').textContent = fmt(f.wh);
        document.getElementById('ecoCarbon').textContent = fmt(f.carbon);
        document.getElementById('ecoWater').textContent = fmt(f.water);

        const ledMin = f.wh * 60 / 10;               // 10 W LED bulb
        const carM = f.carbon / 170 * 1000;          // EU avg petrol car, 170 g/km
        const teaspoons = f.water / 4.93;
        document.getElementById('ecoEquiv').innerHTML =
            `One answer &asymp; an LED bulb burning for <strong>${fmt(ledMin)} min</strong>, ` +
            `driving a petrol car <strong>${fmt(carM)} m</strong>, ` +
            `and <strong>${fmt(teaspoons)} teaspoons</strong> of cooling water.`;

        const bars = document.getElementById('ecoBars');
        const results = MODELS.map(m => ({ m, f: footprint(m, tokens, grid) }))
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
})();


// ===================================
// SHARE HELPERS — let every interactive result leave with the visitor.
// Web Share where available (mobile), graceful fallbacks: images fall back to a
// download, text falls back to the clipboard. Every payload links home.
// ===================================
window.mksShare = (() => {
    const SITE = (location.hostname + location.pathname).replace(/\/+$/, '') || 'moseskolleh.github.io/sustaintheworld';
    const flash = (btn, msg) => {
        if (!btn) return;
        if (!btn.dataset.label) btn.dataset.label = btn.textContent;
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = btn.dataset.label; }, 1700);
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
// THE ASSAY — paste a JD, get a client-side fit grade + evidence map.
// Deterministic keyword/ontology matching over a hand-written evidence set.
// No AI, no model download, nothing leaves the browser — that restraint is
// the argument. Every evidence line is real, drawn from this site.
// ===================================
(() => {
    const input = document.getElementById('assayInput');
    const runBtn = document.getElementById('assayRun');
    const clearBtn = document.getElementById('assayClear');
    const result = document.getElementById('assayResult');
    if (!input || !runBtn || !result) return;
    let lastAssayText = '';

    // Capability areas backed by real, delivered work on this site.
    const STRENGTHS = [
        { label: 'ESG analysis & integration',
          syn: ['esg', 'environmental social', 'environmental, social', 'sustainability analyst', 'sustainability strategy', 'materiality', 'double materiality'],
          ev: ['ESG & climate-risk analyses decision-makers can act on', 'Certified ESG Specialist'] },
        { label: 'Sustainability reporting (CSRD/ESRS & frameworks)',
          syn: ['csrd', 'esrs', 'sustainability report', 'non-financial report', 'disclosure', 'gri', 'sasb', 'ifrs s1', 'ifrs s2', 'tcfd', 'tnfd', 'cdp', 'sbti', 'reporting standard'],
          ev: ['Framed sustainable-AI work against CSRD/ESRS disclosure logic', 'Fluent across IFRS S1&S2, SASB, GRI, TCFD, TNFD, CDP, SBTi'] },
        { label: 'GHG accounting & carbon footprinting',
          syn: ['ghg', 'greenhouse gas', 'scope 1', 'scope 2', 'scope 3', 'carbon accounting', 'carbon footprint', 'emissions inventory', 'ghg protocol', 'life cycle', 'lca'],
          ev: ['GHG accounting across Scope 1–3', 'Mapped generative-AI footprint from Scope 2 electricity to Scope 3 hardware and cooling water', 'Life Cycle Assessment'] },
        { label: 'Climate risk, adaptation & disaster resilience',
          syn: ['climate risk', 'climate adaptation', 'resilience', 'physical risk', 'transition risk', 'disaster risk', 'hazard', 'vulnerability', 'sendai'],
          ev: ['UNDRR: documented 54 global hazard information systems for the Sendai Framework', 'Wuppertal flood-risk & climate-adaptation consultancy', 'Authored the Trinidad & Tobago national risk factsheet'] },
        { label: 'Water resources, hydrogeology & WASH',
          syn: ['water', 'wash', 'hydrogeology', 'groundwater', 'aquifer', 'borehole', 'water resource', 'drinking water', 'hydrology', 'sanitation'],
          ev: ['Delivered 164 water points across Sierra Leone', '70% aquifer strike rate using electrical-resistivity surveys', 'Groundwater potential mapping of the Freetown Complex'] },
        { label: 'GIS & geospatial analysis',
          syn: ['gis', 'qgis', 'arcgis', 'geospatial', 'spatial analysis', 'remote sensing', 'cartography', 'mapping'],
          ev: ['QGIS mapping that struck water 7 in 10', 'Produced groundwater-potential maps that guided drilling'] },
        { label: 'Data analysis & visualization',
          syn: ['python', 'data analysis', 'data analytics', 'pandas', 'sql', 'statistic', 'tableau', 'power bi', 'data visualization', 'data visualisation', 'r programming'],
          ev: ['Python for river-export pollution analysis', 'Tableau & Power BI', 'Google Advanced Data Analytics certificate'] },
        { label: 'Sustainable AI & AI governance',
          syn: ['sustainable ai', 'ai governance', 'responsible ai', 'ai ethics', 'green ai', 'ai sustainability', 'generative ai', 'llm', 'machine learning'],
          ev: ['Sustainable-AI framework & prototype for the Dutch Ministry of Finance (Digital Society School)', 'Built EcoPrompt Coach — energy, water & carbon of LLM queries'] },
        { label: 'Water quality & environmental modeling',
          syn: ['pollution', 'water quality', 'contamination', 'nutrient', 'nitrogen', 'effluent', 'catchment', 'watershed', 'eutrophication'],
          ev: ['MARINA-Multi pollution modeling across 10,226 sub-basins', 'River-export pollution analysis'] },
        { label: 'Stakeholder engagement & facilitation',
          syn: ['stakeholder', 'facilitation', 'workshop', 'engagement', 'cross-functional', 'interdisciplinary', 'capacity building', 'collaboration', 'collaborative'],
          ev: ['Interdisciplinary consultancy for the Municipality of Wuppertal', 'Led drilling crews and community water projects'] },
        { label: 'International & cross-cultural work',
          syn: ['international', 'multicultural', 'cross-cultural', 'multilingual', 'global south', 'developing country', 'developing countries', 'emerging market', 'fieldwork'],
          ev: ['Worked across three continents — Sierra Leone, China, Germany & the Netherlands', 'MOFCOM scholarship in China'] },
        { label: 'Applied research & methodology',
          syn: ['research', 'thesis', 'peer-review', 'methodology', 'literature review', 'academic research', 'msc'],
          ev: ['Dual master’s: Environmental Sciences (Wageningen) and Industrial Engineering (Hunan)', 'Design-research at the Digital Society School'] }
    ];

    // Honest growth edges — flagged if the JD asks for them.
    const GAPS = [
        { syn: ['10+ years', '10 years', '12 years', '15 years', '20 years', 'senior director', 'head of sustainability', 'vice president', 'principal consultant', 'director of'],
          note: 'Seniority: early-career — strongest as a fast-growing analyst/specialist, not a 10+-year lead.' },
        { syn: ['financial model', 'financial modeling', 'financial modelling', 'valuation', 'cfa', 'equity research', 'fp&a', 'p&l ownership'],
          note: 'Financial modeling isn’t the core strength — the numbers here are environmental, not financial.' },
        { syn: ['sphera', 'persefoni', 'workiva', 'enablon', 'novisto', 'watershed platform'],
          note: 'Hasn’t used that specific enterprise platform — but the underlying GHG/ESRS logic transfers directly.' },
        { syn: ['phd required', 'ph.d. required', 'doctorate required', 'phd in', 'ph.d in'],
          note: 'Holds two master’s degrees rather than a PhD.' },
        { syn: ['attorney', 'law degree', 'legal counsel', 'regulatory lawyer', 'bar admission'],
          note: 'Not a legal specialist — fluent in disclosure regulation, but not a lawyer.' }
    ];

    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Allow a trailing plural so "stakeholders" matches "stakeholder", etc.
    const hit = (text, syns) => syns.some(s => new RegExp('\\b' + esc(s) + '(?:s|es)?\\b', 'i').test(text));
    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const assay = () => {
        const text = (input.value || '').toLowerCase();
        result.hidden = false;
        if (text.trim().length < 20) {
            result.innerHTML = '<p class="assay-empty">Paste a few lines of the job description and I’ll grade the fit.</p>';
            if (clearBtn) clearBtn.hidden = true;
            return;
        }
        const matched = STRENGTHS.filter(t => hit(text, t.syn));
        const gaps = GAPS.filter(g => hit(text, g.syn));
        const strong = matched.length;

        let grade, cls, blurb;
        if (strong === 0) {
            grade = 'Different field'; cls = 'marginal';
            blurb = 'Nothing here maps to my environmental, data or sustainability evidence — most likely a different field. Happy to be told I’m wrong.';
        } else if (strong >= 3 && gaps.length <= 1) {
            grade = 'High-grade match'; cls = 'high';
            blurb = `This sits squarely in my wheelhouse — ${strong} of your requirement areas map to concrete, delivered work.`;
        } else if (strong >= 2) {
            grade = 'Workable match'; cls = 'workable';
            blurb = `A solid overlap — ${strong} requirement areas map to real evidence${gaps.length ? `, with ${gaps.length} honest gap${gaps.length > 1 ? 's' : ''} flagged below` : ''}.`;
        } else {
            grade = 'Marginal match'; cls = 'marginal';
            blurb = `One clear point of overlap${gaps.length ? ', plus some gaps' : ''} — worth a conversation if the rest is learnable on the job.`;
        }

        let html = `<div class="assay-grade assay-grade-${cls}"><span class="assay-grade-tag">${grade}</span><p>${blurb}</p></div>`;
        if (matched.length) {
            html += '<div class="assay-map"><div class="mono-label assay-map-h">What you asked for → what backs it</div>';
            html += matched.map(t => `<div class="assay-row"><div class="assay-req">${escHtml(t.label)}</div><div class="assay-ev">${t.ev.map(e => `<span>${escHtml(e)}</span>`).join('')}</div></div>`).join('');
            html += '</div>';
        }
        if (gaps.length) {
            html += '<div class="assay-gaps"><div class="mono-label assay-gaps-h">Honest gaps</div><ul>' + gaps.map(g => `<li>${escHtml(g.note)}</li>`).join('') + '</ul></div>';
        }
        if (cls === 'high' || cls === 'workable') {
            const subject = encodeURIComponent(`Fit for your role — ${matched.length} matching areas`);
            const body = encodeURIComponent(`Hi Moses,\n\nI ran your in-browser fit-check against a role and it flagged ${matched.length} matching areas${gaps.length ? ` (and ${gaps.length} gap${gaps.length > 1 ? 's' : ''})` : ''}. I'd like to talk.\n\n`);
            html += `<div class="assay-cta-wrap"><a class="btn btn-primary btn-small" href="mailto:moseskollehsesay@gmail.com?subject=${subject}&body=${body}" data-analytics="assay-contact"><svg class="icon" aria-hidden="true"><use href="#i-paper-plane"></use></svg> This looks like a fit — get in touch</a></div>`;
        }
        // Plain-text version a recruiter can copy into notes or an email.
        let plain = `Moses Kolleh Sesay — fit assessment: ${grade}\n${blurb}\n`;
        matched.forEach(t => { plain += `\n• ${t.label}\n`; t.ev.forEach(e => { plain += `   - ${e}\n`; }); });
        if (gaps.length) { plain += `\nHonest gaps:\n`; gaps.forEach(g => { plain += `• ${g.note}\n`; }); }
        plain += `\n— ${window.mksShare ? window.mksShare.site : 'moseskolleh.github.io/sustaintheworld'}`;
        lastAssayText = plain;
        html += `<div class="assay-copy-wrap"><button type="button" class="btn btn-secondary btn-small assay-copy" data-analytics="assay-copy"><svg class="icon" aria-hidden="true"><use href="#i-copy"></use></svg> Copy this result</button></div>`;
        html += '<p class="assay-note">Deterministic keyword match against a hand-written evidence set — no AI, no data sent anywhere. A starting point for a conversation, not a verdict.</p>';
        result.innerHTML = html;
        if (clearBtn) clearBtn.hidden = false;
        if (typeof window.trackEvent === 'function') window.trackEvent('assay-' + cls);
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
            result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    // The roughest term: embodied hardware carbon amortised per query, as
    // gCO2e per Wh of inference. Grid-independent (manufacturing is already
    // spent), so on a clean grid it can exceed operational Scope 2.
    const EMBODIED_G_PER_WH = 0.05;
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
        // Embodied hardware scales with the chips' compute, not facility overhead,
        // so Scope 3 uses pre-PUE inference energy (matching the coefficient's basis).
        return { scope2: kwh * grid.intensity, scope3: infWh * EMBODIED_G_PER_WH, water: kwh * WUE * 1000 };
    };
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
        const carbonMax = Math.max(d.scope2, d.scope3, 0.0001);
        const widths = [8 + (d.scope2 / carbonMax) * 40, 8 + (d.scope3 / carbonMax) * 40, 26];
        rows.forEach((ry, i) => ribbons[i].setAttribute('d', ribbon(sx, cy, tx, ry, widths[i])));
        const yr = scale === 'year';
        const m = yr ? ANSWERS_PER_YEAR : 1;
        const cDiv = yr ? 1000 : 1;                   // g -> kg, mL -> L
        const cu = yr ? 'kg' : 'g', wu = yr ? 'L' : 'mL';
        vals[0].textContent = `${fmt(d.scope2 * m / cDiv)} ${cu} CO₂e`;
        vals[1].textContent = `${fmt(d.scope3 * m / cDiv)} ${cu} CO₂e`;
        vals[2].textContent = `${fmt(d.water * m / cDiv)} ${wu} water`;
        if (summary) {
            const basis = yr ? `at ~${ANSWERS_PER_YEAR.toLocaleString()} answers/analyst-year (20/day × 220 days)` : 'one everyday answer';
            summary.innerHTML = `<strong>${DATA.MODELS[sel.value].label}</strong>, ${basis} on the <strong>${grid.label}</strong> grid: <strong>${fmt(d.scope2 * m / cDiv)} ${cu}</strong> Scope 2, <strong>${fmt(d.scope3 * m / cDiv)} ${cu}</strong> Scope 3, <strong>${fmt(d.water * m / cDiv)} ${wu}</strong> cooling water — three ESRS lines.`;
        }
    };

    update();
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

    // "typical intuition" line + the measured line (both revealed later)
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
        // Third line: what people typically expect — a near-linear ramp that
        // misses the reasoning spike, reframing the miss as the industry's.
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
        tableEl.innerHTML = `<table><caption>Measured energy per 1,000-token answer by model (order-of-magnitude estimates)</caption><thead><tr><th>Model</th><th>Wh per answer</th></tr></thead><tbody>${rows}</tbody></table>`;
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
        lines.push({ t: 'r', l: 'Text-only report', r: '8 KB' });
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
        if (open) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
