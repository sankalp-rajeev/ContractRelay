import { createInterface } from 'node:readline';
import process from 'node:process';
import { Buffer } from 'node:buffer';
// This program and all generated code execute inside the disposable container.
const lines = createInterface({ input: process.stdin });
const waiting = new Map();
let nextId = 0;
let started = false;
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
lines.on('line', async (line) => {
  try {
    const message = JSON.parse(line);
    if (started) {
      const pending = waiting.get(message.id);
      if (!pending) throw new Error('UNKNOWN_RPC');
      waiting.delete(message.id);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(new Error('TOOL_CALL_FAILED'));
      return;
    }
    started = true;
    const module = await import(`data:text/javascript;base64,${Buffer.from(message.code).toString('base64')}`);
    if (typeof module.adapt !== 'function') throw new Error('MISSING_ADAPT');
    const callTool = (tool, args) => new Promise((resolve, reject) => {
      const id = ++nextId;
      waiting.set(id, { resolve, reject });
      send({ type: 'call', id, tool, args });
    });
    const value = await module.adapt(message.input, callTool);
    send({ type: 'result', value });
    process.exit(0);
  } catch {
    send({ type: 'error', code: 'WRAPPER_EXECUTION_FAILED' });
    process.exit(1);
  }
});
