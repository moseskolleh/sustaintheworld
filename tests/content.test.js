// Keeps the pages agreeing with content/profile.json.
//
// Employment dates, degrees, certifications and profile links were written out
// by hand in index.html, its JSON-LD block, field-report.html, the narration
// scripts and the README. Nothing kept those copies in step, and they had
// already drifted — field-report.html listed a certification the rest of the
// site did not mention.
//
// The site stays a no-build static site; this does not template it. It just
// makes disagreement fail loudly, so the profile is edited in one place and
// the test says which pages are behind.
//
// The "Figures" sections apply the same rule to numbers: a figure on a page
// agrees with the content/ entry that is its basis, a figure with no basis
// stays off, and one that is only illustrative says so where it is shown.
//
// Run with: node tests/content.test.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'profile.json'), 'utf8'));

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const index = read('index.html');
const fieldReport = read('field-report.html');
const sitemap = read('sitemap.xml');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// Compare on visible text: the pages use HTML entities and the profile does not.
const plain = (html) => html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/\s+/g, ' ');

const indexText = plain(index);
const fieldText = plain(fieldReport);

// --- Links --------------------------------------------------------------
// One wrong LinkedIn URL on one page is a dead end for whoever clicks it.
{
    const files = ['index.html', 'field-report.html', 'carbon-ai.html', '404.html', 'README.md'];
    ['linkedin', 'github'].forEach((key) => {
        const canonical = profile.links[key];
        const host = canonical.replace(/^https?:\/\//, '').split('/')[0];
        const handlePath = canonical.replace(/^https?:\/\/[^/]+/, '');

        const wrong = [];
        files.forEach((file) => {
            const src = read(file);
            const found = src.match(new RegExp(`https?://(?:www\\.)?${host.replace('.', '\\.')}[^"'<>) \\n]*`, 'g')) || [];
            found.forEach((url) => {
                const p = url.replace(/^https?:\/\/[^/]+/, '').replace(/[.,)]$/, '');
                // Repository and project links under the same host are fine —
                // only the profile URL itself has to match.
                if (key === 'github' && p.split('/').length > 2) return;
                if (p !== handlePath) wrong.push(`${file}: ${url}`);
            });
        });
        assert(wrong.length === 0, `Links: every ${key} profile URL matches profile.json (${wrong.join(', ') || 'none'})`);
    });

    assert(
        index.includes(profile.person.email) && fieldReport.includes(profile.person.email),
        'Links: the contact email matches profile.json on both editions'
    );
    assert(
        fs.existsSync(path.join(ROOT, profile.links.cv)),
        `Links: the CV named in profile.json exists (${profile.links.cv})`
    );
}

// --- JSON-LD ------------------------------------------------------------
// Search engines read this, and it is the copy least likely to be noticed
// when it goes out of date.
{
    const block = (index.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i) || [])[1];
    assert(!!block, 'JSON-LD: the structured-data block is present');

    if (block) {
        const ld = JSON.parse(block);
        assert(ld.name === profile.person.name, `JSON-LD: name matches profile.json (${ld.name})`);
        assert(ld.jobTitle === profile.person.jobTitle, `JSON-LD: jobTitle matches profile.json (${ld.jobTitle})`);
        assert(ld.email === `mailto:${profile.person.email}`, `JSON-LD: email matches profile.json (${ld.email})`);
        assert(ld.url === profile.links.site, `JSON-LD: url matches profile.json (${ld.url})`);

        // worksFor has to name the employer the rest of the page names, and
        // its parent organisation — the reason it is spelled out here rather
        // than left as a bare string.
        assert(
            ld.worksFor && ld.worksFor.name === profile.currentRole.organization,
            `JSON-LD: worksFor names the current employer (${ld.worksFor && ld.worksFor.name})`
        );
        assert(
            ld.worksFor && ld.worksFor.parentOrganization === profile.currentRole.parentOrganization,
            `JSON-LD: worksFor records the parent organisation (${ld.worksFor && ld.worksFor.parentOrganization})`
        );

        const sameAs = ld.sameAs || [];
        [profile.links.github, profile.links.linkedin].forEach((url) => {
            assert(sameAs.includes(url), `JSON-LD: sameAs lists ${url}`);
        });

        // alumniOf must be exactly the institutions in the education list —
        // no more (a school that was never attended) and no fewer.
        const alumni = (ld.alumniOf || []).map(a => a.name).sort();
        const expected = profile.education.map(e => e.institution).sort();
        assert(
            JSON.stringify(alumni) === JSON.stringify(expected),
            `JSON-LD: alumniOf matches the education list (${alumni.join(', ')} vs ${expected.join(', ')})`
        );
    }
}

// --- Employment ---------------------------------------------------------
{
    const missing = [];
    profile.experience.forEach((role) => {
        if (!indexText.includes(role.title)) missing.push(`title "${role.title}"`);
        if (!indexText.includes(role.organization)) missing.push(`organisation "${role.organization}"`);
        if (!indexText.includes(role.displayDates)) missing.push(`dates "${role.displayDates}"`);
    });
    assert(missing.length === 0, `Experience: index.html carries every role from profile.json (missing: ${missing.join('; ') || 'none'})`);

    // Exactly one open-ended role. Two "Present" roles on a CV is either a
    // second job or, far more often, a date somebody forgot to close.
    const open = profile.experience.filter(r => r.end === null);
    assert(open.length === 1, `Experience: exactly one role is open-ended (${open.map(r => r.title).join(', ')})`);
    assert(
        open[0] && open[0].organization === profile.currentRole.organization,
        'Experience: the open-ended role is the one currentRole describes'
    );

    // Chronological, newest first — and no role starting before the one below
    // it ends, which is the shape of a copy-paste error.
    const starts = profile.experience.map(r => r.start);
    const sorted = starts.slice().sort().reverse();
    assert(JSON.stringify(starts) === JSON.stringify(sorted), 'Experience: roles are listed newest first');
}

// --- Education and certifications ---------------------------------------
{
    const missing = [];
    profile.education.forEach((e) => {
        if (!indexText.includes(e.degree)) missing.push(`index: "${e.degree}"`);
        if (!indexText.includes(e.institution)) missing.push(`index: "${e.institution}"`);
        if (!indexText.includes(e.displayDates)) missing.push(`index: dates "${e.displayDates}"`);
        if (!fieldText.includes(e.institution)) missing.push(`field-report: "${e.institution}"`);
        if (!fieldText.includes(e.textEditionDates)) missing.push(`field-report: dates "${e.textEditionDates}"`);
    });
    assert(missing.length === 0, `Education: both editions carry every entry (missing: ${missing.join('; ') || 'none'})`);

    const certMissing = [];
    profile.certifications.forEach((c) => {
        if (!indexText.includes(c.name)) certMissing.push(`index: "${c.name}"`);
        if (!indexText.includes(c.issuer)) certMissing.push(`index: "${c.issuer}"`);
        if (!fieldText.includes(c.issuer) && !fieldText.includes(c.name)) certMissing.push(`field-report: "${c.name}"`);
    });
    assert(certMissing.length === 0, `Certifications: both editions carry every entry (missing: ${certMissing.join('; ') || 'none'})`);

    // The count check is what caught the original drift: field-report.html had
    // four certifications and index.html had three.
    const indexCerts = (index.match(/class="education-card certification/g) || []).length;
    assert(
        indexCerts === profile.certifications.length,
        `Certifications: index.html shows all ${profile.certifications.length} (found ${indexCerts})`
    );
}

// --- Narration ----------------------------------------------------------
// What the listener hears must say what the page says — and Moses's recorded
// introduction cannot be fixed with an edit, only with another take.
{
    const { SCRIPTS, INTRO } = require('../voice-scripts.js');
    const spoken = SCRIPTS.concat(INTRO ? [INTRO] : []).map(s => s.text).join(' ');

    assert(
        spoken.includes(profile.currentRole.organization),
        'Narration: the current employer is named in the scripts'
    );

    // Any spelling of the employer other than the canonical one means the
    // audio says something the page does not.
    const strays = ['Digital Society Schools', 'Amsterdam University of Sciences']
        .filter(s => spoken.includes(s));
    assert(strays.length === 0, `Narration: no mis-spelled organisation names (${strays.join(', ') || 'none'})`);
}

// --- Sitemap ------------------------------------------------------------
{
    const missing = profile.pages.filter(p => !sitemap.includes(p.loc)).map(p => p.path);
    assert(missing.length === 0, `Sitemap: lists every page (missing: ${missing.join(', ') || 'none'})`);

    const locs = sitemap.match(/<loc>([^<]+)<\/loc>/g) || [];
    const known = profile.pages.map(p => p.loc);
    const extra = locs.map(l => l.replace(/<\/?loc>/g, '')).filter(l => !known.includes(l));
    assert(extra.length === 0, `Sitemap: lists no page that is not in profile.json (${extra.join(', ') || 'none'})`);

    // Every page needs a lastmod, and none of them may claim a future date —
    // a sitemap that says a page changed tomorrow is one crawlers distrust.
    const entries = sitemap.split('<url>').slice(1);
    const noLastmod = entries.filter(e => !/<lastmod>/.test(e)).length;
    assert(noLastmod === 0, `Sitemap: every entry declares a lastmod (${noLastmod} without)`);

    const today = new Date().toISOString().slice(0, 10);
    const future = (sitemap.match(/<lastmod>([^<]+)<\/lastmod>/g) || [])
        .map(m => m.replace(/<\/?lastmod>/g, ''))
        .filter(d => d > today);
    assert(future.length === 0, `Sitemap: no lastmod is in the future (${future.join(', ') || 'none'})`);
}

// --- Figures: record facts ----------------------------------------------
// A headcount, a programme's length or a grade is a record fact, and it lives
// on the profile entry it describes. The pages have to print the same one.
{
    const missing = [];
    profile.experience.filter(r => r.teamSize).forEach((r) => {
        const phrase = new RegExp(`team of ${r.teamSize}\\b`);
        if (!phrase.test(indexText)) missing.push(`index: team of ${r.teamSize} (${r.organization})`);
        if (!phrase.test(fieldText)) missing.push(`field-report: team of ${r.teamSize} (${r.organization})`);
    });
    profile.experience.filter(r => r.programmeWeeks).forEach((r) => {
        if (!indexText.includes(`${r.programmeWeeks}-week`)) missing.push(`index: ${r.programmeWeeks}-week (${r.organization})`);
    });
    profile.education.filter(e => e.grade).forEach((e) => {
        if (!indexText.includes(e.grade)) missing.push(`index: grade ${e.grade} (${e.institution})`);
    });
    assert(missing.length === 0, `Figures: the pages print the record facts profile.json holds (missing: ${missing.join('; ') || 'none'})`);
}

// --- Figures: case-study periods ------------------------------------------
// A thesis period is not the degree's dates. The two editions had drifted
// apart on exactly that — 2021–24 against 2023–24 for the coastal thesis —
// so each project's years are held to its case study.
{
    const projects = JSON.parse(read('content/projects.json')).caseStudies;
    const years = (s) => [...new Set((String(s).match(/\b(?:19|20)\d{2}\b/g) || []))].sort().join(',');

    const wrongIndex = [];
    projects.forEach((cs) => {
        const at = index.indexOf(`data-project="${cs.id}"`);
        const meta = at < 0 ? null : index.slice(at).match(/class="project-meta">\s*<span class="mono-label">([^<]+)</);
        if (!meta || years(meta[1]) !== years(cs.period)) wrongIndex.push(`${cs.id}: "${meta ? meta[1] : 'no dossier'}" vs "${cs.period}"`);
    });
    assert(wrongIndex.length === 0, `Figures: every homepage dossier shows its case study's years (wrong: ${wrongIndex.join('; ') || 'none'})`);

    // The field report numbers its projects in the case-study order.
    const section = fieldReport.split(/<h2>Projects<\/h2>/)[1] || '';
    const listed = (section.split('</dl>')[0].match(/<dt>\[\d+\][^<]*<\/dt>/g) || []);
    assert(listed.length === projects.length, `Figures: the field report lists every case study (${listed.length}/${projects.length})`);
    const wrongField = projects
        .filter((cs, i) => !listed[i] || years(listed[i]) !== years(cs.period))
        .map((cs) => `${cs.id} vs "${cs.period}"`);
    assert(wrongField.length === 0, `Figures: every field-report project shows its case study's years (wrong: ${wrongField.join('; ') || 'none'})`);
}

// --- Figures: the page's own weight --------------------------------------
// The footer and the Receipt quote sizes that scripts/check-budget.js
// measures. The field report had grown to 9 KB while all three still said 8.
{
    const { measure } = require('../scripts/check-budget.js');
    const { measured } = measure();
    const KB = 1024;

    const reportKB = Math.round(measured.fieldReport / KB);
    const quoted = [...index.matchAll(/(\d+)(?:&nbsp;| )KB field report|whole portfolio in (\d+)(?:&nbsp;| )KB/g)]
        .concat([...read('modules/interactives.js').matchAll(/'Text-only report', r: '(\d+) KB'/g)])
        .map(m => +(m[1] || m[2]));
    assert(
        quoted.length === 3 && quoted.every(n => n === reportKB),
        `Figures: the footer and the Receipt quote the field report's real size (${quoted.join(', ')} KB quoted, ${reportKB} KB measured)`
    );

    // Every place that quotes the first view quotes the budget's own figure,
    // rounded. Five kilobytes of slack let the footer and the lens say 275
    // while the README said 277: the disagreement this was meant to stop.
    // The sustainable-AI lens quotes the same figure as evidence.
    const wireKB = measured.criticalWire / KB;
    const readme = read('README.md');
    const firstView = [
        ['footer', index.match(/first view now costs about (\d+)(?:&nbsp;| )KB/)],
        ['sustainable-AI lens', read('content/lenses.json').match(/first view of ~(\d+) KB/)],
        ['README summary', readme.match(/a first view costs about \*\*(\d+) KB over the wire/)],
        ['README budget table', readme.match(/\| First view of the homepage[^|]*\| ~(\d+) KB \|/)]
    ];
    firstView.forEach(([where, m]) => assert(
        !!m && +m[1] === Math.round(wireKB),
        `Figures: the ${where} quotes the budget's first-view measure (${m && m[1]} KB quoted, ${Math.round(wireKB)} KB measured — run npm run budget)`
    ));
}

// --- Figures: claims with no basis stay off ------------------------------
// Each of these was on the site with nothing in content/ behind it. They are
// named here so that one coming back is a failure with its reason attached,
// not something a reader has to notice.
{
    const { SCRIPTS } = require('../voice-scripts.js');
    const pages = {
        'index.html': indexText,
        'field-report.html': fieldText,
        'case-studies.html': plain(read('case-studies.html')),
        narration: SCRIPTS.map(s => s.text).join(' ')
    };
    const UNSUPPORTED = [
        { re: /10,000\+ (?:people|beneficiaries)|ten thousand people/i, why: 'no count of people reached exists in content/' },
        { re: /project completion/i, why: 'a completion rate with no method or denominator behind it' },
        { re: /15% efficiency|efficiency by 15%/i, why: 'an efficiency gain with no baseline behind it' },
        { re: /advised the (?:UN|United Nations)/i, why: 'the UN role was an internship: "supported", as everywhere else' },
        { re: /certified across/i, why: 'there is one ESG certificate, not a set of frameworks' },
        { re: /well above local averages|against roughly 30%/i, why: 'leans on the blind-drilling baseline, which has no recorded source' },
        { re: /if a skill is listed, there's a project behind it/i, why: 'Life Cycle Assessment, Carbon Markets and Circular Economy are listed with no project behind them' },
        { re: /anywhere in the E\.?U\b/i, why: 'relocation and EU right to work are not stated on the site (owner checklist F2, F3)' }
    ];
    const found = [];
    Object.entries(pages).forEach(([page, text]) => {
        UNSUPPORTED.forEach(({ re, why }) => {
            const m = text.match(re);
            if (m) found.push(`${page}: "${m[0]}" (${why})`);
        });
    });
    assert(found.length === 0, `Figures: no claim without a basis is back (${found.join('; ') || 'none'})`);

    // The skills script reads out what the section only lists as a chip:
    // nothing on the site is a life cycle assessment Moses did.
    const skills = (SCRIPTS.find(x => x.id === 'skills') || { text: '' }).text;
    assert(!/life cycle|\bLCA\b/i.test(skills), 'Figures: the skills narration names no skill without a project behind it (life cycle assessment)');
}

// --- Tools: the field report names none the homepage does not show -------
// The field report is "the same content" as text. It kept Power BI after
// the homepage dropped it for want of evidence, so the Assay answered a
// Power BI requirement "Not evidenced on this site" while this page listed
// it. Every named tool the Assay knows is held to the Assay's own test:
// shown on the homepage, or not listed here (owner checklist E4).
{
    const { run } = require('./harness.js');
    const { window } = run('dark', { before: (w) => { w.console.log = () => {}; } });
    const A = window.mks.assay;
    const toolkit = plain((read('field-report.html').match(/<h2>Toolkit<\/h2>\s*<p>([\s\S]*?)<\/p>/) || [])[1] || '');
    const tools = A.RULES.tools.map(t => (typeof t === 'string' ? t : t.name));
    const a = A.analyse(`Requirements: ${toolkit}`, { now: new Date(2026, 8, 26) });
    const named = a.met.concat(a.gaps).map(x => x.label).filter(l => tools.includes(l));
    const unshown = a.gaps.map(g => g.label).filter(l => tools.includes(l));
    assert(named.length >= 6, `Tools: the field report's toolkit is found and read (${named.join(', ')})`);
    assert(unshown.length === 0, `Tools: every tool the field report lists is one the homepage shows, so the Assay matches it (not shown: ${unshown.join(', ') || 'none'})`);
}

// --- Figures: illustrative numbers say so --------------------------------
// The 30% blind-drilling baseline and the straight-line guess in You Draw It
// have no source behind them. They stay, because the comparison is the
// point of both widgets, but wherever they are shown they are labelled.
{
    const { run } = require('./harness.js');
    const { window } = run('dark', { before: (w) => { w.console.log = () => {}; } });
    const doc = window.document;
    const text = (id) => (doc.getElementById(id) || { textContent: '' }).textContent;

    const anchors = doc.querySelector('.strike-anchors');
    assert(!!anchors && /30%, illustrative/.test(anchors.textContent), `Illustrative: the 30% anchor says so (${anchors && anchors.textContent})`);
    const foot = doc.querySelector('.strike-foot');
    assert(!!foot && /illustrative\s+—\s+not a measured figure/.test(foot.textContent), 'Illustrative: the Seven-in-ten footnote says the 30% is not measured');

    const slider = doc.getElementById('strikeSlider');
    const leaning = [30, 50, 70].filter((rate) => {
        slider.value = String(rate);
        slider.dispatchEvent(new window.Event('input', { bubbles: true }));
        return !/illustrative/.test(text('strikeCounter'));
    });
    assert(leaning.length === 0, `Illustrative: every Seven-in-ten message that compares with blind drilling says illustrative (unlabelled at: ${leaning.join(', ') || 'none'})`);

    // Three holes anywhere put the comparison on the score line.
    doc.body.classList.add('eco-mode');   // drilling finishes at once
    const stage = doc.getElementById('boreholeStage');
    const key = (k) => stage.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const attempts = () => +((text('drillScore').match(/Strikes: \d+\/(\d+)/) || [])[1] || 0);
    for (let i = 0; i < 60 && attempts() < 3; i++) {
        doc.getElementById('drillBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
        for (let k = 0; k < 4; k++) key('ArrowRight');
    }
    assert(attempts() >= 3 && /30%, illustrative/.test(text('drillScore')), `Illustrative: the borehole score line labels the 30% (${text('drillScore')})`);

    const legend = doc.querySelector('.ydi-leg-intuit');
    assert(!!legend && /illustrative/.test(legend.textContent), `Illustrative: the You Draw It legend labels the guess line (${legend && legend.textContent})`);
    const caption = doc.querySelector('#ydiTable caption');
    assert(!!caption && /illustrative — from no source/.test(caption.textContent), 'Illustrative: the You Draw It data table says the guess line has no source');
    // The plotted models are a preprint's order-of-magnitude estimates, not
    // measurements of a deployment (ai-carbon-data.js): nothing calls them measured.
    const ydiText = ['.ydi-lede', '.ydi-leg-real', '#ydiReveal', '#ydiTable caption'].map(s => (doc.querySelector(s) || { textContent: '' }).textContent).join(' | ');
    assert(!/\bmeasured\b|real curve/i.test(ydiText.replace(/illustrative — from no source/, '')), `Illustrative: You Draw It calls the research figures estimates, not measurements (${ydiText})`);

    // The verdict after Reveal is the sentence a visitor reads as the
    // result. It used to say "It's actually 1.20 Wh — you underestimated the
    // frontier by 1.7×" to a guess inside the estimate's own range.
    const R1 = window.AICarbonData.MODELS['deepseek-r1'];
    const hit = doc.querySelector('#ydiSvg .ydi-hit');
    const press = (k) => hit.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const guessed = () => +((hit.getAttribute('aria-valuetext') || '').match(/guess ([\d.]+) Wh/) || [])[1];
    const verdictFor = (wh) => {
        for (let i = 0; i < 12; i++) press('ArrowRight');   // to the frontier model
        for (let i = 0; i < 40 && guessed() > wh; i++) press('ArrowDown');
        for (let i = 0; i < 40 && guessed() < wh; i++) press('ArrowUp');
        const at = guessed();
        doc.getElementById('ydiReveal').click();
        const said = text('ydiVerdict');
        doc.getElementById('ydiReset').click();
        return { at, said };
    };
    const inside = verdictFor(0.7);
    assert(inside.at >= R1.range[0] && inside.at <= R1.range[1] && /within that range/.test(inside.said) && !/underestimat|overestimat/.test(inside.said),
        `Estimates: a guess inside the published range is told so, not that it missed (${inside.at} Wh: ${inside.said})`);
    assert(inside.said.includes(`The published estimate is about ${R1.energyPer1kTokens_Wh} Wh (${R1.range[0]}–${R1.range[1]} Wh)`),
        'Estimates: the verdict gives the central estimate with its range');
    const below = verdictFor(0.3);
    assert(below.at < R1.range[0] && /underestimated the frontier/.test(below.said), `Estimates: a guess below the range is an underestimate (${below.at} Wh: ${below.said})`);
    const zero = verdictFor(0);
    assert(/near zero/.test(zero.said), 'Estimates: a guess of nothing says so');
    const said = [inside, below, zero].map(v => v.said).join(' ');
    assert(!/\bactually\b|\d\.\d×/.test(said) && /50–1,250× across the ranges/.test(said),
        'Estimates: no verdict calls an estimate the actual value or grades it to a decimal, and the gap between models comes with its range');
    // The share card is drawn on a canvas jsdom cannot read, so its words are held in the source.
    const ydiSrc = read('modules/interactives.js').split('YOU DRAW IT')[1].split('THE RECEIPT')[0];
    assert(!/\bactually\b|really costs|reveal the truth/i.test(ydiSrc), 'Estimates: nothing in You Draw It, the share card included, calls an estimate the true cost');

    // --- One boundary for embodied carbon on both pages ---
    // Anatomy of a Prompt used to add a Scope 3 figure from a constant with no
    // source, while the full coach said it excluded embodied carbon.
    const vals = Array.from(doc.querySelectorAll('#anatomySvg .anatomy-t-val')).map(v => v.textContent);
    assert(vals.length === 3 && vals[1] === 'not quantified', `Boundary: Anatomy names Scope 3 without a number (${vals.join(' | ')})`);
    assert(!/\d\s*g\s*<\/strong>\s*Scope 3/.test(doc.getElementById('anatomySummary').innerHTML), 'Boundary: the Anatomy summary gives no Scope 3 figure');
    const coach = plain(read('carbon-ai.html'));
    assert(
        /Embodied carbon of the hardware is excluded, here and in Anatomy of a Prompt/.test(coach)
            && /which neither page quantifies/.test(indexText),
        'Boundary: the coach and Anatomy both state that embodied carbon is excluded'
    );
    // Scope 2 and capital goods are the lines of whoever runs the model. An
    // organisation buying answers from a hosted one reports the carbon in
    // its Scope 3, category 1, and the widget's "per analyst-year" is that
    // organisation, so the page has to say whose report the lines are on.
    const anatomyFoot = plain(doc.querySelector('.anatomy-foot').innerHTML);
    assert(/whoever runs the model/.test(text('anatomySummary')) && /whoever runs the model/.test(anatomyFoot),
        'Boundary: Anatomy names whose report its Scope 2 and Scope 3 lines are on');
    assert(/hosted model[^.]*Scope 3, category 1 \(purchased services\)/.test(anatomyFoot) && /category 1/.test(text('anatomySummary')),
        'Boundary: and says where the carbon goes for a buyer of a hosted model, in the foot and in the copied figure');
    assert(!/Scope 3, capital goods/.test(coach), 'Boundary: the coach does not put the operator\'s capital-goods label on the reader');
}

// --- Staleness ----------------------------------------------------------
// Deliberately not a failure. A test that goes red on a calendar date teaches
// people to ignore red. This prints where anyone will see it and moves on.
{
    const verified = new Date(profile.meta.verifiedOn);
    assert(!isNaN(verified.getTime()), `Profile: meta.verifiedOn is a real date (${profile.meta.verifiedOn})`);

    const months = (Date.now() - verified.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months > profile.meta.staleAfterMonths) {
        console.log('');
        console.log(`NOTICE: content/profile.json was last verified ${Math.floor(months)} months ago (${profile.meta.verifiedOn}).`);
        console.log(`        "${profile.currentRole.displayDates}" at ${profile.currentRole.organization} is still being`);
        console.log('        published as current. Confirm it, then update meta.verifiedOn — or close the role');
        console.log('        in profile.json, index.html, field-report.html, the CV and the narration together.');
        console.log('');
    } else {
        console.log(`INFO: profile verified ${Math.floor(months)} month(s) ago; next review due after ${profile.meta.staleAfterMonths}.`);
    }
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);   // the page booted above leaves timers running
