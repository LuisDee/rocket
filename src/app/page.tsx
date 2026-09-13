import Link from 'next/link';

import { BLOCK, RACES } from '../../config/training';
import { derivePaces } from '../domain/paces';
import { planWeek } from '../domain/planner/placement';
import { describeWeek } from '../domain/planner/prescribe';
import { scoreReadiness } from '../domain/readiness';
import { postgresStore } from '../domain/store';
import { blockTotals, weekEnd, weeklyActuals } from '../lib/actuals';
import {
  currentWeek,
  daysToRace,
  formatDuration,
  formatPace,
  formatShortDate,
  parseIsoDate,
  shiftIsoDate,
  todayInLondon,
} from '../lib/block';
import { completedRuns, pendingCount, recentRuns } from '../lib/dashboard';

// Days-to-race is wrong the moment it is cached, and every figure here is
// relative to today.
export const dynamic = 'force-dynamic';

const KIND_STYLE: Record<string, string> = {
  easy: 'bg-zinc-800 text-zinc-300 ring-zinc-700',
  quality: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  long: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  race: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  swim: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  rest: 'bg-zinc-900 text-zinc-500 ring-zinc-800',
};

const BAND_STYLE: Record<string, string> = {
  green: 'text-emerald-300',
  amber: 'text-amber-300',
  red: 'text-rose-300',
};

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function Today() {
  const today = todayInLondon();
  const now = parseIsoDate(today);
  const yesterday = shiftIsoDate(today, -1);
  const week = currentWeek(now);

  const store = postgresStore();

  // Every read is independent; one slow query should not serialise the page.
  const [checkIn, historyDays, runs, recent, pending] = await Promise.all([
    store.latestCheckIn().catch(() => null),
    store.activityHistoryDays(today).catch(() => 0),
    completedRuns(BLOCK.blockStart, today).catch(
      (): Awaited<ReturnType<typeof completedRuns>> => [],
    ),
    recentRuns(6).catch((): Awaited<ReturnType<typeof recentRuns>> => []),
    pendingCount().catch(() => 0),
  ]);

  const plan = week === null ? null : planWeek(week);
  // Placement decides which day and how far; description decides what the
  // session IS. Until 2026-09-12 the screen showed only the first half of that,
  // so a "quality" day arrived as a bare word with a distance beside it.
  const described =
    week === null || plan === null ? [] : describeWeek(week, plan.sessions);
  const paces = derivePaces();
  const todaySession = described.find((s) => s.date === today) ?? null;
  const todayPace =
    todaySession && todaySession.zone !== 'rest' && todaySession.zone !== 'race'
      ? paces[todaySession.zone]
      : null;
  const yesterdaySession =
    plan?.sessions.find((s) => s.date === yesterday) ?? null;
  const yesterdayActual = runs
    .filter((r) => r.date === yesterday)
    .reduce((sum, r) => sum + r.km, 0);

  const checkedInToday = checkIn?.localDate === today;
  const readiness =
    checkIn === null
      ? null
      : scoreReadiness(
          {
            rpeYesterday: checkIn.rpeYesterday,
            soreness: checkIn.soreness,
            sleep: checkIn.sleep,
            motivation: checkIn.motivation,
          },
          historyDays,
        );

  const weeks = weeklyActuals(runs, today);
  const totals = blockTotals(weeks);
  const thisWeekActual = weeks.find((w) => w.monday === week?.monday) ?? null;

  const nextRace = RACES.filter(
    (r) => r.role !== 'dropped' && r.date >= today,
  ).sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            {new Date(now).toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            Today
          </h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-2xl font-semibold tabular-nums text-sky-300">
            {daysToRace(now)}
          </p>
          <p className="text-[11px] text-zinc-500">days to race</p>
        </div>
      </header>

      {/* ---------------------------------------------------- today's work --- */}

      <section className="mt-5">
        {todaySession === null ? (
          <div className="rounded-xl bg-zinc-900/60 px-4 py-4 ring-1 ring-zinc-800">
            <p className="text-sm text-zinc-400">
              {week === null
                ? `Outside the block. It starts ${formatShortDate(BLOCK.blockStart)}.`
                : 'No session placed for today.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-zinc-900 px-4 py-4 ring-1 ring-zinc-800">
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={[
                  'rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ring-1',
                  KIND_STYLE[todaySession.kind] ??
                    'bg-zinc-800 text-zinc-300 ring-zinc-700',
                ].join(' ')}
              >
                {todaySession.zone === 'rest'
                  ? todaySession.kind
                  : todaySession.zone}
              </span>
              <p className="font-mono text-3xl font-semibold tabular-nums text-zinc-50">
                {todaySession.km > 0 ? todaySession.km : '—'}
                {todaySession.km > 0 ? (
                  <span className="ml-1 text-sm font-normal text-zinc-500">
                    km
                  </span>
                ) : null}
              </p>
            </div>
            {todayPace ? (
              <p className="mt-2 font-mono text-sm text-sky-300">
                {formatPace(todayPace.fastSecPerKm)}&ndash;
                {formatPace(todayPace.slowSecPerKm)}/km
                <span className="ml-2 text-zinc-500">
                  HR{' '}
                  {todayPace.hr.low === null
                    ? ''
                    : `${String(todayPace.hr.low)}\u2013`}
                  {todayPace.hr.high}
                  {todayPace.hrGoverns ? ' (heart rate governs)' : ''}
                </span>
              </p>
            ) : null}
            <p className="mt-2.5 border-t border-zinc-800 pt-2.5 text-sm leading-relaxed text-zinc-300">
              {todaySession.what}
            </p>
            {todaySession.why ? (
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                {todaySession.why}
              </p>
            ) : null}
            {todaySession.gym ? (
              <p className="mt-2.5 border-t border-zinc-800 pt-2.5 text-sm leading-relaxed text-amber-300">
                Gym: {todaySession.gym}
              </p>
            ) : null}
            {todaySession.note ? (
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {todaySession.note}
              </p>
            ) : null}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- readiness --- */}

      <section className="mt-3">
        {!checkedInToday ? (
          <Link
            href="/checkin"
            className="flex items-center justify-between rounded-xl bg-sky-500/10 px-4 py-3.5 text-sm font-medium text-sky-300 ring-1 ring-sky-500/30 active:bg-sky-500/20"
          >
            <span>
              {checkIn === null
                ? 'Check in — 30 seconds'
                : 'Check in for today'}
            </span>
            <span aria-hidden>&rarr;</span>
          </Link>
        ) : readiness === null ? null : (
          <div className="rounded-xl bg-zinc-900/60 px-4 py-3.5 ring-1 ring-zinc-800">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-zinc-400">Readiness</p>
              <p
                className={[
                  'font-mono text-lg font-semibold uppercase tracking-wide',
                  BAND_STYLE[readiness.band] ?? 'text-zinc-300',
                ].join(' ')}
              >
                {readiness.band}
              </p>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              {readiness.rationale}
            </p>
            {readiness.qualityBlocked ? (
              <p className="mt-2 text-sm text-rose-300">
                Quality work is gated today.
              </p>
            ) : null}
            {/* REDLINES rule 4: a verdict on thin data states its own
                insufficiency. Never let an amber read as authoritative. */}
            {readiness.caveat ? (
              <p className="mt-2 border-t border-zinc-800 pt-2 text-xs leading-relaxed text-amber-300/80">
                {readiness.caveat}
              </p>
            ) : null}
            <p className="mt-2 font-mono text-[11px] text-zinc-600">
              from {readiness.termsUsed.join(', ')}
            </p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- yesterday --- */}

      <section className="mt-3">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800">
          <p className="text-sm text-zinc-400">Yesterday</p>
          <p className="font-mono text-sm tabular-nums">
            <span className="text-zinc-100">
              {yesterdayActual > 0 ? yesterdayActual.toFixed(2) : '0'}
            </span>
            <span className="text-zinc-500">
              {' '}
              / {yesterdaySession ? yesterdaySession.km : 0} km
            </span>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- this week --- */}

      {plan === null || week === null ? null : (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
              This week
            </h2>
            <p className="font-mono text-xs tabular-nums text-zinc-500">
              <span className="text-zinc-300">
                {thisWeekActual?.actualKm ?? 0}
              </span>{' '}
              / {week.targetKm ?? '—'} km
            </p>
          </div>

          <ol className="mt-3 space-y-1.5">
            {plan.sessions.map((s) => {
              const isToday = s.date === today;
              const actual = runs
                .filter((r) => r.date === s.date)
                .reduce((sum, r) => sum + r.km, 0);
              const dow = DAY[(parseIsoDate(s.date).getDay() + 6) % 7];
              return (
                <li
                  key={s.date}
                  className={[
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1',
                    isToday
                      ? 'bg-sky-500/10 ring-sky-500/40'
                      : 'bg-zinc-900/40 ring-zinc-800/70',
                  ].join(' ')}
                >
                  <span className="w-8 shrink-0 font-mono text-xs text-zinc-500">
                    {dow}
                  </span>
                  <span
                    className={[
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1',
                      KIND_STYLE[s.kind] ??
                        'bg-zinc-800 text-zinc-300 ring-zinc-700',
                    ].join(' ')}
                  >
                    {s.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                    {s.note ?? ''}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {actual > 0 ? (
                      <span className="text-emerald-300">
                        {actual.toFixed(1)}
                      </span>
                    ) : null}
                    {actual > 0 ? (
                      <span className="text-zinc-600">/</span>
                    ) : null}
                    <span
                      className={actual > 0 ? 'text-zinc-500' : 'text-zinc-200'}
                    >
                      {s.km > 0 ? s.km : '—'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          {/* The planner reports what it could not fit rather than quietly
              emitting a smaller week. Showing it is the point. */}
          {plan.shortfallKm > 0 ? (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300/90 ring-1 ring-amber-500/25">
              {plan.shortfallKm} km could not be placed in the available slots.
            </p>
          ) : null}
          {plan.notes.map((note) => (
            <p
              key={note}
              className="mt-2 text-xs leading-relaxed text-zinc-500"
            >
              {note}
            </p>
          ))}
        </section>
      )}

      {/* ---------------------------------------------- planned vs actual --- */}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Planned vs actual
          </h2>
          {totals.weeksCounted === 0 ? null : (
            <p className="font-mono text-xs tabular-nums text-zinc-600">
              {totals.weeksCounted} week{totals.weeksCounted === 1 ? '' : 's'}{' '}
              in
            </p>
          )}
        </div>

        {/* Before any week has finished the totals are all zero, and a green
            "0 km" delta reads as "on plan" when nothing has been measured at
            all. Say which it is rather than letting a zero speak for both. */}
        {totals.weeksCounted === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-xs leading-relaxed text-zinc-500">
            No finished week to compare yet. Week {weeks[0]?.week ?? 1} closes{' '}
            {formatShortDate(weekEnd(weeks[0]?.monday ?? BLOCK.blockStart))} —
            the running total starts then. This week so far is above.
          </p>
        ) : (
          <div className="mt-3 flex items-baseline justify-between rounded-xl bg-zinc-900/60 px-4 py-3 ring-1 ring-zinc-800">
            <p className="font-mono text-sm tabular-nums text-zinc-400">
              <span className="text-zinc-100">{totals.actualKm}</span> /{' '}
              {totals.plannedKm} km
            </p>
            <p
              className={[
                'font-mono text-sm tabular-nums',
                totals.deltaKm < 0 ? 'text-amber-300' : 'text-emerald-300',
              ].join(' ')}
            >
              {totals.deltaKm > 0 ? '+' : ''}
              {totals.deltaKm} km
            </p>
          </div>
        )}

        <ol className="mt-2 space-y-1">
          {weeks
            .filter((w) => w.plannedKm !== null)
            .map((w) => {
              const pct =
                w.plannedKm && w.plannedKm > 0
                  ? Math.min(100, (w.actualKm / w.plannedKm) * 100)
                  : 0;
              return (
                <li key={w.monday} className="flex items-center gap-3">
                  <span className="w-7 shrink-0 font-mono text-[11px] text-zinc-600">
                    W{w.week}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <span
                      className={[
                        'block h-full rounded-full',
                        w.complete && pct < 90
                          ? 'bg-amber-400/70'
                          : 'bg-sky-400/70',
                      ].join(' ')}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-500">
                    <span className="text-zinc-300">{w.actualKm}</span>/
                    {w.plannedKm}
                  </span>
                </li>
              );
            })}
        </ol>
      </section>

      {/* ------------------------------------------------ fitness/fatigue --- */}

      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          Fitness and fatigue
        </h2>
        {/* No curve until there is a series. An empty chart frame implies the
            data is zero rather than absent, which is a different claim. */}
        <p className="mt-3 rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          No series yet. Garmin was linked to intervals.icu on 7 September and
          the backfill has not run, so there is nothing to plot — not a flat
          line, an absence.
        </p>
      </section>

      {/* ------------------------------------------------------ recent runs -- */}

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Recent runs
          </h2>
          {pending > 0 ? (
            <Link
              href="/activities"
              className="-my-3.5 inline-block py-3.5 font-mono text-xs text-sky-300 underline-offset-4 hover:underline"
            >
              {pending} to review &rarr;
            </Link>
          ) : null}
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-xs text-zinc-500">
            Nothing ingested yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800 rounded-xl bg-zinc-900/60 ring-1 ring-zinc-800">
            {recent.map((r) => (
              <li
                key={`${r.date}-${r.name}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{r.name}</p>
                  <p className="font-mono text-xs tabular-nums text-zinc-500">
                    {formatShortDate(r.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right font-mono tabular-nums">
                  <p className="text-sm text-zinc-100">
                    {r.km.toFixed(2)}
                    <span className="ml-0.5 text-xs text-zinc-500">km</span>
                  </p>
                  {r.seconds === null ? null : (
                    <p className="text-xs text-zinc-500">
                      {formatPace(r.seconds / r.km)}/km ·{' '}
                      {formatDuration(r.seconds)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="mt-8 grid grid-cols-2 gap-2">
        <Link
          href="/block"
          className="rounded-xl bg-zinc-900/60 px-4 py-3 text-center text-sm text-zinc-300 ring-1 ring-zinc-800 active:bg-zinc-900"
        >
          The block
        </Link>
        <Link
          href="/activities"
          className="rounded-xl bg-zinc-900/60 px-4 py-3 text-center text-sm text-zinc-300 ring-1 ring-zinc-800 active:bg-zinc-900"
        >
          Crop queue
        </Link>
      </nav>

      {nextRace === undefined ? null : (
        <p className="mt-6 text-center text-xs text-zinc-500">
          Next: {nextRace.name}, {formatShortDate(nextRace.date)} —{' '}
          {daysToRace(now, nextRace.date)} days
        </p>
      )}
    </main>
  );
}
