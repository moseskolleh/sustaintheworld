# Moses Kolleh Sesay - Portfolio Website

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://moseskolleh.github.io/sustaintheworld/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## About

Professional portfolio website for **Moses Kolleh Sesay**, a Sustainability & Climate Analyst specializing in ESG analysis, climate resilience, and data-driven environmental solutions.

**Live Website:** [https://moseskolleh.github.io/sustaintheworld/](https://moseskolleh.github.io/sustaintheworld/)

## Features

- **Living journey map**: a hand-built SVG map of the journey region — West Africa to East Asia, so every stop gets real resolution instead of a world map that's half empty ocean (Natural Earth 50 m coastlines, simplified hardest away from the Rhine delta where the map zooms deepest, zero runtime dependencies). It flies from Freetown to Changsha, Bonn, Wageningen and Amsterdam as you scroll, and fieldwork sites like Wuppertal join the map when the story reaches them. Regenerate with `npm install && npm run map:build`, then sync the printed stop pixels into `script.js`; `npm run map:check` proves the committed SVG still matches the script and runs in CI
- **"Seven in ten" — site the borehole**: a playable resistivity profile on the [groundwater case study](case-studies.html#play-borehole) — read the curve, place the rig, drill. Water-bearing fracture, clay pocket or dry hole; your holes fill a scoreboard beside the field records' 7 in 10 (reading the curve first) and blind drilling's ~3 in 10, which is labelled illustrative until it has a source. It was two widgets, the game and a strike-rate slider, making one point; it is one now
- **"Don't let it become a boat" flood scene**: a schematic Wupper cross-section on the [Wuppertal case study](case-studies.html#play-flood) — slide the river from a calm day to July 2021 and watch the margin under the Schwebebahn's hanging cars shrink. Both games load only when a reader scrolls near them, and without JavaScript each is one line of summary
- **Field terminal**: press <code>`</code> anywhere (or the footer button) for a hidden green-on-black terminal — try `journey`, `drill`, `co2`, `voice`, `kushe`, `help`
- **The spoken page**: one `Listen` control in the nav reads the section in view with the browser's own speech engine, which transfers **zero bytes**. The one recording on the site is Moses introducing himself in his own voice, offered once he has recorded it, fetched only on click and labelled with exactly what it transfers (see [Narration](#narration-the-spoken-page)). Nothing ever autoplays
- **Carbon-aware by construction**: images ship as optimized WebP, the three typefaces are self-hosted subsets, and a first view costs about **274 KB over the wire, fonts included**, against a 300 KB ceiling `npm test` enforces — a budget, not a number in a README, and one that `npm run smoke` checks against a real browser (see [Performance](#performance)). Everything a visit does not reach — the narration player, the field terminal, the section-05 interactives, the case studies' two games — is fetched only when it is used. Nothing is loaded from any other origin, and only two things are ever sent to one, both to the site's own Apps Script endpoint: a contact message, and one cookieless visit count per page view (never under Do Not Track or Global Privacy Control; see [The visit counter and privacy](#the-visit-counter-and-privacy)). A live footer badge weighs each visit in the browser (Resource Timing API × Sustainable Web Design model), counting network transfer only. A low-energy mode pauses all animation and honours `prefers-reduced-motion`
- **[Case studies](case-studies.html), evidence-first**: the same six projects as **problem → method → artifact → result**. Every result carries the basis it rests on and says plainly whether you can check it from outside; every artifact says whether it is public, available on request, or held by the client. See [Content pipeline](#content-pipeline)
- **Role-specific lenses**: `case-studies.html?lens=water`, `?lens=climate-risk`, `?lens=sustainable-ai` — shareable views that reframe the portfolio for one kind of role. They **reorder and frame, they never filter**: every case study stays on the page in every view, because a view that hides inconvenient work is a CV that lies by omission. Without JavaScript the switcher steps aside and every case study shows in the default view
- **No dead ends**: every page but the homepage shares one small nav (Home, Case studies, Research, CV, Contact, with the page you are on marked) and ends with a way to reach Moses: his address, the contact form and the CV. The pages built on `carbon-ai.css` have the homepage's light theme and its switch, and keep the reader's choice from page to page (`theme.js`, before the first paint); with nothing chosen they follow the system's setting, with or without JavaScript. The text-only field report and the 404 page take the nav and the call to action as plain lines, and no script
- **[Research outputs](research.html)**: theses, reports, datasets, code and tools, each labelled public / on request / held by the client. No DOI, journal or conference is named anywhere, because none of this work has one — and a test fails the build if one ever appears without proof
- **[Open counts](stats.html)**: what the site's own cookieless counter has counted, rebuilt weekly — the five numbers that say whether the site works, page views by page, lens and window width, referrers, features used and bytes per page view, in whole weeks. Every count under 5 reads `<5`, a figure that would let one be worked out by subtraction reads `held`, and the page prints the exact payload a page view sends. See [Open counts](#open-counts)
- **Borehole core-log experience timeline**: career history logged the way a geologist logs a core — depth is time, every layer is a chapter. On a phone each role is a short card (role, organisation, dates, one line), the rest a press away
- **"AI, Weighed"**: one chart from the EcoPrompt Coach research on the homepage — guess how the energy of one AI answer grows with model size, then see the published estimates. The calculator (model × grid × tokens → energy, carbon, water) and Anatomy of a Prompt are on [`carbon-ai.html`](carbon-ai.html)
- **Evidence-first skills**: no invented percentages — every tool links to the project where it earned its place, and the 164 water points are itemized
- **The Assay**: paste a job ad under the contact form and get an honest fit, graded in the browser; the ad itself is never sent (the page view's count carries the grade, see [The visit counter and privacy](#the-visit-counter-and-privacy)). It lists matched evidence with links, and gaps (languages, years of experience, named tools, consulting-firm or director-level experience, financial modelling, a PhD or a law degree), first when they cap the grade; right to work, visa, clearance, driving licence, relocation and the level of English are named as things to confirm with Moses, never guessed. General skills (stakeholders, data, delivery, international work, research) count towards a grade but never make one: an ad with nothing from his own field is "Different field" Its facts about him come from `content/profile.json`
- **Field Notes**: short essays connecting boreholes, scenario storytelling and sustainable AI
- **Modern design**: dark theme with vibrant green accents, light mode, responsive layout, full SEO/social metadata (Open Graph, JSON-LD, sitemap)
- **Comprehensive sections**: journey, about (with CV download), experience, six project cards leading to the case studies, AI cost widget, skills, education, field notes, contact form

## Technologies Used

- **HTML5**: Semantic markup for better SEO and accessibility
- **CSS3**: Modern styling with CSS Grid, Flexbox, animations, and transitions
- **JavaScript (Vanilla)**: no framework, no bundler. A 73 KB core (`script.js`, 23 KB gzipped) and four on-demand modules in `modules/` (plus the player's stylesheet, `modules/dispatch.css`) that the core fetches the first time a feature is used
- **Icons**: an inline SVG symbol sprite, no icon font
- **Fonts**: Inter, Space Grotesk and IBM Plex Mono, self-hosted as Latin subsets under the SIL Open Font License (see [Fonts](#fonts))
- **GitHub Pages**: Free hosting for static websites

## Sections Overview

### 🏠 Home (Hero)
- Name, role and a one-line value proposition over a rotating set of fieldwork photographs (the rotation only runs while the hero is on screen and the tab is visible)
- An at-a-glance strip written from `content/profile.json` by `npm run build:content`: the roles he is open to and where he is today; seniority, start date, languages and right to work appear once Moses states them, and a fact that is `null` is simply not shown
- One primary action (**See the evidence**, to the case studies), **Get in touch** second, and a quieter CV link; the figures below and the photo's caption sit inside the first screen at 1440×900 and 390×844
- A six-link nav: Work, About, Experience, Research, CV and Contact, with the one `Listen` control and the theme switch beside them. The index of the five interactive features sits just before Contact
- Four exact figures (164 water points, 54 hazard systems, 3 continents, 2 master's degrees), written into the HTML so they read correctly without JavaScript; with it they count up to the same values, with nothing appended, and stay still under reduced motion or low-energy mode

### 🗺️ Journey
- The living journey map: Freetown → Changsha → Bonn → Wageningen → Amsterdam, flown as you scroll, with a visitor mark for wherever you are reading from

### 👤 About
- Professional summary with the CV download
- Four fact cards: where the work was done, the 164 water points, the data toolkit and the ESG certificate

### 💼 Experience
- The borehole core-log timeline: depth is time, every layer a chapter, technology tags for each
- Below 600px, short cards: role, organisation, dates and the first line, with the rest and the tags behind a More button

### 🔬 Projects
- Six teaser cards, generated from `content/projects.json` so they cannot disagree with the case studies: where and when, the headline result with the one line of its basis and whether you can check it from outside, the role lenses, the tools, one photo, and one link to the whole story on `case-studies.html`
- The two games that used to sit in the dossiers are on the case studies they illustrate: "Seven in ten" on groundwater, "Don't let it become a boat" on Wuppertal

### ⚡ AI, Weighed
- You Draw It, the homepage's one chart from the EcoPrompt Coach research, with a link to the coach
- The calculator and Anatomy of a Prompt (where one query lands on a CSRD report) are on `carbon-ai.html`; Anatomy is drawn from the calculator's own numbers and fetched only as its section comes near

### 🛠️ Skills
- Evidence-first: every tool links to the project where it earned its place, with real field numbers instead of percentages
- ESG frameworks and standards (SBTi, CDP, GHG Protocol, TCFD, TNFD, etc.)

### 🎓 Education
- Master's degrees in Environmental Sciences and Industrial Engineering
- Bachelor's degree in Geology
- Professional certifications (ESG Specialist, Google Data Analytics, etc.)

### 📝 Field Notes
- Short essays connecting boreholes, scenario storytelling and sustainable AI

### 📧 Contact
- Direct contact details, social links and the contact form (Google Apps Script backend, honeypot, rate limits; works without JavaScript by posting to the same endpoint), with The Assay below the form as the optional step

## Setup Instructions

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/moseskolleh/sustaintheworld.git
   cd sustaintheworld
   ```

2. **Open in browser**
   ```bash
   # Simply open index.html in your web browser
   open index.html  # macOS
   start index.html # Windows
   xdg-open index.html # Linux
   ```

   Or use a local server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js (if you have http-server installed)
   npx http-server
   ```

3. **Access the website**
   - Open your browser and navigate to `http://localhost:8000`

### GitHub Pages Deployment

The website is automatically deployed to GitHub Pages from the main branch.

To deploy or update:

1. **Push changes to GitHub**
   ```bash
   git add .
   git commit -m "Update portfolio"
   git push origin main
   ```

2. **Enable GitHub Pages** (if not already enabled)
   - Go to repository Settings
   - Navigate to Pages section
   - Select source: Deploy from branch
   - Select branch: `main` (or your deployment branch)
   - Click Save

3. **Access your live site**
   - Your site will be available at: `https://[username].github.io/sustaintheworld/`

## Narration (the spoken page)

> Recording Moses's introduction, or setting up the optional Fish Audio
> toolchain? See **[docs/narration-setup.md](docs/narration-setup.md)** for
> step-by-step instructions.

One **Listen** control sits in the nav bar, first after the logo: it shows
once something can speak, often after the first paint when a browser's voices
arrive late, and there it takes only free space, so nothing else in the bar
moves under a reader's finger. It reads the section in view
aloud, the player it opens moves between sections, and nothing ever
autoplays. There used to be ten of these, one per section; one means nine
fewer Tab stops on the way down the page.

| | browser voice | Moses's own voice | stock voice (retired) |
|---|---|---|---|
| reads | any section | a 60–90 s introduction, opening with "Kushe" | the ten sections, until September 2026 |
| engine | `window.speechSynthesis` | his own recording, `assets/audio/intro.mp3` | Fish Audio text-to-speech, pre-rendered |
| transferred | **0 bytes** | up to ~720 KB (90 s at 64 kbps), only when pressed | 330–520 KB a section, 4.13 MB in all |
| label shown | `browser voice · 0 KB transferred` | `Hear Moses introduce himself · N KB` | — |
| status | the default | offered once he has recorded it; until then absent | retired |

**Why the stock voice was retired.** The ten section tracks were read by
*Spiritual African Narrator*, a stock voice from the Fish Audio library, and
the player said so. Three things ended them:

- **They repeated claims the page no longer makes.** Audio cannot be corrected
  with a text edit; it has to be rendered again.
- **Every copy edit cost credits.** A track has to match its script, and a full
  render is about 7,850 Fish Audio credits against a free allowance of 8,000,
  so each change to the homepage was a bill.
- **A stock voice reading first-person lines was never Moses.**
  [docs/narration-setup.md](docs/narration-setup.md) already admitted that a
  stock voice delivering "I grew up where water scarcity isn't a statistic" as
  him "is a different proposition".

So the browser voice reads the sections, and the one recording the site plays
is Moses's own introduction — a person, not a model of one. Narration drops
from 4.13 MB to at most ~720 KB, and to 0 bytes until he records it.

**The player.** It opens just under the nav bar, so it cannot sit over the
contact form's button the way a bottom-docked player did on a phone, and it is
compact: `npm run smoke` fails if it covers more than 20% of a 390×844 screen
(it used to cover about 45%). It keeps captions, pause and resume, speed,
previous and next section, and close; it comes straight after the Listen
button in Tab order, and Escape closes it and returns focus there. Its code
and stylesheet load on the first press, not with the page.

**What the gram figures mean.** They are **estimated network-transfer
emissions** — bytes moved, times the Sustainable Web Design constant
(0.36 g CO₂e/MB). That is all they are. They exclude the energy the listener's
device spends decoding audio, driving a speaker, and — for the browser voice —
synthesising the speech in the first place. The browser voice transfers zero
bytes, which is genuinely zero *transfer* emissions; it is not free. Every
figure in the player says "transfer" for that reason.

**Offline** speech voices are preferred: Chrome's default network voices
stream audio from Google's servers, so where only one of those exists the
label says "streamed, size unknown" rather than printing a zero the page
cannot stand behind.

**With nothing to speak with, there is no control.** With JavaScript off, or
in a browser that has no speech voice and no recording of Moses to offer, the
Listen control never appears, rather than sit there dead. A browser with no
voice asks for the narration manifest (under 1 KB) once, after the page has
loaded, and gets the control for his recording alone if it exists. If the
recording fails to load, the player says so and offers a retry; the browser
voice never stands in for him.

### Editing what it says

Scripts live in [`content/narration.json`](content/narration.json), from which
`npm run build:content` generates `voice-scripts.js` — **not** scraped from the
page. Reading the DOM aloud produces garbage: stat counters mid-animation, SVG
labels, and "S-B-T-i, C-D-P, T-C-F-D" spelled letter by letter. Each script is
written for the ear and must stay factually identical to the section it
narrates. Editing a section script now costs nothing: the browser voice reads
whatever the text says.

`npm test` asserts that sentence-splitting never corrupts a script — the
initialisms (`A.I.`, `Arc.G.I.S.`) and the real numbers ("164 water points")
both have to survive intact.

### Moses's introduction

The `intro` script in `content/narration.json` is the one Moses reads aloud:
about 190 words, first person, opening with "Kushe", every fact already on the
site. Once he has a take:

```bash
npm run voice:intro -- path/to/take.mp3               # copies it in, measures it, writes the manifest entry
npm run voice:intro -- path/to/take.mp3 --seconds 78  # when the length cannot be read from the file
```

That copies the take to `assets/audio/intro.mp3`, measures its bytes and length
(ffprobe if installed, otherwise the MP3's own frame headers, otherwise
`--seconds`), and writes the `intro` entry in `assets/audio/voice-manifest.json`
— marked `voiceKind: "recorded"` and `voiceTitle: "Moses Kolleh Sesay"`, which
is what the player checks before offering it. **It is his own voice, recorded
by him, so no voice model, API key or third party's consent is involved**, and
nothing is uploaded anywhere. The script doubles as the captions, so
`npm test` fails if it is edited after the take without the recording being
installed again, and the budget below holds the file to 800 KB.

### Rendering section tracks (optional, off by default)

The Fish Audio pipeline stays for anyone who wants rendered sections, but it
no longer runs because a sentence changed. It renders only when asked by name:

```bash
npm run voice                           # explains the above; renders nothing, spends nothing
npm run voice -- --sections --dry-run   # the plan and the bill, spends nothing
npm run voice -- --sections             # render what changed
npm run voice -- --sections --force     # render everything
npm run voice -- --clone path/to/sample # make a voice model (add --sections to render with it)
```

The API key is used only there, on your machine; it never reaches the browser.
Fish Audio bills 1 credit per UTF-8 byte of text, so the cost is known before
anything is sent: the ten sections are ~7,850 credits today, and the dry run
prints the exact figure. Scripts are hashed, so fixing one sentence re-renders
one file. `scripts/lib/voice-signature.js` is
the one definition of "has this track already been rendered?", shared by the
generator and the chunk assembler (`npm run voice:assemble`, and the manual
*Assemble voice narration* workflow, which does nothing while
`scripts/voice-chunks.json` is empty).

The site's player does not play section tracks, and committing them would
exceed the 800 KB audio budget, which is sized for the one introduction.
Bringing recorded sections back is a decision to make on purpose — in the
player and the budget, in one reviewed commit — not a side effect of a render.

### Auditioning voices (MCP)

Choosing a voice is exploratory — you want to hear three candidates read the
same line and pick one. That is a bad fit for a build script and a good fit for
an MCP server, so the repo ships a project-scoped [`.mcp.json`](.mcp.json)
wiring up [`@alanse/fish-audio-mcp-server`](https://github.com/da-okazaki/mcp-fish-audio-server).
Claude Code picks it up automatically in this directory.

No key is stored in it. `${FISH_AUDIO_API_KEY}` expands from your shell, and it
is the same variable the build step reads, so one export drives both:

```bash
export FISH_AUDIO_API_KEY=your_key_here
```

The server exposes `fish_audio_tts` (pass `reference_id` per call to compare
candidates) and `fish_audio_list_references`. Auditions are written to
`.voice-auditions/`, which is gitignored.

Prefer OAuth to an API key? Fish Audio also runs an official remote server —
`claude mcp add --transport http fish-audio https://api.fish.audio/mcp` — which
bills against plan credits rather than developer API credits.

### Verifying without spending credits

The pipeline can be exercised end to end against a local stand-in that speaks
the same protocol — real files, real byte sizes, no network call and no
billing:

```bash
npm run voice:mock      # terminal 1
npm run voice:check     # terminal 2 — renders the sections against the mock
```

It writes `.wav` (gitignored) so mock output can never be mistaken for real
narration.

## Tests and checks

```bash
npm install
npm test          # everything below
```

Node 22.22 or later in the 22 line, or 24.8 or newer (`engines` in
`package.json`): html-validate, which `npm test` runs, needs one of those, and
CI uses Node 22.

| Command | What it holds in place |
|---|---|
| `npm run build:check` | every generated page still matches `content/` |
| `npm run fonts:check` | the committed fonts still hash to their manifest and every stylesheet's `@font-face` block is current |
| `npm run lint:html` | every page is valid HTML ([html-validate](https://html-validate.org/)'s recommended rules; the two relaxations are explained in `.htmlvalidate.cjs`) |
| `npm run test:unit` | every `tests/*.test.js`, side by side, one process per suite, so a new suite runs the day it exists: the seventeen listed below (1369 passing assertions on 2026-09-27) |
| `npm run map:check` | the committed `journey-map.svg` still matches its generator |
| `npm run budget` | the weights this README quotes (see [Performance](#performance)) |
| `npm run smoke` | every page in a real browser: no errors, no failed or off-origin requests, every on-demand module arrives when used, no axe-core violation at 1440×900 or 390×844 in either theme, and each budgeted page's measured first view no heavier than the budget claims; every page again with JavaScript off, and the homepage with `script.js` blocked and late; the skip link, Back, the theme switch, back to top and the nav bar at every width; the listen control and its player; the Assay; where jumps land while sections are drawn on demand, that reading back up after skipping ahead moves nothing, find-in-page and printing, which loops run, and how busy the idle page keeps the main thread at 4× CPU slowdown; the carbon-ai page's dropdowns and numbers; and the visit counter's one request, taken apart: exactly the documented fields, no cookie, no Referer, once per page view, and nothing under Do Not Track or Global Privacy Control or with JavaScript off (its own CI job; needs Chromium — `-- --browser firefox` runs it in Firefox, which CI also does) |
| `npm run mcp:verify` | the pinned MCP package still hashes to the reviewed tarball (needs network) |

The suites, and the failure each one exists to prevent:

- **`bugs.test.js`** — the original regressions: `href="#"` scroll handling,
  the theme icon matching the persisted theme, the terminal firing `done()`
  twice, narration scripts surviving sentence-splitting, every script having a
  mount point, nothing autoplaying, and You Draw It handing focus on when the
  button just pressed goes.
- **`resilience.test.js`** — storage the browser refuses to hand over must not
  abort the script (one unguarded `localStorage.getItem` at module scope used
  to take the rest of the file with it); single-letter shortcuts must not fire
  while a `<select>`, button or contenteditable has focus; a failed recording
  with no speech engine must not leave a dead player.
- **`nojs.test.js`** — the page before JavaScript, without it, and when it
  arrives late: nothing is hidden unless `<head>` has marked the page
  `html.js`, one global `[hidden]` rule instead of per-element patches, the
  hero figures written as their real values and read as those while they
  count up, counters that never append a `+` or move under reduced motion or
  low-energy mode, project cards with nothing a script has to open and case
  study games that ship their controls hidden, copy that promises a click
  hidden with the script, and a late start that holds the line being read
  while the page fills in. `npm run smoke` loads every page
  with JavaScript disabled (every nav link on show at 390 and 1024px too),
  the homepage with `script.js` blocked and delayed (the line being read
  stays put when it takes over, scroll anchoring off too), and carbon-ai.html
  with its script blocked.
- **`carbon.test.js`** — negative, zero, `NaN` and absurd inputs, in the model
  and through the real page; the input/output token split; the evidence
  ledger, which fails if any factor loses its source, range or review date;
  and the one number formatter both AI pages share: no exponent notation and
  no "0.0" for something that is not zero, from 1e-14 to 1e24. Anatomy of a
  Prompt is fetched only as its section nears, draws the calculator's own
  figures, says whose report its Scope lines are on, and keeps every label at
  11px or more inside the drawing, from a 320px phone to a desktop; nothing
  tells a reader to drag the grid, which is a dropdown.
- **`sections.test.js`** — the shorter homepage: experience as short cards on
  a phone, each More button named for its role, and nothing taken out of the
  page; the contact form before the Assay; Skills and Education shortened by
  their repetition, never a fact (every area, framework, degree and
  certificate stays, and each figure taken out of Skills is still on the page
  with the role it belongs to).
- **`assay.test.js`** — the paste-a-job-ad fit check: an ad asking for fluent
  Dutch, 5+ years at a Big Four firm and SAP gets every one of those as a gap
  and not the top grade; ads that do fit still grade well, with evidence
  links that resolve; HR, ERP, marketing and IT ads are "Different field",
  however many general skills they share; an employer's own history, its
  team's languages, the language to apply in, or a Dutch ministry is not a
  requirement; English is listed to confirm, not
  graded; a scrap of text is not graded; and no gap line states a number,
  role or degree that `content/profile.json` does not hold.
- **`voice.test.js`** — the Fish Audio generator renders nothing and plans no
  spend unless asked with `--sections`; the chunk assembler is a clean no-op on
  an empty map; the retired stock-voice tracks stay gone; and Moses's recorded
  introduction, once installed, is described truthfully — its real weight and
  length, a recording of him, captioned by the script he read.
- **`narration.test.js`** — the one docked listen control: it reads the section
  in view, steps between sections, closes on Escape and hands focus back; the
  introduction is offered only when recorded and fetched only on click; with
  no voice, the control stays put while the manifest answers, and the
  manifest is always revalidated; the control sits first after the logo,
  where showing it late moves nothing (smoke checks the bar holds still);
  the terminal describes the voice there is, not one that is not; and a
  cancelled utterance never drives the next section.
- **`content.test.js`** — the pages must agree with `content/profile.json`
  (dates, degrees, certifications, JSON-LD, links, sitemap), and so must
  their figures: a record fact (team size, programme length, grade) matches
  its profile entry, every project card shows its case study's years, the page
  weights the footer, the lens and this README quote are the ones `npm run
  budget` measures, the claims removed for having no basis ("10,000+
  people", a project completion rate, "15% efficiency", "advised the UN",
  "certified across", "if a skill is listed, there's a project behind it")
  stay gone, the field report names no tool the homepage does not show, the
  two illustrative numbers (the 30% blind-drilling baseline and the You Draw
  It guess line) say so wherever they are shown, and You Draw It judges a
  guess against the published range rather than calling an estimate the
  actual value.
- **`portfolio.test.js`** — every case study has all four stages and every
  result a basis; no artifact claims to be public without a working link; the
  lenses reorder without ever dropping a case study; and the validator is fed
  deliberately fabricated links to prove it still rejects them. The homepage's
  project cards say what their case studies say (title, headline result,
  basis, checkability, lenses), link to them, and carry one lazy photo whose
  declared size is the file's own; no dossier id or link is left behind.
- **`widgets.test.js`** — the case studies' two games: nothing fetched until
  a host is within a screen of view, then the stylesheet before the script;
  the module runs without `script.js` (and with storage refused), wires a
  host before showing it, plays a round with one scoreboard and no second
  slider, never counts a re-drilled strike, labels the 30% illustrative
  wherever it shows, drills and floods at once under reduced motion or
  low-energy mode, and sizes its drawing labels for the scale they are
  drawn at, so a phone reads them at 11px or more. `npm run smoke` plays both
  in Chromium and measures those labels at 390 and 320px.
- **`stats.test.js`** — the open counts: every published count is 5 or more
  or reads `<5`, and no `<5` can be worked out by subtraction, from one table
  or a chain of them (the rows the review that found it used are the test);
  figures are whole weeks, with nothing published before the first one ends;
  no share is made from a hidden count, small referrers are grouped, names
  the site does not use are published only as "other", no daily row reaches
  `content/stats.json`, and the payload `stats.html` shows has exactly the
  counter's fields. The fetcher runs end to end against a local server, and
  stays green with no source configured, no whole week yet, or a sheet the
  endpoint could not read this time.
- **`html.test.js`** — button types, named landmarks, dialog semantics, image
  dimensions, labelled controls, resolvable links, valid JSON-LD, and no
  stylesheet, script, preload or preconnect pointing off this origin. The one
  off-site address any shipped script may name is the Apps Script deployment
  the contact form posts to (the visit counter adds `?action=count`); nothing
  may use `navigator.sendBeacon`, which cannot leave cookies out; and every
  page loads `count.js` once, deferred.
- **`apps-script.test.js`** — the contact form's backend
  (`google-apps-script/Code.gs`), run in a VM with stand-ins for Google's
  services: both ways in (the JSON post and the JavaScript-free form post,
  which gets a page back that never says "undefined"), formulas stored as
  text, the honeypot, and the per-submitter rate limit. And the visit
  counter's end of it: a visit adds to the right daily totals and a second
  one increments them in place, anything that is not exactly schema v1
  (an extra key, a wrong type, 21 features, a huge `kb`) changes nothing,
  the lock is taken (a count waits for it at most 1.5 s, and past 30 a
  minute not at all, so counts never keep a message waiting), `?test=1`
  stays off the public tab, `?action=stats` serves the rows to the right
  token and to nobody else, and each contact message is counted unless the
  site says the browser asked not to be tracked. It cannot tell you
  the live deployment is configured; `docs/owner-checklist.md` says how to
  check.
- **`count.test.js`** — the visit counter's payload, field by field: the page
  (404 names itself), the lens the visit arrived with, the deepest part of
  `<main>` reached (one IntersectionObserver, no scroll handler), features
  clicked or fetched, deduplicated and capped at 20 (two CV links in one view
  add `cv-download` once), the referrer's host and nothing more of it, the
  viewport class and the KB transferred; one count per page view, none under
  Do Not Track or GPC, never an error; and a contact message sent under
  either says `count: false`. Every payload is run through the server's own
  schema check, every `data-analytics` name on the site must be one the
  counter keeps, and every CV and email link on a counted page must have one.
- **`navigation.test.js`** — an in-page link updates the address (so Back
  works) and moves focus to its target, Back and Forward land there again,
  the theme switch sits in the nav bar and names what
  it will do, and back to top waits a full screen and steps aside for every
  control in its corner, not whole regions; a jump lands again when the page
  grows, even in the frame before the first report of it. `npm run smoke`
  checks the same in a real browser: the next Tab after the skip link lands
  inside `<main>`, Back to the first entry returns focus to the link that
  left it, a first jump into or past section 05, and a shared link straight
  to it, lands under the nav bar and stays there, and
  at 390x844 back to top never covers a control from the hero to the footer,
  yet shows on the last screen.
- **`firstview.test.js`** — the hero's at-a-glance strip is exactly what
  `content/profile.json` says (a `null` fact is not drawn; a stand-in such as
  "TBC", a misspelt key or an impossible date fails validation), the hero has
  one primary action, the nav six links with no numbers, the play index sits
  out of the first view, and the nav lights Work on the homepage's projects.
  `npm run smoke` checks that the figures, the caption, the strip and the
  primary action are on the first screen at 1440×900 and 390×844.
- **`shell.test.js`** — every page but the homepage has the same five nav
  links, the current page marked, and one call to action with the address,
  the contact form and the CV; the theme switch only where `theme.js` runs,
  shipped hidden; the hand-authored pages' shell exactly as generated; the
  stored choice (or the system's) on `<html>` before the first paint, a
  press, blocked storage, Back from the page cache, and one choice shared
  with the homepage; and the light palette twice and the same, the
  homepage's. `npm run smoke` follows the choice through the nav in a real
  browser, checks the system's setting with JavaScript off, and every page at
  320px.
- **`tooling.test.js`** — the machinery under the rest: the runner fails when
  any suite fails and keeps each suite's output in one block, `npm test` runs
  it rather than a hand-kept list of suites, the fake clock fires timers in
  order and only when told, and every page with a first-view budget exists
  and is measured.
- **`cpu.test.js`** — the page's keys go through one listener, so one Escape
  closes one layer (terminal, then lightbox, then player, then menu) and the
  backtick follows one rule for "typing"; one `mks.motionOK()` answers for
  reduced motion and low-energy mode, live; the time-zone table is fetched
  only when the journey map needs it; everything the core shares hangs off
  `window.mks`; section offsets are measured once a frame and a jump
  lands again as sections take their real height; sections skipped past are
  drawn once the page rests, and every image states its real shape; and every
  looping animation runs on transform and opacity and pauses out of view and
  in a hidden tab.

The jsdom harness (`tests/harness.js`) evaluates `script.js` and then every
file in `modules/`, so the suites see the page the way a visitor who used
every feature would — and a module that declared anything at the top level,
or reached for storage directly, fails `resilience.test.js`. A suite that
tests timing passes `clock: true` and moves time with `await clock.tick(ms)`
instead of sleeping, so a 1.7-second timeout costs nothing to test.

## Content pipeline

The site's facts used to live in six places at once — `index.html`, its JSON-LD
block, `field-report.html`, the narration scripts, the README and the CV — with
nothing keeping them in step. They had already drifted.

Everything derived now comes from `content/`:

| Source | Feeds |
|---|---|
| `content/profile.json` | JSON-LD, `sitemap.xml`, the Assay's facts block in `modules/interactives.js`, the shared shell's call to action on every page but the homepage, the facts `content.test.js` holds every page to |
| `content/projects.json` | `case-studies.html` |
| `content/lenses.json` | the role-specific views |
| `content/research.json` | `research.html` |
| `content/narration.json` | `voice-scripts.js` |
| `content/stats.json` | `stats.html`, the open counts (written weekly by `scripts/fetch-stats.js`) |

```bash
npm run build:content     # regenerate everything derived from content/
npm run build:check       # fail if a generated file is out of date (runs in CI)
```

`index.html` and `field-report.html` stay hand-authored — they are long-form
editorial pages, and templating over 130 KB of hand-tuned markup to remove
duplication a test already catches would trade a small problem for a large one.
`content.test.js` holds them to `content/` instead. `carbon-ai.html` and
`404.html` are hand-authored too, bar the shared shell: the generator writes
the nav and the call to action into them and the field report, between
`<!-- SHELL-NAV -->` and `<!-- SHELL-CTA -->` markers (and `theme.js` into
`carbon-ai.html`'s head), and `build:check` fails if a page's copy drifts.

### The rules the content model enforces

The point of a content model is not tidiness, it is that unsupported claims
should fail the build rather than ship. `scripts/lib/content.js` refuses:

- **A result with no basis.** Every outcome states how it was measured, and
  whether a reader can check it from outside. Where the answer is no — client
  work, internship deliverables — it says so rather than implying otherwise.
- **An artifact that claims to be public without a working link.** `status` is
  one of `public` / `on-request` / `internal` / `planned`; only `public` may
  carry a URL, and anything `internal` must name who holds it.
- **A link this repository has not already vouched for.** Every URL must resolve
  to a file in the repo or to a host on a short allowlist. Writing a
  plausible-looking DOI or repository URL fails `npm test` — which is the
  point, because a fabricated link is the easiest thing to write and the
  hardest thing for a reader to check.
- **A venue that implies peer review without a DOI.** Three theses were written
  and defended; none is published in a journal, and nothing on the site says
  otherwise.

`tests/portfolio.test.js` feeds each of those rules deliberately bad data and
fails if the validator lets it through — the rules are only worth having if
they still fire on content nobody has written yet.

### Keeping the profile honest over time

`content/profile.json` also carries `meta.verifiedOn`: the date a human last
confirmed the open-ended facts (the "Present" role in particular) were still
true. When that goes stale the test prints a notice rather than failing — a
suite that goes red on a calendar date is one people learn to ignore.

### Open counts

`stats.html` is built from `content/stats.json`, which only
`scripts/fetch-stats.js` writes. A weekly Action (`.github/workflows/stats.yml`,
Mondays early UTC, or by hand) fetches the counter's daily totals, suppresses
them, rebuilds the page, runs `npm test` and commits the two files if they
changed. The raw daily rows never enter the repository.

What is published is whole weeks only, Monday to Sunday: last week, all time
from the first full week to last Sunday, and one line per week. The days
before the first Monday and the week still running are in no figure, so no
sum of the figures leaves a single day's count behind, and nothing is
published at all until a full week has ended. Every count under 5 is `"<5"`.
Where a table adds up to a total shown beside it (pages and window classes
to page views, the known lenses to lens-link visits, the weeks to all time),
a lone `"<5"` would be the total less the rest, so the smallest figure
beside it is held back too, as `"held"`, until nothing hidden can be worked
out, through any chain of such sums. `scripts/lib/content.js` fails the build
if a count under 5, one that subtraction would give away, a part week, today,
a named referrer under 5 or any field it does not know gets into
`content/stats.json`.

To switch it on, first give the Apps Script a `STATS_TOKEN` script property
(any long random string) and publish the current
`google-apps-script/Code.gs` as a new version of the existing deployment, so
that `?action=count` and `?action=stats` exist. `?action=stats` answers only
a request with `&token=` set to that string: its rows are not suppressed, and
the deployment's address is in `count.js` on every page. Then make the web
app URL with `?action=stats&token=<the string>` a repository **secret**
`STATS_SOURCE_URL` (Settings → Secrets and variables → Actions). Do it in
that order: an older deployment answers `?action=stats` with its health
check, and the Action fails on that rather than mistake it for an empty
week. The `Daily` sheet published as CSV also works as the source, but a
published tab is readable by anyone who has its link, which `stats.html`
says is not the case. Until the secret is set, the Action says so and
commits nothing, and the page says counting has not started. The steps, and
how to check each, are items S1 and S2 in
[docs/owner-checklist.md](docs/owner-checklist.md). To run it locally:

```bash
STATS_SOURCE_URL='<url>' node scripts/fetch-stats.js && npm run build:content
```

The sheet's date column should be formatted as plain text; dates Apps Script
serialises as instants are read back to the Amsterdam date, anything else is
dropped and counted in the log. Nothing read from the source is ever printed.

### Editing the narration

`content/narration.json` is the only copy of the spoken text; `voice-scripts.js`
is generated from it. Editing a section script is free: the browser voice reads
the current text, and nothing is rendered unless someone opts in with
`npm run voice -- --sections`. The `intro` script is the exception — it is the
words of Moses's recording and its captions, so once he has recorded it, change
it only to match what he said, then run `npm run voice:intro` again.

## The visit counter and privacy

The site counts its own page views, so that each later change to it can be
judged against what readers actually do ([docs/plan.md](docs/plan.md),
Phase 1). It uses no analytics service, and the count sets no cookie and
reads or writes no browser storage. (The site itself remembers the theme,
low-energy mode, the reading speed and whether the intro has played, in the
visitor's own browser, and sends none of it.) All of it is `count.js`: 3 KB
(2 KB gzipped), loaded deferred on every page and counted in each page's
budget.

**Status.** Built and tested, but not yet counting: the live Apps Script has
to be published again with the counter's code first (item S1 in
[docs/owner-checklist.md](docs/owner-checklist.md)). Until then the counts
reach the old script. Every version of `Code.gs` committed here from
2026-07-17 on reads a count as a contact message with no name and refuses it,
so nothing is recorded and nobody is emailed; the 2025 versions would have
recorded and emailed every one, which is why the checklist publishes the new
script before this reaches the live site.

**What one page view sends.** One POST, the first time the page is hidden or
left (`visibilitychange` to hidden, or `pagehide`), and never a second for the
same page view. This is the whole of one, exactly as `count.js` sends it:

```json
{"v":1,"page":"index","lens":"","deepest":"contact","features":["cv-download-hero","cv-download","module-dossier"],"ref":"www.linkedin.com","vp":"m","kb":284}
```

| Key | What it holds |
|---|---|
| `v` | `1`, the version of this format |
| `page` | the page's file name without `.html` (`index`, `case-studies`, `research`, `carbon-ai`, `field-report`, `stats`), or `404` |
| `lens` | the `?lens=` the page view arrived with, or `""` |
| `deepest` | the id of the furthest top-level part of `<main>` that came on screen: on the homepage one of the nine sections the nav links to, from `journey` to `contact`; `csGrid` on the case studies; `""` on the pages that have no such part |
| `features` | up to 20 distinct names of things used: the site's `data-analytics` hooks (27 today, such as `cv-download-hero` and `receipt-open`), `cv-download` once for a view that used any CV link (the CV-downloads figure counts page views), `cv-download-terminal` when the field terminal's `cv` command fetches the CV, `module-<name>` for each on-demand module fetched, `contact-form-submit`, and the Assay's grade (`assay-high`, `assay-workable`, `assay-marginal`) |
| `ref` | the referring site's host only (`www.linkedin.com`); `""` if there was none, or it was this site |
| `vp` | the browser window's width as a class: `s` under 600 px, `m` under 1024 px, `l` wider |
| `kb` | whole KB this page view transferred, from the browser's Resource Timing API, so a cached revisit counts as the near-zero it is |

**What is never sent or stored.**

- No cookie, no browser storage and no id of any kind, so two page views
  cannot be tied to each other, or to a person. Every published figure is a
  count of page views, not of people.
- No `Referer` header and no full referring address, only its host.
- Nothing typed into the page. The Assay's grade is counted; the job ad
  pasted into it never leaves the page.
- No IP address, browser, device or operating system, and no screen or
  window size beyond the three classes. Apps Script does not give the script the
  sender's address or headers, so there is nothing to store even by mistake.
  Google, which runs the endpoint, receives the request as it receives any
  other.
- No time finer than the day the count arrives.

**Do Not Track and Global Privacy Control.** If the browser sends either
(`navigator.doNotTrack` is `"1"` or `navigator.globalPrivacyControl` is
`true`), `count.js` stops before it adds a single listener, and nothing is
sent. With JavaScript off, nothing is sent either. If `script.js` fails to
load, the counter still counts, since it does not depend on it. A contact
message from such a browser carries `count: false`, and `Code.gs` leaves it
out of the daily contact total; a message sent with JavaScript off cannot
say so (Apps Script does not show the script the request's headers), and is
counted.

**Why a keepalive `fetch`, not `sendBeacon`.** The plan named
`navigator.sendBeacon`, the usual way to send something as a page closes. It
always sends the browser's cookies for the address it posts to — here
`script.google.com`, where a visitor signed in to Google has session cookies —
and a `Referer` unless the whole page changes its referrer policy, and it
cannot be told otherwise for one request. `fetch` with `keepalive: true`
outlives the page the same way, and it takes `credentials: 'omit'` and
`referrerPolicy: 'no-referrer'`. It is sent `mode: 'no-cors'` with a plain
string body, so there is no preflight, which Apps Script cannot answer, and
the page never reads the reply. `tests/html.test.js` fails if any script the
site ships calls `sendBeacon`.

**Where it goes.** To the same Google Apps Script deployment the contact form
posts to, at `?action=count`; the address is in `count.js`, and
`tests/html.test.js` fails if it differs from the form's. `Code.gs` accepts
only a payload that is exactly the one above in shape — those eight keys and
no others, each of the right type, at most 20 features, `kb` from 0 to
100,000 — and silently drops anything else. It then adds one to a handful of
daily totals in a `Daily` tab of Moses's Google Sheet, under the same lock the
contact form uses, waiting for it at most 1.5 s, and not at all past 30
counts a minute, so a burst of page views never keeps a contact message
waiting (a dropped count makes the figures a floor, as `stats.html` says):
`date` (Amsterdam), `metric`, `key`, `count`. No single page view is kept.
`GET ?action=stats&token=...` serves those daily totals to the weekly Action,
which holds the token as a secret, and to nobody else; once a week the Action
suppresses them and rebuilds [stats.html](stats.html) (see
[Open counts](#open-counts)).

**Seen from the page.** The count is a request like any other, so once it has
gone (after the tab has been hidden once), the footer's carbon badge shows a
leading "+" and the Receipt lists "1 off-site request not counted": a request
to another site that the browser will not let the page weigh, as after a
contact message.

**How the promise is held.** `tests/count.test.js` checks the payload field
by field and runs every one it builds through `Code.gs`'s own schema check;
`tests/apps-script.test.js` holds the server to the same schema;
`tests/html.test.js` allows the one off-site address and no `sendBeacon`; and
`npm run smoke` takes a real browser's count apart: exactly the eight keys, no
cookie, no `Referer`, once per page view, and nothing under Do Not Track,
Global Privacy Control or with JavaScript off. Every other browser context in
the smoke test opens with Global Privacy Control on, so a test run never sends
a count to the real endpoint.

## Customization Guide

### Colors
To change the color scheme, edit the CSS variables in `style.css`:

```css
:root {
    --primary-green: #7CFC00;      /* Main accent color */
    --dark-bg: #0a0a0a;            /* Main background */
    --darker-bg: #000000;          /* Darker sections */
    --card-bg: #1a1a1a;            /* Card backgrounds */
    --text-primary: #ffffff;        /* Primary text */
    --text-secondary: #b0b0b0;     /* Secondary text */
}
```

### Content
- Update personal information in `index.html`
- Modify section content directly in the HTML
- Add or remove projects, experiences, and skills as needed

### Images
- All published images live in `assets/img/` as WebP; keep new ones under ~200 KB (e.g. `npx sharp-cli -i photo.jpg -o assets/img/photo.webp resize 900`)
- Hero backgrounds use the `-hero.webp` variants (1600 px wide)
- The journey map is generated, not drawn: edit `scripts/generate-journey-map.js` and re-run it to change stops

### Custom domain (recommended)
- Add a `CNAME` file with your domain and configure DNS per [GitHub Pages docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site) — then update the `og:url`/canonical tags in `index.html`

## Browser Support

What CI runs every page in, on every pull request:

- ✅ Chromium, the build pinned by `playwright-core` — so Chrome and Edge,
  which share its engine
- ◐ Firefox, the build pinned by `playwright-core` (142 at the moment): the
  job is in CI, and its first run is on the pull request that adds it; this
  becomes ✅ once that run has passed
- ✅ Phone width (390×844) and desktop (1440×900), in both themes, for the
  accessibility checks — a browser window at that size, not a real phone

Safari (WebKit) is not tested, on a Mac or an iPhone. Nothing on the site is
knowingly specific to one engine, but this list claims only what CI runs.

## Performance

This section used to claim a Lighthouse score of 95+ and sub-two-second loads,
with nothing measuring either. Claims like that decay quietly: by the time
anyone checked, the image total had grown past 3 MB while the README still said
"under 2 MB". So the numbers below are the ones `npm run budget` measures on
every run of `npm test`, and the build fails when they are exceeded.

| Budget | Measured | Ceiling |
|---|---|---|
| First view of the homepage, over the wire (fonts included) | ~274 KB | 300 KB |
| Everything a full visit adds on demand (modules, scripts, map) | ~72 KB | 72 KB |
| Case studies page, over the wire (fonts included) | ~96 KB | 120 KB |
| Research outputs page, over the wire (fonts included) | ~90 KB | 110 KB |
| AI, Weighed (`carbon-ai.html`), over the wire (fonts included) | ~107 KB | 111 KB |
| Text-only field report, the HTML file (the size the footer quotes) | ~9 KB | 12 KB |
| Text-only field report, over the wire (with its visit counter) | ~6 KB | 8 KB |
| Largest single image | ~200 KB | 220 KB |
| Every image in the repository | ~3.36 MB | 3.5 MB |
| Recorded narration: Moses's introduction (0 KB until he records it) | 0 KB | 800 KB |
| Open counts page, over the wire (fonts included; empty today) | ~91 KB | 105 KB |

**What the estimate used to miss.** An earlier version of this table said
234 KB. Opening the page in a real browser measured over 500 KB. Two things
were never counted: about 100 KB of fonts, which came from Google and so were
never a file in this repository, and a second 150 KB hero image the slideshow
fetched "on idle" for every visit, whether or not it stayed the eight seconds
needed to see it. The fonts are now self-hosted and counted; the slideshow
fetches a slide only just before it shows it, and only while the hero is on
screen; and `npm run smoke` opens the page in Chromium and fails if what it
measures comes in above what the table claims. The honest number is larger
than the old one and smaller than the old truth.

**What "over the wire" means.** GitHub Pages compresses text, so HTML, CSS and
JS are counted gzipped — what a visitor actually downloads — while images and
fonts are counted as-is. The first view is `index.html`, its stylesheet, the
core script, the visit counter, the four font files, the icon and the one
preloaded hero image. Everything else is fetched only when it is reached: the
journey map on the first scroll, the portrait and the six project photos as
you get to them (a 480px copy wherever that is enough), the remaining hero
backgrounds when the rotation needs them, and no narration until someone
presses play. So "every image in the repository" is what the repository
holds, not the cost of arriving.

**On-demand modules.** About two thirds of the site's JavaScript serves
features most visits never reach. It used to ship in one 155 KB file, parsed
and run on every visit. It now lives in `modules/` and `script.js` fetches
each file the moment it is first needed:

| Module | Loads when | Gzipped |
|---|---|---|
| `modules/interactives.js` (+ `ai-carbon-data.js`) | section 05, the Assay or the footer receipt comes within a screen of the viewport, or a deep link lands there | ~31 KB |
| `modules/dispatch.js` (+ `dispatch.css`, `voice-scripts.js`) | the first press of Listen, or `voice` in the terminal | ~16 KB |
| `modules/dossier.js` (+ `dossier.css`) | on `case-studies.html`, a game's host comes within a screen of view (the page's own loader, not `script.js`) | ~9 KB |
| `modules/terminal.js` | the backtick key or the footer button | ~5 KB |
| `assets/timezones.json` | the journey map arrives, for its "you?" mark (the zone is looked up in the page, never sent) | ~2 KB |
| `modules/anatomy.css` + `anatomy.js`, on `carbon-ai.html` | Anatomy of a Prompt comes within 400px of the screen (`carbon-ai.js` fetches them) | ~5 KB |

Modules are classic scripts sharing the page's global scope: they declare
nothing at the top level and reach the core only through `window.mks`. The
Listen button is in the page's own HTML, shown by the core once something can
speak; the first press fetches the player, its stylesheet and its scripts.

Run `npm run budget` to see the current numbers, asset by asset. To make
room under a ceiling, remove something of equal weight rather than raise it
([docs/plan.md](docs/plan.md), "Stop doing"). A ceiling that does change is
changed in `scripts/check-budget.js` **and** in this table, in the same
commit.

**Measured in a browser, not scored.** `npm run smoke` runs every page in
headless Chromium (its own job in CI) and reports the bytes actually
transferred. It does not compute a Lighthouse score, and none is claimed. To
check for yourself:

```bash
npx lighthouse https://moseskolleh.github.io/sustaintheworld/ --view
```

- **Optimizations**:
  - Minimal dependencies (no framework, no bundler)
  - Lazy loading for images and hero backgrounds; on-demand modules for the features
  - One passive, frame-coalesced scroll listener for the navbar, progress bar, active link and scroll-to-top button; section offsets measured once, not per event
  - The hero rotation stops in hidden tabs and once the hero has scrolled away
  - Sections are laid out and painted only as they near the screen (`content-visibility: auto`, where the browser anchors scrolling; a section the reader has passed stays drawn); every looping animation runs on transform and opacity, which the compositor handles alone, and pauses out of view and in hidden tabs. Measured at 4× CPU slowdown in Chromium (medians of 15 loads before, 10 after): layout on load 238 → 125 ms, the longest task 238 → 110 ms, and main-thread work while nobody touches the page 1,023 → 16 ms per 3 s at the top and 1,250 → 7 ms mid-page; `npm run smoke` holds the idle figure under a ceiling
  - Intrinsic `width`/`height` on every image, so nothing shifts as they arrive

### Fonts

Inter, Space Grotesk and IBM Plex Mono live in `assets/fonts/`, subset to the
same Latin range Google Fonts served and instanced to the weights the
stylesheets use (Inter 400–600, Space Grotesk 400–700, Plex Mono 400 and 500):
76 KB in four files, against about 100 KB and two extra origins before. They
are the last third-party request the site had, and `tests/html.test.js` now
fails if one comes back.

```bash
npm run fonts:build     # fetch the sources, subset, write assets/fonts/ and the @font-face blocks
npm run fonts:check     # verify the committed files against their manifest (runs in npm test)
```

`scripts/build-fonts.js` records each file's source URL and hash in
`assets/fonts/manifest.json` and writes the `@font-face` block between the
`FONTS:START` / `FONTS:END` markers in each stylesheet. All three families are
under the SIL Open Font License; the notices are in
`assets/fonts/LICENSE-OFL.txt`.

## Accessibility

Checked by `tests/html.test.js` on every run, so these are enforced rather than
aspirational:

- Semantic HTML5 elements, one `<main>` per page, named `<nav>` landmarks, a skip link on every page
- Every `<button>` carries an explicit `type` (a missing one submits the form
  it sits in)
- Every form control has an accessible name; every image has `alt` plus
  intrinsic `width`/`height`
- The lightbox is a real modal: `role="dialog"`, `aria-modal`, an accessible
  name, focus moved in and restored on close, Escape to close, Tab kept inside
- Skip-to-content link that targets an element which exists and moves focus
  there, so the next Tab lands inside `<main>`; every in-page link moves focus
  and updates the address (`tests/navigation.test.js`, `npm run smoke`)
- Single-letter shortcuts stand down while a form control has focus
- Escape closes one layer at a time: the field terminal, then the lightbox, then the narration player, then the menu
- No duplicate `id`s, no focusable element inside an `aria-hidden` container

`npm run smoke` adds axe-core in a real browser: every page at 1440×900 and
390×844 in both themes, the homepage again with the Assay's verdict, the
carbon receipt, the player, the terminal and the phone menu open, and with
its script blocked, and the case studies with both games played. Any violation fails, contrast included —
but axe fails only what it can decide, and text over an image or a gradient
it leaves for a person to review.

Not machine-checked, and worth a manual pass when the design changes:
contrast over images and gradients, focus-visible styling, and screen-reader
flow through the interactive widgets.

## Contact

**Moses Kolleh Sesay**
- 📧 Email: [moseskollehsesay@gmail.com](mailto:moseskollehsesay@gmail.com)
- 💼 LinkedIn: [linkedin.com/in/moseskollehsesay](https://linkedin.com/in/moseskollehsesay)
- 🐙 GitHub: [github.com/moseskolleh](https://github.com/moseskolleh)
- 📍 Location: Amsterdam, The Netherlands

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Design inspiration: EcoSearch theme (environmental sustainability focus)
- Icons: an inline SVG sprite drawn from [Font Awesome Free](https://fontawesome.com/) (CC BY 4.0)
- Fonts: [Inter](https://github.com/rsms/inter), [Space Grotesk](https://github.com/floriankarsten/space-grotesk) & [IBM Plex Mono](https://github.com/IBM/plex), self-hosted under the SIL Open Font License
- Map data: [Natural Earth](https://www.naturalearthdata.com/) via world-atlas, projected with d3-geo
- Hosting: [GitHub Pages](https://pages.github.com/)

## Future Enhancements

- [x] Blog section for sustainability articles (Field Notes)
- [x] Dark/Light theme toggle
- [ ] Multi-language support (English, Dutch)
- [x] Project detail pages (case studies, with a teaser card for each on the homepage)
- [x] Interactive data visualizations (journey map, AI cost widget, impact charts)
- [x] PDF resume download
- [ ] Newsletter subscription
- [ ] Testimonials section
- [ ] Custom domain

---

**Building a sustainable future through data-driven environmental solutions** 🌍

Made with 💚 by Moses Kolleh Sesay
