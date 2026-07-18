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

import { writeSnapshot, snapshotPath } from '../cache.js';
import type { RepoFacts } from '../types.js';

type BatchFetch = (refs: { owner: string; name: string }[]) => Promise<RepoFacts[]>;
type SingleFetch = (owner: string, name: string) => Promise<RepoFacts>;

/**
 * src/github/repos.ts is owned by a different module and may not exist when this file
 * is typechecked, so the import is dynamic and untyped. We then probe for the export
 * at runtime rather than hard-coding one name: this script is the insurance policy,
 * and the insurance policy must not be the thing that breaks on a naming mismatch.
 */
async function loadFetcher(): Promise<{ kind: 'batch'; fn: BatchFetch } | { kind: 'single'; fn: SingleFetch }> {
  let mod: Record<string, unknown>;
  try {
    // @ts-ignore -- module is written by another workstream; resolved at runtime
    mod = (await import('../github/repos.js')) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      `Could not load ../github/repos.js. Build first (npm run build) and confirm the module exists.\n  ${String(err)}`,
    );
  }

  const batchNames = ['fetchRepos', 'fetchRepoFacts', 'getRepos', 'fetchAll', 'fetchMany', 'verifyRepos'];
  for (const n of batchNames) {
    if (typeof mod[n] === 'function') return { kind: 'batch', fn: mod[n] as BatchFetch };
  }

  const singleNames = ['fetchRepo', 'getRepo', 'fetchOne', 'repoFacts'];
  for (const n of singleNames) {
    if (typeof mod[n] === 'function') return { kind: 'single', fn: mod[n] as SingleFetch };
  }

  throw new Error(
    `../github/repos.js exports none of the expected fetchers.\n` +
      `  found: ${Object.keys(mod).join(', ') || '(nothing)'}\n` +
      `  wanted a batch fn ${batchNames.join('|')} or a single fn ${singleNames.join('|')}`,
  );
}

function parseRefs(argv: string[]): { owner: string; name: string }[] {
  const refs: { owner: string; name: string }[] = [];
  for (const arg of argv) {
    const cleaned = arg
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length !== 2) {
      console.error(`[snapshot] skipping "${arg}" — expected owner/name`);
      continue;
    }
    refs.push({ owner: parts[0]!, name: parts[1]! });
  }
  return refs;
}

async function main(): Promise<void> {
  const refs = parseRefs(process.argv.slice(2));

  if (refs.length === 0) {
    console.error('usage: node build/scripts/snapshot.js <owner/name> [owner/name ...]');
    console.error('example: node build/scripts/snapshot.js tesseract-ocr/tesseract naptha/tesseract.js');
    process.exitCode = 1;
    return;
  }

  console.error(`[snapshot] fetching ${refs.length} repo(s) live...`);

  const fetcher = await loadFetcher();
  let facts: RepoFacts[];

  if (fetcher.kind === 'batch') {
    facts = await fetcher.fn(refs);
  } else {
    // Per-repo failure isolation: one dead repo must not lose the whole pre-warm.
    const settled = await Promise.allSettled(refs.map((r) => (fetcher.fn as SingleFetch)(r.owner, r.name)));
    facts = [];
    settled.forEach((res, i) => {
      if (res.status === 'fulfilled') facts.push(res.value);
      else console.error(`[snapshot] ${refs[i]!.owner}/${refs[i]!.name} failed: ${String(res.reason)}`);
    });
  }

  if (!Array.isArray(facts) || facts.length === 0) {
    console.error('[snapshot] nothing fetched; leaving existing snapshot untouched');
    process.exitCode = 1;
    return;
  }

  for (const f of facts) {
    const mark = f.exists ? 'ok  ' : 'MISS';
    console.error(`[snapshot]   ${mark} ${f.req} (status ${f.status})`);
  }

  writeSnapshot(facts);
  console.error(`[snapshot] done -> ${snapshotPath()}`);
}

main().catch((err) => {
  console.error(`[snapshot] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exitCode = 1;
});
