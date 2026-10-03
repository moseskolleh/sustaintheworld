// The first view: who, what and how to reach him, with one thing to do.
//
// A recruiter gives a homepage seconds. The hero used to end below the fold
// on every screen (its figures at 883px of 900, the photo's caption at
// 1,019px), offered three buttons, the filled one pointing down the page
// rather than at the evidence, and sat under a nav of twelve links; the
// roles Moses is open to left out his most distinctive field.
//
// What is checked here, without a browser: the at-a-glance strip is what
// content/profile.json says and nothing more (a fact that is null is not
// shown at all), the validator refuses a stand-in written as a fact, the
// hero has one primary action, the nav has six links, the play index is
// out of the first view, and the nav lights Work for this page's projects.
// Where things land on a real screen (the figures and the caption inside
// the first 900 or 844px) is in scripts/smoke.js.
//
// Run with: node tests/firstview.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { run, ROOT, html } = require('./harness.js');
const content = require('../scripts/lib/content.js');
const { renderAtAGlance } = require('../scripts/build-content.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'profile.json'), 'utf8'));
const doc = new JSDOM(html).window.document;
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

// A profile with the strip's facts replaced, for drawing it from fixtures.
// The values are fixtures, not facts: none of them reaches a page.
const withGlance = (glance, extra = {}) => Object.assign({}, profile, extra, {
    atAGlance: Object.assign({}, profile.atAGlance, glance)
});
const strip = (p) => new JSDOM(renderAtAGlance(p)).window.document;
const facts = (d) => Array.from(d.querySelectorAll('.glance-fact')).map(f => [text(f.querySelector('dt')), text(f.querySelector('dd'))]);

// ===================================================================
// The strip is what profile.json says, between the generator's markers
// ===================================================================
{
    const START = '<!-- AT-A-GLANCE:START';
    const END = '<!-- AT-A-GLANCE:END -->';
    const start = html.indexOf(START);
    const end = html.indexOf(END);
    assert(start > -1 && end > start && html.indexOf(START, start + 1) === -1,
        'Markers: index.html has one AT-A-GLANCE:START / AT-A-GLANCE:END pair');
    const region = html.slice(html.lastIndexOf('\n', start) + 1, end + END.length);
    assert(region === renderAtAGlance(profile),
        'Markers: the region is exactly what build-content.js draws from profile.json (npm run build:check fails otherwise)');

    const hero = doc.getElementById('home');
    const glance = hero && hero.querySelector('.at-a-glance');
    const order = hero ? Array.from(hero.querySelectorAll('.hero-description, .at-a-glance, .hero-cta')).map(el => el.className.split(' ')[0]) : [];
    assert(!!glance && order.join() === 'hero-description,at-a-glance,hero-cta',
        `Place: the strip sits right under the hero's copy, before its buttons (${order.join(' → ')})`);
}

// ===================================================================
// What it says today: only what the repository already states
// ===================================================================
{
    const d = strip(profile);
    const line = text(d.querySelector('.hero-availability'));
    assert(/^Open to /.test(line) && /sustainable-AI/.test(line) && /climate-risk/.test(line) && /ESG/.test(line),
        `Today: the availability line names sustainable AI beside sustainability, climate risk and ESG ("${line}")`);
    const shown = facts(d);
    assert(shown.length === 1 && shown[0][0] === 'Location', `Today: one fact, the location; the rest wait for Moses (${shown.map(f => f[0]).join(', ')})`);
    assert(shown[0][1] === 'Amsterdam, NL',
        `Today: the location is person.locality and person.country, and only that ("${shown[0][1]}")`);
    // Where he would work is a preference, said with what he is open to.
    // Under "Location", "EU" read as where he is or may work, beside a
    // right to work the strip does not state yet.
    assert(line.endsWith(` — ${profile.atAGlance.workArea.join(', ')}`),
        `Today: the work area follows the roles on the availability line, not the location ("${line}")`);
    assert(!/TBC|TBD|to be confirmed|n\/a|\?/i.test(d.body.textContent), 'Today: no stand-in for a fact nobody has stated');
    // The value line ended "from the field to the boardroom": no case study
    // puts the work before a board (the most senior are a municipality and
    // a ministry, as partners). The first view claims no such audience.
    const value = text(doc.querySelector('.hero-valueprop'));
    assert(!!value && !/board|C-suite|\bexecutive/i.test(value), `Today: the value line claims no boardroom the case studies do not show ("${value}")`);
}

// ===================================================================
// A fact that is null is not drawn at all; a fact that is set is
// ===================================================================
{
    const none = strip(withGlance({ seniority: null, availableFrom: null, rightToWork: null, workArea: null }, { languages: null }));
    const shown = facts(none);
    assert(shown.length === 1 && shown[0][1] === 'Amsterdam, NL', `Null: seniority, start date, languages and right to work leave no label behind (${shown.map(f => f.join(': ')).join(' | ')})`);
    assert(!/—/.test(text(none.querySelector('.hero-availability'))), 'Null: no work area, no dash left after the roles');
    assert(none.querySelectorAll('dt').length === none.querySelectorAll('dd').length, 'Null: every label has its value');

    const set = strip(withGlance({
        seniority: 'Fixture seniority',
        availableFrom: '2031-02',
        rightToWork: 'Fixture <right> & work'
    }, { languages: [{ language: 'Fixturish', level: 'native' }, { language: 'Dutch', level: 'B1' }] }));
    const all = facts(set);
    assert(all.map(f => f[0]).join() === 'Seniority,Available,Languages,Right to work,Location',
        `Set: each fact appears, in the order a recruiter asks (${all.map(f => f[0]).join(', ')})`);
    const value = (label) => (all.find(f => f[0] === label) || [])[1];
    assert(value('Seniority') === 'Fixture seniority', 'Set: seniority is shown as written');
    assert(value('Available') === 'Feb 2031' && !!set.querySelector('time[datetime="2031-02"]'),
        `Set: a month reads as the site writes dates, with a machine-readable <time> ("${value('Available')}")`);
    assert(value('Languages') === 'Fixturish (native) · Dutch (B1)', `Set: languages come from profile.languages, each with its level ("${value('Languages')}")`);
    assert(value('Languages') === content.glanceLanguages([{ language: 'Fixturish', level: 'native' }, { language: 'Dutch', level: 'B1' }]),
        'Set: the languages line is the one content.js measures against its limit');
    assert(value('Right to work') === 'Fixture <right> & work' && !set.querySelector('right'), 'Set: a value is escaped, never markup');

    const now = facts(strip(withGlance({ availableFrom: 'now' })));
    assert((now.find(f => f[0] === 'Available') || [])[1] === 'Now', 'Set: "now" reads as Now');
    const day = strip(withGlance({ availableFrom: '2031-02-03' }));
    assert((facts(day).find(f => f[0] === 'Available') || [])[1] === '3 Feb 2031' && !!day.querySelector('time[datetime="2031-02-03"]'),
        'Set: a full date reads as 3 Feb 2031');
}

// ===================================================================
// The validator: no stand-ins, no misspelt keys, no impossible dates
// ===================================================================
{
    const check = content.checkAtAGlance;
    assert(check(profile.atAGlance).length === 0, `Validate: profile.json's strip passes (${check(profile.atAGlance).join('; ') || 'no problems'})`);
    const refused = (glance, why) => {
        const problems = check(glance);
        assert(problems.length > 0, `Validate: refuses ${why} (${problems[0] || 'accepted'})`);
    };
    const base = profile.atAGlance;
    refused(undefined, 'a profile with no strip at all');
    refused(Object.assign({}, base, { targetRoles: null }), 'a strip with no target roles (the availability line is written from them)');
    refused(Object.assign({}, base, { seniority: 'TBC' }), '"TBC" written as a seniority');
    refused(Object.assign({}, base, { rightToWork: 'n/a' }), '"n/a" written as a right to work');
    refused(Object.assign({}, base, { seniority: '   ' }), 'a blank seniority');
    refused(Object.assign({}, base, { availablefrom: '2031-01' }), 'a misspelt key, which would never be shown');
    refused(Object.assign({}, base, { availableFrom: 'soon' }), 'a start date that is not a date');
    refused(Object.assign({}, base, { availableFrom: '2031-13' }), 'month 13');
    refused(Object.assign({}, base, { availableFrom: '2031-02-30' }), '30 February');
    refused(Object.assign({}, base, { workArea: 'EU' }), 'a work area that is not a list');
    refused(Object.assign({}, base, { workArea: ['EU', 'TBD'] }), 'a stand-in inside the work area');
    ['now', '2031-02', '2031-02-28', null].forEach((v) => {
        const problems = check(Object.assign({}, base, { availableFrom: v }));
        assert(problems.length === 0, `Validate: accepts availableFrom ${JSON.stringify(v)} (${problems.join('; ') || 'no problems'})`);
    });

    // Short is a number: the phone's first screen has room for so much
    // (smoke.js draws the strip at these limits and checks it fits).
    const L = content.GLANCE_LIMITS;
    const of = (n) => 'x'.repeat(n);
    ['targetRoles', 'seniority', 'rightToWork'].forEach((k) => {
        assert(check(Object.assign({}, base, { [k]: of(L[k]) })).length === 0, `Validate: accepts a ${k} of ${L[k]} characters`);
        refused(Object.assign({}, base, { [k]: of(L[k] + 1) }), `a ${k} of ${L[k] + 1} characters`);
    });
    const area = [of(10), of(L.workArea - 12)];
    assert(area.join(', ').length === L.workArea && check(Object.assign({}, base, { workArea: area })).length === 0,
        `Validate: accepts a work area of ${L.workArea} characters, joined`);
    refused(Object.assign({}, base, { workArea: [of(10), of(L.workArea - 11)] }), `a work area of ${L.workArea + 1} characters, joined`);
    const langs = (n) => [{ language: 'English', level: 'C2' }, { language: of(n - 'English (C2) · '.length - ' (B1)'.length), level: 'B1' }];
    assert(content.glanceLanguages(langs(L.languages)).length === L.languages && check(base, langs(L.languages)).length === 0,
        `Validate: accepts languages that come to ${L.languages} characters in the strip`);
    const long = check(base, langs(L.languages + 1));
    assert(long.length > 0, `Validate: refuses languages that come to ${L.languages + 1} characters (${long[0] || 'accepted'})`);

    // A start date that has passed is stale, not invalid, and the build
    // cannot tell (its output is compared byte for byte, so it never reads
    // the clock). Said here, loudly, like a stale verifiedOn.
    const from = profile.atAGlance.availableFrom;
    if (from && from !== 'now' && from < new Date().toISOString().slice(0, from.length)) {
        console.log(`NOTICE: profile.json atAGlance.availableFrom is ${from}, which has passed — update it, or set it to "now"`);
    }

    // loadAll runs it: a bad strip fails the build, not just this test.
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'content.js'), 'utf8');
    assert(/problems\.push\(\.\.\.checkAtAGlance\(profile\.atAGlance, profile\.languages\)\)/.test(src), 'Validate: loadAll checks the strip and the languages it shows, so npm run build:content refuses a bad one');
}

// ===================================================================
// One primary action
// ===================================================================
{
    const hero = doc.getElementById('home');
    const primary = hero.querySelectorAll('.btn-primary');
    assert(primary.length === 1, `Action: the hero has exactly one primary button (${primary.length})`);
    const p = primary[0];
    assert(!!p && p.getAttribute('href') === 'case-studies.html' && /^See the evidence/.test(text(p)) && p.dataset.analytics === 'evidence-hero',
        `Action: it is "See the evidence", to the case studies, counted as evidence-hero (${p && p.getAttribute('href')}, "${text(p)}")`);
    const buttons = Array.from(hero.querySelectorAll('.hero-cta .btn'));
    assert(buttons.length === 2 && buttons[0] === p && buttons[1].matches('.btn-secondary[href="#contact"][data-analytics="contact-hero"]'),
        'Action: "Get in touch" is the one secondary button, after it, and keeps its counter name');
    const cv = hero.querySelector('.hero-cta a[data-analytics="cv-download-hero"]');
    assert(!!cv && !cv.classList.contains('btn') && cv.hasAttribute('download') && /Download CV/.test(text(cv)),
        'Action: Download CV is a quieter link, not a third button, and keeps its counter name');
}

// ===================================================================
// Six links in the nav, no numbers; the play index out of the first view
// ===================================================================
{
    const links = Array.from(doc.querySelectorAll('#navMenu a'));
    const said = links.map(a => `${text(a)}→${a.getAttribute('href')}`);
    assert(links.length <= 7, `Nav: ${links.length} links, down from twelve (at most seven)`);
    assert(said.join(' ') === 'Work→case-studies.html About→#about Experience→#experience Research→research.html CV→assets/Moses_Kolleh_Sesay_CV.pdf Contact→#contact',
        `Nav: Work, About, Experience, Research, CV, Contact (${said.join(', ')})`);
    assert(links.every(a => !/\d/.test(text(a))), 'Nav: no numbers in the labels');
    const filled = links.filter(a => a.classList.contains('contact-btn'));
    assert(filled.length === 1 && filled[0].getAttribute('href') === '#contact', 'Nav: Contact is the one button in it');
    // Drawn in outline, filled only on hover: filled, it was a second green
    // button on the first screen beside the hero's primary one, going
    // elsewhere (smoke.js counts every filled control there, in both themes).
    const navCss = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const resting = (navCss.match(/(?:^|\n)\s*(?:html\.light-mode )?\.nav-link\.contact-btn\s*\{[^}]*\}/g) || []);
    assert(resting.length > 0 && resting.every(r => !/background/.test(r)) &&
        /\.nav-link\.contact-btn:hover\s*\{[^}]*background: var\(--primary-green\)/.test(navCss),
        `Nav: Contact is an outline at rest, filled only on hover, so the hero's is the one filled button (${resting.map(r => r.trim().replace(/\s+/g, ' ')).join(' | ')})`);
    const bar = doc.querySelector('.nav-container');
    assert(!!bar.querySelector(':scope > #themeToggle') && !!bar.querySelector(':scope > .nav-listen #listenBtn'),
        'Nav: the theme switch and the one Listen control stay in the bar');
    const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
    assert(!/@media \(max-width: 1279px\)/.test(css) && /@media \(max-width: 899px\) \{\s*\.nav-toggle \{\s*display: flex;/.test(css),
        'Nav: the menu button takes over below 900px, not 1280px: six links fit where twelve did not');

    const main = doc.getElementById('main');
    const index = main.querySelector(':scope > .play-index');
    assert(!!index && main.firstElementChild !== index && !doc.getElementById('home').contains(index),
        'Play index: no longer the first thing after the hero');
    assert(!!index && index.nextElementSibling === doc.getElementById('contact'), 'Play index: it sits just before Contact');
    assert(!!index && index.querySelectorAll('a').length === 5, 'Play index: still five ways to try something');
    // A count is of the list, not the site: "five things on this site" was
    // untrue once the flood slider and the calculator had pages of their own.
    const NUM = { five: 5, six: 6, seven: 7, eight: 8 };
    const label = index ? index.querySelector('.play-index-label').textContent.trim() : '';
    const counted = (label.match(/^(\w+) things\b/i) || [])[1];
    assert(!!counted && NUM[counted.toLowerCase()] === index.querySelectorAll('a').length && !/\bsite\b/i.test(label),
        `Play index: its label counts the links it has, and makes no claim about the whole site ("${label}")`);
}

// ===================================================================
// A laptop's window: shorter than its screen
// ===================================================================
// 1366x768 leaves about 1366x657 inside a browser, and with a fixed 104px
// above the name the figures sat wholly below it. On a short desktop the
// description follows the figures, as on a phone; smoke.js checks where
// the figures land at 1366x657 and 1280x720.
{
    const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // The rule the phone has, its media query shared with the laptop's.
    const blocks = [...css.matchAll(/@media ([^{]*)\{([\s\S]*?)\n\}/g)]
        .map(([, query, body]) => ({ tall: +((query.match(/\(min-width: 900px\) and \(max-height: (\d+)px\)/) || [])[1] || 0), body }))
        .filter(b => b.tall && /\.hero-content\s*\{[^}]*flex-direction:\s*column/.test(b.body) && /\.hero-description\s*\{[^}]*order:\s*1/.test(b.body));
    const tall = blocks.length ? blocks[0].tall : 0;
    assert(tall >= 768 && tall < 900,
        `Short desktop: below ${tall || '?'}px tall (a laptop's window, not the plan's 1440x900), the description follows the figures`);
}

// ===================================================================
// Scroll-spy: the nav lights the part of the page the reader is in
// ===================================================================
{
    const TOPS = { home: 0, journey: 900, about: 2000, experience: 3000, projects: 4000, ecoprompt: 6000, skills: 7000, education: 8000, notes: 9000, contact: 10000 };
    const frames = [];
    let y = 0;
    const { window, errors } = run('dark', {
        before: (w) => {
            w.console.log = () => {};
            w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
            Object.defineProperty(w.HTMLElement.prototype, 'offsetTop', { configurable: true, get() { return TOPS[this.id] || 0; } });
            Object.defineProperty(w, 'pageYOffset', { configurable: true, get: () => y });
        }
    });
    const d = window.document;
    const lit = (at) => {
        y = at;
        window.dispatchEvent(new window.Event('scroll'));
        frames.splice(0).forEach(fn => fn(0));
        return Array.from(d.querySelectorAll('#navMenu .nav-link.active')).map(a => text(a)).join() || 'none';
    };
    assert(lit(TOPS.about + 100) === 'About', `Spy: in About, About is lit (${lit(TOPS.about + 100)})`);
    assert(lit(TOPS.experience + 100) === 'Experience', 'Spy: in Experience, Experience is lit');
    assert(lit(TOPS.projects + 100) === 'Work', `Spy: in this page's projects, Work is lit though it leads to the case studies (${lit(TOPS.projects + 100)})`);
    assert(lit(TOPS.ecoprompt + 100) === 'none', 'Spy: in a section with no link of its own, nothing is lit');
    assert(lit(TOPS.contact + 100) === 'Contact', 'Spy: in Contact, Contact is lit');
    assert(lit(0) === 'none', 'Spy: on the hero, nothing is lit — and CV and Research never are');
    assert(errors.length === 0, `Spy: no errors (${errors.map(String).join('; ') || 'none'})`);
    window.close();
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
process.exit(0);
