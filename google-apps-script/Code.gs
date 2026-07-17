/**
 * Google Apps Script - Contact Form Response Collector
 * This script collects contact form submissions and stores them in a Google Sheet
 */

/**
 * Gets the active sheet and ensures headers are present
 */
function getSheetWithHeaders() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  // If this is the first time, add headers
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'Timestamp',
      'Name',
      'Email',
      'Subject',
      'Message'
    ]);

    // Format header row
    var headerRange = sheet.getRange(1, 1, 1, 5);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
  }

  return sheet;
}

/**
 * Handles GET requests - Returns a simple HTML page
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(
    '<html><body>' +
    '<h2>Form Response Capture API</h2>' +
    '<p>This endpoint is active and ready to receive POST requests.</p>' +
    '<p>Send POST requests with form data to capture responses.</p>' +
    '<p>Current Spreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getName() + '</p>' +
    '</body></html>'
  );
}

var OWNER_EMAIL = "moseskollehsesay@gmail.com";

// Basic abuse protection: the endpoint is public, so cap how fast and how
// often it will accept submissions (per deployment, via the script cache).
var MIN_SECONDS_BETWEEN_SUBMISSIONS = 15;
var MAX_SUBMISSIONS_PER_HOUR = 20;

function jsonResponse(status, message) {
  return ContentService.createTextOutput(JSON.stringify({
    'status': status,
    'message': message
  })).setMimeType(ContentService.MimeType.JSON);
}

function isRateLimited() {
  var cache = CacheService.getScriptCache();
  if (cache.get('contact-throttle')) return true;

  var hourCount = parseInt(cache.get('contact-hour-count'), 10) || 0;
  if (hourCount >= MAX_SUBMISSIONS_PER_HOUR) return true;

  cache.put('contact-throttle', '1', MIN_SECONDS_BETWEEN_SUBMISSIONS);
  cache.put('contact-hour-count', String(hourCount + 1), 3600);
  return false;
}

/**
 * Handles POST requests - Captures form data and saves to Google Sheet
 */
function doPost(e) {
  try {
    // Parse the incoming data
    var data = JSON.parse(e.postData.contents);

    // Honeypot: real visitors never see this field. If it's filled, a bot
    // did it — claim success so it moves on, but record and send nothing.
    if (data.website) {
      return jsonResponse('success', 'Response recorded successfully!');
    }

    var name = String(data.name || '').trim().slice(0, 200);
    var email = String(data.email || '').trim().slice(0, 200);
    var subject = String(data.subject || '').trim().slice(0, 300);
    var message = String(data.message || '').trim().slice(0, 5000);

    if (!name || !message) {
      return jsonResponse('error', 'Name and message are required.');
    }
    var emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailLooksValid) {
      return jsonResponse('error', 'Please provide a valid email address.');
    }
    if (isRateLimited()) {
      return jsonResponse('error', 'Too many submissions right now — please try again in a minute.');
    }

    // Get the sheet with headers and append the submission
    var sheet = getSheetWithHeaders();
    sheet.appendRow([new Date(), name, email, subject, message]);
    sheet.autoResizeColumns(1, 5);

    var emailSubject = "New Submission from " + name;
    var emailBody = "Here are the details of the new response:\n\n" +
                    "Name: " + name + "\n" +
                    "Email: " + email + "\n" +
                    "Subject: " + (subject || 'No Subject') + "\n" +
                    "Message: " + message + "\n\n" +
                    "Timestamp: " + new Date();

    // Notify the owner only. The submitter's address goes in replyTo so a
    // plain "Reply" reaches them — never CC it, or the public endpoint
    // becomes a way to send mail to arbitrary addresses from this account.
    MailApp.sendEmail(OWNER_EMAIL, emailSubject, emailBody, { replyTo: email });

    return jsonResponse('success', 'Response recorded successfully!');

  } catch (error) {
    return jsonResponse('error', error.toString());
  }
}

/**
 * Test function to verify the script is working
 */
function testScript() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  Logger.log('Sheet name: ' + sheet.getName());
  Logger.log('Last row: ' + sheet.getLastRow());
}

/**
 * Test function to simulate a form submission
 */
function testCapture() {
  var testData = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test Subject',
        message: 'This is a test submission from the contact form'
      })
    }
  };

  var result = doPost(testData);
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
