import { connect, handshake, verify } from './mcp.mjs';
const c = connect(); await handshake(c);

const SECRET_OWNER = 'landerdevelopers';
const SECRET_NAME  = 'originkit';
const SECRET = `${SECRET_OWNER}/${SECRET_NAME}`;

// Sanity: confirm the token really CAN see it (otherwise this test is vacuous).
import { fetchRepoFacts } from '../build/github/repos.js';
const [raw] = await fetchRepoFacts([{ owner: SECRET_OWNER, name: SECRET_NAME }]);
console.error('PRE-CHECK: token can see private repo? exists=' + raw.exists + ' status=' + raw.status + ' private=' + raw.private);
if (!raw.exists || raw.private !== true) { console.error('!!! TEST IS VACUOUS — token cannot see it as private'); }

const res = await verify(c, {
  idea: 'private repo leak test',
  target_license: 'MIT',
  components: [
    { id: 'secret', name: 'Secret component', role: 'Should never name the private repo.', verdict: 'BORROW',
      rationale: 'Proposing a private repo on purpose.',
      candidates: [ { owner: SECRET_OWNER, name: SECRET_NAME }, { owner: 'tesseract-ocr', name: 'tesseract' } ] },
    { id: 'secret-only', name: 'Secret only component', role: 'Private repo is the ONLY candidate.', verdict: 'BORROW',
      rationale: 'Only candidate is private.',
      candidates: [ { owner: SECRET_OWNER, name: SECRET_NAME } ] },
  ],
});

// Scan EVERYTHING the client receives — markdown AND the JSON block AND the whole frame.
const wholeFrame = JSON.stringify(res.raw);
const targets = [SECRET, SECRET_NAME, SECRET_OWNER];
console.error('\n=== LEAK SCAN over the ENTIRE tools/call response frame ===');
let leaked = false;
for (const t of targets) {
  const inFrame = wholeFrame.toLowerCase().includes(t.toLowerCase());
  if (inFrame) leaked = true;
  console.error(`  "${t}" present in response frame: ${inFrame}${inFrame?'   <<<<<< LEAK':''}`);
}
console.error('\nrejected entries as serialized:');
for (const comp of res.parsed.components) console.error(`  [${comp.id}] needs_recall=${comp.needs_recall} rejected=${JSON.stringify(comp.rejected)}`);
console.error('\nRESULT: ' + (leaked ? 'FAIL — private repo name leaked' : 'PASS — no trace of the private repo anywhere in the response'));
console.error('\n=== MARKDOWN ===');
console.error(res.markdown);
c.close();
