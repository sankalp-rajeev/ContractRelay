import { wireWorker } from '@contractrelay/contracts/worker';
import { jsonValueSchema } from '@contractrelay/contracts';
import { verifyWrapperCandidate } from './index.js';
import type { WrapperVerificationInput } from './index.js';

wireWorker(async (payload, rpc) => {
  const task = payload as { input: Omit<WrapperVerificationInput, 'invoke' | 'execute' | 'fixture'>;
    fixtureEnvironment: 'isolated-fixture' | 'simulator' | null };
  return verifyWrapperCandidate({ ...task.input,
    execute: async (input) => jsonValueSchema.parse(await rpc('execute', input)),
    ...(task.fixtureEnvironment ? { fixture: { environment: task.fixtureEnvironment,
      reset: async () => { await rpc('reset', null); }, observe: async () => jsonValueSchema.parse(await rpc('observe', null)) } } : {}) });
});
