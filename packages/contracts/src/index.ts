import { createHash } from 'node:crypto';
import { z } from 'zod';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(), z.boolean(), z.number().finite(), z.string(),
    z.array(jsonValueSchema), z.record(jsonValueSchema)
  ])
);

export const jsonSchemaSchema = z.union([z.boolean(), z.record(jsonValueSchema)]);
export type JsonSchema = z.infer<typeof jsonSchemaSchema>;

export const provenanceSchema = z.object({
  kind: z.enum([
    'mcp-live-snapshot', 'mcp-manifest', 'openapi', 'curated-fixture',
    'repository-version', 'benchmark-source', 'synthetic-mutation'
  ]),
  source: z.string().min(1),
  revision: z.string().optional()
}).strict();

export const toolContractSchema = z.object({
  contractId: z.string().min(1),
  version: z.string().optional(),
  provenance: provenanceSchema,
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: jsonSchemaSchema,
  outputSchema: jsonSchemaSchema.optional(),
  errorContract: jsonSchemaSchema.optional(),
  sideEffect: z.enum([
    'READ_ONLY', 'IDEMPOTENT_WRITE', 'REVERSIBLE_WRITE', 'IRREVERSIBLE_WRITE', 'UNKNOWN'
  ]),
  idempotency: z.enum(['IDEMPOTENT', 'NON_IDEMPOTENT', 'CONDITIONAL', 'UNKNOWN']),
  examples: z.array(z.object({
    input: jsonValueSchema,
    output: jsonValueSchema.optional()
  }).strict()).optional(),
  semanticAnnotations: z.array(z.object({
    key: z.string().min(1),
    value: jsonValueSchema,
    evidenceRef: z.string().min(1)
  }).strict()).optional()
}).strict();

export type ToolContract = z.infer<typeof toolContractSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;

/** Sorted object keys; array order is significant. Accept JSON data only. */
export function canonicalJson(value: unknown): string {
  jsonValueSchema.parse(value);
  return serialize(value as JsonValue);
}

function serialize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${serialize(value[key] as JsonValue)}`
  ).join(',')}}`;
}

export function hashJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function hashContract(value: unknown): string {
  return hashJson(toolContractSchema.parse(value));
}
