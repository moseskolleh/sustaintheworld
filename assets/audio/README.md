# assets/audio

Generated narration. Do not edit by hand.

Each `<section>.mp3` here is rendered from the matching script in
[`voice-scripts.js`](../../voice-scripts.js) by
[`scripts/generate-voice.js`](../../scripts/generate-voice.js):

```bash
cp .env.example .env      # then paste your Fish Audio key into it
npm run voice             # only re-renders scripts whose text changed
```

The current tracks were rendered another way: through the Fish Audio MCP
connection (free tier, 500-byte calls), one sentence-group at a time, and
stitched back into whole sections by
[`scripts/assemble-voice.js`](../../scripts/assemble-voice.js) using the
chunk URLs recorded in [`scripts/voice-chunks.json`](../../scripts/voice-chunks.json)
(voice: *Spiritual African Narrator*, `650ec6ce2dda4f1faf86fae5d591ca32`).
Both generators write the same manifest, so either can re-render later —
set `FISH_AUDIO_VOICE_ID` to the id above (or a clone of your own voice)
and `npm run voice` takes over from here.

`voice-manifest.json` records each track's real byte size and the grams of
CO₂e it costs to play, using the same Sustainable Web Design constant as the
footer badge. The page reads it to label the play buttons honestly.

**The page works without any of these files.** Until the manifest exists, the
listen controls use the browser's own speech engine, which downloads nothing.
The recorded voice appears as a second option once you have run the generator
and committed the output.

Nothing in this directory is fetched until a visitor presses play.
