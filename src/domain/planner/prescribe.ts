/**
 * Generating a training week from rules, rather than writing one out by hand.
 *
 * ## Why this exists
 *
 * The first attempt at a session layer was a 42-day array typed out from a
 * research document. That is a PLAN, and a plan adapts to nothing: a race result
 * re-anchors the paces, an injury deletes a week, a target moves, and every one
 * of those means editing forty-two literals by hand. The spec pack calls rocket
 * an ADAPTIVE planner, and an array is not adaptive.
 *
 * So the block is not stored. It is derived, every time, from:
 *
 *   `BLOCK_WEEKS`     the ratified weekly volume, long run and race fixtures
 *   `PRESCRIPTION`    how much quality a phase carries, and how it is sized
 *   `STRENGTH`        three sessions a week, and where legs is allowed to sit
 *   `PACE_ANCHOR`     the one race every pace scales from
 *
 * Change any of those and the whole block regenerates. Nothing here stores a
 * pace, a date arithmetic result, or a session -- only the rules that produce
 * them.
 *
 * ## What it deliberately does not decide
 *
 * Weekly volume. `BLOCK_WEEKS` is ratified by the athlete, guardrail-checked and
 * carries a written reversal condition; a generator that could quietly re-cut
 * 100 km to 70 would make that ratification meaningless. This layer fills a week
 * whose size was already agreed.
 */

import {
  BLOCK_WEEKS,
  PRESCRIPTION,
  RACES,
  STRENGTH,
} from '../../../config/training';
import { shiftIso, weekDates } from './dates';

export type Phase = string;
export type StrengthKind = (typeof STRENGTH.split)[number];
export type Zone =
  'recovery' | 'easy' | 'marathon' | 'threshold' | 'race' | 'rest';

/** One generated day. Zones, never paces -- REDLINES rule 1 by construction. */
export type Prescribed = {
  readonly date: string;
  readonly km: number;
  readonly zone: Zone;
  /** Kilometres of the session run at marathon pace, inside `km`. */
  readonly mpKm: number;
  /** Kilometres at threshold, inside `km`. */
  readonly thresholdKm: number;
  readonly strides: number;
  readonly strength: StrengthKind | null;
  readonly race: string | null;
  readonly what: string;
  readonly why: string | null;
};

export type PrescribedWeek = {
  readonly monday: string;
  readonly week: number;
  readonly phase: Phase;
  readonly targetKm: number;
  readonly placedKm: number;
  readonly sessions: readonly Prescribed[];
  /** Anything the generator had to compromise on, in plain words. */
  readonly notes: readonly string[];
};

/**
 * What the generator needs from a week.
 *
 * Structural rather than `(typeof BLOCK_WEEKS)[number]`, which is a union of
 * literal types and therefore rejects `{ ...week, targetKm: 100 }` -- so a
 * caller could not ask "what would this week look like 20 km heavier" without
 * the compiler refusing. Being able to ask that is the point of a generator.
 */
export type BlockWeek = {
  readonly week: number;
  readonly monday: string;
  readonly phase: string;
  readonly targetKm: number;
  readonly longRunKm: number | null;
  readonly longRunDate: string | null;
  readonly minRunDays: number | null;
};

/**
 * Threshold volume for a week: the phase's budget, capped two ways.
 *
 * The fraction binds on small weeks and the absolute cap on large ones, which is
 * the right way round -- the tightest constraint lands on the 60 km week that
 * opens two days after a maximal half, not on the 100 km week that carries no
 * threshold work at all.
 */
export function thresholdKmFor(week: BlockWeek): number {
  const budget = PRESCRIPTION.qualityPerWeek[week.phase] ?? 0;
  if (budget === 0) return 0;
  // A race IS the week's quality. Adding threshold work beside one double-books
  // the budget, which is how week 5 came out with both a 10K and a tempo -- the
  // exact combination the research said not to run.
  if (weekDates(week.monday).some((d) => raceOn(d) !== null)) return 0;
  return round1(
    Math.min(
      week.targetKm * PRESCRIPTION.thresholdMaxFractionOfWeek,
      PRESCRIPTION.thresholdMaxKm,
    ),
  );
}

/** Marathon-pace kilometres inside the long run, by phase. */
export function longRunMpKm(week: BlockWeek): number {
  const frac = PRESCRIPTION.longRunMpFraction[week.phase] ?? 0;
  const long = week.longRunKm ?? 0;
  return round1(long * frac);
}

/** That race's distance, when it has one. */
function raceDistanceOn(date: string): number | null {
  const r = RACES.find((x) => x.date === date && x.role !== 'dropped');
  return r?.distanceKm ?? null;
}

/** The race, if any, that this date carries. */
function raceOn(date: string): string | null {
  const r = RACES.find((x) => x.date === date && x.role !== 'dropped');
  return r ? r.name : null;
}

/**
 * Describe a threshold session sized to a kilometre budget.
 *
 * Rep length grows through the block while the total stays capped, which is the
 * standard progression: the same dose, delivered in longer continuous efforts,
 * asks progressively more of the same system.
 */
function thresholdStructure(kmOfWork: number, phase: Phase): string {
  const repMin = phase === 'rebuild' ? 4 : phase === 'taper' ? 5 : 6;
  // A rep at threshold covers roughly 205 m per minute for this athlete; the
  // exact figure does not matter because the caller renders the pace.
  const perRep = (repMin * 205) / 1000;
  const reps = Math.max(3, Math.round(kmOfWork / perRep));
  return `${String(reps)} x ${String(repMin)} min at threshold, 90 s jog between`;
}

/**
 * Fill one ratified week with sessions.
 *
 * `history` is the completed runs the spike cap is judged against. Absent, the
 * long run is taken as ratified -- the cap is advisory and lives in
 * `guardrails.ts`, so duplicating a blocking version here would be a second
 * threshold nobody could see.
 */
export function prescribeWeek(week: BlockWeek): PrescribedWeek {
  const dates = weekDates(week.monday);
  const notes: string[] = [];

  // `weekDates` always returns seven, but the compiler cannot know that and an
  // assertion here would be the one place this file lies about what it knows.
  const sunday = dates[6] ?? week.monday;
  // A race in the week IS its long session, whatever `longRunDate` says. Race
  // week's marathon is on the Saturday while the week's Sunday is the 25th, and
  // without this the block's goal race was generated as an easy day.
  const raceDate = dates.find((d) => raceOn(d) !== null) ?? null;
  const longDate = raceDate ?? week.longRunDate ?? sunday;
  const raceKm = raceDate === null ? 0 : (raceDistanceOn(raceDate) ?? 0);
  const longKm =
    raceDate !== null
      ? Math.max(week.longRunKm ?? 0, raceKm)
      : (week.longRunKm ?? 0);
  const mpKm = longRunMpKm(week);
  const tKm = thresholdKmFor(week);

  // Quality sits midweek and never adjacent to the long run. Wednesday is the
  // default because it is maximally distant from a weekend long run in both
  // directions; a week whose long run moves gets the same treatment relative to
  // wherever it lands.
  const qualityDate =
    tKm > 0 ? furthestFrom(dates, longDate, [week.monday]) : null;

  // Rest lands on Monday for a week following a hard weekend, otherwise the day
  // after the long run.
  const restDate = week.phase === 'rebuild' ? sunday : week.monday;

  const runDates = dates.filter((d) => d !== restDate);
  // Floored at zero. Race week's target is 32 km and its marathon is 42.195, so
  // the subtraction goes negative and every easy day came out at -5.1 km. A
  // week whose single session already exceeds its target has no easy budget --
  // it has a note explaining why.
  const rawBudget = longKm > 0 ? week.targetKm - longKm : week.targetKm;
  const easyBudget = round1(Math.max(0, rawBudget));
  if (rawBudget < 0) {
    notes.push(
      `The ${String(longKm)} km session alone exceeds the ${String(week.targetKm)} km weekly target, ` +
        `so there is no easy volume left to place. That is correct for a race week and wrong anywhere else.`,
    );
  }
  // Spread over at most `minRunDays` days. Week 1 otherwise came out as five
  // 1.4 km days around a half marathon, which is not a taper, it is confetti.
  const wanted = Math.max(
    0,
    (week.minRunDays ?? 7) - 1 - (qualityDate ? 1 : 0),
  );
  const easyDates = runDates
    .filter((d) => d !== longDate && d !== qualityDate)
    .slice(0, Math.max(1, wanted));

  // The quality session's own volume: warm-up and cool-down around the work.
  const qualityKm = qualityDate === null ? 0 : round1(tKm + 5.5);
  const perEasy =
    easyDates.length > 0
      ? round1((easyBudget - qualityKm) / easyDates.length)
      : 0;

  if (perEasy < 4 && easyDates.length > 0) {
    notes.push(
      `Easy days come out at ${String(perEasy)} km each, which is short enough that the week would be better run over fewer days.`,
    );
  }

  const strength = placeStrength(dates, longDate, qualityDate, week);

  const sessions: Prescribed[] = dates.map((date) => {
    const race = raceOn(date);
    const lift = strength.get(date) ?? null;

    if (date === longDate && longKm > 0) {
      return {
        date,
        km: longKm,
        zone: race ? 'race' : 'marathon',
        mpKm,
        thresholdKm: 0,
        strides: 0,
        strength: lift,
        race,
        what: race
          ? `${race}: warm-up, the race at marathon pace, then easy. NOT RACED.`
          : mpKm > 0
            ? `${String(round1(longKm - mpKm))} km easy, then the final ${String(mpKm)} km at marathon pace.`
            : `${String(longKm)} km easy.`,
        why:
          mpKm > 0
            ? 'Marathon pace on tired legs is the session the marathon is actually specific to.'
            : null,
      };
    }

    if (date === qualityDate) {
      return {
        date,
        km: qualityKm,
        zone: 'threshold',
        mpKm: 0,
        thresholdKm: tKm,
        strides: 0,
        strength: lift,
        race,
        what: `3 km easy + ${thresholdStructure(tKm, week.phase)} + 2.5 km easy. ${String(tKm)} km of work.`,
        why: 'The only hard running of the week. Its work-interval mean heart rate is also what validates the derived threshold pace.',
      };
    }

    if (
      date === restDate ||
      (date !== longDate && date !== qualityDate && !easyDates.includes(date))
    ) {
      return {
        date,
        km: 0,
        zone: 'rest',
        mpKm: 0,
        thresholdKm: 0,
        strides: 0,
        strength: lift,
        race,
        what: 'Rest or swim. The swim carries no impact load.',
        why: null,
      };
    }

    // Recovery rather than easy on the day after anything hard.
    const yesterday = shiftIso(date, -1);
    const afterHard = yesterday === longDate || yesterday === qualityDate;
    const strides =
      !afterHard &&
      date !== shiftIso(longDate, -1) &&
      date !== shiftIso(qualityDate ?? '', -1)
        ? PRESCRIPTION.strides.count
        : 0;

    return {
      date,
      km: perEasy,
      zone: afterHard ? 'recovery' : 'easy',
      mpKm: 0,
      thresholdKm: 0,
      strides,
      strength: lift,
      race,
      what: afterHard
        ? 'Recovery. Heart rate under the recovery ceiling regardless of how it feels.'
        : strides > 0
          ? `Easy, then ${String(strides)} x ${String(PRESCRIPTION.strides.seconds)} s strides with walk-back recovery.`
          : 'Easy.',
      why: afterHard
        ? 'The day after hard running is where a polarised block is won or lost.'
        : null,
    };
  });

  // A zero-kilometre day is a rest day. Without this the render showed days
  // labelled `easy` with a pace band and no distance, which reads as a session
  // the athlete is meant to do.
  const cleaned: Prescribed[] = sessions.map((s) =>
    s.km > 0 || s.zone === 'rest'
      ? s
      : { ...s, zone: 'rest' as const, strides: 0, what: 'Rest.', why: null },
  );

  const placedKm = round1(cleaned.reduce((sum, s) => sum + s.km, 0));
  if (Math.abs(placedKm - week.targetKm) > 0.6) {
    notes.push(
      `Placed ${String(placedKm)} km against a target of ${String(week.targetKm)} km.`,
    );
  }

  return {
    monday: week.monday,
    week: week.week,
    phase: week.phase,
    targetKm: week.targetKm,
    placedKm,
    sessions: cleaned,
    notes,
  };
}

/**
 * Where the three lifts go.
 *
 * LEGS ON THE HARDEST RUNNING DAY, which is the long run -- Luis's rule, and the
 * right one. Upper-body work does not compete with running recovery; lower-body
 * work does, directly, so putting it on an easy day turns that day hard. That is
 * how a polarised week quietly becomes an everything-moderate week, which is the
 * most common way a block fails.
 *
 * Legs is dropped entirely from `STRENGTH.dropLegsFromWeek` onward: heavy lower
 * body inside the final fortnight adds fatigue the taper exists to shed, and the
 * injury protection is banked by then.
 */
export function placeStrength(
  dates: readonly string[],
  longDate: string,
  qualityDate: string | null,
  week: BlockWeek,
): Map<string, StrengthKind> {
  const out = new Map<string, StrengthKind>();
  const legsAllowed = week.week < STRENGTH.dropLegsFromWeek;

  if (legsAllowed && STRENGTH.legsOnHardestRunDay) out.set(longDate, 'legs');

  // Push and pull carry no constraint, so they go on the two lightest days --
  // the rest day and the one furthest from the long run. Nothing is riding on
  // this choice, which is exactly why it is stated rather than tuned.
  const free = dates.filter((d) => d !== longDate && d !== qualityDate);
  const first = free.at(0);
  const second = free.at(Math.floor(free.length / 2));
  if (first !== undefined) out.set(first, 'push');
  if (second !== undefined && second !== first) out.set(second, 'pull');
  else if (qualityDate !== null) out.set(qualityDate, 'pull');

  return out;
}

/** The date in `dates` furthest from `from`, ignoring `exclude`. */
function furthestFrom(
  dates: readonly string[],
  from: string,
  exclude: readonly string[],
): string | null {
  const candidates = dates.filter((d) => !exclude.includes(d) && d !== from);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, d) =>
    Math.abs(days(d, from)) > Math.abs(days(best, from)) ? d : best,
  );
}

function days(a: string, b: string): number {
  return (Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** The whole block, generated. */
export function prescribeBlock(): PrescribedWeek[] {
  return BLOCK_WEEKS.map(prescribeWeek);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
