import { z } from 'zod';
import { hashContract, hashJson, toolContractSchema } from './index.js';
import type { ToolContract } from './index.js';

export const policyVersionSchema = z.enum(['read-only-v1', 'stateful-fixture-v1', 'stateful-simulator-v1']);
export type PolicyVersion = z.infer<typeof policyVersionSchema>;

export function normalizeContracts(value: unknown): ToolContract[] {
  const tools = z.array(toolContractSchema).min(1).max(50).parse(Array.isArray(value) ? value : [value]);
  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) throw new Error('Duplicate target tool names');
  return tools.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
}

export function hashContractSet(value: unknown): string {
  return Array.isArray(value) ? hashJson({ version: 1, tools: normalizeContracts(value) }) : hashContract(value);
}

export function allowsEffects(contracts: readonly ToolContract[], policy: PolicyVersion | 'planning-only'): boolean {
  if (contracts.some((contract) => contract.sideEffect === 'UNKNOWN')) return false;
  if (policy === 'planning-only' || policy === 'stateful-simulator-v1') return true;
  if (policy === 'read-only-v1') return contracts.every((contract) => contract.sideEffect === 'READ_ONLY');
  return contracts.every((contract) => contract.sideEffect !== 'IRREVERSIBLE_WRITE');
}
