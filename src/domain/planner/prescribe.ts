/**
 * What a planned session IS, as opposed to where it sits.
 *
 * ## The division, and why it went the other way
 *
 * `placement.planWeek` decides WHICH DAY and HOW FAR. This file decides WHAT the
 * session is: its zone, its structure, its marathon-pace or threshold content,
 * and which lift goes beside it. They compose; neither replaces the other.
 *
 * That is the opposite of what `tasks/prescribe-drives-the-plan.md` assumed. The
 * task said `planWeek` was the one to delete and told me to check before doing
 * it, so I did, and the assumption was wrong. `planWeek` already handles,
 * correctly, several things a from-scratch generator got wrong on its first run:
 *
 *   - the mandatory rest-or-swim day, which outranks a week's `minRunDays`
 *   - rest-day choice against the PREVIOUS week's hard session, not just this one
 *   - quality spacing, never the day after a race or long run
 *   - distribution by SLOT CAPACITY, splitting a day into AM/PM when one slot
 *     cannot hold it -- doubles were never missing, I had simply not used them
 *   - a race being ADDITIONAL to the weekly target rather than inside it, which
 *     is why race week places 74.2 km against a 32 km target and is right to
 *
 * Rebuilding that here to justify a rewrite would have been the expensive kind
 * of mistake: code that looks like progress while quietly losing capability.
 *
 * ## Zones, never paces
 *
 * A session names a zone. `derivePaces()` turns a zone into seconds per
 * kilometre at render time from `PACE_ANCHOR`. So the block repaces from one
 * field when a race lands -- which it did on 2026-09-12, moving every session by
 * 23.5 s/km without one of them being edited.
 */

import { BLOCK, PRESCRIPTION, RACES, STRENGTH } from '../../../config/training';
import { shiftIso } from './dates';
import type { PlannedSession } from './types';

export type StrengthKind = (typeof STRENGTH.split)[number];
export type Zone =
  'recovery' | 'easy' | 'marathon' | 'threshold' | 'race' | 'rest';

/** A placed session, decorated with what to actually do. */
export type Described = PlannedSession & {
  readonly zone: Zone;
  /** Kilometres at marathon pace, inside `km`. */
  readonly mpKm: number;
  /** Kilometres at threshold, inside `km`. */
  readonly thresholdKm: number;
  readonly strides: number;
  readonly strength: StrengthKind | null;
  /** The lift in full -- scheme, movements and the separation. Null on a day with no lift. */
  readonly gym: string | null;
  readonly race: string | null;
  readonly what: string;
  readonly why: string | null;
};

/** The subset of a block week this module reads. */
export type WeekFacts = {
  readonly week: number;
  readonly monday: string;
  readonly phase: string;
  readonly targetKm: number;
  readonly longRunKm: number | null;
};

/**
 * Threshold volume for a week: the phase's budget, capped two ways.
 *
 * The fraction binds on small weeks and the absolute ceiling on large ones,
 * which puts the tightest constraint on the 60 km week opening two days after a
 * maximal half rather than on the 100 km week carrying no threshold at all.
 */
export function thresholdKmFor(week: WeekFacts, hasRace: boolean): number {
  // A race IS the week's quality. Adding threshold beside one double-books the
  // budget, which is how week 5 first came out with a 10K and a tempo.
  if (hasRace) return 0;
  const budget = PRESCRIPTION.qualityPerWeek[week.phase] ?? 0;
  if (budget === 0) return 0;
  return round1(
    Math.min(
      week.targetKm * PRESCRIPTION.thresholdMaxFractionOfWeek,
      PRESCRIPTION.thresholdMaxKm,
    ),
  );
}

/** Marathon-pace kilometres inside the long run, by phase. */
export function longRunMpKm(week: WeekFacts): number {
  const frac = PRESCRIPTION.longRunMpFraction[week.phase] ?? 0;
  return round1((week.longRunKm ?? 0) * frac);
}

function raceOn(date: string): string | null {
  const r = RACES.find((x) => x.date === date && x.role !== 'dropped');
  return r ? r.name : null;
}

/**
 * Rep length grows through the block while the total stays capped: the same
 * dose in longer continuous efforts asks progressively more of the same system.
 */
function thresholdStructure(kmOfWork: number, phase: string): string {
  const repMin = phase === 'rebuild' ? 4 : phase === 'taper' ? 5 : 6;
  const perRepKm = (repMin * 205) / 1000;
  const reps = Math.max(3, Math.round(kmOfWork / perRepKm));
  return `${String(reps)} x ${String(repMin)} min at threshold, 90 s jog between`;
}

/**
 * Decorate a placed week.
 *
 * `sessions` comes from `planWeek`, and comes back in the same order so a caller
 * can use `Described` wherever it used `PlannedSession`.
 */
export function describeWeek(
  week: WeekFacts,
  sessions: readonly PlannedSession[],
): Described[] {
  const hasRace = sessions.some((s) => raceOn(s.date) !== null);
  const tKm = thresholdKmFor(week, hasRace);
  const mpKm = longRunMpKm(week);

  const strength = placeStrength(week, sessions);

  return sessions.map((s): Described => {
    const race = raceOn(s.date);
    const lift = strength.get(s.date) ?? null;
    const base = {
      ...s,
      strength: lift,
      gym: lift === null ? null : gymText(lift),
      race,
      mpKm: 0,
      thresholdKm: 0,
      strides: 0,
    };

    if (race !== null) {
      return {
        ...base,
        zone: 'race',
        mpKm: week.phase === 'peak' ? mpKm : 0,
        what:
          week.phase === 'peak'
            ? `${race}: warm up, the race AT MARATHON PACE, then easy. NOT RACED.`
            : `${race}.`,
        why:
          week.phase === 'peak'
            ? 'Turns a race that would otherwise wreck peak week into the block’s most marathon-specific session.'
            : null,
      };
    }

    if (s.kind === 'rest' || s.km === 0) {
      return {
        ...base,
        zone: 'rest',
        what: 'Rest or swim. The swim carries no impact load.',
        why: null,
      };
    }

    if (s.kind === 'long') {
      return {
        ...base,
        zone: 'marathon',
        mpKm,
        what:
          mpKm > 0
            ? `${String(round1(s.km - mpKm))} km easy, then the final ${String(mpKm)} km at marathon pace.`
            : `${String(s.km)} km easy.`,
        why:
          mpKm > 0
            ? 'Marathon pace on tired legs is the session the race is actually specific to.'
            : null,
      };
    }

    if (s.kind === 'quality' && tKm > 0) {
      return {
        ...base,
        zone: 'threshold',
        thresholdKm: tKm,
        what: `Warm up, then ${thresholdStructure(tKm, week.phase)}, then cool down. ${String(tKm)} km of work.`,
        why: 'The only hard running of the week. Its work-interval mean heart rate is also what validates the derived threshold pace.',
      };
    }

    const strides = PRESCRIPTION.strides.count;
    return {
      ...base,
      zone: 'easy',
      strides,
      what: `Easy, then ${String(strides)} x ${String(PRESCRIPTION.strides.seconds)} s strides with walk-back recovery.`,
      why: null,
    };
  });
}

/** The upper-body half of the split, in rotation order. `legs` is the constrained one. */
const UPPER: readonly StrengthKind[] = STRENGTH.split.filter(
  (kind): kind is StrengthKind => kind !== 'legs',
);

/** Every race still standing, in date order. The default for `placeStrength`. */
export function liveRaceDates(): readonly string[] {
  return RACES.filter((r) => r.role !== 'dropped')
    .map((r) => r.date)
    .sort();
}

/**
 * Days no barbell may touch: every live race, and the days before it.
 *
 * Race day itself was the worse of the two faults -- `placeStrength` picked the
 * longest session by KILOMETRES with no notion of a race, so heavy squats landed
 * on the maximal Battersea Half, on Lincoln day and on the raced 10K. The eve is
 * the subtler one: sorting by kilometres makes 0 km rest days the first picks for
 * upper body, and the rest days a taper puts immediately before a race are
 * exactly those.
 */
function gymFreeDates(races: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const date of races) {
    out.add(date);
    for (let d = 1; d <= STRENGTH.gymFreeDaysBeforeRace; d += 1) {
      out.add(shiftIso(date, -d));
    }
  }
  return out;
}

/** Days from `date` to the next race at or after it, or a large number if none. */
function daysToNextRace(date: string, races: readonly string[]): number {
  const next = races.filter((d) => d >= date)[0];
  if (next === undefined) return Number.MAX_SAFE_INTEGER;
  return Math.round(
    (Date.parse(`${next}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * Where the week's lifts go.
 *
 * Legs on the hardest NON-RACE day that is already carrying real running load,
 * several hours after the run. Push and pull take the lightest remaining days,
 * because upper body does not compete with running recovery and putting it on a
 * rest or easy day therefore costs nothing.
 *
 * Three things stop it: `dropLegsFromWeek`, because heavy lower body inside the
 * final fortnight adds fatigue the taper exists to shed and the injury
 * protection is banked by then; `legsMinRunKmOnTheDay`, because a week whose
 * hardest day is a 2.3 km shakeout has nowhere to put legs that would not turn
 * its easiest day into its hardest; and the week of the goal race, which gets
 * `STRENGTH.raceWeek.lifts` upper-body sessions on its earliest days and nothing
 * else.
 */
export function placeStrength(
  week: WeekFacts,
  sessions: readonly PlannedSession[],
  races: readonly string[] = liveRaceDates(),
): Map<string, StrengthKind> {
  const out = new Map<string, StrengthKind>();
  const dates = [...new Set(sessions.map((s) => s.date))].sort();
  const kmOn = (date: string) =>
    sessions
      .filter((s) => s.date === date)
      .reduce((total, s) => total + s.km, 0);

  // Race week is not a training week. Earliest days first, so the lift sits as
  // far from race day as the week allows.
  if (dates.includes(BLOCK.goalRaceDate)) {
    for (const date of dates.slice(0, STRENGTH.raceWeek.lifts)) {
      const lift = UPPER[0];
      if (lift !== undefined) out.set(date, lift);
    }
    return out;
  }

  const blocked = gymFreeDates(races);
  const open = dates.filter((d) => !blocked.has(d));

  const legsDate =
    week.week < STRENGTH.dropLegsFromWeek
      ? (open
          .filter((d) => kmOn(d) >= STRENGTH.legsMinRunKmOnTheDay)
          // Hardest day first. Ties -- peak week's five identical 13.4 km
          // evenings -- break to the day furthest from the next race, which for
          // a race mid-week means AFTER it rather than two days before. Every
          // race in this block falls on a weekend, where earliest-first would
          // give the same answer; the rule is here for the calendar rather than
          // for the fixture list, and its own test injects a Wednesday race.
          .sort(
            (a, b) =>
              kmOn(b) - kmOn(a) ||
              daysToNextRace(b, races) - daysToNextRace(a, races),
          )
          .at(0) ?? null)
      : null;
  if (legsDate !== null) out.set(legsDate, 'legs');

  const slots = Math.min(
    STRENGTH.sessionsPerWeek - (legsDate === null ? 0 : 1),
    UPPER.length,
  );
  const lightestFirst = open
    .filter((d) => d !== legsDate)
    .sort((a, b) => kmOn(a) - kmOn(b));

  for (let i = 0; i < slots; i += 1) {
    const date = lightestFirst[i];
    const lift = UPPER[i];
    if (date !== undefined && lift !== undefined) out.set(date, lift);
  }

  return out;
}

/**
 * The lift, written out.
 *
 * `STRENGTH.legs.scheme`, `.lifts`, `.plyometrics` and `.note` were read by
 * nothing: the athlete saw the word "legs" and a hardcoded "at least 6 h after
 * the run". The one instruction that makes this block's strength work match the
 * evidence it cites -- heavy and low-rep rather than hypertrophy -- never
 * reached him, so the default behaviour was the three-sets-of-twelve the config
 * explicitly warns against, and Lauersen 2018's risk ratio of 0.338 rests on
 * doing the prescribed dose.
 */
function gymText(lift: StrengthKind): string {
  if (lift === 'legs') {
    return [
      `Legs, ${STRENGTH.legs.scheme}: ${STRENGTH.legs.lifts.join(', ')}.`,
      `${STRENGTH.legs.plyometrics}.`,
      STRENGTH.legs.note,
      `At least ${String(STRENGTH.legsMinHoursAfterRun)} h after the run.`,
    ].join(' ');
  }

  const movements =
    lift === 'push' ? STRENGTH.upperBody.push : STRENGTH.upperBody.pull;
  const name = lift.charAt(0).toUpperCase() + lift.slice(1);
  return `${name}, ${STRENGTH.upperBody.scheme}: ${movements.join(', ')}. ${STRENGTH.upperBody.note}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
