'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { CatalogQuery } from '@/generated/graphql';

const links = [
  ['/', 'Overview', '◈'],
  ['/migrations/12-refund-workflow', 'Migration explorer', '⇄'],
  ['/real-world', 'Public migrations', '⌘'],
  ['/benchmarks', 'Controlled benchmark', '▥'],
  ['/methodology', 'Evidence boundary', '⊞'],
];
export function Navigation() {
  const pathname = usePathname();
  return (
    <nav className="navigation" aria-label="Main navigation">
      {links.map(([href, label, icon]) => {
        const active = href.includes('/migrations/')
          ? pathname.startsWith('/migrations')
          : pathname === href;
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
            <span aria-hidden="true">{icon}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
export function MigrationPicker({ migrations }: { migrations: CatalogQuery['migrations'] }) {
  const [filter, setFilter] = useState('');
  const pathname = usePathname();
  const filtered = migrations.filter((item) =>
    `${item.name} ${item.id} ${item.status}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <aside className="migrationPicker" aria-label="Migration selection">
      <div className="pickerHead">
        <span className="eyebrow">MIGRATIONS</span>
        <span className="count">{migrations.length}</span>
      </div>
      <label className="searchLabel" htmlFor="migration-search">
        Find a migration
      </label>
      <input
        id="migration-search"
        className="search"
        placeholder="Find a migration…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        type="search"
      />
      {(['HISTORICAL', 'CONTROLLED'] as const).map((category) => (
        <div key={category} className="pickerGroup">
          <h2>{category === 'HISTORICAL' ? 'PUBLIC HISTORICAL' : 'FROZEN CONTROLLED'}</h2>
          {filtered
            .filter((item) => item.category === category)
            .map((item) => (
              <Link
                key={item.id}
                href={`/migrations/${item.id}`}
                aria-current={pathname === `/migrations/${item.id}` ? 'page' : undefined}
              >
                <span
                  className={`tinyDot ${item.status === 'PROMOTED' ? 'positive' : 'negative'}`}
                  aria-hidden="true"
                />
                <span>
                  {item.name}
                  <small>
                    {item.status.toLowerCase()}
                    {item.heldOut ? ' · held out' : ''}
                  </small>
                </span>
              </Link>
            ))}
        </div>
      ))}
      {filtered.length === 0 && (
        <p className="empty">No migration matches “{filter}”. Try a tool name or rejected.</p>
      )}
    </aside>
  );
}
