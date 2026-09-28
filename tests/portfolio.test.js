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
    assert(content.checkAvailability('t', { status: 'public', url: 'https://github.com/moseskolleh/promptcoach' }).length === 0, 'Guard: accepts a public entry on a trusted host');
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

// --- case-studies.html ----------------------------------------------------
{
    const { window } = dom('case-studies.html');
    const doc = window.document;

    const cards = doc.querySelectorAll('.cs-card');
    assert(cards.length === projects.caseStudies.length, `Page: every case study is rendered (${cards.length}/${projects.caseStudies.length})`);

    // Each card must carry all four stages, in the page as shipped.
    const stageCounts = Array.from(cards).map(c => c.querySelectorAll('.cs-stage').length);
    assert(stageCounts.every(n => n === 4), `Page: every card shows all four stages (${stageCounts.join(', ')})`);

    const results = doc.querySelectorAll('.cs-result');
    const withBasis = doc.querySelectorAll('.cs-result-basis');
    assert(results.length === withBasis.length && results.length > 0, `Page: every rendered result shows its basis (${withBasis.length}/${results.length})`);

    const statuses = doc.querySelectorAll('.cs-status');
    assert(statuses.length > 0, `Page: artifacts show an availability status (${statuses.length})`);

    // Every lens has a panel, and the default is the one on show.
    const panels = doc.querySelectorAll('[data-lens-panel]');
    assert(panels.length === lenses.lenses.length + 1, `Page: one panel per lens plus the default (${panels.length})`);

    const visible = Array.from(panels).filter(p => !p.hidden);
    assert(visible.length === 1 && visible[0].dataset.lensPanel === 'all', 'Page: exactly one lens panel is shown, and it is the default');
}

// --- the lens switcher ----------------------------------------------------
// Loaded with ?lens=water, the water framing must be the one on show and the
// water case studies must be at the top — without anything disappearing.
{
    const html = fs.readFileSync(path.join(ROOT, 'case-studies.html'), 'utf8');
    const { window } = new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'https://example.com/case-studies.html?lens=water'
    });
    const doc = window.document;

    const shown = Array.from(doc.querySelectorAll('[data-lens-panel]')).filter(p => !p.hidden);
    assert(
        shown.length === 1 && shown[0].dataset.lensPanel === 'water',
        `Lens URL: ?lens=water shows the water framing (${shown.map(s => s.dataset.lensPanel).join(', ')})`
    );

    const cards = Array.from(doc.querySelectorAll('#csGrid .cs-card'));
    assert(cards.length === projects.caseStudies.length, `Lens URL: nothing is removed from the page (${cards.length}/${projects.caseStudies.length})`);

    const waterIds = projects.caseStudies.filter(cs => cs.lenses.includes('water')).map(cs => cs.id);
    const topIds = cards.slice(0, waterIds.length).map(c => c.id);
    assert(
        topIds.every(id => waterIds.includes(id)),
        `Lens URL: water case studies are ordered first (${topIds.join(', ')})`
    );

    const setBack = cards.filter(c => c.classList.contains('cs-card-secondary')).map(c => c.id);
    assert(
        setBack.length === projects.caseStudies.length - waterIds.length,
        `Lens URL: the rest are set back, not hidden (${setBack.join(', ')})`
    );
    assert(
        setBack.every(id => !cards.find(c => c.id === id).hidden),
        'Lens URL: the set-back case studies are still readable'
    );

    const active = doc.querySelector('.cs-lens.is-active');
    assert(active && active.dataset.lens === 'water', 'Lens URL: the switcher marks the current view');

    // An unknown lens must degrade to everything, not to an empty page.
    const bogus = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/case-studies.html?lens=nonsense' });
    const bogusShown = Array.from(bogus.window.document.querySelectorAll('[data-lens-panel]')).filter(p => !p.hidden);
    assert(
        bogusShown.length === 1 && bogusShown[0].dataset.lensPanel === 'all',
        'Lens URL: an unknown lens falls back to showing everything'
    );
}

// --- without JavaScript ---------------------------------------------------
// The lens links are real navigations, and the page has to be complete before
// any script runs — a portfolio that needs JS to show its work is a portfolio
// that shows nothing to a crawler.
{
    const { window } = new JSDOM(fs.readFileSync(path.join(ROOT, 'case-studies.html'), 'utf8'), {
        url: 'https://example.com/case-studies.html?lens=water'
    });
    const doc = window.document;

    assert(doc.querySelectorAll('.cs-card').length === projects.caseStudies.length, 'No JS: every case study is in the served HTML');
    assert(doc.querySelectorAll('.cs-result-basis').length > 0, 'No JS: the evidence is in the served HTML');

    const links = Array.from(doc.querySelectorAll('.cs-lens'));
    assert(links.length === lenses.lenses.length + 1, `No JS: every lens is a real link (${links.length})`);
    assert(links.every(a => (a.getAttribute('href') || '').startsWith('case-studies.html')), 'No JS: lens links navigate rather than relying on script');
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

    // Group headings are plurals a person would write: not "MSc thesiss".
    const headings = Array.from(doc.querySelectorAll('.rs-group h2')).map(h => h.textContent.trim());
    const misspelt = headings.filter(h => /(iss|sss|Codes)$/.test(h));
    assert(misspelt.length === 0, `Research page: group headings are real plurals (${headings.join(', ')})`);

    // The intro follows the hero lead; it should not say the same thing again.
    // Compared on runs of three words, so a light rewording still counts.
    const trigrams = (s) => {
        const w = s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
        return new Set(w.slice(2).map((x, i) => `${w[i]} ${w[i + 1]} ${x}`));
    };
    const lead = trigrams(doc.querySelector('.ca-hero p').textContent);
    const intro = trigrams(doc.querySelector('.rs-intro p').textContent);
    const shared = [...lead].filter(t => intro.has(t)).length / (lead.size || 1);
    assert(shared < 0.25, `Research page: the intro does not repeat the hero lead (${Math.round(shared * 100)}% of its phrasing shared)`);
}

// --- generated files carry their warning ---------------------------------
{
    ['case-studies.html', 'research.html', 'sitemap.xml', 'voice-scripts.js'].forEach((file) => {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8').slice(0, 900);
        assert(/GENERATED by scripts\/build-content\.js/.test(src), `${file}: says it is generated, near the top`);
    });

    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert(index.includes('JSON-LD:START') && index.includes('JSON-LD:END'), 'index.html: keeps the JSON-LD markers the generator writes between');
    assert(index.includes('PROJECT-CARDS:START') && index.includes('PROJECT-CARDS:END'), 'index.html: keeps the project-card markers the generator writes between');
}

// ===================================================================
// The homepage's project cards: the case studies, shortened, never restated
// ===================================================================
// The six dossiers told each project a second time, by hand, in 45 KB, and
// could drift from the case studies. The cards are drawn from the same
// entries, so what a card says is what the case study says, cut short.
{
    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).window.document;
    const cards = Array.from(doc.querySelectorAll('#projects .project-card'));
    const lensName = Object.fromEntries(lenses.lenses.map(l => [l.id, l.shortLabel]));
    assert(cards.map(c => c.dataset.project).join() === projects.caseStudies.map(cs => cs.id).join(),
        `Cards: one per case study, in the case studies' order (${cards.map(c => c.dataset.project).join(', ')})`);

    const wrong = [];
    projects.caseStudies.forEach((cs) => {
        const card = cards.find(c => c.dataset.project === cs.id);
        if (!card) return;
        const text = (sel) => (card.querySelector(sel) || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
        const head = cs.results[0];
        if (text('h3') !== cs.title) wrong.push(`${cs.id}: title "${text('h3')}"`);
        if (text('.project-claim') !== head.claim) wrong.push(`${cs.id}: headline "${text('.project-claim')}"`);
        if (!text('.project-basis').endsWith(head.brief)) wrong.push(`${cs.id}: basis "${text('.project-basis')}"`);
        // Checkable or not, as the case study says: the card cannot upgrade it.
        if (!text('.project-basis').startsWith(head.verifiable ? 'Checkable from outside' : 'Not checkable from outside')) wrong.push(`${cs.id}: says "${text('.project-basis .mono-label')}"`);
        const lensChips = Array.from(card.querySelectorAll('.project-lenses li')).map(li => li.textContent);
        if (lensChips.join() !== cs.lenses.map(l => lensName[l]).join()) wrong.push(`${cs.id}: lenses ${lensChips.join('/')}`);
        const links = card.querySelectorAll('a[href]');
        if (links.length !== 1 || links[0].getAttribute('href') !== `case-studies.html#${cs.id}`) wrong.push(`${cs.id}: links ${links.length}`);
    });
    assert(wrong.length === 0, `Cards: each says what its case study says — title, headline, basis, checkability, lenses — and links to it (wrong: ${wrong.join('; ') || 'none'})`);

    // Every card link lands on a case study that is there.
    const cs = new JSDOM(fs.readFileSync(path.join(ROOT, 'case-studies.html'), 'utf8')).window.document;
    const dead = Array.from(doc.querySelectorAll('a[href^="case-studies.html#"]'))
        .map(a => a.getAttribute('href').split('#')[1])
        .filter(id => !cs.getElementById(id));
    assert(dead.length === 0, `Cards: every link into case-studies.html lands on an id it has (missing: ${dead.join(', ') || 'none'})`);

    // What went with the dossiers stays gone: their games, their galleries,
    // and the ids and links that pointed into them.
    const gone = ['boreholeGame', 'strikeWidget', 'floodSim', 'boreholeStage', 'floodSlider', 'strikeSlider'].filter(id => doc.getElementById(id));
    const pointing = Array.from(doc.querySelectorAll('a[href^="#"]')).map(a => a.getAttribute('href')).filter(h => h.length > 1 && !doc.getElementById(h.slice(1)));
    assert(gone.length === 0 && !doc.querySelector('.project-gallery, .dossier-widget, .project-details'),
        `Cards: no dossier, gallery or game is left on the homepage (${gone.join(', ') || 'none'})`);
    assert(pointing.length === 0, `Cards: no in-page link on the homepage points at an id that is not there (${pointing.join(', ') || 'none'})`);
}

// --- one photo per card, lazy, at the size it is drawn --------------------
{
    // Width and height from the file itself (the WebP header), so a card
    // cannot claim one shape and deliver another.
    const webpSize = (buf) => {
        if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
        const chunk = buf.toString('ascii', 12, 16);
        if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
        if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
        if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
        return null;
    };
    const size = (rel) => webpSize(fs.readFileSync(path.join(ROOT, rel)));
    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).window.document;
    const bad = [];
    projects.caseStudies.forEach((cs) => {
        const p = cs.photo;
        const full = size(p.src), thumb = size(p.thumb);
        if (!full || full.width !== p.width || full.height !== p.height) bad.push(`${cs.id}: ${p.src} is ${full && `${full.width}x${full.height}`}, declared ${p.width}x${p.height}`);
        if (!thumb || thumb.width !== 480 || Math.abs(thumb.height - Math.round(480 * p.height / p.width)) > 1) bad.push(`${cs.id}: ${p.thumb} is ${thumb && `${thumb.width}x${thumb.height}`}, not the photo at 480px wide`);
        const imgs = doc.querySelectorAll(`[data-project="${cs.id}"] img`);
        const img = imgs[0];
        // A thumbnail at every width (80px, 64px on a phone): `sizes` says
        // so, and a browser then takes the 480px copy even on a 2x screen.
        const drawn = /^(\d+)px$/.exec(img ? img.getAttribute('sizes') || '' : '');
        if (imgs.length !== 1) bad.push(`${cs.id}: ${imgs.length} photos on the card`);
        else if (img.getAttribute('loading') !== 'lazy' || img.getAttribute('src') !== p.src || !img.getAttribute('alt') ||
            img.getAttribute('srcset') !== `${p.thumb} 480w, ${p.src} ${p.width}w` || !drawn || Number(drawn[1]) > 96) {
            bad.push(`${cs.id}: the card's photo is not lazy, alt-texted, offered at both sizes and sized as a thumbnail`);
        }
    });
    assert(bad.length === 0, `Cards: one lazy photo each, its declared size the file's own, drawn as a thumbnail from its 480px copy (${bad.join('; ') || 'all six'})`);
}

// --- the validator holds the card to its content -------------------------
{
    const base = projects.caseStudies.find(cs => cs.id === 'groundwater');
    const variant = (change) => { const cs = JSON.parse(JSON.stringify(base)); change(cs); return content.checkCard('test', cs); };
    const says = (problems, re) => problems.some(p => re.test(p));
    assert(content.checkCard('test', base).length === 0, 'Validator: a complete case study passes the card check');
    assert(says(variant(cs => { delete cs.results[0].brief; }), /one-line brief/), 'Validator: a headline without a brief is refused');
    assert(says(variant(cs => { cs.results[0].brief = 'x'.repeat(121); }), /120 at most/), 'Validator: a brief longer than a line is refused');
    assert(says(variant(cs => { cs.photo.src = 'assets/img/nope.webp'; }), /not in the repository/), 'Validator: a photo that is not in the repository is refused');
    assert(says(variant(cs => { cs.photo.thumb = 'https://example.com/x.webp'; }), /not a file in this repository/), 'Validator: a photo from off the site is refused');
    assert(says(variant(cs => { cs.photo.alt = ' '; }), /no alt text/), 'Validator: a photo with no alt text is refused');
    assert(says(variant(cs => { delete cs.photo.height; }), /intrinsic width and height/), 'Validator: a photo without its size is refused');
    assert(says(variant(cs => { cs.tags = []; }), /tags must be/), 'Validator: a card with no tags is refused');
    assert(says(variant(cs => { cs.widget = 'slot-machine'; }), /not one of borehole, flood/), 'Validator: a widget no host exists for is refused');
    assert(content.WIDGETS.join() === 'borehole,flood', 'Validator: the widgets a case study may host are the two dossier.js draws');
}

// --- the games live where their stories are -------------------------------
{
    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, 'case-studies.html'), 'utf8')).window.document;
    const hosted = projects.caseStudies.filter(cs => cs.widget).map(cs => `${cs.id}:${cs.widget}`);
    assert(hosted.join() === 'wuppertal:flood,groundwater:borehole', `Games: the flood slider is Wuppertal's and the borehole game groundwater's (${hosted.join(', ')})`);
    const placed = Array.from(doc.querySelectorAll('[data-widget]')).map(h => `${h.closest('.cs-card').id}:${h.dataset.widget}`);
    assert(placed.join() === hosted.join(), `Games: each host sits inside its own case study, and only there (${placed.join(', ')})`);
    // The artifact that names each game links to it on this page, by its
    // fragment alone: the full address would reload and drop the lens.
    const toHosts = Array.from(doc.querySelectorAll('.cs-artifact-name a')).map(a => a.getAttribute('href')).filter(h => /^#play-/.test(h));
    assert(toHosts.length === 2 && toHosts.every(h => doc.querySelector(h)), `Games: each is linked from its artifact entry, and the link lands (${toHosts.join(', ')})`);
    assert(!doc.querySelector('a[href*="index.html#projects"]'), 'Games: no artifact still sends a reader to the homepage to find them');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
