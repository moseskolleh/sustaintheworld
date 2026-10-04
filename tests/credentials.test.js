// Certificates link to where the issuer says so.
//
// Four certificates were listed on the homepage with nothing a reader
// could check them against. Each now carries an optional verifyUrl in
// content/profile.json: the issuer's own page for it (Coursera for the
// Google certificate, the Corporate Finance Institute's credential site).
// The homepage and the CV print a Verify link only when there is one, and
// the build refuses one that is not https, not on an issuer's host, or a
// placeholder. Moses supplies the addresses (owner checklist); until then
// none is shown, and nothing pretends otherwise.
//
// Run with: node tests/credentials.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const content = require('../scripts/lib/content.js');
const { renderCertificates, homeRegions, shellMarkers } = require('../scripts/build-content.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const profile = JSON.parse(read('content/profile.json'));
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
const check = content.checkCertifications;
const withUrl = (url) => { const c = clone(profile.certifications); c[1].verifyUrl = url; return c; };

// --- The validator ------------------------------------------------------------
{
    assert(check(profile.certifications).length === 0, 'Validate: the certificates as they are pass');
    assert(profile.certifications.every(c => !('verifyUrl' in c) || c.verifyUrl), 'Validate: a certificate has a verifyUrl or no such field, never an empty one');
    assert(check(withUrl('https://www.coursera.org/account/accomplishments/professional-cert/ABC123')).length === 0, 'Validate: accepts a Coursera certificate page');
    assert(check(withUrl('https://coursera.org/verify/professional-cert/ABC123')).length === 0, 'Validate: accepts Coursera\'s short verify address');
    assert(check(withUrl('https://credentials.corporatefinanceinstitute.com/abc-123')).length === 0, 'Validate: accepts a CFI credential page');

    const refused = (url, what, re) => {
        const p = check(withUrl(url));
        assert(p.length === 1 && re.test(p[0]), `Validate: refuses ${what} (${p[0] || 'accepted'})`);
    };
    refused(null, 'a null verifyUrl (leave the field out)', /not an https address/);
    refused('', 'an empty verifyUrl', /not an https address/);
    refused('TBC', 'a placeholder', /not an https address/);
    refused('http://coursera.org/verify/ABC', 'a plain-http address', /not an https address/);
    refused('https://example.com/cert', 'an untrusted host', /example\.com, which is not an issuer's verification host/);
    refused('https://github.com/moseskolleh', 'a trusted host that is not an issuer (his own page is not the issuer\'s word)', /github\.com, which is not an issuer's/);
    refused('https://www.linkedin.com/in/moseskollehsesay/details/certifications/', 'LinkedIn\'s list of his certificates', /linkedin\.com, which is not an issuer's/);

    const noCovered = clone(profile.certifications);
    delete noCovered[0].covered;
    assert(check(noCovered).some(p => /no covered/.test(p)), 'Validate: a certificate needs its line on what it covered (the homepage and the CV print it)');
    const tbc = clone(profile.certifications);
    tbc[2].displayDate = 'TBC';
    assert(check(tbc).some(p => /no displayDate/.test(p)), 'Validate: a placeholder date is refused');

    assert(content.VERIFY_HOSTS.every(h => content.TRUSTED_HOSTS.includes(h)), `Hosts: every issuer host is on the link allowlist with a reason (${content.VERIFY_HOSTS.join(', ')})`);
    const src = read('scripts/lib/content.js');
    assert(/problems\.push\(\.\.\.checkCertifications\(profile\.certifications\)\)/.test(src), 'Validate: loadAll checks them, so npm run build:content refuses a bad one');
}

// --- The homepage --------------------------------------------------------------
{
    const [START, END] = shellMarkers('CERTIFICATES');
    const region = index.slice(index.indexOf(START), index.indexOf(END));
    assert(index.includes(START) && index.includes(END) && region.includes(renderCertificates(profile).split('\n')[1].trim()),
        'Homepage: the certificates sit between their markers, as build-content.js writes them');
    const doc = new JSDOM(index).window.document;
    const cards = Array.from(doc.querySelectorAll('#education .cert-grid .education-card.certification'));
    assert(cards.length === profile.certifications.length, `Homepage: one card per certificate (${cards.length})`);
    const lines = cards.map(c => `${c.querySelector('.cert-title').textContent}|${c.querySelector('.cert-meta').textContent.replace(/\s+/g, ' ').trim()}|${c.querySelector('.cert-line').textContent}`);
    const want = profile.certifications.map(c => `${c.name}|${c.issuer} · ${c.displayDate}${c.verifyUrl ? ' · Verify' : ''}`);
    assert(lines.every((l, i) => l.startsWith(want[i]) && l.endsWith(`|${profile.certifications[i].covered}`)),
        `Homepage: each card is the profile's name, issuer, date and what it covered (${lines[0]})`);
    const links = doc.querySelectorAll('#education .cert-meta a');
    assert(links.length === profile.certifications.filter(c => c.verifyUrl).length, `Homepage: a Verify link exactly where profile.json has a verifyUrl (${links.length})`);

    // With an address, the card links it: off-site, in a new tab, named so a
    // list of links tells four Verify links apart.
    const p = clone(profile);
    p.certifications[0].verifyUrl = 'https://credentials.corporatefinanceinstitute.com/abc-123';
    const html = homeRegions({ profile: p, testimonials: { testimonials: [] } }).CERTIFICATES;
    const card = new JSDOM(html).window.document.querySelector('.certification');
    const a = card.querySelector('.cert-meta a');
    assert(!!a && a.getAttribute('href') === p.certifications[0].verifyUrl && a.target === '_blank' && a.rel === 'noopener',
        'Homepage: a verifyUrl is a link in the card\'s meta line, opening the issuer\'s page in a new tab');
    assert(!!a && a.textContent === 'Verify the ESG Specialist Program certificate with credentials.corporatefinanceinstitute.com' && a.querySelector('.sr-only'),
        `Homepage: its name says which certificate and where (${a && a.textContent})`);
    assert(/\.cert-meta a,?[\s\S]*?\{\s*color: var\(--primary-green\);/.test(read('style.css')), 'Homepage: the link takes the green, not a browser\'s default blue');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
