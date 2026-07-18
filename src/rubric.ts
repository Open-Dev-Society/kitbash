/**
 * The rubric handed back by the `kitbash` tool.
 *
 * There is no model in this server. The host agent already has better repo recall
 * than anything we could afford to run here, so the server's job is to aim that
 * recall and then, in `kitbash_verify`, stop it from lying.
 *
 * This file is the aiming. It is a prompt, and it is the actual product.
 */

export interface RubricInput {
  idea: string;
  stack?: string;
  target_license?: string;
}

/**
 * Build the instruction block returned to the calling agent.
 * Pure — same input, same string.
 */
export function buildRubric(i: RubricInput): string {
  const constraints: string[] = [];
  if (i.stack) {
    constraints.push(
      `TARGET STACK: ${i.stack}\n` +
        `  Candidates must be usable from this stack. A brilliant Rust crate is not a\n` +
        `  BORROW for a TypeScript project unless it ships real bindings — say so if it does,\n` +
        `  and downgrade to KITBASH (read the algorithm, port it) if it does not.`,
    );
  }
  if (i.target_license) {
    constraints.push(
      `TARGET LICENSE: ${i.target_license}\n` +
        `  Prefer candidates compatible with this. Do not adjudicate compatibility in prose —\n` +
        `  just prefer permissive licenses for BORROW, and note in the rationale when the only\n` +
        `  good fit is copyleft. A copyleft repo is often still a fine KITBASH reference.`,
    );
  }

  const constraintBlock = constraints.length
    ? `\nCONSTRAINTS\n${constraints.map((c) => `- ${c}`).join('\n\n')}\n`
    : '';

  return `KITBASH — COMPONENT SLATE

You are deciding, component by component, what this product should borrow, what it
should adapt, and what it should just write.

IDEA
  ${i.idea}
${constraintBlock}
The claim is not "ship faster." It is "ship less." Four components not built beats
four components built quickly. Everything below serves that.


================================================================================
1. DECOMPOSE
================================================================================

Break the idea into 3-6 discrete functional components. Each gets a stable slug id
(kebab-case), a short name, and a one-sentence role describing its job IN THIS
PRODUCT — not in general.

Components must be FUNCTIONALLY DISTINCT. The failure mode is over-decomposition:
splitting one library's job into three components so the slate looks thorough.

  The canonical mistake: "video transcoder" decomposed into transcode +
  compress + format-convert. Those are not three components. They are three
  flags on ffmpeg. A domain-aware reader spots this instantly and stops
  trusting everything else on the page.

Test each boundary: would a working implementation plausibly use a DIFFERENT
library here than the component next to it? If no, it is one component. Merge it.

Under-decomposing is the cheaper error. Prefer 4 real components to 6 padded ones.


================================================================================
2. VERDICT — the heart of this
================================================================================

Every component gets exactly one:

  BORROW   A real, maintained dependency exists AND the problem has hard-won
           correctness. Rewriting it is the mistake. Take the dependency.

  KITBASH  A good reference exists but is not a clean fit — wrong runtime, too
           heavy, half the surface you need, abandoned but instructive. Read it,
           adapt the approach into your own code, do NOT take the dependency.

  WRITE    Generic enough that the agent should just write it. No repo needed.

BORROW requires BOTH halves. A maintained library for something trivial is not a
BORROW — that is a dependency you are taking to save twenty lines. Hard-won
correctness with no maintained library is a KITBASH, not a BORROW.


================================================================================
3. HARD-WON-CORRECTNESS HAZARD LIST
================================================================================

These are domains where correctness was earned over years of edge cases that
appear in NO SPEC. An LLM rewrite of any of them looks correct, passes the tests
you thought to write, and is subtly wrong in production:

  - PDF parsing and generation (malformed xref tables, encodings, embedded fonts)
  - Video/audio container muxing and demuxing; codec handling
  - Timezone and calendar math (DST transitions, leap seconds, historical offsets)
  - Character encoding, Unicode normalization, grapheme segmentation, collation
  - OAuth / OIDC / SAML flows and token lifecycle
  - Cryptography of any kind, and TLS
  - Rate limiting under contention; distributed locks
  - Retry and backoff semantics (jitter, budget, idempotency)
  - Money as floating point — decimal arithmetic and rounding rules
  - Natural-language date parsing
  - Image format decoding (chunk-level malformed input, EXIF orientation)
  - Compression codecs
  - Network protocol implementations (HTTP/2, WebSocket framing, DNS, SMTP)
  - Text search relevance scoring and tokenization
  - Charset/CSV/Excel dialect sniffing

If a component touches this list, that is a STRONG BORROW signal, and the
rationale should name the specific edge case a rewrite would miss. Not "PDFs are
hard" — "PDFs in the wild have broken xref tables and this recovers from them."


================================================================================
4. YOU ARE REQUIRED TO SAY WRITE
================================================================================

This is a requirement, not a suggestion.

In a typical decomposition AT LEAST ONE component must be WRITE. A tool that
recommends a repo for everything is a tool nobody believes, and the reader will
correctly conclude the verdicts are decoration.

Default to WRITE for:
  - glue and orchestration between the other components — the queue, the pipeline,
    the retry-this-one-file loop
  - config loading and validation
  - file watching, polling, directory walking (fs.watch + debounce + a seen-set)
  - CRUD and straightforward persistence
  - HTTP handlers, routing, request validation
  - CLI argument parsing and output formatting
  - anything whose whole implementation is under ~100 obvious lines

The tell: if you can describe the implementation in one sentence and a number ("an
array with concurrency 2 and a retry counter, about thirty lines"), it is WRITE. If
you cannot, ask what edge case you are afraid of — and if you cannot name one, it is
still WRITE.

For WRITE, the rationale must say plainly why writing it is CORRECT — the shape is
"this is N lines of obvious code and a dependency here costs more than it saves."
WRITE is a positive result. Do not phrase it as a search failure or an apology.

If your slate has zero WRITE components, you have over-borrowed. Go back and find
the glue.


================================================================================
5. RECALL — the reason this tool exists
================================================================================

For BORROW and KITBASH, propose 1-3 ranked candidate repos from your own knowledge.

DO NOT propose the repo GitHub search would return first. GitHub ranks by
popularity, which buries the correct answer under bigger, more general,
wrong-shaped projects. Correcting that ranking is the entire product.

  Prefer the under-starred EXACT fit over the popular general-purpose one.

Aim for the repo the developer would never find on their own: the 400-star library
that does precisely this one thing, the maintained fork that fixed the thing the
original never merged, the tool from an adjacent ecosystem that happens to solve
this exactly. Rank it FIRST when it genuinely fits better. Put the obvious popular
option second as the safe alternate if it is legitimately viable.

Every rationale must give a fit reason SPECIFIC TO THIS COMPONENT. It must be a
sentence you could not have written from the README alone.

  Bad:  "A fast, modern, well-maintained library for working with PDFs."
  Good: "Keeps byte offsets for every extracted span, so highlight positions
         survive back to the original page — the search index needs that and
         most extractors throw it away."

Use "owner/name" exactly as you believe it is spelled. Do not invent a plausible
owner for a package name you half-remember; a wrong guess is caught and dropped,
but you lose the slot. If you are unsure, propose fewer candidates.


================================================================================
6. OUTPUT CONTRACT
================================================================================

Produce ComponentCandidate[] — a JSON array, this exact shape:

  {
    "id": string,          // stable kebab-case slug, e.g. "pdf-text-extraction"
    "name": string,        // short human name
    "role": string,        // one sentence: its job IN THIS product
    "verdict": "BORROW" | "KITBASH" | "WRITE",
    "rationale": string,   // why THIS verdict, specific. Not a README summary.
    "candidates": [        // [] for WRITE. 1-3 ranked for BORROW/KITBASH.
      { "owner": string, "name": string }
    ]
  }

Worked example (idea: "watch a folder, OCR new PDFs, make them searchable"):

[
  {
    "id": "inbox-watcher",
    "name": "Inbox watcher",
    "role": "Notices new PDFs landing in the watched directory and enqueues them.",
    "verdict": "WRITE",
    "rationale": "fs.watch plus a 200ms debounce and a seen-set is about forty lines. The only real edge case is a file still being written, solved by waiting for size to stabilize. A watcher dependency here buys nothing and adds a native build step.",
    "candidates": []
  },
  {
    "id": "pdf-text-extraction",
    "name": "PDF text extraction",
    "role": "Pulls the existing text layer out of a PDF before falling back to OCR.",
    "verdict": "BORROW",
    "rationale": "Real-world PDFs carry broken xref tables, mixed encodings and CID fonts with no ToUnicode map. This recovers text from documents that strictly fail the spec, which is precisely the correctness no rewrite will reproduce. It also preserves per-span byte offsets, so the search index can highlight back into the original page.",
    "candidates": [
      { "owner": "pdfminer", "name": "pdfminer.six" },
      { "owner": "jsvine", "name": "pdfplumber" }
    ]
  },
  {
    "id": "ocr-engine",
    "name": "OCR engine",
    "role": "Reads text off scanned pages that carry no text layer.",
    "verdict": "BORROW",
    "rationale": "Decades of trained language data and page-segmentation heuristics. Nothing about this is reimplementable, and the failure mode of a weak OCR pass is silently wrong text that still indexes cleanly.",
    "candidates": [
      { "owner": "tesseract-ocr", "name": "tesseract" }
    ]
  },
  {
    "id": "search-index",
    "name": "Search index",
    "role": "Makes extracted page text queryable with ranked results.",
    "verdict": "KITBASH",
    "rationale": "A full search server is the wrong shape for a single-user self-hosted tool — it doubles the deployment surface. SQLite FTS5 gets you tokenization and BM25 in-process; take the schema and ranking approach from a small embedded-search project and drop the server.",
    "candidates": [
      { "owner": "nalgeon", "name": "sqlean" }
    ]
  }
]

Note the ordering in pdf-text-extraction: pdfminer.six is the lower-level, tighter
fit and has FEWER stars than pdfplumber, the more popular library built on top of it.
The tighter fit still goes first. That is the required shape, not a stylistic
preference — if your first-ranked candidate is always the most popular one, you are
doing GitHub search's job instead of this one.

Note also that both are permissively licensed. When two candidates fit comparably,
prefer the permissive one for a BORROW — you are recommending a dependency, and a
copyleft obligation is a real cost you are asking the developer to take on.

Return the array and nothing else — no prose wrapper, no markdown fence commentary.


================================================================================
7. STOP. DO NOT PRESENT ANY OF THIS TO THE USER.
================================================================================

>>> Nothing above has been verified. Some of the repos you just named DO NOT      <<<
>>> EXIST. That is the exact failure this tool exists to prevent, and showing      <<<
>>> the user an unverified slate is the one way to fail completely.                <<<

Do not summarize the slate. Do not preview the verdicts. Do not paste the JSON.

YOUR NEXT ACTION IS A TOOL CALL:

    kitbash_verify({
      idea: <the idea, verbatim>,${i.stack ? `\n      stack: ${JSON.stringify(i.stack)},` : ''}${
        i.target_license ? `\n      target_license: ${JSON.stringify(i.target_license)},` : ''
      }
      components: <the full ComponentCandidate[] array, every component, WRITE ones included>
    })

Send the WHOLE slate in one call. WRITE components carry no repos but still belong
in the report.

kitbash_verify checks every repo against the GitHub API, drops the ones that do not
exist, attaches health signals, and returns the finished report. THE DELIVERABLE
COMES BACK FROM kitbash_verify. Show the user that, and only that.

If it returns next_action: "RECALL_REPLACEMENTS", one or more components lost every
candidate. Propose new repos for those components and call kitbash_verify again.
`;
}
