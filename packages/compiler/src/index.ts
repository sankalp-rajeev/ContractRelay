import { Ajv } from 'ajv';
import type { ValidateFunction } from 'ajv';
import { hashContract, hashJson, jsonValueSchema, toolContractSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import { hashContractSet, normalizeContracts } from '@contractrelay/contracts/policy';
import type { PolicyVersion } from '@contractrelay/contracts/policy';
import { validatePlan } from '@contractrelay/dsl';
import type { Binding, InputStep, ResponseBinding, TranslationPlan } from '@contractrelay/dsl';

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
  executeForVerification(input: unknown, invoke: ToolInvoker, onOperation?: (operation: TranslationOperation) => void): Promise<JsonValue>;
}

export interface TranslationOperation { phase: 'input' | 'call' | 'response'; op: string; index: number; tool?: string; field?: string }

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
  if (text.length > 256) throw new AdapterError('CONVERSION_FAILED', 'Decimal exceeds supported precision');
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

function normalizedDecimal(text: string): string {
  const parts = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!parts || text.length > 256) throw new AdapterError('CONVERSION_FAILED', 'Unsupported decimal representation');
  const fraction = parts[3] ?? '';
  let digits = `${parts[2]}${fraction}`.replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = Number(parts[4] ?? 0) - fraction.length;
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) throw new AdapterError('CONVERSION_FAILED', 'Unsupported exponent');
  const trimmed = digits.replace(/0+$/, '');
  exponent += digits.length - trimmed.length;
  digits = trimmed;
  return `${parts[1]}${digits}e${exponent}`;
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
    if (Number.isFinite(numeric) && (to !== 'integer' || Number.isSafeInteger(numeric))) {
      if (typeof value === 'string' && ((Number.isInteger(numeric) && !Number.isSafeInteger(numeric))
        || normalizedDecimal(value) !== normalizedDecimal(String(numeric)))) {
        throw new AdapterError('CONVERSION_FAILED', 'Numeric conversion would lose declared decimal precision');
      }
      return numeric;
    }
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
  if (step.op === 'WrapArray') {
    if (!Object.hasOwn(args, step.source)) return;
    if (step.source !== step.target && Object.hasOwn(args, step.target)) throw new AdapterError('DUPLICATE_ASSIGNMENT', `Refusing to overwrite ${step.target}`);
    const value = structuredClone(args[step.source] as JsonValue);
    if (step.source !== step.target) delete args[step.source];
    args[step.target] = [value];
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

function reference(value: JsonValue, path: string): JsonValue {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current) || !Object.hasOwn(current, segment)) {
      throw new AdapterError('BINDING_FAILED', 'A declared binding source is absent');
    }
    current = current[segment] as JsonValue;
  }
  return structuredClone(current);
}

function bind(binding: Binding, input: JsonValue, results: Record<string, JsonValue>): JsonValue {
  if (binding.kind === 'constant') return structuredClone(binding.value);
  const source = binding.kind === 'convert' || binding.kind === 'wrapArray' ? binding.source : binding;
  const value = source.kind === 'input' ? reference(input, source.path) : reference(results, `${source.call}.${source.path}`);
  if (binding.kind === 'wrapArray') return [value];
  return binding.kind === 'convert' ? convert(value, binding.to, binding.scale) : value;
}

function responseValue(binding: ResponseBinding, input: JsonValue, response: JsonValue, results: Record<string, JsonValue>): JsonValue {
  if (binding.kind === 'constant') return structuredClone(binding.value);
  const source = binding.kind === 'compareInteger' ? binding.source : binding;
  const value = source.kind === 'input' ? reference(input, source.path)
    : source.kind === 'response' ? reference(response, source.path) : reference(results, `${source.call}.${source.path}`);
  if (binding.kind !== 'compareInteger') return value;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new AdapterError('COMPARISON_FAILED', 'Integer comparison requires a safe integer; no coercion');
  return binding.operator === 'eq' ? value === binding.value : value > binding.value;
}

/** Compiles a candidate, not a promoted runtime adapter. No code generation/eval. */
export function compileCandidate(planValue: unknown, oldValue: unknown, newValue: unknown,
  policy: PolicyVersion = 'read-only-v1'): CandidateAdapter {
  const oldContract = toolContractSchema.parse(oldValue);
  const targets = normalizeContracts(newValue);
  const plan = validatePlan(planValue, oldContract, newValue, policy);
  if ('op' in plan) throw new AdapterError('PLAN_REJECTED', plan.reason);
  const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false, multipleOfPrecision: 12 });
  const oldInput = ajv.compile(oldContract.inputSchema);
  const oldOutput = oldContract.outputSchema === undefined ? undefined : ajv.compile(oldContract.outputSchema);
  const targetSchemas = new Map(targets.map((target) => [target.name, { input: ajv.compile(target.inputSchema),
    output: target.outputSchema === undefined ? undefined : ajv.compile(target.outputSchema) }]));
  // Use an isolated plan copy in the closure so callers cannot mutate a compiled candidate.
  const executable = structuredClone(plan);
  return Object.freeze({
    get plan() { return structuredClone(executable); },
    planHash: hashJson(executable),
    oldContractHash: hashContract(oldContract),
    newContractHash: hashContractSet(newValue),
    async executeForVerification(input: unknown, invoke: ToolInvoker, onOperation?: (operation: TranslationOperation) => void): Promise<JsonValue> {
      assertValid(oldInput, input, 'old input');
      const originalInput = object(input);
      const args = object(input);
      for (const [index, step] of executable.steps.entries()) { applyStep(args, step); onOperation?.({ phase: 'input', op: step.op, index }); }
      const call = async (tool: string, arguments_: Record<string, JsonValue>, index: number): Promise<JsonValue> => {
        const schemas = targetSchemas.get(tool);
        if (!schemas) throw new AdapterError('UNALLOWLISTED_TARGET', 'Target tool is not allowlisted');
        assertValid(schemas.input, arguments_, 'translated input');
        onOperation?.({ phase: 'call', op: 'InvokeTool', tool, index });
        const raw = jsonValueSchema.parse(await invoke(tool, arguments_));
        if (schemas.output) assertValid(schemas.output, raw, 'target response');
        return structuredClone(raw);
      };
      let result: JsonValue;
      const results: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
      if (executable.target.kind === 'single') result = await call(executable.target.tool, args, 0);
      else {
        for (const [index, step] of executable.target.calls.entries()) {
          const bound = Object.fromEntries(Object.entries(step.arguments).map(([name, binding]) => {
            const value = bind(binding, args, results);
            onOperation?.({ phase: 'input', op: binding.kind === 'convert' ? 'ConvertType' : `Bind:${binding.kind}`, index, tool: step.tool, field: name });
            return [name, value];
          }));
          results[step.id] = await call(step.tool, bound, index);
        }
        result = results;
      }
      for (const [index, step] of executable.response.entries()) {
        if (step.op === 'ProjectResponse') result = project(result, step.mapping);
        else if (step.op === 'ConstructResponse') {
          const constructed: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
          for (const [name, binding] of Object.entries(step.fields)) constructed[name] = responseValue(binding, originalInput, result, results);
          result = constructed;
        }
        else {
          const mapped = object(result);
          const value = mapped[step.field];
          if (typeof value !== 'string' || !Object.hasOwn(step.mapping, value)) throw new AdapterError('UNMAPPED_ENUM', 'Response enum value is not declared');
          mapped[step.field] = step.mapping[value] as string;
          result = mapped;
        }
        onOperation?.({ phase: 'response', op: step.op, index });
      }
      if (oldOutput) assertValid(oldOutput, result, 'old response');
      return result;
    }
  });
}
