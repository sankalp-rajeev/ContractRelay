import type { JsonValue } from '@contractrelay/contracts';

/** Initial trace shape; runtime validation, redaction and replay are planned. */
export interface ToolTrace {
  traceId: string;
  tool: string;
  input: JsonValue;
  output: JsonValue;
  contractHash: string;
}
