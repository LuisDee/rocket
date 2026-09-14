import Link from 'next/link';

import { formatDuration, formatShortDate } from '../../lib/block';
import { cropDelta, type CropSummary } from '../../lib/crop';
import { listPending } from '../../lib/ingest-store';

// Reads the queue on every request. A cached list of things awaiting a decision
// is a list of decisions you already made.
export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  reviewed: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

export default async function ActivitiesPage() {
  const rows = await listPending();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Cropped</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Runs pulled from Garmin, pauses removed, waiting on you.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
          Nothing waiting. New runs appear here once the pipeline has cropped
          them.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map((row) => {
            const summary = row.cropSummary as CropSummary | null;
            const delta = summary ? cropDelta(summary) : null;
            return (
              <li key={row.garminActivityId}>
                <Link
                  href={`/activities/${row.garminActivityId}`}
                  className="block rounded-xl bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800 transition hover:bg-zinc-900 hover:ring-zinc-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-zinc-200">
                        {row.activityName ?? 'Run'}
                      </p>
                      <p className="font-mono text-xs text-zinc-500 tabular-nums">
                        {row.startedAt
                          ? formatShortDate(
                              row.startedAt.toISOString().slice(0, 10),
                            )
                          : '—'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm tabular-nums text-zinc-100">
                        {summary ? summary.distanceKmAfter.toFixed(2) : '—'}
                        <span className="ml-0.5 text-xs text-zinc-500">km</span>
                      </p>
                      {delta === null ? null : (
                        <p className="font-mono text-xs tabular-nums text-zinc-400">
                          {delta.elapsedSecondsRemoved > 0
                            ? `−${formatDuration(delta.elapsedSecondsRemoved)} paused`
                            : 'no pauses'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={[
                        'rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wider ring-1',
                        STATUS_STYLE[row.status] ??
                          'bg-zinc-800 text-zinc-400 ring-zinc-700',
                      ].join(' ')}
                    >
                      {row.status}
                    </span>
                    {delta?.distanceAnomaly ? (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] uppercase tracking-wider text-amber-300 ring-1 ring-amber-500/30">
                        distance moved
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
