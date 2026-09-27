# 📋 Google Apps Script - Form Response Capture

Automatically capture form responses and store them in Google Sheets using Google Apps Script.

## 📁 Files Included

- **`Code.gs`** - Main Google Apps Script code
- **`DEPLOYMENT_GUIDE.md`** - Step-by-step deployment instructions
- **`test-form.html`** - HTML test form to verify your deployment

## 🚀 Quick Start

1. Read the **`DEPLOYMENT_GUIDE.md`** for detailed instructions
2. Deploy the `Code.gs` script as a web app
3. Use `test-form.html` to send a test submission, then check the sheet (it
   posts in `no-cors` mode, so it cannot see whether the row landed)
4. Integrate the URL into your website or application

## ✨ Features

- ✅ Writes to a **configured** spreadsheet and tab, creating headers on first use
- ✅ Captures timestamp, name, email, subject, message and source
- ✅ Emails the owner once per submission, with the visitor as reply-to (never copied)
- ✅ Accepts a JSON string (answered with a JSON status) or a plain form post from a browser without JavaScript (answered with a short page and a link back)
- ✅ Escapes spreadsheet formulas so submissions can never execute
- ✅ Serialises writes with `LockService`, so concurrent submissions cannot collide
- ✅ Per-submitter rate limiting, plus an optional Cloudflare Turnstile check
- ✅ Keeps the site's own cookieless visit counts as daily totals, and serves them for `stats.html` (see [The visit counter](#-the-visit-counter))
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

## 📈 The visit counter

The same deployment keeps the site's own visit counts. `count.js`, loaded on
every page, sends one payload per page view to `POST ?action=count` as the page
is hidden or left. It sends nothing at all when the browser has Do Not Track or
Global Privacy Control on. The request carries no cookies and no referrer
(`fetch` with `keepalive`, `credentials: 'omit'`; `sendBeacon` would have sent
the visitor's Google cookies along to `script.google.com`), and Apps Script
does not give the script the visitor's IP address or user agent, so it has
none to store. (Google, which runs the endpoint, receives the request as it
receives any other.) The privacy model in full, and why `sendBeacon` was not
used, is in the repository's README, under "The visit counter and privacy".

**The payload, schema v1.** Exactly these eight keys, and nothing else:

```
{"v":1,"page":"index","lens":"","deepest":"contact","features":["cv-download-hero","cv-download","module-dossier"],"ref":"www.linkedin.com","vp":"m","kb":284}
```

| Key | What it holds |
| --- | --- |
| `v` | `1`, the schema version |
| `page` | the page's file name without `.html` (`index`, `case-studies`, `research`, `carbon-ai`, `field-report`, `stats`), or `404` |
| `lens` | the `?lens=` the visit arrived with, or `""` |
| `deepest` | the id of the furthest top-level part of `<main>` that came on screen, or `""` |
| `features` | up to 20 distinct names: `data-analytics` hooks clicked, modules fetched on demand (`module-terminal`), `contact-form-submit` |
| `ref` | the referring site's host only (`www.linkedin.com`), `""` if none or this site |
| `vp` | viewport class: `s` under 600 px, `m` under 1024 px, `l` wider |
| `kb` | whole KB this visit transferred (Resource Timing `transferSize`), so a cached revisit counts as the near-zero it is |

The server rejects, silently, anything that is not exactly that: an unknown or
missing key, a wrong type, a name that is not `[a-z0-9-]{1,40}`, more than 20
features, a `kb` outside 0 to 100000. `tests/apps-script.test.js` and
`tests/count.test.js` hold the two ends to the same schema, and
`npm run smoke` checks the request a real browser sends.

**The aggregate.** Each accepted payload adds one to a handful of daily totals
on a `Daily` tab, created on first use, in long format: `date` (Europe/Amsterdam),
`metric`, `key`, `count`. `metric` is `visits`, `page`, `lens`, `deepest`,
`feature`, `ref`, `vp`, `kb` (the day's summed KB) or `contact` (one per
accepted contact-form submission, unless the site's script says the browser
sent Do Not Track or Global Privacy Control). An empty lens, deepest or ref
adds no row. A visit updates the day's rows in place, under the same lock as
the contact form, so the tab grows by distinct keys per day, not by visits.
A count waits for that lock at most 1.5 s, and past 30 counts a minute is
dropped before asking, so counts never keep a message waiting. Nothing is
suppressed here: the build of `stats.html` hides small counts before
anything is published.

**Reading it.** `GET ?action=stats&token=<STATS_TOKEN>` returns
`{"v":1,"rows":[[date, metric, key, count], ...]}` for the last 400 days.
These are the raw totals, small counts included, and this address is in
`count.js` on every page, so without a `token` equal to the `STATS_TOKEN`
script property, or while that property is unset, the reply is
`{"status":"refused",...}` and no rows. If the sheet cannot be read, the
reply is `{"status":"error",...}` and no rows, so a build stops rather than
publishing zeros (and tries again the next week). A `Daily` tab published as
CSV (File → Share → Publish to web; header `date,metric,key,count`) also
works as a source, but anyone with its link can read it, unsuppressed.

**Testing it without moving the numbers.** Add `&test=1` to either action and
it uses a `DailyTest` tab instead: `POST ?action=count&test=1` with a payload,
then `GET ?action=stats&test=1&token=<STATS_TOKEN>` to read it back.
`testCounter()` in the editor does exactly that.

**After changing `Code.gs`,** publish it as a new version of the *existing*
deployment (Deploy → Manage deployments → Edit → Version: New version), so the
web app URL the site already uses stays the same.

## 📊 Example Usage

### HTML Form
```html
<form action="YOUR_WEB_APP_URL" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <input name="subject">
  <textarea name="message" required></textarea>
  <button type="submit">Submit</button>
</form>
```

### JavaScript
```javascript
// No Content-Type header: a JSON content type needs a CORS preflight, which
// Apps Script cannot answer. A plain string body avoids it.
fetch('YOUR_WEB_APP_URL', {
  method: 'POST',
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
# -L follows Apps Script's redirect to the result; do not add -X POST
curl -L "YOUR_WEB_APP_URL" \
  -H "Content-Type: text/plain;charset=utf-8" \
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
  the throttle cache stores no personal data): one message per 15 seconds and
  5 per hour. The endpoint-wide counter is a much higher circuit breaker (200
  an hour) — one visitor can no longer lock out everyone else, which the
  previous global-only limiter allowed with a double-click.
- **Honeypot**: a hidden `website` field; anything that fills it gets a success
  response and no record.
- **Turnstile**: optional per-visitor challenge, verified server-side, failing
  closed if Cloudflare is unreachable.
- **Error messages**: failures return a generic message to the caller and log
  the detail. Returning `error.toString()` leaked spreadsheet ids to anyone who
  could make the script throw.
- Deployment access still matters. The portfolio's form needs "Anyone",
  because its visitors are not signed in to Google; "Anyone with Google
  account" suits only a form whose users all are.

## 📚 Documentation

See **`DEPLOYMENT_GUIDE.md`** for complete documentation including:
- Step-by-step deployment
- Customization options
- Integration examples
- Troubleshooting guide

## 🌐 Integration with SustainTheWorld Website

The portfolio's contact form already posts here, and so does its visit
counter. The deployment's URL is written in three places, and all three must
match it: `GOOGLE_APPS_SCRIPT_URL` in `script.js` (the form with JavaScript),
the form's `action` in `index.html` (without it), and the address in
`count.js`, with `?action=count` added. `tests/html.test.js` fails if they
disagree. Outside the code, the repository variable `STATS_SOURCE_URL` holds
it too, for the weekly Open counts Action.

`tests/apps-script.test.js` runs this script against stand-ins for Google's
services; it cannot see the live deployment. To check that, follow items C1
to C3 (the contact form) and S1 to S3 (the counter) in
[`docs/owner-checklist.md`](../docs/owner-checklist.md).

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
