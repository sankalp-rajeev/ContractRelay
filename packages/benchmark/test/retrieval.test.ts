import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { loadBenchmarkCase, loadSuite } from '../src/suite.js';
import { createFixtureV2 } from '../src/fixtures-v2.js';

describe('versioned held-out retrieval oracle', () => {
  it('measures actual unique backend retrieval rather than trusting a wrapper count or fabricated result', async () => {
    const root = fileURLToPath(new URL('../../../benchmarks/', import.meta.url));
    const { suite } = await loadSuite(root);
    const entry = suite.cases.find((item) => item.id === '15-pagination-limit')!;
    const data = await loadBenchmarkCase(root, entry, join(root, '../runs/test-retrieval-unused-decision'));
    const fixture = createFixtureV2(data.fixture, data.evidence.newContracts);
    try {
      await expect(fixture.invoke('list_items', { limit: 99 })).rejects.toThrow('INVALID_TARGET_CALL');
      await fixture.invoke('list_items', { limit: 10 });
      await fixture.invoke('list_items', { limit: 10 });
      expect(await fixture.observe()).toMatchObject({ distinct_items_read: 10 });
      await fixture.reset(); expect(await fixture.observe()).toMatchObject({ distinct_items_read: 0 });
    } finally { fixture.close(); }
  });
});
