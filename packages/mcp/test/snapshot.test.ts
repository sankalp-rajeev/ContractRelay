import { describe, expect, it, vi } from 'vitest';
import { snapshotTools } from '../src/index.js';

const tool = { name: 'lookup', description: 'Read an item', inputSchema: { type: 'object' },
  outputSchema: { type: 'object' }, annotations: { readOnlyHint: true, idempotentHint: true } };
const options = { namespace: 'test', source: 'fixture-server', version: 'v2' };

describe('MCP tools/list ingestion', () => {
  it('preserves contracts and provenance without trusting safety hints', async () => {
    const result = await snapshotTools({ listTools: async () => ({ tools: [tool] }) }, options);
    expect(result.tools[0]).toMatchObject({ contractId: 'test/lookup', name: 'lookup', version: 'v2',
      inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, sideEffect: 'UNKNOWN', idempotency: 'UNKNOWN',
      provenance: { kind: 'mcp-live-snapshot', source: 'fixture-server' } });
  });

  it('accepts explicit safety metadata and produces order-independent snapshot hashes', async () => {
    const next = { ...tool, name: 'other' };
    const metadata = { lookup: { sideEffect: 'READ_ONLY', idempotency: 'IDEMPOTENT' } } as const;
    const first = await snapshotTools({ listTools: async () => ({ tools: [tool, next] }) }, { ...options, metadata });
    const second = await snapshotTools({ listTools: async () => ({ tools: [next, tool] }) }, { ...options, metadata });
    expect(first.hash).toBe(second.hash);
    expect(first.tools[0]?.sideEffect).toBe('READ_ONLY');
  });

  it('follows pagination and rejects repeated cursors, duplicate names and endless listings', async () => {
    const listTools = vi.fn().mockResolvedValueOnce({ tools: [tool], nextCursor: 'next' })
      .mockResolvedValueOnce({ tools: [{ ...tool, name: 'second' }] });
    expect((await snapshotTools({ listTools }, options)).tools).toHaveLength(2);
    expect(listTools).toHaveBeenLastCalledWith({ cursor: 'next' });
    await expect(snapshotTools({ listTools: async () => ({ tools: [], nextCursor: 'same' }) }, options)).rejects.toThrow('Repeated');
    await expect(snapshotTools({ listTools: async () => ({ tools: [tool, tool] }) }, options)).rejects.toThrow('Duplicate');
    await expect(snapshotTools({ listTools: async () => ({ tools: [], nextCursor: 'next' }) }, { ...options, maxPages: 1 })).rejects.toThrow('page limit');
  });

  it('rejects malformed server definitions at the ingestion boundary', async () => {
    await expect(snapshotTools({ listTools: async () => ({ tools: [{ name: 'bad' }] }) }, options)).rejects.toThrow();
  });
});
