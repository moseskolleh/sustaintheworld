#!/usr/bin/env node
// ===================================================================
// BUILD CV — the CV, printed from what the site says
//
//     npm run cv          print assets/Moses_Kolleh_Sesay_CV.pdf and
//                         write assets/cv.hash
//
// The CV was a Word export from November 2025, and it had drifted from the
// site the way the site's own pages once drifted from each other: it still
// claimed 10,000+ beneficiaries, a 95% completion rate, a 15% efficiency
// gain and Power BI, all of which the site dropped for want of a basis
// (docs/plan.md, Phase 0.4). A CV is the one page a recruiter forwards, so
// it is now printed from the same sources as the site:
//
//   content/profile.json   name, contact, the roles and their dates, the
//                          degrees, the certificates (with the issuer's
//                          verification page, when there is one)
//   content/projects.json  each case study's headline result, with the
//                          one line of its basis and whether a reader can
//                          check it, as the homepage cards show it
//   content/research.json  the public work, each with its address
//   index.html             the hero's two sentences, each role's and each
//                          degree's lines, and the toolkit with its proof:
//                          hand-authored there, and read here, so the CV
//                          says them the same way
//
// scripts/cv.html is the template: the layout and the section headings,
// nothing else. Chromium prints it (the build the smoke test uses, found
// the same way), with the site's own fonts embedded from assets/fonts, so
// nothing is fetched. Inter and Space Grotesk are variable fonts, which
// Chromium's PDF writer would embed as Type 3 outlines that some
// applicant-tracking systems cannot read; each weight is instanced to a
// static font first (subset-font, as npm run fonts:build uses it).
//
// tests/cv.test.js reads the committed PDF back (scripts/lib/pdf-text.js)
// and fails if it does not carry the profile's name, address, every role
// with its organisation and dates, every degree and every certificate, or
// if it carries a figure content/ does not have. assets/cv.hash records a
// hash of everything the CV is printed from (the model below, the template
// and this file) and of the PDF itself, so the test also fails when the
// content has moved on since the PDF was printed, or the PDF was replaced
// by hand. Run this, and commit both files.
// ===================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const content = require('./lib/content.js');

const ROOT = content.ROOT;
const TEMPLATE = path.join(__dirname, 'cv.html');
const HASH_FILE = path.join(ROOT, 'assets', 'cv.hash');
const PAGES = 2;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const bare = (url) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);
const dayName = (d) => { const [y, m, day] = d.split('-'); return `${+day} ${MONTH_NAMES[+m - 1]} ${y}`; };

// ------------------------------------------------------------------
// What the homepage says, read with the same parser the tests use
// ------------------------------------------------------------------
function homepage(html) {
    const { JSDOM } = require('jsdom');
    const doc = new JSDOM(html).window.document;
    const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    const all = (sel, root = doc) => Array.from(root.querySelectorAll(sel));
    const nameOf = (el) => { const c = el.cloneNode(true); c.querySelectorAll('.toolkit-sub').forEach(s => s.remove()); return text(c); };
    return {
        profile: ['.hero-valueprop', '.hero-description'].map(s => text(doc.querySelector(s))).filter(Boolean),
        roles: new Map(all('#experience .timeline-content').map(c => [text(c.querySelector('h3')), {
            where: text(c.querySelector('h4')),
            lines: all('ul li', c).map(text)
        }])),
        degrees: new Map(all('#education .education-card:not(.certification)').map(c => [text(c.querySelector('h3')), {
            where: text(c.querySelector('h4')),
            lines: [c.querySelector('.specialization'), ...all('ul li', c)].map(text).filter(Boolean)
        }])),
        toolkit: all('#skills .toolkit-item').map(li => ({
            name: nameOf(li.querySelector('.toolkit-name')),
            sub: text(li.querySelector('.toolkit-sub')),
            proof: text(li.querySelector('.toolkit-proof'))
        })),
        areas: all('#skills .skills-checklist li').map(text),
        frameworks: all('#skills .frameworks-list li').map(text)
    };
}

// ------------------------------------------------------------------
// The CV as data: every string it prints, and nothing else
// ------------------------------------------------------------------
function cvModel(data, indexHtml) {
    const { profile, projects, research } = data;
    const home = homepage(indexHtml);
    const site = profile.links.site;
    const absolute = (url) => (/^https?:/.test(url) ? url : new URL(url, site).href);
    const g = profile.atAGlance;

    // The at-a-glance facts the homepage strip shows, in its order; a null
    // one is not stated, so it is not printed either.
    const languages = Array.isArray(profile.languages) && profile.languages.length ? content.glanceLanguages(profile.languages) : null;
    const available = !g.availableFrom ? null : g.availableFrom === 'now' ? 'Now'
        : (([y, m, d]) => `${d ? `${+d} ` : ''}${MONTH_NAMES[+m - 1]} ${y}`)(g.availableFrom.split('-'));
    const facts = [['Seniority', g.seniority], ['Available', available], ['Languages', languages], ['Right to work', g.rightToWork]]
        .filter(([, v]) => v).map(([label, value]) => `${label}: ${value}`);

    const experience = profile.experience.map((r) => {
        const card = home.roles.get(r.title);
        if (!card) throw new Error(`index.html has no experience card titled "${r.title}" (content/profile.json)`);
        return { title: r.title, where: card.where.includes(r.organization) ? card.where : r.organization, when: r.displayDates, lines: card.lines };
    });

    const education = profile.education.map((e) => {
        const card = home.degrees.get(e.degree) || { where: e.institution, lines: [] };
        return { title: e.degree, where: card.where.includes(e.institution) ? card.where : e.institution, when: e.displayDates, lines: card.lines };
    });

    return {
        name: profile.person.name,
        jobTitle: profile.person.jobTitle,
        contact: [
            { text: profile.person.email, href: `mailto:${profile.person.email}` },
            // The homepage publishes it, so the CV, which says what the site
            // says, prints it too, unbroken across a line as the homepage's is.
            ...(profile.person.phone ? [{ text: profile.person.phone.replace(/ /g, '\u00a0'), href: `tel:${profile.person.phone.replace(/[^\d+]/g, '')}` }] : []),
            { text: bare(site), href: site },
            { text: bare(profile.links.linkedin), href: profile.links.linkedin },
            { text: bare(profile.links.github), href: profile.links.github },
            { text: `${profile.person.locality}, ${profile.person.country}` }
        ],
        openTo: `Open to ${g.targetRoles}${g.workArea && g.workArea.length ? ` — ${g.workArea.join(', ')}` : ''}`,
        facts,
        profile: home.profile,
        experience,
        projects: projects.caseStudies.map((cs) => {
            const head = cs.results[0];
            return {
                title: cs.title,
                href: `${site}case-studies.html#${cs.id}`,
                // GAIA, the method-and-tooling case, has no place to name.
                when: [cs.period, cs.location].filter(Boolean).join(' · '),
                claim: head.claim,
                brief: head.brief || '',
                check: head.verifiable ? 'Checkable from outside' : 'Not checkable from outside'
            };
        }),
        education,
        certifications: profile.certifications.map(c => ({
            name: c.name,
            issuer: c.issuer,
            when: c.displayDate,
            covered: c.covered,
            verify: c.verifyUrl ? { href: c.verifyUrl, text: bare(c.verifyUrl) } : null
        })),
        // A page of the site is named by its path (the address is in the
        // header); anything elsewhere by its whole address.
        work: research.outputs.filter(o => o.status === 'public').map(o => ({
            title: o.title,
            kind: `${o.type}, ${o.year}`,
            href: absolute(o.url),
            text: absolute(o.url).startsWith(site) ? `on the site: ${absolute(o.url).slice(site.length)}` : bare(o.url)
        })),
        skills: { toolkit: home.toolkit, areas: home.areas, frameworks: home.frameworks },
        // "Facts last verified" printed the date the record is logged as of,
        // which no one had confirmed (docs/owner-checklist.md, F5). The CV
        // says the facts were confirmed only once Moses has said so.
        footer: `Printed from ${bare(site)}, which gives the basis of every result above.` +
            (profile.meta.confirmedOn ? ` Facts last confirmed ${dayName(profile.meta.confirmedOn)}.` : '')
    };
}

// ------------------------------------------------------------------
// The model into the template
// ------------------------------------------------------------------
const link = (l) => (l.href ? `<a href="${esc(l.href)}">${esc(l.text)}</a>` : esc(l.text));
const run = (items) => items.map(i => `<span>${esc(i)}</span>`).join('');
const head = (title, when) => `<div class="entry-head"><span class="entry-title">${title}</span><span class="when">${esc(when)}</span></div>`;

function slots(m) {
    return {
        HEADER: [
            `<h1>${esc(m.name)}</h1>`,
            `<p class="role">${esc(m.jobTitle)}</p>`,
            `<p class="contact">${m.contact.map(c => `<span>${link(c)}</span>`).join('')}</p>`,
            `<p class="open">${esc(m.openTo)}</p>`,
            ...(m.facts.length ? [`<p class="open run">${run(m.facts)}</p>`] : [])
        ],
        PROFILE: m.profile.map(p => `<p>${esc(p)}</p>`),
        EXPERIENCE: m.experience.map(r => [
            '<div class="entry">',
            `    ${head(esc(r.title), r.when)}`,
            `    <div class="where">${esc(r.where)}</div>`,
            `    <ul>${r.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>`,
            '</div>'
        ].join('\n')),
        PROJECTS: m.projects.map(p => [
            '<div class="entry">',
            `    ${head(`<a href="${esc(p.href)}">${esc(p.title)}</a>`, p.when)}`,
            `    <p>${esc(sentence(p.claim))}${p.brief ? ` <span class="note">${esc(p.brief)}</span>` : ''} <span class="check">${esc(p.check)}</span></p>`,
            '</div>'
        ].join('\n')),
        EDUCATION: m.education.map(e => [
            '<div class="entry">',
            `    ${head(esc(e.title), e.when)}`,
            `    <div class="where">${esc(e.where)}</div>`,
            ...(e.lines.length ? [`    <p class="run">${run(e.lines)}</p>`] : []),
            '</div>'
        ].join('\n')),
        CERTIFICATES: m.certifications.map(c => [
            '<div class="entry">',
            `    ${head(esc(c.name), c.when)}`,
            `    <div class="where">${esc(c.issuer)}</div>`,
            `    <p>${esc(c.covered)}${c.verify ? ` <a class="url" href="${esc(c.verify.href)}">Verify: ${esc(c.verify.text)}</a>` : ''}</p>`,
            '</div>'
        ].join('\n')),
        WORK: [
            '<ul>',
            ...m.work.map(w => `    <li><a href="${esc(w.href)}">${esc(w.title)}</a> <span class="note">(${esc(w.kind)})</span> <span class="url">${esc(w.text)}</span></li>`),
            '</ul>'
        ],
        SKILLS: [
            '<dl class="skills">',
            ...m.skills.toolkit.map(t => `    <dt>${esc(t.name)}</dt><dd>${t.sub ? `${esc(t.sub)} — ` : ''}<span class="note">proof: ${esc(t.proof)}</span></dd>`),
            `    <dt>Sustainability</dt><dd class="run">${run(m.skills.areas)}</dd>`,
            `    <dt>Frameworks &amp; standards</dt><dd class="run">${run(m.skills.frameworks)}</dd>`,
            '</dl>'
        ],
        FOOTER: [`<p>${esc(m.footer)}</p>`]
    };
}

function renderCv(model, fontFaces = '') {
    let html = fs.readFileSync(TEMPLATE, 'utf8').replace('/* CV:FONTS */', fontFaces);
    Object.entries(slots(model)).forEach(([name, lines]) => {
        const marker = `<!-- CV:${name} -->`;
        const at = html.indexOf(marker);
        if (at === -1) throw new Error(`scripts/cv.html has no ${marker} slot`);
        const indent = html.slice(html.lastIndexOf('\n', at) + 1, at);
        const block = lines.join('\n').split('\n').map((l, i) => (i ? indent + l : l)).join('\n');
        html = html.slice(0, at) + block + html.slice(at + marker.length);
    });
    return html;
}

// ------------------------------------------------------------------
// What the PDF was printed from, as one hash
// ------------------------------------------------------------------
// Line endings are normalised, so a checkout that converts them to CRLF
// does not read as a CV that has fallen behind.
function sourceHash(model) {
    const text = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    return crypto.createHash('sha256')
        .update(JSON.stringify(model))
        .update(text(TEMPLATE))
        .update(text(__filename))
        .digest('hex');
}

const fileHash = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function readHashFile() {
    if (!fs.existsSync(HASH_FILE)) return {};
    const out = {};
    fs.readFileSync(HASH_FILE, 'utf8').split('\n').forEach((line) => {
        const m = line.match(/^(source|pdf)\s+([0-9a-f]{64})\b/);
        if (m) out[m[1]] = m[2];
    });
    return out;
}

function writeHashFile(source, pdf) {
    fs.writeFileSync(HASH_FILE, [
        '# Written by npm run cv (scripts/build-cv.js). tests/cv.test.js fails if either',
        '# line no longer matches: run npm run cv again and commit both files.',
        `source ${source}  content/, index.html, scripts/cv.html and scripts/build-cv.js as printed`,
        `pdf    ${pdf}  assets/Moses_Kolleh_Sesay_CV.pdf`,
        ''
    ].join('\n'));
}

// ------------------------------------------------------------------
// The site's fonts, as static faces, inline
// ------------------------------------------------------------------
async function fontFaces() {
    const subsetFont = require('subset-font');
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'fonts', 'manifest.json'), 'utf8'));
    const file = (id) => fs.readFileSync(path.join(ROOT, 'assets', 'fonts', manifest.fonts.find(f => f.id === id).file));
    // Every character the faces carry: Latin-1 and the punctuation block.
    let chars = '';
    for (let c = 0x20; c <= 0x7e; c++) chars += String.fromCharCode(c);
    for (let c = 0xa0; c <= 0xff; c++) chars += String.fromCharCode(c);
    for (let c = 0x2000; c <= 0x206f; c++) chars += String.fromCharCode(c);
    const pin = (id, wght) => subsetFont(file(id), chars, { targetFormat: 'woff2', variationAxes: { wght } });
    const faces = [
        ['Inter', 400, await pin('inter', 400)],
        ['Inter', 600, await pin('inter', 600)],
        ['Space Grotesk', 700, await pin('space-grotesk', 700)],
        ['IBM Plex Mono', 400, file('ibm-plex-mono-400')]
    ];
    return faces.map(([family, weight, buf]) =>
        `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2'); }`).join('\n        ');
}

// The Chromium smoke.js uses: $SMOKE_CHROME, Playwright's own, or the system's.
function findChromium(engine) {
    if (process.env.SMOKE_CHROME) return process.env.SMOKE_CHROME;
    try {
        const p = engine.executablePath();
        if (p && fs.existsSync(p)) return p;
    } catch (e) { /* not installed */ }
    for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
        try {
            const p = execSync(`command -v ${candidate}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (p) return p;
        } catch (e) { /* keep looking */ }
    }
    return null;
}

async function main() {
    const data = content.loadAll();
    const model = cvModel(data, fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    const html = renderCv(model, await fontFaces());

    const { chromium } = require('playwright-core');
    const executablePath = findChromium(chromium);
    if (!executablePath) throw new Error('no Chromium found (set SMOKE_CHROME=/path/to/chrome)');
    const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--disable-component-update'] });
    let pdf;
    try {
        const page = await browser.newPage();
        // Nothing leaves the machine: the fonts are inline and the template
        // links nothing it would fetch.
        await page.route('**/*', route => route.abort());
        await page.setContent(html, { waitUntil: 'load' });
        const fonts = await page.evaluate(async () => { await document.fonts.ready; return Array.from(document.fonts, f => `${f.family} ${f.weight}: ${f.status}`); });
        const missing = fonts.filter(f => !/: loaded$/.test(f));
        if (missing.length) throw new Error(`fonts did not load: ${missing.join(', ')}`);
        pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
    } finally {
        await browser.close();
    }

    const { pdfText } = require('./lib/pdf-text.js');
    const pages = pdfText(pdf).pages.length;
    if (pages !== PAGES) {
        throw new Error(`the CV comes to ${pages} page(s), not ${PAGES}: tighten scripts/cv.html, or say less on the site`);
    }
    const out = path.join(ROOT, data.profile.links.cv);
    fs.writeFileSync(out, pdf);
    writeHashFile(sourceHash(model), fileHash(pdf));
    console.log(`  → ${data.profile.links.cv}  ${PAGES} pages, ${(pdf.length / 1024).toFixed(0)} KB`);
    console.log(`  → assets/cv.hash   source ${sourceHash(model).slice(0, 12)}…`);
}

if (require.main === module) {
    main().catch((err) => { console.error(`\n  npm run cv: ${err.message}\n`); process.exit(1); });
}

module.exports = { cvModel, renderCv, sourceHash, fileHash, readHashFile, HASH_FILE, PAGES };
