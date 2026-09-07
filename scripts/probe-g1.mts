/**
 * Decision gate G1, as one command: `npm run probe:g1`.
 *
 * The plan has specified this probe since it was written and nobody has run it
 * (`docs/plans/PLAN-2026-001-m1-core-loop.md:295-309`). It is a go/no-go, not a
 * formality:
 *
 *   Branch A -- the partner bridge is primary. Taken when `hrv`, `restingHR`,
 *               `sleepScore` and `bodyBattery` come back POPULATED.
 *   Branch B -- `python-garminconnect` direct. Taken when any of them is
 *               missing or null across the window.
 *
 * The bridge is the lower-effort default and it is NOT the safe default: Luis
 * chose Garmin over Strava specifically for the granular metrics, and the
 * bridge's coverage of exactly those fields is the one thing the research could
 * not confirm from a primary source. A 2026-05-19 bug report shows partial
 * syncs. If the payload comes back thin, Branch A delivers Strava-grade data
 * through a Garmin-shaped pipe, which defeats the point.
 *
 * IT REPORTS WHAT IT OBSERVES. The four field names above are hypotheses drawn
 * from a third-party guide, so the report also lists the complete key set the
 * account actually returned -- if the bridge calls resting heart rate something
 * else, this prints "restingHR: absent" and the real key beside it, rather than
 * a schema this repo invented agreeing with itself.
 *
 * It writes `docs/G1-BRIDGE-PROBE.md` into the repo, because a result that
 * lives in a terminal scrollback is a result nobody can cite. It never writes a
 * report it did not measure: no key, no file, non-zero exit.
 *
 * SAFE. It reads a third-party JSON API with a personal key and never touches
 * Garmin auth, so it cannot trip the per-account 429 that locks the account for
 * 48-72 hours.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BRIDGE_ENV,
  intervalsBridge,
  type WellnessDay,
} from '../src/integrations/intervals.ts';

/** What Decision gate G1 is actually about. Everything else is context. */
const GATE_FIELDS = ['hrv', 'restingHR', 'sleepScore', 'bodyBattery'] as const;

/** Garmin's own load model, relayed. Free independent oracle on ours. */
const LOAD_FIELDS = ['ctl', 'atl', 'rampRate', 'ctlLoad', 'atlLoad'] as const;

const DAYS = 7;
const REPORT = resolve(import.meta.dirname, '../docs/G1-BRIDGE-PROBE.md');

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fail(message: string): never {
  console.error(`G1 probe: ${message}`);
  process.exit(1);
}

const apiKey = process.env['INTERVALS_API_KEY'];
const athleteId = process.env['INTERVALS_ATHLETE_ID'];

if (!apiKey || !athleteId) {
  const missing = BRIDGE_ENV.filter((name) => !process.env[name]);
  fail(
    `${missing.join(' and ')} not set.\n` +
      `  1. intervals.icu -> Settings -> Developer Settings -> generate an API key\n` +
      `  2. the athlete id is the number in your intervals.icu URL, e.g. i123456\n` +
      `  3. INTERVALS_API_KEY=... INTERVALS_ATHLETE_ID=... npm run probe:g1\n` +
      `No report written -- this command never writes a result it did not measure.`,
  );
}

const newest = new Date();
const oldest = new Date(newest.getTime() - (DAYS - 1) * 86_400_000);

const bridge = intervalsBridge({ apiKey, athleteId });

let days: WellnessDay[];
try {
  days = await bridge.wellness(iso(oldest), iso(newest));
} catch (error) {
  fail(
    `the wellness request failed: ${error instanceof Error ? error.message : String(error)}\n` +
      `A 401 means the key or the athlete id is wrong. A 403 means the key lacks the scope.\n` +
      `No report written.`,
  );
}

/* --------------------------------------------------------------- report --- */

/** Present AND non-null. A key that arrives null is not coverage. */
function populated(day: WellnessDay, field: string): boolean {
  const value = day[field];
  return value !== undefined && value !== null && value !== '';
}

function count(field: string): number {
  return days.filter((day) => populated(day, field)).length;
}

const observedKeys = [
  ...new Set(days.flatMap((day) => Object.keys(day))),
].sort();

const populatedKeys = observedKeys.filter((key) => count(key) > 0);

const gateRows = GATE_FIELDS.map((field) => {
  const n = count(field);
  const present = observedKeys.includes(field);
  return {
    field,
    n,
    verdict:
      n > 0 ? 'POPULATED' : present ? 'present but null/empty' : 'ABSENT',
  };
});

const loadRows = LOAD_FIELDS.map((field) => ({
  field,
  n: count(field),
  present: observedKeys.includes(field),
}));

const allGateFieldsPopulated = gateRows.every((row) => row.n > 0);
const branch = allGateFieldsPopulated ? 'A' : 'B';

const lines = [
  '# G1 — intervals.icu wellness field coverage',
  '',
  `Measured ${iso(newest)} by \`npm run probe:g1\` over ${String(DAYS)} days ` +
    `(${iso(oldest)} to ${iso(newest)}), ${String(days.length)} wellness day(s) returned.`,
  '',
  'This file is generated. Re-run the command to refresh it; do not hand-edit.',
  'It is the authority over any capability matrix, per `tasks/garmin-wiring.md`.',
  '',
  '## The gate',
  '',
  `**Branch ${branch}.** ` +
    (allGateFieldsPopulated
      ? 'All four gate fields are populated, so the partner bridge carries the metrics ' +
        'Garmin was chosen for and is primary. `python-garminconnect` stays a manual fallback.'
      : 'At least one gate field is missing or null across the whole window, so the bridge ' +
        'relays Strava-grade data through a Garmin-shaped pipe. Per the gate, that is the ' +
        'condition for `python-garminconnect` direct — but read the table first: a field that ' +
        'is null because the watch was not worn asleep is a WEARING problem, not a bridge ' +
        'problem, and re-running after a few worn nights is cheaper than a Python runner.'),
  '',
  `| Gate field | Days populated (of ${String(days.length)}) | Verdict |`,
  '| --- | --- | --- |',
  ...gateRows.map(
    (row) => `| \`${row.field}\` | ${String(row.n)} | ${row.verdict} |`,
  ),
  '',
  '## Garmin load model, relayed',
  '',
  'If `ctl`/`atl` are exposed, they are a free independent oracle on our own',
  'computation and disagreement is the signal calibration needs. `LOAD.seed` in',
  '`config/training.ts` currently warm-starts from a hand-read pair (287/296 on',
  '2026-09-06); a populated series here would replace that hand reading.',
  '',
  `| Field | Days populated (of ${String(days.length)}) | Key present |`,
  '| --- | --- | --- |',
  ...loadRows.map(
    (row) =>
      `| \`${row.field}\` | ${String(row.n)} | ${row.present ? 'yes' : 'no'} |`,
  ),
  '',
  '## Every key the account actually returned',
  '',
  'The four gate names above are hypotheses from a third-party guide. This is',
  'the ground truth, and it is what a typed wellness schema must be derived from.',
  '',
  '**Populated at least once:**',
  '',
  populatedKeys.length === 0
    ? '_none_'
    : populatedKeys.map((key) => `\`${key}\``).join(', '),
  '',
  '**Returned but null/empty every day:**',
  '',
  observedKeys.filter((key) => !populatedKeys.includes(key)).length === 0
    ? '_none_'
    : observedKeys
        .filter((key) => !populatedKeys.includes(key))
        .map((key) => `\`${key}\``)
        .join(', '),
  '',
  '## Per-day coverage',
  '',
  `| Date | ${GATE_FIELDS.join(' | ')} | keys with a value |`,
  `| --- | ${GATE_FIELDS.map(() => '---').join(' | ')} | --- |`,
  ...days
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((day) => {
      const marks = GATE_FIELDS.map((f) => (populated(day, f) ? 'yes' : '—'));
      const filled = Object.keys(day).filter((k) => populated(day, k)).length;
      return `| ${day.id} | ${marks.join(' | ')} | ${String(filled)} |`;
    }),
  '',
  '## What to do next',
  '',
  allGateFieldsPopulated
    ? '- Record the Branch A decision in `docs/decisions.md` and close the G1 row in\n' +
      '  `docs/specs/07-wiring-todo.md`.\n' +
      '- Derive the typed wellness table from the key list above, from the rows already\n' +
      '  in `wellness_raw` — no re-ingest needed.'
    : '- Do NOT design a typed wellness schema against the absent fields.\n' +
      '- Confirm the watch is worn asleep, and for how many continuous nights: HRV\n' +
      '  status and baseline stay null until roughly three weeks of nights, and that is\n' +
      '  not a bug to debug (`docs/specs/07-wiring-todo.md`).\n' +
      '- Re-run this command after a week of worn nights before spending anything on\n' +
      '  Branch B, which costs a Python runner that cannot run on Vercel.',
  '',
];

writeFileSync(REPORT, lines.join('\n'), 'utf8');

console.log(`G1 probe: Branch ${branch}.`);
for (const row of gateRows) {
  console.log(
    `  ${row.field.padEnd(12)} ${row.verdict} (${String(row.n)}/${String(days.length)})`,
  );
}
console.log(`Written: ${REPORT}`);
