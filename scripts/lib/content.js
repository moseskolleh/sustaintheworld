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

    const problems = [];
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

    if (problems.length) {
        throw new Error(`content failed validation:\n  - ${problems.join('\n  - ')}`);
    }

    return { profile, projects, research, lenses, narration, lensIds };
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
    load,
    loadAll,
    urlProblem,
    checkAvailability,
    orderForLens
};
