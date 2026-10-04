// Tests for the open counts: scripts/fetch-stats.js, the content/stats.json
// guard in scripts/lib/content.js, and stats.html.
//
// stats.html makes these promises in public: no count under 5 is ever
// published, not even one a reader could work out by subtracting the
// figures around it from a total; no single day's count and no daily row
// ever reaches the repository; and a page view sends exactly the fields it
// shows. Each is checked here against fixture rows — CI has no network and
// no counter — including rows written to break them: small cells, a lone
// small cell in a table that adds up to a total, made-up names, a referrer
// that is an IP address, a date the calendar does not have, counting that
// starts mid-week or has not yet run a week. The guards have to fire on
// those, not merely pass on today's empty file.
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
const { renderStats, EXAMPLE_PAYLOAD, PAGE_NAMES } = require('../scripts/build-content.js');

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
// to 4 October. Only whole weeks are published, so the figures run from
// Monday 7 September: the two days before it and today are in none of them.
// Every day carries the same totals, so the expected figures below can be
// worked out by hand; the planted rows are listed after. Like the real
// counter's, every page view here has one page and one window class, so
// those tables add up to the page views.
const TODAY = '2026-10-05';
const COUNTED = '2026-09-02';
const FIRST = '2026-09-07';
const WEEK = { start: '2026-09-28', end: '2026-10-04' };
const HELD = fetchStats.HELD;

function days(from, to) {
    const out = [];
    for (let d = from; d <= to; d = fetchStats.addDays(d, 1)) out.push(d);
    return out;
}

function fixtureRows() {
    const rows = [];
    days(COUNTED, TODAY).forEach((d) => {
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
            [d, 'feature', 'cv-download', 1],          // what count.js adds with any CV link
            [d, 'ref', '', 10],                        // never written by Code.gs; skipped
            [d, 'ref', 'www.linkedin.com', 5],
            [d, 'ref', 'mid.example.net', 1],
            [d, 'vp', 'l', 12],
            [d, 'vp', 's', 8]
        );
    });
    rows.push(
        // Small cells, inside the last week. The nav CV link on 1 October was
        // clicked in the same page view as that day's hero one, so the view
        // counts once: count.js sent "cv-download" once.
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
        // Names the site does not use: counted, but only as "other". Each is
        // a whole page view posted to the public endpoint, with its own page
        // and window class, as Code.gs would total it.
        ['2026-09-15', 'visits', '', 9], ['2026-09-15', 'kb', '', 2250], ['2026-09-15', 'vp', 'l', 9],
        ['2026-09-15', 'page', 'evil-page', 9],
        ['2026-09-15', 'feature', 'visit-spam-dot-com', 6],
        ['2026-09-15', 'lens', 'hacker', 5],
        ['2026-09-10', 'visits', '', 10], ['2026-09-10', 'kb', '', 2500], ['2026-09-10', 'vp', 's', 10], ['2026-09-10', 'page', 'research', 10],
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
// Every page a count can name has a name to print: claims.html counted as
// "claims", and stats.html printed the bare key beside "EcoPrompt Coach".
{
    const unnamed = Array.from(known.pages).filter(k => !PAGE_NAMES[k]);
    assert(known.pages.has('claims') && unnamed.length === 0, `Known: every page the counter knows has a name on stats.html (${unnamed.join(', ') || `${known.pages.size} named`})`);
}
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
    ['cv-download-hero', 'cv-download-nav', 'cv-download-fieldreport', 'email-fieldreport', 'cv-download', 'receipt-open',
        'contact-form-submit', 'module-dossier', 'module-terminal', 'module-interactives', 'module-dispatch']
        .forEach((f) => assert(known.features.has(f), `Known: feature "${f}"`));
    // The counter names a module fetched on demand "module-<name>"; the bare
    // name is not something it sends, so it is not a name the page may show.
    assert(!known.features.has('dossier'), 'Known: a module is known by the name the counter sends, not its bare file name');
    // Hooks a module writes into the page, and the Assay's grades, which it
    // sends as "assay-<class>": each was counted as "other" until the names
    // were read from the modules as well as the pages.
    ['listen', 'listen-intro', 'assay-copy', 'assay-contact', 'assay-high', 'assay-workable', 'assay-marginal']
        .forEach((f) => assert(known.features.has(f), `Known: feature "${f}"`));
    assert(!known.features.has('assay-'), 'Known: the start of a composed name (track(\'assay-\' + grade)) is not a feature');
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
    assert(stats.period.first === FIRST && stats.period.last === WEEK.end && stats.period.days === 28,
        `Transform: the period is whole weeks, from the first Monday counted to last Sunday (${stats.period.first} to ${stats.period.last}, ${stats.period.days} days)`);
    assert(stats.week.start === WEEK.start && stats.week.end === WEEK.end && Object.keys(stats.week).length === 2,
        `Transform: "last week" is the last complete Monday-to-Sunday week (${stats.week.start} to ${stats.week.end})`);
    assert(stats.asOf === TODAY, 'Transform: asOf is the day it ran');

    // The five numbers, by hand. Last week: 7 days of the daily totals plus
    // the planted rows dated inside it. All time: 28 days, 7 September on.
    const w = stats.headline.week;
    const a = stats.headline.all;
    assert(w.visits === 140 && a.visits === 579, `Five: page views for scale, today and the days before the first Monday left out (${w.visits}, ${a.visits})`);
    assert(w.contact === SMALL, `Five: 3 contact messages last week are published as "${SMALL}" (${w.contact})`);
    assert(a.contact === 6, `Five: 6 contact messages in all (${a.contact})`);
    assert(w.cvDownloads === 7 && a.cvDownloads === 28,
        `Five: CV downloads are page views with any CV link, so the view that used two counts once (${w.cvDownloads}, ${a.cvDownloads})`);
    assert(w.lensVisits === 23 && a.lensVisits === 86, `Five: lens visits count known lenses and not "other" (${w.lensVisits}, ${a.lensVisits})`);
    assert(w.contactShare === 0.25 && a.contactShare === 0.25, `Five: a quarter of homepage views reached Contact (${w.contactShare}, ${a.contactShare})`);
    assert(w.briefUses === null && a.briefUses === null && stats.briefLive === false, 'Five: Brief uses are null while the site has no Brief');

    // ...and once it has one.
    const withBrief = Object.assign({}, known, { features: new Set(Array.from(known.features).concat('brief-run')) });
    const briefRows = fetchStats.cleanRows(fixtureRows().concat([['2026-09-29', 'feature', 'brief-run', 6], ['2026-09-14', 'feature', 'brief-run', 2]]), withBrief, TODAY).rows;
    const live = fetchStats.transform(briefRows, { today: TODAY, known: withBrief });
    // 8 all time and 6 last week would give away the 2 before last week, a
    // count under 5 shown nowhere, so last week's 6 is held.
    assert(live.briefLive === true && live.headline.week.briefUses === 'held' && live.headline.all.briefUses === 8,
        `Five: Brief uses are counted once the site has a Brief, and last week is held so the 2 before it cannot be worked out (${live.headline.week.briefUses}, ${live.headline.all.briefUses})`);

    // The same for any breakdown row: all time less last week is a count too.
    const earlierRows = fetchStats.cleanRows(fixtureRows().concat([
        ['2026-09-29', 'lens', 'water', 9], ['2026-09-15', 'lens', 'water', 3]
    ]), known, TODAY).rows;
    const earlierStats = fetchStats.transform(earlierRows, { today: TODAY, known });
    const water = earlierStats.breakdown.lens.find(r => r.key === 'water');
    const workedOut = typeof water.all === 'number' && typeof water.week === 'number' ? water.all - water.week : null;
    assert(water && !(workedOut >= 1 && workedOut < 5),
        `Suppression: a lens row does not give away the count before last week by subtraction (${JSON.stringify(water)})`);
    assert(content.checkStats(earlierStats).length === 0, `Suppression: the protected file passes checkStats (${content.checkStats(earlierStats).join(' | ')})`);
    // And a hand-edited file that shows both is refused.
    const leaky = JSON.parse(JSON.stringify(earlierStats));
    const lw = leaky.breakdown.lens.find(r => r.key === 'water');
    lw.all = 12; lw.week = 9;
    assert(content.checkStats(leaky).some(p => /all time less last week leaves 3/.test(p)),
        'Suppression: checkStats refuses a row whose all time less last week is a count under 5');

    // Week by week, newest first; counting began on a Wednesday, and that
    // part week is not a line of its own: it is in no figure at all.
    assert(stats.weeks.length === 4, `Weeks: one line per whole week back to the first Monday (${stats.weeks.length})`);
    assert(stats.weeks[0].start === WEEK.start && stats.weeks[3].start === FIRST, 'Weeks: newest first, the oldest starting on the first Monday');
    assert(stats.weeks.every(w => Object.keys(w).join() === 'start,end,visits,contact,cvDownloads,lensVisits,contactShare,briefUses'),
        'Weeks: every line is a whole week, with no part-week marker');
    assert(stats.weeks[3].contact === SMALL && stats.weeks[2].contact === SMALL, 'Weeks: the weekly contact counts under 5 are suppressed too');
    const { start, end, ...newest } = stats.weeks[0];
    assert(JSON.stringify(newest) === JSON.stringify(stats.headline.week), 'Weeks: the newest line is last week, figure for figure');
    const weekSum = stats.weeks.reduce((n, x) => n + x.visits, 0);
    assert(weekSum === a.visits, `Weeks: while they reach back to the start, the weeks add up to all time, and no day is left over (${weekSum}, ${a.visits})`);

    // Bytes: 250 KB a page view, every day, the planted ones included.
    assert(stats.bytes.all.meanKb === 250 && stats.bytes.all.medianDayKb === 250 && stats.bytes.all.days === 28,
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
    // The known lenses add up to the lens-link visits, 86 in all: shown
    // beside them, water's 84 would give away the 2.
    const water = lens.find(r => r.key === 'water');
    assert(water && water.week === HELD && water.all === HELD,
        `Suppression: the one other lens is held back with it, in both columns, and marked "${HELD}", not "${SMALL}" (${water && water.week}, ${water && water.all})`);
    assert(stats.headline.all.lensVisits === 86, 'Suppression: ...while the total itself stays shown');
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
    for (let i = 0; i < 20; i++) many.push(['2026-09-28', 'ref', `site${String(i).padStart(2, '0')}.example.com`, 5 + i]);
    const capped = fetchStats.transform(fetchStats.cleanRows(many.concat([['2026-09-28', 'visits', '', 300]]), known, TODAY).rows, { today: TODAY, known });
    const cappedNamed = capped.breakdown.ref.filter(r => r.key !== 'other');
    assert(cappedNamed.length === 15 && cappedNamed[0].key === 'site19.example.com', `Referrers: at most fifteen are named, largest first (${cappedNamed.length})`);
    assert(capped.breakdown.ref.find(r => r.key === 'other').all === 5 + 6 + 7 + 8 + 9, 'Referrers: the rest are folded into other');

    // A share is only ever made from two published counts. (Every row in
    // these small cases is dated in the last week, which starts on a Monday.)
    const one = (rows) => fetchStats.transform(fetchStats.cleanRows(rows, known, TODAY).rows, { today: TODAY, known });
    const thin = one([
        ['2026-09-29', 'visits', '', 40], ['2026-09-29', 'page', 'index', 40], ['2026-09-29', 'deepest', 'contact', 4],
        ['2026-09-30', 'visits', '', 3], ['2026-09-30', 'page', 'index', 3], ['2026-09-30', 'deepest', 'contact', 3],
        ['2026-09-28', 'visits', '', 1]
    ]);
    assert(thin.headline.all.contactShare === 0.163, `Share: 7 of 43 is published (${thin.headline.all.contactShare})`);
    const thinner = one([['2026-09-28', 'visits', '', 40], ['2026-09-28', 'page', 'index', 40], ['2026-09-28', 'deepest', 'contact', 4]]);
    assert(thinner.headline.all.contactShare === null, 'Share: 4 of 40 is not — the part is under 5');
    const tiny = one([['2026-09-28', 'visits', '', 4], ['2026-09-28', 'kb', '', 900], ['2026-09-28', 'page', 'index', 4], ['2026-09-28', 'deepest', 'contact', 4]]);
    assert(tiny.headline.all.contactShare === null && tiny.bytes.all === null, 'Share: nothing is derived from 4 page views, bytes included');

    // A day with too few page views cannot set the median on its own.
    const median = one([
        ['2026-09-28', 'visits', '', 10], ['2026-09-28', 'kb', '', 2000],
        ['2026-09-30', 'visits', '', 1], ['2026-09-30', 'kb', '', 9000]
    ]);
    assert(median.bytes.all.medianDayKb === 200 && median.bytes.all.days === 1 && median.bytes.all.meanKb === 1000,
        `Bytes: a day with one page view counts in the mean but not the median (${JSON.stringify(median.bytes.all)})`);

    // KB kept per page gives a mean per page; a page with fewer than 5 views
    // in the period has none, and an old unkeyed row still counts in the total.
    const perPage = one([
        ['2026-09-28', 'visits', '', 14], ['2026-09-28', 'page', 'index', 10], ['2026-09-28', 'page', 'research', 4],
        ['2026-09-28', 'kb', 'index', 2800], ['2026-09-28', 'kb', 'research', 400], ['2026-09-28', 'kb', '', 0],
        ['2026-09-29', 'visits', '', 6], ['2026-09-29', 'page', 'index', 6], ['2026-09-29', 'kb', '', 1200]
    ]);
    assert(JSON.stringify(perPage.bytes.all.byPage) === JSON.stringify([{ page: 'index', meanKb: 280 }]),
        `Bytes: a mean per page from that page's own KB and views, none for a page under 5 views (${JSON.stringify(perPage.bytes.all.byPage)})`);
    assert(perPage.bytes.all.meanKb === 220, `Bytes: the overall mean still counts every KB row, keyed or not (${perPage.bytes.all.meanKb})`);

    // Suppressed rows are listed by name, so their order cannot rank them.
    const order = one([
        ['2026-09-28', 'visits', '', 30], ['2026-09-28', 'feature', 'module-terminal', 4], ['2026-09-28', 'feature', 'module-dossier', 1],
        ['2026-09-28', 'feature', 'receipt-open', 9]
    ]);
    assert(order.breakdown.feature.map(r => r.key).join(',') === 'receipt-open,module-dossier,module-terminal',
        `Order: published first, then suppressed by name (${order.breakdown.feature.map(r => r.key).join(',')})`);

    // Before a whole week has ended there is nothing to publish at all: a
    // "week" of one day would be a single day's count, twice over.
    const young = (from, to, today) => fetchStats.transform(fetchStats.cleanRows(days(from, to).map(d => [d, 'visits', '', 9]), known, today).rows,
        { today, known });
    assert(young('2026-10-01', '2026-10-03', '2026-10-03') === null, 'Whole weeks: three days of counting publish nothing');
    assert(young('2026-10-04', '2026-10-04', '2026-10-05') === null, 'Whole weeks: counting that began on a Sunday publishes nothing the next day');
    assert(young('2026-10-05', '2026-10-05', '2026-10-05') === null, 'Whole weeks: nor does a first day that is today');
    assert(young('2026-10-07', '2026-10-12', '2026-10-12') === null,
        'Whole weeks: counting from a Wednesday publishes nothing on the next Monday, as the empty page promises');
    const firstWeek = young('2026-10-07', '2026-10-19', '2026-10-19');
    assert(firstWeek && firstWeek.period.first === '2026-10-12' && firstWeek.period.days === 7 && firstWeek.headline.all.visits === 63,
        `Whole weeks: ...and on the Monday after its first full week, that week alone (${firstWeek && JSON.stringify(firstWeek.period)})`);
    assert(content.checkStats(firstWeek).length === 0, 'Whole weeks: that first file passes the guard');
}

// --- a hidden figure cannot be worked out from the ones around it -----------
// The rows from the review that found it: every page view has one page and
// one window class, so those tables add up to the page views shown beside
// them, and a lone "<5" was the total less the rest.
{
    const D = '2026-09-28';
    const rows = [[D, 'visits', '', 40], [D, 'page', 'index', 30], [D, 'page', 'case-studies', 8], [D, 'page', '404', 2],
        [D, 'vp', 'l', 25], [D, 'vp', 'm', 12], [D, 'vp', 's', 3], [D, 'lens', 'water', 12], [D, 'lens', 'climate-risk', 2]];
    const s = fetchStats.transform(fetchStats.cleanRows(rows, known, TODAY).rows, { today: TODAY, known });
    const got = (metric, col) => Object.fromEntries(s.breakdown[metric].map(r => [r.key, r[col]]));
    const recoverable = (total, cells) => {
        const hidden = Object.values(cells).filter(v => typeof v !== 'number');
        return hidden.length === 1 && typeof total === 'number';
    };
    ['all', 'week'].forEach((col) => {
        const page = got('page', col);
        const vp = got('vp', col);
        const lens = got('lens', col);
        const h = s.headline[col];
        assert(!recoverable(h.visits, page) && page['404'] === SMALL && page['case-studies'] === HELD && page.index === 30,
            `Complements (${col}): 404's 2 page views stay hidden, with case studies' 8 held beside them (${JSON.stringify(page)})`);
        assert(!recoverable(h.visits, vp) && vp.s === SMALL && vp.m === HELD && vp.l === 25,
            `Complements (${col}): so do the 3 on phones, with the 12 on tablets held (${JSON.stringify(vp)})`);
        assert(!recoverable(h.lensVisits, lens) && lens['climate-risk'] === SMALL && lens.water === HELD && h.lensVisits === 14,
            `Complements (${col}): and the lens beside the lens-link visits (${JSON.stringify(lens)})`);
    });
    assert(s.headline.all.visits === 40 && content.checkStats(s).length === 0, 'Complements: the totals stay shown, and the file passes the guard');

    // A hidden 0 gives nothing away, so nothing is held back for one: the
    // week before, 404 had no page views.
    const zero = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-21', 'visits', '', 3], ['2026-09-21', 'page', '404', 3], ['2026-09-21', 'vp', 'l', 3],
        [D, 'visits', '', 40], [D, 'page', 'index', 30], [D, 'page', 'research', 10], [D, 'vp', 'l', 40]
    ], known, TODAY).rows, { today: TODAY, known });
    const zp = Object.fromEntries(zero.breakdown.page.map(r => [r.key, r.week]));
    assert(zp['404'] === SMALL && zp.index === 30 && zp.research === 10, `Complements: a week's 0 is "<5" and holds nothing else back (${JSON.stringify(zp)})`);

    // Across the week-by-week table: the weeks add up to all time, so one
    // week's "<5" beside the others would be all time less the rest.
    const weekly = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-14', 'contact', '', 9], ['2026-09-21', 'contact', '', 7], [D, 'contact', '', 2],
        ['2026-09-14', 'visits', '', 50], ['2026-09-21', 'visits', '', 50], [D, 'visits', '', 50]
    ], known, TODAY).rows, { today: TODAY, known });
    const c = weekly.weeks.map(x => x.contact);
    assert(weekly.headline.all.contact === 18 && c.join() === `${SMALL},${HELD},9`,
        `Complements: a week's 2 contact messages stay hidden, and the smallest other week is held (${c.join(', ')} of ${weekly.headline.all.contact})`);
    assert(weekly.headline.week.contact === c[0] && content.checkStats(weekly).length === 0, 'Complements: ...in the headline too, and the guard agrees');

    // A chain: last week's page views held back in the week-by-week table
    // would come straight back as the sum of last week's pages, which then
    // gives the small week away. The pages column is held back as well.
    const chain = fetchStats.transform(fetchStats.cleanRows([
        ['2026-09-21', 'visits', '', 3], ['2026-09-21', 'page', 'index', 3], ['2026-09-21', 'vp', 'l', 3],
        [D, 'visits', '', 30], [D, 'page', 'index', 20], [D, 'page', 'research', 10], [D, 'vp', 'l', 30]
    ], known, TODAY).rows, { today: TODAY, known });
    assert(content.checkStats(chain).length === 0 && chain.weeks[1].visits === SMALL,
        `Complements: through a chain of sums, nothing hidden can be worked out (weeks ${chain.weeks.map(x => x.visits).join(', ')}; last week's pages ${chain.breakdown.page.map(r => `${r.key} ${r.week}`).join(', ')})`);
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
        ['a week with no weekly figures', s => { s.headline.week = null; }],
        ['a lone "<5" beside the figures it can be subtracted from (water shown beside sustainable-ai)', s => {
            const water = s.breakdown.lens.find(r => r.key === 'water');
            water.week = 21;
            water.all = 84;
        }],
        ['a lone "<5" in the week-by-week table, given away by all time', s => {
            s.headline.all.contact = 18;
            [1, 2, 3].forEach((i) => { s.weeks[i].contact = 5; });
        }],
        ['all time running on into today', s => { s.period.last = TODAY; s.period.days = 29; }],
        ['a part week at the start of the period', s => { s.period.first = COUNTED; s.period.days = 33; }],
        ['a week that is not Monday to Sunday', s => { s.week.start = '2026-09-27'; }],
        ['last week given as two different figures', s => { s.weeks[0].visits = 141; }],
        ['a share beside a hidden count', s => { s.breakdown.page.find(r => r.key === 'index').all = HELD; }],
        ['a referrer row with no host', s => { s.breakdown.ref.push({ key: '', week: 9, all: 9 }); }],
        ['a named referrer held back', s => { s.breakdown.ref.push({ key: 'held.example.com', week: HELD, all: HELD }); }],
        ['a part-week marker', s => { s.weeks[3].partial = true; }]
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
    // Code.gs counts a message sent with JavaScript off, which cannot pass
    // the signal on; the page has to say so rather than promise otherwise.
    assert(/with JavaScript off, the form cannot pass the signal on, and the message is counted/.test(text),
        'Privacy: names the one way a DNT or GPC visitor is still counted');
    assert(/No IP address/.test(text) && /No cookie/.test(text) && /No id of any kind/.test(text), 'Privacy: lists what is never collected');
    // The site does keep a few choices in the browser (theme, low-energy
    // mode, reading speed, the intro), so the claim is the count's, not the site's.
    assert(!/nothing is written to your device/.test(text) && /the count neither reads nor writes any/.test(text) && /theme, low-energy mode/.test(text),
        'Privacy: the no-storage claim is made for the count, and the site\'s own remembered choices are named');
    assert(/Any count under 5 is shown as <5/.test(text), 'Privacy: says cells under 5 are suppressed');
    assert(/a lone <5 would be the total less the rest, so the smallest figure beside it is held back as well/.test(text),
        'Privacy: says a figure is held back where subtraction would give a small one away');
    assert(/Every figure covers whole weeks/.test(text) && /No count for a single day is ever published/.test(text), 'Privacy: whole weeks, and no single day');
    assert(/grade it gave\. Never the ad itself/.test(text), 'Privacy: says the Assay\'s grade is among the features, and the ad never is');
    assert(/window/.test(doc.querySelector('.st-fields').textContent) && !/Screen width/.test(text), 'Privacy: vp is the window\'s width, not the screen\'s');
    assert(/Google Sheet in my own Google account/.test(text) && /a key that the scheduled job keeps as a secret/.test(text),
        'Privacy: says where the raw daily totals live, and that only the weekly job can read them');
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

    // When the redesigned homepage goes live is Moses's call (S7): before
    // four weeks of counts, or after. The page said "the site measures
    // itself first and changes second", which only the second makes true.
    // What it says now holds either way.
    const why = (Array.from(doc.querySelectorAll('section')).find(s => /Why count at all/.test(s.textContent)) || { textContent: '' }).textContent.replace(/\s+/g, ' ');
    assert(/The first four weeks of these numbers are the baseline every change after them is judged against\./.test(why) &&
        !/\bfirst and changes second\b|redesign will be judged/.test(why),
        'Why: the baseline is for every change after the first four weeks, true whenever the redesign goes live (S7)');
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

    // Complements are "held", never "<5", which would be false of them, and
    // the key says what each means.
    const waterRow = lensRows.find(tr => /Water/i.test(tr.querySelector('th').textContent));
    assert(waterRow && /held/.test(waterRow.textContent) && !/<5/.test(waterRow.textContent) && waterRow.lastElementChild.textContent === '—',
        'Counting: a figure held back beside a small one reads "held", with no share');
    const key = doc.querySelector('.st-key').textContent.replace(/\s+/g, ' ');
    assert(/<5 means fewer than 5/.test(key) && /held means 5 or more/.test(key), 'Counting: the key explains both "<5" and "held"');
    assert(/Every figure covers whole weeks, Monday to Sunday/.test(doc.querySelector('.st-status').textContent.replace(/\s+/g, ' ')),
        'Counting: says every figure covers whole weeks');
    assert(!/part of a week/.test(doc.body.textContent), 'Counting: there is no part week to mark');
    const bytesText = doc.querySelector('[aria-labelledby="st-bytes-h"]').textContent.replace(/\s+/g, ' ');
    assert(/Unlike the carbon receipt/.test(bytesText) && !/as the carbon receipt in the homepage footer is/.test(bytesText),
        'Counting: the bytes section says how its measure differs from the carbon receipt\'s, not that they are the same');
    const refText = doc.querySelector('[aria-labelledby="st-ref-h"]').textContent;
    assert(!/No referring site/.test(refText) && /no referring site .* is not in this table/i.test(refText.replace(/\s+/g, ' ')),
        'Counting: the referrer table has no "no referrer" row (Code.gs never stores one), and says so');

    // The counter's rules the page states are printed from its code and
    // marked (tests/claims.test.js holds the committed page): drawn with
    // counts, every mark still says what the code says, and outside the
    // counts every other number is a date, "one" or a count of what the
    // page shows. The page typed in 30 a minute, under 5 and up to 20 names.
    const figures = require('../scripts/lib/claims.js');
    const rules = Object.assign(content.counterRules(), { baselineWeeks: require('../scripts/build-content.js').BASELINE_WEEKS });
    const marks = Array.from(doc.querySelectorAll('[data-rule]'));
    const off = marks.filter(el => !figures.agrees(String(rules[el.getAttribute('data-rule')]), el.textContent.trim()));
    const keys = new Set(marks.map(el => el.getAttribute('data-rule')));
    const frame = doc.body.cloneNode(true);
    frame.querySelectorAll(figures.DRAWN['stats.html'].map(d => d.sel).concat('[data-rule]', 'script', 'style').join(', ')).forEach(el => el.remove());
    const text = frame.textContent.replace(/\s+/g, ' ');
    const loose = [];
    const NUM = /(?<![A-Za-z\d.,])\d+(?:[.,]\d+)*/g;
    let m;
    while ((m = NUM.exec(text))) if (!figures.exemptAt(text, m.index, m.index + m[0].length)) loose.push(text.slice(m.index - 30, m.index + 30));
    figures.wordRuns(text).filter(r => !figures.wordExempt(text, r)).forEach(r => loose.push(text.slice(r.index - 30, r.end + 30)));
    assert(marks.length > 10 && !off.length && ['referrersListed', 'vpLarge', 'perMinute', 'featuresMax'].every(k => keys.has(k)) && !loose.length,
        `Counting: the counter's rules are printed from its code, marked, and nothing else in the page's frame is a figure (${marks.length} marks; ${off.map(el => `${el.getAttribute('data-rule')} "${el.textContent}"`).concat(loose.map(t => `"…${t}…"`)).join('; ') || 'all held'})`);

    // Without a whole week there is no counting file to draw: the guard
    // refuses one.
    const noWeek = JSON.parse(JSON.stringify(stats));
    noWeek.week = null;
    noWeek.headline.week = null;
    assert(content.checkStats(noWeek).some(p => /week is missing/.test(p)), 'Counting: a counting file without a whole week is refused');
}

// --- the page is linked, listed and budgeted --------------------------------------
{
    ['index.html', 'case-studies.html', 'research.html', 'stats.html', 'carbon-ai.html'].forEach((file) => {
        const doc = new JSDOM(fs.readFileSync(path.join(ROOT, file), 'utf8')).window.document;
        const link = doc.querySelector('footer a[href="stats.html"]');
        assert(!!link && /open counts/i.test(link.textContent), `Footer: ${file} links to the open counts`);
    });
    // Every page counts its visits, so every page leads to what that sends:
    // the field report from its note on the counter, the 404 page from its
    // links (it can be served at any address, so its links are absolute).
    const counted = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && /<script[^>]*src="(?:\/sustaintheworld\/)?count\.js"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    const unlinked = counted.filter(f => !new JSDOM(fs.readFileSync(path.join(ROOT, f), 'utf8')).window.document
        .querySelector('a[href="stats.html"], a[href="/sustaintheworld/stats.html"]'));
    assert(counted.length >= 7 && unlinked.length === 0, `Links: every page that counts its visits links to the open counts (${unlinked.join(', ') || `all ${counted.length}`})`);
    const homeFoot = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).window.document.querySelector('footer a[href="stats.html"]').textContent;
    assert(/what this site counts, and what it never collects/.test(homeFoot), 'Footer: the homepage link reads as two things, what is counted and what never is');
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
    assert(/git add content\/stats\.json stats\.html README\.md\s*\n/.test(yml), 'Action: commits content/stats.json, stats.html and the README\'s budget table only');
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
        '/empty': [200, 'application/json', JSON.stringify({ v: 1, rows: [] })],
        // Code.gs's own replies: a sheet it could not read this time, and a
        // request without the right token.
        '/busy': [200, 'application/json', JSON.stringify({ status: 'error', message: 'The counts are unavailable right now.' })],
        '/refused': [200, 'application/json', JSON.stringify({ status: 'refused', message: 'The counts are read by the site\'s weekly build, with a token.' })],
        '/young': [200, 'application/json', JSON.stringify({ v: 1, rows: [[today, 'visits', '', 12]] })]
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
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/busy` });
        assert(r.code === 0 && untouched() && /could not read its sheet/.test(r.out),
            `Script: the endpoint's own error reply (a sheet it could not read) is a skip, not a configuration failure (${r.code})`);

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/refused` });
        assert(r.code === 1 && untouched() && /refused the request/.test(r.out) && /STATS_TOKEN/.test(r.out),
            'Script: a refused token is a configuration mistake, and fails, naming the token');

        reset();
        r = await run({ STATS_OUT: out, STATS_SOURCE_URL: `${base}/young` });
        assert(r.code === 0 && untouched() && /no full week/.test(r.out), 'Script: counts with no whole week yet publish nothing, and pass');

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
