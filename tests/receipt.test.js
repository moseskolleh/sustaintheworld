// Tests for the carbon receipt a pull request gets (scripts/receipt.js).
//
// The receipt is the one place a reviewer sees what a change costs, so a
// wrong sign, a delta taken the wrong way round or a carbon figure off by a
// factor of 1024 would mislead exactly the person it is for. The fixtures
// in tests/fixtures/receipt/ are a main and a branch with every case in
// them: a rise, a fall, no change, a budget over its ceiling, a ceiling the
// branch lowered, a budget only one side has, a held budget, and a page
// whose length budget is held drawn full. The moved ceilings are also
// measured for real at the end, as the workflow measures main: with
// check-budget.js --root on a checkout whose own copy of it differs.
//
// Run with: node tests/receipt.test.js

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'receipt');
const load = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
const { receipt, MARKER, signed, fmtByteChange, fmtBytes, fmtMgChange, mgOf } = require('../scripts/receipt.js');
const { GRAMS_PER_MB } = require('../scripts/lib/voice-signature.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

const base = load('base.json');
const head = load('head.json');
const baseLength = load('base-length.json');
const headLength = load('head-length.json');
const md = receipt({ base, head, baseLength, headLength, baseSha: '0123456789abcdef', headSha: 'fedcba9876543210' });
const lines = md.split('\n');
// A table row by its first cell, and one of its cells (1-based after the pipe).
const row = (first, extra = '') => lines.find(l => l.startsWith(`| ${first} |`) && l.includes(extra)) || '';
const cells = (line) => line.split('|').slice(1, -1).map(s => s.trim());

// --- Signs and units ---------------------------------------------------------
{
    assert(signed(819, n => `${n}`) === '+819', 'Signs: a rise carries a plus');
    assert(signed(-819, n => `${n}`) === '−819', 'Signs: a fall carries a true minus (U+2212), not a hyphen');
    assert(signed(0, n => `${n}`) === '0', 'Signs: no change is 0, with no sign');
    assert(fmtByteChange(819) === '819 B' && fmtByteChange(9000) === '9,000 B' && fmtByteChange(12000) === '11.7 KB',
        `Units: a change under 10 KB reads in bytes, a larger one in KB (${fmtByteChange(819)}, ${fmtByteChange(9000)}, ${fmtByteChange(12000)})`);
    assert(fmtBytes(0) === '0 KB' && fmtBytes(280899) === '274.3 KB' && fmtBytes(3526397) === '3.36 MB',
        `Units: levels read in KB, and MB from a megabyte (${fmtBytes(280899)}, ${fmtBytes(3526397)})`);
}

// --- CO₂e: the Sustainable Web Design constant, per MB of 1024² bytes -------
{
    assert(GRAMS_PER_MB === 0.36, `CO₂e: the constant is the site's one copy, 0.36 g per MB (${GRAMS_PER_MB})`);
    assert(Math.abs(mgOf(1024 * 1024) - 360) < 1e-9, `CO₂e: one MB transferred is 360 mg (${mgOf(1024 * 1024)})`);
    assert(signed(mgOf(106), fmtMgChange) === '+<0.1 mg' && signed(mgOf(300), fmtMgChange) === '+0.1 mg',
        `CO₂e: a change too small for one decimal still shows, as <0.1 mg (${signed(mgOf(106), fmtMgChange)})`);
    const want = (bytes) => ((bytes / 1048576) * 0.36 * 1000);
    const index = cells(row('`index.html`', 'mg'));
    assert(index[1] === `${want(280899).toFixed(1)} mg` && index[2] === `${want(281718).toFixed(1)} mg`,
        `CO₂e: the homepage's first view on each side (${index[1]}, ${index[2]})`);
    assert(index[3] === `+${(want(281718) - want(280899)).toFixed(1)} mg`, `CO₂e: its change, signed (${index[3]})`);
    const cs = cells(row('`case-studies.html`', 'mg'));
    assert(cs[3] === `−${(want(98522) - want(86522)).toFixed(1)} mg`, `CO₂e: a lighter page shows a fall (${cs[3]})`);
    assert(/Network transfer only/.test(md) && /0\.36 g CO₂e per MB/.test(md) && /estimate, not a measurement/.test(md),
        'CO₂e: says it is network transfer only, at 0.36 g CO₂e per MB, and an estimate');
    const pagesInCarbon = lines.filter(l => /^\| `[^`]+` \| [\d.]+ mg|^\| `[^`]+` \| — \|/.test(l) && /mg/.test(l)).map(l => cells(l)[0]);
    assert(pagesInCarbon.join() === '`index.html`,`case-studies.html`,`fresh.html`',
        `CO₂e: one row for each budget that is a page's first view, and only those (${pagesInCarbon.join(', ')})`);
}

// --- Bytes: every budget, its change and its ceiling ------------------------
{
    const first = cells(row('First view of the homepage, over the wire (fonts included)'));
    assert(first[1] === '274.3 KB' && first[2] === '275.1 KB' && first[3] === '+819 B' && first[4] === '✓ 300 KB',
        `Bytes: a rise, head minus base (${first.join(' | ')})`);
    const cs = cells(row('Case studies page, over the wire (fonts included)'));
    assert(cs[3] === '−11.7 KB' && cs[4] === '✓ 110 KB (was 120 KB)', `Bytes: a fall, and a ceiling the branch lowered (${cs.join(' | ')})`);
    const od = cells(row('Everything a full visit adds on demand (modules, scripts, map)'));
    assert(od[4] === '✗ over 72 KB', `Bytes: a budget over its ceiling says so (${od[4]})`);
    const audio = cells(row("Recorded narration: Moses's introduction (sized for his 60–90 s take)"));
    assert(audio[1] === '0 KB' && audio[3] === '0', `Bytes: no change is 0 (${audio.join(' | ')})`);
    const gone = cells(row('A page this branch removes, over the wire'));
    const fresh = cells(row('A page new on this branch, over the wire'));
    assert(gone[2] === '—' && gone[3] === '—' && gone[4] === 'none (was 8 KB)', `Bytes: a budget only main has shows a dash for the branch, and the ceiling it had (${gone.join(' | ')})`);
    assert(fresh[1] === '—' && fresh[2] === '1.00 MB' && fresh[3] === '—', `Bytes: a budget new on the branch shows a dash for main (${fresh.join(' | ')})`);
    assert(/\*\*The homepage's first view:\*\* 275\.1 KB \(\+819 B from 274\.3 KB on main\), about 96\.7 mg CO₂e a view\./.test(md),
        'Summary: the homepage first view, its change and its CO₂e, in one line');
}

// --- Length: every page at both sizes ----------------------------------------
{
    const desk = cells(row('`index.html`', '1440×900'));
    assert(desk[2] === '15.46' && desk[3] === '9.80' && desk[4] === '−5.66' && desk[5] === '✓ 10',
        `Length: the homepage on a desktop, shorter by 5.66 screens and within 10 (${desk.join(' | ')})`);
    const phone = cells(row('`index.html`', '390×844'));
    assert(phone[4] === '−4.43' && phone[5] === '✗ over 18', `Length: on a phone, over its ceiling (${phone.join(' | ')})`);
    const stats = cells(row('`stats.html`', '390×844'));
    assert(stats[4] === '0' && stats[5] === '✓ 15.66 (drawn full: 12.00)', `Length: stats.html is held drawn full, and says so (${stats.join(' | ')})`);
    assert(/\*\*✗ 2 budgets over the ceiling on this branch:\*\*/.test(md) && /`index\.html` at 390×844: 18\.50 screens of 18/.test(md),
        'Summary: names every budget over its ceiling, bytes and length, before the tables');
}

// --- Could come down ----------------------------------------------------------
{
    const could = lines.filter(l => l.startsWith('- '));
    assert(could.includes('- Case studies page, over the wire (fonts included): 110 KB → 89 KB'),
        `Could come down: a byte budget with more than 10% headroom (${could.join('; ')})`);
    assert(could.includes('- `stats.html` at 390×844: 15.66 → 12.6 screens'), 'Could come down: a length with more than 10% headroom, from the drawn-full length');
    assert(!could.some(l => /Recorded narration/.test(l)), 'Could come down: never a held budget');
}

// --- The Markdown's shape ----------------------------------------------------
{
    assert(lines[0] === MARKER && MARKER.startsWith('<!-- carbon-receipt') && MARKER.endsWith('-->'),
        'Shape: the first line is the hidden marker the workflow finds its comment by');
    assert(lines[1] === '### Carbon receipt', 'Shape: then the heading');
    assert(/`main` \(0123456\) against `This PR` \(fedcba9\)/.test(md), 'Shape: names both sides, with short SHAs');
    // Every table: a header, a separator of the same width, rows of the same width.
    let bad = [];
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('|') || (i > 0 && lines[i - 1].startsWith('|'))) continue;
        const width = cells(lines[i]).length;
        if (!/^\|(-{3}|-{2}:)(\|(-{3}|-{2}:))*\|$/.test(lines[i + 1] || '') || cells(lines[i + 1]).length !== width) bad.push(`line ${i + 2}: separator`);
        for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) if (cells(lines[j]).length !== width) bad.push(`line ${j + 1}: ${cells(lines[j]).length} cells, not ${width}`);
    }
    assert(bad.length === 0, `Shape: every table row has its header's width (${bad.join('; ') || 'all'})`);
    assert(['#### Bytes', '#### Estimated CO₂e per first view', '#### Scroll length, in screens (page height ÷ window height)', '#### Could come down']
        .every((h, i, all) => lines.indexOf(h) > -1 && (i === 0 || lines.indexOf(h) > lines.indexOf(all[i - 1]))), 'Shape: bytes, CO₂e, length, then what could come down');
    assert(/<sub>.*Chromium 141\.0\.7390\.37.*<\/sub>\n$/.test(md), 'Shape: ends with how it was measured, in which browser');
    assert(!/undefined|NaN|null/.test(md), 'Shape: no undefined, NaN or null anywhere');
}

// --- A side that could not be measured ---------------------------------------
{
    const alone = receipt({ head, headLength });
    assert(/main could not be measured/.test(alone) && cells(alone.split('\n').find(l => l.startsWith('| First view')))[1] === '—',
        'Missing main: says so, and shows a dash instead of a change');
    const unmeasured = receipt({ base, head: { ...head, length: {} } });
    assert(/Not measured on this branch/.test(unmeasured), 'Missing lengths: says the browser pass did not finish');
    let threw = null;
    try { receipt({ base }); } catch (e) { threw = e; }
    assert(!!threw && /head budget file/.test(threw.message), 'Missing head: refuses, rather than print an empty receipt');
}

// --- The command line, as the workflow runs it ----------------------------------
{
    const cli = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'receipt.js'),
        '--base', path.join(FIX, 'base.json'), '--head', path.join(FIX, 'head.json'),
        '--base-length', path.join(FIX, 'base-length.json'), '--head-length', path.join(FIX, 'head-length.json'),
        '--base-sha', '0123456789abcdef', '--head-sha', 'fedcba9876543210'], { cwd: ROOT, encoding: 'utf8' });
    assert(cli.status === 0 && cli.stdout === md, `CLI: prints the same receipt to stdout (exit ${cli.status}${cli.stderr ? `, ${cli.stderr.trim()}` : ''})`);
    const noBase = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'receipt.js'),
        '--base', path.join(FIX, 'no-such-file.json'), '--head', path.join(FIX, 'head.json')], { cwd: ROOT, encoding: 'utf8' });
    assert(noBase.status === 0 && /main could not be measured/.test(noBase.stdout), 'CLI: a side that left no file is reported, not a failure');
    const noHead = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'receipt.js')], { cwd: ROOT, encoding: 'utf8' });
    assert(noHead.status === 1 && /receipt:/.test(noHead.stderr), 'CLI: no head file is an error');

    // What check-budget.js really prints is what the receipt reads.
    const real = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-budget.js'), '--json'], { cwd: ROOT, encoding: 'utf8' });
    const json = JSON.parse(real.stdout);
    const same = receipt({ base: json, head: json });
    const changes = same.split('\n').filter(l => l.startsWith('| ') && !l.startsWith('| Budget') && !l.startsWith('| Page')).map(l => cells(l)[3]);
    assert(changes.length > 0 && changes.every(c => c === '0' || c === '—'), `CLI: check-budget.js --json against itself changes nothing (${changes.length} rows)`);
    assert(!/\(was |\(new\)|none \(was/.test(same), 'CLI: against itself no ceiling has moved');
}

// --- Main measured as the workflow measures it ---------------------------------
// receipt.yml weighs main with the branch's check-budget.js and --root. That
// script used to report its own ceilings for both sides, so "(was …)" could
// never show in a real receipt, and a pull request that raised a ceiling
// went unremarked. A checkout standing in for main, with its own copy of
// the script: one ceiling higher (the branch lowered it), one length
// ceiling higher, a budget the branch does not have, and none for a budget
// the branch adds.
{
    const os = require('os');
    const KB = 1024;
    const main = fs.mkdtempSync(path.join(os.tmpdir(), 'mks-receipt-main-'));
    try {
        fs.mkdirSync(path.join(main, 'scripts'));
        fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(main, 'index.html'));
        const { BUDGETS, LENGTH } = require('../scripts/check-budget.js');
        let src = fs.readFileSync(path.join(ROOT, 'scripts', 'check-budget.js'), 'utf8');
        const raise = (key, to) => { src = src.replace(new RegExp(`(\\n {4}${key}: \\{[^]*?\\n {8}max: )[^,\\n]+`), `$1${to / KB} * KB`); };
        raise('caseStudiesWire', BUDGETS.caseStudiesWire.max + 10 * KB);
        src = src.replace(/(\n {4}'index\.html': \{ '1440x900': )[\d.]+/, `$1${LENGTH['index.html']['1440x900'] + 0.5}`);
        src = src.replace(/\n {4}carbonAiWire: \{[^]*?\n {4}\}/, '');
        src = src.replace('const BUDGETS = {\n', "const BUDGETS = {\n    retiredWire: { label: 'A page main had', max: 50 * KB, readme: 'A page main had, over the wire' },\n");
        fs.writeFileSync(path.join(main, 'scripts', 'check-budget.js'), src);

        const measure = (...args) => JSON.parse(spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'check-budget.js'), '--json', ...args], { cwd: ROOT, encoding: 'utf8' }).stdout);
        const mainJson = measure('--root', main);
        const branch = measure();
        assert(mainJson.bytes.caseStudiesWire.ceiling === BUDGETS.caseStudiesWire.max + 10 * KB && mainJson.bytes.criticalWire.ceiling === BUDGETS.criticalWire.max,
            `--root: main's ceilings are main's own, read from its copy of check-budget.js (${mainJson.bytes.caseStudiesWire.ceiling / KB} KB, not the branch's ${BUDGETS.caseStudiesWire.max / KB})`);
        assert(typeof mainJson.bytes.criticalWire.measured === 'number' && mainJson.bytes.caseStudiesWire.measured === null,
            '--root: and what main weighs is still measured by the branch\'s script (a page it lacks is null)');
        const md = receipt({ base: mainJson, head: branch });
        const rowOf = (name) => cells(md.split('\n').find(l => l.startsWith(`| ${name} |`)) || '| |');
        assert(rowOf(BUDGETS.caseStudiesWire.readme)[4] === `✓ ${BUDGETS.caseStudiesWire.max / KB} KB (was ${BUDGETS.caseStudiesWire.max / KB + 10} KB)`,
            `Moved: a ceiling the branch lowered shows what main's was (${rowOf(BUDGETS.caseStudiesWire.readme)[4]})`);
        assert(!/\(was|\(new/.test(rowOf(BUDGETS.criticalWire.readme)[4]), `Moved: an unchanged ceiling says nothing more (${rowOf(BUDGETS.criticalWire.readme)[4]})`);
        assert(/ \(new\)$/.test(rowOf(BUDGETS.carbonAiWire.readme)[4]), `Moved: a budget main did not have is new (${rowOf(BUDGETS.carbonAiWire.readme)[4]})`);
        assert(rowOf('A page main had, over the wire')[4] === 'none (was 50 KB)', `Moved: a budget the branch drops shows the ceiling main had (${rowOf('A page main had, over the wire')[4]})`);
        const lengths = { schema: 1, browser: 'Chromium test', viewports: branch.viewports, pages: { 'index.html': { '1440x900': { px: 8000, screens: 8.89 } } } };
        const withLength = receipt({ base: mainJson, head: branch, baseLength: lengths, headLength: lengths });
        const desk = cells(withLength.split('\n').find(l => l.startsWith('| `index.html` |') && l.includes('1440×900')) || '| |');
        assert(desk[5] === `✓ ${LENGTH['index.html']['1440x900']} (was ${LENGTH['index.html']['1440x900'] + 0.5})`, `Moved: so does a length ceiling (${desk[5]})`);
    } finally {
        fs.rmSync(main, { recursive: true, force: true });
    }
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
