import { BLOCK, BLOCK_WEEKS, MEASURED_BASE } from '../../config/training';
import recentActivities from '../data/recent-activities.json';
import {
  currentWeek,
  daysToRace,
  formatDuration,
  formatPace,
  formatShortDate,
  plannedTotalKm,
} from '../lib/block';

type Activity = {
  date: string;
  type: string;
  distanceKm: number;
  movingSeconds: number;
  elapsedSeconds: number;
  name: string;
};

const RUN_TYPES = new Set([
  'running',
  'trail_running',
  'treadmill_running',
  'track_running',
]);

const PHASE_STYLE: Record<string, string> = {
  'race-taper': 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  rebuild: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  build: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  peak: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  taper: 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
  race: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

// Rendered per request rather than at build time: "days to race" is wrong the
// moment it is cached, and this page has no other reason to be static.
export const dynamic = 'force-dynamic';

export default function Home() {
  const today = new Date();
  const remaining = daysToRace(today);
  const thisWeek = currentWeek(today);
  const activities = recentActivities as Activity[];
  const runs = activities.filter((a) => RUN_TYPES.has(a.type)).slice(0, 8);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Goal race
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {BLOCK.goalRace}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {formatShortDate(BLOCK.goalRaceDate)}
        </p>

        <div className="mt-5 flex items-baseline gap-3 rounded-xl bg-zinc-900 px-4 py-3 ring-1 ring-zinc-800">
          <span className="font-mono text-4xl font-semibold tabular-nums text-sky-300">
            {remaining}
          </span>
          <span className="text-sm text-zinc-400">
            {remaining === 1 ? 'day to go' : 'days to go'}
          </span>
        </div>

        <p className="mt-3 text-sm text-zinc-400">
          Next up:{' '}
          <span className="text-zinc-200">
            {BLOCK.tuneUpRace}, {formatShortDate(BLOCK.tuneUpRaceDate)}
          </span>{' '}
          — same park, so it doubles as a course rehearsal and settles goal
          pace.
        </p>
      </header>

      <section className="mt-9">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            The block
          </h2>
          <p className="font-mono text-xs text-zinc-600 tabular-nums">
            {plannedTotalKm()} km planned
          </p>
        </div>

        {thisWeek === null && remaining > 0 ? (
          <p className="mt-3 rounded-xl bg-zinc-900/60 px-4 py-2.5 text-xs text-zinc-400 ring-1 ring-zinc-800">
            The block starts {formatShortDate(BLOCK.blockStart)}.
          </p>
        ) : null}

        <ol className="mt-3 space-y-2">
          {BLOCK_WEEKS.map((week) => {
            const isNow = thisWeek?.monday === week.monday;
            return (
              <li
                key={week.monday}
                className={[
                  'rounded-xl px-4 py-3 ring-1 transition',
                  isNow
                    ? 'bg-sky-500/10 ring-sky-500/40'
                    : 'bg-zinc-900/60 ring-zinc-800',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-zinc-500 tabular-nums">
                        W{week.week}
                      </span>
                      <span className="truncate text-sm text-zinc-300">
                        {formatShortDate(week.monday)}
                      </span>
                      {isNow ? (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-sky-300">
                          Now
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={[
                        'mt-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] uppercase tracking-wider ring-1',
                        PHASE_STYLE[week.phase] ??
                          'bg-zinc-800 text-zinc-400 ring-zinc-700',
                      ].join(' ')}
                    >
                      {week.phase}
                    </span>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-mono text-lg font-medium tabular-nums text-zinc-100">
                      {week.targetKm === null ? '—' : `${week.targetKm}`}
                      {week.targetKm === null ? null : (
                        <span className="ml-0.5 text-xs text-zinc-500">km</span>
                      )}
                    </p>
                    {week.longRunKm === null ? null : (
                      <p className="font-mono text-xs text-zinc-500 tabular-nums">
                        long {week.longRunKm} km
                      </p>
                    )}
                  </div>
                </div>

                {isNow ? (
                  <p className="mt-2 border-t border-sky-500/20 pt-2 text-xs leading-relaxed text-zinc-400">
                    {week.note}
                  </p>
                ) : null}

                {week.rampExemption === null ? null : (
                  <p className="mt-2 text-xs leading-relaxed text-amber-300/80">
                    Ramp exemption: {week.rampExemption}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-9">
        <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          Recent runs
        </h2>
        <ul className="mt-3 divide-y divide-zinc-800 rounded-xl bg-zinc-900/60 ring-1 ring-zinc-800">
          {runs.map((run) => {
            const pace =
              run.distanceKm > 0 ? run.movingSeconds / run.distanceKm : null;
            return (
              <li
                key={`${run.date}-${run.name}-${run.distanceKm}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{run.name}</p>
                  <p className="font-mono text-xs text-zinc-400 tabular-nums">
                    {formatShortDate(run.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <p className="text-sm text-zinc-100">
                    {run.distanceKm.toFixed(2)}
                    <span className="ml-0.5 text-xs text-zinc-500">km</span>
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatPace(pace)}/km · {formatDuration(run.movingSeconds)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 font-mono text-xs text-zinc-600">
          Base: {MEASURED_BASE.preTaperBaselineKm} km/wk before the holiday ·
          longest {MEASURED_BASE.longestRecentKm} km
        </p>
      </section>

      <footer className="mt-9 rounded-xl border border-dashed border-zinc-800 px-4 py-3">
        <p className="text-xs leading-relaxed text-zinc-500">
          <span className="text-zinc-400">Not live yet.</span> Runs are a
          snapshot taken on 2026-09-06, not a running sync — new activities will
          not appear here until the sync lands. No check-ins, no readiness, no
          automatic Strava upload.
        </p>
      </footer>
    </main>
  );
}
