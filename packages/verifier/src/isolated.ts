import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import { runIsolatedTask } from '@contractrelay/contracts/sandbox';
import { verificationReportSchema } from './index.js';
import type { verifyCandidate, VerificationReport } from './index.js';

export async function verifyIsolated(input: Parameters<typeof verifyCandidate>[0]): Promise<VerificationReport> {
  const { invoke, ...data } = input;
  const target = toolContractSchema.parse(input.newContract).name;
  const result = await runIsolatedTask(fileURLToPath(new URL('./isolation-worker.ts', import.meta.url)),
    { operation: 'verify', input: data }, async (method, payload) => {
      const request = z.object({ tool: z.literal(target), args: z.record(jsonValueSchema) }).strict().parse(payload);
      if (method !== 'invoke') throw new Error('Unsupported verifier capability');
      return invoke(request.tool, request.args);
    });
  return verificationReportSchema.parse(result);
}
