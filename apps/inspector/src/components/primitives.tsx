import type { ReactNode } from 'react';
import type { Json } from '@/server/artifacts';

export function Status({ value }: { value: string }) {
  const tone = ['PROMOTED', 'PASS'].includes(value)
    ? 'positive'
    : ['REJECTED', 'FAIL', 'BREAKS'].includes(value)
      ? 'negative'
      : 'neutral';
  return (
    <span className={`status ${tone}`}>
      <span aria-hidden="true" className="statusDot" />
      {value}
    </span>
  );
}
export function SectionTitle({
  index,
  title,
  aside,
}: {
  index?: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="sectionTitle">
      <h2>
        {index && <span className="sectionIndex">{index}</span>}
        {title}
      </h2>
      {aside}
    </div>
  );
}
export function Code({
  value,
  label,
  compare,
  side,
}: {
  value: Json;
  label: string;
  compare?: Json;
  side?: 'old' | 'new';
}) {
  const text = JSON.stringify(value, null, 2);
  const other = new Set(
    compare === undefined
      ? []
      : JSON.stringify(compare, null, 2)
          .split('\n')
          .map((line) => line.trim()),
  );
  return (
    <div className="codePanel">
      <div className="codeHeader">
        <span>{label}</span>
        <span className="mono">JSON</span>
      </div>
      <pre tabIndex={0} aria-label={label}>
        <code>
          {text.split('\n').map((line, index) => (
            <span
              key={index}
              className={`codeLine ${compare !== undefined && !other.has(line.trim()) ? `diff-${side}` : ''}`}
            >
              <span aria-hidden="true" className="lineNumber">
                {index + 1}
              </span>
              <span>
                {line.split(/("(?:[^"\\]|\\.)*"(?=\s*:))/g).map((token, i) => (
                  <span key={i} className={/^".*"$/.test(token) ? 'jsonKey' : undefined}>
                    {token}
                  </span>
                ))}
              </span>
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
export function EvidenceBoundary() {
  return (
    <div className="boundary" aria-label="Evidence boundary">
      <div className="boundaryStages">
        <div>
          <small>01 / SYNTHESIS EVIDENCE</small>
          <strong>Candidate adapter</strong>
          <p>Propose a bounded plan.</p>
        </div>
        <span aria-hidden="true">→</span>
        <div>
          <small>02 / GATE EVIDENCE</small>
          <strong>Promote or reject</strong>
          <p>Verify before admission.</p>
        </div>
      </div>
      <div className="sealedLine">
        <span>SEALED BOUNDARY · DECISION COMMITTED FIRST</span>
      </div>
      <div className="boundaryFinal">
        <span aria-hidden="true">↳</span>
        <div>
          <small>03 / FINAL EVALUATION ORACLE</small>
          <strong>Measured result</strong>
          <p>Opened after the decision; never promotion evidence.</p>
        </div>
      </div>
    </div>
  );
}
export function object(value: Json | undefined): { [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function array(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}
export function string(value: Json | undefined) {
  return typeof value === 'string' ? value : '';
}
