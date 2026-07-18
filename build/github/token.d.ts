/**
 * Token resolution for the GitHub REST client.
 *
 * Sync, memoized, and structurally incapable of throwing. Every caller in the
 * hot path (ghFetch) hits this once per process; a subprocess spawn is ~100ms
 * and would otherwise dominate a 10-repo batch.
 *
 * NEVER log the resolved token.
 */
export interface TokenResolution {
    token: string | null;
    source: 'env:GITHUB_TOKEN' | 'env:GH_TOKEN' | 'gh-cli' | 'none';
}
/**
 * Resolve a GitHub token. Memoized at module level; never throws.
 *
 * Ladder: GITHUB_TOKEN -> GH_TOKEN -> `gh auth token` -> none.
 */
export declare function resolveToken(): TokenResolution;
/** Test-only escape hatch. Clears the module-level memo and its timestamp. */
export declare function __resetTokenMemo(): void;
