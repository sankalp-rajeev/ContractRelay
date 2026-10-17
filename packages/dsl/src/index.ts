import { z } from 'zod';
import { jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue, ToolContract } from '@contractrelay/contracts';
import { allowsEffects, normalizeContracts } from '@contractrelay/contracts/policy';
import type { PolicyVersion } from '@contractrelay/contracts/policy';

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
  z.object({ op: z.literal('ConvertType'), arg: field, to: z.enum(['string', 'number', 'integer', 'boolean']),
    scale: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), evidence }).strict(),
  z.object({ op: z.literal('MapEnum'), arg: field, mapping: z.record(field, z.string()), evidence }).strict()
]);

const projectResponseSchema = z.object({
  op: z.literal('ProjectResponse'),
  mapping: z.record(field, path).refine((mapping) => Object.keys(mapping).length > 0, 'Empty projection'),
  evidence
}).strict();

export const responseStepSchema = z.discriminatedUnion('op', [projectResponseSchema,
  z.object({ op: z.literal('MapEnum'), field, mapping: z.record(field, z.string()), evidence }).strict()
]);

const referenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('input'), path }).strict(),
  z.object({ kind: z.literal('result'), call: field, path }).strict()
]);
export const bindingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('input'), path }).strict(),
  z.object({ kind: z.literal('result'), call: field, path }).strict(),
  z.object({ kind: z.literal('constant'), value: jsonValueSchema, evidence }).strict(),
  z.object({ kind: z.literal('convert'), source: referenceSchema,
    to: z.enum(['string', 'number', 'integer', 'boolean']),
    scale: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), evidence }).strict()
]);
export type Binding = z.infer<typeof bindingSchema>;
export const composedCallSchema = z.object({ id: field, tool: z.string().min(1),
  arguments: z.record(field, bindingSchema), evidence }).strict();
const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), tool: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('compose'), op: z.literal('ComposeCalls'), calls: z.array(composedCallSchema).min(1).max(8) }).strict()
]);

export const translationPlanSchema = z.object({
  version: z.literal(1),
  source_tool: z.string().min(1),
  target: targetSchema,
  steps: z.array(inputStepSchema).max(64),
  response: z.array(responseStepSchema).max(16),
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
export function planEvidenceReferences(plan: TranslationPlan): string[] {
  return [...plan.steps.flatMap((step) => step.evidence), ...plan.response.flatMap((step) => step.evidence),
    ...(plan.target.kind === 'compose' ? plan.target.calls.flatMap((call) => [...call.evidence,
      ...Object.values(call.arguments).flatMap((binding) => 'evidence' in binding ? binding.evidence : [])]) : [])];
}
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

function schemaAtPath(value: JsonValue | undefined, dotted: string): JsonValue | undefined {
  let schema = value;
  for (const part of dotted.split('.')) {
    const props = record(record(schema).properties);
    if (!Object.hasOwn(props, part)) return undefined;
    schema = props[part];
  }
  return schema;
}

function validateResponses(plan: TranslationPlan, oldContract: ToolContract, source: JsonValue | undefined, diagnostics: Diagnostic[]): void {
  let current = source;
  for (const [index, step] of plan.response.entries()) {
    const at = `response.${index}`;
    if (step.op === 'ProjectResponse') {
      const projected: Record<string, JsonValue> = {};
      for (const [name, sourcePath] of Object.entries(step.mapping)) {
        if (!Object.hasOwn(properties(oldContract, 'outputSchema'), name)) diagnostics.push({ code: 'RESPONSE_TARGET', path: at, message: `Unknown old response field ${name}` });
        const schema = schemaAtPath(current, sourcePath);
        if (schema === undefined) diagnostics.push({ code: 'RESPONSE_SOURCE', path: at, message: `Unknown new response path ${sourcePath}` });
        else projected[name] = schema;
      }
      current = { type: 'object', properties: projected };
    } else {
      const schema = schemaAtPath(current, step.field);
      if (record(schema).type !== 'string') diagnostics.push({ code: 'RESPONSE_ENUM_TYPE', path: at, message: 'Response enum mapping requires a string field' });
      const values = record(schema).enum;
      if (Array.isArray(values) && values.some((value) => typeof value !== 'string' || !Object.hasOwn(step.mapping, value))) {
        diagnostics.push({ code: 'ENUM_COVERAGE', path: at, message: 'Response enum mapping is incomplete' });
      }
    }
  }
}

function validateComposition(plan: TranslationPlan, oldContract: ToolContract, targets: readonly ToolContract[], diagnostics: Diagnostic[]): void {
  if (plan.target.kind !== 'compose') return;
  const add = (code: string, at: string, message: string) => diagnostics.push({ code, path: at, message });
  if (plan.steps.length) add('COMPOSE_INPUT_STEPS', 'steps', 'Composed arguments use explicit bindings; primitive input steps must be empty');
  const seen = new Map<string, ToolContract>();
  const outputs: Record<string, JsonValue> = {};
  for (const [index, call] of plan.target.calls.entries()) {
    const at = `target.calls.${index}`;
    if (seen.has(call.id)) add('DUPLICATE_CALL_ID', at, 'Call identifiers must be unique');
    const target = targets.find((tool) => tool.name === call.tool);
    if (!target) { add('TARGET_TOOL', at, 'Composed target is not allowlisted'); continue; }
    const targetFields = properties(target, 'inputSchema');
    for (const name of required(target)) if (!Object.hasOwn(call.arguments, name)) add('MISSING_REQUIRED', at, `Missing composed target argument ${name}`);
    for (const [name, binding] of Object.entries(call.arguments)) {
      if (!Object.hasOwn(targetFields, name)) add('TARGET_FIELD', at, `Unknown composed target argument ${name}`);
      let actual: JsonValue | undefined;
      const reference = binding.kind === 'convert' ? binding.source : binding;
      if (reference.kind === 'input') actual = schemaAtPath(oldContract.inputSchema, reference.path);
      if (reference.kind === 'result') {
        const prior = seen.get(reference.call);
        if (!prior) add('CALL_GRAPH', at, 'Result references must point to an earlier call; forward references and cycles are forbidden');
        actual = schemaAtPath(prior?.outputSchema, reference.path);
      }
      if (binding.kind === 'constant') actual = { type: binding.value === null ? 'null' : Array.isArray(binding.value) ? 'array'
        : typeof binding.value === 'number' && Number.isSafeInteger(binding.value) ? 'integer' : typeof binding.value };
      if (actual === undefined) add('SOURCE_FIELD', at, `Unknown binding source for ${name}`);
      if (binding.kind === 'convert') {
        if (binding.scale !== undefined && binding.to !== 'integer') add('INVALID_SCALE', at, 'Scaling requires integer output');
        actual = { type: binding.to };
      }
      const actualType = record(actual).type;
      const expectedType = record(targetFields[name]).type;
      if (typeof actualType === 'string' && typeof expectedType === 'string' && actualType !== expectedType
        && !(actualType === 'integer' && expectedType === 'number')) add('TYPE_MISMATCH', at, `Binding ${name} cannot satisfy the target type`);
    }
    seen.set(call.id, target);
    if (target.outputSchema !== undefined) outputs[call.id] = target.outputSchema;
  }
  validateResponses(plan, oldContract, { type: 'object', properties: outputs }, diagnostics);
}

/** Structural validation only. A valid plan is a candidate, never a promotion. */
export function validatePlan(value: unknown, oldValue: unknown, newValue: unknown,
  policy: PolicyVersion | 'planning-only' = 'read-only-v1'): AdapterPlan {
  const parsed = adapterPlanSchema.safeParse(value);
  if (!parsed.success) {
    throw new PlanValidationError(parsed.error.issues.map((issue) => ({
      code: 'PLAN_SCHEMA', path: issue.path.join('.'), message: issue.message
    })));
  }
  const plan = parsed.data;
  if ('op' in plan) return plan;
  const oldContract = toolContractSchema.parse(oldValue);
  const targets = normalizeContracts(newValue);
  const target = plan.target;
  const newContract = target.kind === 'single' ? targets.find((tool) => tool.name === target.tool) : targets[0];
  const diagnostics: Diagnostic[] = [];
  const add = (code: string, at: string, message: string) => diagnostics.push({ code, path: at, message });
  if (plan.source_tool !== oldContract.name) add('SOURCE_TOOL', 'source_tool', 'Source tool does not match contract');
  if (!newContract) add('TARGET_TOOL', 'target.tool', 'Target tool is not allowlisted by contract');
  if (!allowsEffects([oldContract, ...targets], policy)) {
    add('SIDE_EFFECT_POLICY', 'target', 'Side effects are unsupported by the selected execution policy');
  }
  if (plan.target.kind === 'compose') {
    validateComposition(plan, oldContract, targets, diagnostics);
    if (diagnostics.length) throw new PlanValidationError(diagnostics);
    return plan;
  }
  if (!newContract) throw new PlanValidationError(diagnostics);
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
      if (step.op === 'ConvertType') {
        if (step.scale !== undefined && step.to !== 'integer') add('INVALID_SCALE', at, 'Scaling is supported only for exact integer output');
        fields.set(step.arg, { type: step.to });
      }
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
  validateResponses(plan, oldContract, newContract.outputSchema, diagnostics);
  if (diagnostics.length) throw new PlanValidationError(diagnostics);
  return plan;
}
