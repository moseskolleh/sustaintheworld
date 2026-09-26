# Moses Kolleh Sesay - Portfolio Website

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://moseskolleh.github.io/sustaintheworld/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## About

Professional portfolio website for **Moses Kolleh Sesay**, a Sustainability & Climate Analyst specializing in ESG analysis, climate resilience, and data-driven environmental solutions.

**Live Website:** [https://moseskolleh.github.io/sustaintheworld/](https://moseskolleh.github.io/sustaintheworld/)

## Features

- **Living journey map**: a hand-built SVG map of the journey region — West Africa to East Asia, so every stop gets real resolution instead of a world map that's half empty ocean (Natural Earth 50 m coastlines, simplified hardest away from the Rhine delta where the map zooms deepest, zero runtime dependencies). It flies from Freetown to Changsha, Bonn, Wageningen and Amsterdam as you scroll, and fieldwork sites like Wuppertal join the map when the story reaches them. Regenerate with `npm install && npm run map:build`, then sync the printed stop pixels into `script.js`; `npm run map:check` proves the committed SVG still matches the script and runs in CI
- **"Site the borehole" mini-game**: a playable resistivity profile in the Groundwater dossier — read the curve, place the rig, drill. Water-bearing fracture, clay pocket or dry hole; the score converges on the point: reading the curve first struck water 70% of the time in the field (the ~30% for blind drilling is labelled illustrative until it has a source)
- **"Don't let it become a boat" flood scene**: an interactive Wupper cross-section in the Wuppertal dossier — slide the river from a calm day to July 2021 and watch the margin under the Schwebebahn's hanging cars shrink
- **Field terminal**: press <code>`</code> anywhere (or the footer button) for a hidden green-on-black terminal — try `journey`, `drill`, `co2`, `voice`, `kushe`, `help`
- **The spoken page**: one `Listen` control in the nav reads the section in view with the browser's own speech engine, which transfers **zero bytes**. The one recording on the site is Moses introducing himself in his own voice, offered once he has recorded it, fetched only on click and labelled with exactly what it transfers (see [Narration](#narration-the-spoken-page)). Nothing ever autoplays
- **Carbon-aware by construction**: images ship as optimized WebP, the three typefaces are self-hosted subsets, and a first view costs about **277 KB over the wire, fonts included**, against a 300 KB ceiling `npm test` enforces — a budget, not a number in a README, and one that `npm run smoke` checks against a real browser (see [Performance](#performance)). Everything a visit does not reach — the narration player, the field terminal, the dossier games, the section-05 interactives — is fetched only when it is used. No request leaves the site's own origin. A live footer badge weighs each visit in the browser (Resource Timing API × Sustainable Web Design model), counting network transfer only. A low-energy mode pauses all animation and honours `prefers-reduced-motion`
- **[Case studies](case-studies.html), evidence-first**: the same six projects as **problem → method → artifact → result**. Every result carries the basis it rests on and says plainly whether you can check it from outside; every artifact says whether it is public, available on request, or held by the client. See [Content pipeline](#content-pipeline)
- **Role-specific lenses**: `case-studies.html?lens=water`, `?lens=climate-risk`, `?lens=sustainable-ai` — shareable views that reframe the portfolio for one kind of role. They **reorder and frame, they never filter**: every case study stays on the page in every view, because a view that hides inconvenient work is a CV that lies by omission. Without JavaScript the switcher steps aside and every case study shows in the default view
- **[Research outputs](research.html)**: theses, reports, datasets, code and tools, each labelled public / on request / held by the client. No DOI, journal or conference is named anywhere, because none of this work has one — and a test fails the build if one ever appears without proof
- **Borehole core-log experience timeline**: career history logged the way a geologist logs a core — depth is time, every layer is a chapter
- **"AI, Weighed" live widget**: a homepage slice of the EcoPrompt Coach research — model × workload × grid → energy, carbon, water, in units people can feel
- **Evidence-first skills**: no invented percentages — every tool links to the project where it earned its place, plus real field numbers (164 water points itemized, 70% strike rate)
- **The Assay**: paste a job ad beside the contact form and get an honest fit, graded in the browser with nothing sent. It lists matched evidence with links, and gaps (languages, years of experience, named tools, consulting-firm or director-level experience, financial modelling, a PhD or a law degree), first when they cap the grade; right to work, visa, clearance, driving licence and relocation are named as things to confirm with Moses, never guessed. Its facts about him come from `content/profile.json`
- **Field Notes**: short essays connecting boreholes, scenario storytelling and sustainable AI
- **Modern design**: dark theme with vibrant green accents, light mode, responsive layout, full SEO/social metadata (Open Graph, JSON-LD, sitemap)
- **Comprehensive sections**: journey, about (with CV download), experience, projects with photo dossiers, AI cost widget, skills, education, field notes, contact form

## Technologies Used

- **HTML5**: Semantic markup for better SEO and accessibility
- **CSS3**: Modern styling with CSS Grid, Flexbox, animations, and transitions
- **JavaScript (Vanilla)**: no framework, no bundler. A 67 KB core (`script.js`, 21 KB gzipped) and four on-demand modules in `modules/` (plus the player's stylesheet, `modules/dispatch.css`) that the core fetches the first time a feature is used
- **Icons**: an inline SVG symbol sprite, no icon font
- **Fonts**: Inter, Space Grotesk and IBM Plex Mono, self-hosted as Latin subsets under the SIL Open Font License (see [Fonts](#fonts))
- **GitHub Pages**: Free hosting for static websites

## Sections Overview

### 🏠 Home (Hero)
- Name, role and a one-line value proposition over a rotating set of fieldwork photographs (the rotation only runs while the hero is on screen and the tab is visible)
- Call-to-action buttons and a live index of the five interactive features (the one `Listen` control is in the nav)
- Four exact figures (164 water points, 54 hazard systems, 3 continents, 2 master's degrees), written into the HTML so they read correctly without JavaScript; with it they count up to the same values, with nothing appended, and stay still under reduced motion or low-energy mode

### 🗺️ Journey
- The living journey map: Freetown → Changsha → Bonn → Wageningen → Amsterdam, flown as you scroll, with a visitor mark for wherever you are reading from

### 👤 About
- Professional summary with the CV download
- Four fact cards: where the work was done, the 164 water points, the data toolkit and the ESG certificate

### 💼 Experience
- The borehole core-log timeline: depth is time, every layer a chapter, technology tags for each

### 🔬 Projects
- Six expandable dossiers with photo galleries, each with challenge → approach → results
- Two of them carry a mini-game: "Site the borehole" and "Don't let it become a boat"

### ⚡ AI, Weighed
- The homepage slice of the EcoPrompt Coach research: You Draw It, the live cost widget and Anatomy of a Prompt

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
- Contact form (Google Apps Script backend, honeypot, rate limits; works without JavaScript by posting to the same endpoint), The Assay, direct contact details and social links

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

One **Listen** control sits in the nav bar. It reads the section in view
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

| Command | What it holds in place |
|---|---|
| `npm run build:check` | every generated page still matches `content/` |
| `npm run fonts:check` | the committed fonts still hash to their manifest and every stylesheet's `@font-face` block is current |
| `npm run test:unit` | the twelve suites in `tests/`, listed below (784 passing assertions on 2026-09-26) |
| `npm run map:check` | the committed `journey-map.svg` still matches its generator |
| `npm run budget` | the weights this README quotes (see [Performance](#performance)) |
| `npm run smoke` | every page in a real browser: no errors, no failed or off-origin requests, every on-demand module arrives when used, and the measured first view is no heavier than the budget claims; every page again with JavaScript off, and the homepage with `script.js` blocked and late; the skip link, Back, the theme switch, back to top and the nav bar at every width; the listen control and its player; the Assay; and the carbon-ai page's dropdowns and numbers (its own CI job; needs Chromium) |
| `npm run mcp:verify` | the pinned MCP package still hashes to the reviewed tarball (needs network) |

The suites, and the failure each one exists to prevent:

- **`bugs.test.js`** — the original regressions: `href="#"` scroll handling,
  the theme icon matching the persisted theme, the terminal firing `done()`
  twice, narration scripts surviving sentence-splitting, every script having a
  mount point, nothing autoplaying.
- **`resilience.test.js`** — storage the browser refuses to hand over must not
  abort the script (one unguarded `localStorage.getItem` at module scope used
  to take the rest of the file with it); single-letter shortcuts must not fire
  while a `<select>`, button or contenteditable has focus; a failed recording
  with no speech engine must not leave a dead player.
- **`nojs.test.js`** — the page before JavaScript, without it, and when it
  arrives late: nothing is hidden unless `<head>` has marked the page
  `html.js`, one global `[hidden]` rule instead of per-element patches, the
  hero figures written as their real values, and counters that never append
  a `+` or move under reduced motion or low-energy mode. `npm run smoke`
  loads every page with JavaScript disabled, and the homepage with
  `script.js` blocked and delayed.
- **`carbon.test.js`** — negative, zero, `NaN` and absurd inputs, in the model
  and through the real page; the input/output token split; the evidence
  ledger, which fails if any factor loses its source, range or review date;
  and the one number formatter both AI pages share: no exponent notation and
  no "0.0" for something that is not zero, from 1e-14 to 1e24.
- **`assay.test.js`** — the paste-a-job-ad fit check: an ad asking for fluent
  Dutch, 5+ years at a Big Four firm and SAP gets every one of those as a gap
  and not the top grade; ads that do fit still grade well, with evidence
  links that resolve; a scrap of text is not graded; and no gap line states a
  number, role or degree that `content/profile.json` does not hold.
- **`voice.test.js`** — the Fish Audio generator renders nothing and plans no
  spend unless asked with `--sections`; the chunk assembler is a clean no-op on
  an empty map; the retired stock-voice tracks stay gone; and Moses's recorded
  introduction, once installed, is described truthfully — its real weight and
  length, a recording of him, captioned by the script he read.
- **`narration.test.js`** — the one docked listen control: it reads the section
  in view, steps between sections, closes on Escape and hands focus back; the
  introduction is offered only when recorded and fetched only on click; and a
  cancelled utterance never drives the next section.
- **`content.test.js`** — the pages must agree with `content/profile.json`
  (dates, degrees, certifications, JSON-LD, links, sitemap), and so must
  their figures: a record fact (team size, programme length, grade) matches
  its profile entry, every dossier shows its case study's years, the page
  weights the footer quotes are the ones `npm run budget` measures (the
  first view to within 5 KB), the claims removed for having no basis
  ("10,000+ people", a project completion rate, "15% efficiency", "advised
  the UN", "certified across") stay gone, and the two illustrative numbers
  (the 30% blind-drilling baseline and the You Draw It guess line) say so
  wherever they are shown.
- **`portfolio.test.js`** — every case study has all four stages and every
  result a basis; no artifact claims to be public without a working link; the
  lenses reorder without ever dropping a case study; and the validator is fed
  deliberately fabricated links to prove it still rejects them.
- **`html.test.js`** — button types, named landmarks, dialog semantics, image
  dimensions, labelled controls, resolvable links, valid JSON-LD, and no
  stylesheet, script, preload or preconnect pointing off this origin.
- **`apps-script.test.js`** — the contact form's backend
  (`google-apps-script/Code.gs`), run in a VM with stand-ins for Google's
  services: both ways in (the JSON post and the JavaScript-free form post,
  which gets a page back that never says "undefined"), formulas stored as
  text, the honeypot, and the per-submitter rate limit. It cannot tell you the
  live deployment is configured; `docs/owner-checklist.md` says how to check.
- **`navigation.test.js`** — an in-page link updates the address (so Back
  works) and moves focus to its target, Back and Forward land there again and
  reopen a closed dossier, the theme switch sits in the nav bar and names what
  it will do, and back to top waits a full screen and steps aside for the
  controls beneath it. `npm run smoke` checks the same in a real browser: the
  next Tab after the skip link lands inside `<main>`, and at 390x844 back to
  top never covers the hero's buttons, the send button or the footer.

The jsdom harness (`tests/harness.js`) evaluates `script.js` and then every
file in `modules/`, so the suites see the page the way a visitor who used
every feature would — and a module that declared anything at the top level,
or reached for storage directly, fails `resilience.test.js`.

## Content pipeline

The site's facts used to live in six places at once — `index.html`, its JSON-LD
block, `field-report.html`, the narration scripts, the README and the CV — with
nothing keeping them in step. They had already drifted.

Everything derived now comes from `content/`:

| Source | Feeds |
|---|---|
| `content/profile.json` | JSON-LD, `sitemap.xml`, the Assay's facts block in `modules/interactives.js`, the facts `content.test.js` holds every page to |
| `content/projects.json` | `case-studies.html` |
| `content/lenses.json` | the role-specific views |
| `content/research.json` | `research.html` |
| `content/narration.json` | `voice-scripts.js` |

```bash
npm run build:content     # regenerate everything derived from content/
npm run build:check       # fail if a generated file is out of date (runs in CI)
```

`index.html` and `field-report.html` stay hand-authored — they are long-form
editorial pages, and templating over 130 KB of hand-tuned markup to remove
duplication a test already catches would trade a small problem for a large one.
`content.test.js` holds them to `content/` instead.

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

### Editing the narration

`content/narration.json` is the only copy of the spoken text; `voice-scripts.js`
is generated from it. Editing a section script is free: the browser voice reads
the current text, and nothing is rendered unless someone opts in with
`npm run voice -- --sections`. The `intro` script is the exception — it is the
words of Moses's recording and its captions, so once he has recorded it, change
it only to match what he said, then run `npm run voice:intro` again.

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

- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

This section used to claim a Lighthouse score of 95+ and sub-two-second loads,
with nothing measuring either. Claims like that decay quietly: by the time
anyone checked, the image total had grown past 3 MB while the README still said
"under 2 MB". So the numbers below are the ones `npm run budget` measures on
every run of `npm test`, and the build fails when they are exceeded.

| Budget | Measured | Ceiling |
|---|---|---|
| First view of the homepage, over the wire (fonts included) | ~277 KB | 300 KB |
| Everything a full visit adds on demand (modules, scripts, map) | ~70 KB | 72 KB |
| Case studies page, over the wire (fonts included) | ~92 KB | 120 KB |
| Research outputs page, over the wire (fonts included) | ~88 KB | 110 KB |
| Text-only field report, whole page | ~9 KB | 12 KB |
| Largest single image | ~200 KB | 220 KB |
| Every image in the repository | ~3.24 MB | 3.5 MB |
| Recorded narration: Moses's introduction (0 KB until he records it) | 0 KB | 800 KB |

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
core script, the four font files and the one preloaded hero image. Everything
else is fetched only when it is reached: the journey map on the first scroll,
the other 32 images as you get to them, the remaining hero backgrounds when the
rotation needs them, and no narration until someone presses play. So "every
image in the repository" is the cost of opening every gallery, not the cost of
arriving.

**On-demand modules.** About two thirds of the site's JavaScript serves
features most visits never reach. It used to ship in one 155 KB file, parsed
and run on every visit. It now lives in `modules/` and `script.js` fetches
each file the moment it is first needed:

| Module | Loads when | Gzipped |
|---|---|---|
| `modules/interactives.js` (+ `ai-carbon-data.js`) | section 05 or the footer receipt comes within a screen of the viewport, or a deep link lands there | ~33 KB |
| `modules/dispatch.js` (+ `dispatch.css`, `voice-scripts.js`) | the first press of Listen, or `voice` in the terminal | ~16 KB |
| `modules/dossier.js` | a project dossier with a mini-game is opened | ~6 KB |
| `modules/terminal.js` | the backtick key or the footer button | ~5 KB |

Modules are classic scripts sharing the page's global scope: they declare
nothing at the top level and reach the core only through `window.mks*`. The
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
- No duplicate `id`s, no focusable element inside an `aria-hidden` container

Not machine-checked, and worth a manual pass when the design changes: contrast
ratios, focus-visible styling, and screen-reader flow through the interactive
widgets.

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
- [x] Project detail pages (expandable dossiers)
- [x] Interactive data visualizations (journey map, AI cost widget, impact charts)
- [x] PDF resume download
- [ ] Newsletter subscription
- [ ] Testimonials section
- [ ] Custom domain

---

**Building a sustainable future through data-driven environmental solutions** 🌍

Made with 💚 by Moses Kolleh Sesay
