// Tests for the case studies, role lenses and research outputs.
//
// The content model exists to stop a portfolio drifting back into unsupported
// claims, so most of what follows checks the guards rather than the content:
// it is not enough that today's entries happen to be honest, the build has to
// reject a dishonest one tomorrow. Several tests below therefore feed the
// validator deliberately bad data and fail if it lets it through.
//
// Run with: node tests/portfolio.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const content = require('../scripts/lib/content.js');
const ROOT = content.ROOT;

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// ===================================================================
// The content itself
// ===================================================================
let data;
try {
    data = content.loadAll();
    assert(true, 'Content: every file loads and validates');
} catch (err) {
    assert(false, `Content: validation failed —\n${err.message}`);
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}

const { projects, research, lenses } = data;

// --- problem → method → artifact → result --------------------------------
{
    const incomplete = projects.caseStudies.filter(cs =>
        !cs.problem || !(cs.method || []).length || !(cs.artifacts || []).length || !(cs.results || []).length);
    assert(incomplete.length === 0, `Case studies: all four stages present in each (${incomplete.map(c => c.id).join(', ') || 'none'})`);

    const noBasis = projects.caseStudies.flatMap(cs =>
        cs.results.filter(r => !r.basis).map(r => `${cs.id}: ${r.claim}`));
    assert(noBasis.length === 0, `Case studies: every result says how it was measured (${noBasis.join('; ') || 'none'})`);

    // The value of the basis field is that it is specific. "Measured" is not.
    const thinBasis = projects.caseStudies.flatMap(cs =>
        cs.results.filter(r => (r.basis || '').length < 40).map(r => `${cs.id}: "${r.basis}"`));
    assert(thinBasis.length === 0, `Case studies: no basis is a one-word shrug (${thinBasis.join('; ') || 'none'})`);

    // Honesty check with teeth: a portfolio where everything is independently
    // verifiable is a portfolio that is not being straight about internships
    // and client work. A portfolio where nothing is, is not evidence at all.
    const all = projects.caseStudies.flatMap(cs => cs.results);
    const verifiable = all.filter(r => r.verifiable).length;
    assert(verifiable > 0, `Case studies: at least some results are independently checkable (${verifiable}/${all.length})`);
    assert(verifiable < all.length, `Case studies: not everything claims to be checkable — client and internship work is not (${verifiable}/${all.length})`);

    // A number in a claim with no basis mentioning where it comes from is the
    // exact failure this model was built to prevent.
    const numeric = projects.caseStudies.flatMap(cs =>
        cs.results.filter(r => /\d/.test(r.claim)).map(r => ({ id: cs.id, r })));
    const unexplained = numeric.filter(({ r }) => !/\d/.test(r.basis) && !/count|share|sum|total|record|itemis|baseline|model|domain/i.test(r.basis));
    assert(unexplained.length === 0, `Case studies: every number is traced in its basis (${unexplained.map(u => u.id).join(', ') || 'none'})`);
}

// --- artifacts and availability ------------------------------------------
{
    const artifacts = projects.caseStudies.flatMap(cs => cs.artifacts.map(a => ({ cs: cs.id, a })));

    const publicNoUrl = artifacts.filter(({ a }) => a.status === 'public' && !a.url);
    assert(publicNoUrl.length === 0, `Artifacts: nothing claims to be public without a link (${publicNoUrl.map(x => x.a.name).join(', ') || 'none'})`);

    const nonPublicWithUrl = artifacts.filter(({ a }) => a.status !== 'public' && a.url);
    assert(nonPublicWithUrl.length === 0, `Artifacts: nothing unavailable carries a link that implies otherwise (${nonPublicWithUrl.map(x => x.a.name).join(', ') || 'none'})`);

    const badUrls = artifacts
        .filter(({ a }) => a.url)
        .map(({ a }) => ({ name: a.name, problem: content.urlProblem(a.url) }))
        .filter(x => x.problem);
    assert(badUrls.length === 0, `Artifacts: every link resolves (${badUrls.map(b => `${b.name} ${b.problem}`).join('; ') || 'none'})`);

    const internalNoHolder = artifacts.filter(({ a }) => a.status === 'internal' && !a.heldBy);
    assert(internalNoHolder.length === 0, `Artifacts: every internal artifact names who holds it (${internalNoHolder.map(x => x.a.name).join(', ') || 'none'})`);
}

// --- the guards actually fire --------------------------------------------
// Feed the validator things it must refuse. Without these, the rules above
// are only as good as today's content happening to comply with them.
{
    const cases = [
        { label: 'a public entry with no url', entry: { status: 'public', name: 'x' } },
        { label: 'a public entry pointing at a file that is not here', entry: { status: 'public', url: 'nope/missing.pdf' } },
        { label: 'a public entry on an untrusted host', entry: { status: 'public', url: 'https://doi.example.org/10.1234/made-up' } },
        { label: 'an invented DOI-looking link', entry: { status: 'public', url: 'https://doi.org/10.1000/xyz123' } },
        // The one a host-only allowlist used to wave through.
        { label: 'an invented path on an otherwise-trusted host', entry: { status: 'public', url: 'https://github.com/moseskolleh/does-not-exist' } },
        { label: 'a real host but somebody else\'s repository', entry: { status: 'public', url: 'https://github.com/someoneelse/repo' } },
        { label: 'an on-request entry carrying a link anyway', entry: { status: 'on-request', url: 'https://github.com/moseskolleh' } },
        { label: 'an internal entry with no holder', entry: { status: 'internal' } },
        { label: 'an entry with no status at all', entry: { name: 'x' } },
        { label: 'an entry with a made-up status', entry: { status: 'peer-reviewed' } }
    ];

    cases.forEach(({ label, entry }) => {
        const problems = content.checkAvailability('test', entry);
        assert(problems.length > 0, `Guard: rejects ${label}`);
    });

    // …and does not cry wolf on the legitimate shapes.
    assert(content.checkAvailability('t', { status: 'public', url: 'carbon-ai.html' }).length === 0, 'Guard: accepts a public entry with a working local link');
    assert(content.checkAvailability('t', { status: 'public', url: 'https://github.com/moseskolleh/promptcoach' }).length === 0, 'Guard: accepts a public entry whose exact URL is approved');
    assert(content.checkAvailability('t', { status: 'on-request' }).length === 0, 'Guard: accepts an on-request entry with no link');
    assert(content.checkAvailability('t', { status: 'internal', heldBy: 'UNDRR' }).length === 0, 'Guard: accepts an internal entry that names its holder');
}

// --- research outputs -----------------------------------------------------
{
    const withVenueClaim = research.outputs.filter(o => /journal|proceedings|conference/i.test(o.venue || ''));
    assert(
        withVenueClaim.every(o => o.doi),
        `Research: nothing implies peer review without a DOI (${withVenueClaim.map(o => o.id).join(', ') || 'none'})`
    );

    // No DOI anywhere in the file, since none of this work has one. If that
    // changes, this test changes with it — deliberately, and visibly.
    const raw = fs.readFileSync(path.join(ROOT, 'content', 'research.json'), 'utf8');
    assert(!/10\.\d{4,9}\//.test(raw), 'Research: no DOI-shaped string appears anywhere in the content');

    const orphans = research.outputs.filter(o => o.caseStudy && !projects.caseStudies.some(c => c.id === o.caseStudy));
    assert(orphans.length === 0, `Research: every case-study reference resolves (${orphans.map(o => o.id).join(', ') || 'none'})`);

    // Every case study that produced something should be findable from here.
    const linked = new Set(research.outputs.map(o => o.caseStudy).filter(Boolean));
    const unlinked = projects.caseStudies.filter(cs => !linked.has(cs.id));
    assert(unlinked.length === 0, `Research: every case study has at least one output listed (${unlinked.map(c => c.id).join(', ') || 'none'})`);

    const reproducible = research.outputs.filter(o => o.reproducible);
    assert(reproducible.length > 0, `Research: something is actually reproducible (${reproducible.length} entries)`);
    assert(
        reproducible.every(o => o.status === 'public'),
        'Research: nothing claims to be reproducible while being unavailable'
    );
}

// --- lenses ---------------------------------------------------------------
{
    lenses.lenses.forEach((l) => {
        const matching = projects.caseStudies.filter(cs => (cs.lenses || []).includes(l.id));
        assert(matching.length > 0, `Lens "${l.id}": has case studies behind it (${matching.length})`);
    });

    // A lens must reorder, never filter — the ordering helper has to return
    // every case study across its two buckets.
    lenses.lenses.concat([{ id: 'all' }]).forEach((l) => {
        const { primary, secondary } = content.orderForLens(projects.caseStudies, l.id);
        assert(
            primary.length + secondary.length === projects.caseStudies.length,
            `Lens "${l.id}": every case study is still present, just reordered (${primary.length}+${secondary.length}/${projects.caseStudies.length})`
        );
    });

    // Every case study belongs somewhere, or a lens visitor never sees it
    // near the top no matter which one they pick.
    const homeless = projects.caseStudies.filter(cs => !(cs.lenses || []).length);
    assert(homeless.length === 0, `Lenses: every case study belongs to at least one (${homeless.map(c => c.id).join(', ') || 'none'})`);
}

// ===================================================================
// The rendered pages
// ===================================================================
function dom(file) {
    return new JSDOM(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
        runScripts: 'dangerously',
        url: `https://example.com/${file}`
    });
}
// --- the generated pages, WITHOUT JavaScript ------------------------------
// Every assertion below runs on a JSDOM built with no script execution at
// all. That is the whole point: the first version of these pages selected the
// lens in the browser, so on GitHub Pages — which cannot vary its bytes by
// query string — `?lens=water` re-served the "Everything" framing while the
// README claimed the lens worked without JavaScript. Each lens is now its own
// static page, and these tests would fail the moment that regressed.
const noScript = (file) => new JSDOM(fs.readFileSync(path.join(ROOT, file), 'utf8')).window.document;

const LENS_PAGE = id => (id === 'all' ? 'case-studies.html' : `case-studies-${id}.html`);
const allLenses = [lenses.default].concat(lenses.lenses);

{
    allLenses.forEach((lens) => {
        const file = LENS_PAGE(lens.id);
        assert(fs.existsSync(path.join(ROOT, file)), `Lens "${lens.id}": has its own static page (${file})`);
        if (!fs.existsSync(path.join(ROOT, file))) return;

        const doc = noScript(file);

        // No JavaScript on the page at all — nothing left that could fail.
        assert(doc.querySelectorAll('script').length === 0, `${file}: needs no JavaScript`);

        // The right framing, served rather than selected.
        const panels = doc.querySelectorAll('.cs-lens-panel');
        assert(panels.length === 1, `${file}: shows exactly one lens framing (${panels.length})`);
        assert(
            panels[0] && panels[0].querySelector('h2').textContent.includes(lens.label),
            `${file}: the framing shown is "${lens.label}"`
        );

        // Every case study, in every view. A lens reorders; it never hides.
        const cards = Array.from(doc.querySelectorAll('.cs-card'));
        assert(cards.length === projects.caseStudies.length, `${file}: every case study is present (${cards.length}/${projects.caseStudies.length})`);
        assert(cards.every(c => !c.hidden), `${file}: no case study is hidden`);

        // Matching studies first, ordered at build time.
        const { primary } = content.orderForLens(projects.caseStudies, lens.id);
        const topIds = cards.slice(0, primary.length).map(c => c.id);
        assert(
            topIds.every(id => primary.some(p => p.id === id)),
            `${file}: matching case studies come first (${topIds.join(', ')})`
        );

        // The rest are set back visually, not removed.
        const setBack = cards.filter(c => c.classList.contains('cs-card-secondary'));
        assert(
            setBack.length === projects.caseStudies.length - primary.length,
            `${file}: the non-matching studies are set back, not dropped (${setBack.length})`
        );

        // The switcher marks where you are, and links to real files.
        const active = doc.querySelector('.cs-lens.is-active');
        assert(active && active.textContent.trim() === (lens.shortLabel || lens.label), `${file}: the switcher marks the current view`);
        assert(active && active.tagName !== 'A', `${file}: the current view is not a link to itself`);

        const links = Array.from(doc.querySelectorAll('a.cs-lens'));
        assert(links.length === allLenses.length - 1, `${file}: links to every other lens (${links.length})`);
        const broken = links.map(a => a.getAttribute('href')).filter(h => !fs.existsSync(path.join(ROOT, h)));
        assert(broken.length === 0, `${file}: every lens link points at a page that exists (${broken.join(', ') || 'none'})`);

        // Distinct canonical per view, or search engines see duplicates.
        const canonical = doc.querySelector('link[rel="canonical"]');
        assert(
            canonical && canonical.getAttribute('href').endsWith(file),
            `${file}: declares its own canonical URL`
        );

        // The evidence has to be in the served HTML, not assembled later.
        assert(doc.querySelectorAll('.cs-stage').length === projects.caseStudies.length * 4, `${file}: all four stages render for every case study`);
        assert(doc.querySelectorAll('.cs-result-basis').length > 0, `${file}: the basis for each result is in the served HTML`);
    });

    // Nothing may be left pointing at the old query-string form, which does
    // nothing on a static host.
    const pagesToScan = ['index.html', 'field-report.html', 'README.md'].concat(allLenses.map(l => LENS_PAGE(l.id)));
    const stale = pagesToScan.filter(f => /case-studies\.html\?lens=/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert(stale.length === 0, `No page still links to the query-string lens form (${stale.join(', ') || 'none'})`);
}

// --- research.html --------------------------------------------------------
{
    const { window } = dom('research.html');
    const doc = window.document;

    const items = doc.querySelectorAll('.rs-item');
    assert(items.length === research.outputs.length, `Research page: every output is rendered (${items.length}/${research.outputs.length})`);

    const statuses = doc.querySelectorAll('.rs-item .cs-status');
    assert(statuses.length === research.outputs.length, `Research page: every output shows its availability (${statuses.length}/${research.outputs.length})`);

    // Only public entries may be linked from the page.
    const linkedTitles = Array.from(doc.querySelectorAll('.rs-item h3 a'));
    const publicCount = research.outputs.filter(o => o.status === 'public').length;
    assert(linkedTitles.length === publicCount, `Research page: only public outputs are links (${linkedTitles.length}/${publicCount})`);

    assert(doc.querySelectorAll('.rs-commands dt').length > 0, 'Research page: the reproduction commands are listed');
}

// --- the budget's origin check must reach the exit code -------------------
// Counting origins was not enough: swapping an allowed host for an unapproved
// one keeps the count at its ceiling, so the numeric budget passed while the
// script printed an error and still exited 0 — enforcing nothing.
{
    const budget = require('../scripts/check-budget.js');

    assert(
        budget.unexpected(['fonts.googleapis.com', 'fonts.gstatic.com']).length === 0,
        'Budget: the approved font origins raise nothing'
    );

    // The exact scenario from the review: a swap, not an addition.
    const swapped = budget.unexpected(['fonts.googleapis.com', 'evil.example']);
    assert(
        swapped.length === 1 && swapped[0] === 'evil.example',
        `Budget: an unapproved origin is caught even when the count is unchanged (${swapped.join(', ')})`
    );

    assert(
        budget.unexpected(['fonts.googleapis.com', 'fonts.gstatic.com', 'tracker.example']).length === 1,
        'Budget: an added unapproved origin is caught too'
    );
    assert(budget.unexpected([]).length === 0, 'Budget: no origins is not a problem');

    // What the pages actually reach for right now.
    const live = budget.thirdPartyOrigins('case-studies.html');
    assert(
        budget.unexpected(live).length === 0,
        `Budget: the shipped pages reach no unapproved origin (${live.join(', ')})`
    );

    // Self-references and metadata are not third parties — both were bugs in
    // the detector's first version.
    assert(!live.includes('moseskolleh.github.io'), 'Budget: the site\'s own host is not counted as third-party');
}

// --- generated files carry their warning ---------------------------------
{
    ['case-studies.html', 'research.html', 'sitemap.xml', 'voice-scripts.js'].forEach((file) => {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 900);
        assert(/GENERATED by scripts\/build-content\.js/.test(src), `${file}: says it is generated, near the top`);
    });

    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(index.includes('JSON-LD:START') && index.includes('JSON-LD:END'), 'index.html: keeps the JSON-LD markers the generator writes between');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
