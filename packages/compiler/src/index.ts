import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { hashContract, hashJson, jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import { validatePlan } from '@contractrelay/dsl';
import type { InputStep, TranslationPlan } from '@contractrelay/dsl';

export type ToolInvoker = (tool: string, args: Readonly<Record<string, JsonValue>>) => Promise<unknown>;

export class AdapterError extends Error {
  constructor(public readonly code: string, message: string, public readonly detail?: unknown) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface CandidateAdapter {
  readonly plan: Readonly<TranslationPlan>;
  readonly planHash: string;
  readonly oldContractHash: string;
  readonly newContractHash: string;
  /** For isolated fixtures only. This candidate has NOT passed a promotion gate. */
  executeForVerification(input: unknown, invoke: ToolInvoker): Promise<JsonValue>;
}

function assertValid(validate: ValidateFunction, value: unknown, boundary: string): void {
  if (!validate(value)) throw new AdapterError('SCHEMA_VALIDATION', `Invalid ${boundary}`, structuredClone(validate.errors));
}

function object(value: unknown): Record<string, JsonValue> {
  const json = jsonValueSchema.parse(value);
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new AdapterError('OBJECT_REQUIRED', 'Expected a JSON object');
  }
  return structuredClone(json);
}

function scaledInteger(value: JsonValue, scale: number): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  const parts = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
  if (!parts) throw new AdapterError('CONVERSION_FAILED', 'Expected a finite decimal for exact scaling');
  const fraction = parts[3] ?? '';
  const numerator = BigInt(`${parts[1]}${parts[2]}${fraction}`) * BigInt(scale);
  const denominator = 10n ** BigInt(fraction.length);
  const result = numerator / denominator;
  if (numerator % denominator !== 0n || result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new AdapterError('CONVERSION_FAILED', 'Scaled value cannot be represented as a safe integer without rounding');
  }
  return Number(result);
}

function convert(value: JsonValue, to: 'string' | 'number' | 'integer' | 'boolean', scale?: number): JsonValue {
  if (scale !== undefined) return scaledInteger(value, scale);
  if (to === 'string' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
    return String(value);
  }
  if (to === 'boolean') {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
  }
  if (to === 'number' || to === 'integer') {
    // No whitespace, empty strings, hexadecimal, NaN, or Infinity coercion.
    const numeric = typeof value === 'number' ? value
      : typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)
        ? Number(value) : Number.NaN;
    if (Number.isFinite(numeric) && (to !== 'integer' || Number.isSafeInteger(numeric))) return numeric;
  }
  throw new AdapterError('CONVERSION_FAILED', `Cannot losslessly convert value to ${to}`);
}

function applyStep(args: Record<string, JsonValue>, step: InputStep): void {
  if (step.op === 'RenameTool') return;
  if (step.op === 'RenameArg') {
    if (!Object.hasOwn(args, step.from)) return; // Optional source remains optional.
    if (Object.hasOwn(args, step.to)) throw new AdapterError('DUPLICATE_ASSIGNMENT', `Refusing to overwrite ${step.to}`);
    args[step.to] = args[step.from] as JsonValue;
    delete args[step.from];
    return;
  }
  if (step.op === 'AddConstantDefault') {
    if (!Object.hasOwn(args, step.arg)) args[step.arg] = structuredClone(step.value);
    return;
  }
  if (!Object.hasOwn(args, step.arg)) return;
  const value = args[step.arg] as JsonValue;
  if (step.op === 'ConvertType') args[step.arg] = convert(value, step.to, step.scale);
  if (step.op === 'MapEnum') {
    if (typeof value !== 'string' || !Object.hasOwn(step.mapping, value)) {
      throw new AdapterError('UNMAPPED_ENUM', `No declared enum mapping for ${step.arg}`);
    }
    args[step.arg] = step.mapping[value] as string;
  }
}

function project(value: JsonValue, mapping: Record<string, string>): JsonValue {
  const output: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const [destination, path] of Object.entries(mapping)) {
    let current = value;
    for (const segment of path.split('.')) {
      if (current === null || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, segment)) {
        throw new AdapterError('MISSING_RESPONSE_PATH', `Missing declared response path ${path}`);
      }
      current = current[segment] as JsonValue;
    }
    output[destination] = current;
  }
  return output;
}

/** Compiles a candidate, not a promoted runtime adapter. No code generation/eval. */
export function compileCandidate(planValue: unknown, oldValue: unknown, newValue: unknown): CandidateAdapter {
  const oldContract = toolContractSchema.parse(oldValue);
  const newContract = toolContractSchema.parse(newValue);
  const plan = validatePlan(planValue, oldContract, newContract);
  if ('op' in plan) throw new AdapterError('PLAN_REJECTED', plan.reason);
  const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
  const oldInput = ajv.compile(oldContract.inputSchema);
  const newInput = ajv.compile(newContract.inputSchema);
  const oldOutput = oldContract.outputSchema === undefined ? undefined : ajv.compile(oldContract.outputSchema);
  const newOutput = newContract.outputSchema === undefined ? undefined : ajv.compile(newContract.outputSchema);
  // Use an isolated plan copy in the closure so callers cannot mutate a compiled candidate.
  const executable = structuredClone(plan);
  return Object.freeze({
    get plan() { return structuredClone(executable); },
    planHash: hashJson(executable),
    oldContractHash: hashContract(oldContract),
    newContractHash: hashContract(newContract),
    async executeForVerification(input: unknown, invoke: ToolInvoker): Promise<JsonValue> {
      assertValid(oldInput, input, 'old input');
      const args = object(input);
      for (const step of executable.steps) applyStep(args, step);
      assertValid(newInput, args, 'translated input');
      const raw = jsonValueSchema.parse(await invoke(executable.target.tool, args));
      if (newOutput) assertValid(newOutput, raw, 'target response');
      let result: JsonValue = structuredClone(raw);
      for (const step of executable.response) result = project(result, step.mapping);
      if (oldOutput) assertValid(oldOutput, result, 'old response');
      return result;
    }
  });
}
