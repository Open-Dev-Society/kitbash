#!/usr/bin/env node
/**
 * Pre-warm the offline snapshot. Run this BEFORE the demo, on wifi you trust.
 *
 *   npm run build && node build/scripts/snapshot.js tesseract-ocr/tesseract naptha/tesseract.js
 *
 * Fetches each repo live and writes fixtures/snapshot.json. If the venue network dies
 * mid-demo, the verify path falls back to these records (relabelled source:'cache'
 * with their original fetched_at, so the report stays honest about staleness).
 *
 * stderr only — this script shares a codebase with a stdio MCP server where stdout is
 * the JSON-RPC channel, and that habit should not have exceptions.
 */
export {};
