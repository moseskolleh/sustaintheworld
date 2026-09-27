// Tests for the open counts: scripts/fetch-stats.js, the content/stats.json
// guard in scripts/lib/content.js, and stats.html.
//
// stats.html makes three promises in public: no count under 5 is ever
// published, no daily row ever reaches the repository, and a page view sends
// exactly the fields it shows. Each is checked here against fixture rows —
// CI has no network and no counter — including rows written to break them:
// small cells, made-up names, a referrer that is an IP address, a date the
// calendar does not have. The guards have to fire on those, not merely pass
// on today's empty file.
//
// Run with: node tests/stats.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { JSDOM } = require('jsdom');

const content = require('../scripts/lib/content.js');
const fetchStats = require('../scripts/fetch-stats.js');
const { renderStats, EXAMPLE_PAYLOAD } = require('../scripts/build-content.js');

const ROOT = content.ROOT;
const SMALL = fetchStats.SMALL;

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// The beacon's fields, in order, as the counter's contract fixes them
// (docs/plan.md, Phase 1; schema version 1).
const CONTRACT_KEYS = ['v', 'page', 'lens', 'deepest', 'features', 'ref', 'vp', 'kb'];

// ===================================================================
// Fixture: five weeks of daily totals, with the awkward cases planted
// ===================================================================
//
// Counting runs from Wednesday 2 September to Monday 5 October 2026 (34
// days); "today" is that Monday, so the last complete week is 28 September
// to 4 October. Every day carries the same totals, so the expected figures
// below can be worked out by hand; the planted rows are listed after.
const TODAY = '2026-10-05';
const FIRST = '2026-09-02';
const WEEK = { start: '2026-09-28', end: '2026-10-04' };

function days(from, to) {
    const out = [];
    for (let d = from; d <= to; d = fetchStats.addDays(d, 1)) out.push(d);
    return out;
}

function fixtureRows() {
    const rows = [];
    days(FIRST, TODAY).forEach((d) => {
        rows.push(
            [d, 'visits', '', 20],
            [d, 'kb', '', 5000],                       // 250 KB a page view
            [d, 'page', 'index', 12],
            [d, 'page', 'case-studies', 6],
            [d, 'page', 'research', 2],
            [d, 'lens', 'water', 3],
            [d, 'lens', '', 17],                       // no lens: not a lens visit
            [d, 'deepest', 'contact', 3],              // a quarter of homepage views
            [d, 'deepest', 'about', 9],
            [d, 'feature', 'cv-download-hero', 1],
            [d, 'ref', '', 10],
            [d, 'ref', 'www.linkedin.com', 5],
            [d, 'ref', 'mid.example.net', 1],
            [d, 'vp', 'l', 12],
            [d, 'vp', 's', 8]
        );
    });
    rows.push(
        // Small cells, inside the last week.
        ['2026-09-30', 'lens', 'sustainable-ai', 2],
        ['2026-10-01', 'feature', 'cv-download-nav', 1],
        ['2026-09-29', 'ref', 'small.example.org', 1],
        ['2026-10-02', 'ref', 'small.example.org', 1],
        ['2026-09-28', 'contact', '', 1],
        ['2026-09-30', 'contact', '', 1],
        ['2026-10-03', 'contact', '', 1],
        // ...and outside it.
        ['2026-09-10', 'ref', 'small.example.org', 2],
        ['2026-09-10', 'contact', '', 1],
        ['2026-09-11', 'contact', '', 1],
        ['2026-09-12', 'contact', '', 1],
        // Names the site does not use: counted, but only as "other".
        ['2026-09-15', 'page', 'evil-page', 9],
        ['2026-09-15', 'feature', 'visit-spam-dot-com', 6],
        ['2026-09-15', 'lens', 'hacker', 5],
        ['2026-09-10', 'ref', '10.0.0.1', 7],
        ['2026-09-10', 'ref', 'https://evil.example/path', 3],
        // Rows that must be dropped outright.
        ['2026-02-30', 'visits', '', 50],
        ['2026-09-15', 'bogus', '', 50],
        ['2026-09-15', 'visits', '', -1],
        ['2026-09-15', 'visits', '', '3.5'],
        ['2026-12-01', 'visits', '', 50],
        ['2026-09-15', 'visits', 'x', 50],
        ['2026-09-15', 'vp', 'xl', 50]
    );
    return rows;
}

const known = fetchStats.knownNames();
const cleaned = fetchStats.cleanRows(fixtureRows(), known, TODAY);
const stats = fetchStats.transform(cleaned.rows, { today: TODAY, known });

// Every string anywhere in a value, and every count-shaped value.
function walk(value, visit, where = '') {
    visit(value, where);
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, visit, `${where}[${i}]`));
    else if (value && typeof value === 'object') Object.keys(value).forEach(k => walk(value[k], visit, where ? `${where}.${k}` : k));
}

// ===================================================================
// Reading the source
// ===================================================================
{
    const csv = '﻿date,metric,key,count\r\n2026-09-21,visits,,12\r\n2026-09-21,ref,"www.linkedin.com",5\r\n"2026-09-21","feature","a ""quoted"", name",3\r\n\r\n';
    const parsed = fetchStats.parseSource(csv);
    assert(parsed.format === 'csv', 'Source: a CSV with the contract header is read as CSV');
    assert(parsed.rows.length === 3, `Source: CSV rows are split on CRLF, blank lines skipped (${parsed.rows.length})`);
    assert(parsed.rows[2][2] === 'a "quoted", name', 'Source: quoted CSV fields keep their commas and doubled quotes');

    const json = fetchStats.parseSource(JSON.stringify({ v: 1, rows: [['2026-09-21', 'visits', '', 12]] }));
    assert(json.format === 'json' && json.rows.length === 1, 'Source: the Apps Script JSON {v:1, rows} is read as JSON');
    const withHeader = fetchStats.parseSource(JSON.stringify({ v: 1, rows: [['date', 'metric', 'key', 'count'], ['2026-09-21', 'visits', '', 12]] }));
    assert(withHeader.rows.length === 1, 'Source: a header row in the JSON (straight from getValues) is skipped, not counted as bad');

    const refuses = (label, text) => {
        let err = null;
        try { fetchStats.parseSource(text); } catch (e) { err = e; }
        assert(err instanceof fetchStats.SourceError, `Source: refuses ${label}`);
        return err;
    };
    refuses('an empty body', '  ');
    refuses('JSON with the wrong version', JSON.stringify({ v: 2, rows: [] }));
    refuses('JSON without rows', JSON.stringify({ v: 1 }));
    refuses('a sign-in page', '<!DOCTYPE html><html><body>Sign in</body></html>');

    // A sheet published by mistake has a person in its first line. Nothing
    // from the source may reach the (public) Action log, so the errors must
    // not quote it.
    const wrongSheet = refuses('a CSV with some other header', 'Timestamp,Name,Email\n2026-09-21,Jane Doe,jane@example.com\n');
    assert(wrongSheet && !/jane|Jane|Timestamp/.test(wrongSheet.message), 'Source: the wrong-header error does not quote the source');
    const badJson = refuses('JSON that does not parse', '{"v":1,"rows":[["2026-09-21","ref","secret.example.com",1]');
    assert(badJson && !/secret/.test(badJson.message), 'Source: the JSON parse error does not quote the source');
}

// ===================================================================
// Cleaning
// ===================================================================
{
    const reasons = Object.keys(cleaned.dropped);
    const droppedCount = reasons.reduce((n, k) => n + cleaned.dropped[k], 0);
    assert(droppedCount === 7, `Clean: the seven malformed rows are dropped (${droppedCount}: ${reasons.join('; ')})`);
    assert(reasons.some(r => /date/.test(r) && /YYYY-MM-DD/.test(r)), 'Clean: an impossible date (30 February) is dropped');
    assert(reasons.some(r => /future/.test(r)), 'Clean: a date after today is dropped');

    // A sheet turns YYYY-MM-DD into a date cell, and Apps Script serialises
    // it as Amsterdam midnight in UTC — the day before, in summer.
    const iso = fetchStats.normaliseRow(['2026-09-20T22:00:00.000Z', 'visits', '', 7], known, TODAY);
    assert(iso.date === '2026-09-21', `Clean: a serialised date cell is read back as the Amsterdam date (${iso.date})`);
    const winter = fetchStats.normaliseRow(['2026-12-01T23:00:00.000Z', 'visits', '', 7], known, '2026-12-31');
    assert(winter.date === '2026-12-02', `Clean: ...in winter too, an hour's offset instead of two (${winter.date})`);

    const text = fetchStats.normaliseRow(['2026-09-21', 'page', "'index", '12'], known, TODAY);
    assert(text.key === 'index' && text.count === 12, 'Clean: a sheet\'s leading apostrophe and a count sent as text are both read');

    const name = (metric, key) => (fetchStats.normaliseRow(['2026-09-21', metric, key, 5], known, TODAY) || {}).key;
    assert(name('page', 'evil-page') === 'other', 'Names: a page the site does not have is counted as other');
    assert(name('page', 'case-studies') === 'case-studies', 'Names: a real page keeps its name');
    assert(name('feature', 'buy-cheap-things-now') === 'other', 'Names: a feature name the site never uses is counted as other');
    assert(name('feature', 'cv-download-hero') === 'cv-download-hero', 'Names: a data-analytics name from the markup is known');
    assert(name('lens', 'hacker') === 'other', 'Names: an unknown lens is counted as other');
    assert(name('deepest', 'contact') === 'contact', 'Names: a real section id is known');
    assert(name('deepest', '<script>') === 'other', 'Names: a made-up section is counted as other');
    assert(name('ref', 'WWW.LinkedIn.com') === 'www.linkedin.com', 'Names: a referrer host is lower-cased');
    assert(name('ref', '10.0.0.1') === 'other', 'Names: a referrer that is an IP address is never published as one');
    assert(name('ref', 'https://evil.example/path') === 'other', 'Names: a referrer that is not a bare host is counted as other');
    assert(name('ref', 'localhost') === 'other', 'Names: a single-label host is counted as other');
}

// --- the names the site uses, read from its source -----------------------
{
    ['index', 'case-studies', 'research', 'carbon-ai', 'field-report', 'stats', '404'].forEach((p) => {
        assert(known.pages.has(p), `Known: page "${p}"`);
    });
    ['cv-download-hero', 'cv-download-nav', 'receipt-open', 'contact-form-submit', 'module-dossier', 'module-terminal', 'module-interactives', 'module-dispatch']
        .forEach((f) => assert(known.features.has(f), `Known: feature "${f}"`));
    // The counter names a module fetched on demand "module-<name>"; the bare
    // name is not something it sends, so it is not a name the page may show.
    assert(!known.features.has('dossier'), 'Known: a module is known by the name the counter sends, not its bare file name');
    ['water', 'climate-risk', 'sustainable-ai'].forEach(l => assert(known.lenses.has(l), `Known: lens "${l}"`));
    assert(known.ids.has('contact') && known.ids.has('groundwater'), 'Known: section ids from the homepage and the case studies');

    // The Brief goes live when the site's own code names it, not before.
    const siteNamesBrief = fs.readdirSync(ROOT).filter(f => /\.(html|js)$/.test(f))
        .concat(fs.readdirSync(path.join(ROOT, 'modules')).map(f => `modules/${f}`))
        .some(f => /data-analytics="brief-run"|track(?:Event)?\(\s*['"]brief-run['"]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert(known.features.has('brief-run') === siteNamesBrief, `Known: "brief-run" is known exactly when the site uses it (${siteNamesBrief})`);
}

// ===================================================================
// The totals
// ===================================================================
{
    assert(stats.status === 'collecting', 'Transform: rows make a collecting file');
    assert(stats.period.first === FIRST && stats.period.last === TODAY && stats.period.days === 34,
        `Transform: the period runs from the first to the last date (${stats.period.first} to ${stats.period.last}, ${stats.period.days} days)`);
    assert(stats.week.start === WEEK.start && stats.week.end === WEEK.end && stats.week.partial === false,
        `Transform: "last week" is the last complete Monday-to-Sunday week (${stats.week.start} to ${stats.week.end})`);
    assert(stats.asOf === TODAY, 'Transform: asOf is the day it ran');

    // The five numbers, by hand. Last week: 7 days of the daily totals plus
    // the planted rows dated inside it.
    const w = stats.headline.week;
    const a = stats.headline.all;
    assert(w.visits === 140 && a.visits === 680, `Five: page views for scale (${w.visits}, ${a.visits})`);
    assert(w.contact === SMALL, `Five: 3 contact messages last week are published as "${SMALL}" (${w.contact})`);
    assert(a.contact === 6, `Five: 6 contact messages in all (${a.contact})`);
    assert(w.cvDownloads === 8 && a.cvDownloads === 35, `Five: CV downloads add up every cv-download* name (${w.cvDownloads}, ${a.cvDownloads})`);
    assert(w.lensVisits === 23 && a.lensVisits === 104, `Five: lens visits count known lenses and not "other" (${w.lensVisits}, ${a.lensVisits})`);
    assert(w.contactShare === 0.25 && a.contactShare === 0.25, `Five: a quarter of homepage views reached Contact (${w.contactShare}, ${a.contactShare})`);
    assert(w.briefUses === null && a.briefUses === null && stats.briefLive === false, 'Five: Brief uses are null while the site has no Brief');

    // ...and once it has one.
    const withBrief = Object.assign({}, known, { features: new Set(Array.from(known.features).concat('brief-run')) });
    const briefRows = fetchStats.cleanRows(fixtureRows().concat([['2026-09-29', 'feature', 'brief-run', 6], ['2026-09-14', 'feature', 'brief-run', 2]]), withBrief, TODAY).rows;
    const live = fetchStats.transform(briefRows, { today: TODAY, known: withBrief });
    assert(live.briefLive === true && live.headline.week.briefUses === 6 && live.headline.all.briefUses === 8,
        `Five: Brief uses are counted once the site has a Brief (${live.headline.week.briefUses}, ${live.headline.all.briefUses})`);

    // Week by week, newest first; the first week started on a Wednesday.
    assert(stats.weeks.length === 5, `Weeks: one line per week back to the first (${stats.weeks.length})`);
    assert(stats.weeks[0].start === WEEK.start, 'Weeks: newest first');
    assert(stats.weeks[4].start === '2026-08-31' && stats.weeks[4].partial === true, 'Weeks: the first week is marked partial');
    assert(stats.weeks[1].contact === SMALL && stats.weeks[2].contact === SMALL, 'Weeks: the weekly contact counts under 5 are suppressed too');

    // Bytes: 5000 KB over 20 page views, every day.
    assert(stats.bytes.all.meanKb === 250 && stats.bytes.all.medianDayKb === 250 && stats.bytes.all.days === 34,
        `Bytes: mean and median day from kb and visits (${JSON.stringify(stats.bytes.all)})`);
}

// --- suppression, everywhere it applies ----------------------------------
{
    const bad = [];
    walk(stats, (v, where) => {
        if (typeof v === 'number' && Number.isInteger(v) && v < 5 && !/(^v$|days$|meanKb|medianDayKb|Share$)/.test(where)) bad.push(`${where}=${v}`);
    });
    assert(bad.length === 0, `Suppression: no published count is under 5 (${bad.join(', ') || 'none'})`);

    const lens = stats.breakdown.lens;
    const sai = lens.find(r => r.key === 'sustainable-ai');
    assert(sai && sai.week === SMALL && sai.all === SMALL, 'Suppression: a lens with 2 page views is "<5" in both columns');
    assert(lens[lens.length - 1].key === 'other', 'Order: "other" comes last');

    const ref = stats.breakdown.ref;
    assert(!ref.some(r => r.key === 'small.example.org'), 'Referrers: a host with 4 page views is not named');
    const other = ref.find(r => r.key === 'other');
    assert(other && other.all === 14 && other.week === SMALL,
        `Referrers: small hosts, an IP and a URL are grouped as other, itself suppressed when small (${other && other.week}, ${other && other.all})`);
    const named = ref.filter(r => r.key !== '' && r.key !== 'other');
    assert(named.every(r => r.all !== SMALL), 'Referrers: every named host has 5 or more page views in all');
    assert(ref.find(r => r.key === 'mid.example.net').week === 7, 'Referrers: a listed host keeps its own weekly figure');

    // Twenty hosts over the line: only the top fifteen are named.
    const many = [];
    for (let i = 0; i < 20; i++) many.push(['2026-09-29', 'ref', `site${String(i).padStart(2, '0')}.example.com`, 5 + i]);
    const capped = fetchStats.transform(fetchStats.cleanRows(many.concat([['2026-09-29', 'visits', '', 300]]), known, TODAY).rows, { today: TODAY, known });
    const cappedNamed = capped.breakdown.ref.filter(r => r.key !== 'other');
    assert(cappedNamed.length === 15 && cappedNamed[0].key === 'site19.example.com', `Referrers: at most fifteen are named, largest first (${cappedNamed.length})`);
    assert(capped.breakdown.ref.find(r => r.key === 'other').all === 5 + 6 + 7 + 8 + 9, 'Referrers: the rest are folded into other');

    // A share is only ever made from two published counts.
    const thin = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-29', 'visits', '', 40], ['2026-09-29', 'page', 'index', 40], ['2026-09-29', 'deepest', 'contact', 4],
        ['2026-09-30', 'visits', '', 3], ['2026-09-30', 'page', 'index', 3], ['2026-09-30', 'deepest', 'contact', 3]
    ], known, TODAY).rows, { today: TODAY, known });
    assert(thin.headline.all.contactShare === 0.163, `Share: 7 of 43 is published (${thin.headline.all.contactShare})`);
    const thinner = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-29', 'visits', '', 40], ['2026-09-29', 'page', 'index', 40], ['2026-09-29', 'deepest', 'contact', 4]
    ], known, TODAY).rows, { today: TODAY, known });
    assert(thinner.headline.all.contactShare === null, 'Share: 4 of 40 is not — the part is under 5');
    const tiny = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-29', 'visits', '', 4], ['2026-09-29', 'kb', '', 900], ['2026-09-29', 'page', 'index', 4], ['2026-09-29', 'deepest', 'contact', 4]
    ], known, TODAY).rows, { today: TODAY, known });
    assert(tiny.headline.all.contactShare === null && tiny.bytes.all === null, 'Share: nothing is derived from 4 page views, bytes included');

    // A day with too few page views cannot set the median on its own.
    const median = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-29', 'visits', '', 10], ['2026-09-29', 'kb', '', 2000],
        ['2026-09-30', 'visits', '', 1], ['2026-09-30', 'kb', '', 9000]
    ], known, TODAY).rows, { today: TODAY, known });
    assert(median.bytes.all.medianDayKb === 200 && median.bytes.all.days === 1 && median.bytes.all.meanKb === 1000,
        `Bytes: a day with one page view counts in the mean but not the median (${JSON.stringify(median.bytes.all)})`);

    // Suppressed rows are listed by name, so their order cannot rank them.
    const order = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-29', 'visits', '', 30], ['2026-09-29', 'feature', 'module-terminal', 4], ['2026-09-29', 'feature', 'module-dossier', 1],
        ['2026-09-29', 'feature', 'receipt-open', 9]
    ], known, TODAY).rows, { today: TODAY, known });
    assert(order.breakdown.feature.map(r => r.key).join(',') === 'receipt-open,module-dossier,module-terminal',
        `Order: published first, then suppressed by name (${order.breakdown.feature.map(r => r.key).join(',')})`);

    // No complete week yet: nothing weekly at all.
    const young = fetchStats.transform(fetchStats.cleanRows([['2026-10-01', 'visits', '', 30]], known, '2026-10-03').rows,
        { today: '2026-10-03', known });
    assert(young.week === null && young.headline.week === null && young.weeks.length === 0 && young.bytes.week === null,
        'Weeks: before the first full week ends there are no weekly figures');
    assert(young.breakdown.page.every(r => r.week === null), 'Weeks: ...and no weekly column in the breakdowns');
}

// --- the same totals from JSON and from CSV -------------------------------
{
    const esc = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = ['date,metric,key,count'].concat(fixtureRows().map(r => r.map(esc).join(','))).join('\n');
    const fromCsv = fetchStats.parseSource(csv);
    const fromJson = fetchStats.parseSource(JSON.stringify({ v: 1, rows: fixtureRows() }));
    const a = fetchStats.transform(fetchStats.cleanRows(fromCsv.rows, known, TODAY).rows, { today: TODAY, known });
    const b = fetchStats.transform(fetchStats.cleanRows(fromJson.rows, known, TODAY).rows, { today: TODAY, known });
    assert(JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(b) === JSON.stringify(stats),
        'Source: CSV and JSON of the same rows give identical totals');
}

// --- no raw rows ----------------------------------------------------------
{
    const allowed = new Set([stats.asOf, stats.period.first, stats.period.last, stats.week.start, stats.week.end]);
    stats.weeks.forEach((w) => { allowed.add(w.start); allowed.add(w.end); });
    const dated = [];
    walk(stats, (v) => { if (typeof v === 'string' && /\d{4}-\d{2}-\d{2}/.test(v) && !allowed.has(v)) dated.push(v); });
    assert(dated.length === 0, `Raw rows: no date appears except period and week boundaries (${dated.slice(0, 5).join(', ') || 'none'})`);

    const text = JSON.stringify(stats);
    assert(!/"rows"/.test(text), 'Raw rows: there is no rows field');
    assert(!/evil|spam|hacker|10\.0\.0\.1|small\.example/.test(text), 'Raw rows: no made-up or suppressed name reaches the file');
}

// ===================================================================
// The guard in scripts/lib/content.js
// ===================================================================
{
    assert(content.checkStats(stats).length === 0, `Guard: accepts the fixture totals (${content.checkStats(stats).join('; ') || 'ok'})`);
    assert(content.checkStats(fetchStats.EMPTY).length === 0, 'Guard: accepts the empty state');

    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'stats.json'), 'utf8'));
    assert(content.checkStats(committed).length === 0, `Guard: accepts the committed content/stats.json (${committed.status})`);

    const clone = () => JSON.parse(JSON.stringify(stats));
    const cases = [
        ['a published count of 3', s => { s.headline.all.contact = 3; }],
        ['a published count of 0', s => { s.breakdown.page[0].week = 0; }],
        ['a count in the week-by-week lines under 5', s => { s.weeks[0].cvDownloads = 4; }],
        ['a share above 1', s => { s.headline.all.contactShare = 1.4; }],
        ['a raw rows field', s => { s.rows = [['2026-09-21', 'visits', '', 3]]; }],
        ['an unknown field on a breakdown row', s => { s.breakdown.page[0].daily = [1, 2]; }],
        ['a named referrer with fewer than 5', s => { s.breakdown.ref.push({ key: 'tiny.example.com', week: SMALL, all: SMALL }); }],
        ['a referrer that is not a host', s => { s.breakdown.ref.push({ key: 'https://x.example/?q=1', week: 9, all: 9 }); }],
        ['a lowered suppression threshold', s => { s.suppressBelow = 1; }],
        ['a made-up status', s => { s.status = 'live'; }],
        ['weekly figures with no week', s => { s.week = null; }],
        ['a week with no weekly figures', s => { s.headline.week = null; }]
    ];
    cases.forEach(([label, spoil]) => {
        const s = clone();
        spoil(s);
        assert(content.checkStats(s).length > 0, `Guard: rejects ${label}`);
    });

    const emptyWithNumbers = JSON.parse(JSON.stringify(fetchStats.EMPTY));
    emptyWithNumbers.headline = stats.headline;
    assert(content.checkStats(emptyWithNumbers).length > 0, 'Guard: rejects numbers on a file that says it is not collecting');

    // Its messages go to a public Action log: they name the field, never the value.
    const leak = clone();
    leak.headline.all.contact = 3;
    leak.breakdown.ref.push({ key: 'tiny.example.com', week: SMALL, all: SMALL });
    const messages = content.checkStats(leak).join(' ');
    assert(!/\b3\b/.test(messages.replace(/\[\d+\]/g, '')) && !/tiny\.example/.test(messages), 'Guard: problems name the field, not the value');
}

// ===================================================================
// The page
// ===================================================================
const { lenses } = content.loadAll();
const page = (s) => new JSDOM(renderStats({ stats: s, lenses })).window.document;

// --- the literal payload ----------------------------------------------------
{
    assert(JSON.stringify(Object.keys(EXAMPLE_PAYLOAD)) === JSON.stringify(CONTRACT_KEYS), 'Payload: the example has exactly the contract\'s keys, in order');

    const doc = new JSDOM(fs.readFileSync(path.join(ROOT, 'stats.html'), 'utf8')).window.document;
    const pre = doc.querySelector('pre.st-payload');
    let shown = null;
    try { shown = JSON.parse(pre.textContent); } catch (e) { /* asserted below */ }
    assert(!!shown, 'Payload: the page shows the example as JSON that parses');
    assert(shown && JSON.stringify(Object.keys(shown)) === JSON.stringify(CONTRACT_KEYS),
        `Payload: the page's example has exactly the contract's keys (${shown ? Object.keys(shown).join(', ') : 'none'})`);
    if (shown) {
        assert(shown.v === 1 && Array.isArray(shown.features) && shown.features.length <= 20 && shown.features.every(f => /^[a-z0-9-]{1,40}$/.test(f)),
            'Payload: v is 1 and features are up to 20 short lower-case names');
        assert(['s', 'm', 'l'].includes(shown.vp) && Number.isInteger(shown.kb) && !/[/:]/.test(shown.ref),
            'Payload: vp is a class, kb a whole number, and ref a bare host');
    }
    const fields = Array.from(doc.querySelectorAll('.st-fields dt code')).map(c => c.textContent).sort();
    assert(JSON.stringify(fields) === JSON.stringify(CONTRACT_KEYS.slice().sort()), `Payload: every field is explained, and no other (${fields.join(', ')})`);

    const text = doc.body.textContent.replace(/\s+/g, ' ');
    assert(/Do Not Track or Global Privacy Control, nothing is sent at all/.test(text), 'Privacy: says DNT and GPC visitors send nothing');
    assert(/No IP address/.test(text) && /No cookies/.test(text) && /No id of any kind/.test(text), 'Privacy: lists what is never collected');
    assert(/Any count under 5 is shown as <5/.test(text), 'Privacy: says cells under 5 are suppressed');
    assert(/Google Sheet in my own Google account/.test(text), 'Privacy: says where the raw daily totals live');
}

// --- the empty state, as committed ---------------------------------------------
{
    const committed = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'stats.json'), 'utf8'));
    if (committed.status === 'not-collecting') {
        const doc = new JSDOM(fs.readFileSync(path.join(ROOT, 'stats.html'), 'utf8')).window.document;
        const h2s = Array.from(doc.querySelectorAll('h2')).map(h => h.textContent.trim());
        assert(h2s.includes('Counting has not started yet'), 'Empty: the page says counting has not started');
        assert(doc.querySelectorAll('.st-five .st-card').length === 5, 'Empty: the five numbers are still defined');
        assert(doc.querySelectorAll('.st-values, .st-table').length === 0, 'Empty: and no figure of any kind is shown');
        assert(/every Monday/.test(doc.querySelector('.st-empty').textContent), 'Empty: says when figures will appear');
    } else {
        assert(true, 'Empty: the committed file is collecting; the empty state is checked from the fixture below');
    }
    const doc = page(fetchStats.EMPTY);
    assert(/Counting has not started yet/.test(doc.body.textContent) && !doc.querySelector('.st-values'), 'Empty: rendered from the empty file, it shows no figures');
}

// --- the counting state, from the fixture ----------------------------------------
{
    const doc = page(stats);
    const cards = doc.querySelectorAll('.st-five .st-card');
    assert(cards.length === 5, `Counting: five cards (${cards.length})`);
    const values = Array.from(cards).map(c => Array.from(c.querySelectorAll('.st-values dd')).map(d => d.textContent));
    assert(JSON.stringify(values[0]) === JSON.stringify(['<5', '6']), `Counting: contact reads <5 last week, 6 in all (${values[0]})`);
    assert(JSON.stringify(values[3]) === JSON.stringify(['25%', '25%']), `Counting: the Contact share reads as a percentage (${values[3]})`);
    assert(/not live yet/.test(cards[4].textContent), 'Counting: Brief uses say "not live yet" until there is a Brief');
    assert(/a proxy/.test(cards[2].textContent) && /at most/.test(cards[2].textContent), 'Counting: the lens figure is labelled a proxy, and an upper bound');
    assert(/Week of 28 Sep – 4 Oct 2026/.test(cards[0].textContent), 'Counting: the week is named by its dates');

    const refTable = doc.querySelector('[aria-labelledby="st-ref-h"] table');
    assert(refTable && refTable.querySelectorAll('a').length === 0, 'Counting: no referrer is a link');
    assert(/www\.linkedin\.com/.test(refTable.textContent) && !/small\.example/.test(refTable.textContent), 'Counting: named hosts shown, small ones grouped');

    // A share column only ever divides two published figures.
    const lensRows = Array.from(doc.querySelectorAll('[aria-labelledby="st-pages-h"] table')[1].querySelectorAll('tbody tr'));
    const sai = lensRows.find(tr => /Sustainable AI|sustainable/i.test(tr.querySelector('th').textContent));
    assert(sai && sai.lastElementChild.textContent === '—', 'Counting: a suppressed row gets no share');

    const html = renderStats({ stats, lenses });
    assert(!/evil|visit-spam|hacker|10\.0\.0\.1|small\.example/.test(html), 'Counting: nothing made up or suppressed reaches the page');

    const young = fetchStats.transform(fetchStats.cleanRows([['2026-10-01', 'visits', '', 30]], known, '2026-10-03').rows, { today: '2026-10-03', known });
    const ydoc = page(young);
    assert(/first full week, Monday to Sunday, has not finished yet/.test(ydoc.body.textContent.replace(/\s+/g, ' ')), 'Counting: before the first full week, says why there is no weekly column');
    assert(!/Week of/.test(ydoc.body.textContent), 'Counting: ...and shows none');
}

// --- the page is linked, listed and budgeted --------------------------------------
{
    ['index.html', 'case-studies.html', 'research.html', 'stats.html'].forEach((file) => {
        const doc = new JSDOM(fs.readFileSync(path.join(ROOT, file), 'utf8')).window.document;
        const link = doc.querySelector('footer a[href="stats.html"]');
        assert(!!link && /open counts/i.test(link.textContent), `Footer: ${file} links to the open counts`);
    });
    const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'profile.json'), 'utf8'));
    assert(profile.pages.some(p => p.path === 'stats.html'), 'Sitemap: stats.html is one of the pages in profile.json');
    assert(/stats\.html/.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')), 'Sitemap: lists stats.html');

    const { BUDGETS, measure } = require('../scripts/check-budget.js');
    assert(!!BUDGETS.statsWire, 'Budget: stats.html has a budget of its own');

    // The budget has to hold once the page is full, or the weekly Action
    // turns red the week counting starts: twenty weeks of every page, lens,
    // screen class, feature and a homepage section apiece, and twenty hosts.
    const zlib = require('zlib');
    const gz = s => zlib.gzipSync(Buffer.from(s), { level: 9 }).length;
    const sections = ['journey', 'about', 'experience', 'projects', 'ecoprompt', 'skills', 'education', 'notes', 'contact']
        .concat(content.loadAll().projects.caseStudies.map(c => c.id));
    const full = [];
    for (let d = '2026-05-18'; d < TODAY; d = fetchStats.addDays(d, 1)) {
        full.push([d, 'visits', '', 90], [d, 'kb', '', 90 * 260], [d, 'ref', '', 30]);
        known.pages.forEach(p => full.push([d, 'page', p, 9]));
        known.lenses.forEach(l => full.push([d, 'lens', l, 5]));
        ['s', 'm', 'l'].forEach(v => full.push([d, 'vp', v, 30]));
        known.features.forEach(f => full.push([d, 'feature', f, 5]));
        sections.forEach(id => full.push([d, 'deepest', id, 5]));
        for (let h = 0; h < 20; h++) full.push([d, 'ref', `referring-site-${h}.example-company.com`, 1]);
    }
    const fullStats = fetchStats.transform(fetchStats.cleanRows(full, known, TODAY).rows, { today: TODAY, known });
    const fullHtml = renderStats({ stats: fullStats, lenses });
    const wire = measure().measured.statsWire - gz(fs.readFileSync(path.join(ROOT, 'stats.html'))) + gz(fullHtml);
    assert(fullStats.weeks.length === 12 && wire <= BUDGETS.statsWire.max,
        `Budget: a full page (${fullStats.weeks.length} weeks, ${fullStats.breakdown.feature.length} features) is ${(wire / 1024).toFixed(1)} KB of ${BUDGETS.statsWire.max / 1024} KB`);
    // The smoke test either names its pages or reads every .html file at the
    // root; either way stats.html has to be among them.
    const smoke = fs.readFileSync(path.join(ROOT, 'scripts', 'smoke.js'), 'utf8');
    assert(/'stats\.html'/.test(smoke) || /\bPAGES\s*=\s*fs\.readdirSync\(ROOT\)[^;]*\.html/.test(smoke), 'Smoke: opens stats.html in a real browser');
    assert(/GENERATED by scripts\/build-content\.js/.test(fs.readFileSync(path.join(ROOT, 'stats.html'), 'utf8').slice(0, 900)),
        'Page: stats.html says it is generated, near the top');

    // The page is complete as served. A shared script the shell loads for
    // every page (the counter) is fine; inline page logic is not.
    const inline = (fs.readFileSync(path.join(ROOT, 'stats.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
        .match(/<script\b[^>]*>/gi) || []).filter(t => !/\bsrc=/i.test(t) && !/application\/ld\+json/i.test(t));
    assert(inline.length === 0, `Page: stats.html carries no inline script (${inline.length})`);
}

// --- the weekly Action ------------------------------------------------------------
{
    const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'stats.yml'), 'utf8');
    assert(/schedule:[\s\S]*?- cron: '\d+ [0-6] \* \* 1'/.test(yml), 'Action: runs early on Mondays (UTC)');
    assert(/workflow_dispatch:/.test(yml), 'Action: can be run by hand');
    assert(/\npermissions:\n {2}contents: write\n(?![ \t]+\w)/.test(yml) && (yml.match(/permissions:/g) || []).length === 1,
        'Action: asks for contents: write and nothing else');
    assert(/node-version: 22/.test(yml), 'Action: Node 22');
    assert(/vars\.STATS_SOURCE_URL/.test(yml), 'Action: reads STATS_SOURCE_URL from the repository variables');
    const order = ['npm ci', 'node scripts/fetch-stats.js', 'npm run build:content', 'npm test'].map(s => yml.indexOf(s));
    assert(order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1])), 'Action: installs, fetches, rebuilds and tests, in that order');
    assert(/git add content\/stats\.json stats\.html\s*\n/.test(yml), 'Action: commits content/stats.json and stats.html only');
    assert(/git diff --cached --quiet/.test(yml), 'Action: commits nothing when nothing changed');
    assert(/github-actions\[bot\]/.test(yml), 'Action: commits as github-actions[bot]');
}

// ===================================================================
// The script end to end, against a local server
// ===================================================================
function run(env) {
    return new Promise((resolve) => {
        execFile(process.execPath, [path.join(ROOT, 'scripts', 'fetch-stats.js')], {
            env: Object.assign({ PATH: process.env.PATH }, env),
            timeout: 20000
        }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
    });
}

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-test-'));
    const out = path.join(tmp, 'stats.json');
    const sentinel = '{"untouched":true}\n';
    const reset = () => fs.writeFileSync(out, sentinel);
    const untouched = () => fs.readFileSync(out, 'utf8') === sentinel;

    // Rows dated in the three weeks before the real today, so the script's
    // own clock keeps them in range whenever this runs.
    const today = fetchStats.amsterdamDate(new Date());
    const recent = [];
    for (let i = 21; i >= 1; i--) {
        const d = fetchStats.addDays(today, -i);
        recent.push([d, 'visits', '', 30], [d, 'page', 'index', 30], [d, 'deepest', 'contact', 6]);
        if (i <= 2) recent.push([d, 'ref', 'secret-small.example.com', 1]);
    }
    const routes = {
        '/daily.csv': [200, 'text/csv', ['date,metric,key,count'].concat(recent.map(r => r.join(','))).join('\n')],
        '/exec': [200, 'application/json', JSON.stringify({ v: 1, rows: recent })],
        '/signin': [200, 'text/html', '<!doctype html><title>Sign in</title>'],
        '/down': [503, 'text/plain', 'unavailable'],
        '/gone': [404, 'text/plain', 'not found'],
        '/empty': [200, 'application/json', JSON.stringify({ v: 1, rows: [] })]
    };
    const seen = [];
    const server = http.createServer((req, res) => {
        seen.push(req.url);
        const [status, type, body] = routes[req.url.split('?')[0]] || [404, 'text/plain', ''];
        res.writeHead(status, { 'content-type': type });
        res.end(body);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
        reset();
        let r = await run({ STATS_OUT: out });
        assert(r.code === 0 && untouched() && /STATS_SOURCE_URL is not set/.test(r.out), 'Script: with no STATS_SOURCE_URL it exits 0, says why, and writes nothing');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: 'http://127.0.0.1:9/nothing-listens-here' });
        assert(r.code === 0 && untouched() && /could not reach/.test(r.out), 'Script: when the source cannot be reached it exits 0 and writes nothing');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/down` });
        assert(r.code === 0 && untouched(), 'Script: a 503 from the source is a skip, not a failure');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/empty` });
        assert(r.code === 0 && untouched() && /no daily totals yet/.test(r.out), 'Script: a source with no rows yet leaves the file alone');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/signin` });
        assert(r.code === 1 && untouched() && /web page, not stats/.test(r.out), 'Script: a sign-in page is a configuration mistake, and fails');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/gone` });
        assert(r.code === 1 && untouched(), 'Script: a 404 is a configuration mistake, and fails');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/daily.csv?token=hunter2` });
        const written = JSON.parse(fs.readFileSync(out, 'utf8'));
        assert(r.code === 0 && written.status === 'collecting' && content.checkStats(written).length === 0,
            `Script: a published CSV becomes a valid collecting file (${r.code}${r.code ? `: ${r.out.trim()}` : ''})`);
        assert(!/hunter2/.test(r.out), 'Script: the source URL is never printed, only its host');
        assert(!/secret-small/.test(r.out) && !/secret-small/.test(JSON.stringify(written)), 'Script: a suppressed name reaches neither the log nor the file');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/exec` });
        const fromJson = JSON.parse(fs.readFileSync(out, 'utf8'));
        assert(r.code === 0 && JSON.stringify(fromJson) === JSON.stringify(written), 'Script: the Apps Script JSON gives the same file as the CSV');
    } finally {
        server.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }

    // The Apps Script URL gets ?action=stats if the owner left it off, and
    // keeps whatever else it carried.
    const u = fetchStats.sourceUrl('https://script.google.com/macros/s/abc/exec?token=x');
    assert(u.searchParams.get('action') === 'stats' && u.searchParams.get('token') === 'x', 'Script: adds action=stats to a bare Apps Script URL');
    assert(!fetchStats.sourceUrl('https://docs.google.com/spreadsheets/d/e/x/pub?output=csv').searchParams.has('action'), 'Script: leaves a published-CSV URL alone');

    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
})().catch((err) => {
    console.log('FAIL:', err && err.stack ? err.stack : err);
    process.exit(1);
});
