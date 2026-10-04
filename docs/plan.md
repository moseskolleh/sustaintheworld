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

## Progress

What the plan's branch implements so far, step by step, as it stands on
`wave/w4-integrate`, checked against the code and the test runs on
2026-10-03 (`npm test`: 2,305 passing assertions in twenty-eight suites, the
figure the runner prints at the end; `npm run smoke -- --require` in
Chromium: passed, and its length check measured every page within its
ceiling). Waves 1 and 2 are on `main` (pull requests #48 and #49, merged
by 2026-09-27, where CI's Chromium and Firefox smoke jobs passed), and so is
wave 3 (Phase 2 and Phase 6 step 8; pull request #50, merged 2026-10-03,
where all three CI jobs passed on its last run; GitHub Pages rebuilt from
`main` the same day).
Wave 4 (Phase 3) is on `wave/w4-integrate` and not on `main` yet; it starts
from `628e542`, so `main`'s one later commit, `03c8c21` (the journey map's
names measured by their glyphs, for Firefox), is not in it yet.
✓ done · ◐ partial, with the reason · ✗ waiting on Moses. Everything
Moses has to supply is listed, with where it goes, in
[owner-checklist.md](owner-checklist.md).

**Phase 0 — wave 1.** Not done as a phase yet: step 9 waits on Moses, and
step 4 has the leftover named below, which is his too. Its "done when" tests
are green: `npm test`, and smoke with the new no-JavaScript and skip-link
checks. The wave's review listed 30 findings, some of them twice, and a
second round 16 more; all are fixed, and what they changed is folded into
the steps below.

1. ✓ **Works without JavaScript.** The `html.js` line is in `<head>`; the
   preloader, `.reveal`, collapsed dossiers and empty bars are hidden only
   under it; the hero stats are written as 164, 54, 3 and 2, and read as
   those while the digits count up (a screen reader heard "0 Master's
   degrees" until a scroll); a 4 s failsafe
   (and an `onerror` on `script.js`, and on carbon-ai.html's two scripts)
   drops the class if the script never takes over. Without JavaScript the
   nav links wrap under the logo, all of them on show (twelve then, six
   since wave 3). The collapsed dossiers this step opened are gone (wave
   3); what script.js folds now, the experience cards and the Assay's box,
   is whole without it and on a late start, and so is every Field Note (a
   `<details>`). A late `script.js` puts back the line being read, then
   holds it there while the page fills in: without scroll anchoring, as in
   Safari, it slid up to 2,800px (smoke checks it with anchoring off).
   Copy that points at what only JavaScript draws hides with it. Smoke loads
   every page with JavaScript off (the homepage at 390, 1024 and 1280px),
   and the homepage with `script.js` blocked and late.
2. ✓ **One global `[hidden]` rule** in `style.css` and `carbon-ai.css`; the
   eight local patches are gone, and the receipt panel and chart legend hide.
3. ✓ **In-page links behave like links**: `pushState`, focus on the target,
   Back and Forward land again, the skip link's next Tab is inside `<main>`
   (smoke). Back to the entry before any jump returns focus to the link that
   left it. A first jump into or past section 05 used to stop 250–320px short
   (318px for Skills at 1280×800) as the widgets it fetched grew above the
   target; the jump now lands again while the page settles, until the reader
   scrolls or types, and smoke holds the landing to the nav bar. A shared
   link into section 05 does too: the height was taken from the observer's
   first report, a frame late, so growth in that frame was missed and
   /#assay stopped short on about one visit in three.
4. ◐ **Claims without a basis.** Off the pages: "10,000+ people", 95%, 15%,
   "certified across", Power BI in the toolkit's proof list, "advised", the
   `+` on exact counts, and lines that went beyond the case studies. The 30%
   baseline and the You Draw It curve are labelled illustrative;
   `tests/content.test.js` guards both. Power BI is off the field report too,
   and the test fails if it names a tool the homepage does not show. The
   hero says "continents studied and worked on", the groundwater method
   informed the siting that followed rather than all 164 water points, and
   You Draw It calls its figures published estimates, not measurements: its
   verdict gives each with its range and judges a guess against the range,
   not the central figure to a decimal. The skills narration no longer says
   every listed skill has a project behind it (Life Cycle Assessment, Carbon
   Markets and Circular Economy have none), and the contact narration says
   "Amsterdam and the E.U.", as the page does.
   The CV is printed from content/ since wave 4 (Phase 3.7) and carries none
   of them. ✗ Sources for the 30%, a people-reached count and a method for
   95% and 15%, if they exist.
5. ✓ **Contradictions resolved**: embodied carbon excluded on both pages,
   and Anatomy names whose report its Scope 2 and capital-goods lines are
   on (whoever runs the model; a buyer of a hosted one reports the carbon as
   Scope 3, category 1),
   thesis periods agree everywhere, Wuppertal says "Team of six" and "worked
   in", not "led", on every page, © 2026, nav numbers dropped. ✗ Moses to
   confirm the periods, whether he led the Wuppertal team, and the ministry
   project's boundary (K5).
6. ✓ **Nothing floats over content**: the theme switch is in the nav bar;
   back to top waits one screen and steps aside for every control in its
   corner (it used to watch four whole regions, so it covered the dossier
   titles and selects, and hid over the last screen).
7. ✓ **The Assay is honest**: gap rules for languages, years, named tools,
   consulting-firm and director level, financial modelling, PhD and law;
   right to work, visa, clearance, licence, relocation and the level of
   English listed to confirm; a hard gap caps the grade; fewer than 20 words
   is not graded. General areas (stakeholders, data, delivery, international,
   research) never make a grade alone: Workable needs one area of his field,
   High two, and HR, ERP, marketing and IT ads grade "Different field". An
   employer's history ("For over 20 years, we…"), its team's languages
   ("Our team works in English, Dutch and French"), the language to apply in,
   or a "Dutch Ministry" is not a requirement. The Dutch / Big Four / SAP ad
   grades "Marginal match" with 4 gaps. ✗ Languages and levels, which roles
   were paid, and right to work.
8. ✓ **carbon-ai display bugs**: one formatter, no exponents, no rounded-away
   zeros, unit switching on the value as shown (0.9999 km is "1.0 km", not
   "1,000 m"); no clipped dropdowns at 320, 390 or 1440px.
9. ✗ **Live contact-form check**: owner checklist C1 to C3.
10. ✓ **Stale docs**: suite count and budget figures from real runs,
    `check-budget.js` headroom comment, `DEPLOYMENT_GUIDE.md` against
    `Code.gs`, the `profile.json` comment. The footer, the lens and the README
    now have to quote the budget's first-view figure exactly (280 KB), not
    within 5 KB of it. The review's first round cost 1.7 KB of first view,
    all in the core (the jump that lands again, back to top watching each
    control, the late start, Back's focus, the no-JavaScript nav), and left
    the on-demand total about 100 bytes under its 72 KB ceiling. The second
    round cost 0.8 KB more of first view (the counters' readable figures,
    the held line on a late start, Anatomy's boundary), less two dead rules
    in style.css; on demand it cost 0.8 KB and the journey map paid 1.6 KB
    for it, losslessly, by dropping path points that sit on a straight line
    between their neighbours (the parallels were 60 points each).

**Phase 1 — wave 2.** Built and tested, but not counting yet: both halves
of its "done when" wait on Moses. Counts arrive once he sets `STATS_TOKEN`
and publishes the new `Code.gs` (owner checklist S1), and `stats.html` fills
once the secret `STATS_SOURCE_URL` is set (S2) and a first full week has
ended. The payload test is green. The wave's review confirmed 29 findings,
one a blocker (the raw daily totals were readable by anyone while
`stats.html` promised no single day's count is ever published); all are
fixed, and what they changed is folded into the steps below and 6.6-6.7.

1. ✓ **A cookieless, first-party counter**: `count.js` (3 KB, 2 KB
   gzipped), deferred on every page (eight since wave 4 added
   `claims.html`); the 404 page names itself. It
   sends the page, the lens, the deepest part of `<main>` reached, the
   features used, the referrer's host, a viewport class and the KB this
   page view transferred, plus a format version, as one POST the first time
   the page is hidden or left; nothing under Do Not Track, Global Privacy
   Control or with JavaScript off. `Code.gs` takes it at `?action=count`,
   accepts only that exact shape, and adds it to daily totals on a `Daily`
   tab under the contact form's `LockService` lock. No id is sent, no
   cookie, and Apps Script gives the script no IP address to store.
   **The transport is not `navigator.sendBeacon`, as step 1 says, but
   `fetch` with `keepalive: true`,** `credentials: 'omit'`,
   `referrerPolicy: 'no-referrer'` and `mode: 'no-cors'`. sendBeacon always
   sends the browser's cookies for the address it posts to (here
   `script.google.com`, where a visitor signed in to Google has session
   cookies) and cannot be told not to for one request; a keepalive fetch
   outlives the page the same way and leaves them out. `tests/html.test.js`
   fails if anything calls `sendBeacon`. A count waits at most 1.5 s for the
   lock it shares with the contact form, and past 30 a minute is dropped
   before asking, so a burst of page views cannot make a message time out;
   `stats.html` says the counts are therefore a floor. A contact message
   sent under Do Not Track or GPC carries `count: false`, and `Code.gs`
   leaves it out of the contact tally (one sent with JavaScript off cannot
   say so, and the page names that exception). ✗ Counting starts when Moses
   publishes the new `Code.gs` (S1).
2. ✓ **The no-third-party rule stays honest.** `tests/html.test.js` allows
   one off-site address in any script the site ships: the deployment, and
   the same with `?action=count`. `npm run smoke` takes a real browser's
   count apart: exactly the documented keys, no cookie, no `Referer`, once
   per page view, every page's count accepted by `Code.gs`'s own schema
   check, and nothing under Do Not Track, Global Privacy Control or with
   JavaScript off. `tests/count.test.js` (75 assertions) and
   `tests/apps-script.test.js` (81) hold the two ends to the same schema.
   Every other browser context in smoke opens with Global Privacy Control
   on, so a test run never sends a real count.
3. ✓ **The hooks are wired, and the Plausible/Cloudflare block is gone.**
   All 37 `data-analytics` names now on the site (23 when this plan was
   written, 27 after wave 2, 34 after wave 3's shell, first view and Assay
   button; wave 4 added the two links to `claims.html` and the ESG lens's)
   are counted when clicked, and so are the on-demand modules as
   they are fetched (`module-<name>`), the contact form being sent, the
   terminal's `cv` command, and the Assay's grade; the ad itself never
   leaves the page, and the label by the Assay's button now says so ("the
   ad is never sent", not "nothing sent"). Any CV link clicked also adds
   one shared name, `cv-download`, once per page view. A test fails if the
   site uses a hook name the counter would not keep, or if a counted page
   has a CV or email link without a hook (the field report's two had
   none). ✗ Whether the grade should be counted at all (S4).
4. ◐ **`stats.html`, public.** Built: in the sitemap, linked from the
   footers of the homepage, case studies, research, Check my numbers, the
   EcoPrompt Coach page and itself, and from the field report and the 404
   page, under a 103 KB budget (96 KB today; 97.8 KB drawn full, every list
   at its cap, and the ceiling is that plus 5%), with a privacy note that prints a literal example payload and
   lists what is never collected. The weekly Action
   (`.github/workflows/stats.yml`, Mondays 04:17 UTC) reads the daily totals
   from `?action=stats`, which answers only the `STATS_TOKEN` token (the
   rows are not suppressed, and the address is in `count.js`), suppresses
   every count under 5 (and groups referrers under 5, and counts names the
   site does not use as "other"), writes `content/stats.json`, rebuilds the
   page, runs `npm test` and commits. Suppression holds against
   subtraction: every page view has one page and one window class, so
   those tables add up to the page views shown beside them, and the known
   lenses to the lens-link visits and the weeks to all time; a lone "<5"
   would be the total less the rest, so the smallest figure beside it is
   held back too, marked "held", through any chain of sums. Every figure is
   whole Monday-to-Sunday weeks, all time ending last Sunday, and nothing
   is published before the first full week has ended, so no single day's
   count can be taken out of them. The build refuses a `stats.json` that
   holds a count under 5, one subtraction would give away, a part week,
   today, or a daily row. A smoke check draws the page full from fixture
   totals and fails if a table splits a word or the page scrolls sideways
   at 320-430px. Partial because it has no figures yet: ✗ `STATS_TOKEN` and
   the secret `STATS_SOURCE_URL` (S1, S2). ✗ Moses to confirm the raw daily
   totals stay private (S3).
5. ◐ **The five numbers** are defined in `scripts/fetch-stats.js` and on
   `stats.html`: contact submissions; CV downloads (page views in which any
   CV link was clicked, counted once however many were);
   lens-link visits, as a proxy (page views that arrived through a role
   link, an upper bound, since the daily totals are kept field by field and
   cannot say whether that reader went on to a case study); the share of
   homepage views whose deepest section was Contact; and Brief uses, empty
   until Phase 4.1. ✗ The four-week baseline: it needs S1, S2 and four full
   weeks of counting; Moses records it here (S6). Baseline: not yet recorded.
   Order mattered: a baseline of the old homepage existed only if the
   counter ran for those four weeks before the Phase 2 redesign went live.
   The redesign reached `main` with pull request #50 on 2026-10-03, six days
   after the counter, so the baseline will be of the redesigned homepage,
   and Phase 2 is judged against its own first four weeks (S7, done).
   Transfer is kept per page (`kb` rows keyed by page), so the Phase 4.2
   statement can report measured activity data by page.

**Phase 2 — wave 3.** Built, on `main` since pull request #50 (2026-10-03),
and the homepage meets its length targets, but not done as a phase: the
at-a-glance strip still lacks the four facts only Moses can give (2.1).
Measured in Chromium once the page had settled: the homepage was 9.36
screens at 1440×900 and 16.31 at 390×844, from 19.4 and 32.7 when this plan
was written (18.78 and 32.18 when the wave began); `index.html` was 84 KB on
disk (21 KB gzipped), from 134 KB; the homepage's first view was 275 KB over
the wire, from 282 KB. After wave 4 it is 9.42 and 16.49 screens and 276 KB
(282,785 bytes), within the same ceilings.
What the wave needs from Moses is in the owner checklist: F1–F3 (the
strip's facts) and P1 and P2 (two choices to confirm); S7, when it went
live, is done.

1. ◐ **The first view.** The availability line reads "Open to
   sustainability, climate-risk, ESG and sustainable-AI roles and
   consulting — EU, remote-friendly": where he would work is a preference,
   so it is said there and not under "Location", beside a right to work
   not yet stated. Under it, an at-a-glance strip is written by
   `build-content.js` from `content/profile.json` → `atAGlance`, between
   markers `build:check` holds; it shows only what the repository states
   (the location, Amsterdam, NL) and leaves a `null` fact out, and the
   validator refuses a misspelt key, an impossible date, a stand-in such as
   "TBC", or a fact longer than the first screen has room for
   (`GLANCE_LIMITS` in `scripts/lib/content.js`). The four exact figures
   and the photo's caption are on the first screen at 1440×900 and 390×844
   (the figures end at 795px and 660px, the caption at 121px and 108px; the
   caption sat at 1,069px), and smoke checks it, and checks it again with
   every fact filled in at the longest the validator accepts (the figures
   then end at 829px and 792px). On a phone that takes the facts as a
   two-column list and the hero's description after the figures; filled in
   a line each, the facts had pushed the figures off the screen. A laptop's
   browser window is shorter than its screen (1366×768 leaves about
   1366×657, where the figures sat wholly below the fold), so below 880px
   tall a desktop takes the description after the figures too, and smoke
   checks 1366×657 and 1280×720 as well (the figures end at 559px and
   575px; 623px and 635px with every fact at its longest). There the
   scroll cue goes, as it ran through the description from 900 to 1,030px
   wide; where it shows, the hero keeps its 70px clear of the figures
   (smoke checks both at 1024×768 and 1024×881). A small phone's window is
   short too: at 375×667 the fold cut through the second row of figures and
   at 360×640 left it below, so below 700px tall a phone's hero closes up
   (a smaller name, tighter margins), from 360px the eyebrow no longer steps
   down for a two-line caption (every caption fits on one line there), and
   under 380px the two buttons share a line; the figures end at 618px at
   both, and smoke checks them. With every fact at its longest, though, the
   strip and the action alone fill those screens (they end at 630px) and the
   figures follow below; smoke holds that check to the larger windows, and
   a 320×568 phone does not fit them either way. The value line ends at
   "decisions leaders can act on": "from the field to the boardroom"
   claimed an audience no case study shows. ✗
   Seniority, available from, languages with the Dutch level, and right to
   work (owner checklist F1–F3).
2. ✓ **One primary action.** "See the evidence" (to the case studies, in
   their default view) is the one primary button; "Get in touch" is second
   and the CV a quieter link. It is the one filled button on the first
   screen: the nav's Contact, filled to be "the one filled button" in the
   bar, made two identical green buttons there from 900px wide, going to
   different places, so on the homepage it is an outline, filled on hover
   (the other pages, which have no hero, keep theirs filled). Smoke counts
   every filled control on the first screen, in both themes, not only the
   hero's `.btn-primary`. The play index sits just before Contact. The
   nav has six links and no numbers (Work, About, Experience, Research, CV,
   Contact), beside Listen and the theme switch; the menu button takes over
   below 900px, and Work lights up while the reader is in the homepage's
   projects.
3. ✓ **Halve the page.** The six dossiers (44 KB of markup) are six teaser
   cards generated from `content/projects.json`, so they cannot disagree
   with the case studies: a thumbnail, dates and place, the title, the
   headline result and whether it can be checked, the lenses and tools, and
   one link. Seven in Ten and the borehole game are one game, on the
   groundwater case study, and the flood slider is on Wuppertal's; both are
   fetched only as they near the screen (`modules/dossier.js`). The
   EcoPrompt Coach section (then called AI, Weighed) keeps You Draw It; its
   calculator went (`carbon-ai.html` has its own) and Anatomy of a Prompt moved to `carbon-ai.html`, fetched as its
   section nears. A link already shared to one of them on the homepage
   (`#anatomy`, `#boreholeGame`, `#strikeWidget`, `#floodSim`) goes on to
   where it is now rather than opening the homepage at its top, on arrival,
   on a hash set on the page and on Back (smoke checks all three), and
   passes on the site that linked to it as `?via=`, so the count does not
   take the visit for a direct one (`count.js` believes it only from this
   site and takes it out of the address). The games
   keep a keyboard reader's focus: "Drill here" is marked busy while a hole
   goes down rather than disabled, and Back after a link to a game leaves
   the case studies where they are (smoke checks both), and the rig and
   You Draw It, both sliders, take a slider's keys: Home, End and the Page
   keys (and the rig's Up and Down) had scrolled the page away from them.
   Smoke's check of You Draw It's keys at 390×844 is flaky: wave 4's lanes
   saw it fail on some runs, at wave 4's base too, with the page moved
   1,173px. No scroll is called; `#about` and `#experience`, above the
   chart, shrink from a 2,088px stand-in height to their real ones while
   the keys are pressed, which points at the sections drawn on demand
   (Phase 6.3). Not fixed yet. Experience is short cards at every width,
   not only on a phone, each opened by a More button named for its role. The Assay sits
   below the contact form, its question and promise in view and its box
   behind one "Grade a job description" button. To reach the targets
   without losing a fact, beyond the plan: section padding 100 → 56px (44px
   on a phone); About dropped six chips and four fact cards that repeated
   facts shown elsewhere, and took in the Field Notes and the 164's
   breakdown; Skills and Education are one section; the call-to-action band
   between them is gone. `tests/sections.test.js` checks every fact is
   still on the page or one click away.
4. ✓ **A scroll-length budget.** `LENGTH` in `scripts/check-budget.js`
   gives every page a ceiling in screens at 1440×900 and 390×844.
   `npm run smoke` measures each page once it has settled (fonts loaded,
   walked top to bottom, on-demand features arrived, nothing opened,
   reduced motion) and fails one over its ceiling, printing the homepage
   section by section; `--lengths-only` does only that, in about 13 s. The
   open counts page is held to its length drawn full, as the weekly Action
   will commit it. Lengths are measured in Chromium only.
5. ✓ **One listen control, docked,** in the nav, first after the logo,
   where showing it late (voices often arrive after the first paint) moves
   nothing else in the bar; the browser voice by default at 0 bytes; the
   open player covers 13.3% of a 390×844 screen (15.5% with the
   introduction offered), smoke fails it above 20%, and it never covers the
   send button. With no voice, the control and its focus stay put while the
   player's manifest answers, and the manifest is revalidated rather than
   read blind from the cache, so the day Moses records, returning visitors
   see it.
6. ✓ **The journey map on phones.** Below 980px the map is a band pinned
   under the nav bar (about 170px tall at 390px) while the stops scroll past
   beneath it, and it shows the first stop whose name is still below it
   (the one just passed, until the next name is on screen): by a reading
   line it had kept a stop on show with its name under the band and the
   next one whole below, by up to 190px at 360×640. Beside the stops on a
   desktop it shows the stop crossing a reading line rather than the next
   one arriving. Under reduced motion or low-energy mode it jumps
   instead of flying. Every name is 11px or more on screen, and on a
   desktop the Rhine delta's four names sit clear of each other and of the
   route (Wuppertal's and Changsha's moved). The journey section is shorter
   on a phone for it: 2.70 → 2.15 screens at 390×844. Smoke checks the band
   covers none of its stop's text at 390 and 320px, and, every 60px through
   the section, that the stop it shows has its name in sight whenever
   another stop's is.
7. ✓ **Legibility on phones.** You Draw It is drawn as many units wide as
   the pixels it is shown in (up to 640, 5:4 below 480px) and redrawn when
   that changes: every label is 11px or more (4.9px at 390×844 before). The
   two games size their labels from the scale they are drawn at (12px, 11px
   for small print). Anatomy of a Prompt is drawn one unit to one pixel,
   every label 11px or more and inside the drawing at 320, 390 and 1440px.
   The grid instruction names the dropdown it is ("Choose Norway under Grid
   region"). The lightbox left the homepage with its photos and is rebuilt
   on the case studies, where the dossiers' 25 photos are back with their
   captions word for word, folded until asked for: previous and next,
   "2 of 5", the arrow keys and Escape, with focus kept inside and handed
   back. Smoke measures the labels at 390 and 320px and steps the lightbox
   in both themes.
8. ✓ **A shared shell.** `build-content.js` gives every page but the
   homepage the same nav (Home, Case studies, Research, CV, Contact, the
   page you are on marked) and a closing call to action ("Open to" the
   roles in `profile.json`, the email as a link, Send a message, Download
   CV), then Back to top, on the generated pages and, between markers
   `build:check` verifies, on `carbon-ai.html`; the lens links no longer
   lead to a page with no way to reach him. The four pages built on
   `carbon-ai.css` have the homepage's light theme and its switch
   (`theme.js`, before the first paint); a choice is shared with the
   homepage both ways, and with none stored every page, the homepage
   included, follows the system's setting. The field report and the 404
   page take the nav and the call to action as plain lines, with no script,
   no back to top and no light theme: the field report was 9,720 bytes, just
   under where its quoted "9 KB" would round to 10 (wave 4's claim marks
   took it to 10,470, quoted as 10 KB under its 11 KB ceiling), and
   `404.html` is self-contained. axe finds no violation on any page in
   either theme.
9. ✓ **Ratchet the budgets,** once the rest of wave 3 was in: the
   homepage's first view 300 → 288 KB, the largest image 220 → 210 KB, the
   field report file 12 → 11 KB, case studies 120 → 109 KB, research 110 →
   99 KB, and the homepage's length 10 → 9.79 screens on a desktop and
   18 → 17.09 on a phone; every other page's length ceiling is set at its
   measurement plus 5%. `npm run budget -- --ratchet` does it and never
   raises a ceiling; the audio and open-counts budgets are held for what
   has not happened yet (the recording, a full page of counts), and the
   on-demand total (72 of 72 KB) and `carbon-ai.html` (110 of 111 KB) had
   no room to give.

**Phase 3 — wave 4.** Built, and its "done when" holds: every lens has
public work beyond the site's own pages (the validator refuses one that has
none, and each lens's own is shown in its view), the claims-ledger test is
green, and the CV is generated. Not done as a phase: the findings the plan
names (3.3), the testimonials (3.5), the certificates' links (3.8) and the
"Present" role (3.10) wait on Moses. Where the plan began, 3 of 12
case-study results were checkable from outside and 3 of 5 "public" research
outputs were the portfolio itself; now 5 of 15 results across seven case
studies are, and 10 of 16 outputs are public, 4 of them this site's own
pages. No ceiling was raised: the homepage's first view grew 693 bytes
(282,092 → 282,785), past the rounding line, and is quoted as 276 KB
everywhere; 136 of those bytes are the light palette restated for print,
since a reader printing from the dark theme got lime figures and pale-grey
text on white paper, and no saving of the same size was found that kept
the stylesheet's comments. `case-studies.html` grew most (106,779 →
111,373 bytes, 243 under its ceiling once its inline script shipped
without its comment lines; 11.54 and 19.74 screens against 11.85 and
19.78), and
`research.html` is 8.97 screens on a phone against 8.99. `claims.html` is
new, with ceilings of 101 KB and 7.54 and 13.53 screens, set at what it
measured plus 5% once the review had put the figures written in words on
it (36 entries). What the wave needs
from Moses is in the owner checklist: R1–R7 (his repositories), G1–G4 (the
ESG case and the findings), N1–N3 (the ledger's evidence), D1–D3 and L1 (the
CV, the ministry's name, the certificates, the testimonials) and F5.

1. ✓ **His public work on the site.** All six public repositories are
   research outputs, each described only as far as the repository shows:
   WaterProject (also the first public code on the groundwater case study,
   and so behind the water lens), GAIA-Framework- (its own case study, step
   2), climatematch-pipeline (no case study of its own: a new `lenses` field
   places it in the climate-risk view, whose panel lists it after the
   lens's evidence, as the "all" view does too, which is the one a reader
   without JavaScript gets, and its note says it has no licence file),
   A-B-Testing-at-Globox, and SustainableAIPrototypes and promptcoach
   (both public artifacts of the sustainable-AI case study). The toolkit's
   proofs point at them: Python at WaterProject, SQL at the GloBox test,
   Tableau at the same repository, whose README links a Tableau Public
   dashboard, and JavaScript at promptcoach. Machine learning, shown by a
   certificate alone, says "no public project yet" and links nowhere. QGIS
   links the groundwater case study and says its maps are "on request; no
   public GIS project yet": that case study's one public repository,
   WaterProject, shows no QGIS or ArcGIS work, and a test now accepts a
   case study as a proof only when a public artifact of it names the tool.
   Power BI is claimed nowhere (a test keeps it so). `checkLensWork` in
   `scripts/lib/content.js` refuses a lens with no public work of its own
   beyond the site's own pages: the artifacts of the case studies that list
   it first, and the outputs placed in it. (Counting every case study that
   touched a lens let the climate view pass on the sustainable-AI case's
   repositories; without climatematch-pipeline it now fails.)
   `research.html` groups its outputs by availability
   (public, on request, held by the client), each note ending with its case
   study or lens, the reproduction notes folded. No partner is newly named.
   WaterProject's apps and the Tableau dashboard are reached through their
   repositories, not linked directly: WaterProject's README says its Pages
   app goes live only once Pages is switched on, which nobody has
   confirmed (R5), and the Streamlit and Tableau hosts are not on the
   allowlist. ✗ Moses: the client names in WaterProject, the SQL label, a
   public machine-learning project, whether the dashboard and the apps are
   live, climatematch's licence, and public GIS work (R1–R7).
2. ✓ **An ESG/CSRD lens and case study.** `?lens=esg-csrd`, "ESG & CSRD
   reporting", built from GAIA, Anatomy of a Prompt and the OnePointFive
   accelerator. Its home case study is a seventh, GAIA, presented as method
   and tooling, with no client's assessment claimed (its caveat says so):
   three public artifacts (the repository, the web estimator and
   `carbon-ai.html#anatomy`) and two results checkable from outside, each on
   what the repository states (3,984 cross-engine checks passing at 2.2.0;
   every output mapped to GRI, ESRS E1 and E3, IFRS S2, CDP and SBTi, as a
   mapping, not an assurance). Its method opens with the rebuild on
   published science: the OnePointFive accelerator, which the repository
   never mentions and which came months before it, is the ESG view's
   background, not a step of GAIA. The sustainable-AI case joins the lens. GAIA
   has no homepage card (`homepageCard: false`); the homepage's projects
   section links the ESG view beside the other three. Each view now opens on
   its home case studies, so `?lens=esg-csrd` opens on GAIA, the climate
   view on Wuppertal and the water view on its three water-first studies.
   ✗ Moses: whether GAIA is his to publish and whether it is the ministry
   project's held framework, and the GAIA case's own facts (G1, G2).
3. ◐ **Findings and recommendations.** Every case study carries `findings`:
   one to four entries, each a finding or a recommendation (at least one a
   finding), with a basis wherever there is a figure. The validator refuses
   a case study without them, and they render as stage 05. They come only
   from the field notes, the case studies' own text, photo captions, the
   climate lens and the GAIA repository, so where the evidence is thin the
   list is short: UNDRR has one, and Wuppertal one, its recommendation
   having named no measure. The sustainable-AI finding on the spread
   between models rests on the coach's factor set, not on the field note
   that says it, and says "few tools put it in front of the person typing"
   where it said "nobody", beside the case's own tools that do; the
   principles finding names two of the five cards, as the photo shows them. Partial because none of the three findings this
   step names is on the site: the coastal finding says only that the thesis
   sets out which drivers dominate; Wuppertal has no measure; the
   sustainable-AI case gives its five design principles, not the ministry's
   decision criteria, which nothing on the site records. To make room under
   the page's length ceiling each method is folded behind a press ("02
   Method, four steps"), and so is the page's closing note; printed, both
   open. ✗ Moses: confirm the findings, and supply the coastal drivers, the
   Wuppertal measures and, if the framework may be quoted and the ministry
   named, its decision criteria (G3); the folded method (G4).
4. ✓ **One name for one tool.** "AI, Weighed" is gone from every page, the
   README, the budget labels, the open counts' page names, smoke and the
   tests (`content.test.js` fails if it comes back): the tool is EcoPrompt
   Coach. `carbon-ai.html` is "this site's edition", dated from
   `ai-carbon-data.js` (models reviewed 2026-08-05, grid data 2023); it and
   the homepage's section 05 link the maintained app
   (moseskolleh.github.io/promptcoach) and its code as the canonical tool,
   for newer models, whose figures the app says are extrapolated. Nothing
   claims the edition reproduces the maintained tool's calculation. The
   other option, refreshing `ai-carbon-data.js` from GAIA's model catalogue,
   was not taken: 117 of its 119 current models are modelled, not measured,
   and its units differ. On the way, the "Power Hungry Processing" citation
   got its authors right (Luccioni, Jernite and Strubell). ✗ Moses: that the
   app is live (R5).
5. ◐ **Testimonials with provenance.** Built: `content/testimonials.json`,
   whose validator refuses a quote without a source (a linkedin.com profile
   or recommendations address, or "on request" with the date permission was
   given), a fourth entry or a quote over 200 characters; the homepage draws
   a block under the core log only when there is an entry. A figure in a
   quote, or in a certificate's line, is marked like any other on the
   homepage, and one the claims ledger does not hold as written is refused
   by name (`checkQuotedFigures`): a form on its entry is the fix, and the
   quote is never edited. Partial because
   there are none, so the homepage shows nothing: ✗ Moses, two or three
   people with permission (L1). No full-length one fits yet: with stand-in
   quotes of 200 characters, one takes the homepage to 9.80 screens at
   1440×900 against a 9.79 ceiling, and two to 9.80 and 17.18 at 390×844
   against 17.09, so room has to be made first.
6. ✓ **Check my numbers.** `content/claims.json` holds the 36 figures the
   site prints, each with its value, what it counts, exactly one basis (a
   case-study result, a `profile.json` field, an `ai-carbon-data.js`
   factor, a source with its URL, a budget, a figure derived from others, or
   "illustrative") and whether a reader can check it (public, with where;
   on request; or not checkable; a result's is its case study's). Every
   figure on `index.html`, `carbon-ai.html`, `field-report.html` and
   `404.html` is wrapped by hand in `<span data-claim>`, and the build marks
   those the generated pages print from `content/`. `claims.html`, generated,
   lists them by checkability with the pages that mark each, each "Where"
   linking the section, or the view of the case studies, that shows the
   figure; it is linked under the hero's figures, from every footer and
   from the 404 page. `tests/claims.test.js` fails on
   a mark that disagrees with its entry, an entry with no basis, a number
   the narration says that no entry backs, and an unmarked numeral on any
   page but `stats.html` (whose counts are the counter's own), in digits or
   in words, in the text or in the labels, tooltips, photo captions and
   descriptions a reader is shown. A size said in words is read too ("a
   fifth of a kettle", "twice", "millions of"): the kettle, which had no
   basis, is gone, and "an order of magnitude" is held to the factor set.
   Every host the scan skips because a script fills it names that script,
   and what the script prints of its own is read from its source and held
   to the ledger: the field terminal's lines, the Assay's evidence ("164
   water points…", once held only to appearing somewhere on the site), the
   receipt's 10 KB, You Draw It's words and the coach's tips, three of
   which quoted ranges no source gave ("4–10× more energy per token") and
   now print only what they work out or the factor set holds. The footer's
   badge prints no fixed figure. The allowlist is wider than years: `EXEMPT` in
   `scripts/lib/claims.js` also passes dates, section numbers, standards'
   names, versions, return periods and the like, each narrowly, and a test
   feeds it the same numbers counting something; `WORD_EXEMPT` passes "one"
   and a count of what the page shows in full, which a test holds to the
   number shown. A count in words that is a figure is an entry, so
   the Wuppertal team of six, the five months at UNDRR, the five design
   principles and the factor set's models, grid regions and cooling
   profiles are on the list (36 entries). Not ledgered: the calculators'
   outputs (their inputs are). Where the calculator's input is its own
   choice (the default PUE, the reference mix, the output weight and its
   range), the ledger says so rather than giving the factor's citation as
   its source. Two figures were corrected: "~25 MB of images" had no basis and is now "~22 MB on
   arrival", measured at commit `3d7ab78`; the field report is quoted at
   10 KB and ≈0.004 g. ✗ Moses: the evidence behind the on-request and
   not-checkable figures, the 22 MB line (N1–N3), and a source for the 30%
   (E1).
7. ✓ **A CV generated from `content/`.** `npm run cv`
   (`scripts/build-cv.js`) prints `assets/Moses_Kolleh_Sesay_CV.pdf`, two A4
   pages, with the smoke test's Chromium, from `profile.json`,
   `projects.json`, `research.json` and the homepage's own words, through
   the template `scripts/cv.html` (not a page of the site), the site's fonts
   embedded as TrueType and nothing fetched. `tests/cv.test.js` reads the
   PDF back without a browser: every role, degree and certificate, every
   case study's headline result, the public outputs; none of the dropped
   claims, no name not yet cleared, no number `content/` lacks, and no
   "facts confirmed" line until Moses has set `meta.confirmedOn` (it ended
   "Facts last verified 5 August 2026", the day the record is logged as of,
   which nobody had confirmed); and
   `assets/cv.hash` fails it once `content/` or the homepage has moved on
   without a new print. The old CV's "10,000+", 95%, 15%, "3+ years" and
   Power BI are gone. His phone number is on it, as the homepage's contact
   card publishes it (`person.phone`, held to the card by a test). Left off
   until Moses says: the ministry's name. ✗ Moses: read it (D1); the
   ministry (D2).
8. ◐ **Certificates link to their verification pages.** Built: an optional
   `verifyUrl` per certification in `profile.json`; the homepage's
   certificate cards are generated from the list, with a "Verify" link
   where there is one, on the CV too; `VERIFY_HOSTS` limits it to issuers'
   hosts, and Coursera's and CFI's credential site are on the allowlist.
   Partial because no certificate has its link yet: ✗ Moses, the four
   links (D3); Masterschool's and the UN System Staff College's hosts are
   added once known.
9. ✓ **Depths from dates.** `npm run build:content` writes each core-log
   layer's depth from its role's dates, 10 m a year, its top where the role
   ended and its base where it began, measured from `meta.verifiedOn`
   rather than the day of the build (the build is deterministic, and no
   test fails on the calendar): the labels went from 0, 8, 24, 63 and 70 m
   to 0–9, 13–14, 28–32, 68–73 and 73–79 m, and the head reads "LOGGED AUG
   2026". `tests/corelog.test.js` works them out by hand, and a role added
   or reordered on one side only stops the build.
10. ✗ **Re-verify the "Present" role** (F5). `SustainableAIPrototypes` was
    last changed on 2025-11-26, and promptcoach's handover document from the
    Digital Society School is dated January 2026. Moses's confirmation is
    `meta.confirmedOn`, null until he sets it, and only then does the CV say
    the facts were confirmed; bumping `meta.verifiedOn` redraws the core log
    (the narration says "as last logged", not "today"), so `npm run cv`
    follows either.

**Phase 4.** 4.3 ◐ the ten stock-voice tracks (4.13 MB) are retired; the
`intro` script (193 words, opening "Kushe") is in `content/narration.json`;
`npm run voice:intro` installs a take; the audio budget is 800 KB; Fish
Audio renders only with `--sections`. ✗ Moses's approval of the wording and
his recording. 4.1 not started: the Assay's rules are plain data, ready to
move to `content/brief.json`. 4.2 and 4.4 not started.

**Phase 5** — not started (5.2, 5.5 and 5.6 ✗ Moses).

**Phase 6 — steps 3, 6 and 7 in wave 2, step 8 in wave 3.** Steps 1 and
9–11 not started; 2, 4 and 5 only as far as wave 3 went in passing.

2. ◐ **Images.** The dossier half is done, by the dossiers leaving: each of
   the homepage's six project cards carries one lazy thumbnail (a 480px
   copy), and the case studies' 25 photos fetch nothing until their row is
   opened. Not started: an 800px hero for phones, dropping
   `fetchpriority=high`, AVIF.
3. ✓ **CPU.** The homepage's sections below the hero (nine then, seven
   since wave 3) get `content-visibility: auto` once JavaScript runs, and only where the
   browser anchors scrolling (`@supports (overflow-anchor: auto)`): Safari
   has no scroll anchoring and was not tested, so it draws every section as
   before. Sections the reader
   has passed are drawn once scrolling rests, so reading back up after a jump
   or a dragged scroll bar moves nothing; smoke re-tests the jump landings,
   the scroll-spy, find-in-page and printing with sections not yet drawn.
   Every looping animation, the pulse included, runs on transform and
   opacity and pauses out of view and in a hidden tab; `relayout()` runs at
   most once a frame; the counters respect reduced motion (wave 1). Measured
   by the lane at 4× CPU slowdown in Chromium (medians of 15 loads before,
   10 after): layout on load 238 → 125 ms, the longest task 238 → 110 ms,
   and the idle main thread 1,023 → 16 ms per 3 s at the top of the page.
   Smoke on 2026-09-28 measured 5 ms at the top and 4 ms mid-page per 2 s,
   against a 100 ms ceiling. On the way, the portrait's stated height was
   found wrong (640 for a 640×960 image, a 159px jump as it loaded); it is
   fixed, and a test checks every image's stated shape against its file.
4. Not started. Wave 3 took eleven unused symbols out of the homepage's
   sprite, and `tests/html.test.js` checks every icon a page draws resolves
   to a symbol on that page.
5. Not started. Wave 3 took the `@font-face` blocks out of `content.css`
   (the shell's pages load `carbon-ai.css`, which has them), so two
   stylesheets carry them, not three.
6. ◐ **JS hygiene.** ✓ One `keydown` handler on `document` routes every key
   by layer (terminal, player, menu, page; the lightbox layer left with the
   homepage's photos in wave 3), so one Escape closes one layer; the other page-wide listeners that hear keys only watch for
   the reader taking over (the jump hold lets go, the journey map starts
   loading). ✓ One reduced-motion helper, `mks.motionOK()`, which answers
   for low-energy mode too. ✓ The time-zone table is `assets/timezones.json`,
   fetched when the journey map arrives; the map's paths were re-encoded as
   relative steps, pixel-identical, to make room for it in the on-demand
   budget (69 of 72 KB). ✓ Everything the core shares with the modules hangs
   off `window.mks` (`mks.load`, `mks.storage`, `mks.track`, `mks.terminal`,
   `mks.narration` and the rest), and a test fails if an old name comes
   back. The six top-level function declarations `script.js` still had
   (`revealTarget`, `focusTarget`, `jumpTo`, `handleHashReveal`,
   `setMenuOpen`, `mksLoadFor`), each a property of `window` in a classic
   script, are `const` now, and a test fails if the core (`script.js`,
   `count.js`, `modules/`) declares a function at the top level again. The
   scripts outside the core still put names on their own page's `window`:
   `ai-carbon-data.js` (`AICarbonData`) and `voice-scripts.js`
   (`VoiceScripts`), which export themselves for the browser and for Node,
   and carbon-ai.html's `carbon-ai.js` (four top-level functions, and
   `EcoPromptCoach`, through which `modules/anatomy.js` reads the
   calculator since wave 3). A test names each of them, so a new one cannot
   be added unnoticed.
7. ◐ **CI.** ✓ `push` runs on `main` only, and a newer commit on a pull
   request cancels the older run. ✓ Node 22 (`engines`:
   `^22.22.0 || >=24.8.0`, which html-validate needs). ✓ Chromium pinned to
   the build `playwright-core` 1.56.1 names (141.0.7390.37), cached in CI.
   ✓ Suites run side by side, one process each, and the timing suites on a
   fake clock: `test:unit` takes about 18 s here for twenty-eight suites
   (about 65 s of work, four at a time), where twelve used to take about
   17 s one after another; a new suite runs the day it exists. ✓ axe-core in smoke on every page at
   1440×900 and 390×844 in both themes, and on the homepage's open states
   (0 violations); html-validate on every page in `npm test`, not in smoke
   as this step says: on the source files it needs no browser, runs early in
   the test job, and names the file and line to fix, and
   what scripts add after load is covered by axe in smoke. ✓ A budget
   for `carbon-ai.html` (111 KB of 111 KB today, 468 bytes under), and
   smoke compares every budgeted page's measured first view with its estimate. ✓ A Firefox pass,
   a CI job of its own: its first run, on pull request #49, failed eight
   checks (carbon-ai.html's selects in each browser's own font, and one
   check that read a jump before it settled), fixed in `c85f9b6`, and it
   then passed. Wave 3's new smoke checks first ran in Firefox on pull
   request #50: two journey-map checks failed there (fixed in `03c8c21`, on
   `main`), and the next run passed all three jobs. Wave 4's new checks have
   run only in Chromium so far; their first Firefox run is on its pull
   request. Not started:
   comparing smoke screenshots with a baseline, left until after the Phase
   2 redesign, which changes every one.
8. ✓ **A carbon receipt on every pull request.**
   `.github/workflows/receipt.yml` measures `main` and the pull request
   with the pull request's own scripts (`check-budget.js --json`, and
   `smoke.js --lengths-only` in the pinned Chromium), and
   `scripts/receipt.js` writes one comment, edited on each push: every
   budget's bytes and how they moved, the CO₂e of each page's first view at
   0.36 g/MB (network transfer only), each page's length at both sizes, and
   anything over its ceiling first; from a fork it goes to the job summary
   instead. Each side's ceilings are its own: measuring another checkout,
   `check-budget.js --json --root` reads them from that checkout's copy of
   the script, so a ceiling the pull request lowers, raises, adds or drops
   shows what main's was (read from the branch's copy, both sides had the
   branch's, and a moved ceiling never showed; `receipt.test.js` now runs
   it on a checkout whose copy differs). `check-budget.js` ends its report
   with "you could lower X from A to B" wherever a ceiling could come down:
   more than 10% headroom, and a ratchet target (measured plus 5%, at least
   1 KB or a tenth of a screen over it) below the ceiling, and writes the README's budget and length tables, its quoted
   first-view ceiling and the core script's weight (typed by hand, it had
   gone stale);
   `npm test` fails while they are stale, and the weekly open-counts Action
   rewrites them. The README's table of on-demand modules is written the
   same way: the words for each row are in `MODULE_TABLE`, the weights are
   measured, and a file fetched on demand that no row names stops it being
   written. It first ran on pull request #50 (2026-10-03): both runs
   succeeded, and the second edited the first one's comment in place.

**Phase 7** — not started.
