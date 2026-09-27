// Tests for the shorter homepage sections (plan Phase 2, step 3).
//
// "AI, Weighed" keeps You Draw It and sends the calculator and Anatomy of a
// Prompt to carbon-ai.html (tests/carbon.test.js holds them there). This
// suite holds the rest of that step: the experience log as short cards on a
// phone, the contact form before the Assay, and Skills and Education
// shortened by their repetition, never by a fact. A real browser checks the
// same at 320, 390 and 1280px (scripts/smoke.js, exerciseSections).
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

// ===================================================================
// Experience: short cards below 600px, the whole log above
// ===================================================================
{
    const { window, errors } = run('dark');
    const doc = window.document;
    const cards = Array.from(doc.querySelectorAll('#experience .timeline-content'));
    const buttons = cards.map(c => c.querySelector(':scope > .corelog-more'));

    assert(errors.length === 0, `Experience: the page boots without errors (${errors.map(String).join('; ') || 'none'})`);
    assert(cards.length === 5 && buttons.every(Boolean), `Experience: every role gets a More button (${buttons.filter(Boolean).length} of ${cards.length})`);
    assert(buttons.every((b, i) => b === cards[i].lastElementChild && b.type === 'button'),
        'Experience: each is a real button, after everything it opens');
    assert(buttons.every((b, i) => b.getAttribute('aria-expanded') === 'false' && doc.getElementById(b.getAttribute('aria-controls')) === cards[i].querySelector('ul')),
        'Experience: each says it is closed and names the list it opens');
    assert(buttons.every((b, i) => text(b) === `More about ${text(cards[i].querySelector('h3'))}`),
        `Experience: each is named for its role, not five times "More" (${text(buttons[0])})`);

    const card = cards[0];
    buttons[0].click();
    assert(card.classList.contains('is-open') && buttons[0].getAttribute('aria-expanded') === 'true' && /^Less/.test(text(buttons[0])),
        'Experience: a press opens the card and the button says Less');
    buttons[0].click();
    assert(!card.classList.contains('is-open') && buttons[0].getAttribute('aria-expanded') === 'false' && /^More/.test(text(buttons[0])),
        'Experience: a second press folds it again');

    // Nothing leaves the page: the lines a phone folds are in it, and
    // opening a card shows them; the markup carries no button, so without
    // this script there is nothing to press and every card is whole.
    const bare = new JSDOM(html).window.document;
    assert(bare.querySelectorAll('.corelog-more').length === 0, 'Experience: the markup has no More button; script.js makes them');
    assert(cards.every(c => c.querySelectorAll('li').length >= 3), 'Experience: every role keeps all its lines in the page');

    // The folding is for phones, and only where script.js runs.
    const phone = (css.match(/@media \(max-width: 599px\) \{[\s\S]*?\n\}/) || [''])[0];
    assert(/html\.js \.timeline-content:not\(\.is-open\) ul li:nth-child\(n\+2\)/.test(phone) && /html\.js \.timeline-content:not\(\.is-open\) \.tags/.test(phone),
        'Experience: below 600px, with html.js, a closed card shows its first line and folds the rest and the tags');
    assert(/html\.js \.corelog-more \{ display: inline-block; \}/.test(phone) && /\.corelog-more \{\s*display: none;/.test(css),
        'Experience: the button shows only there; above 600px, and on a late start, there is none');
    assert(/\.corelog-head,\s*\.corelog-depth \{\s*display: none;/.test(phone) && /\.corelog > \.corelog-item \{\s*grid-template-columns: 8px minmax\(0, 1fr\);/.test(phone),
        'Experience: the phone cards give the depth column\'s width to the text (the desktop core log keeps it)');
}

// ===================================================================
// Contact: the form first, the Assay under it
// ===================================================================
{
    const doc = new JSDOM(html).window.document;
    const contact = doc.getElementById('contact');
    const form = doc.getElementById('contactForm');
    const assay = doc.getElementById('assay');
    assert(!!assay && assay.closest('#contact') === contact, 'Contact: the Assay is still in the contact section');
    assert(!!(form.compareDocumentPosition(assay) & doc.defaultView.Node.DOCUMENT_POSITION_FOLLOWING) && !assay.contains(form),
        'Contact: the Assay comes after the contact form');
    const firstField = contact.querySelector('input, textarea, select');
    assert(firstField && firstField.closest('form') === form, `Contact: the first field in the section is the form's (${firstField && firstField.id})`);
    assert(!assay.querySelector('.btn-primary'), 'Contact: the Assay is the secondary step, with no primary button to compete with Send');
}

// ===================================================================
// Skills and Education: repetition out, every fact kept
// ===================================================================
{
    const doc = new JSDOM(html).window.document;
    const plain = text(doc.body);
    const skills = doc.getElementById('skills');
    const skillText = text(skills);

    const expertise = ['ESG Analysis & Integration', 'GHG Accounting (Scope 1–3)', 'Life Cycle Assessment', 'Climate Risk Assessment',
        'Water Resource Management', 'Disaster Risk Reduction', 'Carbon Markets', 'Circular Economy'];
    const frameworks = ['SBTi', 'CDP', 'GHG Protocol', 'TCFD', 'TNFD', 'ISO 14000', 'IFRS S1&S2', 'SASB', 'GRI', 'CSRD'];
    const listed = (sel) => Array.from(skills.querySelectorAll(sel)).map(text);
    assert(JSON.stringify(listed('.skills-checklist li')) === JSON.stringify(expertise), `Skills: all eight areas of expertise are listed (${listed('.skills-checklist li').length})`);
    assert(JSON.stringify(listed('.frameworks-list li')) === JSON.stringify(frameworks), `Skills: all ten frameworks are listed (${listed('.frameworks-list li').length})`);
    assert(skills.querySelectorAll('.toolkit-item .toolkit-proof').length === 6, 'Skills: the six tools keep their proof links');
    assert(/164 water points/.test(skillText) && skills.querySelectorAll('.impact-seg').length === 3, 'Skills: the 164 water points are still itemised (100 + 50 + 14)');

    // What left Skills was said elsewhere on the page too, and still is.
    [['70%', /70% aquifer/], ['10,226 sub-basins', /10,226 sub-basins/], ['54 hazard information systems', /54 global hazard information systems/], ['a team of 23', /team of 23/]]
        .forEach(([what, re]) => {
            const outside = Array.from(doc.querySelectorAll('main > section')).filter(s => s.id !== 'skills' && re.test(text(s))).map(s => s.id);
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
    const education = new JSDOM(`<main>${doc.getElementById('education').outerHTML}</main>`).window.document;
    const excel = found(A.analyse('Sustainability Data Analyst. You will build dashboards in Excel from our emissions data, run statistical analysis, and report to stakeholders on climate risk every quarter.', { now, doc: education }), 'Excel');
    assert(!!excel && /^Covered in Data Analytics Training: SQL, Python, Excel, Tableau/.test(excel.ev[0].t),
        `Education: the Assay reads a certificate's line, and names the certificate (${excel ? excel.ev[0].t : 'not found'})`);

    // Every certificate keeps its name, issuer, date and what it covered.
    const certs = Array.from(doc.querySelectorAll('#education .education-card.certification'));
    const profile = JSON.parse(read('content/profile.json'));
    assert(certs.length === profile.certifications.length, `Education: all ${profile.certifications.length} certificates are shown (${certs.length})`);
    profile.certifications.forEach((c) => {
        const card = certs.find(el => text(el.querySelector('.cert-title')) === c.name);
        assert(!!card && text(card).includes(c.issuer) && text(card).includes(c.displayDate) && text(card.querySelector('.cert-line')).length > 20,
            `Education: "${c.name}" keeps its issuer, date and one line on what it covered`);
    });
    const degrees = doc.querySelectorAll('#education .education-grid > .education-card');
    assert(degrees.length === profile.education.length && profile.education.every(e => plain.includes(e.degree)),
        `Education: every degree keeps its own card (${degrees.length})`);
    assert(doc.querySelectorAll('#notes .fieldnote').length === 3, 'Notes: the three Field Notes stay as they are');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);   // the site script leaves timers running
