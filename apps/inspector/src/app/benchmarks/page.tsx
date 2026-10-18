import Link from 'next/link';
import { ResultsDocument } from '@/generated/graphql';
import { query } from '@/server/graphql';
import { SectionTitle } from '@/components/primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Controlled benchmark' };
export default async function Benchmarks() {
  const { benchmarkSummary: benchmark } = await query(ResultsDocument, {});
  return (
    <div className="page">
      <div className="pageIntro">
        <p className="eyebrow">FROZEN CONTROLLED EVALUATION</p>
        <h1>Correctness at the ceiling.</h1>
        <p className="lead">Strong LLM methods saturated the final benchmark.</p>
        <p className="introDetail">
          ContractRelay matched them on measured correctness, while producing a persistent
          deterministic compatibility artifact and zero recurring model calls after promotion.
        </p>
      </div>
      <div className="reportMeta">
        <span>
          <strong>{benchmark.records}</strong> completed records
        </span>
        <span>
          <code>{benchmark.model}</code>
        </span>
        <span>Three stochastic trials · B1 once per case</span>
      </div>
      <SectionTitle
        title="Final measured results"
        aside={<span className="subtleTag">READ FROM FINAL-V3.JSON</span>}
      />
      <div className="tableScroll">
        <table className="resultsTable">
          <caption className="srOnly">
            Final frozen controlled benchmark; compatible recovery and must-reject counts have
            separate denominators.
          </caption>
          <thead>
            <tr>
              <th scope="col">Method</th>
              <th scope="col">Compatible recovery</th>
              <th scope="col">Must-reject safely rejected</th>
              <th scope="col">Hidden false success</th>
            </tr>
          </thead>
          <tbody>
            {benchmark.methods.map((method) => (
              <tr key={method.id} className={method.id === 'b3' ? 'relayResult' : undefined}>
                <th scope="row">
                  <span className="methodName">{method.name}</span>
                  <small>
                    {
                      (
                        {
                          b0: 'Direct model tool use',
                          b1: 'Deterministic heuristics',
                          b2: 'Generated wrapper',
                          b2v: 'Same wrapper + verification',
                          b3: 'ContractRelay',
                        } as Record<string, string>
                      )[method.id]
                    }
                  </small>
                </th>
                <td>
                  {method.recovered}
                  <span> / {method.compatibleTrials}</span>
                </td>
                <td>
                  {method.safeRejections}
                  <span> / {method.mustRejectTrials}</span>
                </td>
                <td>{method.hiddenFalseSuccess}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="interpretation">
        <span className="eyebrow">WHAT THIS SUPPORTS</span>
        <h2>
          Matched correctness.
          <br />A different execution artifact.
        </h2>
        <p>
          These results provide no measured quality advantage for B3 over B0, B2 or B2-V. The
          practical distinction is the saved, bounded adapter: verified before promotion and
          executed deterministically afterward.
        </p>
      </div>
      <SectionTitle title="Scope & provenance" />
      <ul className="limitations">
        {benchmark.limitations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="hashRow stacked">
        <div>
          <small>SUITE SHA-256</small>
          <code>{benchmark.suiteHash}</code>
        </div>
        <div>
          <small>PROTOCOL SHA-256</small>
          <code>{benchmark.protocolHash}</code>
        </div>
      </div>
      <p className="provenance">
        Source: benchmarks/results/final-v3.json. Published aggregate counts are parsed as recorded;
        this interface does not rescore trials.
      </p>
      <Link className="inlineLink" href="/real-world">
        View the separate historical evaluation →
      </Link>
    </div>
  );
}
