/**
 * Google Apps Script - Form Response Capture
 * This script captures form submissions and stores them in a Google Sheet
 */

// Configuration - You can customize these
var SHEET_NAME = "Form Responses";
var TIMESTAMP_COLUMN = "Timestamp";

/**
 * Creates a new sheet if it doesn't exist
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Add header row
    sheet.appendRow([TIMESTAMP_COLUMN, "Name", "Email", "Message", "Additional Data"]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold");
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

/**
 * Handles POST requests - Captures form data and saves to Google Sheet
 */
function doPost(e) {
  try {
    // Get the sheet
    var sheet = setupSheet();

    // Parse the incoming data
    var data = {};

    // Handle JSON payload
    if (e.postData && e.postData.type === 'application/json') {
      data = JSON.parse(e.postData.contents);
    }
    // Handle form data
    else if (e.parameter) {
      data = e.parameter;
    }
    // Handle text payload
    else if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (err) {
        data = { raw_data: e.postData.contents };
      }
    }

    // Extract common fields
    var timestamp = new Date();
    var name = data.name || data.fullname || data.full_name || "";
    var email = data.email || "";
    var message = data.message || data.comment || data.feedback || "";

    // Collect any additional fields
    var additionalData = {};
    for (var key in data) {
      if (key !== 'name' && key !== 'fullname' && key !== 'full_name' &&
          key !== 'email' && key !== 'message' && key !== 'comment' && key !== 'feedback') {
        additionalData[key] = data[key];
      }
    }

    var additionalDataStr = Object.keys(additionalData).length > 0 ?
                           JSON.stringify(additionalData) : "";

    // Append the row to the sheet
    sheet.appendRow([
      timestamp,
      name,
      email,
      message,
      additionalDataStr
    ]);

    // Auto-resize columns for better visibility
    sheet.autoResizeColumns(1, 5);

    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        'status': 'success',
        'message': 'Form response captured successfully',
        'timestamp': timestamp.toISOString(),
        'row': sheet.getLastRow()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        'status': 'error',
        'message': error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Test function to verify the script works
 */
function testCapture() {
  var testData = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        message: 'This is a test submission',
        source: 'manual test'
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
