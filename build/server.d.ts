/**
 * Server assembly. Builds the McpServer, registers both tools, and connects it to
 * stdio. Deliberately contains no business logic — everything interesting lives in
 * rubric.ts (the prompt) and the verify pipeline (the fact check).
 *
 * NEVER writes to stdout except through the transport itself.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function createServer(): McpServer;
export declare function startServer(): Promise<McpServer>;
