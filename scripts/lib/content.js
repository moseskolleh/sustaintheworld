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

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content');

// Hosts this repository already links to elsewhere. Adding one is a decision,
// not an accident — which is the point.
const TRUSTED_HOSTS = [
    'github.com',
    'moseskolleh.github.io',
    'linkedin.com',
    'www.linkedin.com',
    'sustainablewebdesign.org',
    'httparchive.org'
];

const STATUSES = ['public', 'on-request', 'internal', 'planned'];

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

    const problems = checkStats(stats);
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
        });

        (cs.artifacts || []).forEach((a, i) => {
            if (!a.name) problems.push(`${at}: artifact ${i + 1} has no name`);
            problems.push(...checkAvailability(`${at}, artifact "${a.name || i + 1}"`, a));
        });

        (cs.lenses || []).forEach((l) => {
            if (!lensIds.includes(l)) problems.push(`${at}: unknown lens "${l}"`);
        });

        problems.push(...checkCard(at, cs));
        problems.push(...checkGallery(at, cs));
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
    });

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

    // --- languages (optional) ------------------------------------------
    problems.push(...checkLanguages(profile.languages));

    // --- the at-a-glance strip -------------------------------------------
    problems.push(...checkAtAGlance(profile.atAGlance, profile.languages));

    if (problems.length) {
        throw new Error(`content failed validation:\n  - ${problems.join('\n  - ')}`);
    }

    return { profile, projects, research, lenses, narration, stats, lensIds };
}

/** Case studies for a lens: matching ones first, the rest after. Never filtered. */
function orderForLens(caseStudies, lensId) {
    if (!lensId || lensId === 'all') return { primary: caseStudies.slice(), secondary: [] };
    return {
        primary: caseStudies.filter(cs => (cs.lenses || []).includes(lensId)),
        secondary: caseStudies.filter(cs => !(cs.lenses || []).includes(lensId))
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
    urlProblem,
    checkAvailability,
    checkCard,
    checkGallery,
    PHOTO_LAYOUTS,
    checkLanguages,
    checkAtAGlance,
    GLANCE_LIMITS,
    glanceLanguages,
    checkStats,
    peel,
    orderForLens
};
