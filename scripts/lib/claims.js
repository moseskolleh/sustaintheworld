'use strict';
// ===================================================================
// CLAIMS — reading a figure, in digits or in words
//
// The claims ledger (content/claims.json) holds every number the site
// prints, with its basis. Three things have to read figures to hold the
// pages to it, and they must read them the same way:
//
//   scripts/build-content.js   marks a figure in content/ text with the
//                              ledger entry it is (markFigures), so the
//                              generated pages carry the same
//                              <span data-claim="…"> as the hand-authored
//                              ones
//   scripts/lib/content.js     checks that each entry's other forms, and
//                              what the narration says aloud, come to the
//                              entry's own value (quantity)
//   tests/claims.test.js       finds every number on every page, in digits
//                              or in words, and every size said in words
//                              ("a fifth", "twice", "an order of
//                              magnitude"), and fails on one that is
//                              neither marked nor one of the EXEMPT (or, in
//                              words, WORD_EXEMPT) kinds below
//
// So the rules live here, once. A figure is compared by what it amounts
// to, not by how it is written: "70%", "7 in 10", "7 times out of 10" and
// "seventy per cent" are one strike rate, and "a hundred and sixty-four"
// is 164. That is what lets the spoken page be held to the ledger too.
// ===================================================================

// ------------------------------------------------------------------
// Numbers in words
// ------------------------------------------------------------------
const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { hundred: 100, thousand: 1000, million: 1e6 };
const WORD_VALUE = Object.assign(Object.fromEntries(UNITS.map((w, i) => [w, i])), TENS, SCALES);

/**
 * The runs of number words in a text, each with its value and where it
 * sits: "a hundred and sixty-four" is one run (164), "twenty-thirteen and
 * twenty-nineteen" two. "and" joins only after a hundred or a thousand, as
 * in British English, and "a" counts only before one.
 */
function wordRuns(text) {
    const tokens = [];
    const re = /[A-Za-z]+/g;
    let m;
    while ((m = re.exec(text))) tokens.push({ w: m[0].toLowerCase(), index: m.index, end: m.index + m[0].length });
    const joined = (a, b) => /^[\s-]+$/.test(text.slice(a.end, b.index));   // a space or a hyphen between
    const isNum = (t) => t && Object.prototype.hasOwnProperty.call(WORD_VALUE, t.w);
    const runs = [];
    for (let i = 0; i < tokens.length; i++) {
        let start = i;
        if (tokens[i].w === 'a' && isNum(tokens[i + 1]) && SCALES[tokens[i + 1].w] && joined(tokens[i], tokens[i + 1])) start = i + 1;
        else if (!isNum(tokens[i])) continue;
        const parts = [tokens[start]];
        let j = start + 1;
        while (j < tokens.length) {
            const prev = parts[parts.length - 1];
            if (isNum(tokens[j]) && joined(prev, tokens[j])) { parts.push(tokens[j]); j++; continue; }
            if (tokens[j].w === 'and' && SCALES[prev.w] && isNum(tokens[j + 1]) && !SCALES[tokens[j + 1].w]
                && joined(prev, tokens[j]) && joined(tokens[j], tokens[j + 1])) { parts.push(tokens[j + 1]); j += 2; continue; }
            break;
        }
        runs.push({ text: text.slice(tokens[i].index, parts[parts.length - 1].end), index: tokens[i].index,
            end: parts[parts.length - 1].end, value: wordsValue(parts.map(p => p.w)) });
        i = j - 1;
    }
    return runs;
}

/** ["a", "hundred", "sixty", "four"] → 164; "twenty", "thirteen" → 2013 (a year, read as one). */
function wordsValue(words) {
    let total = 0;
    let group = 0;
    let last = null;
    words.forEach((w) => {
        const v = WORD_VALUE[w];
        if (SCALES[w] === 100) group = (group || 1) * 100;
        else if (SCALES[w]) { total += (group || 1) * v; group = 0; }
        // "twenty thirteen", "twenty twenty-one": a year, spoken as two numbers.
        else if (last !== null && !SCALES[last] && WORD_VALUE[last] >= 10 && v >= 10) group = group * 100 + v;
        else group += v;
        last = w;
    });
    return total + group;
}

// ------------------------------------------------------------------
// A figure as written, and what it amounts to
// ------------------------------------------------------------------
// Digits: 164, 10,226, 0.36, 7.8. Thousands grouped in threes, or not at all.
const DIGITS = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const plain = (s) => String(s)
    .replace(/&nbsp;| /g, ' ')
    .replace(/&ndash;|&#8211;|&mdash;|&#8212;|—/g, '–')
    .replace(/&times;/g, '×')
    .replace(/&amp;/g, '&');

/** Every number in a text, written in digits or in words, in order. */
function numbers(text) {
    const s = plain(text);
    const found = [];
    let m;
    DIGITS.lastIndex = 0;
    while ((m = DIGITS.exec(s))) found.push({ index: m.index, end: m.index + m[0].length, value: Number(m[0].replace(/,/g, '')) });
    wordRuns(s).forEach(r => found.push({ index: r.index, end: r.end, value: r.value }));
    return { s, found: found.sort((a, b) => a.index - b.index) };
}

/**
 * What a figure amounts to: { n } for a count or a measure, { n, ratio }
 * for a share (70% and 7 in 10 are both 0.7), { lo, hi } for a range,
 * { over } for "more than". Approximation marks (~, ≈, about) are part of
 * how it is said, not of what it is. Null when the text is not one figure.
 */
function quantity(text) {
    const { s, found } = numbers(text);
    const between = (a, b) => s.slice(a.end, b.index);
    if (found.length === 2) {
        const [a, b] = found;
        if (/^\s*–\s*$|^-$/.test(between(a, b))) return { lo: a.value, hi: b.value };
        if (/^\s*\/\s*$/.test(between(a, b)) || /\b(?:in|out of)\s*$/i.test(between(a, b))) return { n: a.value / b.value, ratio: true };
        return null;
    }
    if (found.length !== 1) return null;
    const [a] = found;
    if (/^\s*(?:%|per ?cent\b|percent\b)/i.test(s.slice(a.end))) return { n: a.value / 100, ratio: true };
    if (/\b(?:more than|over)\s*$/i.test(s.slice(0, a.index))) return { over: a.value };
    return { n: a.value };
}

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Whether a figure as written (`shown`) says what the ledger's value says.
 * "More than ten thousand" agrees with 10,226; a share agrees only with a
 * share, so 70% is not 0.7.
 */
function agrees(value, shown) {
    const v = typeof value === 'string' ? quantity(value) : value;
    const s = typeof shown === 'string' ? quantity(shown) : shown;
    if (!v || !s) return false;
    if (s.over !== undefined) return v.n !== undefined && v.n > s.over;
    if (v.lo !== undefined || s.lo !== undefined) return close(v.lo, s.lo) && close(v.hi, s.hi);
    return !!v.ratio === !!s.ratio && close(v.n, s.n);
}

// ------------------------------------------------------------------
// Numerals that are not claims
//
// A year, a section number, the name of a standard, a place's coordinates:
// each is a numeral and none is a figure anyone could ask the basis of. A
// numeral is let through when one of these covers it, in the text around
// it; the reason is printed with it whenever the scan wants to explain.
// Keep the list short and each pattern narrow: everything it lets through
// is a numeral the ledger never sees.
// ------------------------------------------------------------------
const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const EXEMPT = [
    { why: 'a year', re: /(?<![\d.,])(?:19|20)\d{2}(?![\d%×]|[.,]\d)/g },
    { why: 'a date', re: new RegExp(`(?<![\\d.,])\\d{1,2} ${MONTH}`, 'g') },
    { why: 'a date, written as the ISO standard writes it', re: /\b(?:19|20)\d{2}-[01]\d-[0-3]\d\b/g },
    { why: 'a section or step number, zero-padded', re: /(?<![\d.,])0\d(?![\d%]|[.,]\d)/g },
    { why: 'a section number, named as one', re: /\b[Ss]ection \d+(?:\.\d+)*\b/g },
    { why: 'a list ordinal', re: /\[\d{1,2}\]/g },
    { why: 'the name of a standard or a reporting line', re: /\b(?:Scopes? \d(?:\s*(?:[–-]|to|and|,)\s*\d)*|category \d+|SDGs? \d+(?:\s*(?:&|and)\s*\d+)?|ISO \d+|IFRS S\d(?:\s*[&/]\s*S\d)?|E\d(?:-\d+)?|GRI \d{3}(?:(?:\s*[/,]\s*|,? and )\d{3})*)\b/g },
    { why: 'the name of a statistic (a 20-year return level)', re: /\b\d+-year return (?:levels?|periods?)\b/g },
    { why: 'the name of a cohort', re: /\bCohort \d+\b/g },
    { why: 'a place\'s coordinates', re: /\d+(?:\.\d+)?° ?[NSEW]\b/g },
    { why: 'a phone number', re: /\+\d{1,3}(?:[  ]\d{2,4}){2,4}/g },
    { why: 'an HTTP status code', re: /\b(?:error|HTTP) 404\b/g },
    { why: 'a unit: per thousand tokens', re: /\b(?:per[- ]|Wh\/)1k\b/g },
    { why: 'a model\'s size, as its name gives it (a 1B model)', re: /\b\d+B model\b/g },
    { why: 'a dataset\'s name (Natural Earth\'s 1:50m coastlines)', re: /\bNatural Earth \d+ ?m\b/g },
    { why: 'a version number', re: /\bv?\d+\.\d+\.\d+\b/g },
    { why: 'a version, named as one (version 2, GAIA 1.0)', re: /\b(?:[Vv]ersion|GAIA(?: Framework)?) \d+(?:\.\d+)*\b/g },
    { why: 'a CSS length', re: /\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|dvh|ms)\b/g }
];

/** Why a numeral at [index, end) of `text` is not a claim, or null. */
function exemptAt(text, index, end) {
    for (const { why, re } of EXEMPT) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(text))) {
            if (m.index <= index && m.index + m[0].length >= end) return why;
            if (m.index > index) break;
        }
    }
    return null;
}

// ------------------------------------------------------------------
// Numbers in words that are not claims
//
// The site writes small counts in words ("a team of six", "four
// certificates"), and the narration says every figure that way ("a hundred
// and sixty-four water points"). A count in words that is a figure is a
// ledger entry like any other: the pages mark it, and the narration's has
// to be an entry's `spoken` phrase. These are the words that are numbers
// without being figures: "one" as in "one thread", a name (net zero), the
// ordinals of a spoken list, and counts of things the page or the section
// shows in full, so the reader could count them there.
// ------------------------------------------------------------------
const SMALL = '(?:one|two|three|four|five|six|seven|eight|nine|ten)';

// Each says what it counts and how to count it (in content/, on a page, or
// in a script's source): tests/claims.test.js holds the words to that
// number, so "seven case studies" cannot outlive an eighth. Where the things
// are named in the same breath ("four modules, Ground, Assess, Interpret
// and Act"), the sentence is its own check.
const SHOWN_IN_FULL = [
    { re: /\bsix projects\b/gi, what: 'the homepage\'s project cards',
      count: d => d.projects.caseStudies.filter(cs => cs.homepageCard !== false).length },
    { re: /\bseven case studies\b/gi, what: 'the case studies', count: d => d.projects.caseStudies.length },
    { re: /\bthree degrees\b/gi, what: 'the degrees', count: d => d.profile.education.length },
    { re: /\bfour certificates\b/gi, what: 'the certificates', count: d => d.profile.certifications.length },
    { re: /\btwo of them you can play with\b/gi, what: 'the case studies with a game', count: d => d.projects.caseStudies.filter(cs => cs.widget).length },
    { re: /\bthree field notes\b/gi, what: 'the homepage\'s field notes', count: d => d.page('index.html').querySelectorAll('#notes .fieldnote').length },
    { re: /\bthree smallest models\b/gi, what: 'the models the homepage chart plots before the reader draws',
      count: d => Number((d.source('modules/interactives.js').match(/\bconst KNOWN = (\d+);/) || [])[1]) },
    { re: /\bfour modules, Ground, Assess, Interpret and Act\b/g, what: 'GAIA\'s modules, named after the count', named: true },
    { re: /\btwo ESRS lines quantified\b/g, what: 'Anatomy of a Prompt\'s Scope 2 and cooling water, named just before the count', named: true },
    { re: /\bfive things to try\b/gi, what: 'the links of the homepage\'s play index, after it',
      count: d => d.page('index.html').querySelectorAll('.play-index a').length },
    { re: /\bfive numbers\b/gi, what: 'the open counts page\'s measures, a card each',
      count: d => d.page('stats.html').querySelectorAll('.st-five > .st-card').length },
    { re: /\bthree classes\b/gi, what: 'the window-width classes a page view sends, s, m and l, each named on the page',
      count: d => (d.source('scripts/fetch-stats.js').match(/\bconst VIEWPORTS = \[([^\]]*)\]/) || ['', ''])[1].split(',').filter(s => s.trim()).length }
];
const shownInFull = { why: 'a count of what the page shows in full, every one of them on it', res: SHOWN_IN_FULL.map(c => c.re) };

// ------------------------------------------------------------------
// Numerals a page draws from its own structure
//
// The core log's depth scale, a photo row's count, the flood game's river
// steps: numerals that are not claims about anything, which the scan
// (tests/claims.test.js) skips by selector, each with its reason. A count
// of what the page shows is already in claims.html's "Not on this list";
// the rest say there what they are (`listed`), from here, so the page and
// the test cannot name different exceptions. `once` marks a host that is
// on its page only in one state of it.
// ------------------------------------------------------------------
const DRAWN = {
    'index.html': [
        { sel: '.corelog-depth, .corelog-head', why: 'the core log\'s depth scale: time drawn as depth',
          listed: 'the core log’s depths, which draw time as depth from the dates beside them' }],
    'case-studies.html': [
        { sel: '.cs-photos > summary', why: 'a count of the photos in the row, made from the gallery' },
        { sel: '.cs-method-n', why: 'a count of the method\'s steps, made from the list it folds' },
        { sel: '.flood-ticks', why: 'the river slider\'s steps, on a schematic not drawn to scale',
          listed: 'the flood game’s river steps, on a schematic not drawn to scale' }],
    'research.html': [{ sel: '.rs-summary', why: 'a count of the entries the page lists, made from them' }],
    // The open counts page: its counts are the counter's, rewritten each
    // week, and its rules are marked [data-rule] and held to the code.
    'stats.html': [
        { sel: '.st-table-wrap, .st-values, .st-status', why: 'the visit counter\'s own counts, rewritten each week', once: 'counting has started' },
        { sel: '.st-payload', why: 'the example of what a page view sends, which the page says is one' }]
};
const ONE = { why: '"one", a word before it is a count', test: (run) => run.value === 1 && /^one$/i.test(run.text) };

/**
 * The fold a figure waits in on its page, or null: a closed <details> (its
 * summary is in sight), a [hidden] block (not a view's panel, which its
 * view shows), or a role on the homepage past its first line, which
 * style.css folds behind More until the card is open. build-content.js's
 * marksIn finds the same three in the HTML, to send claims.html's "Where"
 * links to a figure in sight; this reads a page's DOM, in jsdom
 * (tests/claims.test.js) or in a browser (scripts/smoke.js).
 */
function foldAround(el) {
    const shut = el.closest('details:not([open])');
    const summary = el.closest('summary');
    if (shut && !(summary && summary.parentElement === shut)) return shut;
    const hidden = el.closest('[hidden]:not([data-lens-panel])');
    if (hidden) return hidden;
    const item = el.closest('.timeline-content:not(.is-open) ul > li:nth-child(n+2)');
    return item ? item.closest('.timeline-content') : null;
}

// ------------------------------------------------------------------
// Sizes in words
//
// "This answer boiled a fifth of a kettle", "nearly twice as much",
// "millions of queries": a quantity with no numeral in it, which the
// numbers above never see, so a page could say one with no basis at all
// (the kettle had none). These are found too: a fraction after a count
// ("a fifth of", "two thirds", and "half"), a multiplier ("twice",
// "tenfold"), a magnitude, and the plural scales. An ordinal ("a third
// line") is not a size and is left. A size the site says is either
// reworded into a figure the ledger holds, or is one of HELD_SIZES: what
// it sums up is named, and tests/claims.test.js checks it still does.
// ------------------------------------------------------------------
// "A third of" is a share and "a third line" a third one: a single part
// counts only before "of"; "two thirds" is a share either way.
const PART = '(?:third|quarter|fifth|sixth|seventh|eighth|ninth|tenth)';
const SIZES = new RegExp(`\\b(?:(?:an?|one)[\\s-]+${PART}(?=\\s+of\\b)|(?:two|three|four|five|six|seven|eight|nine)[\\s-]+${PART}s|halves|half|twice|${SMALL}fold|\\d+-?fold|hundredfold|thousandfold|orders? of magnitude|dozens|hundreds|thousands|millions|billions)\\b`, 'gi');

/** The sizes said in words in a text, each with where it sits. */
function sizeRuns(text) {
    const runs = [];
    SIZES.lastIndex = 0;
    let m;
    while ((m = SIZES.exec(text))) runs.push({ text: m[0], index: m.index, end: m.index + m[0].length, size: true });
    return runs;
}

// Each says what it sums up and how to test that it still does, against
// the calculator's factor set (ai-carbon-data.js).
const HELD_SIZES = [
    { re: /\ban order of magnitude\b/gi,
      what: 'the factor set: its models more than ten times apart, each estimate good to within ten times',
      holds: (f) => {
          const wh = Object.values(f.MODELS).map(m => m.energyPer1kTokens_Wh);
          const spread = Math.max(...wh) / Math.min(...wh);
          const loose = Object.values(f.MODELS).filter(m => m.range[1] / m.range[0] >= 10).map(m => m.label);
          return { ok: spread > 10 && !loose.length, said: `${Math.round(spread)}× apart${loose.length ? `; ranges of ten times or more: ${loose.join(', ')}` : ''}` };
      } }
];
const heldSizes = { why: 'a size the calculator\'s factor set shows, held to it', res: HELD_SIZES.map(h => h.re) };

/** On the pages (tests/claims.test.js reads them with these). */
const WORD_EXEMPT = [
    ONE,
    { why: 'a name: net zero, the Big Four', res: [/\bnet[- ]zero\b/gi, /\bBig Four\b/g] },
    { why: '"near zero": nothing, not a figure', res: [/\bnear zero\b/gi] },
    shownInFull,
    heldSizes
];

/** In the narration, which also says years and the ordinals of its lists. */
const SPOKEN_EXEMPT = [
    { why: 'a year, said aloud', test: (run) => run.value >= 1900 && run.value < 2100 },
    ONE,
    { why: 'a list ordinal ("One, the sustainable A.I. framework")', res: [new RegExp(`(?:^|[.:!?]\\s+)(?:And\\s+)?${SMALL},`, 'gi')] },
    { why: 'the name of a standard (Scopes 1 to 3)', res: [/\bscopes? one to three\b/gi] },
    shownInFull,
    heldSizes
];

/** Why a run of number words in `text` is not a figure, by `rules`, or null. */
function wordExemptBy(rules, text, run) {
    for (const rule of rules) {
        if (rule.test && rule.test(run)) return rule.why;
        for (const re of rule.res || []) {
            re.lastIndex = 0;
            let m;
            while ((m = re.exec(text))) {
                if (m.index <= run.index && m.index + m[0].length >= run.end) return rule.why;
            }
        }
    }
    return null;
}
const spokenExempt = (text, run) => wordExemptBy(SPOKEN_EXEMPT, text, run);
const wordExempt = (text, run) => wordExemptBy(WORD_EXEMPT, text, run);

// ------------------------------------------------------------------
// Marking figures in content/ text
//
// The generated pages print figures straight from content/ — a result's
// "70% aquifer strike rate", a lens's "~276 KB", a team "of six". Each is
// found here by how the ledger writes it (its value or one of its `forms`)
// and wrapped in the entry's mark, so a generated page is held to the
// ledger as the hand-authored ones are. A single digit is never matched: in
// running prose it is far more often a word than a figure. A bare
// two-digit number is matched only with the first word of its entry's unit
// after it ("54 global", "10 KB"): plenty of other things come in tens and
// fifties, and two entries may share one so (10 KB, 10 models). A number
// in words is matched only as a form that says what it counts ("team of
// six", "five months"), never on its own, and the mark covers the number
// alone; its first letter may be a capital, as at the start of a sentence.
// ------------------------------------------------------------------
const wordForm = (shown) => !/\d/.test(shown) && wordRuns(shown).length > 0 && /[\s-]/.test(shown.trim());
const markable = (shown) => (/\d/.test(shown) && !/^\d$/.test(shown)) || wordForm(shown);

/** The displays the marker looks for: each written figure with its claim id, longest first. */
function displays(claims) {
    const list = [];
    claims.forEach((c) => {
        [c.value].concat(c.forms || []).filter(markable).forEach((shown) => {
            list.push({ shown, id: c.id });
            const capital = shown.charAt(0).toUpperCase() + shown.slice(1);
            if (wordForm(shown) && capital !== shown) list.push({ shown: capital, id: c.id });
        });
    });
    return list.sort((a, b) => b.shown.length - a.shown.length);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How the marker looks for one written figure: a bare pair of digits wants its unit after it. */
function pattern(shown, claim) {
    if (!/^\d{2}$/.test(shown)) return escapeRe(shown);
    const word = String(claim.unit || '').split(/[\s:;,]+/)[0];
    return `${shown}(?=[ \\u00a0]+${escapeRe(word)}\\b)`;
}

/**
 * A function that cuts plain text into [text, claimId] segments: the
 * figures the ledger knows, and everything between. A figure inside a
 * longer number ("164" in "1640"), or one of the EXEMPT kinds, is left.
 */
function marker(claims) {
    const list = displays(claims);
    if (!list.length) return (s) => [[String(s == null ? '' : s), null]];
    const byId = new Map(claims.map(c => [c.id, c]));
    // One group per display, so a match says which it was: "10" before
    // "KB" and "10" before "models" are two entries.
    const alternatives = list.map(d => `(${pattern(d.shown, byId.get(d.id))})`);
    const re = new RegExp(`(?<![\\w.,~≈+/–-])(?:${alternatives.join('|')})(?![\\w%×/]|[.,]\\d)`, 'g');
    return (s) => {
        const text = String(s == null ? '' : s);
        const out = [];
        let at = 0;
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
            if (exemptAt(text, m.index, m.index + m[0].length)) continue;
            const id = list[m.slice(1).findIndex(g => g !== undefined)].id;
            // A form with words in it ("team of six", "54 hazard systems")
            // marks its number and leaves the words around it.
            let [from, to] = [m.index, m.index + m[0].length];
            if (/[A-Za-z]/.test(m[0])) {
                const found = numbers(m[0]).found;
                [from, to] = [m.index + found[0].index, m.index + found[found.length - 1].end];
            }
            if (from > at) out.push([text.slice(at, from), null]);
            out.push([text.slice(from, to), id]);
            at = to;
        }
        if (at < text.length || !out.length) out.push([text.slice(at), null]);
        return out;
    };
}

/**
 * The numbers in a text the ledger cannot mark: neither one of its figures,
 * written as it writes them, nor one of the EXEMPT or WORD_EXEMPT kinds.
 * For text the build marks but did not write (a testimonial, a
 * certificate's line), so it can refuse one the pages would print unmarked.
 */
function unheld(text, claims) {
    const s = plain(text);
    const marked = [];
    let at = 0;
    marker(claims)(s).forEach(([t, id]) => { if (id) marked.push([at, at + t.length]); at += t.length; });
    const inMark = (a, b) => marked.some(([x, y]) => x <= a && y >= b);
    const out = [];
    DIGITS.lastIndex = 0;
    let m;
    while ((m = DIGITS.exec(s))) {
        const [a, b] = [m.index, m.index + m[0].length];
        // As the page scan reads them: a digit after a letter is part of a
        // name ("S1", "R1"), not a number.
        if (/[A-Za-z]/.test(s.charAt(a - 1))) continue;
        if (!inMark(a, b) && !exemptAt(s, a, b)) out.push(m[0]);
    }
    wordRuns(s).concat(sizeRuns(s)).forEach((r) => { if (!inMark(r.index, r.end) && !wordExempt(s, r)) out.push(r.text); });
    return out;
}

module.exports = { unheld, wordRuns, sizeRuns, numbers, quantity, agrees, EXEMPT, exemptAt, SHOWN_IN_FULL, DRAWN, foldAround, HELD_SIZES, WORD_EXEMPT, wordExempt, SPOKEN_EXEMPT, spokenExempt, markable, displays, pattern, marker, plain };
