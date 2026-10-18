import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactService, repositoryRoot } from '../src/server/artifacts';
import { executeRequest, query } from '../src/server/graphql';
import {
  CatalogDocument,
  InspectMigrationDocument,
  ResultsDocument,
} from '../src/generated/graphql';
import { VerificationView, TraceView } from '../src/components/inspection';
import { POST } from '../src/app/api/graphql/route';

const realRead = (path: string) => readFile(resolve(repositoryRoot, path), 'utf8');
const service = new ArtifactService(realRead);
describe('Read-only artifact GraphQL', () => {
  it('loads the full catalog and every completed controlled/historical detail', async () => {
    const { migrations } = await query(CatalogDocument, {}, service);
    expect(migrations).toHaveLength(18);
    expect(Object.getPrototypeOf(migrations[0])).toBe(Object.prototype);
    for (const entry of migrations) {
      const data = await query(InspectMigrationDocument, { id: entry.id }, service);
      expect(data.migration?.status).toBe(entry.status);
      expect(data.migration?.adapterHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });
  it('looks up recorded historical trials and returns null for unknown IDs/trials', async () => {
    const data = await query(InspectMigrationDocument, { id: 'nexus', trial: 3 }, service);
    expect(data.migration?.trial).toBe(3);
    expect(data.migration?.category).toBe('HISTORICAL');
    for (const [id, trial] of [
      ['../.env', 1],
      ['sqlew', 4],
      ['12-refund-workflow', 2],
    ] as const) {
      expect((await query(InspectMigrationDocument, { id, trial }, service)).migration).toBeNull();
    }
  });
  it('parses final published aggregates without recomputing benchmark scoring', async () => {
    const { benchmarkSummary } = await query(ResultsDocument, {}, service);
    expect(benchmarkSummary.records).toBe(195);
    expect(
      benchmarkSummary.methods.map((m) => [
        m.name,
        m.recovered,
        m.compatibleTrials,
        m.safeRejections,
        m.mustRejectTrials,
        m.hiddenFalseSuccess,
      ]),
    ).toEqual([
      ['B0', 33, 33, 12, 12, 0],
      ['B1', 9, 11, 4, 4, 0],
      ['B2', 33, 33, 12, 12, 0],
      ['B2-V', 33, 33, 12, 12, 0],
      ['B3', 33, 33, 12, 12, 0],
    ]);
  });
  it('preserves the historical failure and correct promoted denominators', async () => {
    const { realWorldResults } = await query(ResultsDocument, {}, service);
    expect(
      realWorldResults.map((m) => [m.id, m.recovered, m.safeRejections, m.promoted, m.trials]),
    ).toEqual([
      ['mindwtr', 3, 0, 3, 3],
      ['nexus', 3, 0, 3, 3],
      ['sqlew', 0, 3, 0, 3],
    ]);
    expect(realWorldResults.every((m) => m.directOutcome === 'BREAKS')).toBe(true);
  });
  it('keeps actual local refund calls distinct from frozen sealed observations', async () => {
    const { migration } = await query(
      InspectMigrationDocument,
      { id: '12-refund-workflow' },
      service,
    );
    if (!migration) throw new Error('Missing refund');
    const html = renderToStaticMarkup(<TraceView migration={migration} />);
    expect(html).toContain('Recorded local fixture replay');
    expect(html).toContain('Separate local fixture capture');
    expect(html).toContain('inspector-demo');
    expect(html).toContain('321');
    expect(html).toContain('ledger_count');
    expect(html).toContain('refund_payment');
  });
  it('shows rejected sqlew reports honestly in all three trials', async () => {
    for (const trial of [1, 2, 3]) {
      const { migration } = await query(InspectMigrationDocument, { id: 'sqlew', trial }, service);
      expect(migration?.status).toBe('REJECTED');
      expect(migration?.sealedPassed).toBeNull();
      if (!migration) throw new Error('Missing sqlew');
      const html = renderToStaticMarkup(
        <>
          <VerificationView migration={migration} />
          <TraceView migration={migration} />
        </>,
      );
      expect(html).toContain('REJECTED');
      expect(html).toContain('Unsupported union type');
      expect(html).toContain('No promoted execution');
      expect(html).toContain('NOT RUN');
      expect(html).not.toContain('>PASS<');
    }
  });
  it('reports missing artifacts without fabricating replacement results', async () => {
    const broken = new ArtifactService(async (path) => {
      if (path === 'benchmarks/results/final-v3.json')
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return realRead(path);
    });
    const result = await executeRequest(
      '{ benchmarkSummary { records } }',
      undefined,
      undefined,
      broken,
    );
    expect(result.errors?.[0].extensions.code).toBe('ARTIFACT_MISSING');
    expect(result.data).toBeNull();
  });
  it('rejects invalid JSON and structurally corrupt benchmark artifacts', async () => {
    for (const invalid of ['{broken', '{"final_model_results":true,"summary":{}}']) {
      const broken = new ArtifactService((path) =>
        path === 'benchmarks/results/final-v3.json' ? Promise.resolve(invalid) : realRead(path),
      );
      const result = await executeRequest(
        '{ benchmarkSummary { records } }',
        undefined,
        undefined,
        broken,
      );
      expect(result.errors?.[0].extensions.code).toBe('ARTIFACT_CORRUPT');
    }
  });
  it('detects edited presentation exports even if the JSON still validates', async () => {
    const broken = new ArtifactService(async (path) => {
      const data = await realRead(path);
      return path.endsWith('controlled/12-refund-workflow/candidate.json')
        ? data.replace('Resolves payment_id', 'CHANGED payment_id')
        : data;
    });
    const result = await executeRequest(
      '{ migration(id:"12-refund-workflow") { adapterPlan } }',
      undefined,
      undefined,
      broken,
    );
    expect(result.errors?.[0].extensions.code).toBe('ARTIFACT_CORRUPT');
    expect(result.data?.migration).toBeNull();
  });
  it('has no mutation/model capability and handles malformed HTTP requests', async () => {
    const mutation = await executeRequest('mutation { promote }', undefined, undefined, service);
    expect(mutation.errors?.length).toBeGreaterThan(0);
    for (const body of ['not-json', '{}']) {
      const response = await POST(
        new Request('http://localhost/api/graphql', { method: 'POST', body }),
      );
      expect(response.status).toBe(400);
    }
    const response = await POST(
      new Request('http://localhost/api/graphql', {
        method: 'POST',
        body: JSON.stringify({ query: '{ migration(id:"sqlew") { status } }' }),
      }),
    );
    expect(await response.json()).toEqual({ data: { migration: { status: 'REJECTED' } } });
  });
});
