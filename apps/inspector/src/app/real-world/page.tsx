import Link from 'next/link';
import { ResultsDocument } from '@/generated/graphql';
import { query } from '@/server/graphql';
import { Status } from '@/components/primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Public historical migrations' };
export default async function RealWorld() {
  const { realWorldResults: results } = await query(ResultsDocument, {});
  return (
    <div className="page">
      <div className="pageIntro">
        <p className="eyebrow">SEPARATE EXTERNAL-VALIDITY EVALUATION</p>
        <h1>
          Real histories.
          <br />
          <span className="quiet">Visible limitations.</span>
        </h1>
        <p className="lead">
          Exact public MCP revisions. Synthetic fixtures. Every outcome preserved.
        </p>
        <p className="introDetail">
          The old workflow passed on the old server and genuinely broke on the new server for each
          migration. This evaluation is separate from the frozen controlled benchmark.
        </p>
      </div>
      <div className="historicalList">
        {results.map((result) => (
          <article
            key={result.id}
            className={`historicalItem ${result.status === 'REJECTED' ? 'rejectedItem' : ''}`}
          >
            <div className="historicalHeading">
              <div>
                <p className="eyebrow">PUBLIC MCP / {result.id}</p>
                <h2>
                  <Link href={`/migrations/${result.id}`}>
                    {result.name} <span>↗</span>
                  </Link>
                </h2>
              </div>
              <Status value={result.status} />
            </div>
            <p className="changeDescription">{result.change}</p>
            <a className="repoLink mono" href={result.repository}>
              {result.repository.replace('https://github.com/', '')} ↗
            </a>
            <div className="revisionPair">
              <div>
                <small>OLD COMMIT</small>
                <a href={`${result.repository}/commit/${result.oldCommit}`}>
                  <code>{result.oldCommit}</code>
                </a>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <small>NEW COMMIT</small>
                <a href={`${result.repository}/commit/${result.newCommit}`}>
                  <code>{result.newCommit}</code>
                </a>
              </div>
            </div>
            <div className="historicalResults">
              <div>
                <small>OLD CLIENT → OLD SERVER</small>
                <Status value={result.oldOutcome} />
              </div>
              <div>
                <small>OLD CLIENT → NEW SERVER</small>
                <Status value={result.directOutcome} />
              </div>
              <div>
                <small>RECOVERY</small>
                <strong>
                  {result.recovered}/{result.trials}
                </strong>
              </div>
              <div>
                <small>SAFE REJECTION</small>
                <strong>
                  {result.safeRejections}/{result.trials}
                </strong>
              </div>
              <div>
                <small>HIDDEN FALSE COMPATIBLE</small>
                <strong>
                  {result.hiddenFalseCompatible}/{result.promoted} <span>promoted</span>
                </strong>
              </div>
            </div>
            {result.rejectionReason && (
              <div className="failureNotice">
                <span className="failureIcon" aria-hidden="true">
                  !
                </span>
                <div>
                  <strong>
                    {result.id === 'sqlew'
                      ? 'Unsupported union type in consolidated schema'
                      : result.status === 'INCONCLUSIVE' ? 'Synthesis failure' : 'Gate rejection'}
                  </strong>
                  <p>
                    {result.rejectionReason}.{' '}
                    {result.id === 'sqlew' &&
                      'The native union schema was retained. No compiler fix, schema narrowing, or replacement generation was performed.'}
                  </p>
                </div>
              </div>
            )}
            <details className="disclosure">
              <summary>Evaluation scope & upstream limitations</summary>
              <ul>
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
            <Link href={`/migrations/${result.id}`} className="inlineLink">
              Inspect contracts, adapter and gate →
            </Link>
          </article>
        ))}
      </div>
      <p className="provenance">
        Source: versioned historical summaries in data/historical-catalog.json and individual persisted trials. A 0/0
        false-compatible denominator means no adapter was promoted; it is not evidence of successful
        compatibility.
      </p>
    </div>
  );
}
