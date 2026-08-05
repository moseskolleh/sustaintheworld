# assets/audio

Generated narration. Do not edit by hand.

Each `<section>.mp3` here is rendered from the matching script in
[`voice-scripts.js`](../../voice-scripts.js) by
[`scripts/generate-voice.js`](../../scripts/generate-voice.js):

```bash
cp .env.example .env                              # paste your Fish Audio key in
npm run voice -- --clone path/to/your-voice.mp3   # clone your voice, render everything
npm run voice                                     # later: re-render only what changed
```

## Whose voice this is

**The narration is synthetic.** It is *Spiritual African Narrator*
(`650ec6ce2dda4f1faf86fae5d591ca32`), a stock text-to-speech voice from the
Fish Audio voice library, used under that library's terms. It is **not** a
recording of Moses Kolleh Sesay, and it is not a clone of anyone's voice — no
personal voice sample was ever uploaded, so no third party's consent is
involved.

The player used to label this option "Moses", which invited exactly the wrong
inference. It now shows the voice's real title and says in the player that it
is synthetic. `voice-manifest.json` carries `voiceTitle`, `voiceKind` and
`voiceProvider` so the page never has to hardcode a name again.

To narrate in a real voice instead, run `npm run voice -- --clone <sample>`
with a recording you have the right to use. That makes `voiceKind` `human`,
and the page's wording follows.

## How the current tracks were made

Through the Fish Audio MCP connection (free tier, 500-byte calls), one
sentence-group at a time, then stitched back into whole sections by
[`scripts/assemble-voice.js`](../../scripts/assemble-voice.js) from the chunk
URLs recorded in
[`scripts/voice-chunks.json`](../../scripts/voice-chunks.json).

Both generators compute track signatures through one shared module,
[`scripts/lib/voice-signature.js`](../../scripts/lib/voice-signature.js), so
either can take over from the other. Before that module existed they hashed
different field lists, and `npm run voice` treated every assembled track as
stale — a dry run offered to re-render all ten sections, roughly 7,700 credits
for audio that already existed. `tests/voice.test.js` now runs the real
generator in dry-run against the committed manifest and fails if it plans to
spend anything.

`npm run voice:assemble -- --from-disk` rewrites the manifest from the mp3
files already here, downloading nothing — for when the audio is right but the
manifest needs restating.

## What the numbers mean

`voice-manifest.json` records each track's real byte size and the grams of
CO₂e attributable to **transferring** it, using the same Sustainable Web
Design constant (0.36 g CO₂e per MB) as the footer badge.

That figure covers network transfer and nothing else. It excludes the energy
your device spends decoding the audio and driving a speaker, and for the
browser voice it excludes the cost of synthesising speech. Every figure in the
player says "transfer" for that reason: the browser voice moves zero bytes,
which is genuinely zero *transfer* emissions — but it is not free.

## Without these files

**The page works without any of them.** Until the manifest exists, the listen
controls use the browser's own speech engine, which transfers nothing. Once
the manifest is here, the recorded narration becomes the default and the
browser voice stays one click away.

If neither a recording nor a speech engine is available, the controls stay
hidden rather than offering a button that does nothing.

Nothing in this directory is fetched until a visitor presses play.

`.wav` files are gitignored — they are the throwaway output of
`npm run voice:check`, which renders against the local mock server.
