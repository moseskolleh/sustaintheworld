// Tests for the shorter homepage (plan Phase 2, step 3: "Halve the page").
//
// The page was 15.5 screens at 1440x900 and 22.9 at 390x844 with every
// mechanism of that step in place; the targets are 10 and 18. It came down
// by making sections denser and merging the ones that overlapped, and by one
// rule: no fact leaves the site. Each role, organisation, date, degree,
// certificate, project, field note, number and link is still on the
// homepage, or one click away on a page that carries it in full. This suite
// holds that rule, and the two disclosures it needed:
//
//   - the experience log as short cards at every width, each opened by a
//     More button named for its role;
//   - the Assay under the contact form, its question and promise in view and
//     its box behind one button.
//
// A real browser measures the length and checks the same at 320, 390 and
// 1280/1440px (scripts/smoke.js, exerciseSections and exerciseLength).
//
// Run with: node tests/sections.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { run, ROOT } = require('./harness.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const html = read('index.html');
const css = read('style.css');
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const click = (window, node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
const bare = new JSDOM(html).window.document;   // the page as served: no script has run
const plain = text(bare.body);
const profile = JSON.parse(read('content/profile.json'));

(async () => {
// ===================================================================
// The page's shape: seven sections, numbered in order
// ===================================================================
{
    const ids = Array.from(bare.querySelectorAll('main > section')).map(s => s.id);
    assert(ids.join() === 'journey,about,experience,projects,ecoprompt,skills,contact',
        `Shape: seven sections, Field Notes in About and Education with Skills (${ids.join(', ')})`);
    const numbers = Array.from(bare.querySelectorAll('main > section .section-index')).map(text);
    assert(numbers.join() === '01,02,03,04,05,06,07', `Shape: the section numbers run 01 to 07 with no gap (${numbers.join(', ')})`);
    assert(!bare.querySelector('.cta-band'), 'Shape: the mid-page call-to-action band is gone (Contact is in the nav, a click away all the way down)');
    // Where the band's two actions still are.
    assert(!!bare.querySelector('.nav-menu a[href="#contact"]') && bare.querySelectorAll('a[href$="Moses_Kolleh_Sesay_CV.pdf"][download]').length >= 3,
        'Shape: Contact stays in the nav, and the CV has its links in the nav, the hero and About');
}

// ===================================================================
// Experience: short cards at every width
// ===================================================================
{
    const { window, errors } = run('dark');
    const doc = window.document;
    const cards = Array.from(doc.querySelectorAll('#experience .timeline-content'));
    const buttons = cards.map(c => c.querySelector(':scope > .corelog-more'));

    assert(errors.length === 0, `Experience: the page boots without errors (${errors.map(String).join('; ') || 'none'})`);
    assert(cards.length === profile.experience.length && buttons.every(Boolean), `Experience: every role gets a More button (${buttons.filter(Boolean).length} of ${cards.length})`);
    assert(buttons.every((b, i) => b === cards[i].lastElementChild && b.type === 'button'),
        'Experience: each is a real button (Enter and Space work as they do on any button), after everything it opens');
    assert(buttons.every((b, i) => b.getAttribute('aria-expanded') === 'false' && doc.getElementById(b.getAttribute('aria-controls')) === cards[i].querySelector('ul')),
        'Experience: each says it is closed and names the list it opens');
    assert(buttons.every((b, i) => text(b) === `More about ${text(cards[i].querySelector('h3'))}`),
        `Experience: each is named for its role, not five times "More" (${text(buttons[0])})`);

    const card = cards[0];
    click(window, buttons[0]);
    assert(card.classList.contains('is-open') && buttons[0].getAttribute('aria-expanded') === 'true' && /^Less/.test(text(buttons[0])),
        'Experience: a press opens the card and the button says Less');
    click(window, buttons[0]);
    assert(!card.classList.contains('is-open') && buttons[0].getAttribute('aria-expanded') === 'false' && /^More/.test(text(buttons[0])),
        'Experience: a second press folds it again');

    // Every role keeps its facts in the page: title, organisation and dates
    // from content/profile.json on show, and every line behind More.
    const missing = profile.experience.filter((r, i) => {
        const c = cards[i];
        return !c || !text(c.querySelector('h3')).startsWith(r.title) || !text(c.querySelector('h4')).includes(r.organization.split(' (')[0]) ||
            text(c.querySelector('.timeline-date')) !== r.displayDates;
    }).map(r => r.title);
    assert(missing.length === 0, `Experience: every role shows its title, organisation and dates, in profile.json's order (wrong: ${missing.join('; ') || 'none'})`);
    assert(cards.every(c => c.querySelectorAll('li').length >= 3), 'Experience: every role keeps all its lines in the page');
    assert(bare.querySelectorAll('.corelog-more').length === 0, 'Experience: the markup has no More button; script.js makes them, so without it every card is whole');

    // The folding is at every width now, and only where script.js runs.
    const phone = (css.match(/@media \(max-width: 599px\) \{\s*\.corelog-head,[\s\S]*?\n\}/) || [''])[0];
    const everywhere = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    assert(/html\.js \.timeline-content:not\(\.is-open\) ul li:nth-child\(n\+2\),\s*html\.js \.timeline-content:not\(\.is-open\) \.tags \{\s*display: none;/.test(everywhere),
        'Experience: with html.js, a closed card shows its first line and folds the rest and the tags, at every width');
    assert(/html\.js \.corelog-more \{ display: inline-block; \}/.test(everywhere) && /\.corelog-more \{\s*display: none;/.test(css),
        'Experience: the button shows only with html.js; on a late start there is none, and every card is whole');
    assert(/@media print \{\s*html\.js \.timeline-content:not\(\.is-open\) \{ display: block; \}\s*html\.js \.timeline-content:not\(\.is-open\) ul li:nth-child\(n\+2\) \{ display: list-item; \}/.test(css),
        'Experience: printed, every card is whole');
    assert(/@media \(min-width: 900px\) \{\s*html\.js \.timeline-content:not\(\.is-open\) \{\s*display: grid;/.test(css),
        'Experience: on a desktop a shut card is one row under its dates (who and where, then what), and open it is the whole card');
    assert(/\.corelog-head,\s*\.corelog-depth \{\s*display: none;/.test(phone) && /\.corelog > \.corelog-item \{\s*grid-template-columns: 8px minmax\(0, 1fr\);/.test(phone),
        'Experience: on a phone the depth column gives its width to the text (a desktop keeps the core log\'s depths)');
}

// ===================================================================
// Contact: the form first, the Assay under it, folded behind one button
// ===================================================================
{
    const contact = bare.getElementById('contact');
    const form = bare.getElementById('contactForm');
    const assay = bare.getElementById('assay');
    assert(!!assay && assay.closest('#contact') === contact, 'Contact: the Assay is still in the contact section');
    assert(!!(form.compareDocumentPosition(assay) & bare.defaultView.Node.DOCUMENT_POSITION_FOLLOWING) && !assay.contains(form),
        'Contact: the Assay comes after the contact form');
    const firstField = contact.querySelector('input, textarea, select');
    assert(firstField && firstField.closest('form') === form, `Contact: the first field in the section is the form's (${firstField && firstField.id})`);
    assert(!assay.querySelector('.btn-primary'), 'Contact: the Assay is the secondary step, with no primary button to compete with Send');

    // Served, the Assay is whole: its question and promise, then the box,
    // the samples and the verdict's place, none of them [hidden]. Without
    // JavaScript the stylesheet takes the whole of it away, as it cannot
    // run, and nothing else: the fold waits for the button script.js makes.
    const body = bare.getElementById('assayBody');
    assert(!!body && body.closest('#assay') === assay && !body.hidden && !!body.querySelector('#assayInput') && !!body.querySelector('#assayRun') &&
        body.querySelectorAll('.assay-sample').length === 3 && !!body.querySelector('#assayResult'),
        'Assay: the box, the button that grades, the three samples and the verdict\'s place are in the page, in #assayBody');
    assert(/entirely in your browser/.test(text(assay.querySelector('.assay-head'))) && /the text never leaves this page/.test(text(assay.querySelector('.assay-head'))),
        'Assay: its promise, that the text never leaves the page, is in the part that stays in view');
    assert(/in-browser · the ad is never sent/.test(text(body)), 'Assay: and again beside the button that grades');
    assert(!bare.querySelector('.assay-open'), 'Assay: the markup has no open button; script.js makes it');
    assert(/html:not\(\.js\)[^{]*\.assay,/.test(css) && /html\.js \.assay\.is-folding:not\(\.is-open\) \.assay-body \{ display: none; \}/.test(css),
        'Assay: without JavaScript it is not shown (it cannot run); with it, the box folds only once the button is there');

    const { window, errors } = run('dark');
    const doc = window.document;
    const box = doc.getElementById('assay');
    const btn = box.querySelector('.assay-open');
    assert(errors.length === 0, `Assay: the page boots without errors (${errors.map(String).join('; ') || 'none'})`);
    assert(!!btn && btn.tagName === 'BUTTON' && btn.type === 'button' && btn.previousElementSibling === box.querySelector('.assay-head') &&
        btn.nextElementSibling === doc.getElementById('assayBody'),
        'Assay: script.js puts one real button between the question and the box');
    assert(!!btn && text(btn) === 'Grade a job description' && btn.getAttribute('aria-controls') === 'assayBody' && btn.getAttribute('aria-expanded') === 'false',
        `Assay: it says what it does ("${text(btn)}"), names the box it opens, and says it is shut`);
    assert(box.classList.contains('is-folding') && !box.classList.contains('is-open'), 'Assay: folded on arrival');
    assert(btn && btn.getAttribute('data-analytics') === 'assay-open', 'Assay: opening it is counted, as a feature a reader reached');

    // A press before the module has arrived opens it once: the core's
    // interactives trigger replays presses on the module's buttons, and a
    // replay would have shut it again.
    window.mks.loaded.interactives = false;
    let prevented = null;
    doc.addEventListener('click', (e) => { if (e.target === btn) prevented = e.defaultPrevented; });
    click(window, btn);
    await new Promise(r => setTimeout(r, 30));
    assert(box.classList.contains('is-open') && btn.getAttribute('aria-expanded') === 'true' && prevented === false,
        'Assay: a press opens it, at once and for good, even before its module has arrived');
    window.mks.loaded.interactives = true;
    click(window, btn);
    assert(!box.classList.contains('is-open') && btn.getAttribute('aria-expanded') === 'false', 'Assay: a second press folds it');

    // "grade your job description" in the play index lands on it open.
    const link = doc.querySelector('.play-index a[href="#assay"]');
    click(window, link);
    await new Promise(r => setTimeout(r, 30));
    assert(!!link && box.classList.contains('is-open') && btn.getAttribute('aria-expanded') === 'true',
        'Assay: the play index\'s "grade your job description" opens it as it lands');
    // Nothing about it moves: the reveal is a display change, so reduced
    // motion and low-energy mode see the same box at once. The chevron's
    // turn is a transition, which the reduced-motion rule already stops.
    const folding = (css.match(/[^{}]*\{[^{}]*\}/g) || []).filter(r => /assay-body|\.assay\.is-(open|folding)/.test(r.split('{')[0]));
    assert(folding.length >= 2 && folding.every(r => !/transition|animation/.test(r.split('{')[1])) && /html\.js \.assay\.is-folding:not\(\.is-open\) \.assay-body \{ display: none; \}/.test(css),
        `Assay: opening it is a display change, with nothing to wait for or animate but its chevron (${folding.length} rules)`);
}

// ===================================================================
// About: what the chips and fact cards said is said elsewhere, once
// ===================================================================
{
    const about = bare.getElementById('about');
    assert(!about.querySelector('.about-chips, .chip, .about-facts, .fact-card'), 'About: the six chips and four fact cards are gone');
    const said = [
        ['projects across Africa, Europe and Asia', () => Array.from(bare.querySelectorAll('.hero-stat')).some(s => /^3 Continents/.test(text(s))) &&
            ['Freetown, Sierra Leone', 'Changsha, China', 'Bonn, Germany'].every(s => text(bare.getElementById('journey')).includes(s)),
            'the hero\'s "3 continents" and the journey\'s stops in Sierra Leone, China and Germany'],
        ['164 water points across Sierra Leone', () => /164 water points/.test(text(about.querySelector('.about-text p:nth-of-type(2)'))), 'About\'s own paragraph'],
        ['Python, SQL, GIS & ML', () => ['Python', 'SQL', 'QGIS & ArcGIS', 'Machine Learning'].every(t => Array.from(bare.querySelectorAll('#skills .toolkit-name')).some(n => text(n).startsWith(t))), 'the toolkit, each with its proof'],
        ['ESG Specialist Program, Corporate Finance Institute (2024)', () => /^ESG Specialist Program Corporate Finance Institute · Sep 2024/.test(text(bare.querySelector('#education .certification'))), 'the certificates'],
        ['the six chips', () => ['ESG Analysis & Integration', 'GHG Accounting (Scope 1–3)', 'Life Cycle Assessment', 'Climate Risk Assessment', 'Water Resource Management'].every(s => text(bare.querySelector('.skills-checklist')).includes(s)) &&
            ['IFRS S1&S2', 'SASB', 'GRI', 'CSRD'].every(s => text(bare.querySelector('.frameworks-list')).includes(s)), 'Skills\' two lists']
    ];
    said.forEach(([what, where, name]) => assert(where(), `About: "${what}" is still on the page, in ${name}`));

    // The 164, itemised under the paragraph that claims it.
    const bar = about.querySelector('.about-text .impact-bar');
    assert(!!bar && about.querySelectorAll('.impact-seg').length === 3 && /100 hand-dug wells rehabilitated, 50 boreholes constructed, 14 solar-powered boreholes/.test(bar.getAttribute('aria-label')) &&
        /164 water points delivered in Sierra Leone, itemised/.test(text(about)),
        'About: the 164 water points are itemised there (100 + 50 + 14), under the paragraph that claims them');

    // The field notes live in About now: all three, whole, each a press away.
    const notes = bare.getElementById('notes');
    const each = notes ? Array.from(notes.querySelectorAll('details.fieldnote')) : [];
    assert(!!notes && notes.closest('#about') === about && each.length === 3, `Notes: the three Field Notes are in About (${each.length})`);
    assert(each.every(d => !d.open && d.querySelector('summary h3') && d.querySelector('.fieldnote-tag') && d.querySelectorAll('.fieldnote-body p').length === 2),
        'Notes: each is its tag and title until opened (a <details>: keyboard and no-JS for free), with both its paragraphs inside');
    assert(/short dispatches from the intersection of mud, models and megawatts/i.test(text(notes)), 'Notes: their one line of introduction came with them');
    const pointer = notes.querySelector('a[href="#ecoprompt"]');
    assert(!!pointer && /further down/.test(text(pointer.parentElement)) && !/widget above/.test(text(notes)),
        'Notes: the third points down the page to the chart it means (it said "the widget above", which it no longer is)');
}

// ===================================================================
// Projects: what left the cards is on the case studies
// ===================================================================
{
    const projects = JSON.parse(read('content/projects.json'));
    const cs = new JSDOM(read('case-studies.html')).window.document;
    const cards = Array.from(bare.querySelectorAll('#projects .project-card'));
    assert(cards.length === 6 && cards.every(c => !c.querySelector('.project-sub')), 'Projects: the cards drop their subtitles');
    const kept = projects.caseStudies.filter(c => text(cs.querySelector(`#${c.id} .cs-card-sub`)) === c.subtitle.replace(/\s+/g, ' ').trim()).length;
    assert(kept === projects.caseStudies.length, `Projects: every subtitle is on its case study, one click away (${kept} of ${projects.caseStudies.length})`);
    assert(cards.every(c => c.querySelector('.project-tags > .project-lenses') && c.querySelector('.project-tags > .project-tech span')),
        'Projects: each card keeps its lenses and its tools (the Assay reads them), on one run of small type');
    const intro = bare.querySelector('#projects .section-description');
    assert(!!intro && intro.querySelectorAll('a[href^="case-studies.html"]').length === 4 && !bare.querySelector('#projects .section-header > p:nth-of-type(2)'),
        'Projects: one line of introduction, still with the case studies and the three lenses');
}

// ===================================================================
// Skills & Education: one section, every fact kept
// ===================================================================
{
    const skills = bare.getElementById('skills');
    const skillText = text(skills);
    const education = bare.getElementById('education');
    assert(!!education && education.closest('#skills') === skills && education.tagName !== 'SECTION',
        'Skills & Education: one section; #education is a part of it, still an address for the Assay\'s links');
    assert(/Skills & Education/.test(text(skills.querySelector('.section-title'))), 'Skills & Education: the heading says both');

    const expertise = ['ESG Analysis & Integration', 'GHG Accounting (Scope 1–3)', 'Life Cycle Assessment', 'Climate Risk Assessment',
        'Water Resource Management', 'Disaster Risk Reduction', 'Carbon Markets', 'Circular Economy'];
    const frameworks = ['SBTi', 'CDP', 'GHG Protocol', 'TCFD', 'TNFD', 'ISO 14000', 'IFRS S1&S2', 'SASB', 'GRI', 'CSRD'];
    const listed = (sel) => Array.from(skills.querySelectorAll(sel)).map(text);
    assert(JSON.stringify(listed('.skills-checklist li')) === JSON.stringify(expertise), `Skills: all eight areas of expertise are listed (${listed('.skills-checklist li').length})`);
    assert(JSON.stringify(listed('.frameworks-list li')) === JSON.stringify(frameworks), `Skills: all ten frameworks are listed (${listed('.frameworks-list li').length})`);
    assert(skills.querySelectorAll('.toolkit-item .toolkit-proof').length === 6, 'Skills: the six tools keep their proof links');

    // What left Skills was said elsewhere on the page too, and still is.
    [['70%', /70% aquifer/], ['10,226 sub-basins', /10,226 sub-basins/], ['54 hazard information systems', /54 global hazard information systems/], ['a team of 23', /team of 23/]]
        .forEach(([what, re]) => {
            const outside = Array.from(bare.querySelectorAll('main > section')).filter(s => s.id !== 'skills' && re.test(text(s))).map(s => s.id);
            assert(outside.length > 0 && !re.test(skillText), `Skills: ${what} is not repeated here, and is still in ${outside.join(', ')}`);
        });

    // The Assay reads a named tool's evidence from the page, these lists and
    // the certificates' lines included, so it has to know where they are.
    const { window } = run('dark', { before: (w) => { w.console.log = () => {}; } });
    const A = window.mks.assay;
    const now = new Date(2026, 8, 27);
    const found = (a, label) => (a.met || []).concat(a.matched || []).find(m => m.label === label);
    const lca = found(A.analyse('Sustainability Analyst. You will run a life cycle assessment of our products, build the GHG inventory, assess climate risk and report to stakeholders across the business.', { now }), 'Life Cycle Assessment');
    assert(!!lca && lca.ev[0].t === 'Listed under Skills & Expertise' && lca.ev[0].href === '#skills',
        `Skills: the Assay finds Life Cycle Assessment in the expertise list (${lca ? lca.ev[0].t : 'not found'})`);
    const alone = new JSDOM(`<main>${education.outerHTML}</main>`).window.document;
    const excel = found(A.analyse('Sustainability Data Analyst. You will build dashboards in Excel from our emissions data, run statistical analysis, and report to stakeholders on climate risk every quarter.', { now, doc: alone }), 'Excel');
    assert(!!excel && /^Covered in Data Analytics Training: SQL, Python, Excel, Tableau/.test(excel.ev[0].t),
        `Education: the Assay reads a certificate's line, and names the certificate (${excel ? excel.ev[0].t : 'not found'})`);

    // Every certificate keeps its name, issuer, date and what it covered;
    // every degree its dates, institution and every line it had.
    const certs = Array.from(education.querySelectorAll('.education-card.certification'));
    assert(certs.length === profile.certifications.length, `Education: all ${profile.certifications.length} certificates are shown (${certs.length})`);
    profile.certifications.forEach((c) => {
        const card = certs.find(el => text(el.querySelector('.cert-title')) === c.name);
        assert(!!card && text(card).includes(c.issuer) && text(card).includes(c.displayDate) && text(card.querySelector('.cert-line')).length > 20,
            `Education: "${c.name}" keeps its issuer, date and one line on what it covered`);
    });
    const degrees = Array.from(education.querySelectorAll('.education-grid > .education-card'));
    assert(degrees.length === profile.education.length, `Education: every degree keeps its own entry (${degrees.length})`);
    profile.education.forEach((e) => {
        const d = degrees.find(el => text(el.querySelector('h3')) === e.degree);
        assert(!!d && text(d.querySelector('.education-top')) === e.displayDates && text(d.querySelector('h4')).startsWith(e.institution.replace(/ & Research$/, '')) &&
            !!d.querySelector('.specialization') && d.querySelectorAll('li').length >= 2,
            `Education: ${e.degree} keeps its dates, institution, distinction and lines`);
    });
    ['Wageningen African Scholarship Programme scholar', 'GPA 7.8/10 (Dutch scale)', 'Full Chinese Government MOFCOM Scholarship',
        'First Class Honours — graduated top of class', 'Human-Environment Interaction · Water Systems & Global Change',
        'Thesis: socioeconomic drivers of river export of pollutants worldwide', 'Thesis: soft path water management — Freetown case study',
        'Dissertation: groundwater potential mapping, geophysical approach', 'Project management, operations research, systems analysis',
        'Hydrogeology, geophysics, environmental geology']
        .forEach(line => assert(plain.includes(line), `Education: "${line}" is still on the page`));
}

// ===================================================================
// The narration reads what the sections now say
// ===================================================================
{
    const { SCRIPTS } = require('../voice-scripts.js');
    const byId = Object.fromEntries(SCRIPTS.map(s => [s.id, s]));
    assert(!byId.notes && !byId.education, 'Narration: no script for a section that is now part of another');
    assert(/field notes/i.test(byId.about.label) && /what a hundred and sixty-four water points taught me about data/.test(byId.about.text),
        'Narration: About reads its field notes');
    assert(/education/i.test(byId.skills.label) && ['Wageningen', 'Hunan', 'University of Sierra Leone', 'Masterschool', 'U.N. System Staff College']
        .every(s => byId.skills.text.includes(s)), 'Narration: Skills & Education reads the degrees and the certificates');
    assert(/sustainable A\.I\./.test(byId.contact.text) && !/intersection of climate, water or A\.I\./.test(byId.contact.text),
        'Narration: Contact says what the section says: the four fields, and no sentence the page no longer has');
    assert(/Press More on any layer/.test(byId.experience.text) && !/research in Wageningen/.test(byId.experience.text),
        'Narration: the experience log names the layers it has, and the button that opens each');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);   // the site script leaves timers running
})().catch((err) => {
    console.log('FAIL: sections checks threw', err);
    process.exit(1);
});
