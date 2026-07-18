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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchRepoFacts } from '../github/repos.js';
/** build/scripts/check-examples.js -> repo root. */
function rubricSourcePath() {
    const here = dirname(fileURLToPath(import.meta.url));
    return join(here, '..', '..', 'src', 'rubric.ts');
}
/**
 * Pull every { "owner": ..., "name": ... } pair out of the rubric source.
 *
 * Deliberately matches the JSON candidate shape rather than a loose `owner/name`
 * regex: the rubric is full of prose containing slashes ("BORROW/KITBASH",
 * "input/output") and a loose pattern would spend the run chasing false positives and
 * then get muted. Precise beats thorough for a check that has to stay trusted.
 */
function extractRefs(source) {
    const re = /"owner"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]+)"/g;
    const seen = new Set();
    const refs = [];
    for (const m of source.matchAll(re)) {
        const owner = m[1].trim();
        const name = m[2].trim();
        // The schema documentation uses `string` as a placeholder value; skip it.
        if (owner === 'string' || name === 'string')
            continue;
        const key = `${owner.toLowerCase()}/${name.toLowerCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        refs.push({ owner, name });
    }
    return refs;
}
async function main() {
    const path = rubricSourcePath();
    let source;
    try {
        source = readFileSync(path, 'utf8');
    }
    catch (err) {
        console.error(`[check-examples] cannot read ${path}: ${String(err)}`);
        process.exitCode = 1;
        return;
    }
    const refs = extractRefs(source);
    if (refs.length === 0) {
        // Not "nothing to do" — the extractor is supposed to find the worked example. If
        // it finds nothing, the example moved or the pattern rotted, and a check that
        // silently passes on zero inputs is worse than no check at all.
        console.error('[check-examples] FAIL: no repo references found in the rubric.');
        console.error('  The worked example should contain { "owner": ..., "name": ... } pairs.');
        console.error(`  Looked in: ${path}`);
        process.exitCode = 1;
        return;
    }
    console.error(`[check-examples] verifying ${refs.length} repo(s) from src/rubric.ts ...`);
    const facts = await fetchRepoFacts(refs);
    const missing = [];
    const unknown = [];
    for (const f of facts) {
        if (f.exists) {
            const stars = f.stars ?? 0;
            const archived = f.archived ? '  ARCHIVED' : '';
            console.error(`[check-examples]   ok    ${f.req}  (${stars} stars)${archived}`);
            continue;
        }
        if (f.status === 404) {
            console.error(`[check-examples]   404   ${f.req}  <-- DOES NOT EXIST`);
            missing.push(f.req);
        }
        else {
            // status 0 = network/timeout. We learned nothing, so we cannot pass it.
            console.error(`[check-examples]   ????  ${f.req}  (status ${f.status}, could not verify)`);
            unknown.push(f.req);
        }
    }
    if (missing.length > 0) {
        console.error('');
        console.error(`[check-examples] FAIL: ${missing.length} repo(s) in the rubric do not exist: ${missing.join(', ')}`);
        console.error('  The few-shot example is the text a model imitates most literally. A 404 here');
        console.error('  teaches the exact failure this product exists to catch. Replace it.');
        process.exitCode = 1;
        return;
    }
    if (unknown.length > 0) {
        console.error('');
        console.error(`[check-examples] FAIL: could not verify ${unknown.length} repo(s): ${unknown.join(', ')}`);
        console.error('  This is a network result, not a verdict. Re-run with connectivity.');
        process.exitCode = 1;
        return;
    }
    console.error(`[check-examples] OK — all ${refs.length} repo(s) exist.`);
}
main().catch((err) => {
    console.error(`[check-examples] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    process.exitCode = 1;
});
//# sourceMappingURL=check-examples.js.map