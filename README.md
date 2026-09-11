# kitbash

**Most of what you're about to build already exists.**

Describe what you want to make. Kitbash breaks it into parts and gives each one a verdict:
**BORROW** it, **KITBASH** it (read it, adapt it), or **WRITE** it yourself. Then it checks
every repository it named against the live GitHub API and deletes the ones that don't exist
before you see them.

It works in any agent that speaks MCP, and it needs no API key.

[![npm](https://img.shields.io/npm/v/kitbash-mcp?color=cb3837&label=npm)](https://www.npmjs.com/package/kitbash-mcp)
[![license](https://img.shields.io/badge/license-GPL--2.0-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-server-8a2be2)](https://modelcontextprotocol.io)

```bash
claude mcp add kitbash -- npx -y kitbash-mcp
```

---

## The trap

Your coding agent will happily rewrite a PDF parser for you. It'll take twenty minutes
and it'll look completely correct.

It won't be. PDF parsing is years of edge cases that appear in no spec: broken xref
tables, CID fonts with no ToUnicode map. The same goes for timezone math, OAuth, Unicode
normalization, container muxing, and rate limiting under contention. You find out in
production.

The opposite trap is just as common: pulling in a dependency to save twenty lines of glue.

Search can't help. It ranks by popularity, not fit, so the right small library stays
buried on page four. And when a model will write anything in twenty minutes, rebuilding
*feels* free, so nobody looks first.

**Kitbash is the ten-second judgment a senior developer makes before writing anything,
turned into a tool.** It isn't selling speed. Four components you never build beat four
components you build quickly.

## What it looks like

Real output for *"a CLI that ingests podcast RSS, transcribes episodes, and makes them
searchable."* Every repo returned `200` from the GitHub API seconds before it was printed.

| # | Component | Verdict | Part | Stars | License |
|---|---|---|---|---|---|
| 01 | Podcast feed parsing | **BORROW** | [gpodder/podcastparser](https://github.com/gpodder/podcastparser) | 144 | ISC |
| 02 | Speech-to-text | **BORROW** | [SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 24,000 | MIT |
| 03 | Transcript search index | **KITBASH** | [simonw/sqlite-utils](https://github.com/simonw/sqlite-utils) | 2,100 | Apache-2.0 |
| 04 | Episode pipeline and CLI | **WRITE** | *yours: about a hundred lines* | — | — |

Two things to notice:

- **A 144-star repo beat a 2,400-star one for the lead slot.** `podcastparser` is the parser
  the gPodder client actually uses. It streams instead of building the XML tree, and it
  already normalizes the `itunes:duration` mess. `feedparser` is the popular fallback,
  ranked second. Surfacing the exact fit GitHub search buries is the whole product.
- **It told you to write part 04 yourself**, and argued for it: *"The interesting state
  here is domain state, not queue state. Transcription is minutes per episode, so the only
  checkpoint that matters is a row per episode with a status column. Any task-queue
  dependency would still leave you writing that row yourself."* A tool that recommends a
  repo for everything is a tool nobody believes, so WRITE is a required outcome.

## Install

Pick whichever fits how you work. They all run the same two tools.

### Claude Code plugin

```
/plugin marketplace add Open-Dev-Society/kitbash
/plugin install kitbash@kitbash
```

### MCP server (Claude Code, Cursor, Claude Desktop, VS Code, Codex, Windsurf, …)

```bash
claude mcp add kitbash -- npx -y kitbash-mcp     # Claude Code
codex mcp add kitbash -- npx -y kitbash-mcp      # Codex CLI
```

For clients configured in JSON (Cursor `~/.cursor/mcp.json`, Claude Desktop
`claude_desktop_config.json`, Windsurf):

```json
{
  "mcpServers": {
    "kitbash": { "command": "npx", "args": ["-y", "kitbash-mcp"] }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "kitbash": { "type": "stdio", "command": "npx", "args": ["-y", "kitbash-mcp"] }
  }
}
```

On native Windows, use `"command": "cmd", "args": ["/c", "npx", "-y", "kitbash-mcp"]`.

### Remote connector (claude.ai, ChatGPT, any client that takes a URL)

Add a custom connector pointing at a hosted kitbash:

```
https://YOUR-DEPLOYMENT/mcp
```

It speaks Streamable HTTP with no auth. See [Self-hosting](#self-hosting) to run your own.

### Agent skill (no MCP required)

```bash
npx skills add Open-Dev-Society/kitbash
```

This installs [`skills/kitbash/SKILL.md`](skills/kitbash/SKILL.md) into Claude Code, Cursor,
Codex, and [other agents](https://skills.sh). The skill carries the same rubric, and
verification runs through `npx kitbash-mcp verify`. It's the same fact-checker without an
MCP connection.

## Use it

Describe something you were about to build:

> Use kitbash: a desktop app that watches a folder and makes scanned PDFs searchable. TypeScript, MIT.

Saying "use kitbash" helps. Otherwise the agent sometimes answers from its own knowledge
and skips the tool. A run takes about a minute.

## How it works

**There is no model inside this server.** That's the design, not a shortcut.

Recall is the product: knowing that a 144-star parser exists at all. The best recall
available is in the model already running your session, which is far larger than anything
this server could afford to host. So kitbash doesn't try to out-remember it. It aims that
recall, then stops it from lying.

1. **`kitbash`** returns a rubric and nothing else. The agent decomposes the idea into 3–6
   functionally distinct components, gives each a verdict, and recalls candidate repos,
   favoring the under-starred exact fit over the popular general one. The rubric ships a
   hazard list of domains where correctness was hard-won (PDF, crypto, timezones, OAuth,
   codecs, Unicode, …), so those lean BORROW. Glue, config, CRUD, and anything under ~100
   obvious lines lean WRITE.
2. **`kitbash_verify`** fact-checks the slate. Every `owner/name` goes to
   `GET /repos/{owner}/{repo}`, and the ones that don't exist are dropped and counted.
   Archived, disabled, unlicensed, forked, renamed, and long-abandoned repos are flagged,
   and BORROW on a repo nobody has touched in two years gets a loud warning. If every
   candidate for a component dies, the agent is sent back for replacements before it can
   answer.

A model asked for repo names produces plausible ones, and invented names read as
completely real in a chat window. Step 2 is the only reason to trust step 1: **every repo
in the final report was confirmed to exist seconds before you saw it.**

Ranking keeps the agent's own ordering first, and repo health can only *demote*. Stars are
a weak signal on purpose. Sorting by stars would re-bury exactly the repo the rubric just
dug up.

About 950 ms to verify 10 repos, in parallel over REST.

## GitHub token

Unauthenticated works, but it's limited to 60 requests an hour. Kitbash picks up a token
from `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`, in that order. If the GitHub CLI is
logged in, there's nothing to configure.

Without a token, private repos look the same as nonexistent ones (both 404), so they'll be
reported as not found.

## Self-hosting

The same binary serves Streamable HTTP for remote connectors:

```bash
npm ci && npm run build
GITHUB_TOKEN=ghp_… PORT=3000 npm run start:http    # → http://localhost:3000/mcp
```

It runs stateless: a fresh server per request, and no user data is kept between calls.
Deploy it anywhere that runs Node 18+ (Render, Railway, Fly, a VPS) with build command
`npm ci && npm run build` and start command `npm run start:http`.

Set `GITHUB_TOKEN` in production. Every caller shares that token's 5,000 requests an hour,
and a full verification run costs up to 15.

## Offline insurance

`fixtures/snapshot.json` is a disk cache of previously fetched repo facts. Pre-warm it
before a demo:

```bash
npm run snapshot -- tesseract-ocr/tesseract mozilla/pdf.js nextapps-de/flexsearch
```

If the network degrades mid-run, verification fills the gaps from the snapshot and labels
every cached record as cached. A 404 is never filled from cache: a repo that doesn't exist
is a real answer, not a gap.

## Contributing

```bash
npm install && npm run build
claude mcp add kitbash-dev -- node "$(pwd)/build/index.js"
```

- stdout is the JSON-RPC channel. One `console.log` anywhere corrupts the protocol and the
  server dies silently. Log with `console.error`. `src/index.ts` reroutes
  `console.log`/`info`/`debug` to stderr as a backstop.
- Local imports need explicit `.js` extensions. Under Node16 ESM resolution, leaving them
  out typechecks clean and crashes at runtime.
- `src/types.ts` is the frozen contract. Every other module depends on it and nothing else.
- `src/rubric.ts` is the product. After editing it, run `npm run skill` to regenerate
  `skills/kitbash/SKILL.md`, and `npm run check:examples` to confirm every repo the rubric
  names still exists.

## License

[GPL-2.0](LICENSE)
