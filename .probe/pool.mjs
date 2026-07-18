import { fetchRepoFacts } from '../build/github/repos.js';
import { assess } from '../build/score.js';
const pool = [
  // candidate archived / dead repos
  'request/request','facebookarchive/draft-js','google/tamperchrome','yahoo/serialize-javascript',
  'jsdom/whatwg-url','substack/node-browserify','facebookarchive/nuclide','Netflix/pollyjs',
  // healthy generic high-star
  'meilisearch/meilisearch','typesense/typesense','elastic/elasticsearch','tesseract-ocr/tesseract',
  // small exact-fit candidates
  'nalgeon/sqlean','asg017/sqlite-vec','simonw/sqlite-utils','wangfenjin/simple',
  'ocrmypdf/OCRmyPDF','naptha/tesseract.js','pymupdf/PyMuPDF','jbarlow83/OCRmyPDF',
  'paradedb/paradedb','quickwit-oss/tantivy','mozilla/pdf.js','vercel/next.js','zeit/next.js',
].map(s => ({ owner: s.split('/')[0], name: s.split('/')[1] }));

const facts = await fetchRepoFacts(pool);
const rows = facts.map(f => {
  const a = assess(f, 'KITBASH', 'MIT');
  return { req: f.req, ok: f.exists, status: f.status, full: f.full_name,
    stars: f.stars, days: a.days_since_push, arch: f.archived, lic: f.license,
    fork: f.is_fork, health: a.health, score: a.health_score, flags: a.flags.join('|') };
});
for (const r of rows) {
  if (!r.ok) { console.error(`404/ERR ${r.req} status=${r.status}`); continue; }
  console.error(
    `${String(r.stars).padStart(7)}★ ${String(r.days).padStart(5)}d score=${String(r.score).padStart(3)} ` +
    `arch=${r.arch?'Y':'n'} fork=${r.fork?'Y':'n'} lic=${String(r.lic).padEnd(12)} ${r.req}` +
    (r.full && r.full.toLowerCase()!==r.req.toLowerCase() ? ` -> ${r.full}` : '') +
    (r.flags ? `  [${r.flags}]` : ''));
}
