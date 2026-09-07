# close-gaps

**Scope boundary:** close the gaps the independent verification
(`docs/reviews/2026-09-07-verification.md`) found between what the response
ledger promised and what the branch actually carries. Covers: the red CI job,
the seven missing decision-log entries, the OAuth scope reversal, the `notes`
table and its tool contract, the single-session spike guardrail's blind spot,
and the stale prose in five spec files. Explicitly NOT covered: implementing
`rocket_add_note` (Stage 6), running the G1 intervals.icu probe (needs Luis's
account), the deferred Stage 7 promptfoo assertion (G12), and revoking the
Strava API application (Luis's account, listed for him instead).

**References:** `docs/reviews/2026-09-07-verification.md` — its "What to fix, in
order" list is this task's spec. `docs/reviews/2026-09-07-response-ledger.md` for
the promises being audited. `docs/reviews/2026-09-06-adversarial-review.md` F7,
F17, F23, F27 for the originating findings.

**Alternative rejected:** netting the race distance out of a race-day session
before the spike check, which the verification recommended for N2. It scores the
~12 km remainder against a 27 km baseline, passes trivially, and hides the
block's largest single session from the rule built to see it. Exempting only a
_pure_ race — one whose distance does not exceed the race's — surfaces the 33 km
at 122% instead. Also rejected: leaving `availability_rules` deferred rather than
struck, now that `notes` with `kind: 'availability'` covers the dated case better
than a recurring-rule table.

**Interface touched:** `singleSessionSpikes()` exemption semantics (behavioural
change, four tests); the write-tool envelope in `04-mcp-surface.md` gains
`applied_rules`; `src/db/schema.ts` gains a sixth, mutable table; migration
`0002_notes.sql`; `.github/workflows/check.yml` loses one line.

**Acceptance criteria:**

- Every command `.github/workflows/check.yml` runs resolves to something that
  exists, checked by parsing the workflow rather than by eye.
- The seven decisions Luis ratified or that were settled on 2026-09-07 each carry
  an appended entry; no prior entry edited.
- The block reports the 33 km on Lincoln day as a breach, naming the race, and
  four tests fail if the date-level exemption is restored.
- `notes` exists, is absent from `APPEND_ONLY_TABLES`, and carries an explicit
  UPDATE/DELETE grant — the default privileges from `0001` grant SELECT and
  INSERT only, so a mutable table that does not say so is silently read-only.
- No dangling reference to `tools/strava_probe` or `STRAVA_SETUP.md` in a live
  document (task files and decision entries recording the deletion are correct).
- All seven gates green, tree clean.

**Assumptions:** that the verification report's line references were accurate at
the commit it read — spot-checked rather than trusted, and two had moved. That
`role: 'dropped'` is the only marker distinguishing a live race from a released
one, so `raceDistanceOn()` filters on it rather than on `LIVE_RACE_DATES`.

---

## Checklist

- [x] N1 — `check.yml` drops the deleted `strava_probe` invocation; ledger row no
      longer promises a mechanism that cannot run; every workflow command verified
      to resolve
- [x] G6 — FIT history backed up outside `~/dev`; `STARTUP_ACCESS.md` count
      corrected 18 → 31 and the backup recorded
- [x] G6 — `STARTUP_ACCESS.md` §5 rewritten: the Strava app step is withdrawn, the
      dangling `STRAVA_SETUP.md` link removed, the revoke action listed for Luis
- [x] N2 — spike exemption narrowed from race DATE to pure race DISTANCE; proven
      by restoring the old form and watching four tests fail
- [x] G13 + G3 + G10 — seven decision entries appended: option A, intervals.icu
      primary, goal-as-a-range, the OAuth reversal, the superseded ramp cap,
      `static_headers`, and the spike-exemption narrowing
- [x] G2 — `notes` table, `0002_notes.sql` with its mutability grant,
      `rocket_add_note` specified, `rocket_get_status` returns open notes,
      `availability_rules` struck rather than deferred
- [x] G11 — `applied_rules` added to the write envelope with the argument for it
- [x] OAuth reversal — register row removed, lift table re-ranked, Stage 5 heading
      and scope line corrected, owner-allowlist criterion made mandatory
- [x] N3 — `03-planner.md` no longer enforces a session for the dropped Dorney
- [x] N4 — pillar (b) no longer claims to be unstarted; the grep it cited returns hits
- [x] N5 — the DHT ingest-pattern reference narrowed to what §5.3 actually reaches
- [x] N6 + G1 — `05-integrations.md` states the ratified Garmin source and the
      Strava withdrawal
- [x] G4 + G5 — `02-load-engine.md` mirrors the readiness caps and the designed
      tense on the two-component model
- [x] G7 — `03-planner.md` names LDNX by date and states the taper holds intensity
- [x] G9 — push port boundary recorded in `tasks/homescreen-app.md`
- [x] Race-date invariant renamed to state the weaker property it guarantees
- [x] All seven gates green, tree clean

## Commits

- `bb088cb` fix: close the gaps the independent verification found
