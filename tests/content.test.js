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
// The narration is rendered audio: when it disagrees with the page, fixing it
// costs an API render, so it is worth knowing early.
{
    const { SCRIPTS } = require('../voice-scripts.js');
    const spoken = SCRIPTS.map(s => s.text).join(' ');

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
