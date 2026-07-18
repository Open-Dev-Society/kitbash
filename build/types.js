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
export {};
//# sourceMappingURL=types.js.map