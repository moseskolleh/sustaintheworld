#!/usr/bin/env node
// ===================================================================
// CHECK LINKS — actually fetch every approved off-site URL
//
//     npm run links:check
//
// scripts/lib/content.js proves a link was *approved*: the exact URL has to
// appear in APPROVED_LINKS, so an invented one fails `npm test`. What that
// cannot prove is that the remote is still there — approval is a human
// judgement made once, and repositories get renamed and profiles get deleted.
//
// This closes the gap by requesting each one. It needs network access, which
// is why it is deliberately NOT part of `npm test`: a suite that fails when
// GitHub has a bad minute teaches people to ignore failures. Run it before
// publishing, or when a link is added.
// ===================================================================

const content = require('./lib/content.js');

const TIMEOUT_MS = 10000;

async function check(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        // HEAD first — cheaper, and enough for "does this exist". Some hosts
        // refuse it, so a rejection falls back to a GET before being believed.
        let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        if (res.status === 405 || res.status === 403 || res.status === 501) {
            res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
        }
        return { ok: res.ok, status: res.status, finalUrl: res.url };
    } catch (err) {
        return { ok: false, status: null, error: err.name === 'AbortError' ? `no response in ${TIMEOUT_MS / 1000}s` : err.message };
    } finally {
        clearTimeout(timer);
    }
}

async function main() {
    const links = Object.keys(content.APPROVED_LINKS);
    console.log(`\n  checking ${links.length} approved off-site link(s)\n`);

    let failed = 0;
    let unverifiable = 0;

    for (const url of links) {
        const entry = content.APPROVED_LINKS[url];
        process.stdout.write(`  → ${url.padEnd(52)} `);

        // Some hosts refuse automated requests whatever the URL. Checking them
        // proves nothing either way, so say so rather than manufacture a pass
        // or a failure.
        if (entry.botBlocked) {
            console.log('skipped — host blocks automated requests, verify by hand');
            unverifiable++;
            continue;
        }

        const result = await check(url);

        if (!result.ok) {
            console.log(result.status ? `HTTP ${result.status}` : `FAILED — ${result.error}`);
            failed++;
            continue;
        }
        // A redirect to somewhere else is worth seeing: a renamed repository
        // still resolves, but the approved URL is no longer the real one.
        const moved = result.finalUrl && result.finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '');
        console.log(moved ? `ok (redirects to ${result.finalUrl})` : 'ok');
    }

    if (failed) {
        console.error(`\n  ${failed} link(s) did not resolve.`);
        console.error('  Fix the content, or remove the URL from APPROVED_LINKS in scripts/lib/content.js.\n');
        process.exit(1);
    }

    const checked = links.length - unverifiable;
    console.log(`\n  ${checked} link(s) resolve${unverifiable ? `; ${unverifiable} could not be checked automatically` : ''}\n`);
}

main().catch((err) => {
    console.error(`\n  check-links failed: ${err.message}\n`);
    process.exit(1);
});
