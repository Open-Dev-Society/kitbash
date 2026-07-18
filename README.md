# kitbash

An MCP server that tells you which parts of your idea already exist.

Describe what you want to build. Kitbash decomposes it into components and gives each
one a verdict — **BORROW** (a real, maintained dependency exists; rewriting it is the
mistake), **KITBASH** (good reference, imperfect fit — read it, adapt it, don't take the
dep), or **WRITE** (generic enough that you should just write it).

Then it checks every repo it named against the live GitHub API and deletes the ones that
don't exist.

## The two-tool handshake

**There is no model in this server.** That is the design, not a shortcut. The host agent
already has far better GitHub recall than anything this server could afford to run. So
the server does not try to out-remember it — it aims it, then stops it from lying.

1. **`kitbash`** returns a rubric and nothing else. The agent does the decomposition and
   the repo recall itself, following the rubric.
2. **`kitbash_verify`** takes the agent's completed slate and fact-checks it. Every
   `owner/name` is resolved against `GET /repos/{owner}/{repo}`. Invented repos are
   dropped and counted. Archived, unlicensed, forked, renamed, and long-abandoned repos
   are flagged. BORROW on a repo nobody has touched in two years gets a loud warning.
   Survivors are ranked and rendered into the report the user sees.

The split exists because the failure this tool prevents is *confident invention*. A model
asked for repo names will produce plausible ones at a meaningful rate, and they read as
completely real in a chat window. Step 2 is the only reason to trust step 1.

Ranking deliberately treats stars as a weak signal — logarithmic, capped at 20 of 100
points. A 50k-star repo out-earns a 300-star repo by about 9 points: enough to break a
tie, never enough to win on popularity alone. The 300-star exact fit that GitHub search
buries is the thing worth surfacing.

## Install

```bash
npm install
npm run build
```

Requires Node 18+ (developed on Node 24).

### GitHub token

Unauthenticated works but is rate-limited to 60 requests/hour. Kitbash picks up a token
from `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token` — in that order. If you have the
GitHub CLI authenticated, there is nothing to configure.

Without a token, private repos are indistinguishable from nonexistent ones (both 404),
so they will be reported as not found.

## Register the server

```bash
claude mcp add kitbash -- node "$(pwd)/build/index.js"
```

The path must be **absolute**. `claude mcp add` registers at user scope, so a relative
`build/index.js` resolves against whatever directory the client happens to be launched
from — anywhere but this repo it exits 1 with `MODULE_NOT_FOUND` before the transport
connects, and the client reports only a generic "server failed to start" with both tools
silently absent.

Or use the project-scoped `.mcp.json` already in this repo, which registers the same
command (also as an absolute path) for anyone who opens the project.

## Demo query

> Build me a desktop app that watches a folder and makes scanned PDFs searchable.

The agent calls `kitbash`, produces a slate, calls `kitbash_verify`, and gets back a
report where the repos that don't exist have already been removed — with the count
stated at the top.

## Offline insurance

`fixtures/snapshot.json` is a disk cache of previously fetched repo facts. Pre-warm it
before a demo:

```bash
npm run snapshot -- tesseract-ocr/tesseract mozilla/pdf.js nextapps-de/flexsearch
```

If the network degrades mid-run, `kitbash_verify` fills the gaps from the snapshot and
labels every cached record as cached, in the report and in the JSON. A 404 is never
filled from cache — a repo that doesn't exist is a real answer, not a gap.

## Notes for contributors

stdout is the JSON-RPC channel. One `console.log` anywhere in the process corrupts the
protocol and the server dies silently. Use `console.error` for all logging;
`src/index.ts` reroutes `console.log`/`info`/`debug` to stderr as a backstop.

Local imports need explicit `.js` extensions. Under Node16 ESM resolution, omitting them
typechecks clean and crashes at runtime.

`src/types.ts` is the frozen contract. Every other module depends on it and nothing else.
