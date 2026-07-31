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

`voice-manifest.json` records each track's real byte size and the grams of
CO₂e it costs to play, using the same Sustainable Web Design constant as the
footer badge. The page reads it to label the play buttons honestly.

**The page works without any of these files.** Until the manifest exists, the
listen controls use the browser's own speech engine, which downloads nothing.
Once the manifest is here, the recorded voice becomes the default and the
browser voice stays one click away at `0.00 g`.

Nothing in this directory is fetched until a visitor presses play.

`.wav` files are gitignored — they are the throwaway output of
`npm run voice:check`, which renders against the local mock server.
