# Setting up the narration toolchain

Two separate things need credentials, and they are easy to confuse:

| | what it is | needs |
|---|---|---|
| **`npm run voice`** | the build step that renders the narration that ships | `FISH_AUDIO_API_KEY` in your shell or `.env` |
| **fish-audio MCP** | a conversational tool for auditioning voices | `FISH_AUDIO_API_KEY` exported in the shell that launches Claude |

Both read the **same** variable, so one export covers both.

**Short version: do this locally.** The build writes files that get committed, and
cloud environments have no secrets store. The sections below cover all three
surfaces anyway, including what breaks where.

---

## 1. Locally (terminal / Claude Code CLI)

This is the recommended path and the only one where every part works.

### Step 1 — get the code and dependencies

```bash
git clone https://github.com/moseskolleh/sustaintheworld.git
cd sustaintheworld
npm install
```

Node 20 or newer. `node --version` to check.

### Step 2 — put the key in your shell

```bash
export FISH_AUDIO_API_KEY=your_key_here
```

To make it permanent, add that line to `~/.zshrc` (macOS default) or
`~/.bashrc` (most Linux), then `source` it. On Windows PowerShell:

```powershell
$env:FISH_AUDIO_API_KEY = "your_key_here"
```

Verify: `echo $FISH_AUDIO_API_KEY` should print the key.

### Step 3 — the MCP server for auditioning

Nothing to install. [`.mcp.json`](../.mcp.json) is committed at the repo root, so
starting Claude Code from this directory picks it up:

```bash
claude
```

The first time, Claude Code asks whether to trust the project's MCP servers —
approve it. Then `/mcp` should list `fish-audio` as connected, exposing
`fish_audio_tts` and `fish_audio_list_references`.

The key is **not** in `.mcp.json`. It contains `${FISH_AUDIO_API_KEY}`, expanded
from the shell that launched Claude Code. If you exported the key after starting
Claude, restart it.

Ask for a few candidates reading the same line, then listen to
`.voice-auditions/` and pick one. Note its `reference_id`.

### Step 3b — pick a voice

Two routes. **Cloning your own** (step 4) is the one the scripts were written
for: they are first person, they open with a Krio greeting, and they say "I grew
up where water scarcity isn't a statistic." A stock voice delivering those lines
as you is a different proposition, and some visitors will notice.

If you want a library voice anyway, audition candidates on your own copy rather
than on whatever demo line a voice page happens to play:

```bash
npm run voice -- --audition <id1>,<id2>,<id3>
```

That renders the opening of the hero script in each voice into
`.voice-auditions/` — around 150 bytes per voice, so roughly 450 credits to
compare three. Listen, then put the winner in `.env` as `FISH_AUDIO_VOICE_ID`
and run `npm run voice`.

Use `--audition-text "…"` to try a different line. A good test line is one with
a proper noun, a number and a technical term, since that is where voices trip:

```bash
npm run voice -- --audition <id1>,<id2> \
  --audition-text "Q.G.I.S. and Arc.G.I.S. — for groundwater maps that struck water seven times out of ten."
```

**Finding IDs.** Browse [fish.audio/voice-library/male](https://fish.audio/voice-library/male/)
and open a voice; the model id is the last path segment of its URL, and that is
what goes in `reference_id`. For this site the tone that fits is documentary
narration — measured, warm, unhurried. The library's high-energy
creator-style voices read badly against field notes about boreholes and flood
risk. Categories worth starting from are
[documentary](https://fish.audio/voice-library/documentary/),
[professional](https://fish.audio/voice-library/professional/) and
[announcer](https://fish.audio/voice-library/announcer/).

Whatever you pick, listen to a full section before rendering all ten. A voice
that sounds fine for one sentence can grate over 60 seconds.

### Step 4 — clone your voice and render

Record 30–60 seconds of yourself talking normally. No music, no background
noise, no room echo. This single file decides how the whole site sounds.

```bash
cp .env.example .env          # paste the key in as well; .env is gitignored
npm run voice -- --clone path/to/your-voice.mp3
```

That uploads the sample, creates the voice model, writes the returned id back
into `.env`, and renders all ten sections. Later runs re-render only what changed:

```bash
npm run voice
```

### Step 5 — check it, then ship it

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

Press **listen** on any section. When you are happy:

```bash
git add assets/audio && git commit -m "Add recorded narration" && git push
```

### What it costs

Fish Audio bills **1 credit per UTF-8 byte of text**, so the price is knowable
before anything runs:

```bash
npm run voice -- --dry-run
```

The full page is **~7,708 credits**. The free plan grants **8,000 per cycle**, so
one complete render uses about 96% of a free month and leaves almost nothing for
corrections. Check your balance and per-call limit first — ask the Fish Audio
connector for `get_credit_balance`, or look at the dashboard.

Two things follow from that:

- Get the scripts right **before** rendering. `npm run voice:check` (below) is free.
- Cloning a voice is free. Only speech costs credits.

### The per-call limit takes care of itself

Fish Audio caps how much text one call accepts, and the cap depends on the plan:
500 UTF-8 bytes on free, 15000 on lite/plus, 30000 on other paid tiers. Every
script here is longer than 500 bytes.

You don't have to track this. Scripts are split at sentence boundaries to fit
`FISH_AUDIO_MAX_BYTES` (default 500) and the audio is joined back into one file
per section. If the service rejects a chunk as too long, the generator halves the
limit and retries automatically, keeping the lower value for the rest of the run
— so a wrong setting costs one rejected call, not one per section, and a rejected
call renders nothing and bills nothing.

Splitting costs no extra credits, since billing is per byte of text. Fewer, larger
calls do sound marginally better, because there are no joins at all:

```bash
FISH_AUDIO_MAX_BYTES=15000 npm run voice -- --force
```

Worth doing if you are on a paid tier or a trial that grants one. Ask the Fish
Audio connector for `get_credit_balance` to see your plan and current
`tts_max_text_bytes_per_call`.

### If your access is time-limited

A free month is a deadline as much as a budget. Two things are worth doing early,
because they are the parts that can't be rushed later:

1. **Clone your voice.** Cloning is free and the id doesn't expire with the trial.
2. **Render the narration.** Rendered `.mp3` files are committed to the repo and
   keep working forever — the site never calls Fish Audio at runtime. Whatever
   you render while access lasts is yours permanently.

Editing scripts afterwards costs credits again, so settle the wording with
`npm run voice:check` first, then render.

### Rehearsing without spending credits

```bash
npm run voice:mock      # terminal 1
npm run voice:check     # terminal 2
```

Renders against a local stand-in that speaks the same protocol. Useful for
checking a script edit reads well before paying to render it. Output is `.wav`
and gitignored, so it can never be confused with the real narration.

---

## 2. Claude Desktop app

Good for auditioning voices. **It cannot run the build** — that needs a terminal.

### Code tab (has a terminal)

The Code tab runs real Claude Code sessions against a local checkout, so
everything in section 1 applies. Open the repo in the Code tab and the committed
`.mcp.json` is picked up the same way.

Caveat: the app must inherit `FISH_AUDIO_API_KEY`. GUI apps launched from the
Dock or Start menu often do not see shell exports. If `/mcp` shows `fish-audio`
failing to start, either launch the app from a terminal that has the variable, or
define the server in `claude_desktop_config.json` with the key inline (below).

### Chat tab (connectors)

For the chat surface, add the server to `claude_desktop_config.json`:

| OS | path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "fish-audio": {
      "command": "npx",
      "args": ["-y", "@alanse/fish-audio-mcp-server"],
      "env": {
        "FISH_API_KEY": "your_key_here",
        "FISH_MODEL_ID": "s1",
        "FISH_OUTPUT_FORMAT": "mp3",
        "FISH_MP3_BITRATE": "64"
      }
    }
  }
}
```

Restart the app afterwards.

Note the variable here is `FISH_API_KEY` — the MCP server's own name — not
`FISH_AUDIO_API_KEY`. The repo's `.mcp.json` maps between them; a hand-written
Desktop config has to use the server's name directly.

**This file holds the key in plaintext.** That is the tradeoff for the chat
surface. Desktop's own config supports no variable expansion, so if you would
rather not have a second copy of the key on disk, use the Code tab instead.

Servers defined here are loaded into local Code tab sessions too. To copy them
into the standalone CLI (macOS and WSL):

```bash
claude mcp add-from-claude-desktop
```

---

## 3. Claude Code on the web (cloud sessions)

The committed `.mcp.json` **is** picked up in cloud sessions — it arrives with
the clone. But two things block it out of the box, and one of them is a real
security tradeoff.

### Blocker 1 — the key

Cloud environments have **no secrets store**. Environment variables are readable
by anyone who uses the environment, and Anthropic's docs explicitly say not to
put credentials there.

If you accept that, set it at [claude.ai/code](https://claude.ai/code):

1. Select the cloud icon above the message box to open the environment selector
2. Hover your environment → settings icon (or **Add cloud environment**)
3. In **Environment variables**, add one `.env`-format line:
   ```
   FISH_AUDIO_API_KEY=your_key_here
   ```
4. Save

Only sessions started *after* the change get the value.

### Blocker 2 — network access

This is the one that stopped me. The default **Trusted** level allows package
registries and GitHub, and nothing else — so `api.fish.audio` is refused at the
proxy with a 403 on CONNECT.

In the same dialog:

1. Set **Network access** to **Custom**
2. In **Allowed domains**, add **both**:
   ```
   api.fish.audio
   platform.r2.fish.audio
   ```
3. Tick **Also include default list of common package managers** — without it,
   npm stops working
4. Save

The second domain is easy to miss and breaks the render on its own: `api.fish.audio`
accepts the request, but the generated audio is served from `platform.r2.fish.audio`,
and a session that can reach only the first gets the job accepted and the bytes
refused.

Changing allowed hosts rebuilds the environment cache, so the next session takes
slightly longer to start.

With both in place, `npm run voice` and the MCP server both work in a cloud
session exactly as they do locally.

### The better cloud option

MCP **connectors** configured on claude.ai route through Anthropic's servers
rather than the session's network, so they need no domain allowlisting and no key
in environment variables. Fish Audio runs an official remote server with OAuth:

```
https://api.fish.audio/mcp
```

Add it as a custom connector on claude.ai, or in the CLI:

```bash
claude mcp add --transport http fish-audio https://api.fish.audio/mcp
```

It signs in through the browser, stores no key on disk, and bills against your
**plan** credits rather than developer API credits.

Its tools are `search_voices`, `get_voice`, `text_to_speech`, `create_voice_clone`,
`speech_to_text` and `get_credit_balance`. **Cloning through it is free** — you
only pay for speech.

This covers auditioning, and it genuinely works inside a locked-down cloud
session, because connector traffic never touches the session's network. What it
cannot do is finish the job: `text_to_speech` returns a URL on
`platform.r2.fish.audio`, and downloading that file *does* go through the
session's network. So in a default cloud environment you can generate audio you
cannot save. The build step still needs the API key and both domains reachable.

---

## Which surface for which job

| | audition voices | run `npm run voice` | commit the audio |
|---|---|---|---|
| **Local terminal** | yes | yes | yes |
| **Desktop — Code tab** | yes | yes | yes |
| **Desktop — Chat tab** | yes | no | no |
| **Cloud session** | yes, with a connector | only after both blockers above | yes |

**Do the render locally.** It is the one place where the key stays in a file you
control, on a machine you control, and where nothing has to be loosened to make
it work.

---

## Troubleshooting

**`/mcp` doesn't list fish-audio** — you started Claude Code outside the repo
root, or declined the trust prompt. `cd` into the repo and restart.

**fish-audio connects but every call fails 401** — the key isn't reaching the
server. `echo $FISH_AUDIO_API_KEY` in the same shell that launched Claude. If it
is empty, export it and restart Claude Code; `.mcp.json` expands at launch.

**`npm run voice` says the key is not set** — it reads the shell first, then
`.env`. Check for a typo in `.env` and that the file is at the repo root.

**Something fails with a Fish Audio error you don't recognise** — the generator
prints the server's own response verbatim. That message names the field or quota
at fault; it is almost always a one-line fix.

**`--clone` rejects your sample** — the format must be one of mp3, wav, m4a, ogg,
opus, flac, webm, aac, and the file must be over 8 KB. A very short clip is
refused on purpose; it would produce a poor clone.
