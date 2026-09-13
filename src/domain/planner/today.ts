/**
 * What the athlete is doing today, with this morning's check-in applied.
 *
 * ## Why this module exists rather than the two calls it wraps
 *
 * The home screen used to call `planWeek(week)` and `describeWeek(week, ...)`
 * itself, with no options, and separately render `readiness.qualityBlocked` as
 * one sentence of copy. The result was a card reading `THRESHOLD 10.6 km` with a
 * threshold pace band, a heart-rate band and `7 x 4 min at threshold` under it,
 * and thirty pixels below that, "Quality work is gated today." The gate was
 * computed correctly and changed nothing. An athlete reads the prescription, not
 * the footnote, and would have run 6 km of threshold work on a sore calf.
 *
 * Wiring the gate into one surface would have fixed one surface. The cron, the
 * assistant and the app each composed the planner for themselves, so there was no
 * fact of the matter about what he was meant to run. This is that fact, in one
 * function, and every surface asks it rather than assembling its own.
 *
 * ## What a red morning does, and what it deliberately does not
 *
 * It cuts INTENSITY: the quality session becomes a genuinely easy run, and the
 * strides come off. It does NOT cut distance.
 * `docs/research/session-prescription-design.json` is explicit both ways --
 * "Soreness >= 3 blocks the threshold session outright. Do not downgrade the
 * session to 'easy tempo' -- cancel it. There is no version of this block where a
 * compromised threshold session is worth its cost", and separately "intensity is
 * cut before volume -- the volume ramp is the ratified experiment; the intensity
 * plan is the buffer around it, so the buffer is spent first", with a volume cut
 * sitting behind two channels tripped for seven consecutive days rather than
 * behind one sore morning.
 */

import { BLOCK_WEEKS, READINESS } from '../../../config/training';
import { worstSoreness } from '../readiness';
import type { CheckIn } from '../types';
import { daysBetweenIso, mondayOf } from './dates';
import { planWeek, type BlockWeek } from './placement';
import { describeWeek, type Described, type Gate } from './prescribe';

export type PrescribedWeek = {
  readonly monday: string;
  readonly sessions: readonly Described[];
  readonly targetKm: number;
  readonly placedKm: number;
  readonly shortfallKm: number;
  readonly notes: readonly string[];
};

/**
 * The gate a check-in puts on the plan, or null when it puts none.
 *
 * Soreness ALONE decides, and that is a correction in both directions. The cron
 * required `band !== 'green'` as well, so a calf at 3 beside nine hours' sleep,
 * high motivation and an easy previous day scores 0.73 -- green -- and the gate
 * never fired; soreness is the injury signal and it does not get outvoted by
 * having slept well. The repair went the other way and downgraded quality on ANY
 * soreness reading paired with an amber band, so a 1/5 niggle after a bad night
 * took out the week's only hard session.
 *
 * A reading older than `READINESS.checkInStaleAfterDays` governs nothing. Without
 * that bound one sore morning silenced every remaining quality session in the
 * block if he never checked in again.
 */
export function gateFromCheckIn(
  checkIn: CheckIn | null,
  today: string,
): Gate | null {
  if (checkIn === null) return null;

  const age = daysBetweenIso(checkIn.localDate, today);
  if (age < 0 || age > READINESS.checkInStaleAfterDays) return null;

  const severity = worstSoreness(checkIn.soreness);
  if (severity === null || severity < READINESS.sorenessBlocksQuality) {
    return null;
  }

  return { severity, since: checkIn.localDate };
}

/**
 * One week, placed, described, and gated -- plus what the gate took away.
 *
 * The ungated week is computed too, and that is the whole of how the demotion
 * stays reversible: the original zone and its prescription travel with the
 * session rather than being overwritten, so the athlete can see what he was
 * handed before the check-in touched it and overrule it if he disagrees.
 */
export function prescribeWeek(
  week: BlockWeek,
  gate: Gate | null = null,
): PrescribedWeek {
  const open = planWeek(week);
  const ungated = describeWeek(week, open.sessions);

  if (gate === null) {
    return {
      monday: open.monday,
      sessions: ungated,
      targetKm: open.targetKm,
      placedKm: open.placedKm,
      shortfallKm: open.shortfallKm,
      notes: open.notes,
    };
  }

  const closed = planWeek(week, { soreness: gate });
  const sessions = describeWeek(week, closed.sessions, gate).map(
    (s): Described => {
      const was = ungated.find(
        (u) => u.date === s.date && u.slot === s.slot && u.km === s.km,
      );
      if (was === undefined || was.what === s.what) return s;
      return {
        ...s,
        demoted: {
          fromZone: was.zone,
          fromWhat: was.what,
          reason: gateReason(gate),
        },
      };
    },
  );

  return {
    monday: closed.monday,
    sessions,
    targetKm: closed.targetKm,
    placedKm: closed.placedKm,
    shortfallKm: closed.shortfallKm,
    notes: closed.notes,
  };
}

/** Today's session, or null when the date falls outside the block. */
export function prescribeDay(
  date: string,
  gate: Gate | null = null,
): Described | null {
  const week = BLOCK_WEEKS.find((w) => w.monday === mondayOf(date));
  if (week === undefined) return null;
  return (
    prescribeWeek(week, gate).sessions.find((s) => s.date === date) ?? null
  );
}

function gateReason(gate: Gate): string {
  return (
    `Soreness ${String(gate.severity)}/5 reported ${gate.since} is at or above ` +
    `the ${String(READINESS.sorenessBlocksQuality)} that gates quality work. ` +
    `Intensity is cut before volume, so the distance stands.`
  );
}
