import Link from 'next/link';
import { ResultsDocument } from '@/generated/graphql';
import { query } from '@/server/graphql';
import { Status } from '@/components/primitives';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Public historical migrations' };
const groups = [
  { kind: 'pre-extension external evaluation', title: 'Pre-extension external evaluation',
    detail: 'Historical workflows evaluated before the generic capability extension.' },
  { kind: 'post-fix regression', title: 'Post-fix regression',
    detail: 'Mapbox and Fabric retried after the generic capability changes. These are known migrations.' },
  { kind: 'previously unseen historical migration', title: 'Previously unseen frozen case',
    detail: 'The session-collab workflow and evidence were frozen before capability changes and evaluated last.' },
];
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
        {groups.map((group, index) => (
          <section className="historicalGroup" key={group.kind} aria-labelledby={`evaluation-group-${index}`}>
            <div className="sectionTitle"><h2 id={`evaluation-group-${index}`}>{group.title}</h2></div>
            <p className="sectionDescription">{group.detail}</p>
            {results.filter((result) => result.evaluationKind === group.kind).map((result) => (
              <article
                key={result.id}
                className={`historicalItem ${result.status === 'REJECTED' ? 'rejectedItem' : ''}`}
              >
                <div className="historicalHeading">
                  <div>
                    <p className="eyebrow">PUBLIC MCP / {result.id}</p>
                    <h3>
                      <Link href={`/migrations/${result.id}`}>
                        {result.name} <span>↗</span>
                      </Link>
                    </h3>
                  </div>
                  <Status value={result.status} />
                </div>
                <ul aria-label={`${result.id} recorded trial outcomes`}>
                  {result.trialOutcomes.map((outcome) => (
                    <li key={outcome.trial}>
                      <Link className="inlineLink" href={`/migrations/${result.id}?trial=${outcome.trial}`}>
                        Trial {outcome.trial}: {outcome.generationError ? 'Generation failure' : outcome.status === 'PROMOTED' ? 'Promoted' : outcome.safeRejection ? 'Safe rejection' : outcome.status}
                      </Link>
                      {outcome.generationError && <> ({outcome.generationError}; no safe rejection)</>}
                    </li>
                  ))}
                </ul>
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
                <details className="disclosure" open={result.evaluationKind === 'previously unseen historical migration'}>
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
          </section>
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
