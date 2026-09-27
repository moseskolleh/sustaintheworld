# What only Moses can do or supply

The single list of everything the site needs from Moses: facts only he can
state, evidence only he holds, a recording only he can make, and checks on
accounts only he can open. It grows from the "What only Moses can supply" table
in [docs/plan.md](plan.md) and from what each wave of work found. An item is
ticked only once it can be seen to be done: in the repository, on the live
site, or by Moses saying so. Nothing below is ticked yet.

Each item says what is needed, where it goes, what it unlocks, and how to
check it. A path such as `content/profile.json` → `experience[4].teamSize`
means that file, then that field (lists count from 0). After editing anything
in `content/`, run `npm run build:content` and then `npm test`.

Last updated with wave 2 of the plan (Phase 1, the visit counter and open
counts, and Phase 6 steps 3, 6 and 7), 2026-09-27. Wave 1 covered Phase 0 and
the narration steps of Phases 2.5 and 4.3.

**Before this branch reaches the live site,** run the one-line check at the
top of S1, and if you can, do C2 (publish the current `Code.gs`, which now
includes the visit counter). The site's new visit counter posts to the same
deployment as the contact form, and the 2025 versions of the script would
record every page view as a message and email it to you; if the check says
the live script might be one of those, C2 must come first.

---

## Do first: prove the contact form works (Phase 0.9)

The repository can test `google-apps-script/Code.gs` against stand-ins
(`tests/apps-script.test.js`), but it cannot see the live Apps Script project,
its settings or its deployment. A form that fails silently is the most
expensive bug a portfolio can have, so do these three in order.

The site posts to this deployment, written in three places that must agree
(`npm test` fails if they do not): `GOOGLE_APPS_SCRIPT_URL` in `script.js`,
the contact form's `action` in `index.html`, and the visit counter's address
in `count.js`, which adds `?action=count`:

```
https://script.google.com/macros/s/AKfycbzgyqRUmu0d2UFjb0WxbYyoDbO8F9jVnlvIQnNAfMU0v8JFpH5KAefy4z9BNoQqd68/exec
```

- [ ] **C1. Confirm `SPREADSHEET_ID` and `OWNER_EMAIL` in Script Properties.**
  - *Where:* open the Apps Script project behind the form (from the response
    sheet: **Extensions → Apps Script**, or from
    [script.google.com](https://script.google.com)) → **Project Settings**
    (gear, left rail) → **Script Properties**.
  - *Check:* `SPREADSHEET_ID` equals the id in the response sheet's URL
    (`docs.google.com/spreadsheets/d/<id>/edit`), and `OWNER_EMAIL` is the
    inbox you read. `SHEET_NAME` is optional (default `Responses`). Leave
    `TURNSTILE_SECRET` unset: the site loads no Turnstile widget, so with it
    set every submission would be refused (and even with the widget, visitors
    without JavaScript could not send the form).
  - *Then:* in the editor, pick `testConfiguration` in the function menu and
    press **Run**. The execution log should say `Sheet: Responses (N rows)`
    (or the tab `SHEET_NAME` names) and `Configuration OK`. Anything else
    names what is missing.
  - *Unlocks:* submissions land in the right sheet and reach you by email.
    The visit counts (S1) go in the same spreadsheet, on a `Daily` tab the
    script creates, so the same `SPREADSHEET_ID` serves both. The counter
    needs one more property, `STATS_TOKEN`; S1 says how to make it.

- [ ] **C2. Redeploy the Apps Script as a new version, after #41 and #42,
  and now the visit counter.**
  - *Why:* PR #41 (merged 2026-09-02) added the JavaScript-free form path, and
    PR #42 (merged 2026-09-24) fixed it: before #42, every JavaScript-free
    submission was answered "Something went wrong" and "undefined", even when
    it had been recorded. Wave 2 (2026-09-27) added the visit counter's two
    actions, `?action=count` and `?action=stats`, to the same file. Editing
    code in the editor does not change the live endpoint; only a new
    deployment version does. One publish of the current file covers all
    three.
  - *When:* before this branch is merged to `main`, if you can (see S1).
  - *Steps:*
    1. Open `google-apps-script/Code.gs` in this repository (last changed
       2026-09-27, when the visit counter was added), copy all of it, and
       paste it over the code in the editor. Save.
    2. **Deploy → Manage deployments** → select the active **Web app**
       deployment → **Edit** (pencil) → **Version: New version** → **Deploy**.
       Keep **Execute as: Me** and **Who has access: Anyone**.
    3. Still in **Manage deployments**, check that the deployment's Web app
       URL is exactly the one above. If it differs, the site is posting
       somewhere else: either use that deployment, or put its URL in
       `script.js`, `index.html` and `count.js` (there with `?action=count`
       after it).
  - *Check:* Manage deployments shows the active deployment at a new version
    dated today; the editor's `handleSubmission` contains
    `var reply = function (status, message)` (the #42 fix), and the file has a
    `function handleCount` (the counter). From outside,
    `curl -L "<the URL above>?action=stats"` now prints `{"v":1,"rows":[...]}`
    instead of the health check.
  - *Unlocks:* the no-JavaScript form, which wave 1 made reachable, tells the
    visitor the truth.

- [ ] **C3. Send one real message from the live site, and see it arrive.**
  - *With JavaScript (the normal path):* open
    <https://moseskolleh.github.io/sustaintheworld/#contact>, fill in the form
    with an address you can read other than `OWNER_EMAIL`, a subject such as
    "Live test 2026-09-26", and a short message. Press **Send Message**. The
    page should say "Thank you for your message! It has been sent".
  - *Without JavaScript:* wait at least 15 seconds (the form allows one
    message per address per 15 seconds, and 5 per hour), turn JavaScript off
    for the site (Chrome: DevTools → `Ctrl/Cmd+Shift+P` → "Disable
    JavaScript", then reload), and send a second message. The browser should
    land on a plain page titled "Message sent" that says "Thank you" and
    "Response recorded successfully!", with a link back. "Something went
    wrong" or "undefined" means C2 has not taken effect.
    - This needs wave 1 on the live site. Until this branch is merged and
      GitHub Pages has rebuilt, the live homepage without JavaScript is still
      covered by its loading screen. To test the same server path before
      then, post the form's fields the way the browser would:

      ```bash
      curl -L "https://script.google.com/macros/s/AKfycbzgyqRUmu0d2UFjb0WxbYyoDbO8F9jVnlvIQnNAfMU0v8JFpH5KAefy4z9BNoQqd68/exec" \
        --data-urlencode "name=Live test, no JavaScript" \
        --data-urlencode "email=you@example.com" \
        --data-urlencode "message=Testing the form path"
      ```

      It should print a page containing "Thank you" and "Response recorded
      successfully!". Use an address you can read, and not `-X POST`.
  - *Check:* two new rows in the sheet's `Responses` tab, or the tab
    `SHEET_NAME` names (Source "Portfolio Website" for the first, empty for
    the second, since the form itself sends no source), and two emails
    titled "New Submission from …" in the `OWNER_EMAIL` inbox. Once C2 has
    published the counter, the `Daily` tab's `contact` row for today counts
    them too (2, if nothing else was sent that day). Replying to
    one should address the visitor's email. If a row is missing, open
    **Executions** in the Apps Script editor; a failed request is logged
    there with its reason.
  - *Unlocks:* Phase 0 step 9 is done: the form is known to work, not
    assumed to.

---

## Switch on the visit counter and the open counts (Phase 1)

Wave 2 built a cookieless visit counter (`count.js`, on every page), its end
in `Code.gs` (`POST ?action=count` adds a page view to daily totals, and
`GET ?action=stats&token=...` serves them to the weekly Action alone), and
`stats.html` with a weekly Action that fills it. None of it counts anything
until S1 and S2 are done. What is sent, what never is, and why, is in the
README under "The visit counter and privacy".

- [ ] **S1. Give the script a `STATS_TOKEN`, publish the counter, then run
  `testCounter()` once.**
  - *First, before this branch is merged to `main`:* find out how old the
    live script is. Run `curl -L "<the URL above>"` (or open that address in
    a browser). If the reply is an HTML page rather than one line of JSON
    (the old page says "Form Response Capture API" and names the
    spreadsheet), the live script is from before 2026-08-05, and may be one
    of the 2025 versions, which record any POST as a contact message and
    email it to you. Once the site ships `count.js`, that would be one row
    and one email per page view, so publish (below) before merging. If it prints `{"status":"ok",...}`, the live script is
    from 2026-08-05 or later: it reads a count as a message with no name and
    refuses it, recording nothing, so merging first is harmless, and nothing
    is counted until you publish.
  - *The token:* the daily totals `?action=stats` serves are not suppressed,
    and the web app's address is in `count.js` on every page, so the script
    serves them only to a request carrying `&token=` set to the
    `STATS_TOKEN` script property, and to nobody at all while it is unset.
    `stats.html` promises that no count under 5 and no single day's count is
    ever published, and this is what keeps that true. Make one with
    `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
    (or any long random string of letters, digits, `-` and `_`), and add it
    in **Project Settings → Script Properties** as `STATS_TOKEN`, beside
    `SPREADSHEET_ID` and `OWNER_EMAIL`. Keep it: S2 needs it, and it goes
    nowhere else.
  - *Where:* this is the same publish as C2: paste the current
    `google-apps-script/Code.gs`, then **Deploy → Manage deployments** →
    the active Web app deployment → **Edit** → **Version: New version** →
    **Deploy**. It must be a new version of the *existing* deployment, not a
    **New deployment**: that would get a new URL, and `script.js`,
    `index.html`, `count.js` and `STATS_SOURCE_URL` would all have to change.
  - *Then:* in the editor, pick `testCounter` in the function menu and press
    **Run**. The execution log should say
    `Counter OK: 9 DailyTest rows for today, e.g. [...]`. It writes only to a
    `DailyTest` tab, created on the first run; `Daily`, where the real counts
    go, is untouched. (Do not test with `testCapture`: it writes a real
    contact row and adds one to the public contact count.)
  - *Check:* `curl -L "<the URL above>?action=stats&token=<STATS_TOKEN>"`
    prints `{"v":1,"rows":[...]}`, and the same without `&token=...` prints
    `{"status":"refused",...}` and no rows; before the publish both printed
    the health check. Once the branch is live, open a page of the site in a
    browser with neither Do Not Track nor Global Privacy Control on, switch
    to another tab, and run the first `curl` again: today's `visits` row has
    gone up by one.
  - *Unlocks:* counts arriving daily, the first half of Phase 1's "done
    when"; and S2.

- [ ] **S2. Set the repository secret `STATS_SOURCE_URL`** (after S1).
  - *What:* the web app URL with `?action=stats` and the token from S1, that
    is
    `https://script.google.com/macros/s/AKfycbzgyqRUmu0d2UFjb0WxbYyoDbO8F9jVnlvIQnNAfMU0v8JFpH5KAefy4z9BNoQqd68/exec?action=stats&token=<STATS_TOKEN>`.
    (The `Daily` tab published as CSV also works as the source, but a
    published tab can be read by anyone who has its link, unsuppressed, and
    `stats.html` says the raw totals are not public; if you use it, that
    paragraph of `stats.html`, in `scripts/build-content.js`, has to change
    with it.)
  - *Where:* GitHub → the repository → **Settings → Secrets and variables →
    Actions → Secrets** → **New repository secret**, name
    `STATS_SOURCE_URL`. A secret, not a variable: it carries the token. The
    Action never prints the URL, only its host.
  - *Order:* after S1. Before it, `?action=stats` answers with the health
    check, and the Action fails rather than publish that. Without the right
    token it answers `refused`, and the Action fails and says so.
  - *If `main` is protected:* the Action commits `content/stats.json` and
    `stats.html` straight to `main` as `github-actions[bot]`. If a branch
    rule blocks direct pushes, let GitHub Actions bypass it, or the weekly
    commit fails.
  - *Check:* the Action runs from `main`, so after this branch is merged:
    **Actions → Open counts → Run workflow**. Its "Fetch the week's totals"
    step prints `fetch-stats: N row(s) from script.google.com (json), <first
    day> to <last day> → content/stats.json`, or
    `script.google.com has no daily totals yet` if nothing has been counted,
    or `... no full week of them, Monday to Sunday, has ended yet` before the
    first whole week is over (nothing is published until it is); when the
    figures changed, a commit "Update the open counts (weekly totals,
    suppressed below 5)" appears on `main`. After that it runs by itself
    every Monday at 04:17 UTC.
  - *Unlocks:* `stats.html` shows real figures, in whole weeks, every one
    under 5 held back, instead of "Counting has not started yet": the second
    half of Phase 1's "done when". The first figures appear on the Monday
    after the first full Monday-to-Sunday week of counting.

- [ ] **S3. Confirm that the raw daily totals stay private.** Built that
  way in wave 2's review; yours to reverse.
  - *What was decided:* `GET ?action=stats` used to serve the daily totals,
    unsuppressed, to anyone with the web app URL, which is in `count.js` on
    every page, while `stats.html` promised that no count under 5 and no
    single day's count is ever published. A small daily total can say more
    than it seems: a referring site seen once on one day, for example. So
    the endpoint now answers only the token in S1, and the page's promise
    holds from the day counting starts.
  - *If you would rather they were public:* say so. `Code.gs` would drop the
    token check, and `stats.html`'s "Where the raw totals live" and "Two
    limits" paragraphs (in `scripts/build-content.js`) would have to say
    that the daily totals, unsuppressed, can be read at the counter's
    address.
  - *Check:* after S1, `curl -L "<the URL above>?action=stats"`, without a
    token, prints `{"status":"refused",...}` and no `rows`.

- [ ] **S4. Decide whether the Assay's grade should be counted at all.**
  - *What:* when the Assay grades a pasted job ad, that page view's count
    carries the grade: `assay-high`, `assay-workable` or `assay-marginal`.
    The ad itself never leaves the page, but the grade is derived from it.
    The label beside the Assay's button says "in-browser · the ad is never
    sent", and its result note "the ad is never sent"; both are true either
    way. (The label used to say "nothing sent", which stopped being true
    when the grade began to be counted; wave 2's review corrected it.)
    `stats.html` names the grade among the features a page view can carry.
  - *Where:* if it should not be counted, say so: it is one line in
    `modules/interactives.js` (the `window.mks.track('assay-' + a.cls)`
    call), and `tests/count.test.js` and `tests/stats.test.js` would change
    with it.
  - *Check:* once removed, `modules/interactives.js` no longer calls
    `mks.track` with an `assay-` name, and `npm test` passes.

- [ ] **S5. Confirm the wording of `stats.html`.**
  - *What:* it speaks in the first person: "Every change I plan for this
    site is a bet about what a recruiter does on it…" and "kept in a Google
    Sheet in my own Google account".
  - *Where:* the page is generated; its text is in `scripts/build-content.js`
    (`renderStats` and the functions around it). Edit there, then run
    `npm run build:content` and `npm test`.
  - *Check:* <https://moseskolleh.github.io/sustaintheworld/stats.html>,
    once live, reads the way you would say it.

- [ ] **S6. After four full weeks of counting, record the baseline for the
  five numbers.**
  - *When:* the weeks run Monday to Sunday, Amsterdam time, and each Monday's
    run adds the week just ended. Counting starts once S1 is done and this
    branch is live; the days before the first Monday are in no figure, so
    the first four full weeks are complete about five Mondays later.
  - *What:* from `stats.html`'s week-by-week table, for each of those four
    weeks: messages through the contact form, CV downloads, lens-link visits
    (a proxy, and an upper bound: arrivals through a role link, since the
    totals cannot say whether that reader went on to a case study), the
    share of homepage views that reached Contact, and page views for scale.
    Brief uses stays empty until Phase 4.1 builds The Brief. Record a `<5`
    or a `held` as it stands, not a guess.
  - *Where:* `docs/plan.md` → "Progress" → Phase 1, step 5: the four weeks'
    Monday dates and their figures. Every weekly version is also kept in git
    (`git log -p content/stats.json`).
  - *Note:* your own page views count too, unless your browser sends Do Not
    Track or Global Privacy Control. Turn one of them on in your browser's
    privacy settings to leave yourself out of the baseline.
  - *Unlocks:* Phase 1 is done, and Phase 2 can be judged against real
    figures ("How to know it worked" in the plan).

- [ ] **S7. Decide when the Phase 2 homepage redesign goes live.**
  - *Why:* the baseline in S6 is a baseline of whichever homepage is live
    while it is counted. To judge the redesign against the page it replaces,
    the counter has to run on the current homepage for those four weeks
    first. Nothing in the code holds the redesign back; merging its pull
    request publishes it.
  - *Options:* hold the Phase 2 pull request until S6 is recorded (the
    comparison the plan asks for), or ship it sooner and judge it against
    its own first four weeks (no before-and-after, but a baseline for every
    later change).
  - *Where:* your merge of the Phase 2 (Wave 3) pull request; note the choice
    under Phase 1, step 5 in `docs/plan.md` → "Progress".
  - *Check:* the figures in `docs/plan.md` match `content/stats.json` →
    `weeks` for the same four weeks.

---

## Facts about you the site cannot state yet

- [ ] **F1. Languages and levels.**
  - *What:* every language you work in, named in English, with a CEFR level
    (A1 to C2) or "native". Dutch matters most: the job market is Amsterdam.
  - *Where:* `content/profile.json`, a new top-level `languages` list (the
    `$languages` note in the file shows the shape):
    `"languages": [{ "language": "Dutch", "level": "B1" }]`.
  - *Unlocks:* the Assay stops treating every non-English language as a gap.
    Today every such requirement reads "Not evidenced on this site. Ask
    Moses.", and an English requirement is listed as "Level of English" to
    confirm with you; with English in the list it is matched instead. The
    same list fills "Languages" in the homepage's at-a-glance strip (Phase
    2.1), which leaves the line out until then; later, `knowsLanguage` in the
    structured data (Phase 5.4).
  - *Check:* `npm run build:content` copies it into `modules/interactives.js`
    and into the at-a-glance strip in `index.html`; `npm test` rejects a
    level that is not A1–C2 or "native". Paste an ad of 20 words or more
    (shorter text is not graded) that asks for "fluent Dutch" into the
    Assay: the Dutch row shows your level.

- [ ] **F2. Right to work, visa sponsorship, driving licence, security clearance.**
  - *What:* whether you have the right to work in the Netherlands and the EU,
    whether an employer would need to sponsor a visa, whether you hold a
    driving licence (and where it is valid), and any security clearance. No
    document numbers.
  - *Where:* right to work and sponsorship: `content/profile.json` →
    `atAGlance.rightToWork`, one short phrase covering both (it is `null`
    today). Driving licence and security clearance have no field yet: no
    page shows them, so give them to whoever next works on the Assay.
  - *Unlocks:* "Right to work" in the homepage's at-a-glance strip, which
    leaves the line out while the field is `null`. Today the Assay only
    lists these, and relocation, under "Confirm with Moses — not stated on
    this site"; it does not read the strip's facts yet.
  - *Check:* after `npm run build:content`, the strip under the hero shows
    it. `npm test` refuses a stand-in such as "TBC" or "n/a": leave the
    field `null` until you can state it.

- [ ] **F3. Target roles, seniority and available-from date** (Phase 2.1).
  - *Where:* `content/profile.json` → `atAGlance`:
    - `targetRoles`: filled from the site's own availability line
      ("sustainability, climate-risk, ESG and sustainable-AI roles and
      consulting"). Confirm it, or correct it.
    - `seniority`: `null` today. One short phrase for the level of role
      you are looking for.
    - `availableFrom`: `null` today. `"now"`, or a date as `YYYY-MM` or
      `YYYY-MM-DD`; the strip shows it as "Now", "Jan 2027" or
      "15 Jan 2027". A past date does not fail the build (`npm test`
      prints a notice), so update it when you check `meta.verifiedOn`.
    - The location line comes from `person.locality` and `person.country`,
      followed by `atAGlance.workArea` (`["EU", "remote-friendly"]`, as the
      page already said).
  - *Unlocks:* the first view saying which job you want and when you can
    start. A `null` field is left out of the strip entirely.
  - *Check:* after `npm run build:content`, the strip under the hero shows
    each one, and `npm run build:check` passes.

- [ ] **F4. Which roles count as paid professional experience.**
  - *What:* for each role in `content/profile.json` → `experience`, whether it
    was paid employment. In particular: is the Digital Society School
    researcher role (`experience[0]`) employment?
  - *Where:* today the Assay counts years from every role whose title does not
    say intern, cohort, accelerator, trainee, volunteer or student (the
    `notCountedAsYears` list in `modules/interactives.js`). That counts the
    Digital Society School role and the two Sierra Leone roles (`experience[3]`
    and `experience[4]`). If a role was not paid, the cleanest fix is a field
    on its profile entry that the build copies into the Assay; that is a small
    code change, so say which roles and it can be made.
  - *Unlocks:* an honest "N+ years of experience" line in the Assay.
  - *Check:* paste an ad of 20 words or more that asks for "3+ years of
    experience": the gap row lists exactly the roles you count, and "Not
    counted" names the rest.

- [ ] **F5. Is the Digital Society School role still current?** (Phase 3.10)
  - *Where:* `content/profile.json` → `meta.verifiedOn` (now `2026-08-05`).
    Set it to the day you confirm; if the role has ended, give its end month
    for `currentRole` and `experience[0]`.
  - *Unlocks:* the one open-ended fact on the site stays true. `npm test`
    prints a notice once `verifiedOn` is more than six months old.
  - *Check:* `npm test` prints no staleness notice.

---

## Evidence behind figures that are off the site or labelled illustrative

- [ ] **E1. A source for the ~30% blind-siting strike rate** (Freetown hard-rock geology).
  - *What:* whose records, how many boreholes, when.
  - *Where:* `content/projects.json` → the `groundwater` case study →
    `results[0].basis`, which today says no source is recorded.
  - *Unlocks:* the "illustrative — not a measured figure" labels on the Seven
    in Ten widget (the borehole game and its scoreboard, on the groundwater
    case study; its copy is `WIDGET_HOSTS.borehole` in
    `scripts/build-content.js`) can be replaced by the basis. Without one, the
    labels stay (`tests/widgets.test.js` requires them).
  - *Check:* the basis names the source; the labels are changed in the same
    commit, and `npm test` passes.

- [ ] **E2. How many people the 164 water points serve, and how that was counted.**
  - *What:* a count and its method, e.g. design population per water point
    from project records. Only if one exists.
  - *Where:* `content/projects.json` → `groundwater` → a new entry in
    `results`, with `claim`, `basis` and `verifiable`.
  - *Unlocks:* a "people reached" figure. Until then it stays off the site;
    "10,000+ people" was removed in wave 1 because nothing supported it, and
    `tests/content.test.js` fails if that phrase comes back. A figure with a
    basis would be added, and that guard changed, in the same commit.
  - *Check:* the new result validates (`npm test`), and the page that prints
    the figure cites it.

- [ ] **E3. Method and denominator for the 95% project completion rate (Sierra Drilling) and the 15% efficiency gain (Team & Team).**
  - *Where:* `content/profile.json` → `experience[4]` (Operations Supervisor,
    Sierra Drilling) and `experience[3]` (Field Operations Manager, Team &
    Team International), each with its method and denominator. The file's
    `$figures` note explains why: an outcome rate is not a record fact like
    `teamSize`, so it needs a method before it goes back on a page. The field
    for it is added in the same commit.
  - *Unlocks:* both figures can return. Without them they stay off, and
    `tests/content.test.js` names them as claims without a basis; that guard
    would be relaxed in the same commit that adds the basis.
  - *Check:* `npm test` passes with the figure back on the page.

- [ ] **E4. Evidence for Power BI** (a project, certificate or public repository).
  - *Why:* wave 1 dropped Power BI from the homepage's proof-attached toolkit
    because nothing on the site supports it; Tableau stays, backed by the
    Masterschool training. It is off `field-report.html`'s skills line too,
    and the Assay lists a Power BI requirement as a gap.
  - *Where:* the evidence goes in `content/research.json` (an output) or on
    the education entry it belongs to; then the homepage toolkit can link it.
  - *Unlocks:* Power BI back in the toolkit, on the field report's skills
    line, and matched in the Assay. `tests/content.test.js` fails if the field
    report names a tool the homepage does not show, so the two go back
    together.
  - *Check:* the toolkit's Power BI proof links somewhere that shows it.

- [ ] **E5. Evidence that the Trinidad and Tobago factsheet informed national policy.**
  - *Why:* the CV says it "directly informed national policy"; the site now
    says "produced for national policy use", which is what the case study
    supports.
  - *Where:* `content/projects.json` → `un-disaster` → the factsheet artifact's
    `note`, and `content/research.json` (the same output's `note`).
  - *Unlocks:* the stronger wording, with its basis.
  - *Check:* the note cites the evidence; the homepage and case study match it.

- [ ] **E6. A per-query embodied-carbon factor, if you want Scope 3 quantified.**
  - *What:* a sourced factor, for example from the GAIA framework work, with a
    range.
  - *Where:* `ai-carbon-data.js`, with `source`, `range` and a review date like
    every other factor (`tests/carbon.test.js` fails a factor without them).
  - *Unlocks:* Scope 3 as a number on both `carbon-ai.html` and the homepage's
    Anatomy of a Prompt at once. Today both name Scope 3 and exclude it.
  - *Check:* `npm test` passes and both pages show the same figure.

---

## Confirm what the site now says

Wave 1 recorded these where the tests can hold the pages to them. Each is
already on the site; confirm it or give the right value.

- [ ] **K1. Wageningen GPA 7.8/10 (Dutch scale).** On the site since its first
  commit but not on the 2025 CV. Now in `content/profile.json` →
  `education[0].grade`.
- [ ] **K2. Sierra Drilling team of 23 and the 8-week OnePointFive programme.**
  `content/profile.json` → `experience[4].teamSize` and
  `experience[1].programmeWeeks`.
- [ ] **K3. Wuppertal: did you formally lead the six-person team?** The case
  study's role says "Interdisciplinary team of six", and the CV claims
  neither way. Until you say, every page says "Worked in a six-person
  interdisciplinary team": the field report, the case study's `role`, and
  `content/projects.json` → `wuppertal` → `method[0]`. (The homepage badge
  and dossier bullet went with the dossiers; the homepage card is drawn from
  the case study.) If you led it, all three can say so again.
- [ ] **K4. Thesis periods.** The site now uses, everywhere: coastal thesis
  2023–2024 (Wageningen) and soft-path thesis 2020–2021 (Hunan, defended May
  2021). `content/projects.json` → `coastal.period` and
  `water-management.period`.

- [ ] **K5. Whose report the AI footprint is on.** Anatomy of a Prompt now
  says its Scope 2 and Scope 3 (capital goods) lines are those of whoever
  runs the model, and that an organisation buying answers from a hosted
  model reports the carbon as Scope 3, category 1 (purchased services). The
  Ministry of Finance project is still described, in your words, as mapping
  "Scope 2 electricity, Scope 3 hardware, and data-centre water"
  (`content/projects.json` → `sustainable-ai` → `method[0]`, the homepage
  experience entry, the field report). If the ministry's own
  boundary was the hosted-service one, say so and those lines can name it.

*Check for K1, K2 and K4:* change the value in `content/`, run
`npm run build:content`, and `npm test` names every page that still disagrees.
K3 has no test behind it: the field report and the case study's `role` and
`method[0]` are changed together, by hand.

---

## Your own voice (Phase 4.3)

- [ ] **V1. Approve the wording of the introduction.**
  - *What:* the `intro` script in `content/narration.json`: 193 words, first
    person, opening with "Kushe". Every fact in it is from the hero narration,
    `content/profile.json` or `content/projects.json`; it states no dates,
    availability, languages or right to work.
  - *Where:* edit `content/narration.json` → `intro.text` to sound like you,
    keeping it to 150–220 words, opening with "Kushe", and to facts the site
    already states. `npm run build:content` checks the length and the
    opening; the facts are for you and a reviewer to check.
  - *Unlocks:* V2.

- [ ] **V2. Record one clean 60–90 second take of the introduction.**
  - *How:* a phone voice memo in a quiet, soft-furnished room is enough.
    Then, with [ffmpeg](https://ffmpeg.org), make it a mono 64 kbps MP3 and
    install it:

    ```bash
    ffmpeg -i take.m4a -ac 1 -b:a 64k take.mp3
    npm run voice:intro -- take.mp3
    ```

    If you changed words while recording, first edit `intro.text` to match
    what you said and run `npm run build:content`, then run
    `npm run voice:intro`. Full steps are in section 0 of
    [docs/narration-setup.md](narration-setup.md).
  - *Unlocks:* the Listen player offers "Hear Moses introduce himself · N KB".
    Until then the site plays no recording at all, and the browser voice reads
    the sections.
  - *Check:* `npm test` passes (manifest, captions and the 800 KB audio
    budget); locally, press **Listen** in the nav and the player offers the
    recording.

---

## Documents

- [ ] **D1. Update or regenerate the CV PDF.**
  - *Why:* `assets/Moses_Kolleh_Sesay_CV.pdf` was made on 2025-11-17. It still
    says "10,000+ beneficiaries", "95% project completion rate", "efficiency
    by 15%" and "directly informing national policy", all of which the site
    removed or restated in wave 1 (see E2, E3, E5).
  - *Where:* replace the file at the same path (`content/profile.json` →
    `links.cv` points at it). Phase 3.7 will generate it from `content/`
    instead.
  - *Check:* the PDF carries none of those four phrases unless E2, E3 or E5
    has given it a basis.

---

## Later phases

- [ ] **L1. Two or three testimonials, with permission** (Phase 3.5). Each
  with a LinkedIn recommendation URL, or "on request" and the date permission
  was given; they go in `content/testimonials.json`, which Phase 3.5 creates.
- [ ] **L2. One Field Note a month** (Phase 5.2), starting with the six topics
  in the plan.
- [ ] **L3. A custom domain, and a decision on `moseskolleh.github.io`**
  (Phase 5.5). Buy the domain; decide whether the untouched academicpages
  template at `moseskolleh.github.io` is unpublished or becomes a redirect.
- [ ] **L4. A native-speaker review of the Dutch pages** (Phase 5.6), once
  they exist.
