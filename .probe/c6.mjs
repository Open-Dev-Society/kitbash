import { connect, handshake, verify } from './mcp.mjs';
const c = connect(); await handshake(c);

const { parsed, markdown } = await verify(c, {
  idea: 'watch a folder, OCR new PDFs, make them searchable',
  target_license: 'MIT',
  components: [
    // CASE A: low-star exact fit FIRST, high-star healthy generic SECOND.
    // Adversarial by construction: pdf.js out-scores whatwg-url on health,
    // so a naive health sort would flip this pair.
    { id: 'case-a', name: 'Case A low-star first', role: 'Ranker: stars must not promote.',
      verdict: 'BORROW', rationale: 'Rationale written about the 421-star exact fit.',
      candidates: [ { owner: 'jsdom', name: 'whatwg-url' }, { owner: 'mozilla', name: 'pdf.js' } ] },
    // CASE A2: same shape, larger star gap (2.1k vs 77.5k)
    { id: 'case-a2', name: 'Case A2 wide star gap', role: 'Ranker: 2.1k must beat 77.5k.',
      verdict: 'BORROW', rationale: 'Rationale written about sqlite-utils.',
      candidates: [ { owner: 'simonw', name: 'sqlite-utils' }, { owner: 'elastic', name: 'elasticsearch' } ] },
    // CASE B: dead repo (archived, 3.4y stale) ranked FIRST, KITBASH so it survives disqualify.
    { id: 'case-b', name: 'Case B dead repo first', role: 'Ranker: dead #1 must be demoted.',
      verdict: 'KITBASH', rationale: 'Rationale written about the ARCHIVED draft-js.',
      candidates: [ { owner: 'facebookarchive', name: 'draft-js' }, { owner: 'quickwit-oss', name: 'tantivy' } ] },
    // CASE B2: same dead repo but BORROW — expect DROPPED, not demoted.
    { id: 'case-b2', name: 'Case B2 dead repo under BORROW', role: 'Archived+BORROW should be dropped.',
      verdict: 'BORROW', rationale: 'Rationale about archived repo under BORROW.',
      candidates: [ { owner: 'facebookarchive', name: 'draft-js' }, { owner: 'quickwit-oss', name: 'tantivy' } ] },
  ],
});

for (const comp of parsed.components) {
  const surv = [comp.picked, ...comp.alternates].filter(Boolean);
  console.error(`\n===== ${comp.id} (${comp.verdict}) =====`);
  console.error(`  KITBASH ORDER : ${surv.map(a=>`${a.full_name}(${a.stars}*, score ${a.health_score})`).join('  >  ')}`);
  const naive = [...surv].sort((x,y)=>y.health_score-x.health_score);
  console.error(`  NAIVE  SORT   : ${naive.map(a=>`${a.full_name}(score ${a.health_score})`).join('  >  ')}`);
  const flipped = naive.map(a=>a.req).join()!==surv.map(a=>a.req).join();
  console.error(`  ADVERSARIAL?  : ${flipped ? 'YES — naive health sort WOULD have reordered this' : 'no — naive sort agrees'}`);
  console.error(`  picked        : ${comp.picked?.full_name ?? '(none)'}`);
  console.error(`  rejected      : ${JSON.stringify(comp.rejected)}`);
}

console.error('\n===== DEMOTION NOTES RENDERED IN MARKDOWN =====');
for (const line of markdown.split('\n')) if (line.includes('Promoted over the first-ranked')) console.error('  >> ' + line);
console.error('\n===== FULL MARKDOWN =====');
console.error(markdown);
c.close();
