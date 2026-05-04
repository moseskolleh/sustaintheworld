// Focused repros for two additional bugs.
// Run with: npm i --no-save jsdom && node tests/bugs2.test.js

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let failures = 0;
function assert(cond, msg) {
    if (cond) console.log('PASS:', msg);
    else { console.log('FAIL:', msg); failures++; }
}

// --- Bug A: carbon-ai.js suggest() must not produce NaN% tip when tokens = 0 ---
{
    const { suggest } = require(path.join('..', 'carbon-ai.js'));
    const tips = suggest({
        modelKey: 'gpt-4o',
        regionKey: 'nl',          // intensity 268, > 100 — triggers tip #2
        wueKey: 'avg',
        inputTokens: 0,
        outputTokens: 0,
        queriesPerDay: 0,
        pue: 1.2
    });
    const hasNaN = tips.some(t => /NaN/i.test(t.text));
    assert(!hasNaN, 'BugA: no tip should contain "NaN" when tokens = 0 (got: '
        + JSON.stringify(tips.map(t => t.text)) + ')');
}

// --- Bug B: keyboard nav must NOT fire on Ctrl+C / Cmd+C / Ctrl+H ---
{
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.com/' });
    const { window } = dom;
    window.localStorage.setItem('theme', 'dark');

    const scrollCalls = [];
    window.HTMLElement.prototype.scrollIntoView = function () { scrollCalls.push(this.id || this.tagName); };
    window.scrollTo = () => {};
    window.IntersectionObserver = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
    window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    window.console.error = () => {};

    window.eval(js);

    // Baseline: bare 'c' should still navigate
    scrollCalls.length = 0;
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true }));
    assert(scrollCalls.includes('contact'),
        'BugB sanity: bare "c" should scroll to #contact (got: ' + JSON.stringify(scrollCalls) + ')');

    // Ctrl+C should NOT navigate (user is copying)
    scrollCalls.length = 0;
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }));
    assert(scrollCalls.length === 0,
        'BugB: Ctrl+C must not trigger nav scroll (got: ' + JSON.stringify(scrollCalls) + ')');

    // Cmd+C (mac) should NOT navigate
    scrollCalls.length = 0;
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }));
    assert(scrollCalls.length === 0,
        'BugB: Cmd+C must not trigger nav scroll (got: ' + JSON.stringify(scrollCalls) + ')');

    // Ctrl+H (browser history) should NOT navigate
    scrollCalls.length = 0;
    window.document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true }));
    assert(scrollCalls.length === 0,
        'BugB: Ctrl+H must not trigger nav scroll (got: ' + JSON.stringify(scrollCalls) + ')');
}

if (failures > 0) {
    console.log(`\n${failures} assertion(s) failed`);
    process.exit(1);
} else {
    console.log('\nAll assertions passed');
}
