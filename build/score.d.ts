/**
 * Pure judgment layer. Zero I/O, zero clock dependencies beyond `now` (injectable
 * only through the facts themselves — see `daysSincePush`).
 *
 * Turns raw GitHub facts into the call the demo actually shows: is this repo alive,
 * is it safe to BORROW, and should it be surfaced at all.
 *
 * Design bias that matters: stars are a WEAK positive signal, never a ranking axis.
 * This product exists to surface the 300-star exact fit that GitHub search buries
 * under the 50k-star wrong-shaped project. Stars contribute logarithmically and cap
 * at 20 of 100 points, so a 50k-star repo out-earns a 300-star repo by ~9 points —
 * enough to break a tie, never enough to win on popularity alone.
 */
import type { RepoFacts, RepoAssessment, RejectedRepo, Verdict } from './types.js';
/**
 * Whole days between `pushed_at` and now. Null when GitHub gave us nothing usable —
 * that is a real state (empty repos have no pushed_at) and must not read as "fresh".
 */
export declare function daysSincePush(f: RepoFacts, now?: number): number | null;
/**
 * Apply judgment to one repo's facts.
 *
 * `verdict` is the agent's call for the component this repo was proposed under. It
 * only affects `verdict_fit` / `fit_note` — the health numbers are verdict-independent
 * so the same repo scores identically wherever it appears.
 */
export declare function assess(f: RepoFacts, verdict: Verdict, targetLicense?: string, now?: number): RepoAssessment;
/**
 * Best first. Non-mutating.
 *
 * THE AGENT'S RANKING IS THE PRODUCT. This function is where "the 400-star exact fit
 * beats the 50k-star general one" actually lives — everything else in this codebase is
 * plumbing around this ordering decision.
 *
 * The host model was told, in rubric.ts, to surface the under-starred repo that does
 * precisely this one thing and to rank it FIRST, putting the obvious popular library
 * second as the safe alternate. It complies. If we then re-sorted purely by
 * health_score we would undo that in the same breath: health_score carries
 * log(stars) worth up to 20 points, so a 2.6k-star generic library out-scores a
 * 412-star exact fit by roughly 6 points on popularity alone and takes the lead
 * slot. The tool would be instructing the model to dig the buried repo up and then
 * burying it again itself — contradicting the README on stage.
 *
 * So: PROPOSAL ORDER IS THE PRIMARY KEY. `i` is the index the agent handed us.
 * Health is a VETO, never a promotion. It can only push a repo DOWN, and only when
 * the repo is materially worse than a rival — a gap of more than DEMOTE_GAP points,
 * which in practice means archived, unlicensed, or years dead, not merely less
 * popular. A repo can never climb over an earlier one by being more popular.
 *
 * The 'warn' tier still sinks below every 'ok' repo unconditionally. If we have
 * flagged BORROW-on-a-dead-repo, it must not be the thing we lead with no matter
 * where the agent put it.
 *
 * The ordering is a genuine total order — see rankTier for why that took care to
 * get right, and why a pairwise gap threshold would not have been one.
 */
export declare function rank(list: RepoAssessment[]): RepoAssessment[];
/**
 * Should this repo be dropped instead of shown? Null means keep it.
 *
 * ARCHIVED is intentionally verdict-sensitive: an archived repo is still a perfectly
 * good thing to KITBASH from — frozen code you read and adapt does not need a
 * maintainer — but it is not something you take a dependency on. `assess` encodes
 * that verdict context: an archived repo only carries verdict_fit 'warn' when the
 * verdict was BORROW, so the conjunction below is exactly "archived AND BORROW".
 */
export declare function disqualify(a: RepoAssessment): RejectedRepo | null;
