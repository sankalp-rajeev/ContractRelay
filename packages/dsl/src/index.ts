import { z } from 'zod';
import { jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue, ToolContract } from '@contractrelay/contracts';

const blocked = new Set(['__proto__', 'prototype', 'constructor']);
const field = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
  .refine((value) => !blocked.has(value), 'Unsafe property name');
const path = z.string().refine((value) =>
  value.split('.').every((part) => field.safeParse(part).success), 'Unsafe response path');
const evidence = z.array(z.string().min(1)).min(1);

export const inputStepSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('RenameTool'), from: z.string().min(1), to: z.string().min(1), evidence }).strict(),
  z.object({ op: z.literal('RenameArg'), from: field, to: field, evidence }).strict(),
  z.object({ op: z.literal('AddConstantDefault'), arg: field, value: jsonValueSchema, evidence }).strict(),
  z.object({ op: z.literal('ConvertType'), arg: field, to: z.enum(['string', 'number', 'integer', 'boolean']), evidence }).strict(),
  z.object({ op: z.literal('MapEnum'), arg: field, mapping: z.record(field, z.string()), evidence }).strict()
]);

export const responseStepSchema = z.object({
  op: z.literal('ProjectResponse'),
  mapping: z.record(field, path).refine((mapping) => Object.keys(mapping).length > 0, 'Empty projection'),
  evidence
}).strict();

export const translationPlanSchema = z.object({
  version: z.literal(1),
  source_tool: z.string().min(1),
  target: z.object({ kind: z.literal('single'), tool: z.string().min(1) }).strict(),
  steps: z.array(inputStepSchema).max(64),
  response: z.array(responseStepSchema).max(1),
  rationale: z.string().min(1)
}).strict();

export const rejectPlanSchema = z.object({
  version: z.literal(1),
  op: z.literal('Reject'),
  reason: z.string().min(1),
  missing_evidence: z.array(z.string().min(1)),
  risk: z.string().min(1)
}).strict();

export const adapterPlanSchema = z.union([translationPlanSchema, rejectPlanSchema]);
export type TranslationPlan = z.infer<typeof translationPlanSchema>;
export type AdapterPlan = z.infer<typeof adapterPlanSchema>;
export type InputStep = z.infer<typeof inputStepSchema>;
export interface Diagnostic { code: string; path: string; message: string }

export class PlanValidationError extends Error {
  constructor(public readonly diagnostics: readonly Diagnostic[]) {
    super(diagnostics.map((item) => `${item.path}: ${item.message}`).join('; '));
    this.name = 'PlanValidationError';
  }
}

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function properties(contract: ToolContract, direction: 'inputSchema' | 'outputSchema'): Record<string, JsonValue> {
  const schema = contract[direction];
  return typeof schema === 'object' ? record(schema.properties) : {};
}

function required(contract: ToolContract): Set<string> {
  const schema = contract.inputSchema;
  return new Set(typeof schema === 'object' && Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string') : []);
}

function hasPath(contract: ToolContract, dotted: string): boolean {
  let schema: JsonValue | undefined = contract.outputSchema;
  for (const part of dotted.split('.')) {
    const props = record(record(schema).properties);
    if (!Object.hasOwn(props, part)) return false;
    schema = props[part];
  }
  return true;
}

/** Structural validation only. A valid plan is a candidate, never a promotion. */
export function validatePlan(value: unknown, oldValue: unknown, newValue: unknown): AdapterPlan {
  const parsed = adapterPlanSchema.safeParse(value);
  if (!parsed.success) {
    throw new PlanValidationError(parsed.error.issues.map((issue) => ({
      code: 'PLAN_SCHEMA', path: issue.path.join('.'), message: issue.message
    })));
  }
  const plan = parsed.data;
  if ('op' in plan) return plan;
  const oldContract = toolContractSchema.parse(oldValue);
  const newContract = toolContractSchema.parse(newValue);
  const diagnostics: Diagnostic[] = [];
  const add = (code: string, at: string, message: string) => diagnostics.push({ code, path: at, message });
  if (plan.source_tool !== oldContract.name) add('SOURCE_TOOL', 'source_tool', 'Source tool does not match contract');
  if (plan.target.tool !== newContract.name) add('TARGET_TOOL', 'target.tool', 'Target tool is not allowlisted by contract');
  // Stateful candidates need policy, isolated fixtures and V3 gates, which are not implemented yet.
  if (oldContract.sideEffect !== 'READ_ONLY' || newContract.sideEffect !== 'READ_ONLY') {
    add('SIDE_EFFECT_POLICY', 'target', 'This milestone supports READ_ONLY contracts only');
  }
  for (const [name, contract] of [['old', oldContract], ['new', newContract]] as const) {
    if (typeof contract.inputSchema !== 'object' || contract.inputSchema.type !== 'object') {
      add('INPUT_OBJECT', name, 'Primitive translation requires an object input schema');
    }
  }
  const fields = new Map(Object.entries(properties(oldContract, 'inputSchema')));
  const guaranteed = required(oldContract);
  const targetFields = properties(newContract, 'inputSchema');
  let renamedTool = false;
  for (const [index, step] of plan.steps.entries()) {
    const at = `steps.${index}`;
    if (step.op === 'RenameTool') {
      if (renamedTool || step.from !== oldContract.name || step.to !== newContract.name) {
        add('TOOL_RENAME', at, 'Tool rename must match the source and target exactly once');
      }
      renamedTool = true;
      continue;
    }
    if (step.op === 'RenameArg') {
      if (!fields.has(step.from)) add('SOURCE_FIELD', at, `Unknown source field ${step.from}`);
      if (!Object.hasOwn(targetFields, step.to)) add('TARGET_FIELD', at, `Unknown target field ${step.to}`);
      if (fields.has(step.to)) add('DUPLICATE_ASSIGNMENT', at, `Rename would overwrite ${step.to}`);
      const source = fields.get(step.from);
      fields.delete(step.from);
      if (source !== undefined) fields.set(step.to, source);
      if (guaranteed.delete(step.from)) guaranteed.add(step.to);
      continue;
    }
    if (!Object.hasOwn(targetFields, step.arg)) add('TARGET_FIELD', at, `Unknown target field ${step.arg}`);
    if (step.op === 'AddConstantDefault') {
      if (fields.has(step.arg)) add('DUPLICATE_ASSIGNMENT', at, `Default must introduce a new field: ${step.arg}`);
      fields.set(step.arg, { type: step.value === null ? 'null' : Array.isArray(step.value) ? 'array' : typeof step.value });
      guaranteed.add(step.arg);
    } else {
      if (!fields.has(step.arg)) add('SOURCE_FIELD', at, `Unknown source field ${step.arg}`);
      if (step.op === 'ConvertType') fields.set(step.arg, { type: step.to });
      if (step.op === 'MapEnum') {
        const source = record(fields.get(step.arg));
        if (source.type !== 'string') add('ENUM_TYPE', at, 'Enum mapping requires a string field');
        if (Array.isArray(source.enum)) {
          for (const entry of source.enum) {
            if (typeof entry !== 'string' || !Object.hasOwn(step.mapping, entry)) {
              add('ENUM_COVERAGE', at, `Missing enum mapping for ${String(entry)}`);
            }
          }
        }
        fields.set(step.arg, { type: 'string', enum: Object.values(step.mapping) });
      }
    }
  }
  for (const name of required(newContract)) {
    if (!guaranteed.has(name)) add('MISSING_REQUIRED', 'steps', `Required target field is not guaranteed: ${name}`);
  }
  for (const [name, schema] of fields) {
    const expected = targetFields[name];
    if (expected === undefined) {
      if (typeof newContract.inputSchema === 'object' && newContract.inputSchema.additionalProperties === false) {
        add('EXTRA_FIELD', 'steps', `Unmapped source field ${name}`);
      }
      continue;
    }
    const actualType = record(schema).type;
    const expectedType = record(expected).type;
    if (typeof actualType === 'string' && typeof expectedType === 'string' && actualType !== expectedType
      && !(actualType === 'integer' && expectedType === 'number')) {
      add('TYPE_MISMATCH', 'steps', `Field ${name}: ${actualType} cannot satisfy ${expectedType}`);
    }
  }
  for (const [index, step] of plan.response.entries()) {
    const oldFields = properties(oldContract, 'outputSchema');
    for (const [name, sourcePath] of Object.entries(step.mapping)) {
      if (!Object.hasOwn(oldFields, name)) add('RESPONSE_TARGET', `response.${index}`, `Unknown old response field ${name}`);
      if (!hasPath(newContract, sourcePath)) add('RESPONSE_SOURCE', `response.${index}`, `Unknown new response path ${sourcePath}`);
    }
  }
  if (diagnostics.length) throw new PlanValidationError(diagnostics);
  return plan;
}
