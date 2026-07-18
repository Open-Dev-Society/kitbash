import { connect, handshake, verify } from './mcp.mjs';
const c = connect(); await handshake(c);

const { parsed, markdown } = await verify(c, {
  idea: 'watch a folder, OCR new PDFs, make them searchable',
  target_license: 'MIT',
  components: [
    { id: 'ocr-engine', name: 'OCR engine', role: 'Reads text off scanned pages.', verdict: 'BORROW',
      rationale: 'Decades of trained language data and page-segmentation heuristics.',
      candidates: [ { owner: 'tesseract-ocr', name: 'tesseract' }, { owner: 'deepmind', name: 'ocr-transformer-v2' } ] },
    { id: 'pdf-dewarp', name: 'Page dewarping', role: 'Flattens curled scans before OCR.', verdict: 'BORROW',
      rationale: 'Perspective correction on camera-captured pages.',
      candidates: [ { owner: 'openscanlabs', name: 'pdf-dewarp-toolkit' }, { owner: 'adobe-research', name: 'docunwarp' } ] },
  ],
});

console.error('=== STATS ===');
console.error(JSON.stringify(parsed.stats, null, 2));
console.error('expected: proposed=4 verified=1 hallucinated=3 rate=0.75');
console.error('next_action: ' + parsed.next_action + '   (expect RECALL_REPLACEMENTS)');
console.error('');
for (const comp of parsed.components) {
  console.error(`[${comp.id}] verdict=${comp.verdict} needs_recall=${comp.needs_recall}`);
  console.error(`  picked: ${comp.picked ? comp.picked.full_name : '(none)'}`);
  console.error(`  alternates: ${comp.alternates.map(a=>a.full_name).join(', ') || '(none)'}`);
  console.error(`  rejected: ${JSON.stringify(comp.rejected)}`);
}
console.error('');
console.error('=== fake names must NOT appear as survivors ===');
for (const fake of ['deepmind/ocr-transformer-v2','openscanlabs/pdf-dewarp-toolkit','adobe-research/docunwarp']) {
  const survivor = parsed.components.some(c2 => [c2.picked, ...c2.alternates].filter(Boolean).some(a => a.req.toLowerCase() === fake.toLowerCase()));
  console.error(`  ${fake}: survivor=${survivor} (must be false)`);
}
console.error('');
console.error('=== instructions ===');
console.error(parsed.instructions);
console.error('');
console.error('=== MARKDOWN ===');
console.error(markdown);
c.close();
