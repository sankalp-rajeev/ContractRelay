export default function Loading() {
  return (
    <div className="page" role="status">
      <p className="eyebrow">READING LOCAL ARTIFACTS</p>
      <h1>Loading evidence…</h1>
      <div className="loadingBar" />
      <p>No model execution is needed.</p>
    </div>
  );
}
