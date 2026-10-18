import Link from 'next/link';
import { EvidenceBoundary, SectionTitle } from '@/components/primitives';
export const metadata = { title: 'Evidence boundary' };
export default function Methodology() {
  return (
    <div className="page methodology">
      <div className="pageIntro">
        <p className="eyebrow">EXPERIMENTAL BOUNDARIES</p>
        <h1>
          Evidence has a role.
          <br />
          <span className="quiet">And a boundary.</span>
        </h1>
        <p className="lead">A successful final observation cannot justify an earlier promotion.</p>
        <p className="introDetail">
          ContractRelay separates proposal, admission, and measurement. The inspector shows these
          completed artifacts without reopening the decision.
        </p>
      </div>
      <EvidenceBoundary />
      <div className="methodologyNotes">
        <section>
          <SectionTitle index="01" title="Synthesis proposes" />
          <p>
            Old and new contracts, documentation and synthesis evidence inform a candidate. The
            output is a bounded AdapterPlan, rather than executable model-generated code.
          </p>
        </section>
        <section>
          <SectionTitle index="02" title="The gate decides" />
          <p>
            Schema and policy checks, replay, independent predicates, and applicable state/effect
            checks determine promotion or rejection. Candidate and decision artifacts are committed
            before final evaluation evidence is opened.
          </p>
        </section>
        <section>
          <SectionTitle index="03" title="Sealed evidence measures" />
          <p>
            Independent final inputs and oracles measure the decided adapter. These results appear
            under execution observations; they are not part of the gate report.
          </p>
        </section>
      </div>
      <div className="interpretation">
        <span className="eyebrow">THE LIMIT OF THE CLAIM</span>
        <h2>
          Evidence-gated compatibility.
          <br />
          No general proof of equivalence.
        </h2>
        <p>
          Finite fixtures and predicates have finite coverage. The controlled suite and historical
          migrations support their measured outcomes, with their documented limitations.
        </p>
      </div>
      <Link className="inlineLink" href="/migrations/sqlew">
        See a migration that failed the gate →
      </Link>
    </div>
  );
}
