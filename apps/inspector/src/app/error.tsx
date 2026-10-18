'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <p className="eyebrow">ARTIFACT UNAVAILABLE</p>
      <h1>Evidence could not be loaded.</h1>
      <p>
        Restore missing or corrupt versioned artifacts, then retry. No successful result has been
        substituted.
      </p>
      <button className="button" onClick={reset}>
        Retry loading
      </button>
    </div>
  );
}
