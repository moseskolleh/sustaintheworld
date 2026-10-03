// Tests for the budgets themselves (scripts/check-budget.js): the JSON the
// pull-request receipt reads, the ratchet that lowers ceilings, the length
// budgets `npm run smoke` holds each page to, and the README's tables.
//
// A ratchet that could raise a ceiling would undo the one rule the budgets
// exist for ("ceilings only move down"), and a README table nobody checks
// is how this README once said "under 2 MB" of a 3 MB site. So the ratchet
// is run here on made-up measurements, lower, higher and at the edges of
// its rounding, and its rewritten source is loaded and read back; and the
// README must say exactly what `npm run budget -- --readme` would write.
//
// Run with: node tests/budget.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-budget.js');
const budget = require('../scripts/check-budget.js');
const { BUDGETS, PAGE_BUDGETS, LENGTH, VIEWPORTS } = budget;

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
const KB = 1024;

// A length file as smoke.js writes it, every page at `screens`, stats.html
// drawn full at `full`.
function lengthsFile(screens, full) {
    const pages = {};
    Object.keys(LENGTH).forEach((page) => {
        pages[page] = {};
        Object.entries(VIEWPORTS).forEach(([vp, v]) => {
            const s = typeof screens === 'function' ? screens(page, vp) : screens;
            pages[page][vp] = { px: Math.round(s * v.height), screens: s };
            if (page === 'stats.html' && full) pages[page][vp].full = { px: Math.round(full * v.height), screens: full };
        });
    });
    return { schema: budget.SCHEMA, browser: 'Chromium test', viewports: VIEWPORTS, pages };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mks-budget-test-'));

try {
    // --- --json: every budget, measured, ceiling, headroom ------------------
    {
        const res = run('--json');
        let json = null;
        try { json = JSON.parse(res.stdout); } catch (e) { /* reported below */ }
        assert(res.status === 0 && !!json, `--json: exits 0 with JSON on stdout (exit ${res.status})`);
        json = json || { bytes: {}, length: {} };
        assert(json.schema === 1 && JSON.stringify(json.viewports) === JSON.stringify(VIEWPORTS), '--json: schema 1, and the two window sizes lengths are measured at');
        assert(JSON.stringify(Object.keys(json.bytes)) === JSON.stringify(Object.keys(BUDGETS)), '--json: every byte budget, in the order the script keeps them');
        const pageOf = Object.fromEntries(Object.entries(PAGE_BUDGETS).map(([p, k]) => [k, p]));
        const wrong = Object.entries(json.bytes).filter(([key, b]) =>
            b.unit !== 'bytes' || typeof b.label !== 'string' || typeof b.readme !== 'string' ||
            typeof b.measured !== 'number' || b.measured < 0 || b.ceiling !== BUDGETS[key].max ||
            b.headroom !== b.ceiling - b.measured || b.page !== (pageOf[key] || null) ||
            b.hold !== (BUDGETS[key].hold || null) ||
            !(b.couldLowerTo === null || (typeof b.couldLowerTo === 'number' && b.couldLowerTo < b.ceiling && b.couldLowerTo >= b.measured))
        ).map(([key]) => key);
        assert(wrong.length === 0, `--json: each byte budget has its measure, ceiling, headroom (ceiling − measured), page and hold (wrong: ${wrong.join(', ') || 'none'})`);
        const measured = budget.measure().measured;
        assert(Object.entries(json.bytes).every(([key, b]) => b.measured === measured[key]), '--json: the measurements are the report\'s own');
        const lengthWrong = [];
        Object.entries(LENGTH).forEach(([page, vps]) => Object.keys(VIEWPORTS).forEach((vp) => {
            const l = json.length[page] && json.length[page][vp];
            if (!l || l.unit !== 'screens' || l.ceiling !== vps[vp] || l.measured !== null || l.headroom !== null || l.couldLowerTo !== null) lengthWrong.push(`${page} ${vp}`);
        }));
        assert(lengthWrong.length === 0, `--json: every page's length ceiling at both sizes, unmeasured without smoke's file (wrong: ${lengthWrong.join(', ') || 'none'})`);

        // With the lengths smoke measured.
        const file = path.join(tmp, 'length.json');
        // The homepage at 5 screens on a desktop, whatever its ceiling is now
        // (the ratchet moves it); every other length at half its ceiling.
        fs.writeFileSync(file, JSON.stringify(lengthsFile((page, vp) => (page === 'index.html' && vp === '1440x900' ? 5 : LENGTH[page][vp] / 2), 7)));
        const withLengths = JSON.parse(run('--json', '--lengths', file).stdout);
        const home = withLengths.length['index.html']['1440x900'];
        const room = Math.round((LENGTH['index.html']['1440x900'] - 5) * 100) / 100;
        assert(home.measured === 5 && home.headroom === room && home.couldLowerTo === 5.25,
            `--json --lengths: a measured length, its headroom and what it could come down to (${JSON.stringify(home)})`);
        const stats = withLengths.length['stats.html']['1440x900'];
        assert(stats.measured === 7, `--json --lengths: stats.html reads as its longer, drawn-full length (${stats.measured})`);
        fs.writeFileSync(file, JSON.stringify({ pages: {} }));
        const refused = run('--json', '--lengths', file);
        assert(refused.status === 1 && /not a length measurement/.test(refused.stderr), '--lengths: a file that is not smoke\'s is refused, not read as zeros');
    }

    // --- --root: another checkout, with pages this one has not got --------
    {
        const other = path.join(tmp, 'older');
        fs.mkdirSync(other);
        fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(other, 'index.html'));
        const res = run('--json', '--root', other);
        const json = res.status === 0 ? JSON.parse(res.stdout) : { bytes: {} };
        assert(res.status === 0 && json.bytes.caseStudiesWire.measured === null && json.bytes.caseStudiesWire.headroom === null &&
            typeof json.bytes.criticalWire.measured === 'number',
            `--root: measures that checkout, and a page it lacks is null rather than a crash (exit ${res.status})`);
        const refused = run('--ratchet', '--root', other);
        assert(refused.status === 1 && /cannot take --root/.test(refused.stderr), '--ratchet: never rewrites this checkout\'s ceilings from another\'s measurement');
    }

    // --- The ratchet's arithmetic ------------------------------------------
    {
        const t = budget.ratchetTarget;
        assert(t(280899, 'bytes') === 289 * KB, `Ratchet: 274.3 KB earns 5% over it, up to a whole KB (${t(280899, 'bytes') / KB} KB)`);
        assert(t(6149, 'bytes') === 8 * KB, `Ratchet: a small file gets at least 1 KB over it (${t(6149, 'bytes') / KB} KB for 6.0 KB)`);
        assert(t(100 * KB, 'bytes') === 105 * KB, `Ratchet: exactly 5% over a round figure stays that figure (${t(100 * KB, 'bytes') / KB} KB)`);
        assert(t(10, 'screens') === 10.5 && t(10.67, 'screens') === 11.21, `Ratchet: lengths go up by 5%, to a hundredth (${t(10, 'screens')}, ${t(10.67, 'screens')})`);
        assert(t(1, 'screens') === 1.1 && t(2, 'screens') === 2.1, `Ratchet: at least a tenth of a screen, and 2 × 1.05 is 2.1, not 2.11 (${t(1, 'screens')}, ${t(2, 'screens')})`);
        // At a scale where the 5% target alone would lower the ceiling (95 KB
        // under 100, 9.45 screens under 10), so only the 10% rule says no.
        assert(budget.couldLowerTo(90 * KB, 100 * KB, 'bytes') === null && budget.couldLowerTo(89 * KB, 100 * KB, 'bytes') === 94 * KB,
            `Hints: only over 10% headroom (10% is not enough; 11% is: ${budget.couldLowerTo(90 * KB, 100 * KB, 'bytes')}, ${budget.couldLowerTo(89 * KB, 100 * KB, 'bytes')})`);
        assert(budget.couldLowerTo(9, 10, 'screens') === null && budget.couldLowerTo(8.9, 10, 'screens') === 9.35,
            `Hints: the same for a length (${budget.couldLowerTo(9, 10, 'screens')}, ${budget.couldLowerTo(8.9, 10, 'screens')})`);
        assert(budget.couldLowerTo(0, 800 * KB, 'bytes', 'held') === null, 'Hints: never for a budget held for later');
        // Past 10% is not enough on its own: the field report's wire budget
        // (6.0 KB of 8 KB, 24% headroom) earns 8 KB with the 1 KB floor, so it
        // is not named, and the README says so rather than "every budget
        // with more than 10% headroom".
        assert(budget.couldLowerTo(6188, 8 * KB, 'bytes') === null && budget.couldLowerTo(5000, 8 * KB, 'bytes') === 6 * KB,
            `Hints: only where the ratchet's target is below the ceiling (${budget.couldLowerTo(6188, 8 * KB, 'bytes')}, ${budget.couldLowerTo(5000, 8 * KB, 'bytes')})`);
        const readmeSays = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8').replace(/\s+/g, ' ');
        assert(/naming every budget whose ceiling could come down: more than 10% headroom, and a ratchet target/.test(readmeSays) &&
            !/naming every budget with more than 10% headroom/.test(readmeSays), 'Hints: the README describes both conditions');
    }

    // --- The ratchet never raises a ceiling -----------------------------------
    {
        const source = fs.readFileSync(SCRIPT, 'utf8');
        const measured = budget.measure().measured;
        const scaled = (f) => Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, Math.round(v * f)]));

        // Everything far under its ceiling: every ceiling not held comes down
        // to its target; the held ones stay.
        const low = budget.budgetJson(scaled(0.5), lengthsFile(0.5, 0.5));
        const down = budget.ratchetSource(source, low);
        const next = budget.loadSource(down.source);
        const bytesWrong = Object.entries(BUDGETS).filter(([key, b]) => {
            const want = b.hold ? b.max : Math.min(b.max, budget.ratchetTarget(low.bytes[key].measured, 'bytes'));
            return next.BUDGETS[key].max !== want;
        }).map(([key]) => key);
        assert(bytesWrong.length === 0, `Ratchet: lowers every byte ceiling to its target, and leaves the held ones (wrong: ${bytesWrong.join(', ') || 'none'})`);
        const lengthsWrong = [];
        Object.entries(LENGTH).forEach(([page, vps]) => Object.entries(vps).forEach(([vp, was]) => {
            if (next.LENGTH[page][vp] !== Math.min(was, budget.ratchetTarget(0.5, 'screens'))) lengthsWrong.push(`${page} ${vp}`);
        }));
        assert(lengthsWrong.length === 0, `Ratchet: lowers every length ceiling too (wrong: ${lengthsWrong.join(', ') || 'none'})`);
        assert(BUDGETS.introAudio.hold && next.BUDGETS.introAudio.max === BUDGETS.introAudio.max && next.BUDGETS.statsWire.max === BUDGETS.statsWire.max,
            'Ratchet: the audio budget (his recording) and the open counts (a full page) are held');
        assert(down.changes.length > 0 && down.changes.every(c => c.to < c.from), `Ratchet: reports each change, every one downwards (${down.changes.length})`);

        // Everything over its ceiling: nothing moves.
        const high = budget.ratchetSource(source, budget.budgetJson(scaled(3), lengthsFile(50, 50)));
        assert(high.changes.length === 0 && high.source === source, 'Ratchet: a page over its ceiling does not raise it');

        // A spread of made-up measurements, from far under to far over.
        let seed = 7;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        let raised = [];
        for (let i = 0; i < 12; i++) {
            const bytes = Object.fromEntries(Object.entries(BUDGETS).map(([k, b]) => [k, Math.round(b.max * rand() * 1.3)]));
            const lengths = lengthsFile((page, vp) => Math.round(LENGTH[page][vp] * rand() * 130) / 100, 1 + rand() * 12);
            const r = budget.ratchetSource(source, budget.budgetJson(bytes, lengths));
            const m = budget.loadSource(r.source);
            Object.entries(BUDGETS).forEach(([k, b]) => { if (m.BUDGETS[k].max > b.max) raised.push(`${k} ${b.max} → ${m.BUDGETS[k].max}`); });
            Object.entries(LENGTH).forEach(([p, vps]) => Object.entries(vps).forEach(([vp, c]) => { if (m.LENGTH[p][vp] > c) raised.push(`${p} ${vp} ${c} → ${m.LENGTH[p][vp]}`); }));
            // And what it did lower still holds what was measured.
            r.changes.forEach((c) => {
                const held = c.kind === 'bytes' ? bytes[c.key] : budget.heldLength(lengths.pages[c.page][c.vp]);
                if (c.to < held) raised.push(`${c.name} lowered under its own measurement`);
            });
        }
        assert(raised.length === 0, `Ratchet: over twelve spreads of measurements, no ceiling rises and none drops under what it holds (${raised.slice(0, 3).join('; ') || 'none'})`);

        // The rewrite touches ceilings and nothing else.
        const other = down.source.split('\n').filter((line, i) => line !== source.split('\n')[i]);
        assert(source.split('\n').length === down.source.split('\n').length && other.every(l => /^ {8}max: \d+(\.\d+)? \* KB,$/.test(l) || /^ {4}'[^']+': \{ '1440x900': [\d.]+, '390x844': [\d.]+ \},?$/.test(l)),
            `Ratchet: rewrites only the ceilings' lines (${other.filter(l => !/max:|'1440x900'/.test(l)).join(' / ') || 'yes'})`);
    }

    // --- Length budgets ------------------------------------------------------
    {
        const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
        assert(JSON.stringify(Object.keys(LENGTH).sort()) === JSON.stringify(pages), `Length: every page at the root has a length budget, and every budget is a page (${Object.keys(LENGTH).length} of ${pages.length})`);
        assert(JSON.stringify(Object.keys(VIEWPORTS)) === '["1440x900","390x844"]' && VIEWPORTS['390x844'].width === 390 && VIEWPORTS['1440x900'].height === 900,
            'Length: measured at 1440×900 and 390×844, the sizes the accessibility pass uses');
        // The plan's targets were its first ceilings; the ratchet has only
        // lowered them since (step 2.9: measured plus 5%), never above.
        assert(LENGTH['index.html']['1440x900'] <= 10 && LENGTH['index.html']['390x844'] <= 18,
            `Length: the homepage is held to the plan's targets, 10 and 18 screens, or below (${LENGTH['index.html']['1440x900']} and ${LENGTH['index.html']['390x844']})`);
        const odd = Object.entries(LENGTH).filter(([, vps]) => Object.keys(vps).join() !== Object.keys(VIEWPORTS).join() || Object.values(vps).some(c => !(c >= 1)));
        assert(odd.length === 0, `Length: every ceiling is at both sizes and at least one screen (${odd.map(e => e[0]).join(', ') || 'all'})`);
        assert(budget.heldLength({ screens: 4.38, full: { screens: 10.06 } }) === 10.06 && budget.heldLength({ screens: 5 }) === 5, 'Length: a page drawn full is held at its longer length');
    }

    // --- The README says what check-budget.js would write -----------------
    {
        const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
        const json = budget.budgetJson(budget.measure().measured);
        Object.values(budget.README_TABLES).forEach(([start, end]) => {
            assert(readme.split(start).length === 2 && readme.split(end).length === 2 && readme.indexOf(start) < readme.indexOf(end),
                `README: one ${start.slice(5, start.indexOf(':'))} region, in order`);
        });
        assert(budget.renderReadme(readme, json) === readme, 'README: the budget, length and on-demand module tables are current (run `npm run budget -- --readme` if not)');
        const quoted = readme.match(/against a (\d+) KB ceiling/);
        assert(!!quoted && +quoted[1] === BUDGETS.criticalWire.max / KB, `README: the summary quotes the first view's real ceiling (${quoted && quoted[1]} KB)`);
        // The core's weight was typed by hand, and said 72 KB once script.js
        // had passed 72.5. It is written from the measurement now, rounded
        // as the report prints it, and a stale one is rewritten.
        const core = readme.match(/A (\d+) KB core \(`script\.js`, (\d+) KB gzipped\)/);
        const disk = fs.statSync(path.join(ROOT, 'script.js')).size;
        const wire = require('zlib').gzipSync(fs.readFileSync(path.join(ROOT, 'script.js')), { level: 9 }).length;
        assert(!!core && core[1] === (disk / KB).toFixed(0) && core[2] === (wire / KB).toFixed(0),
            `README: the core script is quoted at what it weighs (${core ? `${core[1]} KB, ${core[2]} KB gzipped` : 'no quote'}; measured ${(disk / KB).toFixed(1)} and ${(wire / KB).toFixed(1)})`);
        const staleCore = readme.replace(/A (\d+) KB core/, (m, n) => `A ${+n - 1} KB core`);
        assert(staleCore !== readme && budget.renderReadme(staleCore, json) === readme, 'README: a stale weight for the core script is rewritten to the measured one');
        Object.values(BUDGETS).forEach((b) => {
            assert(readme.includes(`| ${b.readme} |`), `README: a row for "${b.readme}"`);
        });

        // A stale figure is caught, and --readme is what puts it right.
        const stale = readme.replace(/\| ~(\d+) KB \|/, (m, n) => `| ~${+n + 1} KB |`);
        assert(stale !== readme && budget.renderReadme(stale, json) === readme, 'README: a stale figure is rewritten to the measured one');
        let threw = null;
        try { budget.renderReadme(readme.replace(budget.README_TABLES.bytes[1], ''), json); } catch (e) { threw = e; }
        assert(!!threw && /missing/.test(threw.message), 'README: a missing marker is an error, not a silent skip');

        // The on-demand modules table was typed by hand, and went stale
        // (interactives ~35 KB, dossier ~6 KB) until a review caught it. Now
        // its weights are measured, row by row, and add up to the budget.
        const { measured, onDemand } = budget.measure();
        const m = measured.modules;
        assert(m.rows.every(r => typeof r.measured === 'number') && m.rows.reduce((n, r) => n + r.measured, 0) === measured.onDemand,
            `Modules: every row is measured, and the rows add up to the on-demand budget (${m.rows.reduce((n, r) => n + (r.measured || 0), 0)} of ${measured.onDemand})`);
        assert(m.unlisted.length === 0 && m.twice.length === 0,
            `Modules: every file fetched on demand is in exactly one row (unlisted: ${m.unlisted.join(', ') || 'none'}; twice: ${m.twice.join(', ') || 'none'})`);
        const [mStart, mEnd] = budget.README_TABLES.modules;
        const region = readme.slice(readme.indexOf(mStart), readme.indexOf(mEnd));
        const staleRow = readme.replace(region, region.replace(/\| ~(\d+) KB \|/, (x, n) => `| ~${+n + 1} KB |`));
        assert(staleRow !== readme && budget.renderReadme(staleRow, json) === readme, 'Modules: a stale weight in the README\'s table is rewritten to the measured one');
        // A new module with no row is an error, not a table that quietly
        // leaves it out; so is a file counted in two rows.
        const added = budget.moduleRows(onDemand.concat({ rel: 'modules/fixture.js', wire: 100 }));
        let unlisted = null;
        try { budget.readmeTables(Object.assign({}, json, { modules: added })); } catch (e) { unlisted = e; }
        assert(added.unlisted.join() === 'modules/fixture.js' && !!unlisted && /modules\/fixture\.js .*no row of MODULE_TABLE/.test(unlisted.message),
            `Modules: a file fetched on demand with no row stops the README being written (${unlisted && unlisted.message})`);
        let twice = null;
        try { budget.readmeTables(Object.assign({}, json, { modules: Object.assign({}, m, { twice: ['modules/terminal.js'] }) })); } catch (e) { twice = e; }
        assert(!!twice && /more than one row/.test(twice.message), 'Modules: a file in two rows stops it too');
    }

    // --- The report and its hints ------------------------------------------
    {
        const json = budget.budgetJson({ criticalWire: 200 * KB, onDemand: 71 * KB, introAudio: 0, statsWire: 10 * KB });
        const h = budget.hints(json);
        assert(h.includes(`you could lower ${BUDGETS.criticalWire.readme} from ${budget.fmtCeiling(BUDGETS.criticalWire.max)} to 210 KB`),
            `Hints: "you could lower <budget> from X to Y" (${h[0]})`);
        assert(!h.some(x => x.includes(BUDGETS.onDemand.readme)), 'Hints: not for a budget within 10% of its ceiling');
        assert(!h.some(x => x.includes(BUDGETS.introAudio.readme) || x.includes(BUDGETS.statsWire.readme)), 'Hints: not for a held budget');
        const report = run();
        assert(report.status === 0 && /All budgets met/.test(report.stdout), `Report: every budget met on this checkout (exit ${report.status})`);
        const said = (report.stdout.match(/you could lower [^\n]+/g) || []);
        const want = budget.hints(budget.budgetJson(budget.measure().measured));
        assert(JSON.stringify(said) === JSON.stringify(want), `Report: prints every hint (${said.length})`);
    }

    // --- The receipt workflow ----------------------------------------------
    {
        const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'receipt.yml'), 'utf8');
        const { MARKER } = require('../scripts/receipt.js');
        assert(/\non:\n {2}pull_request:\n/.test(yml) && !/pull_request_target/.test(yml), 'Workflow: runs on pull_request (never pull_request_target, which would hand a fork a write token)');
        assert(/\npermissions:\n {2}contents: read\n {2}pull-requests: write\n(?![ \t]+\w)/.test(yml) && (yml.match(/permissions:/g) || []).length === 1,
            'Workflow: asks for contents: read and pull-requests: write, and nothing else');
        assert((yml.match(/persist-credentials: false/g) || []).length === 2, 'Workflow: neither checkout keeps the token');
        assert(/ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/.test(yml) && /--root "\$GITHUB_WORKSPACE\/base"/.test(yml),
            'Workflow: measures main as the pull request found it, with the pull request\'s own scripts');
        assert(/playwright-core install --with-deps chromium/.test(yml) && /ms-playwright-\$\{\{ runner\.os \}\}-chromium-/.test(yml),
            'Workflow: in the Chromium build the pinned playwright-core names, from the CI job\'s cache');
        const marker = (yml.match(/marker='([^']+)'/) || [])[1];
        assert(!!marker && MARKER.startsWith(marker), `Workflow: finds its comment by the marker the receipt starts with (${marker})`);
        assert(/--method PATCH/.test(yml) && /--method POST/.test(yml) && /github-actions\[bot\]/.test(yml), 'Workflow: edits its own comment in place, or posts one');
        assert(/if: github\.event\.pull_request\.head\.repo\.full_name == github\.repository/.test(yml) && /GITHUB_STEP_SUMMARY/.test(yml),
            'Workflow: from a fork it does not try to comment, and the receipt is in the job summary either way');
        assert(/GH_TOKEN: \$\{\{ github\.token \}\}/.test(yml) && (yml.match(/GH_TOKEN/g) || []).length === 1, 'Workflow: only the posting step sees the token');
    }

    // --- The weekly counts keep the README true -------------------------------
    {
        const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'stats.yml'), 'utf8');
        const order = ['npm run build:content', 'check-budget.js --readme', 'npm test'].map(s => yml.indexOf(s));
        assert(order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1])), 'Open counts Action: rewrites the README\'s budget table after the rebuild, before npm test');
        assert(/git add content\/stats\.json stats\.html README\.md\s*\n/.test(yml), 'Open counts Action: commits the README with the page whose weight it quotes');
    }
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
}
console.log('\nAll assertions passed');
