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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Resolved against THIS MODULE, not process.cwd(). The server is spawned by the MCP
 * client with the client's working directory, which is essentially never the project
 * root — a cwd-relative path would silently miss the snapshot on every real run.
 *
 * Works from both src/ (tsx) and build/ (compiled): both sit one level under the root.
 */
const SNAPSHOT_PATH = fileURLToPath(new URL('../fixtures/snapshot.json', import.meta.url));
export function snapshotPath() {
    return SNAPSHOT_PATH;
}
function isRepoFactsLike(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const r = v;
    return typeof r.req === 'string' && typeof r.exists === 'boolean' && typeof r.status === 'number';
}
function keyFor(s) {
    return s.trim().toLowerCase();
}
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
export function readSnapshot() {
    let raw;
    try {
        raw = readFileSync(SNAPSHOT_PATH, 'utf8');
    }
    catch {
        return {}; // no snapshot yet is the normal cold state, not an error worth logging
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        console.error(`[cache] snapshot.json is not valid JSON, ignoring: ${String(err)}`);
        return {};
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        console.error('[cache] snapshot.json is not an object, ignoring');
        return {};
    }
    const out = {};
    try {
        for (const value of Object.values(parsed)) {
            if (!isRepoFactsLike(value))
                continue;
            const base = {
                ...value,
                source: 'cache',
                fetched_at: typeof value.fetched_at === 'string' ? value.fetched_at : 'unknown',
            };
            const primary = keyFor(base.req);
            if (primary)
                out[primary] = base;
            if (base.full_name) {
                const alias = keyFor(base.full_name);
                if (alias && alias !== primary) {
                    out[alias] = { ...base, req: base.full_name };
                }
            }
        }
    }
    catch (err) {
        console.error(`[cache] failed while indexing snapshot, ignoring: ${String(err)}`);
        return {};
    }
    return out;
}
/**
 * Merge `facts` into the snapshot on disk and write it back. Best effort: any failure
 * is logged to stderr and swallowed. Later records win over earlier ones for the same
 * key, and fresh records replace cached ones.
 *
 * Stored records keep whatever `source` they were fetched with; readSnapshot is what
 * relabels them 'cache' on the way out.
 */
export function writeSnapshot(facts) {
    if (!Array.isArray(facts) || facts.length === 0)
        return;
    try {
        const merged = {};
        // Start from what is already on disk so a partial pre-warm never destroys prior
        // coverage. Read the file directly rather than via readSnapshot() so we do not
        // persist the 'cache' relabelling or the full_name aliases back into the file.
        try {
            const existing = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
            if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
                for (const [k, v] of Object.entries(existing)) {
                    if (isRepoFactsLike(v))
                        merged[keyFor(k)] = v;
                }
            }
        }
        catch {
            // no existing snapshot, or it is corrupt — either way, start clean
        }
        for (const f of facts) {
            if (!isRepoFactsLike(f))
                continue;
            const k = keyFor(f.req);
            if (k)
                merged[k] = f;
        }
        mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
        writeFileSync(SNAPSHOT_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        console.error(`[cache] wrote ${Object.keys(merged).length} repo(s) to ${SNAPSHOT_PATH}`);
    }
    catch (err) {
        console.error(`[cache] failed to write snapshot, continuing without it: ${String(err)}`);
    }
}
//# sourceMappingURL=cache.js.map