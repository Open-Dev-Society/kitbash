/**
 * The anti-hallucination layer.
 *
 * The host model proposes repos from memory. Some of them do not exist. This
 * module's contract is absolute: one RepoFacts per input ref, in input order,
 * no matter what GitHub, the network, or the caller does. It never throws.
 *
 * NEVER writes to stdout — stdout is the JSON-RPC channel.
 */
import type { RepoRef, RepoFacts } from '../types.js';
/**
 * Fetch facts for every ref. Never throws.
 *
 * One RepoFacts per input, order preserved. Identical refs (case-insensitive)
 * are deduped before fetching and re-expanded after, so a repo the model named
 * three times costs one request. Each expansion keeps its own `req` string, so
 * the caller can always match a result back to what it asked for.
 */
export declare function fetchRepoFacts(refs: RepoRef[]): Promise<RepoFacts[]>;
