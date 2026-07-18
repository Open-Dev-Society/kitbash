/**
 * Token resolution for the GitHub REST client.
 *
 * Sync, memoized, and structurally incapable of throwing. Every caller in the
 * hot path (ghFetch) hits this once per process; a subprocess spawn is ~100ms
 * and would otherwise dominate a 10-repo batch.
 *
 * NEVER log the resolved token.
 */
import { execFileSync } from 'node:child_process';
let memo = null;
let memoAt = 0;
/**
 * How long a FAILED resolution sticks. Success is memoized for the life of the
 * process — a token that resolved once will not stop resolving — but caching the
 * failure forever made the obvious recovery impossible: if `gh` was not authenticated
 * at boot, the whole session ran on the unauthenticated 60/hr shared-IP budget, and
 * running `gh auth login` in another terminal or exporting GITHUB_TOKEN did nothing
 * until the MCP server restarted, which in most clients means restarting the client.
 * 30s is long enough that a batch of repo fetches still costs at most one `gh` spawn.
 */
const NEGATIVE_TTL_MS = 30_000;
function fromEnv(name) {
    const raw = process.env[name];
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function fromGhCli() {
    try {
        // No shell:true — it emits DEP0190 on Node 24.
        // execFileSync throws on ENOENT (gh not installed) and on non-zero exit
        // (gh installed but not authenticated). Both land in the catch.
        const out = execFileSync('gh', ['auth', 'token'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 5000,
            windowsHide: true,
        });
        // .trim() is MANDATORY. An untrimmed token carries a trailing newline and
        // throws inside undici when set as a header value, before the request is
        // ever sent.
        const token = out.trim();
        return token.length > 0 ? token : null;
    }
    catch (err) {
        // Deliberately NOT silent. On Windows, `gh` installed via npm/scoop/chocolatey is a
        // .cmd shim, and Node refuses to spawn .cmd/.bat without shell:true (the
        // CVE-2024-27980 fix) — it throws EINVAL. Swallowing that dropped the session to
        // 60 req/hr with no way to tell from the outside. stderr only: stdout is the
        // JSON-RPC channel.
        const code = err?.code ?? String(err);
        console.error(`[token] \`gh auth token\` unavailable (${code}) — running unauthenticated at 60 req/hr`);
        return null;
    }
}
/**
 * Resolve a GitHub token. Memoized at module level; never throws.
 *
 * Ladder: GITHUB_TOKEN -> GH_TOKEN -> `gh auth token` -> none.
 */
export function resolveToken() {
    // Success is permanent; failure expires, so a mid-session `gh auth login` or a newly
    // exported GITHUB_TOKEN is picked up without a restart.
    if (memo !== null && (memo.token !== null || Date.now() - memoAt < NEGATIVE_TTL_MS)) {
        return memo;
    }
    memoAt = Date.now();
    try {
        const githubToken = fromEnv('GITHUB_TOKEN');
        if (githubToken) {
            memo = { token: githubToken, source: 'env:GITHUB_TOKEN' };
            return memo;
        }
        const ghToken = fromEnv('GH_TOKEN');
        if (ghToken) {
            memo = { token: ghToken, source: 'env:GH_TOKEN' };
            return memo;
        }
        const cliToken = fromGhCli();
        if (cliToken) {
            memo = { token: cliToken, source: 'gh-cli' };
            return memo;
        }
    }
    catch {
        // Belt and braces: nothing above should escape, but resolveToken is
        // documented as never throwing and callers rely on that.
    }
    memo = { token: null, source: 'none' };
    return memo;
}
/** Test-only escape hatch. Clears the module-level memo and its timestamp. */
export function __resetTokenMemo() {
    memo = null;
    memoAt = 0;
}
//# sourceMappingURL=token.js.map