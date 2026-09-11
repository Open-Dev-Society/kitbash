/**
 * Server assembly. Builds the McpServer, registers both tools, and connects it to
 * stdio (local install) or HTTP (hosted connector). Deliberately contains no business
 * logic — everything interesting lives in rubric.ts (the prompt) and the verify
 * pipeline (the fact check).
 *
 * NEVER writes to stdout except through the transport itself.
 */

import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

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

/**
 * Hosted mode — what a remote MCP connector (claude.ai, ChatGPT, …) talks to.
 *
 * Stateless: a fresh McpServer + transport per POST. Both tools are pure request →
 * response, so there is no session worth keeping, and nothing from one caller's
 * request can reach the next. GET/DELETE only mean something with sessions (SSE
 * streams, teardown), so they get 405, which the spec allows.
 */
export async function startHttpServer(port: number): Promise<void> {
  const http = createHttpServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end('kitbash MCP server — connect to /mcp\n');
      return;
    }
    if (path !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST' }).end();
      return;
    }

    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error(
        `[kitbash] http request failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, resolve);
  });
  console.error(`[kitbash] mcp server v${readVersion()} listening on :${port}/mcp — tools: kitbash, kitbash_verify`);
}
