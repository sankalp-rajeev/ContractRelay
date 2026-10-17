import { readFile } from 'node:fs/promises';
import { wireWorker } from '@contractrelay/contracts/worker';
import { verifyCandidate } from './index.js';

wireWorker(async (payload, rpc) => {
  const task = payload as { operation: string; path?: string; input?: Omit<Parameters<typeof verifyCandidate>[0], 'invoke'> };
  if (task.operation === 'probe' && task.path) return readFile(task.path, 'utf8');
  if (task.operation !== 'verify' || !task.input) throw new Error('Invalid verification task');
  return verifyCandidate({ ...task.input, invoke: (tool, args) => rpc('invoke', { tool, args }) });
});
