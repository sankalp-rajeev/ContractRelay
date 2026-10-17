import { z } from 'zod';
import { canonicalJson, jsonValueSchema } from '@contractrelay/contracts';
import type { JsonValue } from '@contractrelay/contracts';

export const toolTraceSchema = z.object({
  traceId: z.string().min(1), tool: z.string().min(1),
  input: jsonValueSchema, output: jsonValueSchema,
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  adapterPlanHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  policyVersion: z.string().optional(), targetTools: z.array(z.string()).optional(),
  operations: z.array(z.object({ phase: z.enum(['input', 'call', 'response']), op: z.string(), index: z.number().int().nonnegative(),
    tool: z.string().optional(), field: z.string().optional() }).strict()).optional()
}).strict();
export type ToolTrace = z.infer<typeof toolTraceSchema>;

export function parseTraceJsonl(text: string): ToolTrace[] {
  const ids = new Set<string>();
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    if (line.length > 1_000_000) throw new Error(`Trace line ${index + 1} exceeds limit`);
    let trace: ToolTrace;
    try { trace = toolTraceSchema.parse(JSON.parse(line)); }
    catch { throw new Error(`Invalid trace on line ${index + 1}`); }
    if (ids.has(trace.traceId)) throw new Error(`Duplicate trace ID on line ${index + 1}`);
    ids.add(trace.traceId);
    return [trace];
  });
}

export function serializeTraceJsonl(traces: readonly ToolTrace[]): string {
  return traces.map((trace) => `${canonicalJson(toolTraceSchema.parse(trace))}\n`).join('');
}

export const defaultRedactedKeys = ['authorization', 'api_key', 'apikey', 'token', 'password', 'secret'];

export function redactTrace(value: ToolTrace, sensitiveKeys: readonly string[] = defaultRedactedKeys): ToolTrace {
  const keys = new Set(sensitiveKeys.map((key) => key.toLowerCase()));
  const redact = (json: JsonValue): JsonValue => {
    if (Array.isArray(json)) return json.map(redact);
    if (json === null || typeof json !== 'object') return json;
    return Object.fromEntries(Object.entries(json).map(([key, entry]) => [key, keys.has(key.toLowerCase()) ? '[REDACTED]' : redact(entry)]));
  };
  const trace = toolTraceSchema.parse(value);
  return { ...trace, input: redact(trace.input), output: redact(trace.output) };
}
