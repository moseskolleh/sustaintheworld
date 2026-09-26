// Tests for The Assay, the paste-a-job-ad fit check in the contact section.
//
// It used to count keyword hits and call three a "High-grade match". An ad
// asking for fluent Dutch, five years at a Big Four firm and SAP got top
// marks with no gaps, because nothing looked for what the site cannot show.
// These tests hold the honest version in place: the reported ad is graded
// down with every gap listed, ads that do fit still grade well with evidence
// that links somewhere real, a scrap of text is not graded at all, and — the
// rule the whole site runs on — no gap line states a fact about Moses that
// content/ does not hold.
//
// Run with: node tests/assay.test.js

const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness.js');
const content = require('../scripts/lib/content.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const profileRaw = fs.readFileSync(path.join(ROOT, 'content', 'profile.json'), 'utf8');
const profile = JSON.parse(profileRaw);
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// A fixed "today", so the open-ended role counts the same months every run.
const NOW = new Date(2026, 8, 26);

// Counts the network: the Assay promises that the ad never leaves the page.
let requests = 0;
const { window, errors } = run('dark', {
    before: (w) => {
        const count = () => { requests++; return Promise.reject(new Error('no network in tests')); };
        w.fetch = count;
        w.navigator.sendBeacon = () => { requests++; return true; };
        w.XMLHttpRequest = function () { requests++; this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; };
    }
});
const doc = window.document;
const A = window.mksAssay;
assert(!!A && typeof A.analyse === 'function', 'Setup: the Assay exposes its analysis as window.mksAssay.analyse');
assert(errors.length === 0, `Setup: the page boots without errors (${errors.map(String).join('; ') || 'none'})`);
const analyse = (text, opts) => A.analyse(text, Object.assign({ now: NOW }, opts));

// The ads, as a recruiter would paste them.
const ADS = {
    dutch: [
        'Senior ESG Reporting Consultant — Amsterdam',
        'Join our sustainability practice and help clients prepare for CSRD and ESRS reporting.',
        'What you bring:',
        '- Fluent Dutch and English, written and spoken',
        '- 5+ years of experience at a Big Four firm',
        '- Hands-on experience with SAP Sustainability Control Tower',
        '- Strong knowledge of GHG accounting and double materiality assessments',
        '- Experience engaging stakeholders at board level'
    ].join('\n'),
    ai: [
        'Researcher, Sustainable AI',
        'Our university research group studies the environmental footprint of generative AI.',
        'You will:',
        '- Estimate the energy, water and carbon footprint of large language model (LLM) use',
        '- Develop an AI governance framework aligned with CSRD and ESRS disclosure',
        '- Build decision-support prototypes and test them with users in workshops',
        '- Publish research on responsible AI and Scope 2 and Scope 3 emissions',
        'You have:',
        '- An MSc in environmental science, data science or a related field',
        '- Experience with Python and data analysis',
        '- Strong stakeholder engagement and facilitation skills'
    ].join('\n'),
    wash: [
        'WASH Programme Officer — Sierra Leone',
        'Lead our rural water supply programme.',
        'Responsibilities:',
        '- Manage borehole drilling and the rehabilitation of hand-dug wells',
        '- Run hydrogeology surveys, including electrical resistivity, to site boreholes',
        '- Produce GIS maps of groundwater potential in QGIS',
        '- Coordinate with communities and district stakeholders',
        'Requirements:',
        '- Degree in geology, hydrogeology or water resources',
        '- At least one year of field experience in WASH'
    ].join('\n'),
    // Every rule at least once, for the "no invented facts" sweep below.
    everything: [
        'Head of ESG — Director level. Minimum of 7 years of relevant experience.',
        'Native German speaker, business-level French, B2 Spanish.',
        'Experience with Workiva, Enablon and Salesforce Net Zero Cloud.',
        'Background in management consulting; Deloitte or KPMG alumni welcome.',
        'Financial modelling and valuation skills. PhD in economics required. Law degree an advantage.',
        'You must hold the right to work in the EU; no visa sponsorship. Security clearance and a driving licence required. Willing to relocate.',
        'CSRD, GHG accounting, climate risk and stakeholder engagement.'
    ].join('\n')
};

// ===================================================================
// The ad that was reported
// ===================================================================
{
    const a = analyse(ADS.dutch);
    assert(a.status === 'graded', 'Dutch/Big Four/SAP ad: it is long enough to grade');
    assert(a.grade !== 'High-grade match' && a.cls !== 'high', `Dutch/Big Four/SAP ad: not the top grade (got "${a.grade}")`);
    const labels = a.hard.map(g => g.label).join(' | ');
    assert(/^Dutch\b/.test(labels) || / \| Dutch\b/.test(labels), `Dutch/Big Four/SAP ad: fluent Dutch is a hard gap (${labels})`);
    assert(/5\+ years/.test(labels), `Dutch/Big Four/SAP ad: 5+ years is a hard gap (${labels})`);
    assert(/Big Four/.test(labels), `Dutch/Big Four/SAP ad: Big Four experience is a hard gap (${labels})`);
    assert(/\bSAP\b/.test(labels), `Dutch/Big Four/SAP ad: SAP is a hard gap (${labels})`);
    assert(a.matched.length >= 3, `Dutch/Big Four/SAP ad: the real overlap is still credited (${a.matched.length} areas)`);

    const dutch = a.hard.find(g => /^Dutch/.test(g.label));
    assert(dutch && /not evidenced on this site/i.test(dutch.text) && /ask Moses/i.test(dutch.text),
        `Dutch/Big Four/SAP ad: the language gap says it is not evidenced and to ask (${dutch && dutch.text})`);

    // The same ad squeezed onto one line is too short to grade honestly.
    const short = analyse('Fluent Dutch · 5+ years Big Four · SAP');
    assert(short.status === 'short', `One-line version: asks for more text rather than grading (${short.status})`);
}

// ===================================================================
// Ads that do fit still grade well, with evidence that links somewhere
// ===================================================================
const idsIn = (html) => new Set((html.match(/\sid="([^"]+)"/g) || []).map(m => m.slice(5, -1)));
const pageIds = { 'index.html': idsIn(indexHtml) };
function resolves(href) {
    const [file, hash] = href.startsWith('#') ? ['index.html', href.slice(1)] : href.split('#');
    if (!fs.existsSync(path.join(ROOT, file))) return false;
    if (!hash) return true;
    if (!pageIds[file]) pageIds[file] = idsIn(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    return pageIds[file].has(hash);
}

[['ai', 'sustainable-AI research ad', /Sustainable AI/], ['wash', 'WASH / water-resources ad', /Water resources/]].forEach(([key, name, area]) => {
    const a = analyse(ADS[key]);
    assert(a.cls === 'high', `${name}: a High-grade match (got "${a.grade}": ${a.blurb})`);
    assert(a.hard.length === 0, `${name}: no hard gaps (${a.hard.map(g => g.label).join(', ') || 'none'})`);
    assert(a.matched.some(m => area.test(m.label)), `${name}: the defining area is matched`);
    const ev = a.matched.concat(a.met).reduce((all, m) => all.concat(m.ev), []);
    const linked = ev.filter(e => e.href);
    assert(linked.length >= a.matched.length, `${name}: evidence links to where it is shown (${linked.length} links)`);
    const broken = linked.filter(e => !resolves(e.href)).map(e => e.href);
    assert(broken.length === 0, `${name}: every evidence link resolves to a real page and id (${broken.join(', ') || 'all do'})`);
});
{
    const a = analyse(ADS.wash);
    const qgis = a.met.find(m => m.label === 'QGIS');
    assert(qgis && qgis.ev.length === 1 && resolves(qgis.ev[0].href),
        `WASH ad: QGIS is matched to where the page shows it (${qgis && qgis.ev[0].t})`);
    const years = a.met.find(m => /year of experience/.test(m.label));
    assert(years && years.ev[0].href === '#experience', `WASH ad: "at least one year" is met, pointing at the experience section (${years && years.ev[0].t})`);
}

// ===================================================================
// Too little text is not graded
// ===================================================================
{
    assert(analyse('ESG analyst, CSRD, Python').status === 'short', 'A tiny ad asks for more text');
    assert(analyse('   ').status === 'empty', 'An empty box asks for a job description');

    const input = doc.getElementById('assayInput');
    const result = doc.getElementById('assayResult');
    input.value = 'ESG analyst, CSRD, Python';
    doc.getElementById('assayRun').click();
    assert(!result.hidden && !result.querySelector('.assay-grade') && /too few to grade/.test(result.textContent),
        `Page: a tiny ad shows "too few to grade", no grade (${result.textContent.trim().slice(0, 60)})`);
}

// ===================================================================
// Nice-to-haves are listed but do not cap the grade
// ===================================================================
{
    const a = analyse(ADS.ai + '\nNice to have:\n- Experience with Workiva\n- Dutch is a plus');
    const soft = a.gaps.filter(g => !g.hard).map(g => g.label);
    assert(soft.includes('Workiva') && soft.includes('Dutch'), `Soft gaps: listed (${soft.join(', ')})`);
    assert(a.cls === 'high', `Soft gaps: do not cap the grade (got "${a.grade}")`);

    const inline = analyse(ADS.ai + '\nRequired: SAP');
    assert(inline.hard.some(g => g.label === 'SAP'), '"Required: SAP" is a requirement, not a heading to skip');

    const capped = analyse(ADS.ai + '\n- Workiva experience required');
    assert(capped.cls !== 'high' && capped.hard.some(g => g.label === 'Workiva'),
        `A hard gap caps the grade, however strong the rest (got "${capped.grade}")`);
}

// ===================================================================
// Right to work and the like: never guessed, always "confirm"
// ===================================================================
{
    const a = analyse(ADS.everything);
    ['Right to work', 'Visa sponsorship', 'Security clearance', 'Driving licence', 'Relocation'].forEach((label) => {
        assert(a.confirm.includes(label), `Confirm: "${label}" is listed to confirm with Moses`);
    });
    assert(/Still to confirm/.test(a.blurb), 'Confirm: the summary says what is still to confirm');
}

// ===================================================================
// Words that look like requirements but are not
// ===================================================================
{
    const base = ADS.ai + '\n';
    const cases = [
        ['You will advise the Dutch Ministry of Finance on its reporting.', g => /^Dutch/.test(g.label), 'a Dutch ministry is not a Dutch-language requirement'],
        ['Our R&D team builds carbon models.', g => g.label === 'R', '"R&D" is not the R language'],
        ['You excel at explaining numbers to non-specialists.', g => g.label === 'Excel', '"excel at" is not Excel'],
        ['An MSc or PhD in environmental science.', g => g.label === 'A PhD', '"MSc or PhD" does not require a PhD'],
        ['You will report to the Head of Sustainability.', g => /Director/.test(g.label), 'reporting to a head of is not being one'],
        ['As one of the Big Four, we offer a structured career path.', g => /Big Four/.test(g.label), 'an employer describing itself is not a requirement'],
        ['This is a 2-year contract with the option to extend.', g => /year/.test(g.label), 'a contract length is not an experience requirement']
    ];
    cases.forEach(([line, isWrong, why]) => {
        const a = analyse(base + line);
        const wrong = a.gaps.filter(isWrong).map(g => g.label);
        assert(wrong.length === 0, `No false gap: ${why} (${wrong.join(', ') || 'none'})`);
    });
    const yearsOnly = analyse(base + 'At least three years of experience in sustainability research.');
    assert(yearsOnly.hard.some(g => /^3\+ years/.test(g.label)), 'Years: "at least three years" is read as 3+');
    const range = analyse(base + '3-5 years of relevant experience.');
    assert(range.gaps.some(g => /^3\+ years/.test(g.label)), 'Years: "3-5 years" asks for the lower bound');
}

// ===================================================================
// No gap line states a fact about Moses that content/ does not hold
// ===================================================================
{
    // The conservative count, done independently of the module.
    const skip = /\b(?:intern|internship|cohort|accelerator|trainee|volunteer|student)\b/i;
    const m = (ym) => { const [y, mo] = ym.split('-').map(Number); return y * 12 + mo - 1; };
    const current = NOW.getFullYear() * 12 + NOW.getMonth();
    const counted = profile.experience.filter(r => !skip.test(r.title));
    const months = counted.reduce((n, r) => n + ((r.end ? m(r.end) : current) - m(r.start)), 0);

    const sweep = [ADS.dutch, ADS.everything, ADS.ai + '\n- 10+ years of experience'];
    sweep.forEach((ad, i) => {
        const a = analyse(ad);
        const lines = a.gaps.map(g => g.text).concat(a.confirm);
        // Every number in a gap line comes from the ad, from profile.json, or
        // from the month count above.
        const allowed = new Set((ad.match(/\d+/g) || []).concat(profileRaw.match(/\d+/g) || [],
            [String(Math.floor(months / 12)), String(months % 12), String(months)]));
        const invented = [];
        lines.forEach(t => (t.match(/\d+/g) || []).forEach(n => { if (!allowed.has(n)) invented.push(`${n} in "${t.slice(0, 50)}"`); }));
        assert(invented.length === 0, `Facts sweep ${i + 1}: no number in a gap line that content/ or the ad does not hold (${invented.join('; ') || 'none'})`);

        // Nothing asserts an ability or a lack of one: gaps say what the
        // site does not show, and send the reader to Moses.
        const asserting = lines.filter(t => /\b(?:speaks|has used|hasn't used|hasn’t used|never used|is fluent|cannot|can't|is not a|holds a)\b/i.test(t));
        assert(asserting.length === 0, `Facts sweep ${i + 1}: no gap line asserts what Moses can or cannot do (${asserting.join(' / ') || 'none'})`);
        const unsourced = a.gaps.filter(g => !/(ask|confirm with) Moses/i.test(g.text));
        assert(unsourced.length === 0, `Facts sweep ${i + 1}: every gap sends the reader to Moses (${unsourced.map(g => g.label).join(', ') || 'all do'})`);

        // Role titles and dates named in a years gap are profile.json's own.
        a.gaps.filter(g => /years? of experience/.test(g.label)).forEach((g) => {
            profile.experience.forEach((r) => {
                assert(g.text.includes(r.title), `Facts sweep ${i + 1}: the years gap names "${r.title}" from profile.json`);
            });
            counted.forEach((r) => {
                assert(g.text.includes(r.displayDates), `Facts sweep ${i + 1}: the years gap gives ${r.title}'s dates as profile.json does (${r.displayDates})`);
            });
            const y = Math.floor(months / 12);
            const said = g.text.match(/about (\d+) years?(?: (\d+) months?)?/i);
            assert(said && Number(said[1]) === y && Number(said[2] || 0) === months % 12,
                `Facts sweep ${i + 1}: the years gap states the count content/ gives (${said && said[0]}, expected ${y} years ${months % 12} months)`);
        });

        // Degrees named in a gap are profile.json's degrees.
        a.gaps.filter(g => /degrees listed/.test(g.text)).forEach((g) => {
            profile.education.forEach((e) => assert(g.text.includes(e.degree), `Facts sweep ${i + 1}: "${g.label}" lists ${e.degree} from profile.json`));
        });

        // With no languages in profile.json, a language gap claims no level.
        if (!profile.languages) {
            a.gaps.filter(g => /^(Dutch|German|French|Spanish)\b/.test(g.label)).forEach((g) => {
                assert(g.text === 'Not evidenced on this site. Ask Moses.', `Facts sweep ${i + 1}: "${g.label}" claims no level Moses has not stated (${g.text})`);
            });
        }
    });

    // The strengths' own evidence lines: every number in them is on the
    // homepage or in content/.
    const everywhere = indexHtml + fs.readdirSync(path.join(ROOT, 'content'))
        .map(f => fs.readFileSync(path.join(ROOT, 'content', f), 'utf8')).join('\n');
    const unsupported = [];
    A.RULES.strengths.forEach(s => s.ev.forEach((e) => {
        (e.t.match(/\d[\d,]*%?/g) || []).forEach((n) => { if (!everywhere.includes(n)) unsupported.push(`${n} (${e.t.slice(0, 40)})`); });
        if (e.href && !resolves(e.href)) unsupported.push(`link ${e.href}`);
    }));
    assert(unsupported.length === 0, `Evidence: every number in a strength's evidence is on the site, every link resolves (${unsupported.join('; ') || 'all'})`);
}

// ===================================================================
// Languages: the optional profile.json field, and its validator
// ===================================================================
{
    const facts = Object.assign({}, A.FACTS, { languages: [{ language: 'Dutch', level: 'B1' }] });
    const fluent = analyse(ADS.dutch, { facts });
    const dutch = fluent.hard.find(g => /^Dutch/.test(g.label));
    assert(dutch && /level listed on this site is B1/.test(dutch.text), `Languages: fluent Dutch against a stated B1 is a gap that quotes the stated level (${dutch && dutch.text})`);

    const basic = analyse(ADS.ai + '\n- Working knowledge of Dutch', { facts });
    const met = basic.met.find(x => /^Dutch/.test(x.label));
    assert(met && basic.gaps.every(g => !/^Dutch/.test(g.label)), 'Languages: a B1 requirement is met by a stated B1');

    const both = analyse(ADS.ai + '\n- Working knowledge of Dutch\n- Fluent Dutch for client meetings', { facts });
    assert(both.met.some(x => x.label === 'Dutch (B1)') && both.hard.some(g => g.label === 'Dutch (C1 / fluent)'),
        'Languages: asked at two levels, the one met is met and the one not is still a gap');

    const several = analyse(ADS.everything).gaps.map(g => g.label);
    assert(several.includes('German (native)') && several.includes('French (B2)') && several.includes('Spanish (B2)'),
        `Languages: each language is read at the level written beside it (${several.filter(l => /German|French|Spanish/.test(l)).join(', ')})`);

    assert(A.FACTS.languages === (profile.languages || null), 'Languages: the module carries what profile.json says (none today)');
    assert(content.checkLanguages(undefined).length === 0 && content.checkLanguages(null).length === 0, 'Validator: languages may be absent');
    assert(content.checkLanguages([{ language: 'Dutch', level: 'C1' }, { language: 'Krio', level: 'native' }]).length === 0, 'Validator: CEFR levels and "native" pass');
    assert(content.checkLanguages([{ language: 'Dutch', level: 'good' }]).length === 1, 'Validator: a level that is not CEFR is rejected');
    assert(content.checkLanguages([{ level: 'B2' }]).length === 1, 'Validator: an entry with no language is rejected');
    assert(content.checkLanguages('Dutch').length === 1, 'Validator: languages must be a list');
}

// ===================================================================
// The generated facts block is profile.json's
// ===================================================================
{
    const titles = A.FACTS.experience.map(r => r.title).join('|');
    assert(titles === profile.experience.map(r => r.title).join('|'), 'Facts: the embedded roles are profile.json\'s, in order');
    assert(A.FACTS.degrees.join('|') === profile.education.map(e => e.degree).join('|'), 'Facts: the embedded degrees are profile.json\'s');
}

// ===================================================================
// The page: gaps render as prominently as matches, and nothing is sent
// ===================================================================
{
    const input = doc.getElementById('assayInput');
    const result = doc.getElementById('assayResult');
    const before = requests;
    input.value = ADS.dutch;
    doc.getElementById('assayRun').click();

    const tag = result.querySelector('.assay-grade-tag');
    assert(tag && tag.textContent !== 'High-grade match', `Page: the reported ad is not graded High-grade (${tag && tag.textContent})`);
    const gapRows = result.querySelectorAll('.assay-gaps .assay-row.assay-row-gap');
    const matchRows = result.querySelectorAll('.assay-matches .assay-row');
    assert(gapRows.length >= 4, `Page: each hard gap is its own row (${gapRows.length})`);
    assert(Array.from(gapRows).every(r => r.querySelector('.assay-req') && r.querySelector('.assay-ev')),
        'Page: a gap row has the same label + evidence structure as a match row');
    const blocks = Array.from(result.querySelectorAll('.assay-map')).map(b => b.classList.contains('assay-gaps') ? 'gaps' : b.classList.contains('assay-matches') ? 'matches' : 'other');
    assert(blocks.indexOf('gaps') > -1 && blocks.indexOf('gaps') < blocks.indexOf('matches'), `Page: hard gaps come before the matches they cap (${blocks.join(' → ')})`);
    assert(matchRows.length > 0 && result.querySelectorAll('.assay-matches a[href]').length > 0, 'Page: matches link to their evidence');
    assert(!result.querySelector('a[href^="mailto:"][data-analytics="assay-contact"]'), 'Page: no "looks like a fit" button under a capped grade');

    result.querySelector('.assay-copy').click();
    assert(requests === before, `Page: grading sent nothing over the network (${requests - before} requests)`);

    // The sample buttons still produce a graded result.
    doc.querySelectorAll('.assay-sample').forEach((b) => {
        b.click();
        const t = result.querySelector('.assay-grade-tag');
        assert(t && /match/.test(t.textContent), `Page: the "${b.textContent.trim()}" sample grades (${t && t.textContent})`);
    });
    assert(requests === before, 'Page: the samples sent nothing either');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);   // the homepage harness leaves timers running
