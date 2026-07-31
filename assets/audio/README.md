# assets/audio

Generated narration. Do not edit by hand.

Each `<section>.mp3` here is rendered from the matching script in
[`voice-scripts.js`](../../voice-scripts.js) by
[`scripts/generate-voice.js`](../../scripts/generate-voice.js):

```bash
cp .env.example .env      # then paste your Fish Audio key into it
npm run voice             # only re-renders scripts whose text changed
```

`voice-manifest.json` records each track's real byte size and the grams of
CO₂e it costs to play, using the same Sustainable Web Design constant as the
footer badge. The page reads it to label the play buttons honestly.

**The page works without any of these files.** Until the manifest exists, the
listen controls use the browser's own speech engine, which downloads nothing.
The recorded voice appears as a second option once you have run the generator
and committed the output.

Nothing in this directory is fetched until a visitor presses play.
