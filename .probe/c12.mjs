import { connect, handshake, verify } from './mcp.mjs';

const TEN = [
  ['tesseract-ocr','tesseract'],['naptha','tesseract.js'],['pymupdf','PyMuPDF'],
  ['apache','pdfbox'],['mozilla','pdf.js'],['nalgeon','sqlean'],
  ['nextapps-de','flexsearch'],['paulmillr','chokidar'],['sqlite','sqlite'],
  ['ocrmypdf','OCRmyPDF'],
];
const comps = [
  { id:'ocr', name:'OCR engine', role:'r', verdict:'BORROW', rationale:'r', candidates: TEN.slice(0,3).map(([o,n])=>({owner:o,name:n})) },
  { id:'pdf', name:'PDF extraction', role:'r', verdict:'BORROW', rationale:'r', candidates: TEN.slice(3,6).map(([o,n])=>({owner:o,name:n})) },
  { id:'idx', name:'Search index', role:'r', verdict:'KITBASH', rationale:'r', candidates: TEN.slice(6,9).map(([o,n])=>({owner:o,name:n})) },
  { id:'pipe', name:'Pipeline', role:'r', verdict:'BORROW', rationale:'r', candidates: TEN.slice(9,10).map(([o,n])=>({owner:o,name:n})) },
];

console.error('=== 10 REAL REPOS, COLD PROCESS EACH RUN (includes server boot + gh token spawn) ===');
const cold = [];
for (let i=0;i<3;i++) {
  const t0=Date.now(); const c=connect(); await handshake(c);
  const tCall=Date.now();
  const res = await verify(c, { idea:'latency probe', target_license:'MIT', components: comps });
  const call=Date.now()-tCall, total=Date.now()-t0;
  cold.push({call,total,verified:res.parsed.stats.verified,src:res.parsed.github.source});
  console.error(`  run ${i+1}: boot+handshake=${tCall-t0}ms  tools/call=${call}ms  TOTAL=${total}ms  verified=${res.parsed.stats.verified}/10 source=${res.parsed.github.source}`);
  c.close();
}

console.error('\n=== SAME WARM PROCESS, REPEATED tools/call (token already memoized) ===');
const c=connect(); await handshake(c);
const warm=[];
for (let i=0;i<5;i++) {
  const t0=Date.now();
  const res = await verify(c, { idea:'latency probe', target_license:'MIT', components: comps });
  const ms=Date.now()-t0; warm.push(ms);
  console.error(`  call ${i+1}: ${ms}ms  verified=${res.parsed.stats.verified}/10  remaining=${res.parsed.github.remaining}`);
}
c.close();

const stat = (a) => `min=${Math.min(...a)}ms max=${Math.max(...a)}ms mean=${Math.round(a.reduce((x,y)=>x+y,0)/a.length)}ms`;
console.error('\n=== SUMMARY (10 repos) ===');
console.error('cold total (boot->report): ' + stat(cold.map(x=>x.total)));
console.error('cold tools/call only:      ' + stat(cold.map(x=>x.call)));
console.error('warm tools/call:           ' + stat(warm));
