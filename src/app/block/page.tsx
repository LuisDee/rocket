import { BLOCK, BLOCK_WEEKS, MEASURED_BASE } from '../../../config/training';
import { blockTotals, weeklyActuals } from '../../lib/actuals';
import {
  currentWeek,
  daysToRace,
  formatShortDate,
  parseIsoDate,
  plannedTotalKm,
  todayInLondon,
} from '../../lib/block';
import { completedRuns } from '../../lib/dashboard';

export const dynamic = 'force-dynamic';

const PHASE_STYLE: Record<string, string> = {
  'race-taper': 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  rebuild: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  build: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  peak: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  taper: 'bg-blue-500/15 text-blue-300 ring-blue-500/30',
  race: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
};

export default async function Block() {
  const today = todayInLondon();
  const now = parseIsoDate(today);
  const thisWeek = currentWeek(now);

  const runs = await completedRuns(BLOCK.blockStart, today).catch(
    (): Awaited<ReturnType<typeof completedRuns>> => [],
  );
  const weeks = weeklyActuals(runs, today);
  const totals = blockTotals(weeks);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Goal race
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {BLOCK.goalRace}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {formatShortDate(BLOCK.goalRaceDate)} · {daysToRace(now)} days
        </p>
      </header>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            The block
          </h2>
          <p className="font-mono text-xs tabular-nums text-zinc-600">
            {plannedTotalKm()} km planned
          </p>
        </div>

        <ol className="mt-3 space-y-2">
          {BLOCK_WEEKS.map((week) => {
            const isNow = thisWeek?.monday === week.monday;
            const actual = weeks.find((w) => w.monday === week.monday);
            return (
              <li
                key={week.monday}
                className={[
                  'rounded-xl px-4 py-3 ring-1',
                  isNow
                    ? 'bg-sky-500/10 ring-sky-500/40'
                    : 'bg-zinc-900/60 ring-zinc-800',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs tabular-nums text-zinc-500">
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
                      {week.targetKm === null ? '—' : week.targetKm}
                      {week.targetKm === null ? null : (
                        <span className="ml-0.5 text-xs text-zinc-500">km</span>
                      )}
                    </p>
                    {week.longRunKm === null ? null : (
                      <p className="font-mono text-xs tabular-nums text-zinc-500">
                        long {week.longRunKm} km
                        {week.longRunOnRace ? ' · race' : ''}
                      </p>
                    )}
                    {actual && actual.actualKm > 0 ? (
                      <p className="font-mono text-xs tabular-nums text-emerald-300">
                        ran {actual.actualKm}
                      </p>
                    ) : null}
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

        {/* Zero over zero finished weeks is not "on plan", it is "not yet
            measured". Different claim, so different words. */}
        <div className="mt-3 rounded-xl bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800">
          {totals.weeksCounted === 0 ? (
            <p className="text-xs leading-relaxed text-zinc-500">
              No finished week yet, so there is nothing to total. The
              &ldquo;ran&rdquo; figures above are this week so far.
            </p>
          ) : (
            <p className="font-mono text-sm tabular-nums text-zinc-400">
              <span className="text-zinc-100">{totals.actualKm}</span> /{' '}
              {totals.plannedKm} km over {totals.weeksCounted} finished week
              {totals.weeksCounted === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <p className="mt-3 font-mono text-xs leading-relaxed text-zinc-600">
          Base: {MEASURED_BASE.preTaperBaselineKm} km/wk before the holiday ·
          longest {MEASURED_BASE.longestRecentKm} km
        </p>
      </section>
    </main>
  );
}
