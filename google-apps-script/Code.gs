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

/**
 * Handles POST requests - Captures form data and saves to Google Sheet
 */
function doPost(e) {
  try {
    // Get the sheet with headers
    var sheet = getSheetWithHeaders();

    // Parse the incoming data
    var data = JSON.parse(e.postData.contents);

    // Prepare row data
    var rowData = [
      new Date(), // Timestamp
      data.name || '',
      data.email || '',
      data.subject || '',
      data.message || ''
    ];

    // Append the data to the sheet
    sheet.appendRow(rowData);

    // Auto-resize columns for better readability
    sheet.autoResizeColumns(1, 5);

    // Send email notification
    var name = data.name || 'Anonymous';
    var email = data.email || '';
    var subject = data.subject || 'No Subject';
    var message = data.message || '';
    var timestamp = new Date();

    var emailSubject = "New Submission from " + name;
    var emailBody = "Here are the details of the new response:\n\n" +
                    "Name: " + name + "\n" +
                    "Email: " + email + "\n" +
                    "Subject: " + subject + "\n" +
                    "Message: " + message + "\n\n" +
                    "Timestamp: " + timestamp;

    // Check if an email was actually provided before trying to CC
    if (email && email.includes("@")) {
      MailApp.sendEmail(
        "moseskollehsesay@gmail.com", // Send to owner
        emailSubject,
        emailBody,
        {
          cc: email,           // CC the sender
          replyTo: email       // Allows you to hit "Reply" to email them back directly
        }
      );
    } else {
      // Fallback: If no valid email was given, just email yourself
      MailApp.sendEmail("moseskollehsesay@gmail.com", emailSubject, emailBody);
    }

    // Return success response
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'success',
      'message': 'Response recorded successfully!'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Return error response
    return ContentService.createTextOutput(JSON.stringify({
      'status': 'error',
      'message': error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
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
