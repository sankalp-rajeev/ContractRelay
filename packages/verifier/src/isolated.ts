import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { jsonValueSchema } from '@contractrelay/contracts';
import { normalizeContracts } from '@contractrelay/contracts/policy';
import { runIsolatedTask } from '@contractrelay/contracts/sandbox';
import { verificationReportSchema } from './index.js';
import type { verifyCandidate, VerificationReport, WrapperVerificationInput } from './index.js';

export async function verifyIsolated(input: Parameters<typeof verifyCandidate>[0]): Promise<VerificationReport> {
  const { invoke, fixture, ...data } = input;
  const targets = new Set(normalizeContracts(input.newContract).map((tool) => tool.name));
  const result = await runIsolatedTask(fileURLToPath(new URL('./isolation-worker.ts', import.meta.url)),
    { operation: 'verify', input: data, fixtureEnvironment: fixture?.environment ?? null }, async (method, payload) => {
      if (method === 'reset' && fixture) { await fixture.reset(); return null; }
      if (method === 'observe' && fixture) return fixture.observe();
      if (method !== 'invoke') throw new Error('Unsupported verifier capability');
      const request = z.object({ tool: z.string().refine((tool) => targets.has(tool)), args: z.record(jsonValueSchema) }).strict().parse(payload);
      return invoke(request.tool, request.args);
    });
  return verificationReportSchema.parse(result);
}

export async function verifyWrapperIsolated(input: WrapperVerificationInput): Promise<VerificationReport> {
  const { execute, fixture, ...data } = input;
  const result = await runIsolatedTask(fileURLToPath(new URL('./wrapper-worker.ts', import.meta.url)),
    { input: data, fixtureEnvironment: fixture?.environment ?? null }, async (method, payload) => {
      if (method === 'reset' && fixture) { await fixture.reset(); return null; }
      if (method === 'observe' && fixture) return fixture.observe();
      if (method === 'execute') return execute(jsonValueSchema.parse(payload));
      throw new Error('Unsupported wrapper verifier capability');
    });
  return verificationReportSchema.parse(result);
}
