/**
 * The rubric handed back by the `kitbash` tool.
 *
 * There is no model in this server. The host agent already has better repo recall
 * than anything we could afford to run here, so the server's job is to aim that
 * recall and then, in `kitbash_verify`, stop it from lying.
 *
 * This file is the aiming. It is a prompt, and it is the actual product.
 */
export interface RubricInput {
    idea: string;
    stack?: string;
    target_license?: string;
}
/**
 * Build the instruction block returned to the calling agent.
 * Pure — same input, same string.
 */
export declare function buildRubric(i: RubricInput): string;
