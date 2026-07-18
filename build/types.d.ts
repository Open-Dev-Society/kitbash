/**
 * The frozen contract. Every other module depends on this file and nothing else.
 *
 * Kitbash splits into two halves:
 *   1. `kitbash`        — hands the agent a rubric. Judgment happens in the host model.
 *   2. `kitbash_verify` — takes the agent's slate and fact-checks it against GitHub.
 *
 * The server deliberately contains no model. Repo recall is the product, and the
 * host agent has better recall than anything we could afford to run in here.
 * The server's job is to stop it lying.
 */
/** What to do about a component. The core output of the whole tool. */
export type Verdict = 
/** A real, maintained dependency exists. Rewriting it is the mistake. */
'BORROW'
/** Good reference, imperfect fit. Read it, adapt the approach, don't take the dep. */
 | 'KITBASH'
/** Generic enough that the agent should just write it. No repo needed. */
 | 'WRITE';
export interface RepoRef {
    owner: string;
    name: string;
}
/** One component of the decomposed product, as asserted by the agent. */
export interface ComponentCandidate {
    /** Stable slug, e.g. "ocr-engine". */
    id: string;
    name: string;
    /** One sentence: this component's job in THIS product, not in general. */
    role: string;
    verdict: Verdict;
    /** Why this verdict, specific to this component. Not a README summary. */
    rationale: string;
    /** Empty for WRITE. 1-3 ranked for BORROW/KITBASH. */
    candidates: RepoRef[];
}
/** Input to `kitbash_verify` — the agent's completed slate. */
export interface VerifyInput {
    idea: string;
    stack?: string;
    target_license?: string;
    components: ComponentCandidate[];
}
/** Raw GitHub facts. No judgment applied at this layer. */
export interface RepoFacts {
    /** "owner/name" AS REQUESTED. Differs from full_name when the repo was renamed. */
    req: string;
    exists: boolean;
    status: number;
    full_name?: string;
    html_url?: string;
    description?: string | null;
    stars?: number;
    /** Real commit activity. Never use updated_at — it bumps on star changes. */
    pushed_at?: string;
    open_issues?: number;
    /** SPDX id. Null when unlicensed; "NOASSERTION" when GitHub can't classify it. */
    license?: string | null;
    archived?: boolean;
    /** Disabled by GitHub (DMCA/abuse). Distinct from archived. */
    disabled?: boolean;
    is_fork?: boolean;
    private?: boolean;
    default_branch?: string;
    language?: string | null;
    source: 'live' | 'cache';
    /** ISO timestamp. */
    fetched_at: string;
}
export type Health = 'healthy' | 'aging' | 'stale' | 'archived' | 'unknown';
export type RejectReason = 'NOT_FOUND' | 'PRIVATE' | 'ARCHIVED' | 'ERROR';
export interface RejectedRepo {
    req: string;
    reason: RejectReason;
    status: number;
}
export type RepoFlag = 'ARCHIVED' | 'NO_LICENSE' | 'FORK' | 'STALE_2Y' | 'RENAMED' | 'LICENSE_MISMATCH' | 'LOW_SIGNAL';
export interface RepoAssessment extends RepoFacts {
    health: Health;
    /** 0-100. */
    health_score: number;
    days_since_push: number | null;
    flags: RepoFlag[];
    /** 'warn' when the verdict and the repo's condition disagree. */
    verdict_fit: 'ok' | 'warn';
    fit_note?: string;
}
export interface ResolvedComponent {
    id: string;
    name: string;
    role: string;
    verdict: Verdict;
    rationale: string;
    picked?: RepoAssessment;
    alternates: RepoAssessment[];
    rejected: RejectedRepo[];
    /** True when every candidate died. The agent MUST propose replacements. */
    needs_recall: boolean;
}
export interface VerifyStats {
    proposed: number;
    verified: number;
    hallucinated: number;
    /** 0-1. The number that makes the demo. */
    hallucination_rate: number;
}
export interface GithubStatus {
    authenticated: boolean;
    remaining: number | null;
    source: 'live' | 'cache' | 'mixed';
}
export interface VerifyResult {
    idea: string;
    components: ResolvedComponent[];
    stats: VerifyStats;
    github: GithubStatus;
    next_action: 'DONE' | 'RECALL_REPLACEMENTS';
    /** Machine-directed follow-up for the agent. */
    instructions: string;
    /** The rendered demo artifact. */
    markdown: string;
}
