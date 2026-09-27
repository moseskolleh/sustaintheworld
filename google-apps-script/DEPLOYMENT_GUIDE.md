# Google Apps Script - Form Response Capture
## Deployment Guide

This Google Apps Script receives the portfolio's contact-form submissions,
writes each one to a Google Sheet and emails the owner. The same deployment
keeps the site's own visit counts: `POST ?action=count` takes the one small
payload `count.js` sends per page view and adds it to daily totals, and
`GET ?action=stats` serves those totals to the weekly build of `stats.html`.
Everything below describes the current `Code.gs`; if the editor still holds
an older copy (one without `handleSubmission`, or without `handleCount`),
paste the current file in and redeploy as a new version (see *Updating an
Existing Deployment* at the end of this guide).

To check that the live site's form really works end to end, follow
[`docs/owner-checklist.md`](../docs/owner-checklist.md) (items C1 to C3); to
switch the counter on, items S1 to S3. The tests in this repository run
`Code.gs` against stand-ins for Google's services
(`tests/apps-script.test.js`); they cannot see the live deployment.

---

## 🚀 Quick Start Deployment

### Step 1: Create a New Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Give it a name (e.g., "Portfolio contact form")

### Step 2: Open Apps Script Editor

1. In your Google Sheet, click **Extensions** → **Apps Script**
2. Delete any default code in the editor
3. Copy the entire contents of `Code.gs` and paste it into the editor
4. Click the **Save** icon or press `Ctrl+S`
5. Give your project a name (e.g., "Portfolio contact form")

### Step 2b: Configure Script Properties (required)

The script holds no spreadsheet id, owner address or secret in its source, so
a copy of this repository never carries someone else's configuration. Set them
once, in the project itself:

1. In the Apps Script editor, click **Project Settings** (the gear in the left rail)
2. Scroll to **Script Properties** → **Add script property**
3. Add these:

| Property | Required | Value |
| --- | --- | --- |
| `SPREADSHEET_ID` | yes | The id from the sheet's URL — `docs.google.com/spreadsheets/d/`**`<this part>`**`/edit`. The visit counts go in the same spreadsheet, on a `Daily` tab the script creates |
| `OWNER_EMAIL` | yes | Where submission notifications are sent. Without it, submissions are still recorded but nobody is emailed |
| `SHEET_NAME` | no | Tab to write to. Defaults to `Responses`, and is created (with its header row) if missing |
| `TURNSTILE_SECRET` | no | Cloudflare Turnstile secret key. When present, every submission must carry a valid token |

4. Click **Save script properties**
5. Choose `testConfiguration` in the function menu and click **Run** — it
   reports anything missing in the execution log. It records no submission,
   though on its first run it creates the tab and its header row

Without `SPREADSHEET_ID` the script cannot open a sheet and every submission
returns an error. This is deliberate: an earlier version wrote to
`getActiveSpreadsheet().getActiveSheet()`, meaning whichever tab was last
clicked, which silently scattered submissions across tabs.

### Turnstile (optional, off by default)

Nothing third-party is loaded unless you switch this on.

1. Create a Turnstile widget at
   [dash.cloudflare.com](https://dash.cloudflare.com/?to=/:account/turnstile)
2. Put the **secret key** in the `TURNSTILE_SECRET` script property
3. Add the widget and Cloudflare's script to the contact form in `index.html`,
   using the **site key**:

   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
   <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
   ```

The site's own JavaScript already looks for the hidden
`cf-turnstile-response` input the widget creates, and forwards the token as
`turnstileToken`. Until the property is set, the server ignores the token and
falls back to the honeypot plus the per-submitter rate limits.

Switching it on would break two of the site's own rules, so it is a
decision, not just a setting: the page would load a script from another
origin (which `tests/html.test.js` and `npm run smoke` reject until they are
told to allow it), and a visitor without JavaScript could no longer send the
form, because the widget needs JavaScript to produce a token. Set the
property without adding the widget and every submission is refused.

### Step 3: Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon next to "Select type"
3. Choose **Web app**
4. Configure the deployment:
   - **Description**: anything that dates it, e.g. "contact form, 2026-09"
   - **Execute as**: **Me** — the script writes to your sheet and sends mail as you
   - **Who has access**: **Anyone** — the portfolio's visitors are not signed
     in to Google, so any narrower setting turns every submission away
5. Click **Deploy**
6. If prompted, click **Authorize access**
7. Select your Google account
8. Click **Advanced** → **Go to [Your Project Name] (unsafe)**
9. Click **Allow**
10. **Copy the Web App URL** - this is your endpoint!

The URL will look like:
```
https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXX/exec
```

The site holds this URL in **three** places, and all must match the live
deployment: `GOOGLE_APPS_SCRIPT_URL` in `script.js` (the JavaScript path),
the contact form's `action` attribute in `index.html` (the JavaScript-free
path), and the address in `count.js`, the visit counter, with
`?action=count` added (`tests/html.test.js` fails if they disagree). The
repository variable `STATS_SOURCE_URL`, which the weekly Open counts Action
reads, holds it too. A new deployment gets a new URL; a new *version* of an
existing deployment keeps it (see below), which is why updates should be done
that way.

### Step 4: Test Your Deployment

A plain GET is a health check that reveals nothing about the sheet (a GET
with `?action=stats` is the exception, below):

```bash
curl -L "YOUR_WEB_APP_URL"
# {"status":"ok","message":"Contact form endpoint is active. Send submissions as POST."}
```

A POST records a real row and sends a real email:

```bash
curl -L "YOUR_WEB_APP_URL" \
  -H "Content-Type: text/plain;charset=utf-8" \
  --data '{"name":"Deployment test","email":"you@example.com","subject":"Test","message":"Test submission","source":"curl"}'
# {"status":"success","message":"Response recorded successfully!"}
```

Apps Script answers a POST with a redirect to the result, so `-L` is needed,
and `-X POST` must *not* be used: it would make curl repeat the POST at the
redirect target, which only answers a GET.

`test-form.html` also sends a submission, but it posts in `no-cors` mode and
cannot read the reply, so it reports success whether or not the row landed.
Check the sheet.

The visit counter can be tested without moving the public numbers: `&test=1`
on either action uses a `DailyTest` tab instead of `Daily`. In the editor,
pick `testCounter` in the function menu and press **Run**; the execution log
should say `Counter OK: 8 DailyTest rows for today, e.g. [...]` (on a later
run the same day, the same rows count up). Over HTTP, the same thing:

```bash
curl -L "YOUR_WEB_APP_URL?action=count&test=1" \
  -H "Content-Type: text/plain;charset=utf-8" \
  --data '{"v":1,"page":"index","lens":"","deepest":"contact","features":["cv-download-hero","module-dossier"],"ref":"www.linkedin.com","vp":"m","kb":284}'
# (an empty reply, whether the payload was accepted or not)

curl -L "YOUR_WEB_APP_URL?action=stats&test=1"
# {"v":1,"rows":[["2026-09-27","visits","",1],["2026-09-27","page","index",1],...]}
```

Without `&test=1`, `?action=stats` returns the real daily totals, which is
what the Open counts Action reads. If it returns the health check instead
(`{"status":"ok",...}`), the live deployment is older than the counter:
redeploy as a new version.

---

## 📊 Features

- **Configured target**: writes to the spreadsheet in `SPREADSHEET_ID` and the
  tab in `SHEET_NAME` (default `Responses`), creating the tab and a bold,
  frozen header row on first use
- **Two ways in**: the site's JavaScript posts a JSON string and gets JSON
  back (`{"status": "success" | "error", "message": "…"}`); a browser without
  JavaScript posts the form itself (`application/x-www-form-urlencoded`) and
  gets a small page back — "Thank you" or "Something went wrong", the reason,
  and a link back to the form
- **Validation**: name and message required, email format checked, fields
  capped at 200 (name, email), 300 (subject), 5,000 (message) and 100
  (source) characters
- **Owner notification**: one email per submission to `OWNER_EMAIL`, with the
  visitor in `replyTo`. A failed email never fails the submission; the row is
  already written
- **Health check**: a GET without `?action=stats` returns
  `{"status":"ok", "message": …}` and says nothing about the sheet behind it
- **Visit counter**: `POST ?action=count` accepts only the counter's payload,
  exactly (the eight keys of schema v1, each of the right type, at most 20
  features), and adds one to the day's totals on the `Daily` tab; anything
  else is dropped without a word, and the reply is always empty. Each
  accepted contact-form submission also adds one to the day's `contact`
  total
- **Daily totals, served**: `GET ?action=stats` returns
  `{"v":1,"rows":[[date, metric, key, count], ...]}` for the last 400 days,
  for the weekly build of `stats.html`. On failure the reply has no `rows`,
  so a build stops rather than publish zeros

---

## 📝 Data Structure

The script creates a sheet with these columns:

| Timestamp | Name | Email | Subject | Message | Source |
|-----------|------|-------|---------|---------|--------|
| Set by the script | `name` | `email` | `subject` (optional) | `message` | `source` (the site sends "Portfolio Website") |

Every cell in a submission row is formatted as plain text, and any value that
Sheets would read as a formula is stored with a leading `'` (see Security).
Nothing else a submission carries is stored: the honeypot and the Turnstile
token are read and then dropped, and any other field is ignored.

The visit counts go on a second tab, `Daily`, created on first use, with one
row per day and (metric, key), never one per page view:

| date | metric | key | count |
|------|--------|-----|-------|
| `2026-09-26` (Europe/Amsterdam) | `visits`, `page`, `lens`, `deepest`, `feature`, `ref`, `vp`, `kb` or `contact` | e.g. `index`, `www.linkedin.com`; empty for `visits`, `kb` and `contact` | how many page views that day had it; for `kb`, the day's KB summed, and for `contact`, the messages accepted |

The first three columns are written as plain text; keep them that way,
especially the date, if the tab is published as CSV. `DailyTest` has the same
shape and takes only `&test=1` requests. `google-apps-script/README.md`
explains every field of the payload.

---

## 🔧 Customization

### Change the tab

Set the `SHEET_NAME` script property. There is nothing to edit in `Code.gs`.

### Add more columns

1. Add the column name to the `HEADERS` array near the top of `Code.gs`
2. In `handleSubmission()`, read the new field from `data`, cap its length,
   and add it to the `appendSubmission(config, [...])` row in the same
   position, wrapped in `sanitizeForSheet()` like the others
3. Add the field to the form in `index.html` and to the `formData` object in
   `script.js`'s contact-form handler
4. An existing tab keeps its old header row; add the new heading to it by hand
5. Redeploy as a new version (below)

---

## 🌐 Integration Examples

### HTML form (works without JavaScript)

```html
<form action="YOUR_WEB_APP_URL" method="post">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <input type="text" name="subject">
  <textarea name="message" required></textarea>
  <div class="form-group-hp" aria-hidden="true">
    <label for="website">Leave this field empty</label>
    <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
  </div>
  <button type="submit">Send</button>
</form>
```

The `website` field is the honeypot. The site moves its wrapper off-screen
with CSS (`.form-group-hp`), so people never see it and anything that fills
it is a bot.

### JavaScript Fetch

Send the JSON as a plain string. Setting `Content-Type: application/json`
turns the request into one that needs a CORS preflight, which Apps Script
cannot answer, so the browser blocks it before it is sent.

```javascript
fetch('YOUR_WEB_APP_URL', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Jane Smith',
    email: 'jane@example.com',
    subject: 'Hello',
    message: 'Hello from JavaScript!'
  })
})
.then(response => response.json())
.then(data => console.log(data.status, data.message));
```

### Python

```python
import requests

url = 'YOUR_WEB_APP_URL'
data = {
    'name': 'Python User',
    'email': 'python@example.com',
    'subject': 'Hello',
    'message': 'Hello from Python!'
}

response = requests.post(url, json=data)
print(response.json())
```

---

## 🔒 Security Considerations

The endpoint is public by necessity, so the script treats every payload as
hostile. `google-apps-script/README.md` explains each defence; in short:

1. **Formula injection**: values beginning `=`, `+`, `-` or `@` (or a tab or
   carriage return) are stored as text, never as live formulas
2. **Concurrent writes**: sheet access runs inside a `LockService` lock
   (15 s timeout), so two submissions cannot claim the same row
3. **Honeypot**: a submission with a non-empty `website` field is told it
   succeeded, and nothing is recorded or sent
4. **Rate limiting**, per submitter (keyed on a hash of the email address, so
   the cache holds no personal data): one message per 15 seconds and 5 per
   hour. A circuit breaker for the whole endpoint allows 200 per hour, far
   above any one visitor, so one person cannot lock everyone else out.
   Google's own [quotas](https://developers.google.com/apps-script/guides/services/quotas)
   (for example, daily email recipients) apply on top
5. **Errors**: visitors get a generic message; the detail goes to the
   execution log, so an error never leaks the spreadsheet id
6. **Access**: the deployment must be "Anyone" for the site's form to work
   (Step 3). "Anyone with Google account" suits only a form whose users all
   sign in to Google
7. **The counter**: a payload that is not exactly schema v1 changes nothing,
   and the reply never says why. Every string it stores is limited to
   letters, digits, dots, hyphens, underscores and a port's colon, in
   plain-text cells, so none can become a formula
8. **The daily totals are public**: anyone with the web app URL (it is in
   `count.js`, on every page) can read `?action=stats`, and a tab published
   as CSV is public too. Neither is suppressed; `stats.html` suppresses every
   count under 5 before anything is published. Whether the raw totals stay
   readable is the owner's decision (`docs/owner-checklist.md`, S3)

---

## 🐛 Troubleshooting

### "Authorization required" error
- Redeploy the web app and complete the authorization process

### "Permission denied" error
- Ensure "Execute as" is set to your account
- Ensure "Who has access" is "Anyone"

### Data not appearing in sheet
- Run `testConfiguration` from the editor: it names a missing property or a
  sheet it cannot open
- Look for the tab named in `SHEET_NAME`, or `Responses` if that is unset
- Open **Executions** in the editor's left rail for the log of each request;
  `doPost failed` or `handleSubmission failed` lines carry the reason
- `testCapture` sends one submission through `doPost` from inside the editor.
  It writes a real row, and a second run within 15 seconds is refused by the
  rate limit

### No visit counts arrive
- Check the live version: `curl -L "YOUR_WEB_APP_URL?action=stats"` should
  print `{"v":1,"rows":[...]}`. The health check instead means the
  deployment is older than the counter: redeploy as a new version
- Run `testCounter`: it should log `Counter OK` and write to `DailyTest`
- Your own browser sends nothing if it has Do Not Track or Global Privacy
  Control on, and a count is sent only when the tab is hidden or closed
- Open **Executions**: `handleCount failed` lines carry the reason. A payload
  that was rejected for its shape leaves no line, by design

### The Open counts Action fails
- "the JSON is not {"v":1,"rows":[...]}": `STATS_SOURCE_URL` points at a
  deployment older than the counter, or at something else. Redeploy, or
  correct the variable
- "the CSV does not start with the header date,metric,key,count": the CSV
  published is not the `Daily` tab
- "none of the N row(s) ... could be read", after lines such as "date is not
  YYYY-MM-DD": the published tab's date column is not plain text
  (Format → Number → Plain text)
- "the source answered with a web page, not stats": usually a Google
  sign-in page, which means the deployment's access is not "Anyone" or the
  tab is not published to the web. A deployment from before 2026-08-05 also
  answers with a page (its old health check): redeploy

### The site says "Something went wrong" but the row is there
- The deployment is older than the current `Code.gs`: an earlier version
  answered every JavaScript-free submission with "Something went wrong" and
  "undefined", even when it had recorded it. Redeploy as a new version

### Getting the Web App URL again
- In Apps Script editor: Deploy → Manage deployments
- Or run the `getWebAppUrl()` function

---

## 📚 Additional Resources

- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Web Apps Guide](https://developers.google.com/apps-script/guides/web)
- [SpreadsheetApp Reference](https://developers.google.com/apps-script/reference/spreadsheet)

---

## ♻️ Updating an Existing Deployment

Editing `Code.gs` (or pasting a new version into the Apps Script editor) does
**not** change the live endpoint by itself. To ship changes:

1. Paste the current `Code.gs` into the editor and save
2. Click **Deploy → Manage deployments**
3. Select the active deployment, click the **Edit** (pencil) icon
4. Under **Version**, choose **New version**, then click **Deploy**

The web app URL stays the same, so no site changes are needed. Manage
deployments lists each version with its date, which is how to tell whether
the live version is newer than a change to `Code.gs` in this repository
(`git log -- google-apps-script/Code.gs`). The visit counter needs a version
from 2026-09-27 or later: `?action=count` and `?action=stats` do not exist
before it. A quick outside check: `curl -L "YOUR_WEB_APP_URL?action=stats"`
prints `{"v":1,"rows":[...]}` only on a version that has them.

---

## 📞 Support

If you encounter issues:
1. Check **Executions** in the Apps Script editor
2. Verify the web app URL matches the one in `script.js` and `index.html`
3. Run `testConfiguration`, then `testCapture`
4. Check Google Apps Script quotas

---

**Created by**: SustainTheWorld Project
**License**: Open Source
