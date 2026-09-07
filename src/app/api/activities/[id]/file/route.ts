/**
 * Serves the cropped FIT so Luis can upload it to Strava himself.
 *
 * A plain navigation with `Content-Disposition: attachment`, NOT an
 * `<a download>` in the page: in an installed iOS home-screen app there is no
 * download manager behind the `download` attribute and the tap silently does
 * nothing. Letting the server declare the disposition is the only thing that
 * reliably produces a file on iOS.
 *
 * This is the whole "ship" step now. Rocket does not upload to Strava -- see
 * docs/decisions.md, "Strava uploads are prohibited; the pipeline ends at the
 * preview" (2026-09-07).
 */

import { getActivity } from '../../../../../lib/ingest-store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/activities/[id]/file'>,
) {
  const { id } = await params;
  const row = await getActivity(id);

  if (row === undefined) {
    return Response.json({ error: 'no such activity' }, { status: 404 });
  }
  if (row.croppedFit === null) {
    return Response.json(
      { error: 'no cropped file on this activity' },
      { status: 409 },
    );
  }

  // The naming convention is <name>-<date>-<distance>.fit and it is the ingest
  // pipeline's job to have resolved it; fall back to the id rather than
  // inventing a name here.
  const filename = row.croppedFilename ?? `${row.garminActivityId}.fit`;

  return new Response(new Uint8Array(row.croppedFit), {
    headers: {
      'content-type': 'application/vnd.ant.fit',
      'content-disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'content-length': String(row.croppedFit.length),
      // A training file is not something to leave in a shared cache.
      'cache-control': 'private, no-store',
    },
  });
}
