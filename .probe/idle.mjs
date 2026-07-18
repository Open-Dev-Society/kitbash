// Spawn the server, sit idle, count EXACT bytes on stdout.
import { spawn } from 'node:child_process';

const p = spawn(process.execPath, ['C:/Users/11ara/github/kitbash/build/index.js'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let outBytes = 0;
const outChunks = [];
let errBuf = '';
p.stdout.on('data', (b) => { outBytes += b.length; outChunks.push(b); });
p.stderr.on('data', (b) => { errBuf += b.toString(); });

setTimeout(() => {
  console.error('IDLE_STDOUT_BYTES=' + outBytes);
  console.error('IDLE_STDOUT_HEX=' + Buffer.concat(outChunks).toString('hex').slice(0, 400));
  console.error('IDLE_STDOUT_TEXT=' + JSON.stringify(Buffer.concat(outChunks).toString('utf8')));
  console.error('--- STDERR OBSERVED ---');
  console.error(errBuf.trim());
  console.error('--- ALIVE=' + (p.exitCode === null) + ' ---');
  p.kill();
  process.exit(outBytes === 0 ? 0 : 1);
}, 3000);
