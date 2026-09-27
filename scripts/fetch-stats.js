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
//     Apps Script endpoint's JSON ({"v":1,"rows":[...]}, from
//     ?action=stats&token=..., which answers no one without the token) or
//     as a CSV the owner published with the header date,metric,key,count;
//   - it adds them up in whole weeks, Monday to Sunday: last week, all time
//     from the first full week to last Sunday, and one line per week. The
//     days before the first Monday, and today, are in no figure at all, so
//     no sum of the figures can leave a single day's count behind;
//   - every published count under 5 becomes the string "<5" and is left out
//     of every share, and referrer hosts under 5 fold into "other";
//   - where the rows of a table add up to a total shown beside them, a lone
//     "<5" would be the total less the rest, so the smallest figure beside
//     it is held back too, as the string "held", until nothing hidden can be
//     worked out (protect);
//   - it writes those totals to content/stats.json, never a daily row, and
//     scripts/lib/content.js refuses the file if any of that is broken.
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
// on yet, or because Google had a bad minute, and the same goes for the
// endpoint's own "error" reply, which is what a sheet that could not be
// read looks like from here. A source that answers with something that is
// not stats (a sign-in page, a CSV with the wrong header, a refusal of the
// token) is a configuration mistake, and that does fail.
//
// Nothing read from the source is ever printed. On a public repository the
// Action's log is public too, and the unsuppressed rows are exactly what must
// not leak — so problems are reported as counts and reasons, never contents.
// ===================================================================

const fs = require('fs');
const path = require('path');
const { checkStats, peel } = require('./lib/content.js');

const ROOT = path.join(__dirname, '..');
// STATS_OUT exists for tests/stats.test.js, which runs this script end to end
// against a local server and must not rewrite the repository's copy.
const OUT = process.env.STATS_OUT ? path.resolve(process.env.STATS_OUT) : path.join(ROOT, 'content', 'stats.json');

const SUPPRESS_BELOW = 5;
const SMALL = `<${SUPPRESS_BELOW}`;
// A count of 5 or more hidden so that a smaller one beside it cannot be
// worked out. It is not "<5": that would say something false about it.
const HELD = 'held';
const TIME_ZONE = 'Europe/Amsterdam';           // the date the Apps Script counts in
const METRICS = ['visits', 'page', 'lens', 'deepest', 'feature', 'ref', 'vp', 'kb', 'contact'];
const UNKEYED = ['visits', 'contact'];
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
    'Only suppressed aggregates of whole Monday-to-Sunday weeks are ever written here. Every',
    'count under 5 is the string "<5" and is left out of every share; a larger count that would',
    'let one be worked out by subtraction is the string "held"; referrer hosts under 5 are',
    'grouped as "other"; no daily row is kept. scripts/lib/content.js fails the build if any of',
    'that is broken.',
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
// The endpoint answered, but could not read its sheet this time.
class SourceBusy extends Error {}

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
        // Code.gs answers "refused" without the right token, and "error"
        // when its sheet could not be read (a Sheets timeout, most often).
        if (data && data.status === 'refused') {
            throw new SourceError('the counter endpoint refused the request. STATS_SOURCE_URL needs &token= set to the ' +
                'Apps Script\'s STATS_TOKEN property, and the Apps Script needs that property set');
        }
        if (data && data.status === 'error' && !('rows' in data)) {
            throw new SourceBusy('the counter endpoint could not read its sheet this time');
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
 * public page. A feature is known if a page or a script names it in
 * data-analytics (a module writes some of its own controls, such as the
 * player's offer of the introduction), if it is an on-demand module (as
 * "module-" and its file name, the name the counter gives a module once it
 * has been fetched), if it is one of the Assay's grades (as "assay-" and the
 * grade's class, the name it sends), or if a script tracks it by a literal
 * name.
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
        for (const m of js.matchAll(/\bdata-analytics="([a-z0-9-]{1,40})"/g)) features.add(m[1]);
        // A whole literal only: track('assay-' + grade) names no feature.
        for (const m of js.matchAll(/\btrack\(\s*['"]([a-z0-9-]{1,40})['"]\s*\)/g)) features.add(m[1]);
    });
    // The Assay composes its name from the grade's class, so read the classes.
    const assay = path.join(modulesDir, 'interactives.js');
    if (fs.existsSync(assay)) {
        for (const m of fs.readFileSync(assay, 'utf8').matchAll(/\bcls = '([a-z0-9-]{1,33})'/g)) features.add(`assay-${m[1]}`);
    }

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
        case 'kb':
            // Summed KB, keyed by the page it was measured on. A row with no
            // page (the first counter kept one daily sum) still counts in the
            // totals; it just cannot be split by page.
            if (key === '') return { date, metric, key, count };
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
            // Code.gs adds nothing for a page view with no referrer, or one
            // from this site, so there is no such row to read.
            const host = key.toLowerCase();
            if (host === '') return { skip: true };
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

/**
 * A count on its way to the page. It is hidden when it is under 5, and may
 * be hidden later however large it is, when showing it would let a hidden
 * one be worked out (protect, below); then it is "held", not "<5".
 */
const cell = (n) => ({ n, hidden: n < SUPPRESS_BELOW });
// A part of a sum that stats.html never shows (the weeks before last week).
// Working it out only matters while it is a count under 5.
const earlier = (n) => ({ n, hidden: true, earlier: true });
const shown = (c) => (!c.hidden ? c.n : c.n < SUPPRESS_BELOW ? SMALL : HELD);

/**
 * A share, only between two counts that are both shown: a share and either
 * one of its counts give the other away. A share over 100% means the two
 * totals disagree with each other; no number is better than a wrong one.
 */
function share(part, whole) {
    if (!part || !whole || part.hidden || whole.hidden || part.n > whole.n) return null;
    return Math.round((part.n / whole.n) * 1000) / 1000;
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

// Every CV link has a data-analytics name of its own (cv-download-hero,
// cv-download-nav, ...), and count.js adds this one name as well, once per
// page view, the first time any of them is clicked.
const CV = 'cv-download';

/**
 * The five numbers from docs/plan.md, Phase 1 step 5, plus page views for
 * scale, as cells. Each is defined as closely as daily per-field totals allow:
 *
 *   contact       accepted contact-form submissions, bar those from a browser
 *                 that asked not to be tracked (Code.gs)
 *   cvDownloads   page views in which any CV link was clicked: the one shared
 *                 name, so a view that used two CV links counts once
 *   lensVisits    page views that arrived with a known ?lens=. The plan asks
 *                 for lens visits that REACH a case study, but the totals are
 *                 kept per field, not per visit, so lens and section cannot be
 *                 joined. This is the closest honest proxy — an upper bound —
 *                 and stats.html labels it as one.
 *   briefUses     the brief-run feature; null until the site has a Brief
 *
 * (The fifth, the share of homepage views that reached #contact, is made
 * once suppression is done: see transform.) `row(name)` hands back the
 * feature table's own cell where the same count is shown there too, so the
 * two can never disagree.
 */
function figures(t, known, row = () => null) {
    const feature = name => row(name) || cell(t.feature.get(name) || 0);
    return {
        visits: cell(sum(t.visits)),
        contact: cell(sum(t.contact)),
        cvDownloads: feature(CV),
        lensVisits: cell(sum(t.lens, k => k !== 'other')),
        briefUses: known.features.has('brief-run') ? feature('brief-run') : null
    };
}

/**
 * One table per field: a row per key, with last week and all time side by
 * side, as cells. The rows are fixed by the all-time totals, so both columns
 * always describe the same keys.
 */
function tables(all, week) {
    const out = {};
    BREAKDOWNS.forEach((metric) => {
        let allMap = all[metric];
        let weekMap = week[metric];
        if (metric === 'ref') {
            // Hosts under 5 (and past the top few) are grouped, in both columns.
            const listed = new Set(Array.from(allMap).filter(([k, n]) => k !== 'other' && n >= SUPPRESS_BELOW)
                .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, REFERRERS_LISTED).map(([k]) => k));
            const fold = (map) => {
                const folded = new Map();
                map.forEach((n, k) => {
                    const key = listed.has(k) ? k : 'other';
                    folded.set(key, (folded.get(key) || 0) + n);
                });
                return folded;
            };
            allMap = fold(allMap);
            weekMap = fold(weekMap);
        }
        out[metric] = Array.from(allMap).map(([key, n]) => ({ key, week: cell(weekMap.get(key) || 0), all: cell(n) }));
    });
    return out;
}

/**
 * Complementary suppression. A cell under 5 is hidden, but where the cells
 * of a sum are all shown bar one, the one is the total less the rest: 50
 * page views, 47 of them on the homepage and the research page shown as
 * "<5", is 3 on the research page. So while any hidden count other than 0
 * can be worked out, from one sum or from a chain of them, the smallest
 * shown cell in the sum that gave it away is hidden too. A hidden 0 that
 * can be worked out is left alone: that nobody did something singles
 * nobody out, and hiding a second cell for it would only take information
 * away. Each pass hides one more cell, so this ends.
 */
function protect(sums) {
    for (;;) {
        const known = new Map();
        sums.forEach(s => s.cells.forEach((c) => { if (!c.hidden) known.set(c, c.n); }));
        const leak = peel(sums, known).find(f => (f.cell.earlier
            ? f.value > 0 && f.value < SUPPRESS_BELOW
            : f.cell.n !== 0 || f.value !== 0));
        if (!leak) return;
        const partner = leak.sum.cells.filter(c => !c.hidden).sort((a, b) => a.n - b.n)[0];
        // Only totals that do not add up (a hand-edited sheet) leave no cell
        // to hide; checkStats() then refuses the file rather than publish it.
        if (!partner) return;
        partner.hidden = true;
    }
}

/**
 * Shown rows first, largest first; then the hidden ones in name order, so
 * the order cannot hint at which hidden count is larger; "other" last.
 */
function ordered(rows) {
    const rank = r => (r.key === 'other' ? 2 : r.all.hidden ? 1 : 0);
    return rows.slice().sort((a, b) => rank(a) - rank(b) ||
        (rank(a) === 0 ? b.all.n - a.all.n : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
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

    // By page: that page's KB over its own page views, for pages with at
    // least 5 in the period. A mean over fewer would stand for one reader.
    // Only days whose KB was kept per page count: on a day of the first,
    // unkeyed counter the page views are there but their KB cannot be split,
    // and counting those views would pull every page's mean down.
    const keyedDays = new Set(rows.filter(r => r.metric === 'kb' && r.key !== '').map(r => r.date));
    const perPage = new Map();
    rows.forEach((r) => {
        if (r.date < from || r.date > to || !keyedDays.has(r.date) || r.key === '' ||
            (r.metric !== 'page' && r.metric !== 'kb')) return;
        const p = perPage.get(r.key) || { views: 0, kb: 0 };
        if (r.metric === 'page') p.views += r.count; else p.kb += r.count;
        perPage.set(r.key, p);
    });
    const byPage = Array.from(perPage.entries())
        .filter(([, p]) => p.views >= SUPPRESS_BELOW && p.kb > 0)
        .map(([page, p]) => ({ page, meanKb: Math.round(p.kb / p.views) }))
        .sort((a, b) => (a.page < b.page ? -1 : a.page > b.page ? 1 : 0));

    return { meanKb: Math.round(kb / visits), medianDayKb: median === null ? null : Math.round(median), days: means.length, byPage };
}

/**
 * Clean rows in, the whole of content/stats.json out, or null while no
 * full week has ended yet.
 *
 * Every figure covers whole Monday-to-Sunday weeks. "Last week" is the last
 * one before `today` (an Amsterdam date): the Action runs early on Monday,
 * when Monday's own totals have barely begun. "All time" runs from the first
 * Monday on or after the first counted day to that Sunday. Were it to take
 * in the days before that Monday, or today, all time less the weeks would
 * be a part week's count, or a single day's.
 */
function transform(rows, { today, known }) {
    if (!rows.length) return null;

    const counted = rows.reduce((d, r) => (r.date < d ? r.date : d), rows[0].date);
    const first = mondayOf(counted) === counted ? counted : addDays(mondayOf(counted), 7);
    const weekStart = addDays(mondayOf(today), -7);
    const weekEnd = addDays(weekStart, 6);
    if (weekStart < first) return null;
    const last = weekEnd;

    const spans = [];
    for (let start = weekStart; start >= first && spans.length < WEEKS_KEPT; start = addDays(start, -7)) {
        spans.push({ start, end: addDays(start, 6), t: totals(rows, start, addDays(start, 6)) });
    }
    const all = totals(rows, first, last);
    const table = tables(all, spans[0].t);
    const row = col => name => (table.feature.find(r => r.key === name) || {})[col] || null;
    const allFig = figures(all, known, row('all'));
    const weekFig = spans.map((s, i) => figures(s.t, known, i === 0 ? row('week') : undefined));

    // Every sum a reader of the page can do (the same list checkStats makes
    // from the published file): each page view has one page and one window
    // class, the known lenses add up to the lens-link visits, and while the
    // week-by-week lines reach back to the first week they add up to all time.
    const sums = [];
    [['all', allFig], ['week', weekFig[0]]].forEach(([col, f]) => {
        sums.push({ cells: [f.visits, ...table.page.map(r => r[col])] });
        sums.push({ cells: [f.visits, ...table.vp.map(r => r[col])] });
        sums.push({ cells: [f.lensVisits, ...table.lens.filter(r => r.key !== 'other').map(r => r[col])] });
    });
    // All time is last week plus everything before it, and what came before
    // is shown nowhere: 12 all time and 9 last week are 3 before it. Each
    // such remainder is a part of its sum that is never shown (earlier()).
    BREAKDOWNS.forEach((metric) => {
        table[metric].forEach(r => sums.push({ cells: [r.all, r.week, earlier(r.all.n - r.week.n)] }));
    });
    const reachBack = spans[spans.length - 1].start === first;
    Object.keys(allFig).forEach((k) => {
        if (!allFig[k]) return;
        const lines = weekFig.map(w => w[k]);
        sums.push({ cells: reachBack ? [allFig[k], ...lines]
            : [allFig[k], ...lines, earlier(allFig[k].n - lines.reduce((n, c) => n + c.n, 0))] });
    });
    protect(sums.filter(s => s.cells.length > 1));

    // Homepage views that reached #contact: from the table's own cells for
    // the two columns it is shown beside, so a hidden one stays hidden.
    const find = (metric, key) => table[metric].find(r => r.key === key) || {};
    const reached = (col, t) => (col
        ? share(find('deepest', 'contact')[col], find('page', 'index')[col])
        : share(cell(t.deepest.get('contact') || 0), cell(t.page.get('index') || 0)));
    const publishFigures = (f, contactShare) => ({
        visits: shown(f.visits),
        contact: shown(f.contact),
        cvDownloads: shown(f.cvDownloads),
        lensVisits: shown(f.lensVisits),
        contactShare,
        briefUses: f.briefUses ? shown(f.briefUses) : null
    });
    const weeks = spans.map((s, i) => Object.assign({ start: s.start, end: s.end },
        publishFigures(weekFig[i], reached(i === 0 ? 'week' : null, s.t))));

    const breakdown = {};
    BREAKDOWNS.forEach((metric) => {
        breakdown[metric] = ordered(table[metric]).map(r => ({ key: r.key, week: shown(r.week), all: shown(r.all) }));
    });

    const { start, end, ...lastWeek } = weeks[0];
    return {
        $comment: COMMENT,
        v: 1,
        status: 'collecting',
        asOf: today,
        suppressBelow: SUPPRESS_BELOW,
        period: { first, last, days: daysBetween(first, last) },
        week: { start, end },
        briefLive: known.features.has('brief-run'),
        headline: { week: lastWeek, all: publishFigures(allFig, reached('all')) },
        breakdown,
        bytes: { week: bytes(rows, weekStart, weekEnd), all: bytes(rows, first, last) },
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
        return skip('STATS_SOURCE_URL is not set, so there is nothing to fetch yet. Once the counter is live, set it ' +
            'as a repository SECRET (Settings → Secrets and variables → Actions → Secrets): the Apps Script address ' +
            'with ?action=stats&token=... carries the token that guards the unsuppressed daily totals.');
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
        if (err instanceof SourceBusy) return skip(`${host}: ${err.message}. The next run will try again; if every run says this, the Apps Script's executions log says why.`);
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
    if (!stats) {
        return skip(`${host} has counts, but no full week of them, Monday to Sunday, has ended yet. ` +
            'Nothing is published until one has.');
    }
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
    HELD,
    METRICS,
    EMPTY,
    SourceError,
    SourceBusy,
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
