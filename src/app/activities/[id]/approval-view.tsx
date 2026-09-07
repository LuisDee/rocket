import Link from 'next/link';

import { formatDuration, formatShortDate } from '../../../lib/block';
import {
  cropDelta,
  fromInspectorReport,
  notableFindings,
  type CropSummary,
} from '../../../lib/crop';
import type { IngestRow } from '../../../lib/ingest-store';

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  high: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  low: 'bg-zinc-800 text-zinc-400 ring-zinc-700',
};

/** `+0.01` / `−0.30`, always signed so the direction is unmissable. */
function signed(value: number, digits: number): string {
  const sign = value < 0 ? '−' : '+';
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

function Row({
  label,
  before,
  after,
  highlight,
}: {
  label: string;
  before: string;
  after: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="shrink-0 font-mono text-sm tabular-nums">
        <span className="text-zinc-500 line-through">{before}</span>
        <span className="mx-2 text-zinc-600">&rarr;</span>
        <span className={highlight ? 'text-sky-300' : 'text-zinc-100'}>
          {after}
        </span>
      </span>
    </div>
  );
}

export function ApprovalView({
  row,
  ship,
}: {
  row: IngestRow;
  ship: () => Promise<void>;
}) {
  const summary = row.cropSummary as CropSummary | null;
  const delta = summary ? cropDelta(summary) : null;
  const findings = notableFindings(fromInspectorReport(row.forensicReport));

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header>
        <Link
          href="/activities"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          &larr; Cropped
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {row.activityName ?? 'Run'}
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-500 tabular-nums">
          {row.startedAt
            ? formatShortDate(row.startedAt.toISOString().slice(0, 10))
            : '—'}
          {row.croppedFilename ? ` · ${row.croppedFilename}` : ''}
        </p>
      </header>

      {summary === null ? (
        <p className="mt-6 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-500/30">
          No crop summary on this row.
          {row.error ? ` ${row.error}` : ''}
        </p>
      ) : (
        <>
          {summary.cropApplied ? null : (
            <p className="mt-6 rounded-xl bg-zinc-800/60 px-4 py-3 text-sm text-zinc-300 ring-1 ring-zinc-700">
              <span className="font-medium text-zinc-100">
                Nothing was changed.
              </span>{' '}
              This run had no timer pauses, so the file is byte-identical to
              what the watch recorded. Still fine to upload — just know the
              cropper did nothing.
            </p>
          )}

          <section className="mt-6">
            <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
              What changed
            </h2>
            <div className="mt-3 divide-y divide-zinc-800 rounded-xl bg-zinc-900/60 ring-1 ring-zinc-800">
              <Row
                label="Elapsed"
                before={formatDuration(summary.elapsedSecondsBefore)}
                after={formatDuration(summary.elapsedSecondsAfter)}
                highlight
              />
              <Row
                label="Moving"
                before={formatDuration(summary.movingSecondsBefore)}
                after={formatDuration(summary.movingSecondsAfter)}
              />
              <Row
                label="Distance"
                before={`${summary.distanceKmBefore.toFixed(2)} km`}
                after={`${summary.distanceKmAfter.toFixed(2)} km`}
              />
            </div>

            {delta === null ? null : (
              <p className="mt-2 font-mono text-xs tabular-nums text-zinc-500">
                {formatDuration(delta.elapsedSecondsRemoved)} of standing still
                removed · distance {signed(delta.distanceKmChanged, 2)} km
              </p>
            )}
          </section>

          {delta?.distanceAnomaly ? (
            <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200 ring-1 ring-amber-500/30">
              <span className="font-medium">Distance moved by</span>{' '}
              {signed(delta.distanceKmChanged, 2)} km. A crop removes time, not
              distance — standing still logs seconds and no metres. Something
              the watch recorded as movement was taken out. Worth opening the
              file before uploading it.
            </p>
          ) : null}

          {delta?.pauseAccountingMismatch ? (
            <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200 ring-1 ring-amber-500/30">
              The pauses listed below total{' '}
              {formatDuration(delta.pauseSecondsTotal)}, but{' '}
              {formatDuration(delta.elapsedSecondsRemoved)} came out. The list
              is not the whole story.
            </p>
          ) : null}

          {summary.pausesRemoved.length > 0 ? (
            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
                  Pauses removed
                </h2>
                <p className="font-mono text-xs tabular-nums text-zinc-600">
                  {summary.pausesRemoved.length} ·{' '}
                  {formatDuration(delta?.pauseSecondsTotal ?? 0)}
                </p>
              </div>
              <ul className="mt-3 divide-y divide-zinc-800 rounded-xl bg-zinc-900/60 ring-1 ring-zinc-800">
                {summary.pausesRemoved.map((pause) => (
                  <li
                    key={`${pause.startOffsetS}-${pause.durationS}`}
                    className="flex items-baseline justify-between gap-3 px-4 py-2 font-mono text-xs tabular-nums"
                  >
                    <span className="text-zinc-400">
                      at {formatDuration(pause.startOffsetS)}
                    </span>
                    <span className="text-zinc-200">
                      {formatDuration(pause.durationS)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          Forensics
        </h2>
        {findings.length === 0 ? (
          <p className="mt-3 rounded-xl bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400 ring-1 ring-zinc-800">
            Nothing flagged above info level. The inspector reports findings,
            not a pass mark — an empty list is an absence of complaints, not a
            guarantee.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {findings.map((f) => (
              <li
                key={`${f.check}-${f.severity}`}
                className="rounded-xl bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wider ring-1',
                      SEVERITY_STYLE[f.severity.toLowerCase()] ??
                        'bg-zinc-800 text-zinc-400 ring-zinc-700',
                    ].join(' ')}
                  >
                    {f.severity}
                  </span>
                  <span className="text-sm text-zinc-200">{f.check}</span>
                </div>
                {f.detail ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                    {f.detail}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 space-y-3">
        <a
          href={`/api/activities/${row.garminActivityId}/file`}
          className="block rounded-xl bg-sky-500 px-4 py-3.5 text-center text-sm font-medium text-zinc-950 transition hover:bg-sky-400"
        >
          Download cropped FIT
        </a>

        {row.status === 'shipped' ? (
          <p className="text-center text-xs text-emerald-300">
            On Strava
            {row.stravaActivityId ? (
              <>
                {' — '}
                <a
                  className="underline underline-offset-2"
                  href={`https://www.strava.com/activities/${row.stravaActivityId}`}
                >
                  activity {row.stravaActivityId}
                </a>
              </>
            ) : null}
            .
          </p>
        ) : row.status === 'shipping' ? (
          <p className="text-center text-xs text-sky-300">
            Uploading to Strava. Refresh in a moment.
          </p>
        ) : (
          <form action={ship}>
            <button
              type="submit"
              className="w-full rounded-xl bg-[#fc4c02] px-4 py-3.5 text-center text-sm font-medium text-white transition hover:brightness-110"
            >
              Ship to Strava
            </button>
          </form>
        )}

        {row.error ? (
          <p className="rounded-xl bg-rose-500/10 px-4 py-3 text-center text-xs leading-relaxed text-rose-300 ring-1 ring-rose-500/30">
            {row.error}
          </p>
        ) : null}

        <p className="text-center text-xs leading-relaxed text-zinc-500">
          Uploads the cropped file, not the original. Nothing is sent until you
          tap.
        </p>
      </section>
    </main>
  );
}
