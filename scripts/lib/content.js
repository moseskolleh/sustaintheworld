'use strict';
// ===================================================================
// CONTENT — load, validate and share everything under content/
//
// One place that knows what the site is about, imported by the generator
// (scripts/build-content.js) and by the tests. The validation here is the
// interesting part: it is what stops the content model becoming another
// place where unsupported claims can accumulate.
//
// THE THREE RULES
//
//   1. Every result carries a `basis`. A number without one is a boast, and
//      the whole point of this rebuild was that the site asserted things it
//      could not show its working for.
//
//   2. Every artifact and output declares a `status`. Only `public` may carry
//      a url; anything else must say who holds it. "I built a thing" means
//      little without saying whether a reader can see it.
//
//   3. Every url must resolve — to a file in this repository, or to a host
//      the repository already trusts (see TRUSTED_HOSTS). This is the rule
//      that makes an invented link fail the build rather than ship.
//
// Rule 3 matters more than it looks. A plausible-looking DOI or repository
// URL is the easiest thing in the world to write and the hardest thing for a
// reader to check. Here, writing one fails `npm test`.
// ===================================================================

const fs = require('fs');
const path = require('path');
const figures = require('./claims.js');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content');

// Hosts this repository already links to elsewhere. Adding one is a decision,
// not an accident — which is the point.
const TRUSTED_HOSTS = [
    'github.com',
    'moseskolleh.github.io',
    'linkedin.com',
    'www.linkedin.com',
    // Where two issuers publish a certificate's verification page (see
    // VERIFY_HOSTS below): Coursera for the Google certificate, and the
    // Corporate Finance Institute's own credential site.
    'coursera.org',
    'www.coursera.org',
    'credentials.corporatefinanceinstitute.com',
    'sustainablewebdesign.org',
    'httparchive.org'
];

const STATUSES = ['public', 'on-request', 'internal', 'planned'];

// A certification's verifyUrl (content/profile.json) has to be the issuer's
// own page for that certificate, which a reader can trust where they would
// not trust a screenshot. A trusted host is not enough: a GitHub or LinkedIn
// page is Moses saying so, not the issuer. Masterschool's and the UN System
// Staff College's hosts join this list with the first URL from them, once
// someone has opened it.
const VERIFY_HOSTS = ['coursera.org', 'www.coursera.org', 'credentials.corporatefinanceinstitute.com'];

function load(name) {
    const file = path.join(CONTENT_DIR, `${name}.json`);
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
        throw new Error(`content/${name}.json could not be read: ${err.message}`);
    }
}

/** A repo-relative path for a url, or null when it points off-site. */
function localPath(url) {
    if (!url) return null;
    if (/^(https?:)?\/\//i.test(url) || /^(mailto:|tel:|data:)/i.test(url)) return null;
    return url.split('#')[0].split('?')[0] || null;
}

function urlProblem(url) {
    if (!url) return 'is empty';

    const local = localPath(url);
    if (local !== null) {
        return fs.existsSync(path.join(ROOT, local)) ? null : `points at ${local}, which is not in the repository`;
    }

    let host;
    try {
        host = new URL(url).host;
    } catch (err) {
        return `is not a valid URL`;
    }
    if (!TRUSTED_HOSTS.includes(host)) {
        return `points at ${host}, which is not a host this repository already uses — ` +
               `add it to TRUSTED_HOSTS in scripts/lib/content.js only if you have checked the link yourself`;
    }
    return null;
}

/**
 * Validates one thing that claims to exist somewhere (an artifact or a
 * research output). Returns a list of human-readable problems.
 */
function checkAvailability(label, entry) {
    const problems = [];

    if (!entry.status) {
        problems.push(`${label}: no status — must be one of ${STATUSES.join(', ')}`);
        return problems;
    }
    if (!STATUSES.includes(entry.status)) {
        problems.push(`${label}: status "${entry.status}" is not one of ${STATUSES.join(', ')}`);
    }

    if (entry.status === 'public') {
        if (!entry.url) {
            problems.push(`${label}: is marked public but has no url — if a reader cannot open it, it is not public`);
        } else {
            const bad = urlProblem(entry.url);
            if (bad) problems.push(`${label}: url ${bad}`);
        }
    } else if (entry.url) {
        problems.push(`${label}: is marked "${entry.status}" but carries a url — that reads as available when it is not`);
    }

    if (entry.status === 'internal' && !entry.heldBy) {
        problems.push(`${label}: is internal but does not say who holds it`);
    }

    return problems;
}

// The interactives a case study can host on case-studies.html, each drawn
// by modules/dossier.js into the host the generator writes for it.
const WIDGETS = ['borehole', 'flood'];

// Whether a case study has a card on the homepage (and so a line in the
// field report, its text edition). Every one does unless `homepageCard` is
// false. The homepage shows six projects, each with a photo and a result
// from the work itself; GAIA, the ESG case study, is method and tooling
// with no photo, and a seventh card would start a third row on a desktop
// page held to a length budget (scripts/check-budget.js). A case study
// kept off it is still on case-studies.html in every lens, and leads its own.
const onHomepage = (cs) => cs.homepageCard !== false;

/**
 * What the homepage's teaser card needs from a case study: the lines it
 * prints, a headline result with a one-line basis, and one photo a reader
 * can be shown at the size it is drawn. Returns problems, like the rest.
 */
function checkCard(at, cs) {
    const problems = [];
    ['subtitle', 'location'].forEach((field) => {
        if (!cs[field]) problems.push(`${at}: missing ${field} (the homepage card prints it)`);
    });
    if (!Array.isArray(cs.tags) || !cs.tags.length || !cs.tags.every(t => typeof t === 'string' && t.trim())) {
        problems.push(`${at}: tags must be a list of tools and topics (the homepage card shows them, the Assay reads them)`);
    }

    // The first result is the headline. Its brief stands in for the basis
    // where there is no room for it, so it has to be there, and short.
    const headline = (cs.results || [])[0];
    if (headline && !(typeof headline.brief === 'string' && headline.brief.trim())) {
        problems.push(`${at}: the first result is the homepage headline and needs a one-line brief of its basis`);
    } else if (headline && headline.brief.length > 120) {
        problems.push(`${at}: the headline's brief is ${headline.brief.length} characters; one line is 120 at most`);
    }

    const p = cs.photo;
    if (!p || typeof p !== 'object') {
        problems.push(`${at}: no photo for the homepage card`);
    } else {
        ['src', 'thumb'].forEach((k) => {
            const bad = typeof p[k] === 'string' && localPath(p[k]) === p[k] ? urlProblem(p[k]) : 'is not a file in this repository';
            if (bad) problems.push(`${at}: photo.${k} ${bad}`);
        });
        if (!(typeof p.alt === 'string' && p.alt.trim())) problems.push(`${at}: the photo has no alt text`);
        if (!(Number.isInteger(p.width) && p.width > 0 && Number.isInteger(p.height) && p.height > 0)) {
            problems.push(`${at}: the photo needs its intrinsic width and height, so nothing shifts as it arrives`);
        }
    }

    if (cs.widget !== undefined && !WIDGETS.includes(cs.widget)) {
        problems.push(`${at}: widget "${cs.widget}" is not one of ${WIDGETS.join(', ')}`);
    }
    return problems;
}

// ------------------------------------------------------------------
// Findings and recommendations — what the work found, not only what it did
//
// A case study that stops at its results says what was produced; a reader
// hiring for judgement wants what it showed, and what to do about it. So
// every case study carries `findings`: one to four short entries, each a
// "finding" (what the work showed) or a "recommendation" (what it says to
// do), at least one of them a finding. Two to four is the aim; one where
// the evidence is thin, because a padded list is a list of guesses. Each
// says it in a sentence or two, and may carry a `basis` as a result does;
// one with a figure in it must, since a number without one is a boast. The
// shape is closed: a misspelt "basis" would otherwise drop the evidence
// from the page without a word.
// ------------------------------------------------------------------
const FINDING_KINDS = ['finding', 'recommendation'];
const FINDING_KEYS = ['kind', 'text', 'basis'];
const FINDINGS_MAX = 4;
const FINDING_LIMIT = 240;   // characters: a short bullet, not a paragraph

function checkFindings(at, cs) {
    const list = cs.findings;
    if (!Array.isArray(list) || !list.length) {
        return [`${at}: no findings — say what the work found or recommends, not only what it did (one to ${FINDINGS_MAX} entries)`];
    }
    const problems = [];
    if (list.length > FINDINGS_MAX) problems.push(`${at}: ${list.length} findings; ${FINDINGS_MAX} at most, each a short bullet`);
    list.forEach((f, i) => {
        const where = `${at}, finding ${i + 1}`;
        if (!f || typeof f !== 'object' || Array.isArray(f)) { problems.push(`${where}: is not a finding`); return; }
        Object.keys(f).filter(k => !FINDING_KEYS.includes(k)).forEach(k => problems.push(`${where}: unknown field "${k}"`));
        if (!FINDING_KINDS.includes(f.kind)) problems.push(`${where}: kind "${f.kind}" is not one of ${FINDING_KINDS.join(', ')}`);
        if (!(typeof f.text === 'string' && f.text.trim())) problems.push(`${where}: no text`);
        else if (f.text.length > FINDING_LIMIT) problems.push(`${where}: ${f.text.length} characters; a finding is a short bullet, ${FINDING_LIMIT} at most`);
        if (f.basis !== undefined && !(typeof f.basis === 'string' && f.basis.trim())) problems.push(`${where}: basis is empty — leave it out, or say where the finding comes from`);
        if (/\d/.test(f.text || '') && f.basis === undefined) problems.push(`${where}: has a figure in it and no basis — say where it comes from`);
    });
    if (!list.some(f => f && f.kind === 'finding')) problems.push(`${at}: only recommendations — say at least one thing the work found`);
    return problems;
}

// How a photo in a case study's gallery may be drawn: wider than the rest,
// or not cropped to a landscape box (the hints the homepage dossiers had).
const PHOTO_LAYOUTS = ['wide', 'tall'];
const PHOTO_KEYS = ['src', 'thumb', 'width', 'height', 'layout', 'alt', 'caption', 'fullCaption'];

/**
 * A case study's photos (optional): each a file in this repository at a
 * declared size, with alt text and a caption. The captions are evidence,
 * so none may be blank, and a misspelt field is refused rather than
 * silently dropped from the page.
 */
function checkGallery(at, cs) {
    if (cs.gallery === undefined) return [];
    if (!Array.isArray(cs.gallery) || !cs.gallery.length) return [`${at}: gallery must be a list of photos (leave it out for none)`];
    const problems = [];
    const seen = new Set();
    cs.gallery.forEach((p, i) => {
        const where = `${at}, photo ${i + 1}`;
        if (!p || typeof p !== 'object') { problems.push(`${where}: is not a photo`); return; }
        Object.keys(p).filter(k => !PHOTO_KEYS.includes(k)).forEach(k => problems.push(`${where}: unknown field "${k}"`));
        ['src'].concat(p.thumb === undefined ? [] : ['thumb']).forEach((k) => {
            const bad = typeof p[k] === 'string' && localPath(p[k]) === p[k] ? urlProblem(p[k]) : 'is not a file in this repository';
            if (bad) problems.push(`${where}: ${k} ${bad}`);
        });
        if (seen.has(p.src)) problems.push(`${where}: ${p.src} is already in this gallery`);
        seen.add(p.src);
        if (!(Number.isInteger(p.width) && p.width > 0 && Number.isInteger(p.height) && p.height > 0)) {
            problems.push(`${where}: needs its intrinsic width and height, so nothing shifts as it arrives`);
        }
        ['alt', 'caption', 'fullCaption'].forEach((k) => {
            if (!(typeof p[k] === 'string' && p[k].trim())) problems.push(`${where}: no ${k === 'alt' ? 'alt text' : k}`);
        });
        if (p.layout !== undefined && !PHOTO_LAYOUTS.includes(p.layout)) {
            problems.push(`${where}: layout "${p.layout}" is not one of ${PHOTO_LAYOUTS.join(', ')}`);
        }
    });
    return problems;
}

// A language level the Assay can compare with what a job ad asks for.
// "Good" or "fluent" means different things to different readers; a CEFR
// level (or "native") means the same thing to all of them.
const LANGUAGE_LEVEL = /^(?:[ABC][12]|native)$/;

/**
 * profile.languages is optional: absent or null, the Assay treats every
 * non-English language an ad asks for as a gap. Present, each entry must
 * say which language and at what level, or it would be a claim the Assay
 * cannot weigh.
 */
function checkLanguages(languages) {
    if (languages === undefined || languages === null) return [];
    if (!Array.isArray(languages)) return ['profile: languages must be a list of { "language", "level" } entries, or null'];
    const problems = [];
    languages.forEach((l, i) => {
        const at = `profile: language ${i + 1}${l && l.language ? ` ("${l.language}")` : ''}`;
        if (!l || typeof l.language !== 'string' || !l.language.trim()) problems.push(`${at}: no language named`);
        if (!l || !LANGUAGE_LEVEL.test(String(l.level))) {
            problems.push(`${at}: level "${l && l.level}" is not a CEFR level (A1–C2) or "native"`);
        }
    });
    return problems;
}

// ------------------------------------------------------------------
// profile.atAGlance — the strip under the homepage hero
//
// The first thing a recruiter checks, so the first place a guess would do
// harm. The shape is closed: a misspelt key ("availablefrom") would
// otherwise be skipped as unknown and the fact silently never shown. A
// fact Moses has not stated is null, and the strip leaves it out; a
// stand-in written as a value ("TBC", "n/a", "?") is refused, because on
// the page it would read as an answer.
// ------------------------------------------------------------------
const GLANCE_KEYS = ['targetRoles', 'workArea', 'seniority', 'availableFrom', 'rightToWork'];
const PLACEHOLDER = /^\s*(?:tbc|tbd|to be (?:confirmed|decided)|n\/?a|todo|unknown|\?+|-+|…|\.\.\.)\s*$/i;
const AVAILABLE_FROM = /^(?:now|(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?)$/;

// How long each fact may be. On a phone the first screen holds the strip,
// the buttons and the hero's four figures, and filled in a line per fact,
// the strip pushed the figures off a 390x844 screen. So "short" is a
// number here, and smoke.js draws the strip with every fact at its longest
// and checks that it all still fits. Raise one only with that check passing.
const GLANCE_LIMITS = {
    targetRoles: 80,    // characters
    workArea: 32,       // characters, the phrases joined by ", "
    seniority: 32,
    rightToWork: 48,
    languages: 80       // characters of profile.languages as the strip
};                      // writes it: "English (C2) · Dutch (B1)"

// The languages line as the strip shows it (build-content.js writes the
// same words, escaped): every language, none left out to make room.
const glanceLanguages = (languages) => languages.map(l => `${l.language} (${l.level})`).join(' · ');

function checkAtAGlance(glance, languages) {
    const at = 'profile: atAGlance';
    if (!glance || typeof glance !== 'object' || Array.isArray(glance)) return [`${at} is missing — the hero's availability line is written from it`];
    const problems = [];
    Object.keys(glance).filter(k => !k.startsWith('$') && !GLANCE_KEYS.includes(k))
        .forEach(k => problems.push(`${at}.${k} is not a fact the strip knows (${GLANCE_KEYS.join(', ')}) — misspelt, it would never be shown`));

    const phrase = (key, required) => {
        const v = glance[key];
        if (v === null || v === undefined) {
            if (required) problems.push(`${at}.${key} is required`);
            return;
        }
        if (typeof v !== 'string' || !v.trim()) problems.push(`${at}.${key} must be a phrase, or null until it is known`);
        else if (PLACEHOLDER.test(v)) problems.push(`${at}.${key} is "${v}" — leave it null until it is known; the strip then leaves it out`);
        else if (v.length > GLANCE_LIMITS[key]) problems.push(`${at}.${key} is ${v.length} characters; the first screen has room for ${GLANCE_LIMITS[key]}`);
    };
    phrase('targetRoles', true);
    ['seniority', 'rightToWork'].forEach(k => phrase(k, false));
    // Where he would work, after the roles on the availability line: a
    // list of short phrases.
    const area = glance.workArea;
    if (area !== null && area !== undefined) {
        if (!Array.isArray(area) || !area.length || area.some(a => typeof a !== 'string' || !a.trim() || PLACEHOLDER.test(a))) {
            problems.push(`${at}.workArea must be a list of short phrases, or null`);
        } else if (area.join(', ').length > GLANCE_LIMITS.workArea) {
            problems.push(`${at}.workArea is ${area.join(', ').length} characters; the first screen has room for ${GLANCE_LIMITS.workArea}`);
        }
    }
    // profile.languages is checked for shape by checkLanguages; here, only
    // for whether the strip has room for all of it.
    if (Array.isArray(languages) && languages.every(l => l && typeof l === 'object')) {
        const line = glanceLanguages(languages);
        if (line.length > GLANCE_LIMITS.languages) {
            problems.push(`profile: the languages come to ${line.length} characters in the at-a-glance strip ("${line}"); the first screen has room for ${GLANCE_LIMITS.languages}`);
        }
    }

    const from = glance.availableFrom;
    if (from !== null && from !== undefined) {
        const m = typeof from === 'string' && from.match(AVAILABLE_FROM);
        // 2026-02-30 matches the pattern; only a real day may pass.
        const real = m && (!m[3] || new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDate() === +m[3]);
        if (!real) problems.push(`${at}.availableFrom "${from}" is not "now" or a date as YYYY-MM or YYYY-MM-DD`);
    }
    return problems;
}

// ------------------------------------------------------------------
// content/stats.json — what the visit counter publishes
//
// scripts/fetch-stats.js writes this file from the counter's daily totals,
// and stats.html is built from it. The promise stats.html makes is that no
// count under 5 is ever published, not even one a reader could work out by
// subtracting the figures around it from a total, and that no single day's
// count and no daily row ever reaches the repository. So that promise is
// checked here, on every build, rather than trusted to the script that
// wrote the file: a hand-edit, or a bug in the fetcher, fails `npm test`
// instead of shipping.
//
// The shape is closed. Any property the validator does not know is refused,
// which is what keeps a "rows" array — or any other raw detail — out.
//
// Problems name the field and the rule, never the value: the fetcher prints
// them in a public Action log, and an unsuppressed count is exactly the thing
// that must not appear there.
// ------------------------------------------------------------------
/**
 * The counter's rules, as its code sets them: how many counts a minute the
 * endpoint takes, how long one waits for the sheet, the suppression
 * threshold, how many referring sites are named, how many features a page
 * view sends and where the window-width classes break. stats.html states
 * each, and printed them typed in: the page could say 30 a minute of an
 * endpoint set to 20 and nothing would notice. renderStats prints them from
 * here, marked, and tests/claims.test.js holds each mark to this. A
 * constant renamed or rewritten so it cannot be read fails the build.
 */
function counterRules() {
    const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const take = (rel, re, what) => {
        const m = read(rel).match(re);
        if (!m) throw new Error(`${rel}: ${what} cannot be read (${re}); stats.html prints it from there`);
        return m.slice(1).map(Number);
    };
    const [perMinute] = take('google-apps-script/Code.gs', /\bvar COUNT_MAX_PER_MINUTE = (\d+);/, 'COUNT_MAX_PER_MINUTE');
    const [lockMs] = take('google-apps-script/Code.gs', /\bvar COUNT_LOCK_TIMEOUT_MS = (\d+);/, 'COUNT_LOCK_TIMEOUT_MS');
    const [suppressBelow] = take('scripts/fetch-stats.js', /\bconst SUPPRESS_BELOW = (\d+);/, 'SUPPRESS_BELOW');
    const [referrersListed] = take('scripts/fetch-stats.js', /\bconst REFERRERS_LISTED = (\d+);/, 'REFERRERS_LISTED');
    const [featuresMax] = take('count.js', /features\.length < (\d+)/, 'the cap on features');
    const [vpSmall, vpLarge] = take('count.js', /vp: w < (\d+) \? 's' : w < (\d+) \? 'm' : 'l'/, 'the window-width classes');
    return { perMinute, lockSeconds: lockMs / 1000, suppressBelow, referrersListed, featuresMax, vpSmall, vpMediumMax: vpLarge - 1, vpLarge };
}

const STATS_STATUSES = ['not-collecting', 'collecting'];
const STATS_MIN_SUPPRESSION = 5;
const STATS_HELD = 'held';
const STATS_COUNTS = ['visits', 'contact', 'cvDownloads', 'lensVisits', 'briefUses'];
const STATS_BREAKDOWNS = ['page', 'lens', 'vp', 'ref', 'feature', 'deepest'];
const STATS_KEYS = ['$comment', 'v', 'status', 'asOf', 'suppressBelow', 'period', 'week', 'briefLive',
    'headline', 'breakdown', 'bytes', 'weeks'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const dayOfWeek = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();    // 0 is Sunday
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

/**
 * Which hidden figures can be worked out from the shown ones. Each sum is
 * { cells: [total, ...parts] }: the total is the parts added up, as page
 * views are the pages' views added up. `known` maps each shown cell to its
 * number. A sum with exactly one cell not yet known gives that one away,
 * and what it gives away can give away another in the next sum, so this
 * repeats until nothing more comes out. Returns what came out, in order:
 * { cell, value, sum }.
 *
 * scripts/fetch-stats.js runs it on the true counts to decide what else to
 * hide; checkStats() below runs it on the published file to prove that the
 * result holds.
 */
function peel(sums, known) {
    const found = [];
    for (let more = true; more;) {
        more = false;
        sums.forEach((sum) => {
            const unknown = sum.cells.filter(c => !known.has(c));
            if (unknown.length !== 1) return;
            const [cell] = unknown;
            const [total, ...parts] = sum.cells;
            const rest = parts.reduce((n, c) => n + (c === cell ? 0 : known.get(c)), 0);
            const value = cell === total ? rest : known.get(total) - rest;
            known.set(cell, value);
            found.push({ cell, value, sum });
            more = true;
        });
    }
    return found;
}

/**
 * The sums a reader of stats.html can do, as figures of the published file.
 * Every page view has exactly one page and one window class, so each of
 * those tables adds up to the page views; the known lenses add up to the
 * lens-link visits; and while the week-by-week table reaches back to the
 * start, its lines add up to all time. Last week's headline and the newest
 * week-by-week line are the same figures, as are CV downloads and the
 * feature row "cv-download", and Brief uses and "brief-run".
 */
function publishedSums(stats) {
    const fig = (v) => ({ v: v === undefined ? null : v });
    const counts = (h) => Object.fromEntries(STATS_COUNTS.map(k => [k, fig(h[k])]));
    const all = counts(stats.headline.all);
    const week = counts(stats.headline.week);
    const rows = (metric, keep = () => true) => (stats.breakdown[metric] || []).filter(r => keep(r.key));
    const sums = [];
    [['all time', 'all', all], ['last week', 'week', week]].forEach(([when, col, h]) => {
        const cells = (metric, keep) => rows(metric, keep).map(r => fig(r[col]));
        sums.push({ label: `page views by page (${when})`, cells: [h.visits, ...cells('page')] });
        sums.push({ label: `page views by window width (${when})`, cells: [h.visits, ...cells('vp')] });
        sums.push({ label: `page views by role lens (${when})`, cells: [h.lensVisits, ...cells('lens', k => k !== 'other')] });
        [['cv-download', 'cvDownloads'], ['brief-run', 'briefUses']].forEach(([key, name]) => {
            const same = rows('feature', k => k === key)[0];
            if (same) sums.push({ label: `${name} and the "${key}" feature (${when})`, cells: [h[name], fig(same[col])] });
        });
    });
    // All time is last week plus everything before it. What came before is
    // never shown, but it is a count all the same: 12 page views all time
    // and 9 last week are 3 before it. `earlier` stands for that count.
    const earlier = () => ({ v: 'earlier', earlier: true });
    STATS_BREAKDOWNS.forEach((metric) => {
        rows(metric).forEach((r) => {
            sums.push({ label: `the ${metric} row "${r.key}", all time less last week`, cells: [fig(r.all), fig(r.week), earlier()] });
        });
    });
    const weeks = stats.weeks;
    const reachBack = weeks.length && weeks[weeks.length - 1].start === stats.period.first;
    STATS_COUNTS.forEach((k) => {
        const lines = [week[k], ...weeks.slice(1).map(w => fig(w[k]))];
        sums.push(reachBack
            ? { label: `the week-by-week ${k} against all time`, cells: [all[k], ...lines] }
            : { label: `the week-by-week ${k} and the weeks before them`, cells: [all[k], ...lines, earlier()] });
    });
    // A figure with nothing to give (null) makes a sum no reader can do.
    return sums.filter(s => s.cells.length > 1 && s.cells.every(c => c.v !== null));
}

const REF_HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function checkStats(stats) {
    const at = 'content/stats.json';
    if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return [`${at}: is not an object`];

    const problems = [];
    const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
    const onlyKeys = (o, allowed, where) => {
        Object.keys(o).filter(k => !allowed.includes(k))
            .forEach(k => problems.push(`${at}: ${where} has a field "${k}" the page does not publish — only suppressed totals belong here`));
    };
    const date = (v, where) => {
        if (typeof v !== 'string' || !ISO_DATE.test(v)) problems.push(`${at}: ${where} is not a YYYY-MM-DD date`);
    };

    onlyKeys(stats, STATS_KEYS, 'the file');
    if (stats.v !== 1) problems.push(`${at}: v must be 1`);
    if (!STATS_STATUSES.includes(stats.status)) problems.push(`${at}: status must be one of ${STATS_STATUSES.join(', ')}`);

    const floor = stats.suppressBelow;
    if (!Number.isInteger(floor) || floor < STATS_MIN_SUPPRESSION) {
        problems.push(`${at}: suppressBelow must be a whole number of at least ${STATS_MIN_SUPPRESSION}`);
        return problems;            // every count check below depends on it
    }
    const small = `<${floor}`;
    // "held" is a count of 5 or more hidden so that one under 5 beside it
    // cannot be worked out by subtraction (scripts/fetch-stats.js, protect).
    const count = (v, where) => {
        if (v === null || v === small || v === STATS_HELD || (Number.isInteger(v) && v >= floor)) return;
        problems.push(`${at}: ${where} is neither "${small}", "${STATS_HELD}" nor a whole number of at least ${floor} — a count under ${floor} must never be published`);
    };
    const share = (v, where) => {
        if (v === null || (typeof v === 'number' && v >= 0 && v <= 1)) return;
        problems.push(`${at}: ${where} must be null or a fraction between 0 and 1`);
    };
    const headline = (h, where, extra = []) => {
        if (h === null) return;
        if (!isObj(h)) { problems.push(`${at}: ${where} is not an object`); return; }
        onlyKeys(h, STATS_COUNTS.concat('contactShare', extra), where);
        STATS_COUNTS.forEach(k => count(h[k] === undefined ? null : h[k], `${where}.${k}`));
        share(h.contactShare === undefined ? null : h.contactShare, `${where}.contactShare`);
    };

    // The empty state is honest only if it carries no numbers at all.
    if (stats.status === 'not-collecting') {
        ['asOf', 'period', 'week', 'headline', 'breakdown', 'bytes'].forEach((k) => {
            if (stats[k] !== null) problems.push(`${at}: status is "not-collecting" but ${k} is not null`);
        });
        if (!Array.isArray(stats.weeks) || stats.weeks.length) problems.push(`${at}: status is "not-collecting" but weeks is not empty`);
        return problems;
    }

    date(stats.asOf, 'asOf');
    if (!isObj(stats.period)) {
        problems.push(`${at}: period is missing`);
    } else {
        onlyKeys(stats.period, ['first', 'last', 'days'], 'period');
        date(stats.period.first, 'period.first');
        date(stats.period.last, 'period.last');
        if (stats.period.first > stats.period.last) problems.push(`${at}: period.first is after period.last`);
        if (!Number.isInteger(stats.period.days) || stats.period.days < 1) problems.push(`${at}: period.days is not a positive whole number`);
    }
    // Whole weeks, Monday to Sunday, and none of them still running: a
    // part week, or all time running on into today, would let a reader take
    // the weeks from all time and be left with a single day's count.
    if (!isObj(stats.week)) {
        problems.push(`${at}: week is missing — nothing is published until the first full week, Monday to Sunday, has ended`);
    } else {
        onlyKeys(stats.week, ['start', 'end'], 'week');
        date(stats.week.start, 'week.start');
        date(stats.week.end, 'week.end');
        if (ISO_DATE.test(stats.week.start) && (dayOfWeek(stats.week.start) !== 1 || stats.week.end !== addDays(stats.week.start, 6))) {
            problems.push(`${at}: week is not a Monday-to-Sunday week`);
        }
        if (isObj(stats.period) && stats.period.last !== stats.week.end) problems.push(`${at}: period.last is not the end of the last complete week`);
    }
    if (isObj(stats.period) && ISO_DATE.test(stats.period.first) && ISO_DATE.test(stats.period.last)) {
        if (dayOfWeek(stats.period.first) !== 1 || dayOfWeek(stats.period.last) !== 0) problems.push(`${at}: period does not run from a Monday to a Sunday`);
        if (stats.period.days !== daysBetween(stats.period.first, stats.period.last)) problems.push(`${at}: period.days does not match period.first and period.last`);
        if (!(stats.period.last < stats.asOf)) problems.push(`${at}: period.last is not before asOf — the day the file was made is still being counted`);
    }
    if (typeof stats.briefLive !== 'boolean') problems.push(`${at}: briefLive must be true or false`);

    // A weekly figure needs a week, and a week needs its figures: the page
    // reads one to label the other.
    const noWeek = !isObj(stats.week);
    if (isObj(stats.headline) && (stats.headline.week === null) !== noWeek) {
        problems.push(`${at}: headline.week must be present exactly when week is`);
    }
    if (isObj(stats.bytes) && noWeek && stats.bytes.week !== null) {
        problems.push(`${at}: bytes.week is given, but there is no week`);
    }
    if (isObj(stats.breakdown) && noWeek && STATS_BREAKDOWNS.some(m => (stats.breakdown[m] || []).some(r => r.week !== null))) {
        problems.push(`${at}: a breakdown has weekly figures, but there is no week`);
    }

    if (!isObj(stats.headline)) {
        problems.push(`${at}: headline is missing`);
    } else {
        onlyKeys(stats.headline, ['week', 'all'], 'headline');
        headline(stats.headline.week, 'headline.week');
        headline(stats.headline.all, 'headline.all');
        if (stats.headline.all === null) problems.push(`${at}: headline.all is missing`);
    }

    if (!isObj(stats.breakdown)) {
        problems.push(`${at}: breakdown is missing`);
    } else {
        onlyKeys(stats.breakdown, STATS_BREAKDOWNS, 'breakdown');
        STATS_BREAKDOWNS.forEach((metric) => {
            const rows = stats.breakdown[metric];
            if (!Array.isArray(rows)) { problems.push(`${at}: breakdown.${metric} is not a list`); return; }
            rows.forEach((r, i) => {
                const where = `breakdown.${metric}[${i}]`;
                if (!isObj(r)) { problems.push(`${at}: ${where} is not an object`); return; }
                onlyKeys(r, ['key', 'week', 'all'], where);
                if (typeof r.key !== 'string') problems.push(`${at}: ${where}.key is not a string`);
                // A referrer is published as a bare host, or not at all.
                if (metric === 'ref' && !(r.key === 'other' || REF_HOST.test(r.key))) {
                    problems.push(`${at}: ${where}.key is not a host name`);
                }
                count(r.week, `${where}.week`);
                count(r.all, `${where}.all`);
            });
        });
        // Grouping is the point: only hosts with 5 or more may be named.
        (stats.breakdown.ref || []).forEach((r, i) => {
            if (r.key !== 'other' && (r.all === small || r.all === STATS_HELD)) {
                problems.push(`${at}: breakdown.ref[${i}] names a host with fewer than ${floor} page views — it belongs in "other"`);
            }
        });
    }

    if (!isObj(stats.bytes)) {
        problems.push(`${at}: bytes is missing`);
    } else {
        onlyKeys(stats.bytes, ['week', 'all'], 'bytes');
        ['week', 'all'].forEach((p) => {
            const b = stats.bytes[p];
            if (b === null) return;
            if (!isObj(b)) { problems.push(`${at}: bytes.${p} is not an object`); return; }
            onlyKeys(b, ['meanKb', 'medianDayKb', 'days', 'byPage'], `bytes.${p}`);
            if (!Number.isInteger(b.meanKb) || b.meanKb < 0) problems.push(`${at}: bytes.${p}.meanKb is not a whole number of KB`);
            if (b.medianDayKb !== null && (!Number.isInteger(b.medianDayKb) || b.medianDayKb < 0)) {
                problems.push(`${at}: bytes.${p}.medianDayKb is not null or a whole number of KB`);
            }
            if (!Number.isInteger(b.days) || b.days < 0) problems.push(`${at}: bytes.${p}.days is not a whole number`);
            // Written by the fetcher since KB is kept per page; absent in files
            // written before that.
            if (b.byPage !== undefined) {
                if (!Array.isArray(b.byPage)) {
                    problems.push(`${at}: bytes.${p}.byPage is not a list`);
                } else {
                    b.byPage.forEach((row, i) => {
                        if (!isObj(row)) { problems.push(`${at}: bytes.${p}.byPage[${i}] is not an object`); return; }
                        onlyKeys(row, ['page', 'meanKb'], `bytes.${p}.byPage[${i}]`);
                        if (typeof row.page !== 'string' || !row.page) problems.push(`${at}: bytes.${p}.byPage[${i}].page is not a page name`);
                        if (!Number.isInteger(row.meanKb) || row.meanKb < 0) problems.push(`${at}: bytes.${p}.byPage[${i}].meanKb is not a whole number of KB`);
                    });
                }
            }
        });
    }

    if (!Array.isArray(stats.weeks)) {
        problems.push(`${at}: weeks is not a list`);
    } else {
        stats.weeks.forEach((w, i) => {
            headline(w, `weeks[${i}]`, ['start', 'end']);
            if (isObj(w)) {
                date(w.start, `weeks[${i}].start`);
                date(w.end, `weeks[${i}].end`);
                if (ISO_DATE.test(w.start) && (dayOfWeek(w.start) !== 1 || w.end !== addDays(w.start, 6))) {
                    problems.push(`${at}: weeks[${i}] is not a Monday-to-Sunday week`);
                }
                if (isObj(stats.period) && (w.start < stats.period.first || w.end > stats.period.last)) {
                    problems.push(`${at}: weeks[${i}] runs outside the period`);
                }
                if (i && isObj(stats.weeks[i - 1]) && w.start !== addDays(stats.weeks[i - 1].start, -7)) {
                    problems.push(`${at}: weeks[${i}] is not the week before weeks[${i - 1}]`);
                }
            }
        });
    }
    if (problems.length) return problems;       // the checks below read the shape as valid

    // Last week is shown twice, as the headline and as the newest line of
    // the week-by-week table: two different figures for it would be one
    // hidden figure given away by the other.
    const newest = stats.weeks[0];
    if (!newest || newest.start !== stats.week.start ||
        STATS_COUNTS.concat('contactShare').some(k => newest[k] !== stats.headline.week[k])) {
        problems.push(`${at}: weeks[0] is not last week, figure for figure, as headline.week gives it`);
    }

    // A share gives its part away when its whole is shown, and its whole
    // when its part is: both have to be shown numbers.
    [['all', 'all'], ['week', 'week']].forEach(([h, col]) => {
        if (stats.headline[h].contactShare === null) return;
        const index = (stats.breakdown.page.find(r => r.key === 'index') || {})[col];
        const contact = (stats.breakdown.deepest.find(r => r.key === 'contact') || {})[col];
        if (typeof index !== 'number' || typeof contact !== 'number') {
            problems.push(`${at}: headline.${h}.contactShare is given, but homepage views or views that reached #contact are not shown — the share would give the hidden one away`);
        }
    });

    // And the point of all of it: no figure shown as "<5" can be worked out
    // by subtracting the shown figures around it from a total.
    const sums = publishedSums(stats);
    const known = new Map();
    sums.forEach(sum => sum.cells.forEach((c) => { if (typeof c.v === 'number') known.set(c, c.v); }));
    peel(sums, known).forEach(({ cell, value, sum }) => {
        if (value >= 1 && value < floor) {
            problems.push(cell.earlier
                ? `${at}: ${sum.label} leaves ${value}, a count under ${floor} that is shown nowhere but can be worked out — hold the smaller figure too`
                : `${at}: a figure shown as "${small}" in ${sum.label} can be worked out by subtraction — hide the next smallest figure beside it too`);
        }
    });

    return problems;
}

// ------------------------------------------------------------------
// The record's two dates (profile.meta)
//
// `verifiedOn` is the day the record is logged as of: the core log's
// surface, and where the staleness notice counts from. `confirmedOn` is
// Moses's own word that the ongoing facts still hold, null until he gives
// it. The CV printed "Facts last verified" and the first date, which no one
// had confirmed; it prints "Facts last confirmed" from the second alone, so
// a date that is not a day, or one still to come, would print a
// confirmation nobody gave. (realDay is the testimonials' check, below.)
// ------------------------------------------------------------------
function checkMeta(meta) {
    const isDay = (d) => typeof d === 'string' && realDay(d);
    const problems = [];
    if (!meta || !isDay(meta.verifiedOn)) problems.push(`profile meta: verifiedOn must be a day, as YYYY-MM-DD (${meta && meta.verifiedOn})`);
    if (!meta || !('confirmedOn' in meta)) problems.push('profile meta: confirmedOn is missing; it is null until Moses confirms the ongoing facts himself');
    else if (meta.confirmedOn !== null) {
        if (!isDay(meta.confirmedOn)) problems.push(`profile meta: confirmedOn must be null or a day, as YYYY-MM-DD (${meta.confirmedOn})`);
        // A calendar day, not an instant: the build's clock is UTC, and Moses
        // in Amsterdam setting his own today before 01:00 or 02:00 was told
        // it was still to come. The latest day anywhere on Earth is UTC+14.
        else if (meta.confirmedOn > new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10)) problems.push(`profile meta: confirmedOn ${meta.confirmedOn} is still to come`);
    }
    return problems;
}

// ------------------------------------------------------------------
// profile.certifications — each with what it covered, and optionally
// where the issuer says so
//
// The homepage and the CV print every certificate from here (npm run
// build:content, npm run cv). `verifyUrl` is the issuer's page for this
// certificate. It is absent until Moses supplies one: not null, not "TBC",
// because a placeholder link reads as a link. Present, it must be an https
// address on one of VERIFY_HOSTS.
// ------------------------------------------------------------------
const CERT_FIELDS = ['name', 'issuer', 'displayDate', 'year', 'covered'];

function checkCertifications(certifications) {
    if (!Array.isArray(certifications) || !certifications.length) return ['profile: certifications must be a list'];
    const problems = [];
    certifications.forEach((entry, i) => {
        const c = entry && typeof entry === 'object' ? entry : {};
        const at = `profile: certification ${i + 1}${c.name ? ` ("${c.name}")` : ''}`;
        CERT_FIELDS.forEach((k) => {
            if (!(typeof c[k] === 'string' && c[k].trim()) || PLACEHOLDER.test(c[k])) problems.push(`${at}: no ${k}`);
        });
        if (!('verifyUrl' in c)) return;
        let url = null;
        try { url = new URL(c.verifyUrl); } catch (e) { /* reported below */ }
        if (!url || url.protocol !== 'https:') {
            problems.push(`${at}: verifyUrl ${JSON.stringify(c.verifyUrl)} is not an https address — leave the field out until there is one`);
        } else if (!VERIFY_HOSTS.includes(url.host) || !TRUSTED_HOSTS.includes(url.host)) {
            problems.push(`${at}: verifyUrl points at ${url.host}, which is not an issuer's verification host — ` +
                'add it to VERIFY_HOSTS and TRUSTED_HOSTS in scripts/lib/content.js only once you have opened the page yourself');
        }
    });
    return problems;
}

// ------------------------------------------------------------------
// content/testimonials.json — a quote with no source is a claim
//
// Anyone can write a kind sentence and put a name under it. Each entry
// therefore says where a reader can check it: a LinkedIn recommendation
// (the recommendations address of a linkedin.com profile, where it is
// shown), or "on request", with the date the person gave permission to be
// quoted. No other kind of source is accepted, and an entry without one is
// refused. The homepage
// shows them only when there is at least one, and it is held to a length
// (LENGTH in scripts/check-budget.js), so each quote is an excerpt of at
// most 200 characters. Measured in Chromium on the homepage before the rest
// of wave 4, two at that length added 0.40 of a 1440x900 screen and 0.77 of
// a 390x844 one, against 0.43 and 0.78 to spare. With wave 4 merged the
// homepage was 9.42 and 16.46 screens (16.49 once the GIS proof said its
// maps are on request), and stand-ins at that length took it to 9.80 and
// 16.86 with one quote, 9.80 and 17.18 with two, over the 9.79 and 17.09
// ceilings: room has to be made first, and smoke.js's length check says so.
// ------------------------------------------------------------------
const TESTIMONIAL_KEYS = ['quote', 'name', 'role', 'relationship', 'source'];
const TESTIMONIAL_LIMITS = { entries: 3, quote: 200 };
const LINKEDIN_HOSTS = ['linkedin.com', 'www.linkedin.com'];
// The recommendations a profile has received, where the quote is shown: a
// bare profile address is anyone's page, the quoted person's own included,
// and does not show the recommendation at all.
const LINKEDIN_PATH = /^\/in\/[A-Za-z0-9_%-]+\/details\/recommendations\/?$/;
const ISO_DAY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const realDay = (d) => ISO_DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

function checkTestimonials(file) {
    if (!file || !Array.isArray(file.testimonials)) return ['testimonials: content/testimonials.json needs a "testimonials" list (empty is fine)'];
    const list = file.testimonials;
    const problems = [];
    if (list.length > TESTIMONIAL_LIMITS.entries) {
        problems.push(`testimonials: ${list.length} entries; the homepage has room for ${TESTIMONIAL_LIMITS.entries}`);
    }
    list.forEach((t, i) => {
        const at = `testimonial ${i + 1}${t && t.name ? ` (${t.name})` : ''}`;
        if (!t || typeof t !== 'object') { problems.push(`${at}: is not an object`); return; }
        Object.keys(t).filter(k => !TESTIMONIAL_KEYS.includes(k)).forEach(k => problems.push(`${at}: unknown field "${k}"`));
        ['quote', 'name', 'role', 'relationship'].forEach((k) => {
            if (!(typeof t[k] === 'string' && t[k].trim()) || PLACEHOLDER.test(t[k])) problems.push(`${at}: no ${k}`);
        });
        if (typeof t.quote === 'string' && t.quote.length > TESTIMONIAL_LIMITS.quote) {
            problems.push(`${at}: the quote is ${t.quote.length} characters; at most ${TESTIMONIAL_LIMITS.quote}`);
        }
        const s = t.source;
        if (!s || typeof s !== 'object') { problems.push(`${at}: no source — say where a reader can check it, or leave the quote out`); return; }
        if (s.type === 'linkedin') {
            Object.keys(s).filter(k => !['type', 'url'].includes(k)).forEach(k => problems.push(`${at}: a LinkedIn source has no field "${k}"`));
            let url = null;
            try { url = new URL(s.url); } catch (e) { /* reported below */ }
            if (!url || url.protocol !== 'https:' || !LINKEDIN_HOSTS.includes(url.host) || !LINKEDIN_PATH.test(url.pathname) || url.hash) {
                problems.push(`${at}: a LinkedIn source needs the https address of the recommendations on a linkedin.com profile, …/in/<name>/details/recommendations/ (got ${JSON.stringify(s.url)})`);
            }
        } else if (s.type === 'on-request') {
            Object.keys(s).filter(k => !['type', 'permissionDate'].includes(k)).forEach(k => problems.push(`${at}: an on-request source has no field "${k}"`));
            if (!realDay(String(s.permissionDate))) {
                problems.push(`${at}: an on-request source needs the date permission was given, as YYYY-MM-DD (got ${JSON.stringify(s.permissionDate)})`);
            }
        } else {
            problems.push(`${at}: source type ${JSON.stringify(s.type)} is not "linkedin" or "on-request"`);
        }
    });
    return problems;
}

// ------------------------------------------------------------------
// A figure in someone else's words
//
// The homepage holds every number it prints to the claims ledger, a
// testimonial's and a certificate's line included: the build marks a
// figure the ledger holds, and tests/claims.test.js fails on one it does
// not. A quote is someone's own words and is never edited, so a figure in
// it that the ledger does not hold, or holds written another way, is
// refused here, by name, rather than by a scan of the page later: give it
// an entry, or a `forms` entry for how the quote writes it ("team of 23"),
// or choose another excerpt.
// ------------------------------------------------------------------
function checkQuotedFigures({ testimonials, certifications }, claims) {
    const problems = [];
    const say = (at, text) => figures.unheld(text, claims).forEach((n) => {
        problems.push(`${at}: "${n}" is a figure the claims ledger does not hold as written; add it to content/claims.json (an entry, or a form of one), or quote another excerpt`);
    });
    ((testimonials && testimonials.testimonials) || []).forEach((t, i) => { if (t && typeof t.quote === 'string') say(`testimonial ${i + 1}${t.name ? ` (${t.name})` : ''}`, t.quote); });
    (certifications || []).forEach((c) => { if (c && typeof c.covered === 'string') say(`certificate "${c.name}"`, c.covered); });
    return problems;
}

// ------------------------------------------------------------------
// content/claims.json — the claims ledger
//
// Every number the site prints, with its basis. The page side (each
// figure marked, every numeral accounted for) is tests/claims.test.js's;
// what can be checked from the files alone is checked here, on every
// build: the shape is closed, every entry has exactly one basis, the basis
// exists and says the same number, and nothing is called checkable from
// outside without saying where. The build fails on a figure with no basis
// rather than publish it.
// ------------------------------------------------------------------
const CHECKABLE = ['public', 'on-request', 'not-checkable'];
const BASIS_KINDS = ['result', 'profile', 'factor', 'source', 'budget', 'derived', 'illustrative'];
const CLAIM_KEYS = ['id', 'value', 'unit', 'forms', 'spoken', 'basis', 'checkable', 'check'];
const BASIS_EXTRA = { factor: ['url', 'note', 'count', 'own'], source: ['url', 'note'], derived: ['from'], profile: ['note'], budget: ['note'] };
const CLAIM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The calculators' inputs, as the pages load them. */
const loadFactors = () => require(path.join(ROOT, 'ai-carbon-data.js'));

/** A value at a dotted path ("experience.4.teamSize"), or undefined. */
const atPath = (obj, dotted) => String(dotted).split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);

/**
 * Whether a text states a claim's figure, written as the ledger writes it.
 * A single digit is looked for on its own, outside a longer number.
 */
function mentions(text, claim) {
    if (figures.markable(claim.value)) return figures.marker([claim])(text).some(([, id]) => id === claim.id);
    return new RegExp(`(?<![\\d.,])${claim.value}(?![\\d.,%])`).test(String(text));
}

/** The case-study result a `result` basis rests on: the first to state the figure. */
function resultFor(claim, projects) {
    const cs = projects.caseStudies.find(c => c.id === (claim.basis && claim.basis.result));
    if (!cs) return null;
    const result = (cs.results || []).find(r => mentions(`${r.claim} ${r.basis}`, claim));
    return result ? { cs, result } : null;
}

/**
 * "Checkable from outside" has to say where, as the ledger's other public
 * entries do: the result's own `check` (a source a reader opens, on a host
 * the repository trusts, or a page of this site) or public work in its case
 * study a reader can open. Two results were labelled checkable with nowhere
 * to look: a model's sub-basin count, whose source was never cited, and a
 * degree whose certificate claims.html files as on request.
 */
function checkResultCheck(at, cs, r) {
    const which = `${at}: result "${(r.claim || '').slice(0, 40)}"`;
    if (r.check !== undefined) {
        const bad = urlProblem(r.check);
        if (bad) return [`${which}: check ${bad}`];
        if (r.verifiable !== true) return [`${which}: has a check, so it is checkable — say verifiable: true, or drop the check`];
        return [];
    }
    const open = (cs.artifacts || []).some(a => a.status === 'public' && a.url);
    if (r.verifiable === true && !open) {
        return [`${which}: is called checkable from outside with nowhere to check it — give it a check (the address of a source that shows it), publish the work that does, or make it not verifiable`];
    }
    return [];
}

/** How checkable a claim is: a result's is the case study's own. */
function checkabilityOf(claim, projects) {
    if (claim.basis && claim.basis.result) {
        const found = resultFor(claim, projects);
        return found ? (found.result.verifiable ? 'public' : 'not-checkable') : null;
    }
    return claim.checkable;
}

/** What a calculator input amounts to, for comparing with the ledger. */
function factorQuantity(f, count) {
    // A count of a factor set's entries: its models, its grid regions.
    if (count) return f && typeof f === 'object' ? { n: Object.keys(f).length } : null;
    if (typeof f === 'number') return { n: f };
    if (Array.isArray(f) && f.length === 2 && f.every(n => typeof n === 'number')) return { lo: f[0], hi: f[1] };
    if (f && typeof f.input === 'number' && typeof f.output === 'number') return { n: f.input / f.output, ratio: true };
    return null;
}

function checkClaims(ledger, { profile, projects, factors }) {
    const at = 'content/claims.json';
    if (!ledger || !Array.isArray(ledger.claims) || !ledger.claims.length) return [`${at}: needs a "claims" list`];
    const problems = [];
    const ids = new Set();
    const shownBy = new Map();
    ledger.claims.forEach((c, i) => {
        const where = `${at}: claim ${c && c.id ? `"${c.id}"` : i + 1}`;
        if (!c || typeof c !== 'object') { problems.push(`${where}: is not an entry`); return; }
        Object.keys(c).filter(k => !CLAIM_KEYS.includes(k))
            .forEach(k => problems.push(`${where}: unknown field "${k}" (${CLAIM_KEYS.join(', ')})`));
        if (!CLAIM_ID.test(c.id || '')) problems.push(`${where}: id must be kebab-case`);
        else if (ids.has(c.id)) problems.push(`${where}: duplicate id`);
        ids.add(c.id);

        const value = figures.quantity(c.value || '');
        if (typeof c.value !== 'string' || !value) {
            problems.push(`${where}: value "${c.value}" is not one figure as the page writes it`);
            return;
        }
        if (typeof c.unit !== 'string' || !c.unit.trim()) problems.push(`${where}: no unit — what does ${c.value} count?`);
        else if (/\d/.test(figures.plain(c.unit).replace(/per[- ]1k/g, '').replace(/CO₂/g, ''))) {
            problems.push(`${where}: the unit has a figure in it; give that figure an entry of its own`);
        }

        // Every other way of writing it has to come to the same thing.
        ['forms', 'spoken'].forEach((key) => {
            if (c[key] === undefined) return;
            if (!Array.isArray(c[key]) || !c[key].length || c[key].some(s => typeof s !== 'string' || !s.trim())) {
                problems.push(`${where}: ${key} must be a list of phrases`);
                return;
            }
            c[key].filter(s => !figures.agrees(value, s))
                .forEach(s => problems.push(`${where}: ${key === 'spoken' ? 'the narration\'s' : 'the form'} "${s}" does not say ${c.value}`));
            if (key === 'spoken') c[key].filter(s => /\d/.test(s)).forEach(s => problems.push(`${where}: "${s}" is spoken, so it is written in words`));
        });
        // The marker finds a figure in content/ by how it is written (a bare
        // pair of digits with its unit's first word); two entries written
        // alike would leave it guessing.
        [c.value].concat(c.forms || []).filter(figures.markable).forEach((s) => {
            const key = figures.pattern(s, c).toLowerCase();
            if (shownBy.has(key) && shownBy.get(key) !== c.id) problems.push(`${where}: "${s}" is also how "${shownBy.get(key)}" is written; the pages could not tell them apart`);
            shownBy.set(key, c.id);
        });

        const b = c.basis;
        const kinds = b && typeof b === 'object' ? BASIS_KINDS.filter(k => b[k] !== undefined) : [];
        if (kinds.length !== 1) {
            problems.push(`${where}: needs exactly one basis (${BASIS_KINDS.join(', ')}); a number with no basis is a boast`);
            return;
        }
        const kind = kinds[0];
        Object.keys(b).filter(k => k !== kind && !(BASIS_EXTRA[kind] || []).includes(k))
            .forEach(k => problems.push(`${where}: a ${kind} basis has no field "${k}"`));
        if (b.note !== undefined && (typeof b.note !== 'string' || !b.note.trim())) problems.push(`${where}: the basis note is empty`);

        if (kind === 'result') {
            const found = resultFor(c, projects);
            if (!projects.caseStudies.some(cs => cs.id === b.result)) problems.push(`${where}: no case study "${b.result}"`);
            else if (!found) problems.push(`${where}: no result of case study "${b.result}" states ${c.value}`);
            if (c.checkable !== undefined || c.check !== undefined) {
                problems.push(`${where}: a result's checkability and link are the case study's; leave checkable and check out`);
            }
        } else if (kind === 'profile') {
            const paths = [].concat(b.profile);
            paths.forEach((p) => {
                if (typeof p !== 'string' || atPath(profile, p) === undefined) problems.push(`${where}: profile.json has no ${p}`);
            });
            const field = paths.length === 1 ? atPath(profile, paths[0]) : undefined;
            // Months counted from a role's dates ("five months with UNDRR")
            // move with them: start and end month, both counted.
            const span = field && /^\d{4}-\d{2}$/.test(field.start || '') && /^\d{4}-\d{2}$/.test(field.end || '')
                ? (field.end.slice(0, 4) - field.start.slice(0, 4)) * 12 + (field.end.slice(5) - field.start.slice(5)) + 1 : null;
            if (span !== null && /^months\b/.test(c.unit || '') && !figures.agrees(value, { n: span })) {
                problems.push(`${where}: ${paths[0]} runs ${field.start} to ${field.end}, ${span} months, not ${c.value}`);
            }
            if (field !== undefined && field !== null && typeof field !== 'object') {
                if (!figures.agrees(value, String(field).split(' ')[0])) problems.push(`${where}: profile.json's ${paths[0]} is ${field}, not ${c.value}`);
            } else if (!b.note) {
                problems.push(`${where}: counted from profile.json rather than read from it, so it needs a note saying how`);
            }
        } else if (kind === 'factor') {
            const f = typeof b.factor === 'string' ? atPath(factors, b.factor) : undefined;
            if (b.count !== undefined && b.count !== true) problems.push(`${where}: count is true (the figure is how many entries ${b.factor} has) or left out`);
            // A default, a convention or a judgement is the calculator's own,
            // and says so rather than wearing the factor's citation.
            if (b.own !== undefined && (typeof b.own !== 'string' || !b.own.trim() || b.note !== undefined)) problems.push(`${where}: own says why the calculator chose the figure, in place of a note`);
            const q = factorQuantity(f, b.count === true);
            if (f === undefined) problems.push(`${where}: ai-carbon-data.js has no ${b.factor}`);
            else if (q && !figures.agrees(value, q)) problems.push(`${where}: ai-carbon-data.js's ${b.factor} is not ${c.value}`);
            else if (!q && !b.note) problems.push(`${where}: ${b.factor} is not one number, so the basis needs a note saying how ${c.value} follows from it`);
            if (b.url !== undefined) {
                const bad = urlProblem(b.url);
                if (bad) problems.push(`${where}: the factor's url ${bad}`);
            }
        } else if (kind === 'source') {
            if (typeof b.source !== 'string' || !b.source.trim()) problems.push(`${where}: the source has no name`);
            const bad = urlProblem(b.url);
            if (bad) problems.push(`${where}: a cited source needs its url, and this one ${bad}`);
        } else if (kind === 'budget') {
            if (typeof b.budget !== 'string' || !b.budget) problems.push(`${where}: names no budget`);
        } else if (kind === 'derived') {
            if (typeof b.derived !== 'string' || !b.derived.trim()) problems.push(`${where}: a derived figure says how it is worked out`);
            if (!Array.isArray(b.from) || !b.from.length) problems.push(`${where}: a derived figure names the entries it comes from`);
        } else if (kind === 'illustrative') {
            if (typeof b.illustrative !== 'string' || !b.illustrative.trim()) problems.push(`${where}: an illustrative figure says why it has no source`);
            if (c.checkable !== 'not-checkable') problems.push(`${where}: an illustrative figure has nothing to check it against: checkable is "not-checkable"`);
        }

        if (kind !== 'result') {
            if (!CHECKABLE.includes(c.checkable)) problems.push(`${where}: checkable must be one of ${CHECKABLE.join(', ')}`);
            if (c.checkable === 'public') {
                const bad = c.check ? urlProblem(c.check) : 'is missing';
                if (bad) problems.push(`${where}: is checkable from outside, so it says where — its check ${bad}`);
            } else if (c.check !== undefined) {
                problems.push(`${where}: is "${c.checkable}" but carries a link to check it, which reads as checkable`);
            }
        }
    });
    // Derived figures come from entries that exist.
    ledger.claims.forEach((c) => {
        const from = c && c.basis && c.basis.derived !== undefined ? c.basis.from || [] : [];
        from.filter(id => id === c.id || !ids.has(id))
            .forEach(id => problems.push(`${at}: claim "${c.id}" is derived from "${id}", which is ${id === c.id ? 'itself' : 'not an entry'}`));
    });
    return problems;
}

/**
 * The public work a role view holds as its own: the public artifacts of the
 * case studies it is home to (those that list it first, and so lead the
 * view), and the public research outputs of those case studies or placed in
 * the view by their own `lenses`, which its panel lists (renderCaseStudies,
 * build-content.js). A case study that only touches a lens leads another
 * view, and its work counts there: the sustainable-AI case lists the climate
 * lens third, and its repositories are not climate work. Each as
 * { name, url }. Every lens needs one that is not a page of this site
 * (checkLensWork).
 */
function publicWorkFor(lensId, projects, research) {
    const ids = projects.caseStudies.filter(cs => (cs.lenses || [])[0] === lensId).map(cs => cs.id);
    const artifacts = projects.caseStudies.filter(cs => ids.includes(cs.id))
        .flatMap(cs => (cs.artifacts || []).filter(a => a.status === 'public').map(a => ({ name: a.name, url: a.url })));
    const outputs = research.outputs.filter(o => o.status === 'public' && (ids.includes(o.caseStudy) || (o.lenses || []).includes(lensId)))
        .map(o => ({ name: o.title, url: o.url }));
    return artifacts.concat(outputs);
}

/**
 * A lens whose work a reader can open none of is a claim to take on trust.
 * This site's own pages do not count: the water lens had two games here and
 * nothing else a reader could open. Returns problems, like the rest.
 */
function checkLensWork(lensList, projects, research) {
    return lensList
        .filter(l => !publicWorkFor(l.id, projects, research).some(w => localPath(w.url) === null))
        .map(l => `lens "${l.id}": no public work beyond this site's own pages belongs to it — a lens needs an artifact or research output a reader can open elsewhere`);
}

/**
 * Reads everything and returns it validated, or throws with every problem
 * listed at once — one run of the build should tell you all of them.
 */
function loadAll() {
    const profile = load('profile');
    const projects = load('projects');
    const research = load('research');
    const lenses = load('lenses');
    const narration = load('narration');
    const stats = load('stats');
    const testimonials = load('testimonials');
    const claims = load('claims');

    const problems = checkStats(stats);
    problems.push(...checkClaims(claims, { profile, projects, factors: loadFactors() }));
    const lensIds = lenses.lenses.map(l => l.id);

    // --- case studies ---------------------------------------------------
    const seen = new Set();
    projects.caseStudies.forEach((cs) => {
        const at = `case study "${cs.id}"`;

        if (seen.has(cs.id)) problems.push(`${at}: duplicate id`);
        seen.add(cs.id);

        ['title', 'problem', 'period', 'organization'].forEach((field) => {
            if (!cs[field]) problems.push(`${at}: missing ${field}`);
        });

        // Problem → method → artifact → result. All four, or it is not a case
        // study — it is a paragraph with a heading.
        if (!Array.isArray(cs.method) || !cs.method.length) problems.push(`${at}: no method steps`);
        if (!Array.isArray(cs.artifacts) || !cs.artifacts.length) problems.push(`${at}: no artifacts — what did the work produce?`);
        if (!Array.isArray(cs.results) || !cs.results.length) problems.push(`${at}: no results`);

        (cs.results || []).forEach((r, i) => {
            if (!r.claim) problems.push(`${at}: result ${i + 1} has no claim`);
            if (!r.basis) problems.push(`${at}: result "${(r.claim || '').slice(0, 40)}" has no basis — say how it was measured or drop it`);
            if (typeof r.verifiable !== 'boolean') {
                problems.push(`${at}: result "${(r.claim || '').slice(0, 40)}" does not say whether a reader can check it`);
            }
            problems.push(...checkResultCheck(at, cs, r));
        });

        (cs.artifacts || []).forEach((a, i) => {
            if (!a.name) problems.push(`${at}: artifact ${i + 1} has no name`);
            problems.push(...checkAvailability(`${at}, artifact "${a.name || i + 1}"`, a));
        });

        (cs.lenses || []).forEach((l) => {
            if (!lensIds.includes(l)) problems.push(`${at}: unknown lens "${l}"`);
        });

        // On the homepage unless it says otherwise (onHomepage, above); off
        // it, nothing needs the card's photo, tags or brief.
        if (cs.homepageCard !== undefined && typeof cs.homepageCard !== 'boolean') {
            problems.push(`${at}: homepageCard must be true or false (leave it out for true)`);
        }
        if (onHomepage(cs)) problems.push(...checkCard(at, cs));
        else if (!cs.subtitle) problems.push(`${at}: missing subtitle (the case study prints it)`);
        problems.push(...checkGallery(at, cs));
        problems.push(...checkFindings(at, cs));
    });

    // Each interactive has one home: its ids are page-wide.
    const hosts = projects.caseStudies.filter(cs => cs.widget).map(cs => cs.widget);
    hosts.filter((w, i) => hosts.indexOf(w) !== i).forEach((w) => {
        problems.push(`widget "${w}" is hosted by more than one case study`);
    });

    // --- research outputs -----------------------------------------------
    const outputIds = new Set();
    const caseStudyIds = projects.caseStudies.map(c => c.id);
    research.outputs.forEach((o) => {
        const at = `research output "${o.id}"`;

        if (outputIds.has(o.id)) problems.push(`${at}: duplicate id`);
        outputIds.add(o.id);

        ['title', 'type', 'year', 'summary'].forEach((field) => {
            if (!o[field]) problems.push(`${at}: missing ${field}`);
        });

        problems.push(...checkAvailability(at, o));

        if (o.caseStudy && !caseStudyIds.includes(o.caseStudy)) {
            problems.push(`${at}: references unknown case study "${o.caseStudy}"`);
        }
        // An output with no case study of its own can still belong to a role
        // view; one that has a case study takes the case study's.
        if (o.lenses !== undefined && (!Array.isArray(o.lenses) || !o.lenses.length || o.caseStudy)) {
            problems.push(`${at}: lenses must be a list of lens ids, and only on an output with no case study`);
        }
        (Array.isArray(o.lenses) ? o.lenses : []).forEach((l) => {
            if (!lensIds.includes(l)) problems.push(`${at}: unknown lens "${l}"`);
        });

        // A venue that looks like a journal without a DOI is the exact shape
        // of an overclaim, so anything asserting peer review has to prove it.
        if (/journal|proceedings|conference/i.test(o.venue || '') && !o.doi) {
            problems.push(`${at}: names a publication venue but has no DOI — do not imply peer review without one`);
        }
    });

    // --- lenses -----------------------------------------------------------
    lenses.lenses.forEach((l) => {
        const at = `lens "${l.id}"`;
        ['label', 'shortLabel', 'summary', 'bestFor'].forEach((field) => {
            if (!l[field]) problems.push(`${at}: missing ${field}`);
        });
        if (!Array.isArray(l.evidence) || !l.evidence.length) problems.push(`${at}: no evidence lines`);

        // A lens nothing matches is a claim to a specialism with no work behind it.
        const matching = projects.caseStudies.filter(cs => (cs.lenses || []).includes(l.id));
        if (!matching.length) problems.push(`${at}: no case study belongs to it`);
        // And one whose work a reader can open none of is a specialism they
        // have to take on trust (the plan's test for Phase 3: every lens has
        // at least one public artifact behind it).
        else if (!matching.some(cs => (cs.artifacts || []).some(a => a.status === 'public'))) {
            problems.push(`${at}: none of its case studies has a public artifact — a reader can open nothing behind it`);
        }
    });
    problems.push(...checkLensWork(lenses.lenses, projects, research));

    // --- narration ---------------------------------------------------------
    narration.scripts.forEach((s) => {
        if (!s.id || !s.label || !s.text) problems.push(`narration "${s.id || '?'}": missing id, label or text`);
    });
    // The introduction is read by Moses himself, so it has a shape to keep:
    // one 60-90 second take, which at a measured pace is 150-220 words, and
    // it opens with the greeting the recording is known by.
    const intro = narration.intro;
    if (intro) {
        if (intro.id !== 'intro' || !intro.label || !intro.readBy || !intro.text) {
            problems.push('narration intro: needs id "intro", a label, readBy and text');
        } else {
            const words = intro.text.trim().split(/\s+/).length;
            if (words < 150 || words > 220) problems.push(`narration intro: ${words} words; a 60-90 s take is 150-220`);
            if (!/^Kushe\b/.test(intro.text)) problems.push('narration intro: must open with "Kushe"');
            if (intro.readBy !== profile.person.name) problems.push(`narration intro: readBy "${intro.readBy}" is not ${profile.person.name}`);
        }
    }

    // --- the record's dates ---------------------------------------------
    problems.push(...checkMeta(profile.meta));

    // --- languages (optional) ------------------------------------------
    problems.push(...checkLanguages(profile.languages));

    // --- the at-a-glance strip -------------------------------------------
    problems.push(...checkAtAGlance(profile.atAGlance, profile.languages));

    // --- certificates and testimonials: what a reader can check ----------
    problems.push(...checkCertifications(profile.certifications));
    problems.push(...checkTestimonials(testimonials));
    problems.push(...checkQuotedFigures({ testimonials, certifications: profile.certifications }, claims.claims));

    if (problems.length) {
        throw new Error(`content failed validation:\n  - ${problems.join('\n  - ')}`);
    }

    return { profile, projects, research, lenses, narration, stats, testimonials, claims, lensIds };
}

/**
 * Case studies for a lens: matching ones first, the rest after. Never
 * filtered. A case study lists its lenses nearest first, so among the
 * matching ones, those the lens is home to (listed first) lead, and those it
 * only touches follow, each group in file order. The page's own script
 * (build-content.js) orders the cards by the same rule.
 */
function orderForLens(caseStudies, lensId) {
    if (!lensId || lensId === 'all') return { primary: caseStudies.slice(), secondary: [] };
    const rank = cs => (cs.lenses || []).indexOf(lensId);
    return {
        primary: caseStudies.filter(cs => rank(cs) > -1).sort((a, b) => rank(a) - rank(b)),
        secondary: caseStudies.filter(cs => rank(cs) === -1)
    };
}

module.exports = {
    ROOT,
    CONTENT_DIR,
    TRUSTED_HOSTS,
    STATUSES,
    WIDGETS,
    load,
    loadAll,
    counterRules,
    urlProblem,
    checkAvailability,
    checkResultCheck,
    checkCard,
    checkGallery,
    checkFindings,
    FINDING_KINDS,
    onHomepage,
    PHOTO_LAYOUTS,
    checkLanguages,
    checkAtAGlance,
    GLANCE_LIMITS,
    glanceLanguages,
    checkStats,
    peel,
    orderForLens,
    publicWorkFor,
    checkLensWork,
    checkMeta,
    VERIFY_HOSTS,
    checkCertifications,
    TESTIMONIAL_LIMITS,
    checkTestimonials,
    checkQuotedFigures,
    CHECKABLE,
    BASIS_KINDS,
    checkClaims,
    loadFactors,
    atPath,
    mentions,
    resultFor,
    checkabilityOf
};
