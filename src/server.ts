/**
 * Server assembly. Builds the McpServer, registers both tools, and connects it to
 * stdio. Deliberately contains no business logic — everything interesting lives in
 * rubric.ts (the prompt) and the verify pipeline (the fact check).
 *
 * NEVER writes to stdout except through the transport itself.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerPlanTool } from './tools/plan.js';
import { registerVerifyTool } from './tools/verify.js';

const SERVER_NAME = 'kitbash';

/**
 * Resolved against this module, not process.cwd() — the MCP client spawns us from its
 * own working directory, which is never the project root. Same reasoning as cache.ts.
 */
function readVersion(): string {
  try {
    const path = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version) return pkg.version;
  } catch (err) {
    console.error(`[kitbash] could not read version from package.json: ${String(err)}`);
  }
  return '0.0.0';
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: readVersion(),
  });

  registerPlanTool(server);
  registerVerifyTool(server);

  return server;
}

export async function startServer(): Promise<McpServer> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Banner on stderr. Anything on stdout here would be framed as a JSON-RPC message
  // and would corrupt the session before the client finished initializing.
  console.error(`[kitbash] mcp server v${readVersion()} ready on stdio — tools: kitbash, kitbash_verify`);

  return server;
}
