# assets/audio

The recordings the page may play. Do not edit by hand.

There is at most one: **`intro.mp3`, Moses Kolleh Sesay introducing himself
in his own voice**, a single 60–90 second take opening with "Kushe". He reads
it from the `intro` script in [`content/narration.json`](../../content/narration.json),
and the player shows that script as its captions.

```bash
npm run voice:intro -- path/to/take.mp3               # copy it in, measure it, write the manifest entry
npm run voice:intro -- path/to/take.mp3 --seconds 78  # if the length cannot be read from the file
```

[`scripts/voice-intro.js`](../../scripts/voice-intro.js) copies the take to
`intro.mp3`, measures its bytes and duration (ffprobe if installed, otherwise
from the MP3's own frame headers, otherwise `--seconds`), and writes the
`intro` entry in `voice-manifest.json`: `file`, `bytes`, `grams`, `seconds`,
`voiceKind: "recorded"`, `voiceTitle: "Moses Kolleh Sesay"` and the hash of
the script it was read from. It is his own voice, recorded by him, so no voice
model, API key or third-party consent is involved, and nothing is uploaded
anywhere.

**Until he records it, `voice-manifest.json` lists no tracks** and the page
offers no recording. The sections are read by the visitor's own browser voice
either way, which transfers nothing. The manifest stays in place, empty, so
the player's one request for it never 404s.

## What happened to the ten section tracks

Until September 2026 this directory held ten section tracks, 4.13 MB in all,
read by *Spiritual African Narrator*, a stock text-to-speech voice from the
Fish Audio library. They were retired, for three reasons:

- **They repeated claims the page no longer makes.** Audio cannot be fixed
  with a text edit; it has to be rendered again.
- **Every copy edit made them stale, and re-rendering costs money.** A full
  render is about 7,850 Fish Audio credits against a free allowance of 8,000,
  and a track has to match its script, so each change to the homepage was a
  bill.
- **A stock voice reading first-person lines was never Moses.** The page said
  so honestly, but "I grew up where water scarcity isn't a statistic" in a
  stranger's synthetic voice is a different proposition from him saying it.

The pipeline that made them is still in the repository for anyone who wants
rendered sections (see [docs/narration-setup.md](../../docs/narration-setup.md)).
It runs only when asked with `npm run voice -- --sections`, and the page's
player no longer plays section tracks. The audio budget in
[`scripts/check-budget.js`](../../scripts/check-budget.js) is 800 KB, sized
for the one introduction, so section tracks cannot come back without a
deliberate decision to raise it.

## What the numbers mean

The manifest records the recording's real byte size and the grams of CO₂e
attributable to **transferring** it, using the same Sustainable Web Design
constant (0.36 g CO₂e per MB) as the footer badge.

That figure covers network transfer and nothing else. It excludes the energy
the listener's device spends decoding the audio and driving a speaker, and
for the browser voice it excludes the cost of synthesising speech. Every
figure in the player says "transfer" for that reason: the browser voice moves
zero bytes, which is genuinely zero *transfer* emissions, but it is not free.

The recording is fetched only when a visitor asks to hear it. The manifest
(under 1 KB) is fetched when the player first opens, or once, 1.5 s after
the page has loaded, in a browser with no speech voice, to learn whether
there is a recording to offer.

`.wav` files are gitignored: they are the throwaway output of
`npm run voice:check`, which renders against the local mock server.
