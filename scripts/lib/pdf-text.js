'use strict';
// ===================================================================
// PDF TEXT — read back the words a PDF draws
//
// tests/cv.test.js holds the CV to content/profile.json by reading the
// committed PDF, and npm test runs without a browser, so the reading is
// done here: about a hundred lines instead of a PDF library in
// devDependencies. It reads what Chromium's PDF writer (Skia) produces,
// and the Word export the CV used to be, and nothing it does not need:
//
//   - objects found by scanning for "N 0 obj", streams inflated with zlib
//     (FlateDecode is the only filter either writer uses for text)
//   - each page's content stream, and any form XObject it draws, in order
//   - Tf picks the font; Tj, TJ, ' and " draw a string with it; BT starts
//     a new line of output (Skia opens one text object per line box)
//   - each font's ToUnicode map turns its codes back into characters: two
//     bytes a code for a Type0 font, one otherwise
//
// Spaces are glyphs in both writers' output, so words come back joined as
// they were typed. Line breaks are not reliable (one line may be several
// text objects), so a caller compares text with whitespace squashed.
// ===================================================================

const zlib = require('zlib');

const REF = /(\d+) \d+ R/;

function readObjects(buf) {
    const src = buf.toString('latin1');
    const objects = new Map();
    const head = /(\d+) \d+ obj\b/g;
    let m;
    while ((m = head.exec(src))) {
        const at = m.index + m[0].length;
        const end = src.indexOf('endobj', at);
        const streamAt = src.indexOf('stream', at);
        if (streamAt === -1 || streamAt > end) {
            objects.set(+m[1], { dict: src.slice(at, end), data: null });
            continue;
        }
        const dict = src.slice(at, streamAt);
        let start = streamAt + 'stream'.length;
        if (src[start] === '\r') start++;
        if (src[start] === '\n') start++;
        const direct = /\/Length (\d+)(?! \d+ R)/.exec(dict);
        const stop = direct ? start + +direct[1] : src.indexOf('endstream', start);
        let data = buf.subarray(start, stop);
        if (/\/FlateDecode/.test(dict)) {
            try { data = zlib.inflateSync(data); } catch (e) { data = zlib.inflateSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH }); }
        }
        objects.set(+m[1], { dict, data });
        head.lastIndex = src.indexOf('endobj', stop) + 6;
    }
    return objects;
}

// A dictionary entry that may be written inline (<< ... >>) or as a
// reference to another object.
function entry(objects, dict, key) {
    const at = dict.indexOf(`/${key}`);
    if (at === -1) return '';
    const rest = dict.slice(at + key.length + 1).trimStart();
    if (rest.startsWith('<<')) {
        let depth = 0;
        for (let i = 0; i < rest.length - 1; i++) {
            if (rest.startsWith('<<', i)) { depth++; i++; } else if (rest.startsWith('>>', i)) { depth--; i++; if (!depth) return rest.slice(2, i - 1); }
        }
    }
    const ref = /^(\d+) \d+ R/.exec(rest);
    return ref ? (objects.get(+ref[1]) || { dict: '' }).dict : '';
}

const names = (dict) => Array.from(dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+) \d+ R/g), m => [m[1], +m[2]]);

const hexBytes = (hex) => Buffer.from(hex.replace(/\s+/g, '').padEnd(Math.ceil(hex.replace(/\s+/g, '').length / 2) * 2, '0'), 'hex');
const utf16 = (hex) => hexBytes(hex).swap16().toString('utf16le');

function toUnicode(cmap) {
    const map = new Map();
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
        for (const [, src, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(src, 16), utf16(dst));
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
        for (const [, lo, hi, dst] of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
            const from = parseInt(lo, 16);
            const to = parseInt(hi, 16);
            if (dst.startsWith('[')) {
                Array.from(dst.matchAll(/<([0-9A-Fa-f]*)>/g)).forEach((d, i) => map.set(from + i, utf16(d[1])));
            } else {
                const base = utf16(dst.slice(1, -1));
                const last = base.charCodeAt(base.length - 1);
                for (let c = from; c <= to; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(last + c - from));
            }
        }
    }
    return map;
}

function font(objects, num, cache) {
    if (cache.has(num)) return cache.get(num);
    const obj = objects.get(num) || { dict: '' };
    const ref = REF.exec((/\/ToUnicode\s+\d+ \d+ R/.exec(obj.dict) || [''])[0]);
    const cmap = ref && objects.get(+ref[1]);
    const f = { wide: /\/Subtype\s*\/Type0/.test(obj.dict), map: cmap && cmap.data ? toUnicode(cmap.data.toString('latin1')) : new Map() };
    cache.set(num, f);
    return f;
}

// The bytes of one string operand: (literal) with its escapes, or <hex>.
function literal(s, i) {
    const out = [];
    let depth = 1;
    for (i++; i < s.length && depth; i++) {
        const c = s[i];
        if (c === '\\') {
            const n = s[++i];
            const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }[n];
            if (esc !== undefined) out.push(esc);
            else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; out.push(parseInt(o, 8) & 255); }
            else if (n === '\r' || n === '\n') { if (n === '\r' && s[i + 1] === '\n') i++; }
            else out.push(n.charCodeAt(0));
        } else {
            if (c === '(') depth++;
            if (c === ')' && !--depth) break;
            out.push(c.charCodeAt(0));
        }
    }
    return [Buffer.from(out), i + 1];
}

function decode(bytes, f) {
    let text = '';
    const step = f.wide ? 2 : 1;
    for (let i = 0; i + step <= bytes.length; i += step) {
        const code = f.wide ? bytes.readUInt16BE(i) : bytes[i];
        text += f.map.has(code) ? f.map.get(code) : (f.wide ? '' : String.fromCharCode(code));
    }
    return text;
}

function run(objects, data, resources, cache, out) {
    const s = data.toString('latin1');
    const fonts = new Map(names(entry(objects, resources, 'Font')));
    const forms = new Map(names(entry(objects, resources, 'XObject')));
    let current = { wide: false, map: new Map() };
    const operands = [];
    for (let i = 0; i < s.length;) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
        if (c === '(') { const [b, n] = literal(s, i); operands.push(b); i = n; continue; }
        if (c === '<' && s[i + 1] !== '<') { const e = s.indexOf('>', i); operands.push(hexBytes(s.slice(i + 1, e))); i = e + 1; continue; }
        if (c === '[' || c === ']' || c === '<' || c === '>' || c === '{' || c === '}') { operands.push(c); i += (c === '<' || c === '>') ? 2 : 1; continue; }
        const word = /^[^\s()<>[\]{}/%]+|^\/[^\s()<>[\]{}/%]*/.exec(s.slice(i, i + 256))[0];
        i += word.length;
        if (word[0] === '/' || /^[-+.\d]/.test(word)) { operands.push(word); continue; }
        if (word === 'BT') out.push('\n');
        else if (word === 'Tf') current = font(objects, fonts.get(String(operands[operands.length - 2]).slice(1)), cache);
        else if (word === 'Tj' || word === "'" || word === '"') out.push(decode(operands[operands.length - 1] || Buffer.alloc(0), current));
        else if (word === 'TJ') operands.filter(Buffer.isBuffer).forEach(b => out.push(decode(b, current)));
        else if (word === 'Do') {
            const form = objects.get(forms.get(String(operands[operands.length - 1]).slice(1)));
            if (form && form.data && /\/Subtype\s*\/Form/.test(form.dict)) run(objects, form.data, entry(objects, form.dict, 'Resources') || resources, cache, out);
        }
        operands.length = 0;
    }
}

/**
 * The text of a PDF, a string per page, and its document information
 * (Title, Author, ...) as plain strings.
 */
function pdfText(buf) {
    const objects = readObjects(buf);
    const src = buf.toString('latin1');
    const catalog = Array.from(objects.values()).find(o => /\/Type\s*\/Catalog/.test(o.dict));
    const pages = [];
    const walk = (num) => {
        const node = objects.get(num);
        if (!node) return;
        if (/\/Type\s*\/Pages/.test(node.dict)) {
            const kids = /\/Kids\s*\[([^\]]*)\]/.exec(node.dict);
            Array.from((kids ? kids[1] : '').matchAll(/(\d+) \d+ R/g)).forEach(k => walk(+k[1]));
        } else pages.push(node);
    };
    walk(+REF.exec(/\/Pages\s+\d+ \d+ R/.exec(catalog.dict)[0])[1]);

    const cache = new Map();
    const text = pages.map((page) => {
        const out = [];
        const contents = /\/Contents\s*(\[[^\]]*\]|\d+ \d+ R)/.exec(page.dict);
        Array.from((contents ? contents[1] : '').matchAll(/(\d+) \d+ R/g)).forEach((r) => {
            const stream = objects.get(+r[1]);
            if (stream && stream.data) run(objects, stream.data, entry(objects, page.dict, 'Resources'), cache, out);
        });
        return out.join('');
    });

    const info = {};
    const infoRef = /\/Info\s+(\d+) \d+ R/.exec(src.slice(src.lastIndexOf('trailer')));
    const infoDict = infoRef ? (objects.get(+infoRef[1]) || { dict: '' }).dict : '';
    for (const [, key, value] of infoDict.matchAll(/\/(\w+)\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>)/g)) {
        const bytes = value[0] === '(' ? literal(value, 0)[0] : hexBytes(value.slice(1, -1));
        info[key] = bytes[0] === 0xfe && bytes[1] === 0xff ? Buffer.from(bytes.subarray(2)).swap16().toString('utf16le') : bytes.toString('latin1');
    }
    const sizes = pages.map(p => (/\/MediaBox\s*\[([^\]]*)\]/.exec(p.dict) || [, ''])[1].trim().split(/\s+/).map(Number));
    return { pages: text, info, sizes };
}

module.exports = { pdfText };
