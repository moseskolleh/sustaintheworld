#!/usr/bin/env node
// ===================================================================
// BUILD CONTENT — one source, every derived page
//
//     npm run build:content          write the generated files
//     npm run build:content -- --check   fail if any of them is out of date
//
// The site's facts used to live in six places at once: index.html, its
// JSON-LD block, field-report.html, the narration scripts, the README and the
// CV. Nothing kept them in step and they had already drifted. Everything this
// script writes is now derived from content/, and --check runs in CI so a
// hand-edit to a generated file cannot survive a push.
//
// GENERATED (do not hand-edit — the header on each file says so):
//
//   case-studies.html   problem → method → artifact → result, per project,
//                       with role lenses
//   research.html       research outputs and how to reproduce them
//   stats.html          what the visit counter has counted, suppressed
//                       below 5, and exactly what it sends (content/stats.json,
//                       which scripts/fetch-stats.js writes once a week)
//   sitemap.xml         every page, with a lastmod that is not in the future
//   voice-scripts.js    the narration module, from content/narration.json
//   index.html          the JSON-LD block only, between its markers
//   modules/interactives.js   the Assay's facts block only, between its
//                       markers: what the fit-check may say about Moses
//
// STILL HAND-AUTHORED: index.html and field-report.html. They are long-form
// editorial pages, and templating over 130 KB of hand-tuned markup to remove
// duplication that a test already catches would trade a small problem for a
// large one. tests/content.test.js holds them to content/ instead.
//
// The output is deterministic — no dates, no ordering by filesystem, no
// randomness — because --check compares bytes.
// ===================================================================

const fs = require('fs');
const path = require('path');
const content = require('./lib/content.js');

const ROOT = content.ROOT;
const CHECK = process.argv.slice(2).includes('--check');

const GENERATED_BY = 'scripts/build-content.js';
const SITE = 'https://moseskolleh.github.io/sustaintheworld/';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Typographic tidy-up for prose: the content files are written with plain
// ASCII quotes and dashes so they stay easy to edit and diff.
const prose = (s) => esc(s)
    .replace(/ — /g, ' &mdash; ')
    .replace(/(\d)-(\d)/g, '$1&ndash;$2');

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Group headings on research.html. Appending an "s" gave "MSc thesiss" and
// "Codes"; these are the rules the output types actually need.
const UNCOUNTABLE = new Set(['Code']);
const plural = (type) => {
    if (UNCOUNTABLE.has(type)) return type;
    if (/is$/.test(type)) return type.slice(0, -2) + 'es';   // thesis → theses
    if (/s$/.test(type)) return type;                          // already plural: Essays
    return type + 's';
};

/** Pulls named <symbol> definitions out of the sprite index.html already ships. */
function sprite(ids) {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const symbols = ids.map((id) => {
        const m = html.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`));
        if (!m) throw new Error(`icon #${id} is not in the index.html sprite`);
        return m[0];
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" class="icon-sprite" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join('')}</svg>`;
}

const STATUS_LABEL = {
    'public': 'Public',
    'on-request': 'On request',
    'internal': 'Held by the client',
    'planned': 'Planned'
};

const STATUS_EXPLAIN = {
    'public': 'Open it now.',
    'on-request': 'It exists and I hold it — ask and I will send it.',
    'internal': 'Belongs to the organisation it was made for, not mine to publish.',
    'planned': 'Intended, not yet done.'
};

/** The availability chip shown next to every artifact and output. */
function statusChip(entry) {
    const label = STATUS_LABEL[entry.status] || entry.status;
    const explain = STATUS_EXPLAIN[entry.status] || '';
    const held = entry.heldBy ? ` ${entry.heldBy}.` : '';
    return `<span class="cs-status cs-status-${entry.status}" title="${esc(explain + held)}">${esc(label)}</span>`;
}

function pageShell({ title, description, canonical, heroTag, heroTitle, heroLead, main, bodyEnd = '', icons = ['i-arrow-right'], current = '', styles = [] }) {
    // A page that runs a script says so before first paint (html.js), so its
    // stylesheet can offer the controls that script drives and hide them
    // when it cannot run. A page with no script has nothing to announce.
    const jsMark = /<script\b/.test(bodyEnd)
        ? `\n    <script>document.documentElement.classList.add('js')</script>`
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">${jsMark}
    <!-- GENERATED by ${GENERATED_BY} from content/ — do not edit by hand.
         Edit the JSON under content/ and run: npm run build:content -->
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="author" content="Moses Kolleh Sesay">
    <link rel="canonical" href="${esc(canonical)}">
    <link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${SITE}assets/img/og-image.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${SITE}assets/img/og-image.jpg">
    <!-- The three typefaces are self-hosted (assets/fonts/, built by scripts/build-fonts.js):
         no request leaves this origin, and the bytes are counted in the budget. -->
    <link rel="preload" as="font" type="font/woff2" href="assets/fonts/space-grotesk-latin.woff2" crossorigin>
    <link rel="preload" as="font" type="font/woff2" href="assets/fonts/inter-latin.woff2" crossorigin>
    <link rel="preload" as="font" type="font/woff2" href="assets/fonts/ibm-plex-mono-latin-400.woff2" crossorigin>
    <link rel="stylesheet" href="carbon-ai.css">${styles.map(href => `
    <link rel="stylesheet" href="${esc(href)}">`).join('')}
    <link rel="stylesheet" href="content.css">
    <script defer src="count.js"></script>
</head>
<body>
    <a class="skip-link" href="#main">Skip to content</a>
    ${sprite(icons)}
    <nav class="ca-nav" aria-label="Main">
        <a href="index.html" class="ca-nav-logo" aria-label="Back to portfolio home">
            <svg viewBox="0 0 40 40" aria-hidden="true">
                <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.35"/>
                <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
                <circle cx="20" cy="20" r="7" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.8"/>
                <circle cx="20" cy="20" r="2.5" fill="currentColor"/>
            </svg>
            <span class="ca-nav-name">MK<span class="ca-accent">S</span></span>
        </a>
        <a href="index.html" class="ca-back"><svg class="icon icon-flip" aria-hidden="true" focusable="false"><use href="#i-arrow-right"></use></svg> Back to portfolio</a>
    </nav>
    <main class="ca-shell" id="main">
        <header class="ca-hero">
            <div class="ca-hero-tag">${heroTag}</div>
            <h1>${heroTitle}</h1>
            <p>${heroLead}</p>
        </header>
${main}
    </main>
    <footer class="ca-foot">
        <p><a href="stats.html"${current === 'stats.html' ? ' aria-current="page"' : ''}>Open counts</a>: what this site counts about its visits, and what it never collects.</p>
    </footer>
${bodyEnd}
</body>
</html>
`.replace(/[ \t]+$/gm, '');   // an empty optional part leaves an indented blank line (lint:html)
}

// ------------------------------------------------------------------
// case-studies.html
// ------------------------------------------------------------------
function renderCaseStudies(data) {
    const { projects, lenses } = data;
    const all = [lenses.default].concat(lenses.lenses);

    // The lens switcher. Real links, so every view is shareable; the script
    // below switches them in place. Without JavaScript a lens link would only
    // reload the same "all" view, so content.css does not offer the switcher.
    const switcher = `
        <nav class="cs-lenses" aria-label="Portfolio views">
            <span class="cs-lenses-label mono-label">Viewing as</span>
            ${all.map(l => `<a class="cs-lens" href="case-studies.html${l.id === 'all' ? '' : `?lens=${l.id}`}" data-lens="${esc(l.id)}">${esc(l.shortLabel || l.label)}</a>`).join('\n            ')}
        </nav>`;

    // One panel per lens, all present in the HTML. Without JavaScript the
    // server cannot know which was asked for, so the "all" panel is shown and
    // the rest are hidden — every case study is on the page either way.
    const panels = all.map((l) => {
        const isDefault = l.id === 'all';
        const evidence = l.evidence
            ? `<ul class="cs-lens-evidence">${l.evidence.map(e => `<li>${prose(e)}</li>`).join('')}</ul>`
            : '';
        const bestFor = l.bestFor ? `<p class="cs-lens-bestfor"><strong>Best fit for:</strong> ${prose(l.bestFor)}</p>` : '';
        return `
        <section class="cs-lens-panel" data-lens-panel="${esc(l.id)}"${isDefault ? '' : ' hidden'} aria-labelledby="lens-${esc(l.id)}-h">
            <h2 id="lens-${esc(l.id)}-h">${esc(l.label)}${l.tagline ? ` <span class="cs-lens-tagline">${prose(l.tagline)}</span>` : ''}</h2>
            <p class="cs-lens-summary">${prose(l.summary)}</p>
            ${bestFor}
            ${evidence}
        </section>`;
    }).join('\n');

    const card = (cs) => {
        const artifacts = cs.artifacts.map((a) => {
            const name = a.status === 'public' && a.url
                ? `<a href="${esc(a.url)}">${prose(a.name)}</a>`
                : prose(a.name);
            return `
                    <li class="cs-artifact">
                        <div class="cs-artifact-head">
                            <span class="cs-artifact-kind mono-label">${esc(a.kind || 'output')}</span>
                            ${statusChip(a)}
                        </div>
                        <div class="cs-artifact-name">${name}</div>
                        ${a.note ? `<p class="cs-artifact-note">${prose(a.note)}</p>` : ''}
                        ${a.heldBy ? `<p class="cs-artifact-note">Held by ${prose(a.heldBy)}.</p>` : ''}
                    </li>`;
        }).join('');

        const results = cs.results.map(r => `
                    <li class="cs-result${r.verifiable ? ' cs-result-verifiable' : ''}">
                        <p class="cs-result-claim">${prose(r.claim)}</p>
                        <p class="cs-result-basis"><span class="mono-label">How this is known</span> ${prose(r.basis)}</p>
                        <p class="cs-result-check">${r.verifiable
                            ? 'You can check this yourself.'
                            : 'You cannot check this from outside — it rests on records held elsewhere.'}</p>
                    </li>`).join('');

        return `
            <article class="cs-card" id="${esc(cs.id)}" data-lenses="${esc((cs.lenses || []).join(' '))}">
                <header class="cs-card-head">
                    <p class="cs-card-meta mono-label">${esc(cs.period)} &middot; ${esc(cs.location)}</p>
                    <h3>${prose(cs.title)}</h3>
                    <p class="cs-card-sub">${prose(cs.subtitle || '')}</p>
                    <p class="cs-card-org">${prose(cs.organization)}${cs.partner ? ` &middot; with ${prose(cs.partner)}` : ''}${cs.role ? ` &middot; ${prose(cs.role)}` : ''}</p>
                </header>

                <div class="cs-stage">
                    <h4 class="cs-stage-h"><span class="cs-stage-n">01</span> Problem</h4>
                    <p>${prose(cs.problem)}</p>
                </div>

                <div class="cs-stage">
                    <h4 class="cs-stage-h"><span class="cs-stage-n">02</span> Method</h4>
                    <ul class="cs-method">${cs.method.map(m => `<li>${prose(m)}</li>`).join('')}</ul>
                </div>

                <div class="cs-stage">
                    <h4 class="cs-stage-h"><span class="cs-stage-n">03</span> Artifact</h4>
                    <ul class="cs-artifacts">${artifacts}
                    </ul>
                </div>

                <div class="cs-stage">
                    <h4 class="cs-stage-h"><span class="cs-stage-n">04</span> Result</h4>
                    <ul class="cs-results">${results}
                    </ul>
                </div>
${cs.caveat ? `
                <p class="cs-caveat"><span class="mono-label">Caveat</span> ${prose(cs.caveat)}</p>` : ''}
            </article>`;
    };

    const cards = projects.caseStudies.map(card).join('\n');

    const main = `${switcher}
${panels}

        <p class="cs-note">
            Every case study below is on this page in every view &mdash; a lens reorders and frames,
            it never hides. Each result says how it was measured, and whether you can check it
            from outside. Where the answer is no, it says so.
        </p>

        <div class="cs-grid" id="csGrid">
${cards}
        </div>

        <section class="cs-footnote">
            <h2>Why it is laid out like this</h2>
            <p>
                A portfolio that lists outcomes without saying how they were measured is asking to be
                taken on trust. Splitting each project into <strong>problem &rarr; method &rarr; artifact &rarr;
                result</strong> makes the weak link visible: a strong method with an internal-only artifact
                is a different thing from a public tool anyone can run, and both are different from a
                number with no baseline behind it.
            </p>
            <p>
                The content lives in <code>content/projects.json</code>. A test fails the build if any
                result loses its basis, if an artifact claims to be public without a working link, or if
                a link points somewhere this repository has not already vouched for.
            </p>
        </section>`;

    // Progressive enhancement only: the page is complete without this.
    const script = `    <script>
    // Lens switching without a reload. The page already contains every panel
    // and every case study; this reorders and swaps which framing is shown,
    // and keeps the URL shareable. With JavaScript off, each lens link is an
    // ordinary navigation to the same page and everything is still readable.
    (function () {
        var grid = document.getElementById('csGrid');
        if (!grid) return;
        var cards = Array.prototype.slice.call(grid.children);
        var order = cards.slice();

        function apply(lens) {
            document.querySelectorAll('[data-lens-panel]').forEach(function (p) {
                p.hidden = p.getAttribute('data-lens-panel') !== lens;
            });
            document.querySelectorAll('.cs-lens').forEach(function (a) {
                var on = a.getAttribute('data-lens') === lens;
                a.classList.toggle('is-active', on);
                if (on) { a.setAttribute('aria-current', 'true'); } else { a.removeAttribute('aria-current'); }
            });

            // Matching case studies rise to the top; the rest keep their order
            // below. Nothing is removed from the document.
            var matched = [], rest = [];
            order.forEach(function (card) {
                var owns = (card.getAttribute('data-lenses') || '').split(' ').indexOf(lens) > -1;
                card.classList.toggle('cs-card-secondary', lens !== 'all' && !owns);
                (lens === 'all' || owns ? matched : rest).push(card);
            });
            matched.concat(rest).forEach(function (card) { grid.appendChild(card); });
        }

        function fromUrl() {
            var m = window.location.search.match(/[?&]lens=([a-z0-9-]+)/i);
            var lens = m ? m[1] : 'all';
            return document.querySelector('[data-lens-panel="' + lens + '"]') ? lens : 'all';
        }

        document.querySelectorAll('.cs-lens').forEach(function (a) {
            a.addEventListener('click', function (e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
                e.preventDefault();
                var lens = a.getAttribute('data-lens');
                history.pushState({ lens: lens }, '', lens === 'all' ? 'case-studies.html' : 'case-studies.html?lens=' + lens);
                apply(lens);
            });
        });
        window.addEventListener('popstate', function () { apply(fromUrl()); });

        apply(fromUrl());
    })();
    </script>`;

    return pageShell({
        title: 'Case studies — Moses Kolleh Sesay',
        description: 'Six projects in water, climate risk and sustainable AI — problem, method, artifact and measurable result, with the basis for every number.',
        canonical: `${SITE}case-studies.html`,
        heroTag: 'PROBLEM &middot; METHOD &middot; ARTIFACT &middot; RESULT',
        heroTitle: 'Case <span class="ca-accent">studies</span>',
        heroLead: 'Six projects across four countries, each one traced from the question that started it to what it actually produced &mdash; and to how far you can check the result from where you are sitting.',
        main,
        bodyEnd: script
    });
}

// ------------------------------------------------------------------
// research.html
// ------------------------------------------------------------------
function renderResearch(data) {
    const { research } = data;

    const byType = {};
    research.outputs.forEach((o) => {
        (byType[o.type] = byType[o.type] || []).push(o);
    });

    const counts = content.STATUSES
        .map(s => ({ status: s, n: research.outputs.filter(o => o.status === s).length }))
        .filter(c => c.n);

    const summary = `
        <ul class="rs-summary">
            ${counts.map(c => `<li><strong>${c.n}</strong> ${esc(STATUS_LABEL[c.status].toLowerCase())}</li>`).join('')}
        </ul>`;

    const entry = (o) => {
        const title = o.status === 'public' && o.url
            ? `<a href="${esc(o.url)}">${prose(o.title)}</a>`
            : prose(o.title);
        return `
                <article class="rs-item" id="${esc(o.id)}">
                    <div class="rs-item-head">
                        <span class="rs-type mono-label">${esc(o.type)}</span>
                        <span class="rs-year mono-label">${esc(o.year)}</span>
                        ${statusChip(o)}
                    </div>
                    <h3>${title}</h3>
                    ${o.venue ? `<p class="rs-venue">${prose(o.venue)}</p>` : ''}
                    <p class="rs-summary-text">${prose(o.summary)}</p>
                    ${o.methods && o.methods.length
                        ? `<p class="rs-methods"><span class="mono-label">Methods</span> ${o.methods.map(prose).join(' &middot; ')}</p>`
                        : ''}
                    ${o.note ? `<p class="rs-note">${prose(o.note)}</p>` : ''}
                    ${o.heldBy ? `<p class="rs-note">Held by ${prose(o.heldBy)}.</p>` : ''}
                    ${o.caseStudy ? `<p class="rs-link"><a href="case-studies.html#${esc(o.caseStudy)}">Read the case study &rarr;</a></p>` : ''}
                </article>`;
    };

    const sections = Object.keys(byType).map(type => `
            <section class="rs-group">
                <h2>${esc(byType[type].length > 1 ? plural(type) : type)}</h2>
                ${byType[type].map(entry).join('\n')}
            </section>`).join('\n');

    const repro = research.reproducibility;
    const reproSection = `
        <section class="rs-repro">
            <h2>${esc(repro.heading)}</h2>
            <p>${prose(repro.body)}</p>
            <dl class="rs-commands">
                ${repro.commands.map(c => `<dt><code>${esc(c.command)}</code></dt><dd>${prose(c.does)}</dd>`).join('\n                ')}
            </dl>
        </section>`;

    const main = `
        <section class="rs-intro">
            <p>${prose(research.intro)}</p>
            ${summary}
            <p class="rs-key">
                <strong>Public</strong> means you can open it right now.
                <strong>On request</strong> means it exists and I hold it &mdash; ask.
                <strong>Held by the client</strong> means it belongs to the organisation it was made for.
                No entry on this page names a journal, a conference or a DOI, because none of this work has one.
            </p>
        </section>
${sections}
${reproSection}`;

    return pageShell({
        title: 'Research outputs — Moses Kolleh Sesay',
        description: 'Theses, reports, datasets, code and tools — what exists, where it is, and who holds the parts that are not public.',
        canonical: `${SITE}research.html`,
        heroTag: 'WHAT EXISTS &middot; WHERE IT IS &middot; WHO HOLDS IT',
        heroTitle: 'Research <span class="ca-accent">outputs</span>',
        heroLead: 'Three degrees of research, a consultancy, an internship and a working tool. Some of it is public, some belongs to the organisations it was done for, and the rest is a PDF I will happily send you.',
        main
    });
}

// ------------------------------------------------------------------
// stats.html — the counter's published totals
// ------------------------------------------------------------------

// The whole of what one page view sends, as the counter's contract fixes it
// (docs/plan.md, Phase 1). The page prints it literally, and
// tests/stats.test.js fails if its keys ever differ from the contract's.
const EXAMPLE_PAYLOAD = {
    v: 1,
    page: 'index',
    lens: '',
    deepest: 'contact',
    features: ['cv-download-hero', 'cv-download', 'receipt-open'],
    ref: 'www.linkedin.com',
    vp: 'l',
    kb: 287
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (d) => {
    const [y, m, dd] = d.split('-');
    return `${Number(dd)} ${MONTHS[Number(m) - 1]} ${y}`;
};
/** "21&ndash;27 Sep 2026", or "29 Sep &ndash; 5 Oct 2026" across a month. */
const daySpan = (a, b) => {
    const [ya, ma] = a.split('-');
    const [yb, mb] = b.split('-');
    if (ya === yb && ma === mb) return `${Number(a.slice(8))}&ndash;${dayOf(b)}`;
    if (ya === yb) return `${dayOf(a).slice(0, -5)} &ndash; ${dayOf(b)}`;
    return `${dayOf(a)} &ndash; ${dayOf(b)}`;
};

// A published count is a whole number, "<5", or "held" (5 or more, hidden
// so that a figure under 5 beside it cannot be worked out); null means there
// is no figure to give (a share with a hidden side, or no Brief yet).
const figure = (v) => {
    if (v === null || v === undefined) return '&mdash;';
    if (typeof v === 'number') return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return esc(v);
};
const percent = (v) => {
    if (v === null || v === undefined) return '&mdash;';
    return v > 0 && v < 0.005 ? '&lt;1%' : `${Math.round(v * 100)}%`;
};
/** A share of page views, only between two counts that were both published. */
const shareOf = (part, whole) => (typeof part === 'number' && typeof whole === 'number' && whole > 0 && part <= whole
    ? percent(part / whole) : '&mdash;');

const PAGE_NAMES = {
    'index': 'Homepage',
    'case-studies': 'Case studies',
    'research': 'Research outputs',
    'carbon-ai': 'AI, Weighed',
    'field-report': 'Field report (text only)',
    'stats': 'Open counts (this page)',
    '404': 'Page not found (404)'
};
// The width of the browser window, which is not always the screen's: a
// desktop window at half width is in the middle class.
const VIEWPORT_NAMES = {
    s: 'Under 600 px, as on a phone',
    m: '600&ndash;1023 px, a tablet or a narrow window',
    l: '1024 px and wider, as on a desktop'
};

/** The five numbers, defined once for both the empty and the counting page. */
function fiveNumbers(stats) {
    return [
        {
            key: 'contact',
            name: 'Messages through the contact form',
            def: 'Submissions the form&rsquo;s endpoint accepted, bar those sent with JavaScript on from a browser that ' +
                 'asks not to be tracked. ' +
                 'Email sent straight to my address is not in this figure: a click on the address shows up under ' +
                 'features, but whether a message followed cannot be known.'
        },
        {
            key: 'cvDownloads',
            name: 'CV downloads',
            def: 'Page views in which a CV link was clicked, counted once however many of the CV links were used. ' +
                 'A click, which is not quite a finished download.'
        },
        {
            key: 'lensVisits',
            name: 'Lens-link visits, a proxy',
            def: 'Page views that arrived through a role link such as <code>case-studies.html?lens=water</code>. ' +
                 'What I want to know is how many of those go on to read a case study, but the totals are kept field ' +
                 'by field, not visit by visit, so the lens and how far the reader got cannot be joined. This counts ' +
                 'the arrivals, so the real figure is at most this.'
        },
        {
            key: 'contactShare',
            share: true,
            name: 'Homepage views that reached Contact',
            def: 'The share of homepage views whose furthest section was <code>#contact</code>, the last one on the page. ' +
                 'Given only when both counts are 5 or more.'
        },
        {
            key: 'briefUses',
            name: 'Brief uses',
            def: 'Page views in which The Brief was run: the planned successor to the Assay, which is to turn a pasted ' +
                 'job ad into an honest fit and a one-page dossier tailored to it.' +
                 (stats.briefLive ? '' : ' It is not built yet, so there is nothing to count; the figure appears here once it is.')
        }
    ];
}

function renderStats(data) {
    const { stats, lenses } = data;
    const collecting = stats.status === 'collecting';
    const five = fiveNumbers(stats);
    const small = `&lt;${stats.suppressBelow}`;

    const lensNames = {};
    lenses.lenses.forEach((l) => { lensNames[l.id] = l.shortLabel || l.label; });

    // Tables are built to fit a 320 px screen. The one that cannot, the
    // week-by-week grid, scrolls inside its own box rather than pushing the
    // page sideways; that box is focusable so it can be scrolled from the
    // keyboard, and named so that focus announces something. A named
    // <section> is the native element for the region role that needs.
    const table = (label, head, body, wide = false) => {
        const box = wide ? 'section' : 'div';
        return `
            <${box} class="st-table-wrap"${wide ? ` aria-label="${esc(label)}" tabindex="0"` : ''}>
                <table class="st-table${wide ? ' st-wide' : ''}">
                    <caption class="sr-only">${esc(label)}</caption>
                    <thead><tr>${head.map((h, i) => `<th scope="col"${i ? ' class="st-num"' : ''}>${h}</th>`).join('')}</tr></thead>
                    <tbody>
${body.join('\n')}
                    </tbody>
                </table>
            </${box}>`;
    };

    // The five numbers as cards: a name, the figures once there are any, and
    // exactly what is being counted.
    const fiveCards = (values) => `
            <ul class="st-five">
${five.map((n) => {
        const v = values ? values(n) : '';
        return `                <li class="st-card">
                    <h3>${n.name}</h3>${v ? `
                    <dl class="st-values">${v}</dl>` : ''}
                    <p class="st-def">${n.def}</p>
                </li>`;
    }).join('\n')}
            </ul>`;

    const fiveIntro = '<p>The measures that say whether the site is doing its job, chosen before any of them was counted.</p>';

    const why = `
        <section class="st-block" aria-labelledby="st-why-h">
            <h2 id="st-why-h">Why count at all</h2>
            <p>
                Every change I plan for this site is a bet about what a recruiter does on it: that the evidence
                should come sooner, that a shorter homepage gets read further, that a link framed for one kind of
                role lands better than a general one. Without counts none of those bets can be checked, so the site
                measures itself first and changes second. Four weeks of these numbers are the baseline the homepage
                redesign will be judged against.
            </p>
            <p>
                Every figure but the contact messages is a count of page views. With no id there is no way to tell
                two pages read by one person from two people reading one page each, so nothing here claims to count
                people. And the counts are a floor, not a census: a count that reaches the endpoint while it is busy
                (more than 30 in a minute, or the sheet in use for longer than a second or two) is dropped rather
                than kept waiting, so that the contact form never waits behind the counter.
            </p>
        </section>`;

    // --- before counting starts --------------------------------------------
    const empty = `
        <section class="st-block st-empty" aria-labelledby="st-empty-h">
            <h2 id="st-empty-h">Counting has not started yet</h2>
            <p>
                The counter is built and this page is ready for it, but no totals have reached it yet. Once counting
                is switched on, a scheduled job reads the daily totals every Monday morning and rebuilds this page.
                The first weekly figures appear on the Monday after the first full week of counting, Monday to
                Sunday; the baseline needs four of those.
            </p>
            <p>What will appear here, with every figure under ${stats.suppressBelow} held back:</p>
            <ul class="st-list">
                <li>the five numbers below, for the last week, for all time, and week by week;</li>
                <li>page views by page, by role lens and by window width;</li>
                <li>the sites readers came from, by host name only;</li>
                <li>which features were used, and how far down a page readers got;</li>
                <li>the kilobytes transferred per page view.</li>
            </ul>
        </section>

        <section class="st-block" aria-labelledby="st-five-h">
            <h2 id="st-five-h">The five numbers</h2>
            ${fiveIntro}
${fiveCards(null)}
        </section>`;

    // --- once there are totals ---------------------------------------------
    let counted = '';
    if (collecting) {
        // scripts/fetch-stats.js writes a counting file only once a full week
        // has ended, and scripts/lib/content.js refuses one without it.
        const { period, week, headline, breakdown, bytes } = stats;
        const weekHead = `Week of ${daySpan(week.start, week.end)}`;
        const cols = first => [first, weekHead, 'All time'];
        const cells = (w, a, fmt = figure) => `<td class="st-num">${fmt(w)}</td><td class="st-num">${fmt(a)}</td>`;

        const status = `
        <section class="st-block st-status" aria-labelledby="st-status-h">
            <h2 id="st-status-h">What these figures cover</h2>
            <p>
                Counted from <strong>${dayOf(period.first)}</strong> to <strong>${dayOf(period.last)}</strong>
                (${period.days / 7} week${period.days === 7 ? '' : 's'}): <strong>${figure(headline.all.visits)}</strong> page views in all,
                <strong>${figure(headline.week.visits)}</strong> of them in the week of ${daySpan(week.start, week.end)}.
                Fetched on ${dayOf(stats.asOf)}; the page is rebuilt every Monday.
            </p>
            <p>
                Every figure covers whole weeks, Monday to Sunday. If counting began mid-week, the figures start on
                the Monday after, and the week still running is left out until it has ended.
            </p>
            <p class="st-key">
                <strong>${small}</strong> means fewer than ${stats.suppressBelow}: too few to publish, and left out of every percentage.
                <strong>held</strong> means ${stats.suppressBelow} or more, held back because, with the figures beside it, it
                would give away one that is fewer than ${stats.suppressBelow}.
                <strong>&mdash;</strong> means there is no figure to give.
            </p>
        </section>`;

        const fiveSection = `
        <section class="st-block" aria-labelledby="st-five-h">
            <h2 id="st-five-h">The five numbers</h2>
            ${fiveIntro}
${fiveCards((n) => {
        if (n.key === 'briefUses' && !stats.briefLive) return '<div><dt>Status</dt><dd>not live yet</dd></div>';
        const fmt = n.share ? percent : figure;
        return `<div><dt>${weekHead}</dt><dd>${fmt(headline.week[n.key])}</dd></div>` +
            `<div><dt>All time</dt><dd>${fmt(headline.all[n.key])}</dd></div>`;
    })}
        </section>`;

        const weekRows = stats.weeks.map(w => `                        <tr>
                            <th scope="row">${daySpan(w.start, w.end)}</th>
                            <td class="st-num">${figure(w.visits)}</td>
                            <td class="st-num">${figure(w.contact)}</td>
                            <td class="st-num">${figure(w.cvDownloads)}</td>
                            <td class="st-num">${figure(w.lensVisits)}</td>
                            <td class="st-num">${percent(w.contactShare)}</td>
                            <td class="st-num">${stats.briefLive ? figure(w.briefUses) : 'not live'}</td>
                        </tr>`);
        const weeksSection = !weekRows.length ? '' : `
        <section class="st-block" aria-labelledby="st-weeks-h">
            <h2 id="st-weeks-h">Week by week</h2>
            <p>One row per Monday-to-Sunday week, newest first. The first four complete weeks are the baseline.</p>
${table('The five numbers, week by week', ['Week', 'Page views', 'Contact', 'CV', 'Lens links', 'Reached Contact', 'Brief'], weekRows, true)}
        </section>`;

        // One breakdown: a row per key with both periods side by side, and
        // optionally the all-time share of every page view.
        const visitsAll = headline.all.visits;
        const breakdownTable = (metric, label, first, name, withShare) => {
            const rows = breakdown[metric];
            if (!rows.length) return '            <p class="st-none">Nothing counted here yet.</p>';
            const head = cols(first).concat(withShare ? ['Share, all time'] : []);
            const body = rows.map(r => `                        <tr>
                            <th scope="row">${name(r.key)}</th>
                            ${cells(r.week, r.all)}${withShare ? `<td class="st-num">${shareOf(r.all, visitsAll)}</td>` : ''}
                        </tr>`);
            return table(label, head, body);
        };

        const pagesSection = `
        <section class="st-block" aria-labelledby="st-pages-h">
            <h2 id="st-pages-h">Page views</h2>
            <h3>By page</h3>
${breakdownTable('page', 'Page views by page', 'Page', k => (k === 'other' ? 'Any other name <span class="st-def">not a page this site has</span>' : esc(PAGE_NAMES[k] || k)), true)}
            <h3>By role lens</h3>
            <p>Page views that arrived with <code>?lens=</code> in the address; the rest had none.</p>
${breakdownTable('lens', 'Page views by role lens', 'Lens', k => (k === 'other' ? 'Any other name <span class="st-def">not a lens this site has</span>' : esc(lensNames[k] || k)), true)}
            <h3>By window width</h3>
            <p>The width of the browser window, which on a desktop is not always the width of the screen.</p>
${breakdownTable('vp', 'Page views by window width', 'Window', k => VIEWPORT_NAMES[k] || esc(k), true)}
        </section>`;

        const refSection = `
        <section class="st-block" aria-labelledby="st-ref-h">
            <h2 id="st-ref-h">Where readers came from</h2>
            <p>
                The host name of the site a reader followed a link from, and nothing else of its address. Sites with
                fewer than ${stats.suppressBelow} page views, anything that is not a plain host name, and anything past the top
                fifteen are counted together. A page view with no referring site (typed, bookmarked, or a link
                within this site) is not in this table. None of these is a link: the counter&rsquo;s endpoint is
                public, and a list of links would be an open invitation to referrer spam.
            </p>
${breakdownTable('ref', 'Page views by referring site', 'Came from', k => (k === 'other'
        ? 'Every other site, together' : `<span class="st-host">${esc(k)}</span>`), false)}
        </section>`;

        const featureSection = `
        <section class="st-block" aria-labelledby="st-features-h">
            <h2 id="st-features-h">Features used</h2>
            <p>
                A feature counts once per page view in which it was used: a tracked link or button was pressed, or
                a part of the page that loads on demand was loaded. Only names the site&rsquo;s own code uses are
                listed by name; anything else posted to the endpoint is counted as other.
            </p>
${breakdownTable('feature', 'Page views by feature used', 'Feature', k => (k === 'other' ? 'Any other name' : `<code>${esc(k)}</code>`), false)}
        </section>`;

        const deepestSection = `
        <section class="st-block" aria-labelledby="st-deepest-h">
            <h2 id="st-deepest-h">How far readers got</h2>
            <p>The furthest top-level section each page view reached, by its id, on whichever page it was.</p>
${breakdownTable('deepest', 'Page views by furthest section reached', 'Furthest section', k => (k === 'other' ? 'Any other name' : `<code>#${esc(k)}</code>`), false)}
        </section>`;

        const kb = k => b => (b && b[k] !== null ? `${figure(b[k])}&nbsp;KB` : '&mdash;');
        // Per page, where the fetcher could split it (KB is kept per page);
        // a page with fewer than suppressBelow views in a period has no row.
        const pageKb = (b, page) => {
            const row = b && Array.isArray(b.byPage) ? b.byPage.find(r => r.page === page) : null;
            return row ? { meanKb: row.meanKb } : null;
        };
        const bytePages = Array.from(new Set([].concat(
            ...[bytes.week, bytes.all].map(b => (b && Array.isArray(b.byPage) ? b.byPage.map(r => r.page) : []))
        ))).sort();
        const bytesByPage = !bytePages.length ? '' : `
            <h3>By page</h3>
${table('Mean kilobytes transferred per page view, by page', cols('Page'), bytePages.map(page => `                        <tr>
                            <th scope="row">${page === 'other' ? 'Any other name' : esc(PAGE_NAMES[page] || page)}</th>
                            ${cells(pageKb(bytes.week, page), pageKb(bytes.all, page), kb('meanKb'))}
                        </tr>`))}
            <p>A page with fewer than ${stats.suppressBelow} page views in a period has no figure for it.</p>`;
        const bytesSection = `
        <section class="st-block" aria-labelledby="st-bytes-h">
            <h2 id="st-bytes-h">Bytes per page view</h2>
${table('Kilobytes transferred per page view', cols('Per page view'), [
    `                        <tr>
                            <th scope="row">Mean</th>
                            ${cells(bytes.week, bytes.all, kb('meanKb'))}
                        </tr>`,
    `                        <tr>
                            <th scope="row">Median day</th>
                            ${cells(bytes.week, bytes.all, kb('medianDayKb'))}
                        </tr>`
])}
            <p>
                The mean is every kilobyte counted over every page view. The totals are kept by day, so a median of
                single page views is not something they can give; the median day is the middle of the daily means,
                over days with ${stats.suppressBelow} or more page views.
            </p>${bytesByPage}
            <p>
                This is network transfer only: what the browser reports receiving for the page and everything it
                loaded, measured with the Resource Timing API. Unlike the carbon receipt in the homepage footer, a
                file the browser already had counts as nothing here, because nothing was transferred for it. It is
                not the energy used by your device, the network or the servers, and it is not a carbon figure.
            </p>
        </section>`;

        counted = status + fiveSection + weeksSection + pagesSection + refSection + featureSection + deepestSection + bytesSection;
    }

    // --- what is sent: the same in both states -----------------------------
    const privacy = `
        <section class="st-block st-privacy" aria-labelledby="st-privacy-h">
            <h2 id="st-privacy-h">What a page view sends, and what it never does</h2>
            <p>
                One count per page view, sent the first time the page is closed or hidden &mdash; switching to
                another tab is enough. So every figure here covers a page view up to that moment: what a reader
                does after coming back to the tab is not in it. This example is the whole of one, set out on
                separate lines here; the real one is a single line of text.
            </p>
            <pre class="st-payload"><code>${esc(JSON.stringify(EXAMPLE_PAYLOAD, null, 2))}</code></pre>
            <dl class="st-fields">
                <dt><code>page</code>, <code>lens</code>, <code>deepest</code></dt>
                <dd>The page, the role lens in its address if there was one, and the id of the furthest section reached.</dd>
                <dt><code>features</code></dt>
                <dd>
                    Up to 20 names of things used on the page, such as a CV link or the carbon receipt, and, if the
                    Assay graded a job ad, the grade it gave. Never the ad itself.
                </dd>
                <dt><code>ref</code></dt>
                <dd>The host name of the site you came from; empty if there was none, or if it was this site.</dd>
                <dt><code>vp</code></dt>
                <dd>The browser window&rsquo;s width as one of three classes: <code>s</code> under 600 px, <code>m</code> up to 1023 px, <code>l</code> wider.</dd>
                <dt><code>kb</code></dt>
                <dd>Kilobytes transferred for the page, from the browser&rsquo;s Resource Timing API.</dd>
                <dt><code>v</code></dt>
                <dd>The version of this format, so a change to it cannot pass unnoticed.</dd>
            </dl>
            <h3>Never collected</h3>
            <ul class="st-list">
                <li>
                    No cookie, and no browser storage: the count neither reads nor writes any, so nothing it sends can
                    be tied to your device. (The site itself remembers a few of your choices in your browser &mdash; the
                    theme, low-energy mode, the reading speed, whether you have seen the intro &mdash; and sends none
                    of them anywhere.)
                </li>
                <li>No id of any kind, so two page views cannot be tied to each other, or to you.</li>
                <li>
                    No IP address. The count goes to a Google Apps Script web app, the one the contact form already
                    uses, and Apps Script does not give the script the sender&rsquo;s address, so it cannot be stored
                    even by mistake. Google, which runs the endpoint, receives the request as it receives any other.
                </li>
                <li>No browser, device or operating system, and no screen or window size beyond the three classes above.</li>
                <li>No time finer than the day the count arrives.</li>
                <li>No full referring address, only its host name, and nothing you type into the page.</li>
            </ul>
            <p>
                <strong>If your browser sends Do Not Track or Global Privacy Control, nothing is sent at all</strong>,
                and you are in none of these figures. A message you send through the contact form is not counted
                either, with one exception: with JavaScript off, the form cannot pass the signal on, and the message
                is counted as one message.
            </p>
            <h3>How the figures are made safe to publish</h3>
            <p>
                Any count under ${stats.suppressBelow} is shown as ${small} and left out of every percentage, and referring sites
                with fewer than ${stats.suppressBelow} page views are counted together. Where the rows of a table add up to a
                total shown on this page, as page views by page do, a lone ${small} would be the total less the rest, so
                the smallest figure beside it is held back as well; a percentage is given only between two figures that
                are both shown. Every figure covers whole weeks, Monday to Sunday, so no single day&rsquo;s count can be
                taken out of them. Page, lens, section and feature names the site does not use are counted as other, so
                a made-up count cannot put words on this page. A referring site cannot be checked that way, so it is
                named only once it reaches ${stats.suppressBelow}, and never as a link.
            </p>
            <p>
                Two limits, stated plainly. Where two figures are held back together, what they add up to can still
                be worked out, though not either one. And the all-time totals are rebuilt every week, so comparing two
                versions of this page can narrow down a weekly change its own column shows as ${small}. No count for a
                single day is ever published.
            </p>
            <h3>Where the raw totals live</h3>
            <p>
                The daily totals &mdash; a date, a field, a value and a count, never a single page view &mdash; are
                kept in a Google Sheet in my own Google account. The counter&rsquo;s endpoint hands them over only to a
                request carrying a key that the scheduled job keeps as a secret; once a week that job reads them,
                suppresses them and rebuilds this page. Only the suppressed totals you see here are written into the
                site&rsquo;s public repository, in <code>content/stats.json</code>; the code that does it is
                <code>scripts/fetch-stats.js</code>.
            </p>
        </section>`;

    const main = `${why}
${collecting ? counted : empty}
${privacy}`;

    return pageShell({
        title: 'Open counts — Moses Kolleh Sesay',
        description: 'What this portfolio counts about its own page views and why: five numbers, suppressed below 5, and the exact payload a page view sends. No cookies, no ids, no analytics service.',
        canonical: `${SITE}stats.html`,
        heroTag: 'WHAT IS COUNTED &middot; WHY &middot; WHAT NEVER IS',
        heroTitle: 'Open <span class="ca-accent">counts</span>',
        heroLead: 'This site counts its own page views, with no cookies, no ids and no analytics service, so each change to it can be judged against what readers actually do. Everything it counts is published here, and so is exactly what it sends.',
        main,
        current: 'stats.html',
        styles: ['stats.css']
    });
}

// ------------------------------------------------------------------
// sitemap.xml
// ------------------------------------------------------------------
function renderSitemap(data) {
    const pages = data.profile.pages;
    const entries = pages.map(p => `  <url>
    <loc>${esc(p.loc)}</loc>
    <lastmod>${esc(p.lastmod)}</lastmod>
    <changefreq>${esc(p.changefreq || 'monthly')}</changefreq>
    <priority>${esc(p.priority || '0.5')}</priority>
  </url>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by ${GENERATED_BY} from content/profile.json — do not edit by hand.
     Every entry needs a lastmod, and none may be dated in the future;
     tests/content.test.js checks both. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

// ------------------------------------------------------------------
// voice-scripts.js
// ------------------------------------------------------------------
function renderVoiceScripts(data) {
    const comment = data.narration.$comment.map(l => (l ? `// ${l}` : '//')).join('\n');

    // JSON.stringify gives a correctly escaped JS string literal, which is
    // what keeps the text byte-identical through the round trip — and the
    // narration hashes with it.
    const scripts = data.narration.scripts.map(s => `        {
            id: ${JSON.stringify(s.id)},
            label: ${JSON.stringify(s.label)},
            text: ${JSON.stringify(s.text)}
        }`).join(',\n');
    // Moses's own introduction: the words of a recording, not a section the
    // browser voice reads. Kept out of SCRIPTS so nothing iterates over it
    // by accident; null when content/narration.json has none.
    const intro = data.narration.intro;
    const introLiteral = intro ? `{
        id: ${JSON.stringify(intro.id)},
        label: ${JSON.stringify(intro.label)},
        readBy: ${JSON.stringify(intro.readBy)},
        text: ${JSON.stringify(intro.text)}
    }` : 'null';

    return `// ===================================================================
// GENERATED by ${GENERATED_BY} from content/narration.json.
// Do not edit this file — your changes will be overwritten.
// Edit content/narration.json, then run: npm run build:content
//
${comment}
// ===================================================================
(function (root, factory) {
    const data = factory();
    root.VoiceScripts = data;
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    // \`id\` is the section's element id (the hero's is #home), and the
    // file name if anyone opts in to rendering it: assets/audio/<id>.mp3
    // \`label\` is how the player names that section.
    const SCRIPTS = [
${scripts}
    ];

    // The captions for Moses's recorded introduction, which he reads from
    // this text. Never spoken by the browser voice.
    const INTRO = ${introLiteral};

${SPLIT_SENTENCES}

    const byId = {};
    SCRIPTS.forEach(s => { byId[s.id] = s; });

    return { SCRIPTS, byId, splitSentences, INTRO };
});
`;
}

// The sentence splitter is behaviour, not content, so it is not expressed as
// data. It is carried here byte-for-byte from the hand-written file this
// generator replaced — rewriting it would have quietly changed how the
// narration is chunked, and tests/bugs.test.js exists because that has bitten
// this repository before.
const SPLIT_SENTENCES = String.raw`    // Sentence splitting, shared by the player (for utterances and captions)
    // and available to the generator.
    //
    // Splitting naively on "." mangles these scripts, which are full of
    // spelled-out initialisms — A.I., E.S.G., Q.G.I.S., Arc.G.I.S. Those are
    // parked behind a sentinel before the split and restored after, so
    // "sustainable A.I. — making sure…" stays a single sentence.
    //
    // The sentinel is deliberately non-numeric: the scripts are also full of
    // real numbers (164 water points) that must survive the round trip
    // untouched. tests/bugs.test.js asserts exactly that.
    // ---------------------------------------------------------------
    const INITIALISM = /[A-Za-z]+(?:\.[A-Za-z])+\./g;

    function splitSentences(text) {
        const parked = [];
        const masked = String(text).replace(INITIALISM, (m) => {
            parked.push(m);
            return ` + '`@@${parked.length - 1}@@`' + String.raw`;
        });
        const restore = s => s.replace(/@@(\d+)@@/g, (_, i) => parked[Number(i)]);
        const raw = masked.match(/[^.!?…]+[.!?…]+["'”’—]?\s*/g) || [masked];

        // Fold very short fragments into the previous sentence — a two-word
        // utterance reads as a stutter and costs an extra engine round-trip.
        const out = [];
        raw.map(s => restore(s).trim()).filter(Boolean).forEach(s => {
            if (out.length && s.length < 40) out[out.length - 1] += ' ' + s;
            else out.push(s);
        });
        return out.length ? out : [String(text)];
    }`;

// ------------------------------------------------------------------
// modules/interactives.js — the Assay's facts block only
//
// The fit-check has to compare a job ad's "5+ years" or "fluent Dutch"
// against something, and the only honest something is content/profile.json.
// Fetching the JSON at runtime would be one more request for every visitor
// who uses it; embedding the few fields it needs in the module it already
// loads costs nothing extra, and --check keeps the copy from going stale.
// `languages` is optional in profile.json and null until Moses adds it:
// until then every non-English language an ad asks for is a gap.
// ------------------------------------------------------------------
const FACTS_START = '    // ASSAY-FACTS:START — generated by scripts/build-content.js from content/profile.json. Do not edit by hand.';
const FACTS_END = '    // ASSAY-FACTS:END';

function renderAssayFacts(data) {
    const { profile } = data;
    const facts = {
        languages: Array.isArray(profile.languages) && profile.languages.length
            ? profile.languages.map(l => ({ language: l.language, level: l.level }))
            : null,
        experience: profile.experience.map(r => ({ title: r.title, displayDates: r.displayDates, start: r.start, end: r.end })),
        degrees: profile.education.map(e => e.degree)
    };
    // A role per line: it ships to every visitor who uses the Assay, and a
    // diff of one changed role should be one changed line.
    const list = (items) => `[\n${items.map(x => `            ${JSON.stringify(x)}`).join(',\n')}\n        ]`;
    const lines = Object.entries(facts).map(([key, value]) =>
        `        ${JSON.stringify(key)}: ${Array.isArray(value) && typeof value[0] === 'object' ? list(value) : JSON.stringify(value)}`);
    return `${FACTS_START}\n    const FACTS = {\n${lines.join(',\n')}\n    };\n${FACTS_END}`;
}

function injectAssayFacts(data) {
    const file = path.join(ROOT, 'modules', 'interactives.js');
    const js = fs.readFileSync(file, 'utf8');
    const start = js.indexOf(FACTS_START);
    const end = js.indexOf(FACTS_END);
    if (start === -1 || end === -1) {
        throw new Error('modules/interactives.js is missing the ASSAY-FACTS:START / ASSAY-FACTS:END markers');
    }
    return js.slice(0, start) + renderAssayFacts(data) + js.slice(end + FACTS_END.length);
}

// ------------------------------------------------------------------
// index.html — the JSON-LD block only
// ------------------------------------------------------------------
const LD_START = '    <!-- JSON-LD:START — generated by scripts/build-content.js from content/profile.json. Do not edit by hand. -->';
const LD_END = '    <!-- JSON-LD:END -->';

function renderJsonLd(data) {
    const { profile } = data;
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: profile.person.name,
        jobTitle: profile.person.jobTitle,
        url: profile.links.site,
        image: `${SITE}assets/img/profile.webp`,
        email: `mailto:${profile.person.email}`,
        worksFor: {
            '@type': 'Organization',
            name: profile.currentRole.organization,
            parentOrganization: profile.currentRole.parentOrganization
        },
        address: {
            '@type': 'PostalAddress',
            addressLocality: profile.person.locality,
            addressCountry: profile.person.country
        },
        alumniOf: profile.education.map(e => ({ '@type': 'CollegeOrUniversity', name: e.institution })),
        knowsAbout: profile.knowsAbout,
        sameAs: [profile.links.github, profile.links.linkedin]
    };

    // Entities are NOT escaped: a script block of type application/ld+json is
    // raw text, and "&amp;" inside it reaches a consumer literally.
    const body = JSON.stringify(ld, null, 4)
        .split('\n')
        .map(line => `    ${line}`)
        .join('\n');

    return `${LD_START}
    <script type="application/ld+json">
${body}
    </script>
${LD_END}`;
}

function injectJsonLd(data) {
    const file = path.join(ROOT, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const start = html.indexOf(LD_START);
    const end = html.indexOf(LD_END);
    if (start === -1 || end === -1) {
        throw new Error('index.html is missing the JSON-LD:START / JSON-LD:END markers');
    }
    return html.slice(0, start) + renderJsonLd(data) + html.slice(end + LD_END.length);
}

// ------------------------------------------------------------------
// Write or check
// ------------------------------------------------------------------
function main() {
    let data;
    try {
        data = content.loadAll();
    } catch (err) {
        console.error(`\n  ${err.message}\n`);
        process.exit(1);
    }

    const outputs = [
        ['case-studies.html', renderCaseStudies(data)],
        ['research.html', renderResearch(data)],
        ['stats.html', renderStats(data)],
        ['sitemap.xml', renderSitemap(data)],
        ['voice-scripts.js', renderVoiceScripts(data)],
        ['index.html', injectJsonLd(data)],
        ['modules/interactives.js', injectAssayFacts(data)]
    ];

    const stale = [];
    outputs.forEach(([rel, next]) => {
        const file = path.join(ROOT, rel);
        const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

        if (current === next) {
            console.log(`  · ${rel.padEnd(20)} up to date`);
            return;
        }
        if (CHECK) {
            stale.push(rel);
            console.log(`  ✗ ${rel.padEnd(20)} OUT OF DATE`);
            return;
        }
        fs.writeFileSync(file, next);
        console.log(`  → ${rel.padEnd(20)} ${current === null ? 'created' : 'updated'}`);
    });

    if (CHECK && stale.length) {
        console.error(`\n  ${stale.length} generated file(s) do not match content/.`);
        console.error('  Run: npm run build:content   (and commit the result)\n');
        process.exit(1);
    }

    console.log(`\n  ${data.projects.caseStudies.length} case studies · ${data.research.outputs.length} research outputs · ${data.lenses.lenses.length} lenses · counts ${data.stats.status}\n`);
}

// Run as a script it builds; required (by tests/stats.test.js) it only lends
// its renderers, so a test can draw stats.html from fixture totals without
// writing anything.
if (require.main === module) main();

module.exports = { renderStats, EXAMPLE_PAYLOAD };
