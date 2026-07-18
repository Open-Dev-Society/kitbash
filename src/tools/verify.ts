/**
 * Tool 2 of 2: `kitbash_verify`.
 *
 * The agent hands us a slate it produced from memory. This tool's job is to find out
 * which of it is real. Every candidate repo is fetched from the live GitHub API,
 * assessed, ranked, and either kept or dropped — and the repos that turn out not to
 * exist are counted and named, because that count is the product's entire thesis.
 *
 * Two rules that shape everything below:
 *   1. NEVER FABRICATE. If the network dies we fall back to a disk snapshot, and every
 *      record sourced that way is labelled `cache` all the way through to the markdown.
 *      A stale-but-honest report beats a fresh-looking lie.
 *   2. NEVER WRITE TO STDOUT. stdout is the JSON-RPC channel.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type {
  ComponentCandidate,
  GithubStatus,
  RepoAssessment,
  RepoFacts,
  RepoRef,
  RejectedRepo,
  ResolvedComponent,
  VerifyResult,
  VerifyStats,
} from '../types.js';
import { fetchRepoFacts } from '../github/repos.js';
import { isAuthenticated, lastRemaining } from '../github/client.js';
import { readSnapshot } from '../cache.js';
import { assess, disqualify, rank } from '../score.js';
import { renderReport } from '../render.js';

/** Above this, the live batch is considered degraded and we look at the snapshot. */
const SLOW_BATCH_MS = 3000;
/** Fraction of results that must be indeterminate before we reach for the cache. */
const DEGRADED_FRACTION = 0.5;

const DEFAULT_TARGET_LICENSE = 'MIT';

const DESCRIPTION = [
  'STEP 2 OF 2, AND IT IS NOT OPTIONAL. Fact-checks a slate of components and candidate',
  'repos against the live GitHub API, then returns the finished report for the user.',
  '',
  'Call this immediately after you have followed the rubric from the `kitbash` tool and',
  'assembled your components. Pass every component, including WRITE components (which',
  'carry no candidate repos).',
  '',
  'What it does: resolves every owner/name you propose, drops the ones that do not exist,',
  'flags archived / unlicensed / abandoned repos, warns when BORROW is proposed on a repo',
  'nobody has touched in years, ranks the survivors, and renders the report.',
  '',
  'The response has two parts: markdown to show the user, and a JSON object. READ THE',
  'JSON. If `next_action` is "RECALL_REPLACEMENTS", one or more components had every',
  'candidate die — you must propose fresh repos for exactly those components and call',
  'this tool again before answering. If `next_action` is "DONE", present the markdown.',
  '',
  'Do not present your own unverified repo list. Present what comes back from here.',
].join('\n');

/* ------------------------------------------------------------------ */
/* input schema — raw zod shape mirroring VerifyInput from types.ts     */
/* ------------------------------------------------------------------ */

const repoRefSchema = z.object({
  owner: z.string().describe('GitHub owner or org, e.g. "tesseract-ocr".'),
  name: z.string().describe('Repo name without the owner, e.g. "tesseract".'),
});

const componentSchema = z.object({
  id: z.string().describe('Stable slug, e.g. "ocr-engine".'),
  name: z.string().describe('Human-readable component name.'),
  role: z
    .string()
    .describe("One sentence: this component's job in THIS product, not in general."),
  verdict: z
    .enum(['BORROW', 'KITBASH', 'WRITE'])
    .describe(
      'BORROW = a real maintained dependency exists. KITBASH = good reference, imperfect fit. WRITE = generic enough to just write.',
    ),
  rationale: z
    .string()
    .describe('Why this verdict, specific to this component. Not a README summary.'),
  candidates: z
    .array(repoRefSchema)
    .describe('Empty for WRITE. 1-3 ranked repos for BORROW/KITBASH.'),
});

/* ------------------------------------------------------------------ */
/* fetch + cache fallback                                              */
/* ------------------------------------------------------------------ */

/**
 * A result we learned nothing from.
 *
 * 404 is the ONLY status that means "this repo does not exist" — a real, load-bearing
 * answer meaning "the model invented this repo", and it must never be papered over
 * with a cache hit.
 *
 * EVERY OTHER non-answer is indeterminate and must reach for the snapshot:
 *   0    network failure, timeout, DNS (see github/repos.ts)
 *   401  expired / revoked PAT or gh token
 *   403  primary rate limit — 60/hr unauthenticated, and a venue NAT is shared
 *   429  secondary rate limit
 *   200  but unparseable — a captive portal answering with text/html
 *   5xx  GitHub itself is down
 *
 * Testing `status === 0` here instead was a real bug: every failure above carried a
 * non-zero status, bypassed the cache entirely, and rendered a report that
 * simultaneously claimed the repos returned 200 and that they had failed verification.
 */
function isIndeterminate(f: RepoFacts): boolean {
  return f.exists === false && f.status !== 404;
}

interface BatchOutcome {
  facts: RepoFacts[];
  source: GithubStatus['source'];
}

/**
 * Fetch every ref, then repair indeterminate results from the disk snapshot when the
 * batch looks degraded — either half of it came back indeterminate, or it took long
 * enough that we should assume the network is against us.
 *
 * Cached records keep source:'cache' and their original fetched_at, so the renderer
 * can age them honestly.
 */
async function fetchWithFallback(refs: RepoRef[]): Promise<BatchOutcome> {
  if (refs.length === 0) return { facts: [], source: 'live' };

  const started = Date.now();
  const facts = await fetchRepoFacts(refs);
  const elapsed = Date.now() - started;

  const indeterminate = facts.filter(isIndeterminate).length;
  const degraded =
    indeterminate >= facts.length * DEGRADED_FRACTION || elapsed > SLOW_BATCH_MS;

  let usedCache = false;

  if (degraded && indeterminate > 0) {
    const snapshot = readSnapshot();
    for (let i = 0; i < facts.length; i++) {
      const f = facts[i]!;
      if (!isIndeterminate(f)) continue;
      const hit = snapshot[f.req.trim().toLowerCase()];
      if (!hit) continue;
      // Keep the caller's spelling of req; take everything else from the snapshot,
      // including source:'cache' and the original fetched_at.
      facts[i] = { ...hit, req: f.req };
      usedCache = true;
    }
    if (usedCache) {
      console.error(
        `[verify] degraded batch (${indeterminate}/${facts.length} indeterminate, ${elapsed}ms) — filled from snapshot`,
      );
    }
  }

  // A record that failed the network still carries source:'live' (see github/repos.ts
  // `dead`), but nothing was actually learned from GitHub for it. Counting those as
  // live makes an all-cache batch report itself as 'mixed', and the header then claims
  // repos were "checked against the GitHub API just now" when none were.
  const liveCount = facts.filter((f) => f.source === 'live' && !isIndeterminate(f)).length;
  const cacheCount = facts.filter((f) => f.source === 'cache').length;

  const source: GithubStatus['source'] =
    cacheCount === 0 ? 'live' : liveCount === 0 ? 'cache' : 'mixed';

  return { facts, source };
}

/* ------------------------------------------------------------------ */
/* pipeline                                                            */
/* ------------------------------------------------------------------ */

/**
 * A resolved component plus the presentation-only fact that rank() overrode the
 * agent's own first choice. `demotedFrom` is deliberately NOT part of
 * ResolvedComponent — types.ts is the frozen contract, and this is something the
 * renderer needs rather than something the result promises.
 */
interface Resolution {
  component: ResolvedComponent;
  /** The agent's first-ranked SURVIVING candidate, when it is not the one picked. */
  demotedFrom?: RepoAssessment;
}

function resolveComponent(
  component: ComponentCandidate,
  factsByIndex: RepoFacts[],
  targetLicense: string,
): Resolution {
  const survivors: RepoAssessment[] = [];
  const rejected: RejectedRepo[] = [];

  // Order matters and is guaranteed: fetchRepoFacts returns one RepoFacts per input
  // ref IN INPUT ORDER, and `factsByIndex` is this component's contiguous slice of
  // that array. So `survivors` reaches rank() in the agent's own candidate order,
  // which rank() now treats as the primary sort key. Do not reorder this loop.
  for (const facts of factsByIndex) {
    const assessment = assess(facts, component.verdict, targetLicense);
    const reject = disqualify(assessment);
    if (reject) rejected.push(reject);
    else survivors.push(assessment);
  }

  // Captured BEFORE ranking: the repo the agent led with, among those that survived
  // verification. `rationale` was written about THIS repo.
  const agentFirst = survivors[0];

  const ranked = rank(survivors);
  const [picked, ...alternates] = ranked;

  // A swap only counts when something else actually took the lead slot. If the
  // agent's #1 died in verification, agentFirst is already the next survivor and no
  // demotion happened — the rejection is reported separately.
  const demotedFrom =
    picked && agentFirst && picked.req !== agentFirst.req ? agentFirst : undefined;

  // A candidate rejected for anything other than a hard 404 was not judged — GitHub
  // simply never answered for it (rate limit, auth, captive portal, 5xx). Recalling
  // replacement repos cannot fix a rate limit: the replacements fail identically, and
  // `next_action: RECALL_REPLACEMENTS` sends the agent round the same loop, burning
  // round trips while the report insists nothing is usable. Under a real outage the
  // honest output is "we could not check", not "propose different repos".
  const unreachable = rejected.some((r) => r.reason === 'ERROR' && r.status !== 404);

  // WRITE components have nothing to recall — they were never supposed to have repos.
  const needs_recall =
    component.verdict !== 'WRITE' &&
    component.candidates.length > 0 &&
    ranked.length === 0 &&
    !unreachable;

  return {
    component: {
      id: component.id,
      name: component.name,
      role: component.role,
      verdict: component.verdict,
      rationale: component.rationale,
      ...(picked ? { picked } : {}),
      alternates,
      rejected,
      needs_recall,
    },
    ...(demotedFrom ? { demotedFrom } : {}),
  };
}

/**
 * WRITE components contribute nothing to the denominator. Counting them would dilute
 * the hallucination rate with components that were never supposed to have a repo —
 * the number would drift toward zero as the slate grew, which is backwards.
 */
function computeStats(components: ResolvedComponent[]): VerifyStats {
  let proposed = 0;
  let verified = 0;
  let hallucinated = 0;

  for (const c of components) {
    if (c.verdict === 'WRITE') continue;

    const all: RepoAssessment[] = [...(c.picked ? [c.picked] : []), ...c.alternates];
    proposed += all.length + c.rejected.length;
    verified += all.filter((a) => a.exists).length;
    // Only a hard 404 counts as invented. A network failure means we do not know,
    // and inflating the headline number with unknowns would be its own small lie.
    hallucinated += c.rejected.filter((r) => r.reason === 'NOT_FOUND').length;
  }

  const hallucination_rate = proposed === 0 ? 0 : hallucinated / proposed;

  return { proposed, verified, hallucinated, hallucination_rate };
}

/** A direct machine directive. The agent acts on this, so it is imperative, not prose. */
function buildInstructions(components: ResolvedComponent[], stats: VerifyStats): string {
  const stuck = components.filter((c) => c.needs_recall);

  if (stuck.length > 0) {
    const names = stuck.map((c) => `"${c.id}" (${c.name})`).join(', ');
    return [
      `ACTION REQUIRED. Every candidate repo died for ${stuck.length} component(s): ${names}.`,
      'Do NOT answer the user yet, and do NOT present a component with no repo as if it were resolved.',
      `For each of those components ONLY, propose 1-3 different real GitHub repos and call kitbash_verify again with the FULL component list (resolved components unchanged, stuck components carrying new candidates).`,
      'If after a second attempt you genuinely cannot recall a real repo for a component, change its verdict to WRITE and say plainly that no suitable existing project was found.',
    ].join(' ');
  }

  const halluc =
    stats.hallucinated > 0
      ? ` ${stats.hallucinated} of the ${stats.proposed} repos you proposed do not exist and have been removed — do not reintroduce them.`
      : '';

  // The rubric's one HARD requirement is "at least one component must be WRITE", and
  // until now nothing enforced it. It also competes against a far more vivid 14-item
  // hazard list that pulls hard toward BORROW, so a zero-WRITE slate renders as a
  // clean, confident report with nobody objecting.
  //
  // This is a NUDGE, not a gate. Erroring would be wrong: a three-component slate
  // that is genuinely all dependencies is rare but real, and blocking it would make
  // the tool argue with a correct answer. The threshold is 3 because a two-component
  // slate is too small for "you forgot the glue" to be a safe inference.
  const noWrite = components.length >= 3 && components.every((c) => c.verdict !== 'WRITE');

  const writeFloor = noWrite
    ? ' NOTE: this slate has ZERO WRITE components. Every part of this product is a repo you ' +
      'took from someone else, which is almost never the true shape of a build. The glue, the ' +
      'config loading, and the orchestration between these components are near-certainly yours ' +
      'to write. Re-read the decomposition, and if any component is really under ~100 lines of ' +
      'obvious code, change its verdict to WRITE and call kitbash_verify again. If you have ' +
      'genuinely considered this and every component still warrants a dependency, present the ' +
      'report as-is.'
    : '';

  return (
    'DONE. Every component resolved. Present the markdown report above to the user as-is; ' +
    'it is the deliverable. Do not add repos of your own to it, do not re-rank it, and do not ' +
    'restate its contents from memory — every fact in it was checked against the live GitHub API ' +
    'and yours were not.' +
    halluc +
    writeFloor
  );
}

/* ------------------------------------------------------------------ */
/* registration                                                        */
/* ------------------------------------------------------------------ */

export function registerVerifyTool(server: McpServer): void {
  server.registerTool(
    'kitbash_verify',
    {
      title: 'Kitbash: verify the slate (step 2 of 2)',
      description: DESCRIPTION,
      // RAW ZOD SHAPE — not z.object(), not JSON Schema.
      inputSchema: {
        idea: z.string().describe('The same idea string passed to `kitbash`.'),
        stack: z.string().optional().describe('Target stack, if known.'),
        target_license: z
          .string()
          .optional()
          .describe(`SPDX id the user ships under. Defaults to ${DEFAULT_TARGET_LICENSE}.`),
        components: z
          .array(componentSchema)
          .describe('The full slate, including WRITE components.'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ idea, stack, target_license, components }) => {
      void stack; // accepted for symmetry with `kitbash`; verification is stack-agnostic
      const targetLicense =
        target_license && target_license.trim() ? target_license.trim() : DEFAULT_TARGET_LICENSE;

      const input = (components ?? []) as ComponentCandidate[];

      // 1. Flatten every ref across every component, remembering where each came from,
      //    so one batched round-trip covers the whole slate.
      const refs: RepoRef[] = [];
      const spans: Array<{ start: number; count: number }> = [];

      for (const c of input) {
        const candidates = Array.isArray(c.candidates) ? c.candidates : [];
        spans.push({ start: refs.length, count: candidates.length });
        refs.push(...candidates);
      }

      // 2 + 3. One batch, with a snapshot fallback if the network is against us.
      const { facts, source } = await fetchWithFallback(refs);

      // 4 + 5. Assess, disqualify, rank, and rebuild each component.
      const resolutions = input.map((c, i) => {
        const span = spans[i]!;
        return resolveComponent(c, facts.slice(span.start, span.start + span.count), targetLicense);
      });

      const resolved: ResolvedComponent[] = resolutions.map((x) => x.component);

      // Where rank() overrode the agent's own #1. The renderer needs this to avoid
      // printing the agent's rationale under a repo it was not written about.
      const demotions = new Map<string, RepoAssessment>();
      for (const x of resolutions) {
        if (x.demotedFrom) demotions.set(x.component.id, x.demotedFrom);
      }

      // 6.
      const stats = computeStats(resolved);

      const github: GithubStatus = {
        authenticated: isAuthenticated(),
        remaining: lastRemaining(),
        source,
      };

      // 7.
      const next_action: VerifyResult['next_action'] = resolved.some((c) => c.needs_recall)
        ? 'RECALL_REPLACEMENTS'
        : 'DONE';

      const report: Omit<VerifyResult, 'markdown'> = {
        idea,
        components: resolved,
        stats,
        github,
        next_action,
        instructions: buildInstructions(resolved, stats),
      };

      // 8.
      const markdown = renderReport(report, Date.now(), demotions);

      const result: VerifyResult = { ...report, markdown };

      console.error(
        `[verify] ${resolved.length} component(s), ${stats.proposed} proposed, ` +
          `${stats.hallucinated} hallucinated, source=${source}, next=${next_action}`,
      );

      return {
        content: [
          // The artifact the user sees.
          { type: 'text' as const, text: markdown },
          // The same run as data, so the agent can branch on next_action instead of
          // trying to parse intent back out of the prose.
          {
            type: 'text' as const,
            text: `<kitbash_result_json>\n${JSON.stringify(result, null, 2)}\n</kitbash_result_json>`,
          },
        ],
      };
    },
  );
}
