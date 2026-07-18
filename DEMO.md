# Demo runbook

Read this backstage. Everything below is measured, not estimated.

---

## Pre-flight (do this before you leave for the venue)

```
cd kitbash && npm run build          # build must be current
node build/scripts/check-examples.js # every repo in the rubric must exist
claude mcp list | grep kitbash       # must say ✔ Connected
npm run snapshot                     # pre-warm the offline fallback
```

Then **rehearse the exact query once on venue wifi** if you can get there early. If GitHub is slow or throttled, the snapshot serves cached data and labels itself as cached — the demo survives, but you want to know which path you're on before you're on stage.

Have open, in this order:
1. A terminal with `claude` already running, in an empty directory
2. This file, on your phone
3. The site, in a browser tab, as the fallback

**Approve the tools once before the demo.** Run any throwaway query first so `mcp__kitbash__kitbash` is already approved. A permission prompt mid-demo costs you fifteen seconds and your rhythm.

---

## The problem with demoing an MCP server

It has no interface. It lives inside somebody else's tool, and the only visible evidence it ran is text appearing in a terminal. You cannot point at a UI.

So don't try to demo the *server*. **Demo the judgment.** The interesting thing was never the protocol — it's that the tool told you not to build something, and named a 144-star library you'd never have found. That lands in a terminal just fine.

Concretely: the moment worth pointing at is the screen where four components appear and one of them says WRITE.

---

## The script (~3 minutes)

### 0:00 — Open on the trap, not on yourself

> "Your coding agent will happily rewrite a PDF parser for you. It'll take twenty minutes and it'll look completely correct."
>
> "It won't be. PDF parsing is years of edge cases that appear in no specification — broken xref tables, CID fonts with no ToUnicode map. You find out in production."

Do not open with the founder story. Open with the thing the room already recognizes. The credentials land better at 2:30 than at 0:00.

### 0:25 — Name the shift

> "Search has always ranked by popularity instead of fit, so the right small library stays buried. That's the old problem. The new one is that when a model writes anything in twenty minutes, rebuilding *feels* free — so nobody looks first."

### 0:45 — Type it live, cold

```
Use kitbash: a CLI that ingests podcast RSS, transcribes episodes,
and makes them searchable. Python, MIT.
```

**Say "use kitbash" out loud as you type it.** Without it the agent often answers from its own knowledge and skips the tool.

While it runs — roughly 60–90 seconds, so you need to fill it — explain the architecture. This is the strongest filler you have because it's genuinely counterintuitive:

> "There's no model inside the server. Recall is the whole product — knowing that a 144-star parser exists at all — so the recall happens in the biggest model available, the one already running this session. A smaller model in my backend would be strictly worse. The server's only job is to stop it lying."

### 1:45 — The manifest lands. Point at part 04 first.

> "Four components. Three already exist. And this one — the pipeline and CLI — it's telling me to write myself."

Read its reasoning aloud. It's better than anything you'd paraphrase:

> "*The interesting state here is domain state, not queue state. Transcription is minutes per episode, so the only checkpoint that matters is a row per episode with a status column — and any task-queue dependency would still leave you writing that row yourself.*"

> "That's an argument against reaching for Celery. A tool that recommends a library for everything is a tool nobody believes — so saying 'write it yourself' is a required outcome here, not a failure."

### 2:15 — The inversion. This is the whole pitch.

> "Now look at part 01. It picked `gpodder/podcastparser` — 144 stars — over `feedparser`, which has 2,400. Seventeen times fewer stars, in the lead slot."
>
> "Because it fits better: it's the parser the gPodder client actually uses, it streams instead of loading the whole feed, and it already normalizes the itunes:duration mess. You will not find that repo by searching GitHub. It's on page four."

### 2:40 — The guarantee

> "And every repository on this screen returned a 200 from the GitHub API about thirty seconds ago. Ask any chatbot this same question and you'll get names that look exactly like these — and some of them won't exist."

### 2:55 — Close

> "I built Open Dev Society and OpenStock by knowing where to look. That instinct doesn't scale to everyone else. This is that instinct, externalized."

---

## What NOT to promise

**Don't build the pitch on catching a hallucination.** Across four cold runs in four different domains — OCR, LoRaWAN, podcasts, and one more — the hallucination count was **zero every time**. Model recall is genuinely good. If you rehearse "watch it catch a fake repo" and it doesn't fire on stage, you're improvising in front of judges.

The same machinery reframed as a *guarantee* is true on every single run: every repo shown was confirmed to exist, seconds ago. Use that.

**Don't claim 60 seconds.** Measured runs: 74s, 95s, 117s, and one over 120s. Say "about a minute" and let it beat expectations, or time your warm interactive path and quote that.

---

## Fallback ladder

| If | Then |
|---|---|
| GitHub is slow or throttled | It degrades to the snapshot automatically and labels the output "cached — not live". Say so out loud; honesty about it reads as engineering maturity, not failure. |
| The agent skips `kitbash_verify` | Say: "it's supposed to chain a verification step — let me force it." Then ask it directly to verify. Don't hide it. |
| The whole thing fails | Switch to the browser tab. The site carries the same manifest as static content and the story survives intact. |
| You're out of time | Cut sections 0:25 and 2:40. The WRITE verdict and the 144-vs-2,400 inversion are the two beats that cannot be cut. |

---

## Questions you will get

**"Isn't this just GitHub search / Octocode / GitMCP?"**
> "Those find you a repo if you already know what to search for. The gap is earlier than that — you don't know what the pieces are yet. And none of them will tell you *not* to use a repo."

**"So it's just a prompt?"**
> "The prompt is the cheap half. The server is a verification oracle — every repo the model asserts gets schema-checked and then fact-checked against the live API before you see it. That's the difference between an essay and a compiler. And putting a model in the server would have made it worse, not better — I'd be paying to downgrade the recall."

**"What stops the model recommending an abandoned repo?"**
> "Health scoring off real commit activity, and it's verdict-sensitive — an archived repo is disqualified as a dependency but still fine to read and adapt, which is a genuinely different call."

**"Why would I use this more than once?"**
> Don't oversell. "Today it's a project-start tool. The honest answer is that the assembled stacks are the interesting dataset, and I haven't built that yet." Judges respect a known gap more than a rehearsed deflection.

**"Business model?"**
> "Not today. It's a hackathon build and it's going open source. I'd rather it be right than monetized."
