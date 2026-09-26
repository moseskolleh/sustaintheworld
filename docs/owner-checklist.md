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

Last updated with wave 1 of the plan (Phase 0 and the narration steps of
Phases 2.5 and 4.3), 2026-09-26.

---

## Do first: prove the contact form works (Phase 0.9)

The repository can test `google-apps-script/Code.gs` against stand-ins
(`tests/apps-script.test.js`), but it cannot see the live Apps Script project,
its settings or its deployment. A form that fails silently is the most
expensive bug a portfolio can have, so do these three in order.

The site posts to this deployment, written in two places that must agree:
`GOOGLE_APPS_SCRIPT_URL` in `script.js` and the contact form's `action` in
`index.html`:

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

- [ ] **C2. Redeploy the Apps Script as a new version, after #41 and #42.**
  - *Why:* PR #41 (merged 2026-09-02) added the JavaScript-free form path, and
    PR #42 (merged 2026-09-24) fixed it: before #42, every JavaScript-free
    submission was answered "Something went wrong" and "undefined", even when
    it had been recorded. Editing code in the editor does not change the live
    endpoint; only a new deployment version does.
  - *Steps:*
    1. Open `google-apps-script/Code.gs` in this repository (unchanged since
       2026-09-23), copy all of it, and paste it over the code in the
       editor. Save.
    2. **Deploy → Manage deployments** → select the active **Web app**
       deployment → **Edit** (pencil) → **Version: New version** → **Deploy**.
       Keep **Execute as: Me** and **Who has access: Anyone**.
    3. Still in **Manage deployments**, check that the deployment's Web app
       URL is exactly the one above. If it differs, the site is posting
       somewhere else: either use that deployment, or put its URL in both
       `script.js` and `index.html`.
  - *Check:* Manage deployments shows the active deployment at a new version
    dated today, and the editor's `handleSubmission` contains
    `var reply = function (status, message)` (the #42 fix).
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
    titled "New Submission from …" in the `OWNER_EMAIL` inbox. Replying to
    one should address the visitor's email. If a row is missing, open
    **Executions** in the Apps Script editor; a failed request is logged
    there with its reason.
  - *Unlocks:* Phase 0 step 9 is done: the form is known to work, not
    assumed to.

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
    Moses." Later, the at-a-glance strip (Phase 2.1) and `knowsLanguage` in
    the structured data (Phase 5.4).
  - *Check:* `npm run build:content` copies it into `modules/interactives.js`;
    `npm test` rejects a level that is not A1–C2 or "native". Paste an ad of
    20 words or more (shorter text is not graded) that asks for "fluent
    Dutch" into the Assay: the Dutch row shows your level.

- [ ] **F2. Right to work, visa sponsorship, driving licence, security clearance.**
  - *What:* whether you have the right to work in the Netherlands and the EU,
    whether an employer would need to sponsor a visa, whether you hold a
    driving licence (and where it is valid), and any security clearance. No
    document numbers.
  - *Where:* no field exists yet. Phase 2.1 adds these to `content/profile.json`
    with the at-a-glance strip; until then, give them to whoever builds it.
  - *Unlocks:* the at-a-glance strip. Today the Assay only lists these, and
    relocation, under "Confirm with Moses — not stated on this site".
  - *Check:* once the strip is built, it shows them, and the Assay answers
    instead of asking.

- [ ] **F3. Target roles, seniority and available-from date** (Phase 2.1).
  - *Where:* `content/profile.json`, in the fields Phase 2.1 adds.
  - *Unlocks:* the first view saying which job you want and when you can start.
  - *Check:* the at-a-glance strip on the homepage shows them.

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
    in Ten widget and the borehole game can be replaced by the basis. Without
    one, the labels stay (`tests/content.test.js` requires them).
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
    Masterschool training. It still appears in `field-report.html`'s skills
    line, and the Assay now lists a Power BI requirement as a gap.
  - *Where:* the evidence goes in `content/research.json` (an output) or on
    the education entry it belongs to; then the homepage toolkit can link it.
  - *Unlocks:* Power BI back in the toolkit and matched in the Assay. Without
    evidence, it should also come off the field report's skills line.
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
  study's role says "Interdisciplinary team of six", its method says "Led a
  six-person interdisciplinary team", and the CV claims neither. The homepage
  badge now says "Team of six". The method line is in `content/projects.json`
  → `wuppertal` → `method[0]`. If you led it, the badge can say so again; if
  not, `method[0]` changes to match.
- [ ] **K4. Thesis periods.** The site now uses, everywhere: coastal thesis
  2023–2024 (Wageningen) and soft-path thesis 2020–2021 (Hunan, defended May
  2021). `content/projects.json` → `coastal.period` and
  `water-management.period`.

*Check for K1, K2 and K4:* change the value in `content/`, run
`npm run build:content`, and `npm test` names every page that still disagrees.
K3 has no test behind it: the homepage badge, the case study's role and its
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
