import net from 'node:net';
import { connect, handshake, verify } from './mcp.mjs';

// A black-hole proxy: accepts the TCP connection, reads the CONNECT, never answers.
// This is the venue-wifi captive-portal shape — worse than refused, because it hangs.
const blackhole = net.createServer((sock) => { sock.on('data', () => {}); sock.on('error', () => {}); });
await new Promise((r) => blackhole.listen(0, '127.0.0.1', r));
const bhPort = blackhole.address().port;

const SNAPSHOT_REPOS = [
  ['tesseract-ocr','tesseract'],['naptha','tesseract.js'],['pymupdf','PyMuPDF'],
  ['apache','pdfbox'],['mozilla','pdf.js'],['nalgeon','sqlean'],
  ['nextapps-de','flexsearch'],['paulmillr','chokidar'],['sqlite','sqlite'],
];

async function run(label, env) {
  const c = connect(env); await handshake(c);
  const t0 = Date.now();
  const res = await verify(c, {
    idea: 'watch a folder, OCR new PDFs, make them searchable',
    target_license: 'MIT',
    components: [
      { id: 'ocr', name: 'OCR engine', role: 'Reads text off scanned pages.', verdict: 'BORROW',
        rationale: 'Trained data.', candidates: SNAPSHOT_REPOS.slice(0,3).map(([owner,name])=>({owner,name})) },
      { id: 'pdf', name: 'PDF extraction', role: 'Pulls the text layer.', verdict: 'BORROW',
        rationale: 'Broken xref tables.', candidates: SNAPSHOT_REPOS.slice(3,6).map(([owner,name])=>({owner,name})) },
      { id: 'idx', name: 'Search index', role: 'Makes text queryable.', verdict: 'KITBASH',
        rationale: 'Embedded search.', candidates: SNAPSHOT_REPOS.slice(6,9).map(([owner,name])=>({owner,name})) },
    ],
  });
  const ms = Date.now() - t0;
  console.error(`\n########## ${label} ##########`);
  console.error(`WALL CLOCK (tools/call round trip): ${ms}ms   ${ms<=6000?'(bounded)':'(TOO SLOW)'}`);
  console.error(`github: ${JSON.stringify(res.parsed.github)}`);
  console.error(`stats:  ${JSON.stringify(res.parsed.stats)}`);
  console.error(`next_action: ${res.parsed.next_action}`);
  const all = res.parsed.components.flatMap(x=>[x.picked,...x.alternates]).filter(Boolean);
  console.error(`survivors: ${all.length}, sources: ${JSON.stringify([...new Set(all.map(a=>a.source))])}`);
  console.error(`hallucinated (must be 0 — network failure is NOT a hallucination): ${res.parsed.stats.hallucinated}`);
  console.error(`server alive after call: ${res.raw.result ? 'yes' : 'no'}`);
  console.error(`stderr tail: ${c.stderr().trim().split('\n').slice(-2).join(' | ')}`);
  console.error('--- CACHE LABELLING IN MARKDOWN ---');
  for (const line of res.markdown.split('\n')) {
    if (/cached|CACHED|not live|Not live|snapshot/i.test(line)) console.error('  >> ' + line.trim());
  }
  c.close();
  return { ms, res };
}

await run('11a. OFFLINE — connection REFUSED (fast fail)', { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:1' });
const b = await run(`11b. OFFLINE — connection HANGS (black-hole proxy :${bhPort}) — tests the 3s timeout bound`, { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${bhPort}` });

console.error('\n########## 11c. OFFLINE with repos NOT in snapshot ##########');
const c3 = connect({ NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: 'http://127.0.0.1:1' }); await handshake(c3);
const r3 = await verify(c3, { idea: 'offline, nothing cached', target_license: 'MIT',
  components: [{ id: 'x', name: 'Uncached', role: 'r', verdict: 'BORROW', rationale: 'r',
    candidates: [{owner:'quickwit-oss',name:'tantivy'},{owner:'typesense',name:'typesense'}] }] });
console.error('github: ' + JSON.stringify(r3.parsed.github));
console.error('stats: ' + JSON.stringify(r3.parsed.stats) + '   <-- hallucinated MUST be 0');
console.error('needs_recall (MUST be false — a rate limit is not a reason to recall): ' + r3.parsed.components[0].needs_recall);
console.error('next_action: ' + r3.parsed.next_action);
console.error('--- honest outage banner? ---');
for (const line of r3.markdown.split('\n')) if (/could not be reached|not confirmed/i.test(line)) console.error('  >> ' + line.trim());
c3.close();

console.error('\n########## FULL MARKDOWN (11b, the hang case) ##########');
console.error(b.res.markdown);
blackhole.close();
