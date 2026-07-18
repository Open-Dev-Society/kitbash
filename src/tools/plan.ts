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
import { z } from 'zod';

import { buildRubric } from '../rubric.js';

/**
 * The description is load-bearing. It is the only thing that makes the agent chain
 * to kitbash_verify, and an agent that stops after step 1 produces exactly the
 * hallucinated-repo output this tool was built to catch. Say "step 1 of 2" plainly,
 * name the follow-up tool, and state the consequence of skipping it.
 */
const DESCRIPTION = [
  'STEP 1 OF 2. Start here when the user describes something they want to build and you',
  'need to know which parts already exist as open-source repos, which are worth reading',
  'and adapting, and which they should just write themselves.',
  '',
  'This tool returns a RUBRIC — a set of instructions for you to follow. It does not',
  'return an answer, and it does not look anything up. You do the decomposition and the',
  'repo recall yourself, following the rubric exactly.',
  '',
  'MANDATORY: after you produce your slate of components and candidate repos, you MUST',
  'call `kitbash_verify` with it before showing ANYTHING to the user. Your recall of',
  'GitHub repo names is unreliable — a meaningful fraction of the repos you are about to',
  'name do not exist. `kitbash_verify` checks every one against the live GitHub API and',
  'produces the report the user actually sees.',
  '',
  'Do not summarize, paraphrase, or answer from this tool\'s output alone. It is an',
  'instruction set for you, not a deliverable for the user. Stopping here means shipping',
  'invented repos.',
].join('\n');

export function registerPlanTool(server: McpServer): void {
  server.registerTool(
    'kitbash',
    {
      title: 'Kitbash: plan a build (step 1 of 2)',
      description: DESCRIPTION,
      // RAW ZOD SHAPE — not z.object(), not JSON Schema.
      inputSchema: {
        idea: z
          .string()
          .describe('What the user wants to build, in their own words. One or two sentences.'),
        stack: z
          .string()
          .optional()
          .describe('Target stack if known, e.g. "TypeScript / Node" or "Python". Omit if unstated.'),
        target_license: z
          .string()
          .optional()
          .describe('SPDX id the user intends to ship under, e.g. "MIT". Omit if unstated.'),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ idea, stack, target_license }) => {
      const rubric = buildRubric({ idea, stack, target_license });

      // The rubric and only the rubric. Anything appended here is something the agent
      // could mistake for a conclusion.
      return {
        content: [{ type: 'text' as const, text: rubric }],
      };
    },
  );
}
