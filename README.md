# Moses Kolleh Sesay - Portfolio Website

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen)](https://moseskolleh.github.io/sustaintheworld/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## About

Professional portfolio website for **Moses Kolleh Sesay**, a Sustainability & Climate Analyst specializing in ESG analysis, climate resilience, and data-driven environmental solutions.

**Live Website:** [https://moseskolleh.github.io/sustaintheworld/](https://moseskolleh.github.io/sustaintheworld/)

## Features

- **Living journey map**: a hand-built SVG map of the journey region — West Africa to East Asia, so every stop gets real resolution instead of a world map that's half empty ocean (Natural Earth 50 m coastlines, simplified hardest away from the Rhine delta where the map zooms deepest, zero runtime dependencies). It flies from Freetown to Changsha, Bonn, Wageningen and Amsterdam as you scroll, and fieldwork sites like Wuppertal join the map when the story reaches them. Regenerate with `npm install d3-geo topojson-client topojson-simplify world-atlas && node scripts/generate-journey-map.js`, then sync the printed stop pixels into `script.js`
- **"Site the borehole" mini-game**: a playable resistivity profile in the Groundwater dossier — read the curve, place the rig, drill. Water-bearing fracture, clay pocket or dry hole; the score converges on the point: blind drilling hits ~30%, reading the curve hit 70%
- **"Don't let it become a boat" flood scene**: an interactive Wupper cross-section in the Wuppertal dossier — slide the river from a calm day to July 2021 and watch the margin under the Schwebebahn's hanging cars shrink
- **Field terminal**: press <code>`</code> anywhere (or the footer button) for a hidden green-on-black terminal — try `journey`, `drill`, `co2`, `voice`, `kushe`, `help`
- **The spoken page**: a `listen` control on every section, and the choice of voice is itself the argument. The browser's own speech engine downloads **zero bytes** — the button says `0.00 g` and means it. A recorded voice (rendered ahead of time via Fish Audio) is the second option, fetched only on click and labelled with exactly what it weighs. Same words, two costs, visitor's call. Nothing ever autoplays. See [Narration](#narration-the-spoken-page)
- **Carbon-aware by construction**: all images ship as optimized WebP (~25 MB → under 2 MB for the whole site), and a live footer badge weighs each visit in the browser (Resource Timing API × Sustainable Web Design model). A low-energy mode pauses all animation and honours `prefers-reduced-motion`
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

| | browser voice | recorded voice |
|---|---|---|
| engine | `window.speechSynthesis` | pre-rendered MP3 (Fish Audio) |
| downloaded | **nothing** | ~40 KB/section, on click only |
| label shown | `0.00 g · 0 KB` | the track's real grams and KB |
| needs a build step | no | yes — `npm run voice` |
| default | when no recording exists | whenever a recording exists |

The recorded voice wins by default once it is there — it is a real human
reading, and it is why the narration was commissioned. The browser voice stays
one click away and still says `0.00 g`, so the lighter option is offered rather
than imposed. Anyone who picks a side keeps their choice.

The browser path costs nothing because the voice is already installed on the
listener's device. Only **offline** voices are used: Chrome's default network
voices stream audio from Google's servers, which would quietly make the
`0.00 g` claim false. When a browser has no offline voice, the label says so
instead of printing a number the page can't stand behind.

**The site works with no audio files at all.** Until `assets/audio/voice-manifest.json`
exists, the controls use the browser voice and the recorded option stays hidden.
If a browser has neither a voice nor a recording, the controls remove themselves
rather than sit there dead. Nothing autoplays, in any mode.

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

- **Lighthouse Score**: 95+ (Performance, Accessibility, Best Practices, SEO)
- **Load Time**: < 2 seconds on standard connections
- **Optimizations**:
  - Minimal dependencies (no heavy frameworks)
  - Lazy loading for images
  - Debounced scroll events
  - Optimized CSS and JavaScript

## Accessibility

- Semantic HTML5 elements
- ARIA labels where appropriate
- Keyboard navigation support
- Skip to content link
- High contrast ratios
- Responsive text sizing

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
