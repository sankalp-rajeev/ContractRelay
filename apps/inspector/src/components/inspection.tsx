import type { InspectMigrationQuery } from '@/generated/graphql';
import type { Json } from '@/server/artifacts';
import { Code, SectionTitle, Status, EvidenceBoundary, object, array, string } from './primitives';
import { CopyButton } from './copy-button';
type Migration = NonNullable<InspectMigrationQuery['migration']>;

function binding(value: Json | undefined): string {
  const v = object(value);
  if (v.kind === 'input') return `input.${string(v.path)}`;
  if (v.kind === 'result') return `${string(v.call)}.${string(v.path)}`;
  if (v.kind === 'constant') return JSON.stringify(v.value);
  if (v.kind === 'convert') return `${binding(v.source)} × ${v.scale ?? 1} → ${v.to}`;
  return JSON.stringify(value);
}

// Labels only: the UI never applies these operations to an invocation.
function stepLabel(step: { [key: string]: Json }): string {
  if (step.op === 'RenameTool' || step.op === 'RenameArg') return `${step.from} → ${step.to}`;
  if (step.op === 'ConvertType')
    return `${step.arg}${step.scale !== undefined ? ` × ${step.scale}` : ''} → ${step.to}`;
  if (step.op === 'AddConstantDefault') return `${step.arg} = ${JSON.stringify(step.value)}`;
  if (step.op === 'MapEnum') return `${step.arg ?? step.field}: ${JSON.stringify(step.mapping)}`;
  return JSON.stringify(step);
}
export function AdapterView({ migration }: { migration: Migration }) {
  const plan = object(migration.adapterPlan);
  const target = object(plan.target);
  const steps = array(plan.steps);
  const calls = array(target.calls);
  return (
    <section id="adapter" className="inspectionSection">
      <SectionTitle
        index="02"
        title="Adapter plan"
        aside={
            <span className="subtleTag">
              {migration.status === 'INCONCLUSIVE' ? 'NO VALID CANDIDATE' : plan.op === 'Reject' ? 'EXPLICIT REJECTION' : 'BOUNDED DSL'}
          </span>
        }
      />
      <div className="hashRow">
        <div>
          <small>ADAPTER SHA-256</small>
          <code>{migration.adapterHash}</code>
        </div>
        <CopyButton value={migration.adapterHash} />
      </div>
      {plan.op === 'Reject' ? (
        <div className="failureNotice">
          <div>
              <strong>{migration.status === 'INCONCLUSIVE' ? 'Synthesis failed before verification.' : 'Candidate explicitly rejects this migration.'}</strong>
            <p>{string(plan.reason)}</p>
            {migration.status === 'INCONCLUSIVE' && migration.verification.policyVersion === 'NOT RUN' && (
              <p>Generation failure; this trial is not a safe rejection.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="operations">
          {steps.map((step, i) => {
            const s = object(step);
            return (
              <div className="operation" key={i}>
                <span className="opIndex">{String(i + 1).padStart(2, '0')}</span>
                <strong>{string(s.op)}</strong>
                <code>{stepLabel(s)}</code>
              </div>
            );
          })}
          {calls.length > 0 && (
            <>
              <div className="operation">
                <span className="opIndex">↳</span>
                <strong>ComposeCalls</strong>
                <span>{calls.length} bounded calls · declared execution order</span>
              </div>
              <ol className="callSequence">
                {calls.map((call, i) => {
                  const c = object(call);
                  return (
                    <li key={i}>
                      <div className="callName">
                        <span>{i + 1}</span>
                        <code>{string(c.tool)}</code>
                      </div>
                      <dl>
                        {Object.entries(object(c.arguments)).map(([name, value]) => (
                          <div key={name}>
                            <dt>{name}</dt>
                            <dd>{binding(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
          {array(plan.response).map((response, i) => {
            const r = object(response);
            return (
              <div className="operation" key={`response-${i}`}>
                <span className="opIndex">←</span>
                <strong>{string(r.op)}</strong>
                <code>{JSON.stringify(r.mapping)}</code>
              </div>
            );
          })}
        </div>
      )}
      <details className="disclosure">
        <summary>Full persisted AdapterPlan</summary>
        <Code value={migration.adapterPlan} label="adapter.plan.json" />
      </details>
    </section>
  );
}
export function VerificationView({ migration }: { migration: Migration }) {
  const report = migration.verification;
  const levels = [
    ['V0', 'Schema & policy'],
    ['V1', 'Trace replay'],
    ['V2', 'Independent properties'],
    ['V3', 'State & effects'],
  ];
  return (
    <section id="verification" className="inspectionSection">
      <SectionTitle
        index="03"
        title="Verification gate"
        aside={<span className="subtleTag">PROMOTION EVIDENCE</span>}
      />
      <p className="sectionDescription">
        This report determines admission. Sealed evaluation observations do not participate in this
        decision.
      </p>
      <div className="gateTable">
        {levels.map(([level, label]) => {
          const checks = report.checks.filter((check) => check.level === level);
          const failed = checks.some((check) => !check.passed);
          const status = checks.length
            ? failed
              ? 'FAIL'
              : 'PASS'
            : report.verdict === 'PROMOTED'
              ? 'NOT REQUIRED'
              : 'NOT RUN';
          return (
            <div className="gateLevel" key={level}>
              <div>
                <code>{level}</code>
                <strong>{label}</strong>
                <Status value={status} />
              </div>
              {checks.length > 0 && (
                <ul>
                  {checks.map((check) => (
                    <li key={check.id}>
                      <span
                        className={check.passed ? 'checkPass' : 'checkFail'}
                        aria-label={check.passed ? 'Pass' : 'Fail'}
                      >
                        {check.passed ? '✓' : '×'}
                      </span>
                      {check.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        <div className="gateDecision">
          <strong>Promotion decision</strong>
          <Status value={report.verdict} />
        </div>
      </div>
      {migration.id === 'sqlew' && (
        <div className="failureNotice">
          <span className="failureIcon" aria-hidden="true">
            !
          </span>
          <div>
            <strong>Unsupported union type in the consolidated schema.</strong>
            <p>
              The native <code>{'value.type: ["string", "number"]'}</code> is refused by the
              compiler’s strictTypes setting. All three trials were rejected before promoted
              execution. The schema and core compiler were preserved.
            </p>
            <a
              className="inlineLink"
              href="https://github.com/sankalp-rajeev/ContractRelay/blob/main/benchmarks/realworld-v1/DEFECTS.md"
            >
              Read the recorded defect ↗
            </a>
          </div>
        </div>
      )}
      <div className="metadataRow">
        <span>
          Policy <code>{report.policyVersion}</code>
        </span>
        <span>
          Gate traces{' '}
          <strong>
            {report.tracesPassed}/{report.tracesTotal}
          </strong>
        </span>
      </div>
      {report.residualRisks.length > 0 && (
        <ul>
          {report.residualRisks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      )}
      <details className="disclosure">
        <summary>Full gate report & evidence hash</summary>
        <Code value={report.raw} label="gate-report.json" />
      </details>
    </section>
  );
}
export function TraceView({ migration }: { migration: Migration }) {
  const trace = object(migration.executionTrace);
  const observations = array(trace.observations);
  const first = object(observations[0]);
  const task = object(array(trace.tasks)[0]);
  const plan = object(migration.adapterPlan);
  const old = object(migration.oldContract);
  const input = first.input ?? task.input;
  const calls = array(object(plan.target).calls);
  const capture = object(trace.demoCapture);
  return (
    <section id="trace" className="inspectionSection">
      <SectionTitle
        index="04"
        title="Execution observations"
        aside={<span className="subtleTag">SEALED · AFTER DECISION</span>}
      />
      {migration.status !== 'PROMOTED' ? (
        <div className="blockedTrace">
          <span aria-hidden="true">⊘</span>
          <strong>No promoted execution</strong>
          <p>{migration.status === 'INCONCLUSIVE' ? 'No valid candidate reached the gate. No compatibility execution was attempted.' : 'The gate rejected this candidate. No successful compatibility trace is substituted.'}</p>
        </div>
      ) : (
        <>
          <div className="traceHeading">
            <span>Persisted final evaluation</span>
            <Status value={migration.sealedPassed ? 'PASS' : 'FAIL'} />
          </div>
          {input !== undefined && (
            <Code
              value={{ tool: old.name ?? plan.source_tool ?? '', arguments: input }}
              label="Unchanged old invocation"
            />
          )}
          <div className="tracePath">
            <span className="eyebrow">PERSISTED PLAN · DECLARED BACKEND PATH</span>
            <div>
              {calls.length ? (
                calls.map((call, i) => (
                  <span key={i}>
                    <code>{string(object(call).tool)}</code>
                    {i < calls.length - 1 && <b aria-hidden="true">→</b>}
                  </span>
                ))
              ) : (
                <code>{string(object(plan.target).tool)}</code>
              )}
            </div>
            <p>
              Intermediate backend calls and per-step timings were not recorded. This path describes
              the saved plan, rather than a new execution.
            </p>
          </div>
          <div className="contractColumns">
            {first.output !== undefined && (
              <Code value={first.output} label="Recorded old-interface output" />
            )}
            {first.state !== undefined && (
              <Code value={first.state} label="Recorded final state & side effects" />
            )}
          </div>
          <details className="disclosure">
            <summary>All persisted sealed observations ({observations.length})</summary>
            <Code
              value={{ tasks: trace.tasks ?? null, observations }}
              label="Sealed execution observations"
            />
          </details>
          {capture.kind === 'separate-api-free-local-mcp-fixture-capture' && (
            <div className="fixtureCapture">
              <div className="sectionTitle">
                <h3>Recorded local fixture replay</h3>
                <span className="subtleTag">SEPARATE DEMO · SAME PLAN HASH</span>
              </div>
              <p className="sectionDescription">
                Actual MCP backend calls captured through the existing proxy and promoted runtime.
                This API-free demonstration is separate from frozen benchmark measurements. No
                per-step timings were measured.
              </p>
              <Code
                value={capture.old_invocation ?? null}
                label="Recorded demo · unchanged old invocation"
              />
              <ol className="recordedCalls">
                {array(capture.backend_calls)
                  .filter((call) => object(call).invocation === 1)
                  .map((call, index) => {
                    const c = object(call);
                    const invocation = object(c.call);
                    const response = object(c.response);
                    return (
                      <li key={index}>
                        <div className="recordedCallHeading">
                          <span className="opIndex">{index + 1}</span>
                          <strong className="mono">{string(invocation.name)}</strong>
                          <span className="subtleTag">RECORDED RESPONSE</span>
                        </div>
                        <Code
                          value={{
                            arguments: invocation.arguments ?? null,
                            output: response.structuredContent ?? response.content ?? null,
                          }}
                          label={`Backend call ${index + 1}`}
                        />
                      </li>
                    );
                  })}
              </ol>
              <div className="contractColumns">
                <Code
                  value={capture.first_output ?? null}
                  label="Recorded demo · old-interface output"
                />
                <Code
                  value={capture.final_state ?? null}
                  label="After invocation & identical retry · final state"
                />
              </div>
              <details className="disclosure">
                <summary>Full demo capture, including retry calls</summary>
                <Code value={capture} label="Separate local fixture capture" />
              </details>
            </div>
          )}
        </>
      )}
    </section>
  );
}
export function MigrationInspection({ migration }: { migration: Migration }) {
  return (
    <>
      <div className="inspectionHeader">
        <p className="eyebrow">
          {migration.category === 'HISTORICAL'
            ? 'PUBLIC HISTORICAL MIGRATION'
            : 'FROZEN CONTROLLED BENCHMARK'}{' '}
          / TRIAL {migration.trial}
        </p>
        <div className="titleRow">
          <h1>{migration.name}</h1>
          <Status value={migration.status} />
        </div>
        <p className="lead smallLead">{migration.change.replaceAll('-', ' ')}</p>
        <div className="metadataRow">
          <span>
            Model <code>{migration.model}</code>
          </span>
          <span>
            Prompt <code>{migration.promptVersion ?? 'Not recorded'}</code>
          </span>
          {migration.heldOut && <span className="subtleTag">HELD OUT</span>}
        </div>
        <p className="provenance">{migration.provenance}</p>
      </div>
      <nav className="sectionNav" aria-label="Inspection sections">
        <a href="#contracts">01 Contracts</a>
        <a href="#adapter">02 Adapter</a>
        <a href="#verification">03 Verification</a>
        <a href="#trace">04 Trace</a>
      </nav>
      <section id="contracts" className="inspectionSection">
        <SectionTitle
          index="01"
          title="Contract changes"
          aside={
            <span className="diffLegend">
              <span>− Old</span>
              <span>+ New</span>
            </span>
          }
        />
        <p className="sectionDescription">
          Actual contract snapshots. Highlighted lines differ between versions; formatting
          differences are not semantic judgments.
        </p>
        <div className="contractColumns">
          <Code
            value={migration.oldContract}
            compare={migration.newContract}
            side="old"
            label="Old · stable client contract"
          />
          <Code
            value={migration.newContract}
            compare={migration.oldContract}
            side="new"
            label="New · evolved backend contract"
          />
        </div>
      </section>
      <AdapterView migration={migration} />
      <VerificationView migration={migration} />
      <TraceView migration={migration} />
      <section className="inspectionSection">
        <SectionTitle title="Evidence provenance" />
        <EvidenceBoundary />
        <details className="disclosure" open={migration.id === 'session-collab-v3'}>
          <summary>Source artifact & scope limitations</summary>
          <p className="sourcePath mono">{migration.artifactSource}</p>
          <ul>
            {migration.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      </section>
    </>
  );
}
