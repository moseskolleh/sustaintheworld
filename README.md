# Moses Kolleh Sesay - Portfolio Website

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://moseskolleh.github.io/sustaintheworld/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## About

Professional portfolio website for **Moses Kolleh Sesay**, a Sustainability & Climate Analyst specializing in ESG analysis, climate resilience, and data-driven environmental solutions.

**Live Website:** [https://moseskolleh.github.io/sustaintheworld/](https://moseskolleh.github.io/sustaintheworld/)

## Features

- **Living journey map**: a hand-built SVG map of the journey region — West Africa to East Asia, so every stop gets real resolution instead of a world map that's half empty ocean (Natural Earth 50 m coastlines, simplified hardest away from the Rhine delta where the map zooms deepest, zero runtime dependencies). It flies from Freetown to Changsha, Bonn, Wageningen and Amsterdam as you scroll, and fieldwork sites like Wuppertal join the map when the story reaches them. Regenerate with `npm install && npm run map:build`, then sync the printed stop pixels into `script.js`; `npm run map:check` proves the committed SVG still matches the script and runs in CI
- **"Site the borehole" mini-game**: a playable resistivity profile in the Groundwater dossier — read the curve, place the rig, drill. Water-bearing fracture, clay pocket or dry hole; the score converges on the point: blind drilling hits ~30%, reading the curve hit 70%
- **"Don't let it become a boat" flood scene**: an interactive Wupper cross-section in the Wuppertal dossier — slide the river from a calm day to July 2021 and watch the margin under the Schwebebahn's hanging cars shrink
- **Field terminal**: press <code>`</code> anywhere (or the footer button) for a hidden green-on-black terminal — try `journey`, `drill`, `co2`, `voice`, `kushe`, `help`
- **The spoken page**: a `listen` control on every section, and the choice of voice is itself the argument. The browser's own speech engine transfers **zero bytes**; the recorded narration (pre-rendered via Fish Audio, synthetic — see [Narration](#narration-the-spoken-page)) is fetched only on click and labelled with exactly what it transfers. Same words, two costs, visitor's call. Nothing ever autoplays
- **Carbon-aware by construction**: images ship as optimized WebP, and a first view costs about **235 KB over the wire**, against a 300 KB ceiling `npm test` enforces — a budget, not a number in a README (see [Performance](#performance)). A live footer badge weighs each visit in the browser (Resource Timing API × Sustainable Web Design model), counting network transfer only. A low-energy mode pauses all animation and honours `prefers-reduced-motion`
- **[Case studies](case-studies.html), evidence-first**: the same six projects as **problem → method → artifact → result**. Every result carries the basis it rests on and says plainly whether you can check it from outside; every artifact says whether it is public, available on request, or held by the client. See [Content pipeline](#content-pipeline)
- **Role-specific lenses**: [`case-studies-water.html`](case-studies-water.html), [`-climate-risk`](case-studies-climate-risk.html), [`-sustainable-ai`](case-studies-sustainable-ai.html) — each role view is its own fully-rendered static page, so it needs **no JavaScript at all** (these pages ship none). They **reorder and frame, they never filter**: every case study stays on the page in every view, set back rather than removed, because a view that hides inconvenient work is a CV that lies by omission
- **[Research outputs](research.html)**: theses, reports, datasets, code and tools, each labelled public / on request / held by the client. No DOI, journal or conference is named anywhere, because none of this work has one — and a test fails the build if one ever appears without proof
- **Borehole core-log experience timeline**: career history logged the way a geologist logs a core — depth is time, every layer is a chapter
- **"AI, Weighed" live widget**: a homepage slice of the EcoPrompt Coach research — model × workload × grid → energy, carbon, water, in units people can feel
- **Evidence-first skills**: no invented percentages — every tool links to the project where it earned its place, plus real field numbers (164 water points itemized, 70% strike rate)
- **Field Notes**: short essays connecting boreholes, scenario storytelling and sustainable AI
- **Modern design**: dark theme with vibrant green accents, light mode, responsive layout, full SEO/social metadata (Open Graph, JSON-LD, sitemap)
- **Comprehensive sections**: journey, about (with CV download), experience, projects with photo dossiers, AI cost widget, skills, education, field notes, contact form

## Technologies Used

- **HTML5**: Semantic markup for better SEO and accessibility
- **CSS3**: Modern styling with CSS Grid, Flexbox, animations, and transitions
- **JavaScript (Vanilla)**: Interactive features without dependencies
- **Font Awesome**: Icon library for visual enhancements
- **GitHub Pages**: Free hosting for static websites

## Sections Overview

### 🏠 Home (Hero)
- Dynamic introduction with search functionality
- Call-to-action buttons
- Animated scroll indicator

### 👤 About
- Professional summary
- Impact statistics with animated counters
- Core expertise areas
- Highlight cards showcasing key achievements

### 💼 Experience
- Interactive timeline of professional roles
- Detailed descriptions of responsibilities
- Technology tags for each position
- From current role at Digital Society School to past positions in water resource management

### 🔬 Research & Projects
- 6 major research projects and initiatives
- Key areas: Climate adaptation, water pollution, sustainable AI, disaster risk reduction
- Technology stack for each project

### 🛠️ Skills
- Technical skills with animated progress bars
- Sustainability expertise badges
- ESG frameworks and standards (SBTi, CDP, GHG Protocol, TCFD, TNFD, etc.)

### 🎓 Education
- Master's degrees in Environmental Sciences and Industrial Engineering
- Bachelor's degree in Geology
- Professional certifications (ESG Specialist, Google Data Analytics, etc.)

### 📧 Contact
- Contact form with email integration
- Direct contact information
- Social media links (GitHub, LinkedIn)

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

> Setting this up on a new machine, in the Desktop app, or in a cloud session?
> See **[docs/narration-setup.md](docs/narration-setup.md)** for step-by-step
> instructions per surface, including the two things that block cloud sessions.

Every section carries a `listen` control. There are two voices behind it, and
which one a visitor picks is part of the point the site is making.

| | browser voice | recorded narration |
|---|---|---|
| engine | `window.speechSynthesis` | pre-rendered MP3 (Fish Audio) |
| transferred | **nothing** | ~330–520 KB/section, on click only |
| label shown | `0 KB transferred` | `≈0.14 g transfer · 395 KB` |
| needs a build step | no | yes — `npm run voice` |
| default | when no recording exists | whenever a recording exists |

**Whose voice it is.** The recorded narration is *Spiritual African Narrator*, a
stock text-to-speech voice from the Fish Audio library. **It is synthetic — not
a recording of Moses, and not a clone of anyone's voice.** No personal voice
sample was ever uploaded, so no third party's consent is involved. The player
labels the option with the voice's real title and says it is synthetic; the
manifest carries `voiceTitle`, `voiceKind` and `voiceProvider` so nothing has to
hardcode a name. It used to be labelled "Moses", which implied the opposite.
To narrate in a real voice, run `npm run voice -- --clone <sample>` with a
recording you have the right to use.

**What the gram figures mean.** They are **estimated network-transfer
emissions** — bytes moved, times the Sustainable Web Design constant
(0.36 g CO₂e/MB). That is all they are. They exclude the energy the listener's
device spends decoding audio, driving a speaker, and — for the browser voice —
synthesising the speech in the first place. The browser voice transfers zero
bytes, which is genuinely zero *transfer* emissions; it is not free. Every
figure in the player says "transfer" for that reason.

Only **offline** speech voices are used: Chrome's default network voices stream
audio from Google's servers, so the label says "streamed by your browser · size
unknown" rather than printing a zero the page cannot stand behind.

**The site works with no audio files at all.** Until
`assets/audio/voice-manifest.json` exists, the controls use the browser voice
and the recorded option stays hidden. If a browser has neither a voice nor a
recording, the controls stay out of the page rather than sit there dead — and
if a recording fails to load with no speech engine to fall back on, the player
says so and offers a retry instead of silently pretending to play. Nothing
autoplays, in any mode.

**Cost control.** `scripts/lib/voice-signature.js` is the single definition of
"has this track already been rendered?", imported by both the generator and the
chunk assembler. When they each had their own copy they disagreed, and
`npm run voice` offered to re-render all ten sections — about 7,700 Fish Audio
credits for audio that already existed. `tests/voice.test.js` runs the real
generator in dry-run against the committed manifest and fails if it plans to
spend anything.

### Editing what it says

Scripts live in [`voice-scripts.js`](voice-scripts.js) — **not** scraped from the
page. Reading the DOM aloud produces garbage: stat counters mid-animation, SVG
labels, and "S-B-T-i, C-D-P, T-C-F-D" spelled letter by letter. Each script is
written for the ear and must stay factually identical to the section it narrates.

`npm test` asserts that sentence-splitting never corrupts a script — the
initialisms (`A.I.`, `Arc.G.I.S.`) and the real numbers ("164 water points")
both have to survive intact.

### Rendering the recorded voice

The API key is used in exactly one place — this build step, on your machine.
It never reaches the browser, never appears in the shipped site, and never runs
in CI. What ships is the rendered audio, which the page plays with a plain
`<audio>` element and no API call at all.

```bash
cp .env.example .env                              # paste your key in — .env is gitignored
npm run voice -- --clone path/to/your-voice.mp3   # clone your voice, then render everything
```

That one command uploads the sample, creates a Fish Audio voice model, writes
the returned id back into `.env` as `FISH_AUDIO_VOICE_ID`, and narrates all ten
sections in it. Afterwards:

```bash
npm run voice                 # re-render only the scripts whose text changed
npm run voice -- --force      # re-render everything
npm run voice -- --only hero  # re-render one section
npm run voice -- --dry-run    # show the plan, spend nothing
```

Then commit the generated `assets/audio/*.mp3` and `voice-manifest.json`.

Scripts are hashed, so fixing one sentence re-renders one file rather than
paying for the whole page again.

**Know the bill before you run it.** Fish Audio charges 1 credit per UTF-8 byte
of text, so the cost is knowable up front — `npm run voice -- --dry-run` prints
it. The full page is ~7,700 credits, and the free plan grants 8,000 per cycle.
One complete render therefore uses most of a free month, which is the argument
for getting the scripts right with `npm run voice:check` first.

**Plan limits are handled for you.** The free plan accepts only 500 UTF-8 bytes
per call and every script here is longer than that, so scripts are split at
sentence boundaries and the rendered audio is joined back into one file per
section. If the service rejects a chunk as too long, the generator halves the
limit and retries, so a wrong setting costs one rejected call rather than a failed
run. Splitting costs nothing extra, since billing is per byte of text — but on a
paid tier, `FISH_AUDIO_MAX_BYTES=15000` renders each section in one call with no
joins at all.

**Rendered audio outlives your plan.** The files are committed and the site never
calls Fish Audio at runtime, so anything rendered during a trial keeps working
after it ends.

**Give the clone a clean sample.** 30–60 seconds of you talking normally, no
music, no background noise, no room echo. The clone is only as good as its
source, and this is the one input that decides how the whole site sounds.

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

**MCP picks the voice; `npm run voice` ships it.** The narration on the live
site is always produced by the build script — reproducible, hashed so unchanged
text is not re-billed, and the only thing that writes the manifest the page
reads. An MCP tool call is a conversation, not a build artefact.

Prefer OAuth to an API key? Fish Audio also runs an official remote server —
`claude mcp add --transport http fish-audio https://api.fish.audio/mcp` — which
bills against plan credits rather than developer API credits.

### Verifying without spending credits

The pipeline can be exercised end to end against a local stand-in that speaks
the same protocol — real files, real byte sizes, real playback, no network call
and no billing:

```bash
npm run voice:mock      # terminal 1
npm run voice:check     # terminal 2 — clones and renders against the mock
```

It writes `.wav` (gitignored) so mock output can never be mistaken for the real
narration. Useful for checking a script edit reads well before paying to render
it, and for confirming the wiring after any change to the generator.

## Tests and checks

```bash
npm install
npm test          # everything below
```

| Command | What it holds in place |
|---|---|
| `npm run build:check` | every generated page still matches `content/` |
| `npm run test:unit` | the seven suites in `tests/` |
| `npm run map:check` | the committed `journey-map.svg` still matches its generator |
| `npm run budget` | the weights this README quotes (see [Performance](#performance)) |
| `npm run mcp:verify` | the pinned MCP package still hashes to the reviewed tarball (needs network) |
| `npm run links:check` | every approved off-site link still resolves (needs network) |

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
- **`carbon.test.js`** — negative, zero, `NaN` and absurd inputs, in the model
  and through the real page; the input/output token split; and the evidence
  ledger, which fails if any factor loses its source, range or review date.
- **`voice.test.js`** — runs the real generator in dry-run against the
  committed narration and fails if it plans to spend a single credit.
- **`content.test.js`** — the pages must agree with `content/profile.json`
  (dates, degrees, certifications, JSON-LD, links, sitemap).
- **`portfolio.test.js`** — every case study has all four stages and every
  result a basis; no artifact claims to be public without a working link; each
  lens page is checked **with scripting disabled** for the right framing, the
  right order and every case study still present; and the validator is fed
  deliberately fabricated links — including a real host with an invented path
  — to prove it still rejects them.
- **`html.test.js`** — button types, named landmarks, dialog semantics, image
  dimensions, labelled controls, resolvable links, valid JSON-LD.

## Content pipeline

The site's facts used to live in six places at once — `index.html`, its JSON-LD
block, `field-report.html`, the narration scripts, the README and the CV — with
nothing keeping them in step. They had already drifted.

Everything derived now comes from `content/`:

| Source | Feeds |
|---|---|
| `content/profile.json` | JSON-LD, `sitemap.xml`, the facts `content.test.js` holds every page to |
| `content/projects.json` | `case-studies.html` |
| `content/lenses.json` | the role-specific views |
| `content/research.json` | `research.html` |
| `content/narration.json` | `voice-scripts.js` |

```bash
npm run build:content     # regenerate everything derived from content/
npm run build:check       # fail if a generated file is out of date (runs in CI)
```

`index.html` and `field-report.html` stay hand-authored — they are long-form
editorial pages, and templating 130 KB of hand-tuned markup to remove
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
- **A link this repository has not already vouched for.** Every URL must
  resolve to a file in the repo, or appear *in full* in `APPROVED_LINKS`.
  A host allowlist was not enough — it accepted any path on a trusted host, so
  `https://github.com/moseskolleh/does-not-exist` sailed through. Adding a URL
  is now a visible line in a diff. `npm run links:check` goes further and
  actually fetches them; it needs network, so it is not part of `npm test`,
  and it reports hosts that block automated requests as unverifiable rather
  than manufacturing a pass.
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
is generated from it. **Changing any of it costs money** — track signatures are
content-addressed, so an edited script is a re-render at roughly one Fish Audio
credit per UTF-8 byte of that section. `npm run voice -- --dry-run` shows the
bill before you pay it, and unchanged sections are free.

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
| First view of the homepage, first-party over the wire | ~234 KB | 300 KB |
| Case studies page, first-party over the wire | ~12 KB | 40 KB |
| Research outputs page, first-party over the wire | ~10 KB | 30 KB |
| Distinct third-party origins | 2 (font hosts) | 2 |
| Text-only field report, whole page | ~8 KB | 12 KB |
| Largest single image | ~200 KB | 220 KB |
| Every image in the repository | ~3.24 MB | 3.5 MB |
| Every narration track | ~4.13 MB | 4.5 MB |

**What "over the wire" means.** GitHub Pages compresses text, so HTML, CSS and
JS are counted gzipped — what a visitor actually downloads — while images are
counted as-is. These are **first-party bytes**: files in this repository. The
pages also request a stylesheet and font files from Google Fonts, and those
cannot be measured from here, because the stylesheet serves different woff2
subsets per browser. `npm run budget` names every third-party origin
separately and fails if a new one appears — the count is the part worth
enforcing, since another origin matters more than the exact size of a font
file. The first view is `index.html`, its stylesheet and scripts, and
the one preloaded hero image. Everything else on the page is lazy: the other
32 images load as you reach them, the remaining hero backgrounds load when the
rotation needs them, and no narration is fetched until someone presses play.
So "every image in the repository" is the cost of opening every gallery, not
the cost of arriving.

Run `npm run budget` to see the current numbers, asset by asset. Raising a
ceiling is deliberate: change it in `scripts/check-budget.js` **and** update
this table in the same commit.

**Not measured here.** Render time, layout stability and Lighthouse scores need
a real browser, and nothing in this repository runs one. No score is claimed
for that reason. To check for yourself:

```bash
npx lighthouse https://moseskolleh.github.io/sustaintheworld/ --view
```

- **Optimizations**:
  - Minimal dependencies (no framework, no build step)
  - Lazy loading for images and hero backgrounds
  - Debounced scroll events
  - Intrinsic `width`/`height` on every image, so nothing shifts as they arrive

## Accessibility

Checked by `tests/html.test.js` on every run, so these are enforced rather than
aspirational:

- Semantic HTML5 elements, one `<main>` per page, named `<nav>` landmarks
- Every `<button>` carries an explicit `type` (a missing one submits the form
  it sits in)
- Every form control has an accessible name; every image has `alt` plus
  intrinsic `width`/`height`
- The lightbox is a real modal: `role="dialog"`, `aria-modal`, an accessible
  name, focus moved in and restored on close, Escape to close, Tab kept inside
- Skip-to-content link that targets an element which exists
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
- Icons: [Font Awesome](https://fontawesome.com/)
- Fonts: Space Grotesk, Inter & IBM Plex Mono (Google Fonts)
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
