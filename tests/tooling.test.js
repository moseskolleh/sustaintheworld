// Tests for the machinery the other tests stand on.
//
// scripts/run-tests.js decides whether `npm test` passes, so a runner that
// swallowed a failing suite would turn every other suite into decoration.
// The harness's fake clock decides when the timing suites' timers fire, so
// a clock that ran them out of order, or not at all, would let those suites
// pass without testing anything. And scripts/check-budget.js names the pages
// `npm run smoke` weighs, so a typo there would quietly weigh nothing.
//
// Run with: node tests/tooling.test.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { run, ROOT } = require('./harness.js');

let failures = 0;
function assert(cond, msg) {
    if (cond) {
        console.log('PASS:', msg);
    } else {
        console.log('FAIL:', msg);
        failures++;
    }
}

// --- The runner: a failing suite fails the run, and output stays grouped ---
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mks-run-tests-'));
    // "a" is slow and passes, "b" fails at once (on stderr), "c" passes at
    // once. Run side by side, b and c finish first; the report must still
    // read a, b, c.
    fs.writeFileSync(path.join(dir, 'a.test.js'), "console.log('a:first'); setTimeout(() => { console.log('a:last'); process.exit(0); }, 300);\n");
    fs.writeFileSync(path.join(dir, 'b.test.js'), "console.error('b:only'); process.exit(1);\n");
    // c also passes two assertions, the second written in two pieces.
    fs.writeFileSync(path.join(dir, 'c.test.js'), "console.log('c:first'); console.log('PASS: one'); process.stdout.write('not PASS: two\\nPASS: thr'); setTimeout(() => { process.stdout.write('ee\\n'); console.log('c:last'); }, 20);\n");
    fs.writeFileSync(path.join(dir, 'helper.js'), "throw new Error('not a suite');\n");

    const runner = (...filters) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'run-tests.js'), ...filters], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, RUN_TESTS_DIR: dir }
    });

    try {
        const all = runner();
        const out = all.stdout;
        assert(all.status === 1, `Runner: one failing suite fails the run (exit ${all.status})`);
        assert(/failed: b\.test\.js/.test(out), 'Runner: names the suite that failed');
        assert(/3 suites, 2 passed/.test(out), 'Runner: runs every *.test.js and nothing else');
        // "PASS: thr" + "ee" arrives in two writes; "not PASS:" is not one.
        assert(/\n  2 passing assertions\n/.test(out), `Runner: counts the assertions that passed, a line at a time (${(out.match(/\d+ passing assertions?/) || ['no count'])[0]})`);
        const order = ['a:first', 'a:last', 'b:only', 'c:first', 'c:last'].map(s => out.indexOf(s));
        assert(order.every((n, i) => n > -1 && (i === 0 || n > order[i - 1])),
            `Runner: each suite's output is one block, in file order (${order.join(' < ')})`);

        const some = runner('a', 'c');
        assert(some.status === 0 && /2 suites, 2 passed/.test(some.stdout), `Runner: a filter runs only the matching suites (exit ${some.status})`);

        const none = runner('nothing-matches');
        assert(none.status === 1, 'Runner: a filter that matches nothing is an error, not a pass');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// --- The fake clock: timers fire in time order, only when time moves ------
const clockChecks = (async () => {
    const { window, clock, errors } = run('dark', { clock: true });
    const seen = [];
    window.setTimeout(() => seen.push('b@200'), 200);
    window.setTimeout(() => {
        seen.push('a@100');
        // Set from inside a timer, and due inside the same tick.
        window.setTimeout(() => seen.push('c@150'), 50);
    }, 100);
    const gone = window.setTimeout(() => seen.push('cancelled'), 120);
    window.clearTimeout(gone);
    let beats = 0;
    const beat = window.setInterval(() => { beats++; }, 70);
    // A promise chain inside a timer settles before the next timer runs.
    window.setTimeout(() => Promise.resolve().then(() => seen.push('then@110')), 110);

    assert(seen.length === 0, 'Clock: nothing fires until the test moves time');
    await clock.tick(99);
    assert(seen.length === 0, 'Clock: a timer does not fire a millisecond early');
    await clock.tick(101);
    assert(seen.join(' ') === 'a@100 then@110 c@150 b@200', `Clock: timers fire in time order, nested and promised ones included (${seen.join(' ')})`);
    assert(beats === 2, `Clock: an interval repeats until cleared (${beats} beats in 200 ms at 70 ms)`);
    window.clearInterval(beat);
    await clock.tick(1000);
    assert(beats === 2, 'Clock: clearInterval stops it');

    window.setTimeout(() => { throw new Error('boom'); }, 10);
    window.setTimeout(() => seen.push('after-throw'), 20);
    await clock.tick(30);
    assert(errors.some(e => /boom/.test(String(e && e.message || e))) && seen.includes('after-throw'),
        'Clock: a timer that throws is reported, and the clock carries on');
})();

// --- npm test runs the runner, not a list that can forget a suite ---------
// A hand-kept list in package.json is how a new suite used to sit unrun
// until someone noticed; a merge that brings one back fails here.
{
    const pkg = require('../package.json');
    assert(pkg.scripts['test:unit'] === 'node scripts/run-tests.js', `package.json: test:unit is the runner, not a list of suites (${pkg.scripts['test:unit']})`);
    assert(/\bnpm run lint:html\b/.test(pkg.scripts.test) && /\bnpm run test:unit\b/.test(pkg.scripts.test), 'package.json: npm test runs html-validate and every suite');
}

// --- The budget map: every budgeted page exists, every key is a budget ----
{
    const budget = require('../scripts/check-budget.js');
    const entries = Object.entries(budget.PAGE_BUDGETS);
    const missingPage = entries.filter(([rel]) => !fs.existsSync(path.join(ROOT, rel)));
    const missingBudget = entries.filter(([, key]) => !budget.BUDGETS[key]);
    assert(missingPage.length === 0, `Budget map: every page it names exists (missing: ${missingPage.map(e => e[0]).join(', ') || 'none'})`);
    assert(missingBudget.length === 0, `Budget map: every page is held by a real budget (unknown: ${missingBudget.map(e => e[1]).join(', ') || 'none'})`);
    const measured = budget.measure().measured;
    assert(entries.every(([, key]) => typeof measured[key] === 'number' && measured[key] > 0), 'Budget map: every budgeted page is measured');
    assert(budget.PAGE_BUDGETS['carbon-ai.html'] === 'carbonAiWire', 'Budget map: the EcoPrompt Coach page has a first-view budget');
    // A page budget no browser measures is an estimate nobody checks: the
    // open counts page and the field report's wire budget arrived in the
    // same wave as this map, and neither was in it.
    const mapped = new Set(Object.values(budget.PAGE_BUDGETS));
    const unmapped = Object.keys(budget.BUDGETS).filter(k => /Wire$/.test(k) && !mapped.has(k));
    assert(unmapped.length === 0, `Budget map: every page's wire budget is measured in a browser too (not: ${unmapped.join(', ') || 'none'})`);
    assert(budget.criticalAssets('field-report.html').includes('assets/favicon.svg'),
        'Budget map: a first view counts the icon, which a browser asks for on arrival');
}

clockChecks.then(() => {
    if (failures > 0) {
        console.log(`\n${failures} assertion(s) failed`);
        process.exit(1);
    }
    console.log('\nAll assertions passed');
    process.exit(0);   // the site script's timers sit on the fake clock, but be explicit
}, (err) => {
    console.log('FAIL: tooling tests threw', err);
    process.exit(1);
});
