# The next stage — a plan for sustaintheworld

Written 2026-09-25 from four audits of `main` at `00bf4db`:

- **Content and positioning:** every page and `content/*.json` read as a hiring
  manager would.
- **Engineering:** `npm test`, `npm run budget` and `npm run smoke`, plus Chromium
  coverage and performance traces.
- **Real browser:** a walkthrough at 1440×900 and 390×844 that used every feature.
- **History:** PRs #22–#43, read for what shipped, what was deferred and what was
  admitted.

Every number below was measured in those runs or read from the repo; the file or
line is named where it helps. Nothing in this plan has been built yet.

---

## Where the site stands

**The engineering is excellent.** It has a no-third-party first view of 275 KB with
budgets that CI enforces, 459 passing assertions and a content model that fails the
build on an unsupported claim. The a11y audit took axe violations from 241 to 0.
That is rare, and none of it needs redoing.

**But the site has outgrown its job.** Its job is to get Moses hired or commissioned.

- **It is very long.** The homepage is **19.4 screens on desktop and 32.7 on a
  phone**. `index.html` grew from 35.6 KB to 135 KB in ten months, `style.css` from
  31 KB to 101 KB and the JavaScript from 32 KB to 182 KB.
- **It has about fourteen interactive features.** A recruiter meets roughly 20
  choices before the first section.
- **What a hiring manager needs is thin or buried:** which role, which languages,
  when available, proof they can check, and a way to reach him from every page.
- **It stopped moving.**
  - The Field Notes are the same three teasers of about 110 words each, undated,
    since 2026-07-06.
  - The CV PDF was made on 2025-11-17.
  - The AI model data stops at Claude 3.7 Sonnet and GPT-4.1 nano.
  - His strongest recent public work (WaterProject, the GAIA framework,
    climatematch-pipeline) isn't on the site at all.
  - Analytics were wired in #26 and never switched on (`index.html:87`), so nobody
    knows what visitors use.
  - 11 of the last 20 PRs were fixes, mostly to the interactive features.

**Three things are broken right now** (Phase 0):

1. **With JavaScript off**, or if `script.js` fails to load, the preloader
   (`z-index: 3000`) never lifts. All 41 `.reveal` blocks stay at opacity 0. That
   also makes the no-JS contact form fixed in #41/#42 unreachable. Verified in
   Chromium with JavaScript disabled.
2. **Hidden things show.** The empty receipt panel and the You Draw It legend appear
   before they should, because a class-level `display` beats `[hidden]`
   (`style.css:634`, `:702`). The same bug has been patched one element at a time
   six times already (`style.css:755`, `:957`, `:4066`, `:4149`, `:4244`, `:4335`).
3. **Homepage claims fail the site's own evidence rules.**
   - "10,000+ people" (`index.html:328`, `:356`, `:1160`) and "95% project
     completion rate" (`:1161`) have no basis anywhere in `content/`.
   - The counters print `164+`, `54+` and `2+ Master's degrees` (`script.js:450`)
     for numbers the rest of the site gives as exact counts.

## The idea: from showcase to instrument

Stop adding widgets. Make the site a small, real organisation that **practises what
Moses sells**: it measures itself, reports its own footprint the way he would for a
client, proves every number it prints, and tailors itself to each reader's role
without overstating the fit.

What makes it unlike any other portfolio:

| | Feature | Why a hiring manager cares |
|---|---|---|
| 1 | **The site's own sustainability statement**, structured after ESRS E1, built from measured data | The ESG/CSRD proof the site lacks, on a real (tiny) reporting entity |
| 2 | **Check my numbers**: every figure on the site in one public ledger, with its basis; the build fails on a figure with no basis | Evidence-first stops being a claim and becomes a guarantee |
| 3 | **The Brief**: paste a job ad and get an honest fit, gaps included, plus a one-page dossier tailored to it | The recruiter leaves with a document they can forward |
| 4 | **Open counts**: cookieless, first-party visit counts, published on a public page | He knows what works, and so can everyone else |
| 5 | **His own voice**: a 60–90 s spoken introduction recorded by Moses, not a stock TTS voice | People remember a person |
| 6 | **Budgets for everything**: bytes, *scroll length* and accessibility enforced in CI; every PR gets a carbon receipt | Green-software practice shown, not described |

**House rule from now on: one in, one out.** Every new feature removes or merges an
old one, and every budget ceiling only moves down.

## Phase map

Tags: `NEW` is a feature, `BETTER` improves something that exists, `LEANER` saves
bytes, CPU, time or money, and `OWNER` is a step only Moses can do. Effort is in
focused days.

| # | Phase | Outcome | Effort |
|---|---|---|---|
| 0 | Fix what's broken | Works without JS; no false claims; no overlapping or phantom UI | 2 |
| 1 | Measure before changing | First-party counts flowing; a baseline to judge everything else against | 2 |
| 2 | A recruiter-first homepage | Half the length, one primary action, a clear "at a glance", no dead-end pages | 5 |
| 3 | Close the proof gaps | Public code behind every lens, an ESG lens, a claims ledger, a generated CV | 5 |
| 4 | Signature features | The Brief, the sustainability statement, his own voice | 7 |
| 5 | Reach | Real articles, a feed, per-page preview images, a custom domain, Dutch | 6 |
| 6 | Engineering and efficiency | Deploy pipeline, lighter images, less CPU, stronger CI, scheduled health checks | 6 |
| 7 | Keep it alive | A monthly, quarterly and yearly rhythm, reminded automatically | ~2 h/month |

**About 33 days.** Phases 0–1 come first. Phase 6 can run alongside 2–5.

---

## Phase 0 — Fix what's broken · 2 days

1. `BETTER` **Make the page work without JavaScript.**
   - Put a one-line `document.documentElement.classList.add('js')` in `<head>`.
   - Scope the preloader and `.reveal` hiding to `html.js` (`style.css:195`,
     `:2609`).
   - Write the real stat values into the HTML (`index.html:193–205`) so the
     counters animate *to* them rather than *from* 0.
   - Add a smoke test that loads every page with JavaScript disabled and asserts
     that the main content and the contact form are visible.
2. `LEANER` **One global rule: `[hidden] { display: none !important; }`.** Delete the
   six local patches listed above. That fixes the receipt panel and the chart legend,
   and ends this class of bug.
3. `BETTER` **In-page links that behave like links** (`script.js:320–335`).
   - Update the URL with `history.pushState` and move focus to the target
     (`tabindex="-1"`), so Back works and the skip link actually skips.
   - Test: after the skip link is used, the next Tab lands inside `<main>`.
4. `BETTER` **Remove every claim that fails the site's own rules, or give it a basis.**
   - "10,000+ people" (three places) and "95% project completion rate".
   - The `+` suffix on exact counts (`script.js:450`).
   - "Certified across major sustainability frameworks" (`:370`) when there is one
     certificate.
   - The Tableau/Power BI "dashboards" proof that points at `#education` (`:1091`).
   - The lines that go further than the case studies do (`:630`, `:775`, `:906`).
   - "Advised" (field report) vs. "supported" (homepage) on the UN work.
   - The unsourced 30% "blind drilling" baseline, and the hard-coded "what people
     expect" curve (`modules/interactives.js:689`): source them or label them
     *illustrative*.
5. `BETTER` **Resolve contradictions between pages.**
   - Embodied carbon is included in Anatomy (`index.html:1060`) but excluded on
     `carbon-ai.html`.
   - Coastal dates: 2023–24 vs 2021–24. Soft-path dates: 2020–21 vs 2019–21.
   - Wuppertal says "Team Lead" (`:661`) on the homepage and "team of six" in the
     case study.
   - The static `© 2025` fallback (`:1439`).
   - The nav numbering (`07 AI, Weighed`) doesn't match the section numbering (`05`).
6. `BETTER` **Nothing floats over content.**
   - Move the theme toggle into the nav; on a phone it currently covers the
     availability line and the primary button.
   - Show back-to-top only after one screen of scrolling.
7. `BETTER` **Make the Assay honest.**
   - It rated an ad requiring "Fluent Dutch · 5+ years Big Four · SAP" as a
     "High-grade match" with no gaps.
   - Add gap rules for language, years, named tools and right to work.
   - Raise the bar from 3 keyword hits (`modules/interactives.js:270`).
8. `BETTER` **carbon-ai display bugs:** "9.46e-4 km", "0.0 smartphone charges" and
   clipped dropdown text.
9. `OWNER` **Prove the contact form works on the live site.**
   - Confirm `SPREADSHEET_ID` and `OWNER_EMAIL` are set in Script Properties.
   - Confirm the Apps Script was redeployed after #41/#42.
   - Send one real message. The repo cannot verify any of this, and a silent form is
     the most expensive bug a portfolio can have.
10. `LEANER` **Fix the stale docs.**
    - README says "seven suites"; nine run.
    - Budget figures: README says 272 KB, the budget measures 275 KB.
    - `check-budget.js:47` still claims 15–30% headroom.
    - `DEPLOYMENT_GUIDE.md` rate limits and pre-#38 script references.
    - The `profile.json` comment saying nothing generates from it.

**Done when:** `npm test` and smoke are green with the new no-JS and skip-link
tests, and no number on the homepage lacks a basis.

## Phase 1 — Measure before changing · 2 days

**Why.** Every later phase is a bet about what recruiters do. Without counts, the
bets can't be checked, and the sustainability statement (Phase 4) has no activity
data.

1. `NEW` **A cookieless, first-party counter.**
   - On `pagehide`, `navigator.sendBeacon` posts a tiny payload to the Apps Script
     endpoint the contact form already uses, under a new `action=count`.
   - The payload holds only: page, lens, deepest section reached, features used (by
     name), referrer *host*, viewport class, and **bytes transferred this visit**
     (the Receipt already measures this).
   - No IDs, no cookies, no IP stored, and nothing sent under
     Do-Not-Track/Global Privacy Control.
   - Apps Script adds each visit to daily totals, using `LockService` as the form
     does.
2. `BETTER` **Keep the no-third-party rule honest.**
   - Allowlist exactly that one endpoint in `tests/html.test.js` and
     `scripts/smoke.js`.
   - Smoke asserts that the beacon payload contains **only the documented fields**,
     so the privacy promise is enforced by a test.
3. `LEANER` **Wire the 23 existing `data-analytics` hooks** (`script.js:1326`) to the
   counter, and delete the commented-out Plausible/Cloudflare block
   (`index.html:87–96`). As written, it would fail the tests anyway.
4. `NEW` **`stats.html`, public.**
   - A weekly scheduled Action reads the aggregate sheet (published as CSV) into
     `content/stats.json` and regenerates the page.
   - Cells under 5 are suppressed.
   - A privacy note shows a literal example payload.
5. **Decide the five numbers that matter:**
   - contact submissions
   - CV downloads
   - lens-link visits that reach a case study
   - share of visits that reach Contact
   - Brief uses (from Phase 4)

   Collect **four weeks of baseline** before judging Phase 2.

**Done when:** counts arrive daily, `stats.html` is live, and the payload test is
green.

## Phase 2 — A recruiter-first homepage · 5 days

1. `BETTER` **The first view answers who, what and how to reach him.**
   - The availability line ("sustainability, climate-risk & ESG") adds
     **sustainable AI / AI footprint under CSRD**, his most distinctive field, which
     it leaves out today.
   - `NEW` An **at-a-glance strip**: target roles, seniority, available from,
     languages and Dutch level, right to work in NL/EU, and location. `OWNER`
     supplies the facts.
   - Exact stats move above the fold.
   - The hero photo's caption becomes visible. Today it sits at 1,069 px on desktop.
2. `BETTER` **One primary action.**
   - Use "See the evidence" (case studies with the right lens), or "Get in touch".
     The CV stays secondary.
   - The five-link play index moves below the fold.
   - The nav drops from 12 items to about 6, with no numbers.
3. `LEANER` **Halve the page.** Targets: **≤ 10 screens on desktop and ≤ 18 on a
   phone**, down from 19.4 and 32.7.
   - `#projects` is 44.7 KB, a third of `index.html`. The six dossiers become six
     teaser cards linking to the case studies, which already tell the stories better.
   - Games move to where the story is: Seven in Ten and the borehole game go to the
     groundwater case study (merge them; the game mostly repeats Seven in Ten), and
     the flood slider goes to Wuppertal.
   - "AI, Weighed" is 3.4 screens. Keep You Draw It as the teaser and move the cost
     widget and Anatomy of a Prompt to `carbon-ai.html`.
   - Experience becomes compact cards on a phone (5.4 screens today).
   - The Assay moves below the contact form, or into The Brief (Phase 4).
4. `NEW` **A scroll-length budget.** Smoke records each page's scroll height at both
   viewports and fails above a ceiling, exactly like the byte budget. Length is a
   cost to a busy reader too.
5. `BETTER` **One listen control, docked.**
   - Today there are ten; they add 8+ Tab stops, and on a phone the open player
     covers about 45% of the screen.
   - Default to the browser voice (0 bytes). Phase 4 replaces the recorded tracks.
6. `BETTER` **The journey map on phones.**
   - It only follows the reader at ≥ 980 px, so phones never see it fly. Use a
     compact sticky map or a static route.
   - Fix the overlapping Rhine labels on desktop.
7. `BETTER` **Legibility on phones.**
   - Chart and game labels are about 5 px on phones; make them ≥ 11 px.
   - Fix the clipped Anatomy labels.
   - Change "drag the grid" to match the dropdown it actually is.
   - Give the lightbox previous/next, a "2 of 5" counter and arrow keys.
8. `NEW` **A shared shell for the other pages.**
   - `build-content.js` emits the same small nav (Home, Case studies, Research, CV,
     Contact), a closing call to action with email and CV, and back-to-top.
   - It also adds the light theme that `content.css` and `carbon-ai.css` still lack
     (deferred in #41).
   - This removes the dead ends: the lens links send recruiters to
     `case-studies.html`, which has no way to contact Moses.
9. `LEANER` **Ratchet the budgets.** Lower every ceiling to the new measured value
   plus 5%.

**Done when:** length budgets pass at both viewports, and the at-a-glance strip,
single primary action and shared shell are live.

## Phase 3 — Close the proof gaps · 5 days

**Today:** only 3 of 12 case-study results are checkable from outside, and 3 of the
5 "public" research outputs are the portfolio itself.

1. `NEW` **Put his real public work on the site** (`content/projects.json`,
   `content/research.json`). `github.com` and `moseskolleh.github.io` are already on
   the link allowlist, so none of these will fail the tests.
   - **WaterProject**, the groundwater investigation toolkit with a live app. It is
     the first public code behind the water lens, where every artifact is now "on
     request".
   - **GAIA-Framework**, the Green AI assessment framework mapped to ESRS, IFRS S2,
     GRI, CDP and SBTi. This is the missing ESG proof.
   - **climatematch-pipeline**, covering CMIP6 extremes and return levels, for the
     climate-risk lens.
   - **A-B-Testing-at-Globox**, the real proof for the SQL/Tableau skill claims.
   - **SustainableAIPrototypes**, as evidence for the sustainable-AI case study.
     Partner names stay out without their consent.
   - Point every Skills "proof" link (`index.html:1088–1096`) at one of these.
2. `NEW` **An ESG/CSRD lens and case study** built from GAIA, Anatomy of a Prompt and
   the accelerator labs (`content/lenses.json`). Otherwise, drop "ESG" from the
   availability line; don't claim a lens that has no case behind it.
3. `BETTER` **Say what he found, not only what he did.** Each case study gets a
   "Findings and recommendations" field: the pollution drivers, the Wuppertal
   measures, the ministry's decision criteria. The validator requires it.
4. `BETTER` **One name for one tool.**
   - "AI, Weighed", "EcoPrompt Coach" and "promptcoach" are the same thing, and
     promptcoach v2 now has its own live app.
   - Either link to it as the canonical tool, or refresh `ai-carbon-data.js` from
     the GAIA model catalogue. The current list is from April 2026 and its grid data
     from 2023.
5. `NEW` **Testimonials with provenance** (`content/testimonials.json`).
   - Every quote carries its source: a LinkedIn recommendation URL, or "on request"
     with the date permission was given.
   - The validator rejects a quote without one.
   - `OWNER` asks two or three people.
6. `NEW` **Check my numbers**, the claims ledger.
   - Every figure on the hand-authored pages is wrapped as
     `<span data-claim="water-points">164</span>`. `content/claims.json` holds each
     figure's value, basis and whether a reader can check it.
   - A test fails if a marked value disagrees with the ledger or has no basis. A scan
     lists unmarked numerals, with a small allowlist for years.
   - A public page lists every number on the site with its basis. The rule that
     already guards `content/` now guards `index.html` too.
7. `NEW` **A CV generated from `content/`.**
   - `npm run cv` prints a `cv.html` template built from `profile.json` and
     `projects.json` to PDF with the Chromium the smoke test already uses.
   - A test checks the PDF text against the profile. The CV can no longer drift from
     the site.
8. `BETTER` **Certificates link to their verification pages.** Add the issuers'
   hosts to the allowlist.
9. `BETTER` **Compute the experience depths from dates** instead of hard-coding them
   around September 2025. The core-log depths are now about a year out.
10. `OWNER` **Re-verify the "Present" role.** The `SustainableAIPrototypes` repo that
    documents it was last updated in November 2025. Then bump `meta.verifiedOn`.

**Done when:** every lens has at least one public artifact, the claims-ledger test
is green, and the CV is generated.

## Phase 4 — Signature features · 7 days

### 4.1 `NEW` The Brief (the Assay's successor) · 3 days

- A recruiter pastes a job ad. They get:
  - an **honest fit**: matched evidence *and* gaps (language, years, tools, right to
    work);
  - a **one-page tailored dossier**: only the relevant case studies and artifacts,
    each with its checkability label, the at-a-glance facts and contact details;
  - a **shareable URL** (`brief.html?focus=…`) that rebuilds the same dossier, so
    it can be forwarded to the hiring manager.
- It runs in the browser: no LLM, 0 bytes sent, and the ad never leaves the page.
- The rubric and evidence move out of `modules/interactives.js:196` into
  `content/brief.json`, where the validator can hold them to the case studies.
- It reorders and selects; it never rewrites a claim, the same rule the lenses keep.
- Print styles make the dossier a clean single page.

### 4.2 `NEW` The site's own sustainability statement · 3 days

A yearly `report-2026.html`: **the portfolio reports its own climate impact the way
Moses would write it for a client**. It is structured after ESRS E1 (climate
change) disclosure logic; it is not an assured CSRD report, and it says so.

- **Boundary and method:** what counts (network transfer of every visit) and what
  doesn't (device energy, embodied hardware, the author's laptop). Uses the Sustainable
  Web Design constant already used on the site (0.36 g CO₂e/MB), stated as such.
- **Activity data, measured, not modelled:** the sum of *bytes actually transferred*
  per visit from the Phase 1 counter, by page. Cached repeat visits count as the
  near-zero they are.
- **Results with a range,** not a false point estimate.
- **Actions and their effect:** every PR that cut bytes, with its measured delta,
  taken from git history (e.g. #41: about 520 KB → 274 KB first view).
- **Targets:** the budget ceilings, which only move down.
- **What this statement doesn't cover,** in plain words.
- A script generates it from `content/stats.json`, `npm run budget` output and git
  history, and it is printable.

This is the ESG proof no other portfolio has: a real, tiny reporting entity with a
real disclosure. Publish the first one after at least a quarter of Phase 1 data.

### 4.3 `NEW` His own voice · 1 day

- Replace the ten stock-voice section tracks with **one 60–90 second introduction
  recorded by Moses** (opening with "Kushe"), and keep the 0-byte browser voice for
  reading any section aloud.
- **Why:**
  - `docs/narration-setup.md:69–72` already admits that a stock voice speaking
    first-person lines "is a different proposition".
  - A full re-render costs ~7,708 Fish Audio credits against a free allowance of
    8,000, and every copy edit on the homepage costs credits because scripts must
    match the copy. That would make Phase 2 expensive.
  - Narration drops from 4.13 MB to about 0.5 MB.
- The Fish Audio pipeline stays for anyone who wants it; it just stops running on
  every copy edit.
- `OWNER` records a clean 60–90 s take.

### 4.4 `NEW` (stretch) Grid-aware mode

- A daily scheduled Action fetches a Dutch grid carbon-intensity forecast into a
  24-value `assets/grid.json`. The API key lives in repository secrets and never
  reaches the browser.
- When the grid is dirty, the page pauses the hero rotation, stops prefetching
  images, and says why in one line.
- Be honest that the visitor's own grid may differ.

## Phase 5 — Reach · 6 days, then ongoing

1. `NEW` **Field Notes become articles.**
   - Source: `content/notes/*.md`. `build-content.js` turns them into
     `notes/<slug>.html`.
   - Each note is dated, has a permalink and `Article` JSON-LD, and appears in the
     sitemap and an Atom feed (`feed.xml`).
   - The three existing teasers become the first three articles.
2. `OWNER` **Publish one note a month.** The first six, each tied to a feature or
   case study:
   1. Reading a resistivity curve: why seven in ten.
   2. What a finance ministry should ask before buying an AI tool.
   3. The hidden curve of AI energy.
   4. Wuppertal, July 2021: designing for the day the river rises.
   5. The Scope 3 of a prompt under ESRS.
   6. A portfolio that reports its own emissions (with the Phase 4.2 statement).
3. `NEW` **A preview image per page.**
   - Today one drilling photo with no name on it is reused across all five pages.
   - At build time, Chromium renders an HTML template (name, role, page or article
     title) to a PNG for each page, lens view and note.
4. `BETTER` **Structured data:**
   - `WebSite`, `Article` and `SoftwareApplication` (for the tools)
   - `knowsLanguage` and `hasCredential`
   - the missing X profile in `sameAs`
   - a title and description for `404.html`
5. `OWNER` **A custom domain**, e.g. `moseskolleh.com` or `.nl`.
   - Add a `CNAME`, update the canonical and `og:url` tags, and let GitHub Pages
     redirect the github.io paths.
   - Also decide what `moseskolleh.github.io` itself shows. That repo is an
     untouched academicpages template ("Moses' Homeage", "Paper Title Number 1"), so
     either unpublish it or turn it into a redirect.
6. `NEW` **Dutch.**
   - A `/nl/` summary page and Dutch case-study summaries from
     `content/i18n/nl.json`, with `hreflang`.
   - `OWNER` has them reviewed by a native speaker, and they state his real Dutch
     level. It is an Amsterdam job market, and the ministry work is Dutch.
7. `NEW` **Newsletter** by RSS-to-email (e.g. Buttondown). The subscribe form posts
   off-site the way the contact form does, and is allowlisted the same way.
8. `NEW` **A distribution kit per note.** `npm run note:kit <slug>` writes the
   LinkedIn post text, the preview image and the matching lens link next to the
   article.

**Done when:** three articles, the feed, per-page preview images and the custom
domain are live.

## Phase 6 — Engineering and efficiency · 6 days (alongside 2–5)

1. `LEANER` **A build-and-deploy workflow**, gated on CI. It replaces the classic
   branch build.
   - It minifies, hashes filenames so assets can be cached for good, adds
     `.nojekyll`, and stops publishing `tests/`, `scripts/`, `content/` and
     `google-apps-script/` (about 350 KB of dev files are public today).
   - The source stays a readable no-build site; only the published copy is
     optimised.
   - Measured: first-view text drops from 69.6 to 50.9 KB gzipped (−27%).
2. `LEANER` **Images.**
   - Load a dossier's images only when it opens. Today 15 images (1.56 MB) download
     on desktop while their dossiers are closed, because `max-height:0` doesn't stop
     lazy-loading (`style.css:1876`).
   - Serve an 800 px hero on phones: 56 KB as WebP or 38 KB as AVIF, against 131 KB
     now, which is 48% of the first view. Drop `fetchpriority=high`; that image is
     never the LCP element.
   - AVIF with WebP fallback via `<picture>`: all images from 3.24 MB to about
     1.98 MB, subject to a visual check.
3. `LEANER` **CPU.**
   - `content-visibility: auto` on below-fold sections: at 4× CPU slowdown, layout
     fell from 229 to 102 ms and the longest task from about 300 to 100 ms.
     Re-test anchors and scroll-spy.
   - Rebuild the `pulse` animation on transform/opacity and pause infinite
     animations off-screen: idle main-thread work falls from 249 to 6 ms per 3 s.
   - Defer `relayout()` (`script.js:429`) to `requestAnimationFrame`.
   - Make the counters respect reduced motion.
4. `LEANER` **Move the SVG sprite to its own cacheable file** once filenames are
   hashed. It is 7.3 KB of `index.html`'s 29.8 KB gzipped.
5. `LEANER` **CSS hygiene.**
   - 17 dead selectors, mostly leftovers from the icon font.
   - 13 duplicate blocks.
   - `transition: all` used 33 times.
   - 13 breakpoints, which should become 4 tokens.
   - The same four `@font-face` blocks copied into three stylesheets; move them to
     one shared `fonts.css`.
6. `LEANER` **JS hygiene.**
   - One keydown router instead of four `document` handlers, and one reduced-motion
     helper instead of eight checks.
   - Move the 120-line timezone table out of the core into on-demand data.
   - Put the globals under `window.mks`.
7. `BETTER` **CI.**
   - Run `push` on `main` only and cancel superseded runs; today every PR commit
     runs twice.
   - Move to Node 22 (Node 20 reached end of life in April 2026) and pin Chromium.
   - Run test suites in parallel with fake timers (9.0 s sequential today).
   - Add **axe-core** and **html-validate** to smoke; the 241 → 0 axe fix is
     unguarded.
   - Add a budget for `carbon-ai.html` (103 KB, unbudgeted).
   - Add a Firefox pass, since the README claims Firefox and Safari without testing
     either.
   - Compare the smoke screenshots against a baseline.
8. `NEW` **A carbon receipt on every PR.** A CI job comments the byte, CO₂ and
   scroll-length deltas against `main`. `check-budget.js` then prints "you could
   lower X to Y", and README tables are generated from its output, so the README can
   never go stale again.
9. `NEW` **Weekly health checks** (scheduled Action). It opens an issue on any
   failure:
   - smoke against the *live* URL
   - external link check
   - contact form end-to-end, using a test flag that writes to a test tab and emails
     nobody
   - `verifiedOn` staleness
   - `npm audit`
10. `NEW` (stretch) **Open-source the budget tool.** Extract `check-budget.js` and the
    PR receipt into a reusable GitHub Action under his account. It becomes a
    green-software artifact other people use, which is proof no case study can give.
11. `BETTER` **Security meta.** Once inline script is minimal, add a
    `Content-Security-Policy` meta and a referrer policy (deferred in #41).

**Done when:** deploys are gated, image and CPU savings are measured in smoke, and
axe, validation and the PR receipt run in CI.

## Phase 7 — Keep it alive · ~2 h a month

| When | What |
|---|---|
| Monthly | Publish one note; read `stats.html`; answer every contact within two days |
| Quarterly | Re-verify profile facts (`verifiedOn`); refresh AI data; ratchet budgets down; review the five numbers against the baseline |
| Yearly | Publish the sustainability statement; regenerate the CV; review the lenses against the roles he is going for |

A scheduled Action opens a "Quarterly review" issue carrying this checklist.

---

## If you only have two weeks

About 10 days that still change how the site lands:

- Phase 0, all of it.
- Phase 1, steps 1–3.
- Phase 2, steps 1–3 and 8.
- Phase 3, steps 1 and 6.
- Phase 6, step 2 (dossier images only).

## Stop doing

- **No new mini-games or widgets** until the homepage passes its length budget.
- **No AI chatbot "ask my portfolio".** It contradicts the site's own argument about
  the cost of generation; the Brief does the useful part with 0 bytes sent.
- **No per-section recorded narration** after Phase 4.3.
- **No numbers typed straight into `index.html`.** They go through the claims ledger.
- **No raising a budget ceiling** without removing something of equal weight.

## What only Moses can supply

| Needed for | Input |
|---|---|
| Phase 0.9 | Live contact-form check: Script Properties set, Apps Script redeployed, one real message |
| Phase 2.1 | Target roles and seniority, available-from date, languages and Dutch level, right to work |
| Phase 3.5 | Two or three testimonials with permission |
| Phase 3.10 | Is the Digital Society School role still current? |
| Phase 4.3 | A clean 60–90 s voice recording |
| Phase 5.2 | One note a month |
| Phase 5.5 | Domain purchase; a decision on the `moseskolleh.github.io` template site |
| Phase 5.6 | A native-speaker review of the Dutch pages |

## How to know it worked

Judge against the Phase 1 baseline, not invented targets. After Phases 2–3, the
share of visits that reach Contact and the number of lens-link visits that reach a
case study should both rise. Contact submissions and CV downloads are the outcomes.
If a change doesn't move its number within a quarter, cut it; the "one in, one out"
rule makes that cheap.
