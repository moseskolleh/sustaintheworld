// The core log's depths come from the roles' dates.
//
// The experience section logs each role as a layer of a borehole core,
// depth for time at 10 m a year. The depths were typed in around
// September 2025 ("0 m", "8 m", "24 m", "63 m", "70 m") and a year later
// every one was about ten metres short. scripts/build-content.js now works
// each layer's interval out from content/profile.json: its top where the
// role ended (0 m for the open one), its base where it began, measured
// from meta.verifiedOn, the day the record is logged as of, so the build
// never reads the clock. This holds the page to that arithmetic, and the
// arithmetic to figures worked out by hand.
//
// Run with: node tests/corelog.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { corelogDepths, injectCorelog } = require('../scripts/build-content.js');

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
const label = (d) => `${d.top === d.base ? d.top : `${d.top}–${d.base}`} m`;

// --- The arithmetic, against figures worked by hand -----------------------
{
    // The roles as they are, logged on 5 August 2026: the surface is August
    // 2026. Sept 2025 is 11 months down (9.2 m); a role that ended in April
    // 2025 ran to the start of May, 15 months (12.5 m, 13) above its start
    // in March, 17 months (14.2 m, 14).
    const p = clone(profile);
    p.meta.verifiedOn = '2026-08-05';
    p.experience = [
        { title: 'Open', start: '2025-09', end: null },
        { title: 'Accelerator', start: '2025-03', end: '2025-04' },
        { title: 'Internship', start: '2023-06', end: '2023-10' },
        { title: 'Field', start: '2019-05', end: '2019-09' },
        { title: 'Drilling', start: '2018-09', end: '2019-04' }
    ];
    const got = corelogDepths(p).map(label);
    assert(got.join(', ') === '0–9 m, 13–14 m, 28–32 m, 68–73 m, 73–79 m', `Depths: worked by hand, logged August 2026 (${got.join(', ')})`);
    const d = corelogDepths(p);
    assert(d[3].base === d[4].top, 'Depths: a role that began the month the one before it ended shares its boundary (73 m)');
    assert(d.map(x => x.year).join() === '2025,2025,2023,2019,2018', 'Depths: each layer is labelled with the year it began');

    // A year later, every layer is ten metres deeper and the open one
    // ten metres thicker: what the hand-typed depths never did.
    p.meta.verifiedOn = '2027-08-01';
    const later = corelogDepths(p);
    assert(later.every((x, i) => x.base === d[i].base + 10 && (i === 0 ? x.top === 0 : x.top === d[i].top + 10)),
        `Depths: a year on, every layer is 10 m deeper (${later.map(label).join(', ')})`);

    // A role that ended in the month the facts were checked is at the surface;
    // one that starts after it cannot be logged.
    const edge = clone(p);
    edge.meta.verifiedOn = '2026-08-20';
    edge.experience = [{ title: 'Just ended', start: '2026-02', end: '2026-08' }];
    assert(label(corelogDepths(edge)[0]) === '0–5 m', `Depths: a role ending in the month it was logged reaches the surface (${label(corelogDepths(edge)[0])})`);
    edge.experience = [{ title: 'Not yet', start: '2026-09', end: null }];
    let threw = '';
    try { corelogDepths(edge); } catch (e) { threw = e.message; }
    assert(/starts after meta\.verifiedOn/.test(threw), `Depths: a role starting after the surface is refused (${threw || 'accepted'})`);
    edge.experience = [{ title: 'One month', start: '2026-01', end: '2026-01' }];
    assert(label(corelogDepths(edge)[0]) === '5–6 m', `Depths: a one-month role is a thin layer (${label(corelogDepths(edge)[0])})`);
}

// --- The page as built ------------------------------------------------------
{
    const doc = new JSDOM(index).window.document;
    const items = Array.from(doc.querySelectorAll('#experience .corelog-item'));
    const depths = corelogDepths(profile);
    const shown = items.map(it => (it.querySelector('.corelog-depth strong') || {}).textContent);
    assert(items.length === profile.experience.length && shown.join(', ') === depths.map(label).join(', '),
        `Page: each layer shows the depths its role's dates give (${shown.join(', ')})`);
    const years = items.map(it => (it.querySelector('.corelog-depth span') || {}).textContent);
    assert(years.join() === profile.experience.map(r => r.start.slice(0, 4)).join(), `Page: and the year it began (${years.join(', ')})`);
    const titles = items.map(it => it.querySelector('h3').textContent.trim());
    assert(titles.join('|') === profile.experience.map(r => r.title).join('|'), 'Page: the layers are profile.json\'s roles, in its order');
    const head = doc.querySelector('.corelog-head').textContent.replace(/\s+/g, ' ').trim();
    const [y, m] = profile.meta.verifiedOn.split('-');
    const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][+m - 1];
    assert(head === `CORE LOG MKS-01 · LOGGED ${month} ${y} SCALE 10 m / YEAR`, `Page: the head says when the log was logged, and its scale, exactly (${head})`);
    assert(!/TODAY|≈/.test(head), 'Page: the head no longer claims the surface is today, or an approximate scale');
    // Kept: the open role is at the surface, as the narration says.
    assert(depths[0].top === 0 && profile.experience[0].end === null, 'Page: the open role\'s layer starts at the surface, 0 m');
}

// --- The build rewrites them, and refuses a mismatch -----------------------
{
    const data = { profile };
    const stale = index.replace(/(<div class="corelog-depth mono-label">)<strong>[^<]*<\/strong><span>[^<]*<\/span>/g, '$1<strong>8 m</strong><span>surface</span>')
        .replace(/LOGGED [A-Z]{3} \d{4}/, 'SURFACE = TODAY').replace(/SCALE 10 m/, 'SCALE ≈ 10 m');
    assert(stale !== index && injectCorelog(data, stale) === index, 'Build: hand-typed depths and head are rewritten to the computed ones, and nothing else changes');
    assert(injectCorelog(data, index) === index, 'Build: the page as committed is what the build writes');

    const swapped = clone(profile);
    [swapped.experience[1], swapped.experience[2]] = [swapped.experience[2], swapped.experience[1]];
    let threw = '';
    try { injectCorelog({ profile: swapped }, index); } catch (e) { threw = e.message; }
    assert(/layer 2 is "Cohort 7 Member/.test(threw), `Build: roles reordered in profile.json and not on the page stop the build (${threw || 'accepted'})`);
    const extra = clone(profile);
    extra.experience.push({ title: 'Earlier role', start: '2017-01', end: '2017-06' });
    threw = '';
    try { injectCorelog({ profile: extra }, index); } catch (e) { threw = e.message; }
    assert(/5 layers for profile\.json's 6 roles/.test(threw), `Build: a role with no layer stops the build (${threw || 'accepted'})`);
}

// --- The stylesheet keeps an interval on one line ----------------------------
{
    const css = read('style.css');
    assert(/\.corelog-depth strong \{[^}]*white-space: nowrap;/.test(css), 'Style: a layer\'s interval does not wrap');
    assert(/\.corelog-item \{\s*grid-template-columns: 60px 20px 1fr;/.test(css), 'Style: on a tablet the depth column has room for "73–79 m" (60px; smoke.js measures it)');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
