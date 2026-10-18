import Link from 'next/link';
import { EvidenceBoundary, SectionTitle } from '@/components/primitives';
import { ResultsDocument } from '@/generated/graphql';
import { query } from '@/server/graphql';
export const dynamic = 'force-dynamic';

export default async function Overview() {
  const { benchmarkSummary: benchmark, realWorldResults } = await query(ResultsDocument, {});
  const sqlew = realWorldResults.find((item) => item.id === 'sqlew');
  return (
    <div className="page overview">
      <div className="pageIntro">
        <p className="eyebrow">COMPATIBILITY, WITH AN EVIDENCE TRAIL</p>
        <h1>
          Tools evolve.
          <br />
          <span className="quiet">The client stays.</span>
        </h1>
        <p className="lead">Evidence-gated compatibility runtime for evolving AI-agent tools.</p>
        <p className="introDetail">
          Inspect the adapter, the decision, and the result. Every status here comes from a
          completed run.
        </p>
        <div className="actions">
          <Link className="button primary" href="/migrations/12-refund-workflow">
            Inspect a migration <span>↗</span>
          </Link>
          <Link className="button" href="/real-world">
            View public migrations →
          </Link>
        </div>
      </div>
      <div className="architecture">
        <div className="architectureHeading">
          <span className="eyebrow">THE COMPATIBILITY PATH</span>
          <span className="mono muted">old interface → new implementation</span>
        </div>
        <div className="runtimeFlow">
          <div className="flowEndpoint">
            <span className="flowSymbol" aria-hidden="true">
              ⌘
            </span>
            <strong>Old agent / client</strong>
            <span className="mono">unchanged invocation</span>
            <div className="contractTag">Stable old contract</div>
          </div>
          <span className="flowArrow" aria-hidden="true">
            →
          </span>
          <div className="relayBox">
            <span className="eyebrow">CONTRACTRELAY</span>
            <strong>
              Adapt once.
              <br />
              Verify before promotion.
            </strong>
            <div className="relaySteps">
              <span>01 Synthesize</span>
              <span>02 Verify</span>
              <span>03 Promote / reject</span>
            </div>
          </div>
          <span className="flowArrow" aria-hidden="true">
            →
          </span>
          <div className="flowEndpoint">
            <span className="flowSymbol" aria-hidden="true">
              ⌗
            </span>
            <strong>Evolved MCP tool</strong>
            <span className="mono">new contract</span>
            <div className="contractTag">Deterministic execution</div>
          </div>
        </div>
        <div className="architectureFoot">
          <span className="tinyDot positive" />
          After promotion, the persisted adapter runs without recurring model calls.
        </div>
      </div>
      <div className="principles">
        <div>
          <span>01</span>
          <strong>Keep the client.</strong>
          <p>Preserve its logical tool interface.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Persist the translation.</strong>
          <p>A bounded, inspectable AdapterPlan.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Gate every promotion.</strong>
          <p>Reject when evidence is insufficient.</p>
        </div>
      </div>
      <SectionTitle
        title="Measured, with boundaries"
        aside={
          <Link className="inlineLink" href="/benchmarks">
            Inspect results →
          </Link>
        }
      />
      <div className="measurement">
        <p>
          <strong>{benchmark.records} final records</strong> across the frozen controlled benchmark.
          Strong LLM methods saturated the suite; ContractRelay matched measured correctness.
        </p>
        <p>
          <strong>{realWorldResults.length} public historical migrations</strong> evaluated
          separately against exact source revisions and synthetic fixtures.
        </p>
      </div>
      {sqlew && (
        <Link className="failureNotice" href="/migrations/sqlew">
          <span className="failureIcon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Rejection is part of the result.</strong>
            <p>
              sqlew: {sqlew.recovered}/{sqlew.trials} recovery, {sqlew.safeRejections}/
              {sqlew.trials} safe rejection. The compiler refused an unsupported union-type schema.
            </p>
          </div>
          <span aria-hidden="true">↗</span>
        </Link>
      )}
      <SectionTitle
        title="A decision before the final oracle"
        aside={
          <Link className="inlineLink" href="/methodology">
            Evidence boundary →
          </Link>
        }
      />
      <EvidenceBoundary />
    </div>
  );
}
