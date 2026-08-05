# 📋 Google Apps Script - Form Response Capture

Automatically capture form responses and store them in Google Sheets using Google Apps Script.

## 📁 Files Included

- **`Code.gs`** - Main Google Apps Script code
- **`DEPLOYMENT_GUIDE.md`** - Step-by-step deployment instructions
- **`test-form.html`** - HTML test form to verify your deployment

## 🚀 Quick Start

1. Read the **`DEPLOYMENT_GUIDE.md`** for detailed instructions
2. Deploy the `Code.gs` script as a web app
3. Use `test-form.html` to test your deployment
4. Integrate the URL into your website or application

## ✨ Features

- ✅ Writes to a **configured** spreadsheet and tab, creating headers on first use
- ✅ Captures timestamp, name, email, subject, message and source
- ✅ Accepts JSON payloads and returns a JSON status
- ✅ Escapes spreadsheet formulas so submissions can never execute
- ✅ Serialises writes with `LockService`, so concurrent submissions cannot collide
- ✅ Per-submitter rate limiting, plus an optional Cloudflare Turnstile check
- ✅ No external dependencies required

## ⚙️ Configuration

Nothing is hardcoded in `Code.gs`. Set these in **Project Settings → Script
Properties** before the first submission (see `DEPLOYMENT_GUIDE.md` step 2b):

| Property | Required | Purpose |
| --- | --- | --- |
| `SPREADSHEET_ID` | yes | Which spreadsheet to write to |
| `OWNER_EMAIL` | yes | Where notifications go |
| `SHEET_NAME` | no | Tab name, default `Responses` |
| `TURNSTILE_SECRET` | no | Enables per-visitor challenge verification |

Run `testConfiguration()` from the editor to check them, and
`testFormulaEscaping()` to confirm the injection defences are intact.

## 📊 Example Usage

### HTML Form
```html
<form action="YOUR_WEB_APP_URL" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <input name="subject" required>
  <textarea name="message" required></textarea>
  <button type="submit">Submit</button>
</form>
```

### JavaScript
```javascript
fetch('YOUR_WEB_APP_URL', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    subject: 'Inquiry',
    message: 'Hello!'
  })
});
```

### cURL
```bash
curl -X POST "YOUR_WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com","subject":"Test","message":"Test message"}'
```

## 🔒 Security

The endpoint is public by necessity — a contact form nobody can reach is not a
contact form — so the script treats every payload as hostile.

- **Formula injection**: values starting with `=`, `+`, `-`, `@` (or a leading
  tab/carriage return) are prefixed with `'` and written to cells forced to
  plain-text format. Without this, a message beginning `=IMPORTXML(...)`
  becomes a live formula the moment the owner opens the sheet, able to read
  neighbouring cells and send them to an attacker's server.
- **Concurrent writes**: all sheet access runs inside a `LockService` critical
  section, so two simultaneous submissions cannot claim the same row.
- **Fixed target**: the sheet is opened by id and name, never
  `getActiveSheet()`.
- **Rate limiting**: limits are per-submitter (keyed on a hash of the email, so
  the throttle cache stores no personal data). The endpoint-wide counter is a
  much higher circuit breaker — one visitor can no longer lock out everyone
  else, which the previous global-only limiter allowed with a double-click.
- **Honeypot**: a hidden `website` field; anything that fills it gets a success
  response and no record.
- **Turnstile**: optional per-visitor challenge, verified server-side, failing
  closed if Cloudflare is unreachable.
- **Error messages**: failures return a generic message to the caller and log
  the detail. Returning `error.toString()` leaked spreadsheet ids to anyone who
  could make the script throw.
- Deployment access still matters: prefer "Anyone with Google account" if you
  do not need anonymous submissions.

## 📚 Documentation

See **`DEPLOYMENT_GUIDE.md`** for complete documentation including:
- Step-by-step deployment
- Customization options
- Integration examples
- Troubleshooting guide

## 🌐 Integration with SustainTheWorld Website

This script can be integrated with the main website's contact form to automatically capture and store all form submissions in a centralized Google Sheet.

## 📞 Support

For issues or questions:
1. Check the deployment guide
2. Review Apps Script execution logs
3. Test with the provided test form
4. Verify your web app URL

---

**Version**: 1.0.0
**License**: Open Source
**Project**: SustainTheWorld
