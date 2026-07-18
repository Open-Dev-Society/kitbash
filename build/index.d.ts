#!/usr/bin/env node
/**
 * Entrypoint.
 *
 * stdout IS the JSON-RPC channel for a stdio MCP server. A single console.log anywhere
 * in this process — ours, a dependency's, a stray debug line someone adds at 3am —
 * injects garbage into the frame stream, and the client drops the connection with an
 * error that points nowhere near the cause. So before any of our code is even loaded,
 * console.log/info/debug are rerouted to stderr.
 *
 * ESM imports are hoisted and evaluated before top-level statements, so our modules are
 * pulled in with a dynamic import BELOW the guard rather than a static one above it.
 * That ordering is the entire reason this file is shaped the way it is — do not convert
 * the import at the bottom into a static one.
 */
export {};
