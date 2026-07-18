/**
 * The anti-hallucination layer.
 *
 * The host model proposes repos from memory. Some of them do not exist. This
 * module's contract is absolute: one RepoFacts per input ref, in input order,
 * no matter what GitHub, the network, or the caller does. It never throws.
 *
 * NEVER writes to stdout — stdout is the JSON-RPC channel.
 */
import { ghFetch } from './client.js';
/** Max in-flight requests. REST-parallel measured 799ms vs 1149ms for GraphQL at n=10. */
const CONCURRENCY = 10;
function reqOf(ref) {
    return `${ref.owner}/${ref.name}`;
}
/** Case-insensitive identity. GitHub owner/name are case-insensitive on lookup. */
function keyOf(ref) {
    return `${ref.owner.trim().toLowerCase()}/${ref.name.trim().toLowerCase()}`;
}
function isUsable(ref) {
    return (typeof ref?.owner === 'string' &&
        typeof ref?.name === 'string' &&
        ref.owner.trim().length > 0 &&
        ref.name.trim().length > 0);
}
function dead(req, status, fetchedAt) {
    return { req, exists: false, status, source: 'live', fetched_at: fetchedAt };
}
function toFacts(req, r, fetchedAt) {
    return {
        req,
        exists: true,
        status: 200,
        full_name: r.full_name,
        html_url: r.html_url,
        description: r.description ?? null,
        stars: r.stargazers_count ?? 0,
        pushed_at: r.pushed_at,
        // Includes open PRs. That is GitHub's definition, not ours to fix here.
        open_issues: r.open_issues_count ?? 0,
        // license can be null outright; spdx_id can be the literal string "NOASSERTION".
        license: r.license?.spdx_id ?? null,
        archived: r.archived ?? false,
        // Distinct from archived: DMCA/abuse disabled.
        disabled: r.disabled ?? false,
        is_fork: r.fork ?? false,
        private: r.private ?? false,
        // NOT always "main".
        default_branch: r.default_branch,
        language: r.language ?? null,
        source: 'live',
        fetched_at: fetchedAt,
    };
}
async function fetchOne(ref) {
    const req = reqOf(ref);
    const fetchedAt = new Date().toISOString();
    const path = `/repos/${encodeURIComponent(ref.owner.trim())}/${encodeURIComponent(ref.name.trim())}`;
    let outcome;
    try {
        outcome = await ghFetch(path);
    }
    catch {
        // ghFetch is documented never to throw; this is the last line of defence.
        return dead(req, 0, fetchedAt);
    }
    if (!outcome.ok) {
        // status is already 0 for network/abort/DNS failures.
        return dead(req, outcome.status, fetchedAt);
    }
    if (!outcome.data || typeof outcome.data !== 'object') {
        return dead(req, 0, fetchedAt);
    }
    return toFacts(req, outcome.data, fetchedAt);
}
/**
 * Fetch facts for every ref. Never throws.
 *
 * One RepoFacts per input, order preserved. Identical refs (case-insensitive)
 * are deduped before fetching and re-expanded after, so a repo the model named
 * three times costs one request. Each expansion keeps its own `req` string, so
 * the caller can always match a result back to what it asked for.
 */
export async function fetchRepoFacts(refs) {
    if (!Array.isArray(refs) || refs.length === 0)
        return [];
    const results = new Array(refs.length);
    // key -> indices of every input ref that shares it.
    const groups = new Map();
    for (let i = 0; i < refs.length; i++) {
        const ref = refs[i];
        if (!isUsable(ref)) {
            // Malformed ref: never worth a request. status 0 = we learned nothing.
            const req = typeof ref?.owner === 'string' || typeof ref?.name === 'string'
                ? `${ref?.owner ?? ''}/${ref?.name ?? ''}`
                : '/';
            results[i] = dead(req, 0, new Date().toISOString());
            continue;
        }
        const key = keyOf(ref);
        const existing = groups.get(key);
        if (existing)
            existing.push(i);
        else
            groups.set(key, [i]);
    }
    const keys = [...groups.keys()];
    for (let start = 0; start < keys.length; start += CONCURRENCY) {
        const chunk = keys.slice(start, start + CONCURRENCY);
        const settled = await Promise.all(chunk.map(async (key) => {
            const indices = groups.get(key);
            const canonical = refs[indices[0]];
            return { indices, facts: await fetchOne(canonical) };
        }));
        for (const { indices, facts } of settled) {
            for (const idx of indices) {
                // Re-expand: same facts, but `req` reflects how THIS caller spelled it.
                results[idx] = { ...facts, req: reqOf(refs[idx]) };
            }
        }
    }
    return results;
}
//# sourceMappingURL=repos.js.map