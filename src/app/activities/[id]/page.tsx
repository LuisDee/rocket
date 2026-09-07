import { notFound } from 'next/navigation';

import { getActivity, markShipped } from '../../../lib/ingest-store';
import { ApprovalView } from './approval-view';

export const dynamic = 'force-dynamic';

export default async function ApprovalPage({
  params,
}: PageProps<'/activities/[id]'>) {
  const { id } = await params;
  const row = await getActivity(id);
  if (row === undefined) notFound();

  async function ship() {
    'use server';
    await markShipped(id, null);
  }

  return <ApprovalView row={row} ship={ship} />;
}
