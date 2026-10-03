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
//   tests/claims.test.js       finds every numeral on every page and fails
//                              on one that is neither marked nor one of the
//                              EXEMPT kinds below
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
    { why: 'the name of a standard or a reporting line', re: /\b(?:Scopes? \d(?:\s*(?:[–-]|to|and)\s*\d)?|category \d+|SDGs? \d+(?:\s*(?:&|and)\s*\d+)?|ISO \d+|IFRS S\d(?:\s*[&/]\s*S\d)?|E\d(?:-\d+)?|GRI \d{3}(?:(?:\s*[/,]\s*|,? and )\d{3})*)\b/g },
    { why: 'the name of a statistic (a 20-year return level)', re: /\b\d+-year return (?:levels?|periods?)\b/g },
    { why: 'the name of a cohort', re: /\bCohort \d+\b/g },
    { why: 'a place\'s coordinates', re: /\d+(?:\.\d+)?° ?[NSEW]\b/g },
    { why: 'a phone number', re: /\+\d{1,3}(?:[  ]\d{2,4}){2,4}/g },
    { why: 'an HTTP status code', re: /\b(?:error|HTTP) 404\b/g },
    { why: 'a unit: per thousand tokens', re: /\bper[- ]1k\b/g },
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
// Numbers the narration says that are not claims
//
// The spoken page says its figures in words ("a hundred and sixty-four
// water points"), and every one has to be an entry's `spoken` phrase. These
// are the words that are numbers without being figures: years, "one" as in
// "one thread", the ordinals of a spoken list, and counts of things the
// section shows in full, so the listener could count them on the page.
// ------------------------------------------------------------------
const SMALL = '(?:one|two|three|four|five|six|seven|eight|nine|ten)';
const SPOKEN_EXEMPT = [
    { why: 'a year, said aloud', test: (run) => run.value >= 1900 && run.value < 2100 },
    { why: '"one", a word before it is a count', test: (run) => run.value === 1 && /^one$/i.test(run.text) },
    { why: 'a list ordinal ("One, the sustainable A.I. framework")', re: new RegExp(`(?:^|[.:!?]\\s+)(?:And\\s+)?${SMALL},`, 'gi') },
    { why: 'the name of a standard (Scopes 1 to 3)', re: /\bscopes? one to three\b/gi },
    { why: 'a count of what the section shows, every one of them on the page',
      re: /\b(?:six projects|three field notes|three smallest models|two of them|three degrees|four certificates)\b/gi }
];

/** Why a run of number words the narration says is not a figure, or null. */
function spokenExempt(text, run) {
    for (const rule of SPOKEN_EXEMPT) {
        if (rule.test && rule.test(run)) return rule.why;
        if (!rule.re) continue;
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(text))) {
            if (m.index <= run.index && m.index + m[0].length >= run.end) return rule.why;
        }
    }
    return null;
}

// ------------------------------------------------------------------
// Marking figures in content/ text
//
// The generated pages print figures straight from content/ — a result's
// "70% aquifer strike rate", a lens's "~275 KB". Each is found here by how
// the ledger writes it (its value or one of its `forms`) and wrapped in the
// entry's mark, so a generated page is held to the ledger as the
// hand-authored ones are. A single digit is never matched: in running
// prose it is far more often a word than a figure, and the site writes
// small counts in words anyway. A bare two-digit number is matched only
// with the first word of its entry's unit after it ("54 global", "10 KB"):
// plenty of other things come in tens and fifties. Words are not matched.
// ------------------------------------------------------------------
const markable = (shown) => /\d/.test(shown) && !/^\d$/.test(shown);

/** The displays the marker looks for: a map of written figure → claim id. */
function displays(claims) {
    const map = new Map();
    claims.forEach((c) => {
        [c.value].concat(c.forms || []).filter(markable).forEach(shown => map.set(shown, c.id));
    });
    return map;
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
    const map = displays(claims);
    if (!map.size) return (s) => [[String(s), null]];
    const byId = new Map(claims.map(c => [c.id, c]));
    const shown = Array.from(map.keys()).sort((a, b) => b.length - a.length);
    const alternatives = shown.map(s => pattern(s, byId.get(map.get(s))));
    const re = new RegExp(`(?<![\\w.,~≈+/–-])(?:${alternatives.join('|')})(?![\\w%×/]|[.,]\\d)`, 'g');
    return (s) => {
        const text = String(s == null ? '' : s);
        const out = [];
        let at = 0;
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
            if (exemptAt(text, m.index, m.index + m[0].length)) continue;
            if (m.index > at) out.push([text.slice(at, m.index), null]);
            out.push([m[0], map.get(m[0])]);
            at = m.index + m[0].length;
        }
        if (at < text.length || !out.length) out.push([text.slice(at), null]);
        return out;
    };
}

module.exports = { wordRuns, numbers, quantity, agrees, EXEMPT, exemptAt, SPOKEN_EXEMPT, spokenExempt, markable, displays, marker, plain };
