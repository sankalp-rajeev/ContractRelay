import { z } from 'zod';
import { jsonValueSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';
import type { AdapterPlan } from '@contractrelay/dsl';
import type { SynthesisEvidence } from './index.js';
import type { QuotaScheduler } from './scheduler.js';
import { ModelRequestError } from './model.js';
import { createPlanResponseJsonSchema, parseSynthesisCandidate, ScheduledPlanSynthesizer } from './synthesis.js';

export const structuralSynthesisPromptVersion = 'bounded-plan-v7';
export type StructuralSynthesisSettings = ConstructorParameters<typeof ScheduledPlanSynthesizer>[1] & { capabilities?: 'structural-v1' };
const string = { type: 'string' };
const object = (properties: Record<string, JsonValue>): JsonValue => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const record = (value: unknown): Record<string, JsonValue> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {};
const named = (values: string[]): JsonValue => values.length ? { type: 'string', enum: values } : string;
function referencePaths(schema: unknown, prefix = '', depth = 0): string[] {
  if (depth > 8) return [];
  return Object.entries(record(record(schema).properties)).flatMap(([name, child]) => {
    const path = prefix ? `${prefix}.${name}` : name;
    return [path, ...referencePaths(child, path, depth + 1)];
  });
}

/** Extend the existing single-target grammar; never rewrite its frozen v6 source. */
export function createStructuralPlanResponseJsonSchema(input: SynthesisEvidence): JsonValue {
  const schema = jsonValueSchema.parse(createPlanResponseJsonSchema(input));
  // Multi-target generation retains the existing bounded composed wire grammar.
  // The DSL/interpreter can also execute hand-supplied structural bindings there.
  if (input.newContracts.length > 1) return schema;
  const candidates = record(record(schema).properties).candidate;
  const alternatives = record(candidates).anyOf;
  if (!Array.isArray(alternatives) || !alternatives[0]) throw new Error('Unexpected legacy synthesis grammar');
  const adaptation = record(record(alternatives[0]).properties);
  const operations = record(record(adaptation.steps).items).anyOf;
  if (!Array.isArray(operations)) throw new Error('Unexpected legacy input grammar');
  const evidence: JsonValue = { type: 'array', items: string };
  operations.push(object({ op: { type: 'string', enum: ['WrapArray'] },
    source: named(Object.keys(record(record(input.oldContract.inputSchema).properties))),
    target: named(Object.keys(record(record(input.newContracts[0]?.inputSchema).properties))), evidence }));
  const references = [object({ kind: { type: 'string', enum: ['input'] }, path: named(referencePaths(input.oldContract.inputSchema)) }),
    object({ kind: { type: 'string', enum: ['response'] }, path: named(referencePaths(input.newContracts[0]?.outputSchema)) })];
  const reference: JsonValue = { anyOf: references };
  const construction = object({ op: { type: 'string', enum: ['ConstructResponse'] },
    fields: { type: 'array', items: object({ name: named(Object.keys(record(record(input.oldContract.outputSchema).properties))),
      binding: { anyOf: [...references, object({ kind: { type: 'string', enum: ['constant'] }, value: { type: ['string', 'number', 'boolean', 'null'] } }),
        object({ kind: { type: 'string', enum: ['compareInteger'] }, source: reference, operator: { type: 'string', enum: ['eq', 'gt'] }, value: { type: 'integer' } })] } }) }, evidence });
  const existing = record(record(adaptation.response).items).anyOf;
  adaptation.response = { type: 'array', items: { anyOf: [...(Array.isArray(existing) ? existing : []), construction] } };
  return schema;
}

/** Provider lists decode into the same canonical DSL record, then use the existing parser. */
export function parseStructuralCandidate(response: unknown, evidence: SynthesisEvidence): AdapterPlan {
  const envelope = z.object({ candidate: jsonValueSchema }).strict().parse(response);
  const candidate = record(envelope.candidate);
  if (!Array.isArray(candidate.response)) return parseSynthesisCandidate(response, evidence);
  const decoded = { ...candidate, response: candidate.response.map(step => {
    const operation = record(step);
    if (operation.op !== 'ConstructResponse' || !Array.isArray(operation.fields)) return step;
    const fields = z.array(z.object({ name: z.string(), binding: jsonValueSchema }).strict()).min(1).max(32).parse(operation.fields);
    if (new Set(fields.map(field => field.name)).size !== fields.length) throw new ModelRequestError('DUPLICATE_CONSTRUCTION_FIELD');
    return { ...operation, fields: Object.fromEntries(fields.map(field => [field.name, field.binding])) };
  }) };
  return parseSynthesisCandidate({ candidate: decoded }, evidence);
}

const instructions = `ContractRelay bounded structural extension v1.
The same trust and evidence rules apply. Literal JSON property names, including
hyphens, are data; internal call identifiers retain the identifier grammar.
WrapArray is {op:"WrapArray",source:<existing argument name>,target:<target argument name>,evidence}.
It moves that value into exactly one array element; it never maps or iterates.
ConstructResponse is {op:"ConstructResponse",fields,evidence}. Its provider wire
format uses fields=[{name,binding},...] and the host converts that list to a record.
Each binding is {kind:"input",path} for an ORIGINAL old input field,
{kind:"response",path} for a current native response field,
{kind:"constant",value} for a JSON scalar, or
{kind:"compareInteger",source:{kind:"input"|"response",path},operator:"eq"|"gt",value:<safe integer>}.
Comparison refuses non-integers and performs no coercion. Construction is flat,
at most 32 fields; no nested expressions, array maps, grouping, filtering, loops,
functions, code or dynamic paths. It replaces the entire logical response.
Use explicit Reject when fields or semantics cannot be recovered. An absent
outputSchema does not provide evidence for invented response paths.
Multi-target generation retains the existing calls/projection wire encoding.
These instructions add bounded operations; they do not relax gates.`;

/** Reuse the original evidence parser, prompt, scheduler and candidate validation. */
export class StructuralPlanSynthesizer {
  constructor(private readonly scheduler: Pick<QuotaScheduler, 'run'>, private readonly settings: StructuralSynthesisSettings) {}
  async synthesize(evidence: SynthesisEvidence): Promise<AdapterPlan> {
    const bridge: Pick<QuotaScheduler, 'run'> = { run: (job, parse, options) => this.scheduler.run({ ...job,
      request: { ...job.request, schema: createStructuralPlanResponseJsonSchema(evidence),
        prompt: job.request.prompt.replace('\n\nSYNTHESIS_DATA_JSON\n', `\n\n${instructions}\n\nSYNTHESIS_DATA_JSON\n`) }
    }, response => parse({ candidate: parseStructuralCandidate(response, evidence) }), options) };
    return new ScheduledPlanSynthesizer(bridge, this.settings).synthesize(evidence);
  }
}
