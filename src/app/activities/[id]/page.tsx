import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';

import { getActivity, shipToStrava } from '../../../lib/ingest-store';
import { ApprovalView } from './approval-view';

export const dynamic = 'force-dynamic';
/** Strava processes an upload asynchronously; the action polls for it. */
export const maxDuration = 60;

export default async function ApprovalPage({
  params,
}: PageProps<'/activities/[id]'>) {
  const { id } = await params;
  const row = await getActivity(id);
  if (row === undefined) notFound();

  async function ship() {
    'use server';
    await shipToStrava(id);
    // The outcome -- id or error -- is on the row; re-render reads it back.
    revalidatePath(`/activities/${id}`);
  }

  return <ApprovalView row={row} ship={ship} />;
}
