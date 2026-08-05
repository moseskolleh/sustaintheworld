#!/usr/bin/env node
// ===================================================================
// VERIFY MCP PIN
//
// .mcp.json launches a third-party npm package and hands it a live Fish
// Audio API key. It is pinned to an exact version, and the integrity hash of
// that version's tarball is recorded alongside it. A pin alone still trusts
// the registry: a maintainer (or anyone who takes over the account) can
// unpublish and republish the same version number with different code.
//
// This asks the registry what that exact version's tarball hashes to today
// and compares it with the recorded value, so a swap under a pinned version
// is something you find out about rather than something you run.
//
//     npm run mcp:verify
//
// Needs network access. Not part of `npm test` for that reason — run it
// before trusting the audition tool with a key, and after any pin change.
// ===================================================================

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG = path.join(ROOT, '.mcp.json');

function fail(message) {
    console.error(`\n  ${message}\n`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const comment = [].concat(config.$comment || []).join('\n');

// Every server whose command is npx has to name an exact version, or the pin
// is not a pin. Adding an unpinned server should fail this check loudly.
const servers = Object.entries(config.mcpServers || {});
if (!servers.length) fail('.mcp.json declares no MCP servers');

let checked = 0;

servers.forEach(([name, server]) => {
    const args = server.args || [];
    const spec = args.find(a => typeof a === 'string' && !a.startsWith('-'));

    if (server.command !== 'npx') {
        console.log(`  · ${name}: not launched through npx — nothing to pin`);
        return;
    }
    if (!spec) fail(`${name}: npx is invoked with no package argument`);

    // "@scope/name@1.2.3" — the version is the @ that is not at position 0.
    const at = spec.lastIndexOf('@');
    const version = at > 0 ? spec.slice(at + 1) : '';
    const pkg = at > 0 ? spec.slice(0, at) : spec;

    if (!/^\d+\.\d+\.\d+/.test(version)) {
        fail(`${name}: "${spec}" is not pinned to an exact version.\n` +
             `  npx would resolve and execute whatever is published as latest,\n` +
             `  with FISH_API_KEY already in its environment.`);
    }

    const expected = (comment.match(new RegExp(`integrity:\\s*(sha\\d+-[A-Za-z0-9+/=]+)`)) || [])[1];
    if (!expected) {
        fail(`${name}: no integrity hash recorded in the .mcp.json $comment for ${pkg}@${version}`);
    }

    process.stdout.write(`  · ${name}: ${pkg}@${version} … `);

    let actual;
    try {
        actual = execFileSync('npm', ['view', `${pkg}@${version}`, 'dist.integrity'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        }).trim().replace(/^['"]|['"]$/g, '');
    } catch (err) {
        console.log('FAILED');
        fail(`could not reach the npm registry for ${pkg}@${version}: ${err.message.split('\n')[0]}`);
    }

    if (!actual) {
        console.log('FAILED');
        fail(`${pkg}@${version} is not published, or has been unpublished`);
    }

    if (actual !== expected) {
        console.log('MISMATCH');
        fail(`${pkg}@${version} does not match the recorded integrity hash.\n` +
             `  recorded: ${expected}\n` +
             `  registry: ${actual}\n\n` +
             `  The same version now resolves to a different tarball. Do not run it\n` +
             `  with an API key until you know why.`);
    }

    console.log('integrity matches');
    checked++;
});

console.log(`\n  ${checked} pinned MCP package(s) verified against the registry\n`);
