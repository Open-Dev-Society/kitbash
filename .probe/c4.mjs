import { connect, handshake, verify } from './mcp.mjs';
const c = connect();
const t0 = Date.now();

const init = await handshake(c);
console.error('--- 1. initialize ---');
console.error('serverInfo: ' + JSON.stringify(init.result.serverInfo));
console.error('protocolVersion: ' + init.result.protocolVersion);
console.error('capabilities: ' + JSON.stringify(init.result.capabilities));

const list = await c.send('tools/list', {});
console.error('\n--- 2. tools/list ---');
for (const t of list.result.tools) {
  console.error(`tool: ${t.name}`);
  console.error(`  title: ${t.title ?? t.annotations?.title}`);
  console.error(`  inputSchema.type: ${t.inputSchema?.type}`);
  console.error(`  inputSchema.properties: ${Object.keys(t.inputSchema?.properties ?? {}).join(', ')}`);
  console.error(`  required: ${JSON.stringify(t.inputSchema?.required)}`);
  console.error(`  annotations: ${JSON.stringify(t.annotations)}`);
}

const plan = await c.send('tools/call', { name: 'kitbash', arguments: { idea: 'watch a folder, OCR new PDFs, make them searchable', stack: 'TypeScript / Node', target_license: 'MIT' } });
console.error('\n--- 3. tools/call kitbash ---');
const rubric = plan.result.content[0].text;
console.error('content blocks: ' + plan.result.content.length);
console.error('rubric chars: ' + rubric.length);
console.error('rubric head: ' + JSON.stringify(rubric.slice(0, 90)));
console.error('mentions kitbash_verify: ' + rubric.includes('kitbash_verify'));
console.error('echoes stack constraint: ' + rubric.includes('TARGET STACK: TypeScript / Node'));
console.error('echoes license constraint: ' + rubric.includes('TARGET LICENSE: MIT'));

const { parsed, markdown } = await verify(c, {
  idea: 'watch a folder, OCR new PDFs, make them searchable',
  stack: 'TypeScript / Node',
  target_license: 'MIT',
  components: [
    { id: 'ocr-engine', name: 'OCR engine', role: 'Reads text off scanned pages.', verdict: 'BORROW', rationale: 'Decades of trained language data.', candidates: [{ owner: 'tesseract-ocr', name: 'tesseract' }] },
  ],
});
console.error('\n--- 4. tools/call kitbash_verify ---');
console.error('stats: ' + JSON.stringify(parsed.stats));
console.error('github: ' + JSON.stringify(parsed.github));
console.error('next_action: ' + parsed.next_action);
console.error('picked: ' + parsed.components[0].picked?.full_name + ' stars=' + parsed.components[0].picked?.stars + ' pushed_at=' + parsed.components[0].picked?.pushed_at + ' health=' + parsed.components[0].picked?.health);
console.error('markdown chars: ' + markdown.length);

console.error('\n--- STDOUT PURITY ---');
console.error('non-JSON lines on stdout: ' + c.nonJsonLines().length + (c.nonJsonLines().length ? ' >>> ' + JSON.stringify(c.nonJsonLines()) : ' (clean)'));
console.error('total wall clock: ' + (Date.now() - t0) + 'ms');
c.close();
