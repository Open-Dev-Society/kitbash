/**
 * The GitHub REST transport.
 *
 * Error classification is this module's entire reason to exist. Everything
 * upstream (the anti-hallucination layer) makes decisions off `kind`, so a
 * misclassified 403 is the difference between "this repo does not exist" and
 * "we ran out of budget". Get it exactly right.
 *
 * NEVER writes to stdout — stdout is the JSON-RPC channel.
 */
import { resolveToken } from './token.js';
const API_ROOT = 'https://api.github.com';
const DEFAULT_TIMEOUT_MS = 3000;
/** Last observed x-ratelimit-remaining, across every response this process saw. */
let remainingSeen = null;
export function lastRemaining() {
    return remainingSeen;
}
export function isAuthenticated() {
    return resolveToken().token !== null;
}
function readRemaining(headers) {
    const raw = headers.get('x-ratelimit-remaining');
    if (raw === null)
        return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
}
function readRetryAfterMs(headers) {
    const raw = headers.get('retry-after');
    if (raw === null)
        return undefined;
    // GitHub sends delta-seconds. Tolerate an HTTP-date just in case.
    const secs = Number.parseInt(raw, 10);
    if (Number.isFinite(secs) && String(secs) === raw.trim()) {
        return Math.max(0, secs * 1000);
    }
    const when = Date.parse(raw);
    if (Number.isFinite(when))
        return Math.max(0, when - Date.now());
    return undefined;
}
function buildHeaders() {
    const headers = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'kitbash-mcp',
    };
    const { token } = resolveToken();
    if (token)
        headers.Authorization = `Bearer ${token}`;
    return headers;
}
/**
 * GET a GitHub REST path (e.g. "/repos/owner/name").
 *
 * Never throws. Every failure mode is expressed as an `ok: false` outcome.
 */
export async function ghFetch(path, opts) {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = path.startsWith('http') ? path : `${API_ROOT}${path.startsWith('/') ? '' : '/'}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: buildHeaders(),
            signal: controller.signal,
            redirect: 'follow',
        });
    }
    catch {
        // AbortError (our timeout), DNS failure, socket reset, TLS failure, offline.
        // All indistinguishable from the caller's point of view, and all mean
        // "we learned nothing about this repo".
        return { ok: false, kind: 'network', status: 0 };
    }
    finally {
        clearTimeout(timer);
    }
    const status = res.status;
    const remaining = readRemaining(res.headers);
    if (remaining !== null)
        remainingSeen = remaining;
    if (res.ok) {
        try {
            const data = (await res.json());
            return { ok: true, data, remaining };
        }
        catch {
            // 200 with an unparseable body. Treat as transport failure, not as data.
            return { ok: false, kind: 'network', status };
        }
    }
    // Drain the error body so the socket can be reused. We never surface it.
    try {
        await res.text();
    }
    catch {
        /* ignore */
    }
    if (status === 404) {
        // The load-bearing case: a repo the host model invented.
        // Also what a private repo looks like without access.
        return { ok: false, kind: 'not_found', status };
    }
    if (status === 401) {
        // Tell: a 401 carries no x-ratelimit-* headers at all. Bad credentials.
        return { ok: false, kind: 'auth', status };
    }
    if (status === 403 || status === 429) {
        const retryAfterMs = readRetryAfterMs(res.headers);
        // Secondary rate limiter: signalled by retry-after.
        if (retryAfterMs !== undefined) {
            return { ok: false, kind: 'rate_limited', status, retryAfterMs };
        }
        // Primary rate limit: 403 with the budget at zero. Do NOT retry.
        if (remaining === 0) {
            return { ok: false, kind: 'rate_limited', status };
        }
        // 429 always means slow down even without a retry-after header.
        if (status === 429) {
            return { ok: false, kind: 'rate_limited', status };
        }
        // 403 with budget left and no retry-after is a genuine denial
        // (SAML/SSO, blocked resource, token scope). Retrying changes nothing.
        return { ok: false, kind: 'other', status };
    }
    return { ok: false, kind: 'other', status };
}
//# sourceMappingURL=client.js.map