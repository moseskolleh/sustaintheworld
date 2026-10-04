// The CV says what the site says, and is no older than what it says.
//
// The CV was a Word export from November 2025. By the next autumn it still
// claimed 10,000+ beneficiaries, a 95% completion rate, a 15% efficiency
// gain and Power BI, all long gone from the site for want of a basis, and
// it was the one page a recruiter would forward. `npm run cv` now prints it
// from content/ and the homepage (scripts/build-cv.js). This reads the
// committed PDF back, with no browser (scripts/lib/pdf-text.js), and fails
// if it is not two A4 pages; if it leaves out the name, the address, the
// current role, any role with its organisation and dates, any degree or
// any certificate; if it carries a claim the site dropped, a name the
// owner has not cleared, or a figure content/ does not have; or if
// assets/cv.hash says it was printed from something other than what
// content/ says today, or is not the PDF it hashed.
//
// Run with: node tests/cv.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const content = require('../scripts/lib/content.js');
const cv = require('../scripts/build-cv.js');
const { pdfText } = require('../scripts/lib/pdf-text.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

(async () => {
    const data = content.loadAll();
    const { profile, projects, research } = data;
    const pdfBuf = fs.readFileSync(path.join(ROOT, profile.links.cv));
    const pdf = pdfText(pdfBuf);
    const text = pdf.pages.join('\n');
    // Compared with whitespace squashed: a line may break anywhere, and the
    // PDF has no spaces where the layout put a gap.
    const squash = (s) => String(s).replace(/\s+/g, '');
    const flat = squash(text);
    const has = (s) => flat.includes(squash(s));
    const bare = (url) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

    // --- The reader itself -------------------------------------------------
    // Every check below leans on it, so it has to find words where there
    // are words, and nothing where there are none.
    assert(text.length > 3000 && /[a-z]{4} [a-z]{4}/.test(text), `Reader: the PDF's text comes back as words (${text.length} characters)`);
    assert(!/�|\u0000/.test(text), 'Reader: no character comes back unmapped');
    // A field one entry leaves out (GAIA has no location) prints as nothing,
    // not as the word a template makes of it.
    assert(!/\b(?:undefined|null|NaN)\b/.test(text), `Reader: no field missing from content/ is printed as "undefined" (${(text.match(/.{0,40}\b(?:undefined|null|NaN)\b/) || ['none'])[0]})`);

    // --- Shape -----------------------------------------------------------
    assert(pdf.pages.length === cv.PAGES, `Shape: the CV is ${cv.PAGES} pages (${pdf.pages.length})`);
    assert(pdf.sizes.length && pdf.sizes.every(([, , w, h]) => Math.abs(w - 595) < 2 && Math.abs(h - 842) < 2),
        `Shape: every page is A4 (${pdf.sizes.map(s => s.slice(2).map(Math.round).join('x')).join(', ')})`);
    assert(pdf.info.Title === `${profile.person.name} — CV`, `Shape: the document's title names him (${pdf.info.Title})`);
    assert(/Skia\/PDF/.test(pdf.info.Producer || ''), `Shape: printed by Chromium, not exported by hand (${pdf.info.Producer})`);
    // Variable fonts go into a PDF as Type 3 outlines, which some
    // applicant-tracking systems cannot read; build-cv.js instances them.
    const raw = pdfBuf.toString('latin1');
    assert(!/\/Subtype\s*\/Type3/.test(raw) && /\/Subtype\s*\/CIDFontType2/.test(raw), 'Shape: every font is embedded as TrueType, none as Type 3 outlines');

    // --- The skills, in reading order ----------------------------------------
    // Floated, the tool names went into the PDF before the rest of page 2:
    // a parser met eight names at the top of the page, then the projects
    // running on from page 1, and the proofs eighty lines later under
    // SKILLS. Each name is read under the heading, straight before its proof.
    {
        const model = cv.cvModel(data, fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
        const heading = flat.indexOf('SKILLS');
        const astray = model.skills.toolkit.filter((t) => {
            const at = flat.indexOf(squash(`${t.name}${t.sub ? `${t.sub} — ` : ''}proof:`));
            return heading < 0 || at < heading;
        }).map(t => t.name);
        assert(heading > -1 && astray.length === 0, `Reading order: each tool is read under SKILLS, beside its proof (${astray.join(', ') || `all ${model.skills.toolkit.length}`})`);
    }

    // --- The profile, all of it -----------------------------------------
    {
        const missing = [];
        const need = (what, s) => { if (!has(s)) missing.push(`${what} "${s}"`); };
        need('name', profile.person.name);
        need('title', profile.person.jobTitle);
        need('email', profile.person.email);
        // The homepage's contact card publishes a phone number; the CV, which
        // says what the site says, carries it too (owner checklist D1).
        if (profile.person.phone) need('phone', profile.person.phone);
        need('site', bare(profile.links.site));
        need('LinkedIn', bare(profile.links.linkedin));
        need('GitHub', bare(profile.links.github));
        need('location', `${profile.person.locality}, ${profile.person.country}`);
        need('current role', profile.currentRole.title);
        need('current employer', profile.currentRole.organization);
        need('current dates', profile.currentRole.displayDates);
        profile.experience.forEach((r) => {
            need('role', r.title);
            need('organisation', r.organization);
            need(`dates of ${r.title}`, r.displayDates);
            // The role, its employer and its dates, together: the next role
            // begins after this one's dates.
            const at = flat.indexOf(squash(r.title));
            const block = flat.slice(at, at + 400);
            if (at < 0 || !block.includes(squash(r.organization)) || !block.includes(squash(r.displayDates))) missing.push(`"${r.title}" with its organisation and dates`);
        });
        profile.education.forEach((e) => { need('degree', e.degree); need('institution', e.institution); need(`dates of ${e.degree}`, e.displayDates); });
        profile.education.filter(e => e.grade).forEach(e => need('grade', e.grade));
        profile.certifications.forEach((c) => {
            need('certificate', c.name);
            need('issuer', c.issuer);
            need(`date of ${c.name}`, c.displayDate);
            need(`what ${c.name} covered`, c.covered);
            if (c.verifyUrl) need(`verification of ${c.name}`, `Verify: ${bare(c.verifyUrl)}`);
        });
        assert(missing.length === 0, `Profile: the CV carries every fact profile.json holds that a CV needs (missing: ${missing.join('; ') || 'none'})`);
        const verifiable = profile.certifications.filter(c => c.verifyUrl).length;
        assert((text.match(/Verify:/g) || []).length === verifiable, `Profile: a certificate links its verification exactly when profile.json has one (${verifiable})`);
    }

    // --- The evidence: case studies and public work ---------------------
    {
        const missing = [];
        projects.caseStudies.forEach((cs) => {
            if (!has(cs.title)) missing.push(`case study "${cs.title}"`);
            if (!has(cs.results[0].claim)) missing.push(`its result "${cs.results[0].claim}"`);
        });
        research.outputs.filter(o => o.status === 'public').forEach((o) => { if (!has(o.title)) missing.push(`public work "${o.title}"`); });
        assert(missing.length === 0, `Evidence: every case study's headline result and every public output is on the CV (missing: ${missing.join('; ') || 'none'})`);
        const labels = (text.match(/(?:NOT )?CHECKABLE FROM OUTSIDE/gi) || []).length;
        assert(labels === projects.caseStudies.length, `Evidence: each result says whether a reader can check it, as the homepage cards do (${labels} of ${projects.caseStudies.length})`);
    }

    // --- Nothing the site does not say -----------------------------------
    {
        const FORBIDDEN = [
            { re: /10,000\+|ten thousand/i, why: 'no count of people reached exists in content/' },
            { re: /project completion|completion rate/i, why: 'a completion rate with no method behind it' },
            { re: /15% efficiency|efficiency by 15%/i, why: 'an efficiency gain with no baseline' },
            { re: /Power BI/i, why: 'not shown on the homepage, for want of evidence' },
            { re: /\d\+ years/i, why: 'years of experience is not a figure the site states' },
            { re: /certified across|highly sought|mastered/i, why: 'wording the site dropped' },
            { re: /advised the (?:UN|United Nations)/i, why: 'the UN role was an internship' },
            { re: /Ministry of Finance|Ministerie/i, why: 'naming the partner on the CV waits on the owner (consent)' },
            { re: /Dr\.? Timbo|\bACF\b|Living Water International|WiNGiN|Matthijs|\bJop\b|Rezaei/i, why: 'a client or partner named in the repositories, not cleared' }
        ];
        const found = FORBIDDEN.map(({ re, why }) => { const m = text.match(re); return m ? `"${m[0]}" (${why})` : null; }).filter(Boolean);
        assert(found.length === 0, `Claims: nothing the site dropped or has not cleared is on the CV (${found.join('; ') || 'none'})`);
    }

    // --- Every figure has a basis in content/ ------------------------------
    // A numeral on the CV must be one content/ has: a date, a record fact on
    // a profile entry (a team's size, a programme's length, a grade), or a
    // case-study result, each of which carries its basis. Numbers that are
    // part of a name (Scope 1–3, ISO 14000, SDG 12, Cohort 7, S1&S2) are
    // names, not figures; "7 times out of 10" is the 70% it restates.
    {
        const NAMES = /Scope [123](?:[–-][123])?|ISO \d+|IFRS S1&S2|SDG \d+|Cohort \d+|MKS-\d+/g;
        const numerals = (s) => (String(s).replace(NAMES, ' ').replace(/\b(\d+) times out of (\d+)\b/g, (m, a, b) => `${Math.round(100 * a / b)}%`)
            .match(/\d[\d,.]*\d|\d/g) || []).map(n => n.replace(/,/g, '').replace(/\.$/, '').replace(/^0+(?=\d)/, ''));
        const known = new Set();
        const take = (v) => {
            if (typeof v === 'string' || typeof v === 'number') numerals(v).forEach(n => known.add(n));
            else if (Array.isArray(v)) v.forEach(take);
            else if (v && typeof v === 'object') Object.entries(v).filter(([k]) => !k.startsWith('$') && k !== 'pages').forEach(([, x]) => take(x));
        };
        take(profile);
        projects.caseStudies.forEach((cs) => { take(cs.period); take(cs.title); cs.results.forEach(take); });
        research.outputs.forEach((o) => { take(o.year); take(o.title); });
        const unknown = [...new Set(numerals(text))].filter(n => !known.has(n));
        assert(unknown.length === 0, `Figures: every number on the CV is one content/ has, with its basis (unknown: ${unknown.join(', ') || 'none'})`);
    }

    // --- Printed from content/ as it is now ------------------------------
    {
        const hash = cv.readHashFile();
        const model = cv.cvModel(data, read('index.html'));
        assert(!!hash.source && hash.source === cv.sourceHash(model),
            'Fresh: the CV was printed from content/ and the homepage as they are now (if not: npm run cv, and commit the PDF and assets/cv.hash)');
        assert(!!hash.pdf && hash.pdf === cv.fileHash(pdfBuf), 'Fresh: the committed PDF is the one npm run cv printed, not one replaced by hand');
        const changed = JSON.parse(JSON.stringify(model));
        changed.experience[0].when = 'Sept 2025 — Dec 2026';
        assert(cv.sourceHash(changed) !== cv.sourceHash(model), 'Fresh: a changed date changes the hash');
    }

    // --- The template and the model ---------------------------------------
    {
        const model = cv.cvModel(data, read('index.html'));
        const html = cv.renderCv(model);
        const doc = new JSDOM(html).window.document;

        // The template's own words are headings: every fact is in a slot.
        const template = read('scripts/cv.html').replace(/<style>[\s\S]*?<\/style>/, '').replace(/<!--[\s\S]*?-->/g, '');
        const own = new JSDOM(template).window.document.body.textContent.replace(/\s+/g, ' ').trim();
        assert(own === 'Profile Experience Selected projects Education Certificates Public work Skills',
            `Template: scripts/cv.html says nothing but its headings (${own})`);
        assert(!/<(?:link|script|img|iframe)\b/i.test(html) && !/url\((?!data:)/.test(html), 'Template: the CV fetches nothing: no stylesheet, script or image, and fonts only inline');
        assert(doc.querySelectorAll('h2').length === 7 && !/CV:[A-Z]+/.test(html.replace(/\/\* CV:FONTS \*\//, '')), 'Template: every slot is filled');

        // The roles come in profile order, each with its homepage lines.
        const titles = Array.from(doc.querySelectorAll('section'))[1].querySelectorAll('.entry-title');
        assert(Array.from(titles).map(t => t.textContent).join('|') === profile.experience.map(r => r.title).join('|'), 'Model: the roles are profile.json\'s, in its order');
        assert(model.experience.every(r => r.lines.length >= 2), 'Model: each role carries its lines from the homepage card');
        assert(model.profile.length === 2 && model.skills.toolkit.length >= 6 && model.skills.toolkit.every(t => t.name && t.proof),
            'Model: the profile is the hero\'s two sentences, and every tool comes with its proof');
        assert(!JSON.stringify(model).includes(profile.currentRole.partner), 'Model: the partner is not named (owner checklist: consent)');
        // The CV copies the homepage's words into its own order, Skills last,
        // after the certificates: a proof that says where to look on the
        // homepage ("certificate, below") points the wrong way on paper.
        const pointing = model.skills.toolkit.filter(t => /\b(?:below|above)\b/i.test(t.proof)).map(t => `${t.name}: "${t.proof}"`);
        assert(pointing.length === 0, `Model: no toolkit proof points up or down the page, which the CV orders differently (${pointing.join('; ') || 'none does'})`);

        // A role the homepage has no card for stops the build, rather than
        // printing a role with nothing under it.
        const missing = JSON.parse(JSON.stringify(data));
        missing.profile.experience[1] = Object.assign({}, missing.profile.experience[1], { title: 'A role nobody wrote up' });
        let threw = '';
        try { cv.cvModel(missing, read('index.html')); } catch (e) { threw = e.message; }
        assert(/no experience card titled "A role nobody wrote up"/.test(threw), `Model: a role with no homepage card is refused (${threw || 'accepted'})`);

        // At-a-glance facts: none is printed while it is null; filled in, it is.
        assert(model.facts.length === ['seniority', 'availableFrom', 'rightToWork'].filter(k => profile.atAGlance[k]).length + (profile.languages ? 1 : 0),
            `Model: only the at-a-glance facts Moses has stated are printed (${model.facts.join('; ') || 'none'})`);
        const filled = JSON.parse(JSON.stringify(data));
        Object.assign(filled.profile.atAGlance, { seniority: 'Mid-level', availableFrom: '2026-11', rightToWork: 'EU, no sponsorship needed' });
        filled.profile.languages = [{ language: 'English', level: 'C2' }];
        const f = cv.cvModel(filled, read('index.html')).facts;
        assert(f.join(' | ') === 'Seniority: Mid-level | Available: November 2026 | Languages: English (C2) | Right to work: EU, no sponsorship needed',
            `Model: stated facts are printed in the homepage strip's order (${f.join(' | ')})`);

        // A certificate's verification, once there is one, is a link.
        const verified = JSON.parse(JSON.stringify(data));
        verified.profile.certifications[1].verifyUrl = 'https://www.coursera.org/account/accomplishments/professional-cert/EXAMPLE';
        const v = new JSDOM(cv.renderCv(cv.cvModel(verified, read('index.html')))).window.document;
        const a = Array.from(v.querySelectorAll('a')).filter(x => /^Verify/.test(x.textContent));
        assert(a.length === 1 && a[0].getAttribute('href') === verified.profile.certifications[1].verifyUrl && /coursera\.org\/account/.test(a[0].textContent),
            'Model: a verifyUrl is printed as a Verify link with its address');
        assert(Array.from(doc.querySelectorAll('a')).every(x => !/^Verify/.test(x.textContent)) || profile.certifications.some(c => c.verifyUrl),
            'Model: no Verify link without a verifyUrl');

        // "Facts last verified 5 August 2026" ended the CV, from the day the
        // record is logged as of, which nobody had confirmed. The CV says
        // the facts were confirmed only once Moses has (meta.confirmedOn),
        // and the validator takes no placeholder and no day still to come.
        const confirmed = /Facts last (?:verified|confirmed)/;
        assert(profile.meta.confirmedOn ? has(`Facts last confirmed`) : !confirmed.test(text),
            `PDF: it claims the facts were confirmed only if Moses has said so (meta.confirmedOn ${profile.meta.confirmedOn}; ${(text.match(/Facts last \w+ [^.]*/) || ['no such line'])[0]})`);
        const said = JSON.parse(JSON.stringify(data));
        said.profile.meta.confirmedOn = '2026-09-01';
        assert(/Facts last confirmed 1 September 2026\.$/.test(cv.cvModel(said, read('index.html')).footer) && !confirmed.test(model.footer) === !profile.meta.confirmedOn,
            'Model: once Moses sets meta.confirmedOn, the CV ends "Facts last confirmed" and that day');
        const refused = ['TBC', '2026-02-30', '2999-01-01'].map(d => content.checkMeta({ verifiedOn: profile.meta.verifiedOn, confirmedOn: d }).length > 0);
        assert(refused.every(Boolean) && content.checkMeta({ verifiedOn: profile.meta.verifiedOn }).length > 0,
            'Validator: meta.confirmedOn is null or a real day that has come, and is never left out');
        // A day, not an instant: at 01:30 in Amsterdam on 5 October it is
        // still the 4th in UTC, and Moses setting his own today was told it
        // was still to come. Any day already begun somewhere is taken.
        const clock = Date.now;
        Date.now = () => Date.parse('2026-10-04T23:30:00Z');
        const today = content.checkMeta({ verifiedOn: profile.meta.verifiedOn, confirmedOn: '2026-10-05' });
        const ahead = content.checkMeta({ verifiedOn: profile.meta.verifiedOn, confirmedOn: '2026-10-06' });
        Date.now = clock;
        assert(today.length === 0 && ahead.length === 1, `Validator: meta.confirmedOn may be today in Amsterdam before UTC has reached it, and not a day after (${today.concat(ahead).join('; ')})`);

        // The page is valid HTML, by the rules the site's pages are held to.
        const { HtmlValidate } = require('html-validate');
        const report = await new HtmlValidate(require('../.htmlvalidate.cjs')).validateString(html, 'cv.html');
        const errors = report.results.flatMap(r => r.messages.map(m => `${m.ruleId}: ${m.message}`));
        assert(report.valid, `Template: the CV's HTML passes html-validate (${errors.join('; ') || 'clean'})`);
    }

    // --- Wired up ---------------------------------------------------------
    {
        const pkg = JSON.parse(read('package.json'));
        assert(pkg.scripts.cv === 'node scripts/build-cv.js', 'Wired: npm run cv prints the CV');
        assert(/^assets\/[\w.-]+\.pdf$/.test(profile.links.cv) && fs.existsSync(cv.HASH_FILE), 'Wired: the PDF profile.json names and its hash file are both committed');
    }

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
})().catch((e) => { console.error(e); process.exit(1); });
