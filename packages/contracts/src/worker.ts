import { createInterface } from 'node:readline';
import { jsonValueSchema } from './index.js';

export type WorkerRpc = (method: string, payload: unknown) => Promise<unknown>;

/** Trusted entry-point plumbing. Workers receive JSON only and no host environment. */
export function wireWorker(handler: (payload: unknown, rpc: WorkerRpc) => Promise<unknown>): void {
  const lines = createInterface({ input: process.stdin });
  const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let nextId = 0;
  const send = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const rpc: WorkerRpc = (method, payload) => new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    send({ type: 'request', id, method, payload: jsonValueSchema.parse(payload) });
  });
  let started = false;
  lines.on('line', (line) => {
    const message = JSON.parse(line) as { type: string; payload?: unknown; id?: number; ok?: boolean; error?: string };
    if (message.type === 'start' && !started) {
      started = true;
      void handler(message.payload, rpc).then((value) => {
        send({ type: 'result', value: jsonValueSchema.parse(value) });
        lines.close(); process.stdin.destroy();
      }, (error: unknown) => {
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'WORKER_TASK_FAILED';
        send({ type: 'error', code }); lines.close(); process.stdin.destroy(); process.exitCode = 1;
      });
    } else if (message.type === 'response' && message.id !== undefined) {
      const pending = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.ok) pending?.resolve(message.payload);
      else {
        const code = message.error && /^[A-Z][A-Z0-9_]{0,63}$/.test(message.error) ? message.error : 'RPC_FAILED';
        pending?.reject(Object.assign(new Error(code), { code }));
      }
    }
  });
}
