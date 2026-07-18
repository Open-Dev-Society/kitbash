/**
 * Disk snapshot of previously fetched repo facts. This is the venue-wifi insurance
 * policy: pre-warm it before the demo, and a dead network degrades the report from
 * "live" to "cached" instead of to "empty".
 *
 * Two hard rules:
 *   1. NEVER THROWS. A cache is an optimization. If it fails, the caller goes live.
 *      Every path here swallows its errors to stderr and returns a safe empty value.
 *   2. NEVER WRITES TO STDOUT. stdout is the JSON-RPC channel for the stdio server;
 *      one console.log corrupts the protocol and the server dies silently.
 */
import type { RepoFacts } from './types.js';
export declare function snapshotPath(): string;
/**
 * Read the snapshot, keyed by lowercased "owner/name". Returns {} on any miss —
 * missing file, unreadable file, malformed JSON, wrong shape.
 *
 * Records come back with source:'cache' and their ORIGINAL fetched_at intact. That
 * pairing is the point: the report labels staleness honestly rather than presenting
 * three-day-old numbers as if they were just fetched.
 *
 * Renamed repos are indexed under both the requested name and the canonical
 * full_name, with `req` rewritten to match whichever key you hit — so a lookup by
 * either spelling produces a record whose req agrees with what you asked for, and
 * the RENAMED flag fires only when it genuinely applies.
 */
export declare function readSnapshot(): Record<string, RepoFacts>;
/**
 * Merge `facts` into the snapshot on disk and write it back. Best effort: any failure
 * is logged to stderr and swallowed. Later records win over earlier ones for the same
 * key, and fresh records replace cached ones.
 *
 * Stored records keep whatever `source` they were fetched with; readSnapshot is what
 * relabels them 'cache' on the way out.
 */
export declare function writeSnapshot(facts: RepoFacts[]): void;
