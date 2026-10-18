import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InspectMigrationDocument } from '@/generated/graphql';
import { query } from '@/server/graphql';
import { MigrationInspection } from '@/components/inspection';

export default async function MigrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ trial?: string }>;
}) {
  const { id } = await params;
  const { trial } = await searchParams;
  const selectedTrial = trial === undefined ? 1 : Number(trial);
  if (!Number.isInteger(selectedTrial) || selectedTrial < 1) notFound();
  const { migration } = await query(InspectMigrationDocument, { id, trial: selectedTrial });
  if (!migration) notFound();
  return (
    <>
      {migration.availableTrials.length > 1 && (
        <nav className="trialNav" aria-label="Recorded trials">
          <span>Recorded trial</span>
          {migration.availableTrials.map((number) => (
            <Link
              key={number}
              href={`/migrations/${id}?trial=${number}`}
              aria-current={migration.trial === number ? 'page' : undefined}
            >
              {number}
            </Link>
          ))}
        </nav>
      )}
      <MigrationInspection migration={migration} />
    </>
  );
}
