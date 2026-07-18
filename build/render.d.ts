/**
 * Renders the verified slate into the demo artifact.
 *
 * Pure. No I/O, no mutation of the input. `now` is injectable so output is
 * deterministic under test; it is only used to age cache snapshots honestly.
 */
import type { RepoAssessment, VerifyResult } from './types.js';
type Report = Omit<VerifyResult, 'markdown'>;
/**
 * @param demotions component id -> the agent's first-ranked surviving candidate, when
 *   rank() demoted it below something else. Passed at render time rather than stored on
 *   ResolvedComponent because types.ts is the frozen contract; this is presentation
 *   state, and it exists only so the report can be honest about whose rationale it is
 *   printing. Empty map = no swaps happened, which is the common case.
 */
export declare function renderReport(r: Report, now?: number, demotions?: ReadonlyMap<string, RepoAssessment>): string;
export {};
