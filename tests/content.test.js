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

// A figure marked with its claims-ledger entry reads as the figure alone
// (tests/claims.test.js holds the mark to the ledger).
const unmark = (html) => html.replace(/<span data-claim="[^"]*">([^<]*)<\/span>/g, '$1');

// Compare on visible text: the pages use HTML entities and the profile does not.
const plain = (html) => unmark(html)
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
    // The phone number the CV prints is the one the homepage publishes.
    const tel = (index.match(/href="tel:([^"]+)"[\s\S]*?<p>([^<]+)<\/p>/) || []).slice(1);
    assert(!!profile.person.phone && tel[0] === profile.person.phone.replace(/[^\d+]/g, '') && tel[1].replace(/&nbsp;/g, ' ') === profile.person.phone,
        `Links: the homepage's phone number, its link and its text, matches profile.json (${tel.join(' / ') || 'none'})`);
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
// so each project's years are held to its case study. The homepage shows
// every case study not kept off it (homepageCard: false), and the field
// report, its text edition, lists the same.
{
    const { onHomepage } = require('../scripts/lib/content.js');
    const projects = JSON.parse(read('content/projects.json')).caseStudies.filter(onHomepage);
    const years = (s) => [...new Set((String(s).match(/\b(?:19|20)\d{2}\b/g) || []))].sort().join(',');

    const wrongIndex = [];
    projects.forEach((cs) => {
        const at = index.indexOf(`data-project="${cs.id}"`);
        const meta = at < 0 ? null : index.slice(at).match(/class="project-meta">\s*<span class="mono-label">([^<]+)</);
        if (!meta || years(meta[1]) !== years(cs.period)) wrongIndex.push(`${cs.id}: "${meta ? meta[1] : 'no card'}" vs "${cs.period}"`);
    });
    assert(wrongIndex.length === 0, `Figures: every homepage project card shows its case study's years (wrong: ${wrongIndex.join('; ') || 'none'})`);

    // The field report numbers its projects in the case-study order.
    const section = fieldReport.split(/<h2>Projects<\/h2>/)[1] || '';
    const listed = (section.split('</dl>')[0].match(/<dt>\[\d+\][^<]*<\/dt>/g) || []);
    assert(listed.length === projects.length, `Figures: the field report lists every case study the homepage shows (${listed.length}/${projects.length})`);
    const wrongField = projects
        .filter((cs, i) => !listed[i] || years(listed[i]) !== years(cs.period))
        .map((cs) => `${cs.id} vs "${cs.period}"`);
    assert(wrongField.length === 0, `Figures: every field-report project shows its case study's years (wrong: ${wrongField.join('; ') || 'none'})`);
}

// --- Figures: the page's own weight --------------------------------------
// The footer and the Receipt quote sizes that scripts/check-budget.js
// measures. The field report had grown to 9 KB while all three still said 8,
// and the 404 page's link to it, which nothing checked, said 8 for longer.
{
    const { measure } = require('../scripts/check-budget.js');
    const { measured } = measure();
    const KB = 1024;

    const reportKB = Math.round(measured.fieldReport / KB);
    const quoted = [...unmark(index).matchAll(/(\d+)(?:&nbsp;| )KB field report|whole portfolio in (\d+)(?:&nbsp;| )KB/g)]
        .concat([...read('modules/interactives.js').matchAll(/'Text-only report', r: '(\d+) KB'/g)])
        .concat([...unmark(read('404.html')).matchAll(/(\d+)(?:&nbsp;| )KB field report/g)])
        .map(m => +(m[1] || m[2]));
    assert(
        quoted.length === 4 && quoted.every(n => n === reportKB),
        `Figures: the footer, the Receipt and the 404 page quote the field report's real size (${quoted.join(', ')} KB quoted, ${reportKB} KB measured)`
    );

    // Every place that quotes the first view quotes the budget's own figure,
    // rounded. Five kilobytes of slack let the footer and the lens say 275
    // while the README said 277: the disagreement this was meant to stop.
    // The sustainable-AI lens quotes the same figure as evidence.
    const wireKB = measured.criticalWire / KB;
    const readme = read('README.md');
    const firstView = [
        ['footer', unmark(index).match(/first view now costs about (\d+)(?:&nbsp;| )KB/)],
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
        { re: /anywhere in the E\.?U\b/i, why: 'relocation and EU right to work are not stated on the site (owner checklist F2, F3)' },
        { re: /GeoPandas|GeoAI/i, why: 'not in the homepage\'s toolkit, so the CV printed from it left them off; the field report kept GeoPandas' }
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

    // The 30% moved with the borehole game to the groundwater case study,
    // where tests/widgets.test.js holds every place it is shown to the label.

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

    // --- One boundary for embodied carbon ---
    // Anatomy of a Prompt used to add a Scope 3 figure from a constant with no
    // source, while the full coach said it excluded embodied carbon. Both are
    // on carbon-ai.html now, and tests/carbon.test.js holds them to one
    // boundary there. Left to hold here: the homepage's teaser states none
    // of its own that could drift from theirs.
    const teaser = plain(doc.getElementById('ecoprompt').innerHTML);
    assert(!/Scope [123]|embodied|capital goods/i.test(teaser) && /inference only/.test(teaser),
        'Boundary: the homepage teaser says "inference only", as the coach does, and nothing about embodied carbon or scopes');
    const coach = plain(read('carbon-ai.html'));
    assert(!/Scope 3, capital goods/.test(coach), 'Boundary: the coach does not put the operator\'s capital-goods label on the reader');
}

// --- His public work: the six repositories ---------------------------------
// Only 3 of 12 case-study results could be checked from outside, and 3 of
// the 5 public research outputs were this site itself, while six public
// repositories went unmentioned (docs/plan.md, Phase 3). Each is now where
// it belongs, public and spelled as GitHub spells it, and the homepage's
// skills point at them rather than at the site.
{
    const content = require('../scripts/lib/content.js');
    const research = JSON.parse(read('content/research.json'));
    const projects = JSON.parse(read('content/projects.json')).caseStudies;
    const lenses = JSON.parse(read('content/lenses.json')).lenses;
    const GH = 'https://github.com/moseskolleh/';
    const REPOS = [
        { name: 'WaterProject', research: { caseStudy: 'groundwater' }, artifactOf: ['groundwater'], skill: 'Python' },
        { name: 'GAIA-Framework-', research: { caseStudy: 'gaia' }, artifactOf: ['gaia'] },
        { name: 'climatematch-pipeline', research: { lenses: ['climate-risk'] }, artifactOf: [] },
        { name: 'A-B-Testing-at-Globox', research: {}, artifactOf: [], skill: 'SQL' },
        { name: 'SustainableAIPrototypes', research: { caseStudy: 'sustainable-ai' }, artifactOf: ['sustainable-ai'] },
        { name: 'promptcoach', research: { caseStudy: 'sustainable-ai' }, artifactOf: ['sustainable-ai'], skill: 'JavaScript' }
    ];
    const home = new (require('jsdom').JSDOM)(index).window.document;
    const wrong = [];
    REPOS.forEach((r) => {
        const url = GH + r.name;
        const out = research.outputs.filter(o => o.url === url);
        if (out.length !== 1 || out[0].status !== 'public') wrong.push(`${r.name}: ${out.length} public research outputs`);
        else if (out[0].caseStudy !== r.research.caseStudy || JSON.stringify(out[0].lenses) !== JSON.stringify(r.research.lenses)) {
            wrong.push(`${r.name}: research output placed at ${out[0].caseStudy || out[0].lenses}`);
        }
        const holders = projects.filter(cs => (cs.artifacts || []).some(a => a.url === url && a.status === 'public')).map(cs => cs.id);
        if (holders.join() !== r.artifactOf.join()) wrong.push(`${r.name}: an artifact of ${holders.join(', ') || 'nothing'}, not ${r.artifactOf.join(', ') || 'nothing'}`);
        if (r.skill) {
            const item = Array.from(home.querySelectorAll('#skills .toolkit-item')).find(li => plain(li.querySelector('.toolkit-name').innerHTML).startsWith(r.skill));
            const proof = item && item.querySelector('a.toolkit-proof');
            if (!proof || proof.getAttribute('href') !== url) wrong.push(`${r.name}: not the ${r.skill} proof (${proof && proof.getAttribute('href')})`);
        }
    });
    assert(wrong.length === 0, `Repos: each of the six is public where it belongs, on research.html, its case study and the skills (wrong: ${wrong.join('; ') || 'none'})`);

    // A repository link anywhere is one of the six, spelled exactly: GitHub
    // forgives the case, a reader comparing names does not.
    const shipped = ['index.html', 'case-studies.html', 'research.html', 'carbon-ai.html', 'field-report.html', '404.html', 'stats.html', 'README.md']
        .map(f => [f, read(f)]).concat(['projects', 'research', 'lenses', 'profile', 'narration'].map(n => [`content/${n}.json`, read(`content/${n}.json`)]));
    const names = REPOS.map(r => r.name);
    const stray = [];
    shipped.forEach(([f, src]) => (src.match(/github\.com\/moseskolleh\/[\w.-]+/gi) || []).forEach((m) => {
        const repo = m.split('/')[2].replace(/\.git$|\.$/, '');
        if (!names.includes(repo) && repo !== 'sustaintheworld') stray.push(`${f}: ${m}`);
    }));
    assert(stray.length === 0, `Repos: every repository link names one of the six as GitHub spells it (stray: ${stray.join(', ') || 'none'})`);

    // Every role view has public work a reader can open somewhere other
    // than this site, whatever lenses content/lenses.json holds. The
    // validator refuses one without; this says which work each lens has.
    const bare = lenses.map(l => [l.id, content.publicWorkFor(l.id, { caseStudies: projects }, research)
        .filter(w => /^https?:\/\//.test(w.url))]);
    assert(bare.every(([, work]) => work.length > 0),
        `Lenses: each has public work beyond this site (${bare.map(([id, work]) => `${id}: ${work.length}`).join(', ')})`);

    // A lens's own work, not work borrowed from a case study that only
    // touches it: without climatematch-pipeline the climate view's only
    // repositories were the sustainable-AI case's, which lists the climate
    // lens third, and the guard still passed.
    const without = { outputs: research.outputs.filter(o => o.id !== 'climatematch-pipeline') };
    const left = content.checkLensWork(lenses, { caseStudies: projects }, without);
    assert(left.length === 1 && /lens "climate-risk"/.test(left[0]),
        `Lenses: without climatematch-pipeline the climate view has no public work of its own, and the build says so (${left.join('; ') || 'it passed'})`);

    // And the view shows it. research.html links an output with no case
    // study to the view its lenses name; that view's panel lists it, linked,
    // and links back to its entry, so the link lands on something. Without
    // JavaScript the link lands on the "all" view, which lists it too.
    const cs = new (require('jsdom').JSDOM)(read('case-studies.html')).window.document;
    const unshown = research.outputs.filter(o => !o.caseStudy).flatMap(o => (o.lenses ? o.lenses.concat('all') : []).map(l => [o, l])).filter(([o, l]) => {
        const panel = cs.querySelector(`[data-lens-panel="${l}"]`);
        return !panel || !(o.status !== 'public' || panel.querySelector(`.cs-lens-evidence a[href="${o.url}"]`))
            || !panel.querySelector(`.cs-lens-evidence a[href="research.html#${o.id}"]`);
    }).map(([o, l]) => `${o.id} in ${l}`);
    assert(research.outputs.some(o => o.lenses) && unshown.length === 0,
        `Lenses: each output placed in a view by its lenses is listed, linked, in that view's panel and in the "all" view a reader without JavaScript gets (${unshown.join(', ') || 'all are'})`);

    // Research outputs that are this site itself stay, but no longer make up
    // most of the public list.
    const open = research.outputs.filter(o => o.status === 'public');
    const own = open.filter(o => !/^https?:\/\//.test(o.url));
    assert(own.length * 2 < open.length, `Research: this site's own outputs are a minority of the public ones (${own.length} of ${open.length})`);
}

// --- What the repositories do not say stays off --------------------------
// The repositories name clients and partners who never agreed to be named
// here (docs/plan.md: "partner names stay out without their consent"), and
// targets a README calls success metrics. None of it may reach a page.
{
    const KEEP_OUT = [/\bTimbo\b/, /\bACF\b/, /Living Water International/i, /\bWiNGiN\b/i,
        /\bMatthijs\b/, /\bThomas\b/, /\bJop\b/, /\bCora\b/, /\bMirai\b/, /\bZahra\b/, /\bAli\b/, /\bRezaei\b/];
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
        .concat(fs.readdirSync(path.join(ROOT, 'content')).filter(f => f.endsWith('.json')).map(f => `content/${f}`), ['voice-scripts.js']);
    const named = [];
    pages.forEach((f) => {
        const src = read(f);
        KEEP_OUT.forEach((re) => { const m = src.match(re); if (m) named.push(`${f}: "${m[0]}"`); });
    });
    assert(named.length === 0, `Partners: no client, partner or team member the repositories name is on the site (${named.join(', ') || 'none'})`);

    // The prototypes' README lists "success metrics" (a 25% CO2 cut, 4.2/5
    // stars, 70% improvement) that are targets. Wherever the site mentions
    // them it says so, and none of their figures appears.
    const all = pages.map(f => plain(read(f))).join(' ');
    const metrics = all.match(/success metrics[^.]*\./gi) || [];
    assert(metrics.length > 0 && metrics.every(s => /targets, not results/.test(s)) && !/4\.2\s*\/\s*5|70% (?:self-reported )?improvement|25% reduction/i.test(all),
        `Partners: the prototypes' success metrics are called targets, and none is quoted (${metrics.join(' | ')})`);

    // GAIA maps its outputs to disclosure line items. That is not
    // compliance, certification or assurance, and no sentence about it says so.
    const gaia = all.split(/(?<=[.!?])\s+/).filter(s => /GAIA/.test(s));
    assert(gaia.length > 0 && !gaia.some(s => /\b(?:compliant|certified|assured)\b/i.test(s)),
        `GAIA: no sentence calls its mapping compliance, certification or assurance (${gaia.length} sentences)`);
}

// --- Power BI: a tool claimed only with its proof ------------------------
// Nothing anywhere evidences Power BI, so it is named nowhere, unless the
// homepage's toolkit lists it with a proof link (owner checklist E4). The
// Assay's list of tools to detect in an ad is not a claim, and is not read.
{
    const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
        .concat(fs.readdirSync(path.join(ROOT, 'content')).filter(f => f.endsWith('.json')).map(f => `content/${f}`), ['voice-scripts.js']);
    const doc = new (require('jsdom').JSDOM)(index).window.document;
    const listed = Array.from(doc.querySelectorAll('#skills .toolkit-item')).filter(li => /power\s*bi/i.test(li.textContent));
    const proven = listed.every(li => li.querySelector('a.toolkit-proof[href^="http"], a.toolkit-proof[href^="case-studies.html#"]'));
    const elsewhere = pages.filter(f => /power\s*bi/i.test(f === 'index.html'
        ? read(f).replace(/<li class="toolkit-item">[\s\S]*?<\/li>/g, li => (/power\s*bi/i.test(li) && proven ? '' : li))
        : read(f)));
    assert(proven && elsewhere.length === 0, `Power BI: claimed nowhere without a proof link (${elsewhere.join(', ') || 'none'})`);
}

// --- Skills: each proof is public work that shows it, or says there is none
// The proofs pointed at #projects, #education and the coach on this site.
// Each now opens a repository, or says in words that there is no public
// project, and then links nowhere or to the case study that tells the work.
// QGIS pointed at the groundwater case study and passed because the case
// study had a public repository, WaterProject, which shows no GIS work at
// all. A case study is a proof only if one of its public artifacts names
// the tool.
{
    const content = require('../scripts/lib/content.js');
    const research = JSON.parse(read('content/research.json'));
    const projects = JSON.parse(read('content/projects.json')).caseStudies;
    const doc = new (require('jsdom').JSDOM)(index).window.document;
    const items = Array.from(doc.querySelectorAll('#skills .toolkit-item'));
    const bad = [];
    items.forEach((li) => {
        const name = li.querySelector('.toolkit-name');
        const tool = plain(name.innerHTML).trim();
        const names = name.firstChild.textContent.split(/[&·/]/).map(n => n.trim()).filter(Boolean);
        const proof = li.querySelector('.toolkit-proof');
        const href = proof && proof.getAttribute('href');
        if (!proof) return bad.push(`${tool}: no proof`);
        const none = /no public (?:[\w.]+ )?project/.test(proof.textContent);
        if (!href) {
            if (proof.localName === 'a' || !none) bad.push(`${tool}: an unlinked proof that does not say there is no public project`);
            return;
        }
        const cs = href.startsWith('case-studies.html#') && projects.find(c => c.id === href.split('#')[1]);
        const repo = research.outputs.some(o => o.url === href && o.status === 'public');
        const shows = cs && (cs.artifacts || []).some(a => a.status === 'public' && /^https?:\/\//.test(a.url)
            && names.some(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(`${a.name} ${a.note || ''}`)));
        if (none && !cs) bad.push(`${tool}: says there is no public project, yet links ${href}`);
        if (!none && !repo && !shows) bad.push(`${tool}: ${href} has no public work that shows ${names.join(' or ')}`);
        if (/^https?:/.test(href) && proof.getAttribute('rel') !== 'noopener') bad.push(`${tool}: an off-site link without rel="noopener"`);
    });
    assert(items.length === 6 && bad.length === 0, `Skills: every proof is public work that shows the tool, or says there is none (wrong: ${bad.join('; ') || 'none'})`);
    const gis = items.find(li => /^QGIS/.test(plain(li.innerHTML).trim()));
    assert(!!gis && /on request; no public GIS project yet/.test(gis.querySelector('.toolkit-proof').textContent),
        'Skills: the GIS proof says its maps are on request and there is no public GIS project yet (owner checklist R7)');
    // The Tableau proof is the repository that links the dashboard, and says
    // only that: no workbook is in it.
    const tableau = items.find(li => /^Tableau/.test(plain(li.innerHTML).trim()));
    assert(!!tableau && /links a Tableau Public dashboard/.test(tableau.querySelector('.toolkit-proof').textContent),
        'Skills: the Tableau proof says the repository links a Tableau Public dashboard, and no more');
    assert(!content.TRUSTED_HOSTS.includes('public.tableau.com'), 'Skills: the dashboard is reached through the repository, not linked from here');
}

// --- One name for one tool -----------------------------------------------
// "AI, Weighed", "EcoPrompt Coach" and "promptcoach" were one tool under
// three names. It is the EcoPrompt Coach: carbon-ai.html is this site's
// edition, the promptcoach repository and its app the maintained one, and
// "promptcoach" is only ever the repository's name.
{
    const shipped = fs.readdirSync(ROOT).filter(f => /\.(html|js|css)$/.test(f))
        .concat(fs.readdirSync(path.join(ROOT, 'modules')).map(f => `modules/${f}`),
            fs.readdirSync(path.join(ROOT, 'content')).map(f => `content/${f}`), ['README.md']);
    const old = shipped.filter(f => /AI,(?:\s|&nbsp;)+Weighed/i.test(read(f)));
    assert(old.length === 0, `One name: "AI, Weighed" is gone (${old.join(', ') || 'nowhere'})`);

    // In what a reader sees, "promptcoach" is a repository: in its address,
    // or in brackets after the tool's name.
    const seen = [];
    ['index.html', 'carbon-ai.html', 'case-studies.html', 'research.html'].forEach((f) => {
        (plain(read(f)).match(/.{0,24}promptcoach.{0,2}/gi) || [])
            .filter(m => !/\/promptcoach/i.test(m) && !/EcoPrompt Coach[^.]*\(promptcoach\)/.test(m) && !/\(promptcoach\)/.test(m))
            .forEach(m => seen.push(`${f}: "${m}"`));
    });
    assert(seen.length === 0, `One name: "promptcoach" names the repository, never the tool (${seen.join('; ') || 'as it should'})`);

    // The maintained tool is linked as such, app and code, from the coach's
    // page and from the homepage's teaser.
    const APP = 'https://moseskolleh.github.io/promptcoach/';
    const REPO = 'https://github.com/moseskolleh/promptcoach';
    const { JSDOM } = require('jsdom');
    const coach = new JSDOM(read('carbon-ai.html')).window.document;
    const teaser = new JSDOM(index).window.document.getElementById('ecoprompt');
    [['carbon-ai.html', coach.querySelector('.ca-hero')], ['the homepage teaser', teaser]].forEach(([where, el]) => {
        const hrefs = Array.from(el.querySelectorAll('a')).map(a => a.getAttribute('href'));
        assert(hrefs.includes(APP) && hrefs.includes(REPO), `One name: ${where} links the maintained EcoPrompt Coach, its app and its code (${hrefs.join(', ')})`);
    });

    // carbon-ai.html's own figures say how old they are, from the data.
    const data = require('../ai-carbon-data.js');
    const vintage = coach.querySelector('.ca-hero .ca-vintage');
    const grid = (Object.values(data.REGIONS)[0].vintage.match(/\d{4}/) || [])[0];
    const sameGrid = Object.values(data.REGIONS).every(r => r.vintage === Object.values(data.REGIONS)[0].vintage);
    assert(!!vintage && plain(vintage.querySelector('time').textContent) === data.REVIEWED_ON &&
        sameGrid && new RegExp(`grid intensities from ${grid} data`).test(plain(vintage.innerHTML)) &&
        /For newer models, see the EcoPrompt Coach app; its 2026 models are extrapolated/.test(plain(vintage.innerHTML)),
        `Vintage: carbon-ai.html dates its figures as ai-carbon-data.js does (reviewed ${data.REVIEWED_ON}, grid ${grid}) and sends newer models to the app, extrapolated as it says`);
    assert(!/reproduces its calculation model|mirrors the calculation model/i.test(read('content/research.json') + read('content/projects.json') + read('carbon-ai.js')),
        'One name: nothing says this site\'s edition reproduces the maintained tool\'s model; they have separate code and data');
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
        console.log(`NOTICE: content/profile.json was logged ${Math.floor(months)} months ago (${profile.meta.verifiedOn}).`);
        console.log(`        "${profile.currentRole.displayDates}" at ${profile.currentRole.organization} is still being`);
        console.log('        published as current. Confirm it, then set meta.confirmedOn and meta.verifiedOn — or close the role');
        console.log('        in profile.json, index.html, field-report.html, the CV and the narration together.');
        console.log('');
    } else {
        console.log(`INFO: profile logged ${Math.floor(months)} month(s) ago; next review due after ${profile.meta.staleAfterMonths}.`);
    }
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);   // the page booted above leaves timers running
