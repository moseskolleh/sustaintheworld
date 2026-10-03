// Testimonials with provenance, or none at all.
//
// Anyone can write a kind sentence and put a name under it. A quote goes
// on the homepage only from content/testimonials.json, and only with a
// source a reader can check: a LinkedIn recommendation (a linkedin.com
// profile or recommendations address), or "on request" with the date the
// person agreed to be quoted. The list is empty until Moses has asked two
// or three people (owner checklist), and while it is empty the homepage
// shows nothing: no heading, no "coming soon".
//
// Run with: node tests/testimonials.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const content = require('../scripts/lib/content.js');
const { renderTestimonials, fillRegion, shellMarkers } = require('../scripts/build-content.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const file = JSON.parse(read('content/testimonials.json'));
const index = read('index.html');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const check = content.checkTestimonials;
const linkedin = {
    quote: 'Moses checked every figure before it went into the report, and said so when one could not be checked.',
    name: 'A. Colleague',
    role: 'Programme lead',
    relationship: 'Supervised his internship',
    source: { type: 'linkedin', url: 'https://www.linkedin.com/in/moseskollehsesay/details/recommendations/' }
};
const onRequest = Object.assign(clone(linkedin), { name: 'B. Partner', source: { type: 'on-request', permissionDate: '2026-09-14' } });
const one = (t) => check({ testimonials: [t] });

// --- Today: empty, and nothing shown ------------------------------------------
{
    assert(Array.isArray(file.testimonials) && check(file).length === 0, `Today: content/testimonials.json is valid (${file.testimonials.length} entries)`);
    assert(Array.isArray(file.$comment) && /source/.test(file.$comment.join(' ')), 'Today: the file says the rule where it will be edited');
    const [START, END] = shellMarkers('TESTIMONIALS');
    const region = index.slice(index.indexOf(START) + START.length, index.indexOf(END));
    assert(index.includes(START) && index.includes(END), 'Today: the homepage has the testimonials markers, under the experience section');
    if (!file.testimonials.length) {
        assert(/^\s*$/.test(region), 'Today: with none, nothing is drawn between them');
        assert(!new JSDOM(index).window.document.querySelector('.testimonials, .testimonial, blockquote'), 'Today: the homepage has no testimonial, heading or quote');
    }
    const experience = index.slice(index.indexOf('<section id="experience"'), index.indexOf('</section>', index.indexOf('<section id="experience"')));
    assert(experience.indexOf(START) > experience.indexOf('class="corelog-foot'), 'Today: the markers sit in the experience section, under the core log');
}

// --- The validator --------------------------------------------------------------
{
    assert(one(linkedin).length === 0, 'Validate: accepts a LinkedIn recommendations address');
    assert(one(Object.assign(clone(linkedin), { source: { type: 'linkedin', url: 'https://linkedin.com/in/someone-else-123' } })).length === 0, 'Validate: accepts a LinkedIn profile address');
    assert(one(onRequest).length === 0, 'Validate: accepts "on request" with the date permission was given');
    assert(check({ testimonials: [linkedin, onRequest, linkedin] }).length === 0, 'Validate: accepts three');

    const refused = (t, what, re) => {
        const p = one(t);
        assert(p.length >= 1 && re.test(p.join(' | ')), `Validate: refuses ${what} (${p[0] || 'accepted'})`);
    };
    const without = (k) => { const t = clone(linkedin); delete t[k]; return t; };
    refused(without('source'), 'a quote without a source', /no source/);
    refused(Object.assign(clone(linkedin), { source: { type: 'linkedin', url: 'https://example.com/in/moses' } }), 'a "LinkedIn" source off linkedin.com', /linkedin\.com profile or its recommendations/);
    refused(Object.assign(clone(linkedin), { source: { type: 'linkedin', url: 'https://www.linkedin.com/posts/someone_activity-123' } }), 'a LinkedIn post, which is not a recommendation', /linkedin\.com profile or its recommendations/);
    refused(Object.assign(clone(linkedin), { source: { type: 'linkedin', url: 'https://www.linkedin.com/company/undrr' } }), 'a company page', /linkedin\.com profile or its recommendations/);
    refused(Object.assign(clone(linkedin), { source: { type: 'linkedin', url: 'http://www.linkedin.com/in/moseskollehsesay' } }), 'a plain-http address', /linkedin\.com profile/);
    refused(Object.assign(clone(linkedin), { source: { type: 'linkedin', url: 'https://www.linkedin.com.evil.example/in/moses' } }), 'a look-alike host', /linkedin\.com profile/);
    refused(Object.assign(clone(linkedin), { source: { type: 'linkedin' } }), 'a LinkedIn source with no address', /linkedin\.com profile/);
    refused(Object.assign(clone(onRequest), { source: { type: 'on-request' } }), 'an on-request source without a permission date', /date permission was given/);
    refused(Object.assign(clone(onRequest), { source: { type: 'on-request', permissionDate: '2026-02-30' } }), 'a date that is not on the calendar', /date permission was given/);
    refused(Object.assign(clone(onRequest), { source: { type: 'on-request', permissionDate: 'TBC' } }), 'a placeholder date', /date permission was given/);
    refused(Object.assign(clone(onRequest), { source: { type: 'on-request', permissionDate: '2026-09-14', url: 'https://example.com' } }), 'an on-request source that also carries an address', /has no field "url"/);
    refused(Object.assign(clone(linkedin), { source: { type: 'email', url: 'mailto:a@b.c' } }), 'any other kind of source', /is not "linkedin" or "on-request"/);
    refused(without('relationship'), 'a quote that does not say how they know his work', /no relationship/);
    refused(Object.assign(clone(linkedin), { name: 'TBC' }), 'a placeholder name', /no name/);
    refused(Object.assign(clone(linkedin), { quote: 'x'.repeat(content.TESTIMONIAL_LIMITS.quote + 1) }), `a quote over ${content.TESTIMONIAL_LIMITS.quote} characters`, new RegExp(`at most ${content.TESTIMONIAL_LIMITS.quote}$`));
    refused(Object.assign(clone(linkedin), { rating: 5 }), 'a field the rule does not know', /unknown field "rating"/);
    const four = check({ testimonials: [linkedin, linkedin, onRequest, onRequest] });
    assert(four.some(p => /room for 3/.test(p)), `Validate: refuses a fourth (${four[0] || 'accepted'})`);
    assert(check({}).length === 1 && check({ testimonials: 'none' }).length === 1, 'Validate: the file must hold a list');
    const src = read('scripts/lib/content.js');
    assert(/const testimonials = load\('testimonials'\)/.test(src) && /problems\.push\(\.\.\.checkTestimonials\(testimonials\)\)/.test(src),
        'Validate: loadAll reads and checks the file, so npm run build:content refuses a bad entry');
}

// --- Drawn, once there is one -----------------------------------------------------
{
    assert(renderTestimonials({ testimonials: [] }) === '', 'Drawn: no entries, no markup');
    const block = renderTestimonials({ testimonials: [linkedin, onRequest] });
    const page = fillRegion(index, 'index.html', 'TESTIMONIALS', block);
    const doc = new JSDOM(page).window.document;
    const box = doc.querySelector('#experience .testimonials');
    const figures = box ? Array.from(box.querySelectorAll('figure.testimonial')) : [];
    assert(!!box && figures.length === 2, `Drawn: two entries are two figures under the core log (${figures.length})`);
    assert(figures.every(f => f.querySelector('blockquote p') && f.querySelector('figcaption strong')), 'Drawn: each is the quote in a blockquote, and who said it in its caption');
    assert(figures[0].querySelector('blockquote').textContent === linkedin.quote, 'Drawn: the quote word for word');
    const cap0 = figures[0].querySelector('figcaption').textContent;
    assert(cap0.startsWith(`${linkedin.name}, ${linkedin.role} · ${linkedin.relationship} · `), `Drawn: name, role and how they know his work (${cap0})`);
    const a = figures[0].querySelector('figcaption a');
    assert(!!a && a.getAttribute('href') === linkedin.source.url && a.target === '_blank' && a.rel === 'noopener' && /^Recommendation on LinkedIn, from A\. Colleague$/.test(a.textContent),
        'Drawn: a LinkedIn source is a link to the recommendation, named for whom it is from');
    const t = figures[1].querySelector('figcaption time');
    assert(!figures[1].querySelector('a') && !!t && t.getAttribute('datetime') === '2026-09-14' && /given 14 Sep 2026; the original on request$/.test(figures[1].querySelector('figcaption').textContent),
        `Drawn: an on-request source gives the permission date and no link (${figures[1].querySelector('figcaption').textContent})`);
    assert(box.querySelector('.panel-label') && box.querySelector('.fieldnotes-grid'), 'Drawn: a label and the field notes\' grid (three across on a desktop, one on a phone)');
    // The empty region round-trips: drawing and then clearing leaves the page as it was.
    assert(fillRegion(page, 'index.html', 'TESTIMONIALS', '') === fillRegion(index, 'index.html', 'TESTIMONIALS', ''), 'Drawn: emptied again, the markers stand as they do today');
    const css = read('style.css');
    // Dressed in rules the page already has, so nothing in style.css waits
    // on a block that is not drawn; only its link's colour is its own.
    const used = ['fieldnotes', 'fieldnotes-grid', 'skills-panel', 'cert-line', 'panel-label'];
    assert(used.every(c => new RegExp(`^\\.${c} \\{`, 'm').test(css)) && box.classList.contains('fieldnotes')
        && figures.every(f => f.matches('.skills-panel') && f.querySelector('figcaption.cert-line')),
        'Drawn: the block wears classes style.css already draws (the field notes\' block and grid, a card, a certificate\'s line)');
    assert(/\.testimonial a \{\s*color: var\(--primary-green\);/.test(css), 'Drawn: its link takes the green, not a browser\'s default blue');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
