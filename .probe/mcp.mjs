/**
 * Minimal MCP stdio client. Speaks newline-delimited JSON-RPC to build/index.js.
 * Tracks stdout byte purity: every byte on stdout must parse as a JSON-RPC frame.
 */
import { spawn } from 'node:child_process';

const SERVER = 'C:/Users/11ara/github/kitbash/build/index.js';

export function connect(env = {}) {
  const p = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  const pending = new Map();
  let id = 0;
  let buf = '';
  let stderr = '';
  let rawStdoutBytes = 0;
  const nonJsonLines = [];

  p.stdout.on('data', (b) => {
    rawStdoutBytes += b.length;
    buf += b.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        nonJsonLines.push(line);
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });
  p.stderr.on('data', (b) => { stderr += b.toString(); });

  function send(method, params) {
    const mid = ++id;
    const frame = JSON.stringify({ jsonrpc: '2.0', id: mid, method, params }) + '\n';
    p.stdin.write(frame);
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      setTimeout(() => {
        if (pending.has(mid)) { pending.delete(mid); reject(new Error(`timeout on ${method}`)); }
      }, 60000);
    });
  }

  function notify(method, params) {
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  return {
    proc: p,
    send,
    notify,
    stderr: () => stderr,
    rawStdoutBytes: () => rawStdoutBytes,
    nonJsonLines: () => nonJsonLines,
    close: () => p.kill(),
  };
}

export async function handshake(c) {
  const init = await c.send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'kitbash-probe', version: '1.0.0' },
  });
  c.notify('notifications/initialized', {});
  return init;
}

/** Call kitbash_verify and return the parsed VerifyResult JSON block. */
export async function verify(c, payload) {
  const res = await c.send('tools/call', { name: 'kitbash_verify', arguments: payload });
  if (res.error) throw new Error('tools/call error: ' + JSON.stringify(res.error));
  const blocks = res.result.content.map((x) => x.text);
  const jsonBlock = blocks.find((t) => t.includes('<kitbash_result_json>'));
  if (!jsonBlock) throw new Error('no JSON block in response');
  const raw = jsonBlock.replace('<kitbash_result_json>', '').replace('</kitbash_result_json>', '').trim();
  return { parsed: JSON.parse(raw), markdown: blocks[0], raw: res };
}
