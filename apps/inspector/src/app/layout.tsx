import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Navigation } from '@/components/navigation';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ContractRelay · Evidence inspector', template: '%s · ContractRelay' },
  description:
    'Inspect real adapters, gate decisions and completed evaluations for evolving AI-agent tools.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skipLink" href="#main">
          Skip to content
        </a>
        <div className="appShell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <span className="brandMark" aria-hidden="true">
                c<span>r</span>
              </span>
              <span>
                ContractRelay<small>EVIDENCE INSPECTOR</small>
              </span>
            </Link>
            <Navigation />
            <div className="sidebarBottom">
              <div className="localIndicator">
                <span className="tinyDot positive" />
                Read-only demo
              </div>
              <p>
                Completed artifacts.
                <br />
                No model calls.
              </p>
              <a href="https://github.com/sankalp-rajeev/ContractRelay">Source on GitHub ↗</a>
              <span className="version">v0.1.0 / presentation layer</span>
            </div>
          </aside>
          <div className="workspace">
            <header className="topbar">
              <span>
                ContractRelay <span className="slash">/</span> <strong>Inspection workspace</strong>
              </span>
              <span className="mode">
                <span className="tinyDot positive" />
                LOCAL ARTIFACTS
              </span>
            </header>
            <main id="main">{children}</main>
            <footer className="footer">
              Evidence before execution.<span>Persisted results · API-key-free</span>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
