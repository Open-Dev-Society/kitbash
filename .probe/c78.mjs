import { connect, handshake, verify } from './mcp.mjs';
const c = connect(); await handshake(c);

// ---- CHECK 7: WRITE component behaviour ----
const r7 = await verify(c, {
  idea: 'watch a folder, OCR new PDFs, make them searchable',
  target_license: 'MIT',
  components: [
    { id: 'ocr-engine', name: 'OCR engine', role: 'Reads text off scanned pages.', verdict: 'BORROW',
      rationale: 'Decades of trained data.', candidates: [ { owner: 'tesseract-ocr', name: 'tesseract' }, { owner: 'fakelabs', name: 'ocr-9000' } ] },
    { id: 'inbox-watcher', name: 'Inbox watcher', role: 'Notices new PDFs landing in the watched directory.', verdict: 'WRITE',
      rationale: 'fs.watch plus a 200ms debounce and a seen-set is about forty lines. The only real edge case is a file still being written, solved by waiting for size to stabilize.', candidates: [] },
    { id: 'job-queue', name: 'Job queue', role: 'Runs OCR two files at a time and retries failures.', verdict: 'WRITE',
      rationale: 'An array with concurrency 2 and a retry counter, about thirty lines.', candidates: [] },
  ],
});
console.error('===== CHECK 7: WRITE =====');
console.error('stats: ' + JSON.stringify(r7.parsed.stats));
console.error('  -> denominator EXCLUDES WRITE? proposed=' + r7.parsed.stats.proposed + ' (expect 2: only the OCR component\'s 2 repos)');
console.error('  -> hallucination_rate=' + r7.parsed.stats.hallucination_rate + ' (expect 0.5 = 1 fake / 2 proposed, NOT 1/2 diluted by 2 WRITEs)');
for (const comp of r7.parsed.components.filter(x=>x.verdict==='WRITE')) {
  console.error(`  WRITE [${comp.id}]: needs_recall=${comp.needs_recall} picked=${comp.picked?'SET(BAD)':'none'} rejected=${comp.rejected.length}`);
}
console.error('next_action: ' + r7.parsed.next_action);
console.error('\n--- WRITE rendering (positive framing?) ---');
const w = r7.markdown.split('---').filter(s=>s.includes('WRITE  ·'));
for (const blk of w) console.error(blk.trim() + '\n');
console.error('header line: ' + r7.markdown.split('\n').find(l=>l.includes('The part that is actually yours')));
console.error('\n--- instructions (should have NO zero-WRITE nudge) ---');
console.error(r7.parsed.instructions);
console.error('CONTAINS NUDGE: ' + r7.parsed.instructions.includes('ZERO WRITE components'));

// ---- CHECK 8: zero-WRITE slate nudge ----
const mk = (id) => ({ id, name: 'Comp ' + id, role: 'role', verdict: 'BORROW', rationale: 'r',
  candidates: [ { owner: 'tesseract-ocr', name: 'tesseract' } ] });
const r8 = await verify(c, { idea: 'zero write slate', target_license: 'MIT',
  components: [mk('a'), mk('b'), mk('c')] });
console.error('\n\n===== CHECK 8: ZERO-WRITE NUDGE (3 components) =====');
console.error('WRITE count: ' + r8.parsed.components.filter(x=>x.verdict==='WRITE').length);
console.error('CONTAINS NUDGE: ' + r8.parsed.instructions.includes('ZERO WRITE components'));
console.error('\ninstructions:\n' + r8.parsed.instructions);

const r8b = await verify(c, { idea: 'zero write slate but only 2 components', target_license: 'MIT',
  components: [mk('a'), mk('b')] });
console.error('\n--- boundary: 2-component zero-WRITE slate (nudge should NOT fire, threshold is 3) ---');
console.error('CONTAINS NUDGE: ' + r8b.parsed.instructions.includes('ZERO WRITE components'));
c.close();
