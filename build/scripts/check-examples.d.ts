#!/usr/bin/env node
/**
 * Guards the one failure that would genuinely embarrass this product: shipping a repo
 * that does not exist inside our OWN documentation.
 *
 * The few-shot example in src/rubric.ts is the single most literally-imitated text in
 * the codebase. A model reads it and copies its shape — so a 404 in there does not sit
 * quietly in a doc comment, it actively teaches the exact hallucination this tool
 * exists to catch. That happened once already (`pdf-association/pdfium`, HTTP 404,
 * shipped as the lead candidate in the worked example). This makes it impossible to
 * happen twice without CI noticing.
 *
 *   npm run build && npm run check:examples
 *
 * Exits 0 when every referenced repo returns 200, non-zero on any 404 or on any repo
 * whose status could not be established. Reads the rubric SOURCE (src/rubric.ts) rather
 * than importing it, because the refs live in a JSON literal inside a template string —
 * the source is the artifact a model reads, so the source is what we check.
 *
 * stderr only. This shares a codebase with a stdio MCP server where stdout is the
 * JSON-RPC channel, and that habit does not get exceptions.
 */
export {};
