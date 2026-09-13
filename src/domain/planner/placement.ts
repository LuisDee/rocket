/**
 * Session placement: a week's target kilometres laid into availability.
 *
 * Availability is DATA. This file knows that a slot has a weekday set, a
 * kilometre ceiling and an optional weekly use cap; it knows nothing about
 * mornings, evenings or weekends. Delete `weekday-morning` from
 * `AVAILABILITY.runSlots` and the plan changes with no edit here -- that is
 * Luis's design instruction, and it is why the slot ids never appear below.
 *
 * The one thing this must never do is invent a week. When the target does not
 * fit the slots, the shortfall is reported as a number
 * (`PLAN-2026-001` Stage 6: "reports a shortfall rather than silently
 * generating an unrunnable week").
 */

import {
  AVAILABILITY,
  BLOCK_WEEKS,
  GUARDRAILS,
  LIVE_RACE_DATES,
  RACES,
  REPLAN,
  raceRunInCeilingKm,
} from '../../../config/training';
import { round1 } from './guardrails';
import {
  daysBetweenIso,
  isoWeekday,
  mondayOf,
  shiftIso,
  weekDates,
} from './dates';
import type { PlanWindow, PlannedSession } from './types';

export type BlockWeek = (typeof BLOCK_WEEKS)[number];

/** One slot on one day, and the most it will hold. */
export type SlotOpening = {
  readonly date: string;
  readonly slotId: string;
  readonly maxKm: number;
  readonly maxUsesPerWeek: number | null;
};

export type PlacementOptions = {
  /** Slots lost to real life: "meeting ran over", "no lunch run". */
  readonly unavailable?: readonly {
    readonly date: string;
    readonly slotId: string;
  }[];
  /** The last race or long run BEFORE this week, so Monday can be protected. */
  readonly previousHardDate?: string | null;
};

/*
 * NO SORENESS OPTION HERE, deliberately. Placement used to take one and suppress
 * the week's quality day before choosing it, which is a second implementation of
 * a rule `negotiate.demoteQualityFrom` already owned. Demoting after placement is
 * equivalent, has one home, and cannot accidentally promote a different day to
 * quality the way removing a candidate could.
 */

export type WeekPlan = {
  readonly monday: string;
  readonly sessions: readonly PlannedSession[];
  readonly targetKm: number;
  readonly placedKm: number;
  /** Kilometres the slots could not hold. Zero when the week fits. */
  readonly shortfallKm: number;
  /** Everything the planner had to compromise on, in plain words. */
  readonly notes: readonly string[];
};

/** Every slot the availability data opens in a week, minus what is lost. */
export function openings(
  monday: string,
  unavailable: PlacementOptions['unavailable'] = [],
): SlotOpening[] {
  const lost = new Set(unavailable.map((u) => `${u.date}|${u.slotId}`));

  return weekDates(monday).flatMap((date) =>
    AVAILABILITY.runSlots
      .filter((slot) =>
        (slot.weekdays as readonly number[]).includes(isoWeekday(date)),
      )
      .map((slot) => ({
        date,
        slotId: slot.id,
        maxKm: slot.maxKm,
        maxUsesPerWeek: slot.maxUsesPerWeek,
      }))
      .filter((opening) => !lost.has(`${opening.date}|${opening.slotId}`)),
  );
}

/** Place one macro week into its slots. */
export function planWeek(
  week: BlockWeek,
  options: PlacementOptions = {},
): WeekPlan {
  const dates = weekDates(week.monday);
  const notes: string[] = [];
  const open = openings(week.monday, options.unavailable);

  /* --- the hard sessions first: they anchor everything else ------------- */

  const hard = hardSessions(week, dates, notes);
  const hardDates = new Set(hard.map((s) => s.date));

  /* --- rest days, before distributing, so the week cannot fill them ----- */

  const maxRunDays = 7 - GUARDRAILS.minRestOrSwimOnlyDaysPerWeek;
  const wantedRunDays = Math.min(week.minRunDays, maxRunDays);
  if (week.minRunDays > maxRunDays) {
    notes.push(
      `Week asks for ${week.minRunDays} running days, but ${GUARDRAILS.minRestOrSwimOnlyDaysPerWeek} rest-or-swim-only day(s) are mandatory, so it runs ${maxRunDays}. The guardrail wins over the target.`,
    );
  }

  const previousHardDate =
    options.previousHardDate !== undefined
      ? options.previousHardDate
      : previousWeekHardDate(week);

  // Only the long session spends the week's target. A race the week does NOT
  // name as carrying its long session is ADDITIONAL to the target -- week 7's
  // 32 km is "easy running Monday to Friday, EXCLUDING the 42.195 of the race
  // itself" in the config's own words, and netting the marathon out of the
  // target is how race week ended up with no running in it at all.
  const remainingKm = Math.max((week.targetKm ?? 0) - (week.longRunKm ?? 0), 0);

  // `minRunDays` is a FLOOR, and was being read as an exact count. Race week
  // declares three, which left two open days to absorb 32 km -- so the run-in
  // ceilings below capped each of them and the overflow had nowhere to go.
  // Opening another day is a smaller intervention than either stacking 16 km
  // three days out or silently dropping five kilometres, so the week gives
  // days back until the volume fits, never going below the mandatory
  // rest-or-swim day.
  let restCount = 7 - wantedRunDays;
  let restDates = chooseRestDates(dates, hard, restCount, previousHardDate);
  let runDates = dates.filter((d) => !hardDates.has(d) && !restDates.has(d));
  while (
    restCount > GUARDRAILS.minRestOrSwimOnlyDaysPerWeek &&
    dayCapacityKm(runDates, open) < remainingKm - 0.05
  ) {
    restCount -= 1;
    restDates = chooseRestDates(dates, hard, restCount, previousHardDate);
    runDates = dates.filter((d) => !hardDates.has(d) && !restDates.has(d));
  }
  if (restCount < 7 - wantedRunDays) {
    notes.push(
      `Opened ${7 - wantedRunDays - restCount} day(s) above the ${week.minRunDays} this week asks for, because ${remainingKm} km does not fit the remaining days under the run-in ceilings. minRunDays is a floor.`,
    );
  }

  /* --- quality, where the spacing rules allow one ----------------------- */

  const qualityDate = chooseQualityDate(week, runDates, hard, {
    ...options,
    previousHardDate,
  });
  if (qualityDate === null && qualityBudget(week) > 0) {
    notes.push(
      'No day in this week clears the quality spacing rules, so the week is all easy.',
    );
  }

  /* --- the remaining kilometres, spread by slot capacity ---------------- */

  const spread = distribute(remainingKm, runDates, open);
  const slotUse = new Map<string, number>();

  const easy: PlannedSession[] = runDates.flatMap((date) =>
    toSessions(date, spread.byDate.get(date) ?? 0, open, slotUse, {
      kind: date === qualityDate ? 'quality' : 'easy',
    }),
  );

  const rest: PlannedSession[] = [...restDates].map((date) => ({
    date,
    km: 0,
    kind: 'rest' as const,
    slot: null,
    note: 'Rest or swim. Swimming carries no impact load.',
  }));

  const sessions = [...hard, ...easy, ...rest].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Measured from what actually landed rather than from what the distribution
  // pass had left over, so kilometres lost to a spent weekly slot cap are
  // counted too. One source for the number, and it cannot disagree with the
  // sessions it is reported alongside.
  const placedKm = round1(sessions.reduce((total, s) => total + s.km, 0));
  const placedEasyKm = round1(easy.reduce((total, s) => total + s.km, 0));
  const shortfallKm = round1(Math.max(remainingKm - placedEasyKm, 0));
  if (shortfallKm > 0) {
    notes.push(
      `${shortfallKm} km of the ${week.targetKm ?? 0} km target does not fit the slots this week. Not silently dropped: it is debt against the macro layer.`,
    );
  }

  return {
    monday: week.monday,
    sessions,
    targetKm: week.targetKm ?? 0,
    placedKm,
    shortfallKm,
    notes,
  };
}

/**
 * The rolling window: `REPLAN.rollingWindowDays.max` days from `from`, planned
 * week by week and then sliced. Weeks are planned whole because every guardrail
 * that matters is weekly -- planning a fragment and validating a week is how a
 * locally-valid edit breaks a week globally.
 */
export function planWindow(
  from: string,
  days: number = REPLAN.rollingWindowDays.max,
  options: PlacementOptions = {},
): PlanWindow {
  const to = shiftIso(from, days - 1);
  const mondays = [
    ...new Set(
      Array.from({ length: days }, (_, i) => mondayOf(shiftIso(from, i))),
    ),
  ];

  return mondays
    .flatMap((monday) => {
      const week = BLOCK_WEEKS.find((w) => w.monday === monday);
      return week ? planWeek(week, options).sessions : [];
    })
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ----------------------------------------------------------- internals --- */

/**
 * The long run, plus any live race in the week that is not carrying it.
 *
 * A race that carries the week's long session is ONE session at the week's
 * `longRunKm`, not a race plus a long run -- week 4's Lincoln is 21.1 km of
 * race inside a ~33 km day, and the tissue runs 33 km either way.
 */
function hardSessions(
  week: BlockWeek,
  dates: readonly string[],
  notes: string[],
): PlannedSession[] {
  const sessions: PlannedSession[] = [];
  const longDate = week.longRunDate;

  if (week.longRunKm != null && longDate != null) {
    const onRace = LIVE_RACE_DATES.includes(longDate);
    if (onRace && week.longRunOnRace == null) {
      notes.push(
        `The long run on ${longDate} lands on a live race this week does not name as carrying it.`,
      );
    }
    sessions.push({
      date: longDate,
      km: week.longRunKm,
      kind: onRace ? 'race' : 'long',
      slot: slotForLong(longDate),
      ...(week.longRunOnRace != null
        ? { note: `Carried by ${week.longRunOnRace}.` }
        : {}),
    });
  }

  for (const race of RACES) {
    if (race.role === 'dropped') continue;
    if (!dates.includes(race.date)) continue;
    if (sessions.some((s) => s.date === race.date)) continue;
    sessions.push({
      date: race.date,
      km: race.distanceKm ?? 0,
      kind: 'race',
      slot: slotForLong(race.date),
      note: race.name,
    });
  }

  return sessions;
}

/** The roomiest slot the day offers -- a long run needs the biggest ceiling. */
function slotForLong(date: string): string | null {
  const candidates = AVAILABILITY.runSlots.filter((slot) =>
    (slot.weekdays as readonly number[]).includes(isoWeekday(date)),
  );
  const roomiest = [...candidates].sort((a, b) => b.maxKm - a.maxKm)[0];
  return roomiest?.id ?? null;
}

/**
 * Rest days, in order of preference: the day after a hard session, then the day
 * before one, then the remaining days latest-first.
 *
 * The day after comes first because it is the day the body can least use and
 * the guardrails already forbid quality on -- and "after" includes the previous
 * week's long run or race, which is how the Monday following a Sunday race
 * stops being scheduled as a running day. Latest-first for the remainder is
 * what keeps race week's easy volume at the START of the week rather than on
 * the Friday before the marathon.
 */
function chooseRestDates(
  dates: readonly string[],
  hard: readonly PlannedSession[],
  count: number,
  previousHardDate: string | null,
): Set<string> {
  if (count <= 0) return new Set();

  const hardDates = new Set(hard.map((s) => s.date));
  const anchors = [
    ...hard.map((s) => s.date),
    ...(previousHardDate != null ? [previousHardDate] : []),
  ];
  const free = (d: string) => dates.includes(d) && !hardDates.has(d);

  const preference = [
    ...anchors.map((d) => shiftIso(d, 1)).filter(free),
    ...anchors.map((d) => shiftIso(d, -1)).filter(free),
    ...[...dates].reverse().filter(free),
  ];

  return new Set([...new Set(preference)].slice(0, count));
}

/** What is left of the weekly quality budget once races have spent theirs. */
function qualityBudget(week: BlockWeek): number {
  const racesThisWeek = GUARDRAILS.racesCountAsQualitySessions
    ? LIVE_RACE_DATES.filter(
        (d) => d >= week.monday && d < shiftIso(week.monday, 7),
      ).length
    : 0;
  return GUARDRAILS.maxQualitySessionsPerWeekBuild - racesThisWeek;
}

/**
 * The day FURTHEST from every hard session, not merely the first day that
 * clears the minimum.
 *
 * Both satisfy `minDaysBetweenQualitySessions`, and the difference is real
 * coaching: first-that-clears put week 2's intervals on the Monday two days
 * after a maximal half marathon, which is legal and wrong. Ties break earliest
 * so the choice stays deterministic.
 */
function chooseQualityDate(
  week: BlockWeek,
  runDates: readonly string[],
  hard: readonly PlannedSession[],
  options: PlacementOptions,
): string | null {
  if (qualityBudget(week) <= 0) return null;

  const anchors = [
    ...hard.map((s) => s.date),
    ...(options.previousHardDate != null ? [options.previousHardDate] : []),
  ];
  const gapTo = (date: string) =>
    anchors.length === 0
      ? Number.MAX_SAFE_INTEGER
      : Math.min(...anchors.map((a) => Math.abs(daysBetweenIso(a, date))));

  const eligible = runDates.filter(
    (date) => gapTo(date) >= GUARDRAILS.minDaysBetweenQualitySessions,
  );

  return (
    eligible.reduce<string | null>(
      (best, date) =>
        best === null || gapTo(date) > gapTo(best) ? date : best,
      null,
    ) ?? null
  );
}

/** The long run or race that closed the week before -- the Monday protector. */
function previousWeekHardDate(week: BlockWeek): string | null {
  const index = BLOCK_WEEKS.findIndex((w) => w.monday === week.monday);
  const previous = index > 0 ? BLOCK_WEEKS[index - 1] : undefined;
  return previous?.longRunDate ?? null;
}

/**
 * Spread kilometres across the running days, bounded by what each day's slots
 * hold. Even shares first, then repeated top-ups into whatever headroom is
 * left, so one tight day does not truncate the week.
 */
function distribute(
  totalKm: number,
  runDates: readonly string[],
  open: readonly SlotOpening[],
): { byDate: Map<string, number> } {
  const byDate = new Map(runDates.map((d) => [d, 0]));
  const capacity = new Map(runDates.map((d) => [d, dayCapacityKm([d], open)]));

  let remaining = totalKm;
  for (
    let pass = 0;
    pass < runDates.length + 1 && remaining > 0.05;
    pass += 1
  ) {
    const withRoom = runDates.filter(
      (d) => (capacity.get(d) ?? 0) - (byDate.get(d) ?? 0) > 0.05,
    );
    if (withRoom.length === 0) break;

    const share = remaining / withRoom.length;
    for (const date of withRoom) {
      const room = (capacity.get(date) ?? 0) - (byDate.get(date) ?? 0);
      const add = Math.min(share, room);
      byDate.set(date, (byDate.get(date) ?? 0) + add);
      remaining -= add;
    }
  }

  for (const [date, km] of byDate) byDate.set(date, round1(km));

  return { byDate };
}

/**
 * What a set of days will hold: their slots, further capped by the run-in to the
 * goal race.
 *
 * The run-in ceiling caps the DAY, not each slot. Capping per slot would let a
 * morning and an evening add up to twice the ceiling on the Thursday before the
 * marathon -- which is the same 16 km, split in two, and no easier on the legs.
 *
 * Long runs and races never reach here: `hardSessions()` places those at the
 * distance `BLOCK_WEEKS` chose, and shrinking a ratified long run to satisfy a
 * ceiling derived from research would be the tail wagging the dog. The
 * `race-run-in` guardrail reports those as advisory breaches instead.
 */
function dayCapacityKm(
  dates: readonly string[],
  open: readonly SlotOpening[],
): number {
  return dates.reduce((total, date) => {
    const slots = open
      .filter((o) => o.date === date)
      .reduce((km, o) => km + o.maxKm, 0);
    const ceiling = raceRunInCeilingKm(date);
    return total + (ceiling === null ? slots : Math.min(slots, ceiling));
  }, 0);
}

/**
 * Turn a day's kilometres into sessions, filling the roomiest slot first and
 * spilling into a second when the day needs a double.
 *
 * ponytail: slots with a weekly use cap are consumed in date order, so a late
 * week day can find the cap spent. That is the honest shape of the constraint
 * (six evenings, the swim takes the seventh) and it surfaces as a shortfall
 * rather than as an over-booked week. Upgrade path if it ever bites: allocate
 * capped slots to the days that need them most, not the days that come first.
 */
function toSessions(
  date: string,
  km: number,
  open: readonly SlotOpening[],
  slotUse: Map<string, number>,
  attrs: { kind: PlannedSession['kind'] },
): PlannedSession[] {
  if (km <= 0.05) return [];

  const usable = [...open]
    .filter((o) => o.date === date)
    .filter(
      (o) =>
        o.maxUsesPerWeek === null ||
        (slotUse.get(o.slotId) ?? 0) < o.maxUsesPerWeek,
    )
    .sort((a, b) => b.maxKm - a.maxKm);

  const sessions: PlannedSession[] = [];
  let left = km;

  for (const slot of usable) {
    if (left <= 0.05) break;
    const take = round1(Math.min(left, slot.maxKm));
    sessions.push({
      date,
      km: take,
      kind: sessions.length === 0 ? attrs.kind : 'easy',
      slot: slot.slotId,
    });
    slotUse.set(slot.slotId, (slotUse.get(slot.slotId) ?? 0) + 1);
    left = round1(left - take);
  }

  return sessions;
}
