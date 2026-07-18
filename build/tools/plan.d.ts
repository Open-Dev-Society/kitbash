/**
 * Tool 1 of 2: `kitbash`.
 *
 * Hands the calling agent a rubric and NOTHING ELSE. This is deliberate and it is
 * the whole architecture: there is no model in this server, so judgment has to happen
 * in the host agent. The rubric is how we aim it.
 *
 * The failure mode this file is written against: if the response contains anything
 * that reads like a finished answer, the agent renders it and never calls
 * kitbash_verify — which means unverified, possibly hallucinated repos go straight
 * to the user. That is precisely the thing this product exists to prevent. So the
 * response is the rubric string, verbatim, with no preamble and no summary.
 *
 * NEVER writes to stdout.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function registerPlanTool(server: McpServer): void;
