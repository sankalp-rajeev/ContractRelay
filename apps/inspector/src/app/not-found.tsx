import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page">
      <p className="eyebrow">404 / NO RECORDED MIGRATION</p>
      <h1>Migration not found.</h1>
      <p>Choose an existing case and recorded trial from the explorer.</p>
      <Link className="button" href="/migrations/12-refund-workflow">
        Open migration explorer →
      </Link>
    </div>
  );
}
