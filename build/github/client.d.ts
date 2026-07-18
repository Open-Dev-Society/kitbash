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
export type GhErrorKind = 'not_found' | 'rate_limited' | 'auth' | 'network' | 'other';
export type GhOutcome<T> = {
    ok: true;
    data: T;
    remaining: number | null;
} | {
    ok: false;
    kind: GhErrorKind;
    status: number;
    retryAfterMs?: number;
};
export declare function lastRemaining(): number | null;
export declare function isAuthenticated(): boolean;
/**
 * GET a GitHub REST path (e.g. "/repos/owner/name").
 *
 * Never throws. Every failure mode is expressed as an `ok: false` outcome.
 */
export declare function ghFetch<T>(path: string, opts?: {
    timeoutMs?: number;
}): Promise<GhOutcome<T>>;
