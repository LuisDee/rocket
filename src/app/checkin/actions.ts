'use server';

import { redirect } from 'next/navigation';

import { checkInFromForm, recordCheckIn } from '../../domain/checkin';
import { postgresStore } from '../../domain/store';
import { todayInLondon } from '../../lib/block';

/**
 * The form's write path is the MCP tool's write path: both end in
 * `recordCheckIn`. A second one would be a second set of defaults, and the two
 * drift the first time either is edited.
 *
 * Progressive-enhancement note: this is a plain `<form action>` with no client
 * JavaScript, so the result cannot come back through a hook. It rides home in
 * the query string, and the page renders only from a fixed set of bands -- a
 * query parameter is user input and is never echoed to the page as text.
 *
 * Parsing lives in `domain/checkin.checkInFromForm` so it can be tested without
 * writing a row into an append-only table.
 */
export async function submitCheckIn(form: FormData): Promise<void> {
  const { readiness } = await recordCheckIn(
    postgresStore(),
    checkInFromForm(form),
    todayInLondon(),
  );

  redirect(
    `/checkin?saved=${readiness.band}` +
      (readiness.qualityBlocked ? '&gated=1' : '') +
      (readiness.insufficientHistory ? '&provisional=1' : ''),
  );
}
