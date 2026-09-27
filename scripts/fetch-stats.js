#!/usr/bin/env node
'use strict';
// ===================================================================
// FETCH STATS — the counter's daily totals, suppressed, into content/stats.json
//
//     STATS_SOURCE_URL=<url> node scripts/fetch-stats.js
//     npm run build:content        then rebuilds stats.html from the result
//
// The site counts its own page views (docs/plan.md, Phase 1): one small
// beacon per page view, with no id and no cookie, added to daily totals in a
// Google Sheet the owner holds. This script is the only road from that sheet
// to the public repository, and it is built so the road carries aggregates
// and nothing else:
//
//   - it reads the daily rows, [date, metric, key, count], either as the
//     Apps Script endpoint's JSON ({"v":1,"rows":[...]}, from ?action=stats)
//     or as a CSV the owner published with the header date,metric,key,count;
//   - it adds them up into last week, all time, and one line per week;
//   - every published count under 5 becomes the string "<5" and is left out
//     of every share, and referrer hosts under 5 fold into "other";
//   - it writes those totals to content/stats.json, never a daily row, and
//     scripts/lib/content.js refuses the file if either rule is broken.
//
// WHY SUPPRESS. A count that small can single a reader out: one page view
// from a small firm's intranet on a Tuesday is a person, not a statistic.
//
// WHY NAMES ARE CHECKED AGAINST THE SITE. The endpoint is public, so anyone
// can post a beacon claiming any page, section, feature or referrer, and this
// page is published without a human reading it first. A page, lens, section
// or feature is therefore listed under its own name only if the site's source
// uses that name; anything else is still counted, but as "other". Referrer
// hosts cannot be checked that way, so they must at least look like a host
// name, and nothing on the page is a link.
//
// WHEN THERE IS NOTHING TO FETCH. With STATS_SOURCE_URL unset, or the source
// unreachable, it says why and exits 0 without touching content/stats.json:
// the weekly Action must not go red because the counter has not been switched
// on yet, or because Google had a bad minute. A source that answers with
// something that is not stats (a sign-in page, a CSV with the wrong header)
// is a configuration mistake, and that does fail.
//
// Nothing read from the source is ever printed. On a public repository the
// Action's log is public too, and the unsuppressed rows are exactly what must
// not leak — so problems are reported as counts and reasons, never contents.
// ===================================================================

const fs = require('fs');
const path = require('path');
const { checkStats } = require('./lib/content.js');

const ROOT = path.join(__dirname, '..');
// STATS_OUT exists for tests/stats.test.js, which runs this script end to end
// against a local server and must not rewrite the repository's copy.
const OUT = process.env.STATS_OUT ? path.resolve(process.env.STATS_OUT) : path.join(ROOT, 'content', 'stats.json');

const SUPPRESS_BELOW = 5;
const SMALL = `<${SUPPRESS_BELOW}`;
const TIME_ZONE = 'Europe/Amsterdam';           // the date the Apps Script counts in
const METRICS = ['visits', 'page', 'lens', 'deepest', 'feature', 'ref', 'vp', 'kb', 'contact'];
const UNKEYED = ['visits', 'kb', 'contact'];
const BREAKDOWNS = ['page', 'lens', 'vp', 'ref', 'feature', 'deepest'];
const VIEWPORTS = ['s', 'm', 'l'];
const REFERRERS_LISTED = 15;                    // the rest of the hosts fold into "other"
const WEEKS_KEPT = 12;                          // a quarter of week-by-week baseline
const FETCH_TIMEOUT_MS = 30000;

const COMMENT = [
    'WRITTEN by scripts/fetch-stats.js from the counter\'s daily totals. Do not edit by hand:',
    'the weekly Action (.github/workflows/stats.yml) overwrites it, and npm run build:content',
    'turns it into stats.html.',
    '',
    'Only suppressed aggregates are ever written here. Every count under 5 is the string "<5"',
    'and is left out of every share; referrer hosts under 5 are grouped as "other"; no daily',
    'row is kept. scripts/lib/content.js fails the build if any of that is broken.',
    '',
    'status "not-collecting" means no totals have been fetched yet, and the page says so.'
];

/** The file as it stands before the counter has sent anything. */
const EMPTY = {
    $comment: COMMENT,
    v: 1,
    status: 'not-collecting',
    asOf: null,
    suppressBelow: SUPPRESS_BELOW,
    period: null,
    week: null,
    briefLive: false,
    headline: null,
    breakdown: null,
    bytes: null,
    weeks: []
};

class SourceError extends Error {}

// ------------------------------------------------------------------
// Dates. Everything is a plain YYYY-MM-DD string compared as text, with
// arithmetic done in UTC so no daylight-saving change can shift a day.
// ------------------------------------------------------------------
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isDate(s) {
    const m = DATE.exec(s);
    if (!m) return false;
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return t.toISOString().slice(0, 10) === s;       // rejects 2026-02-30
}

function addDays(date, n) {
    const m = DATE.exec(date);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
}

/** The Monday of the ISO week a date falls in. */
function mondayOf(date) {
    const m = DATE.exec(date);
    const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();   // 0 = Sunday
    return addDays(date, -((day + 6) % 7));
}

/** The calendar date in Amsterdam at an instant — the date the sheet uses. */
function amsterdamDate(instant) {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(instant);
}

function daysBetween(first, last) {
    return Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000) + 1;
}

// ------------------------------------------------------------------
// Reading the source
// ------------------------------------------------------------------

/** RFC 4180: quoted fields, doubled quotes inside them, LF or CRLF. */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c !== '"') field += c;
            else if (text[i + 1] === '"') { field += '"'; i++; }
            else quoted = false;
        } else if (c === '"') {
            quoted = true;
        } else if (c === ',') {
            row.push(field);
            field = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += c;
        }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * Either shape the contract allows, as [date, metric, key, count] rows.
 * Throws a SourceError whose message never quotes the source.
 */
function parseSource(text) {
    const body = String(text == null ? '' : text).replace(/^﻿/, '').trim();
    if (!body) throw new SourceError('the source answered with nothing');

    if (body[0] === '<') {
        throw new SourceError('the source answered with a web page, not stats. A Google sign-in page usually means the ' +
            'Apps Script web app is not deployed with access "Anyone", or the sheet is not published to the web');
    }

    if (body[0] === '{') {
        let data;
        try {
            data = JSON.parse(body);
        } catch (err) {
            // Not err.message: it quotes the text it choked on.
            throw new SourceError('the source looks like JSON but does not parse');
        }
        if (!data || data.v !== 1 || !Array.isArray(data.rows)) {
            throw new SourceError('the JSON is not {"v":1,"rows":[...]}. Is STATS_SOURCE_URL the counter endpoint with ?action=stats?');
        }
        // A sheet's getValues() starts with its header row; that is not a row
        // to drop with a warning, just one to skip.
        const rows = data.rows.slice();
        if (Array.isArray(rows[0]) && rows[0].map(h => String(h).trim().toLowerCase()).join(',') === 'date,metric,key,count') rows.shift();
        return { format: 'json', rows };
    }

    const table = parseCsv(body);
    const header = (table.shift() || []).map(h => h.trim().toLowerCase());
    if (header.join(',') !== 'date,metric,key,count') {
        // The header is not printed: a sheet published by mistake (the contact
        // form's responses, say) has a person's name and email in row one.
        throw new SourceError('the CSV does not start with the header date,metric,key,count. Publish the "Daily" sheet, not another one');
    }
    return { format: 'csv', rows: table };
}

// ------------------------------------------------------------------
// The names the site itself uses
// ------------------------------------------------------------------

/**
 * Pages, lenses, section ids and feature names, read from the site's own
 * source, so a made-up name posted to the public endpoint cannot reach the
 * public page. A feature is known if the markup names it in data-analytics,
 * if it is an on-demand module (as "module-" and its file name, the name the
 * counter gives a module once it has been fetched), or if a script tracks it
 * by a literal name.
 */
function knownNames(root = ROOT) {
    const rootFiles = fs.readdirSync(root);
    const pages = rootFiles.filter(f => f.endsWith('.html'));
    const modulesDir = path.join(root, 'modules');
    const modules = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).filter(f => f.endsWith('.js')) : [];
    const scripts = rootFiles.filter(f => f.endsWith('.js')).map(f => path.join(root, f))
        .concat(modules.map(f => path.join(modulesDir, f)));

    const ids = new Set();
    const features = new Set(modules.map(f => `module-${f.replace(/\.js$/, '')}`));
    pages.forEach((f) => {
        const html = fs.readFileSync(path.join(root, f), 'utf8');
        for (const m of html.matchAll(/\bid="([A-Za-z0-9_-]{1,60})"/g)) ids.add(m[1]);
        for (const m of html.matchAll(/\bdata-analytics="([a-z0-9-]{1,40})"/g)) features.add(m[1]);
    });
    scripts.forEach((file) => {
        const js = fs.readFileSync(file, 'utf8');
        for (const m of js.matchAll(/\b(?:track|trackEvent)\(\s*['"]([a-z0-9-]{1,40})['"]/g)) features.add(m[1]);
    });

    const lenses = JSON.parse(fs.readFileSync(path.join(root, 'content', 'lenses.json'), 'utf8'));
    return {
        pages: new Set(pages.map(f => f.replace(/\.html$/, ''))),
        lenses: new Set(lenses.lenses.map(l => l.id)),
        ids,
        features
    };
}

// A referrer is a host name, lower case, at least one dot. An IP address is
// refused as well: a referrer that is a bare address is someone's machine or
// network, and publishing it would be the opposite of the point.
const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// ------------------------------------------------------------------
// Cleaning: one raw row in, a clean row or the reason it was dropped out
// ------------------------------------------------------------------

function normaliseDate(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (DATE.test(v)) return isDate(v) ? v : null;
    // A sheet turns a typed YYYY-MM-DD into a date cell unless the column is
    // formatted as plain text, and Apps Script then serialises it as an
    // instant: Amsterdam midnight, written in UTC. Take it back to the date.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
        const t = new Date(v);
        return isNaN(t.getTime()) ? null : amsterdamDate(t);
    }
    return null;
}

/** @returns {{date,metric,key,count}|{skip:true}|{drop:string}} */
function normaliseRow(raw, known, today) {
    if (!Array.isArray(raw) || raw.length < 4) return { drop: 'not four columns' };

    const date = normaliseDate(raw[0]);
    if (!date) return { drop: 'date is not YYYY-MM-DD (format the sheet\'s date column as plain text)' };
    if (date > today) return { drop: 'date is in the future' };

    const metric = String(raw[1] == null ? '' : raw[1]).trim();
    if (!METRICS.includes(metric)) return { drop: 'unknown metric' };

    const count = typeof raw[3] === 'number' ? raw[3] : Number(String(raw[3]).trim());
    if (!Number.isInteger(count) || count < 0) return { drop: 'count is not a whole number' };

    // A leading apostrophe is how a sheet marks a cell as text; it is not data.
    const key = String(raw[2] == null ? '' : raw[2]).trim().replace(/^'/, '');

    if (UNKEYED.includes(metric)) {
        return key === '' ? { date, metric, key, count } : { drop: `${metric} carries a key` };
    }
    switch (metric) {
        case 'vp':
            return VIEWPORTS.includes(key) ? { date, metric, key, count } : { drop: 'unknown viewport class' };
        case 'page':
            return { date, metric, key: known.pages.has(key) ? key : 'other', count };
        case 'lens':
            // No lens is not a lens visit; those are the visits minus these.
            if (key === '') return { skip: true };
            return { date, metric, key: known.lenses.has(key) ? key : 'other', count };
        case 'deepest':
            if (key === '') return { skip: true };
            return { date, metric, key: known.ids.has(key) ? key : 'other', count };
        case 'feature':
            if (key === '') return { drop: 'feature has no name' };
            return { date, metric, key: known.features.has(key) ? key : 'other', count };
        case 'ref': {
            // '' is a page view with no referrer, or one from this site.
            const host = key.toLowerCase();
            if (host === '') return { date, metric, key: '', count };
            return { date, metric, key: HOST.test(host) && !IPV4.test(host) ? host : 'other', count };
        }
        default:
            return { drop: 'unknown metric' };
    }
}

function cleanRows(rawRows, known, today) {
    const rows = [];
    const dropped = {};
    rawRows.forEach((raw) => {
        const r = normaliseRow(raw, known, today);
        if (r.drop) dropped[r.drop] = (dropped[r.drop] || 0) + 1;
        else if (!r.skip) rows.push(r);
    });
    return { rows, dropped };
}

// ------------------------------------------------------------------
// Adding up
// ------------------------------------------------------------------

const publish = (n) => (n >= SUPPRESS_BELOW ? n : SMALL);

/**
 * A share, only from two counts that could each be published. A share over
 * 100% means the two totals disagree with each other; no number is better
 * than a wrong one.
 */
function share(part, whole) {
    if (part < SUPPRESS_BELOW || whole < SUPPRESS_BELOW || part > whole) return null;
    return Math.round((part / whole) * 1000) / 1000;
}

/** { metric: Map(key → summed count) } over the rows dated within [from, to]. */
function totals(rows, from, to) {
    const t = {};
    METRICS.forEach((m) => { t[m] = new Map(); });
    rows.forEach((r) => {
        if (r.date < from || r.date > to) return;
        t[r.metric].set(r.key, (t[r.metric].get(r.key) || 0) + r.count);
    });
    return t;
}

const sum = (map, keep = () => true) => Array.from(map).reduce((n, [k, v]) => n + (keep(k) ? v : 0), 0);

/**
 * The five numbers from docs/plan.md, Phase 1 step 5, plus page views for
 * scale. Each is defined as closely as daily per-field totals allow:
 *
 *   contact       accepted contact-form submissions
 *   cvDownloads   page views in which a feature named cv-download* was used
 *   lensVisits    page views that arrived with a known ?lens=. The plan asks
 *                 for lens visits that REACH a case study, but the totals are
 *                 kept per field, not per visit, so lens and section cannot be
 *                 joined. This is the closest honest proxy — an upper bound —
 *                 and stats.html labels it as one.
 *   contactShare  views whose deepest section was #contact, over homepage
 *                 views. #contact exists only on the homepage.
 *   briefUses     the brief-run feature; null until the site has a Brief
 */
function headline(t, known) {
    return {
        visits: publish(sum(t.visits)),
        contact: publish(sum(t.contact)),
        cvDownloads: publish(sum(t.feature, k => k.startsWith('cv-download'))),
        lensVisits: publish(sum(t.lens, k => k !== 'other')),
        contactShare: share(t.deepest.get('contact') || 0, t.page.get('index') || 0),
        briefUses: known.features.has('brief-run') ? publish(t.feature.get('brief-run') || 0) : null
    };
}

/**
 * Published cells first, largest first; then the suppressed ones in name
 * order, so the order cannot hint at which small count is larger; "other"
 * last.
 */
function ordered(entries) {
    const rank = ([k, n]) => (k === 'other' ? 2 : n >= SUPPRESS_BELOW ? 0 : 1);
    return entries.slice().sort((a, b) => rank(a) - rank(b) ||
        (rank(a) === 0 ? b[1] - a[1] : 0) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * One table per field: a row per key, with last week and all time side by
 * side. The rows are fixed by the all-time totals, so both columns always
 * describe the same keys.
 */
function breakdown(all, week) {
    const out = {};
    BREAKDOWNS.forEach((metric) => {
        let allMap = new Map(all[metric]);
        let weekMap = week ? new Map(week[metric]) : null;

        if (metric === 'ref') {
            // Hosts under 5 (and past the top few) are grouped, in both columns.
            const listed = new Set(ordered(Array.from(allMap).filter(([k, n]) => k !== '' && k !== 'other' && n >= SUPPRESS_BELOW))
                .slice(0, REFERRERS_LISTED).map(([k]) => k));
            const fold = (map) => {
                const folded = new Map();
                map.forEach((n, k) => {
                    const key = k === '' || listed.has(k) ? k : 'other';
                    folded.set(key, (folded.get(key) || 0) + n);
                });
                return folded;
            };
            allMap = fold(allMap);
            if (weekMap) weekMap = fold(weekMap);
        }

        out[metric] = ordered(Array.from(allMap)).map(([key, n]) => ({
            key,
            week: weekMap ? publish(weekMap.get(key) || 0) : null,
            all: publish(n)
        }));
    });
    return out;
}

/**
 * Bytes per page view. The daily totals hold summed KB and a page-view count,
 * so the mean is exact; a median of single page views is not recoverable, so
 * the other figure is the median of the daily means, over days with at least
 * 5 page views (a day with one reveals that one reader's figure).
 */
function bytes(rows, from, to) {
    const days = new Map();
    let visits = 0;
    let kb = 0;
    rows.forEach((r) => {
        if (r.date < from || r.date > to || (r.metric !== 'visits' && r.metric !== 'kb')) return;
        const d = days.get(r.date) || { visits: 0, kb: 0 };
        d[r.metric] += r.count;
        days.set(r.date, d);
        if (r.metric === 'visits') visits += r.count; else kb += r.count;
    });
    if (visits < SUPPRESS_BELOW) return null;

    const means = Array.from(days.values()).filter(d => d.visits >= SUPPRESS_BELOW)
        .map(d => d.kb / d.visits).sort((a, b) => a - b);
    const mid = Math.floor(means.length / 2);
    const median = !means.length ? null
        : means.length % 2 ? means[mid] : (means[mid - 1] + means[mid]) / 2;

    return { meanKb: Math.round(kb / visits), medianDayKb: median === null ? null : Math.round(median), days: means.length };
}

/**
 * Clean rows in, the whole of content/stats.json out.
 *
 * "Last week" is the last complete Monday-to-Sunday week before `today` (an
 * Amsterdam date): the Action runs early on Monday, when Monday's own totals
 * have barely begun.
 */
function transform(rows, { today, known }) {
    if (!rows.length) return null;

    const dates = rows.map(r => r.date).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];

    const weekStart = addDays(mondayOf(today), -7);
    const weekEnd = addDays(weekStart, 6);
    const hasWeek = weekEnd >= first;

    const all = totals(rows, first, last);
    const week = hasWeek ? totals(rows, weekStart, weekEnd) : null;

    const weeks = [];
    if (hasWeek) {
        for (let start = weekStart; addDays(start, 6) >= first && weeks.length < WEEKS_KEPT; start = addDays(start, -7)) {
            const end = addDays(start, 6);
            weeks.push(Object.assign({ start, end, partial: start < first }, headline(totals(rows, start, end), known)));
        }
    }

    return {
        $comment: COMMENT,
        v: 1,
        status: 'collecting',
        asOf: today,
        suppressBelow: SUPPRESS_BELOW,
        period: { first, last, days: daysBetween(first, last) },
        week: hasWeek ? { start: weekStart, end: weekEnd, partial: weekStart < first } : null,
        briefLive: known.features.has('brief-run'),
        headline: { week: week ? headline(week, known) : null, all: headline(all, known) },
        breakdown: breakdown(all, week),
        bytes: { week: hasWeek ? bytes(rows, weekStart, weekEnd) : null, all: bytes(rows, first, last) },
        weeks
    };
}

// ------------------------------------------------------------------
// Running it
// ------------------------------------------------------------------

/** The Apps Script endpoint needs ?action=stats; add it if the owner left it off. */
function sourceUrl(raw) {
    const url = new URL(raw);
    if (/(^|\.)script\.google(usercontent)?\.com$/.test(url.hostname) && !url.searchParams.has('action')) {
        url.searchParams.set('action', 'stats');
    }
    return url;
}

const inActions = process.env.GITHUB_ACTIONS === 'true';

function skip(why) {
    // A notice, not a failure: nothing is wrong, there is just nothing new.
    console.log(`${inActions ? '::notice title=fetch-stats::' : '  fetch-stats: '}${why}`);
    console.log('  content/stats.json left as it is.');
    process.exitCode = 0;
}

function fail(why) {
    console.error(`${inActions ? '::error title=fetch-stats::' : '  fetch-stats: '}${why}`);
    console.error('  content/stats.json left as it is.');
    process.exitCode = 1;
}

async function main() {
    const raw = (process.env.STATS_SOURCE_URL || '').trim();
    if (!raw) {
        return skip('STATS_SOURCE_URL is not set, so there is nothing to fetch yet. Set it as a repository ' +
            'variable (Settings → Secrets and variables → Actions) once the counter is live.');
    }

    let url;
    try {
        url = sourceUrl(raw);
    } catch (err) {
        return fail('STATS_SOURCE_URL is not a valid URL.');
    }
    // Only the host is ever printed: the URL may carry a token.
    const host = url.host;

    let text;
    try {
        const res = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { accept: 'application/json, text/csv;q=0.9, */*;q=0.1' }
        });
        if (res.status >= 500 || res.status === 429) {
            return skip(`${host} answered ${res.status}. That is theirs to fix; the next run will try again.`);
        }
        if (!res.ok) return fail(`${host} answered ${res.status}. Check STATS_SOURCE_URL.`);
        text = await res.text();
    } catch (err) {
        const code = (err.cause && err.cause.code) || err.name;
        return skip(`could not reach ${host} (${code}). The next run will try again.`);
    }

    let parsed;
    try {
        parsed = parseSource(text);
    } catch (err) {
        if (err instanceof SourceError) return fail(`${host}: ${err.message}.`);
        throw err;
    }

    const today = amsterdamDate(new Date());
    const known = knownNames();
    const { rows, dropped } = cleanRows(parsed.rows, known, today);
    Object.keys(dropped).forEach((why) => {
        console.log(`  fetch-stats: dropped ${dropped[why]} row(s): ${why}`);
    });
    if (!rows.length) {
        return parsed.rows.length
            ? fail(`none of the ${parsed.rows.length} row(s) from ${host} could be read; see the reasons above.`)
            : skip(`${host} has no daily totals yet.`);
    }

    const stats = transform(rows, { today, known });
    const problems = checkStats(stats);
    if (problems.length) {
        return fail(`the totals failed validation, so nothing was written:\n  - ${problems.join('\n  - ')}`);
    }

    fs.writeFileSync(OUT, `${JSON.stringify(stats, null, 2)}\n`);
    console.log(`  fetch-stats: ${rows.length} row(s) from ${host} (${parsed.format}), ` +
        `${stats.period.first} to ${stats.period.last} → ${path.relative(ROOT, OUT)}`);
    console.log('  Now run: npm run build:content');
}

if (require.main === module) {
    main().catch((err) => {
        // An unexpected error is a bug here, not a problem with the source.
        console.error(err && err.stack ? err.stack : err);
        process.exitCode = 1;
    });
}

module.exports = {
    SUPPRESS_BELOW,
    SMALL,
    METRICS,
    EMPTY,
    SourceError,
    parseCsv,
    parseSource,
    knownNames,
    normaliseRow,
    cleanRows,
    transform,
    sourceUrl,
    addDays,
    mondayOf,
    amsterdamDate,
    main
};
