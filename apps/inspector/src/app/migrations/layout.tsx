import type { ReactNode } from 'react';
import { MigrationPicker } from '@/components/navigation';
import { CatalogDocument } from '@/generated/graphql';
import { query } from '@/server/graphql';
export const dynamic = 'force-dynamic';
export default async function MigrationLayout({ children }: { children: ReactNode }) {
  const data = await query(CatalogDocument, {});
  return (
    <div className="explorer">
      <MigrationPicker migrations={data.migrations} />
      <div className="inspection">{children}</div>
    </div>
  );
}
