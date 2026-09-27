#!/usr/bin/env node
// ===================================================================
// RUN TESTS — every suite in tests/, side by side
//
//     npm run test:unit                 every tests/*.test.js
//     npm run test:unit -- narration    only the suites whose name matches
//
// The suites used to run one after another from a list in package.json:
// twelve of them, about 17 s, most of it spent waiting on one suite at a time
// while the other cores sat idle — and a new suite did nothing until
// someone remembered to add it to the list. Here each file under tests/
// that ends in .test.js runs in its own Node process, as many at once as
// the machine has cores, so a new suite is picked up the moment it exists.
//
// Order does not matter: every suite builds its own jsdom page from the
// files on disk and writes nothing back, so no suite can see another's
// state. The output is kept readable anyway. The suites are reported in
// file-name order, each as one block: the earliest unfinished suite prints
// as it runs, and the rest hold their output until it is their turn, so
// lines from two suites never interleave.
//
// Exits non-zero if any suite does — a failed assertion, an uncaught
// exception, or a suite still running after SUITE_TIMEOUT_MS, which is
// killed rather than left to hang CI. (RUN_TESTS_DIR points it at another
// directory; tests/tooling.test.js uses that to prove a failure fails.)
// ===================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TESTS = process.env.RUN_TESTS_DIR ? path.resolve(process.env.RUN_TESTS_DIR) : path.join(ROOT, 'tests');
const LABEL = path.relative(ROOT, TESTS) || '.';
const SUITE_TIMEOUT_MS = Number(process.env.SUITE_TIMEOUT_MS) || 120000;

const filters = process.argv.slice(2);
const suites = fs.readdirSync(TESTS)
    .filter(f => f.endsWith('.test.js'))
    .filter(f => !filters.length || filters.some(p => f.includes(p)))
    .sort();

if (!suites.length) {
    console.error(`  no suites in ${LABEL}/ match ${filters.join(', ') || '*.test.js'}`);
    process.exit(1);
}

const limit = Math.max(1, Math.min(os.availableParallelism(), suites.length));
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

// One record per suite, in report order.
const runs = suites.map(name => ({ name, chunks: [], started: false, shown: false, done: false, code: null, ms: 0 }));
let cursor = 0;   // the suite whose output is printing live

const header = (r) => process.stdout.write(`\n── ${LABEL}/${r.name} ${'─'.repeat(Math.max(3, 56 - r.name.length))}\n`);
const footer = (r) => process.stdout.write(`── ${r.code === 0 ? 'passed' : 'FAILED'} in ${seconds(r.ms)}\n`);

// Print everything that is ready: the live suite's buffer, and each
// following suite that has already finished, until one is still running —
// which then becomes the live one.
function drain() {
    while (cursor < runs.length) {
        const r = runs[cursor];
        if (!r.started) return;
        if (!r.shown) { header(r); r.shown = true; }
        r.chunks.forEach(c => process.stdout.write(c));
        r.chunks = [];
        if (!r.done) return;
        footer(r);
        cursor++;
    }
}

function start(r) {
    r.started = true;
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(TESTS, r.name)], {
        cwd: ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env
    });
    const collect = (chunk) => { r.chunks.push(chunk); if (runs[cursor] === r) drain(); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (err) => r.chunks.push(`\n  ✗ could not start: ${err.message}\n`));
    const timer = setTimeout(() => {
        r.chunks.push(`\n  ✗ still running after ${seconds(SUITE_TIMEOUT_MS)} — killed\n`);
        child.kill('SIGKILL');
    }, SUITE_TIMEOUT_MS);
    return new Promise((resolve) => {
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            r.ms = Date.now() - t0;
            r.code = code === null ? `${signal}` : code;
            r.done = true;
            drain();
            resolve();
        });
    });
}

(async () => {
    const t0 = Date.now();
    let next = 0;
    const worker = async () => {
        while (next < runs.length) {
            const r = runs[next++];
            await start(r);
        }
    };
    await Promise.all(Array.from({ length: limit }, worker));
    drain();

    const failed = runs.filter(r => r.code !== 0);
    const total = runs.reduce((n, r) => n + r.ms, 0);
    console.log(`\n  ${runs.length} suite${runs.length === 1 ? '' : 's'}, ${runs.length - failed.length} passed, in ${seconds(Date.now() - t0)} ` +
        `(${seconds(total)} of work across ${limit} at a time)`);
    if (failed.length) {
        console.log(`  failed: ${failed.map(r => r.name).join(', ')}\n`);
        process.exit(1);
    }
    console.log('');
})();
