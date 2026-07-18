/**
 * Tool 2 of 2: `kitbash_verify`.
 *
 * The agent hands us a slate it produced from memory. This tool's job is to find out
 * which of it is real. Every candidate repo is fetched from the live GitHub API,
 * assessed, ranked, and either kept or dropped — and the repos that turn out not to
 * exist are counted and named, because that count is the product's entire thesis.
 *
 * Two rules that shape everything below:
 *   1. NEVER FABRICATE. If the network dies we fall back to a disk snapshot, and every
 *      record sourced that way is labelled `cache` all the way through to the markdown.
 *      A stale-but-honest report beats a fresh-looking lie.
 *   2. NEVER WRITE TO STDOUT. stdout is the JSON-RPC channel.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function registerVerifyTool(server: McpServer): void;
