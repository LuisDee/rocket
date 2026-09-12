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

import { PRESCRIPTION, RACES, STRENGTH } from '../../../config/training';
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

  const longest = sessions.reduce<PlannedSession | null>(
    (a, b) => (a === null || b.km > a.km ? b : a),
    null,
  );
  const strength = placeStrength(sessions, longest?.date ?? null, week.week);

  return sessions.map((s): Described => {
    const race = raceOn(s.date);
    const base = {
      ...s,
      strength: strength.get(s.date) ?? null,
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

/**
 * Where the three lifts go.
 *
 * Legs on the longest run, several hours after it. Push and pull carry no
 * constraint and take the two lightest days. Legs disappears from
 * `STRENGTH.dropLegsFromWeek`: heavy lower body inside the final fortnight adds
 * fatigue the taper exists to shed, and the injury protection is banked by then.
 */
export function placeStrength(
  sessions: readonly PlannedSession[],
  longestDate: string | null,
  weekNumber: number,
): Map<string, StrengthKind> {
  const out = new Map<string, StrengthKind>();
  if (longestDate !== null && weekNumber < STRENGTH.dropLegsFromWeek) {
    out.set(longestDate, 'legs');
  }

  const byEase = [...sessions]
    .filter((s) => s.date !== longestDate)
    .sort((a, b) => a.km - b.km);
  const first = byEase.at(0);
  const second = byEase.find((s) => s.date !== first?.date);
  if (first) out.set(first.date, 'push');
  if (second) out.set(second.date, 'pull');
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
