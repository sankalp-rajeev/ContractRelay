import { describe, expect, it } from 'vitest';
import { parseTraceJsonl, redactTrace, serializeTraceJsonl } from '../src/index.js';

const trace = { traceId: 'one', tool: 'read', input: { token: 'private', nested: [{ password: 'secret', query: 'safe' }] },
  output: { Authorization: 'credential', result: 1 }, contractHash: 'a'.repeat(64) };

describe('canonical recorded traces', () => {
  it('round-trips JSONL and reports malformed and duplicate lines', () => {
    expect(parseTraceJsonl(serializeTraceJsonl([trace]))).toEqual([trace]);
    expect(() => parseTraceJsonl('{bad-json}')).toThrow('line 1');
    expect(() => parseTraceJsonl(serializeTraceJsonl([trace, trace]))).toThrow('Duplicate');
  });

  it('redacts nested credential keys without mutating the source', () => {
    const redacted = redactTrace(trace);
    expect(redacted.input).toEqual({ token: '[REDACTED]', nested: [{ password: '[REDACTED]', query: 'safe' }] });
    expect(redacted.output).toEqual({ Authorization: '[REDACTED]', result: 1 });
    expect(trace.input.token).toBe('private');
  });
});
