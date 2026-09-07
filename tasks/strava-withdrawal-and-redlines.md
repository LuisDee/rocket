# strava-withdrawal-and-redlines

**Scope boundary:** the governance and licence half of the 2026-09-07 response
ledger's do-now list — findings F17, F4, F10, F11 and F14. Covers: deleting the
Strava API probe and its setup doc on ToS grounds, two new `REDLINES.md` rules
with their `docs/ci-gates.md` companion rows, a third ledger row for "no decision
reads TSB", one process line in `AGENTS.md`, and the decision entry recording the
Strava withdrawal. Explicitly does NOT cover: `docs/specs/05-integrations.md` and
`docs/specs/07-wiring-todo.md` (owned by the specs agent), `.github/workflows/check.yml`
and `docs/STARTUP_ACCESS.md` (unowned by this task), `docs/plans/PLAN-2026-001-m1-core-loop.md:151`
and `docs/specs/02-load-engine.md` (F14's document edits, owned by the plan and
spec partitions), revoking the live Strava application or its `pass` entries
(Luis's, not an agent's), and `tasks/preview-and-ship.md`'s Strava upload path.

**References:** `docs/reviews/2026-09-07-response-ledger.md` — F17 (§274-282),
F4 (§118-126), F10 (§190-198), F11 (§202-210), F14 (§238-246), and the
"Consolidated actions → Do now" table. Primary source for F17:
<https://www.strava.com/legal/api_policy> §5.3, effective 2026-06-01.
`AGENTS.md` rules 4 and 6; `REDLINES.md` "On violation".

**Alternative rejected:** keeping `tools/strava_probe/` behind a comment saying
"unused, do not wire". Rejected because §5.3 prohibits the API materials in
connection with the _operation_ of an AI application, not merely their use, and a
registered application holding a live refresh token is operation; and because
dead code with a licence liability is the worst of both — it cannot be relied on
and it cannot be forgotten. Also rejected: amending the `docs/decisions.md`
2026-09-06 correction entry to point forward at the new redline, which the ledger
asks for at F10 but which the append-only rule forbids; the link is made in the
redline's own rationale instead, which is the direction a reader travels anyway.

**Interface touched:** `REDLINES.md` (two rows appended), `docs/ci-gates.md`
(three rows added, one row corrected), `AGENTS.md` §3 (one line), `docs/decisions.md`
(one entry appended), `tasks/integration-harness.md` (header amended and said so,
per `tasks/README.md`). Deleted: `tools/strava_probe/`, `docs/STRAVA_SETUP.md`.
No application code, no schema, no config.

**Acceptance criteria:**

- `grep -ri strava` returns no hit under `tools/`, and `docs/STRAVA_SETUP.md` is gone.
- `REDLINES.md` carries a rule that aggregates are computed by code from the full
  series with their window stated, and a rule that session and week rows are
  written only by the deterministic planner. Each has a matching
  `NOT IMPLEMENTED` row in `docs/ci-gates.md` carrying a `Reason:`.
- `docs/ci-gates.md` carries a `NOT IMPLEMENTED` row for "no decision reads TSB",
  and its integration-harness row no longer claims to run a directory that does
  not exist.
- `AGENTS.md` §3 states the explicit-paths staging rule with its originating
  incident appended, per rule 6.
- `docs/decisions.md` carries an entry quoting §5.3 verbatim with its URL and the
  MCP carve-out, and naming the actions left to Luis.
- All repo gates green: `npm run typecheck && npm run lint && npm run format:check
&& npm run test`, `scripts/check_gate_ledger.py`, `scripts/test_guards.py`,
  `scripts/check_task_trace.py --range main..HEAD`.

**Assumptions:**

- The Strava MCP carve-out covers Claude reading Luis's own Strava data on his own
  subscription. Verified live: the connector's eligibility check returns full
  access. This task removes rocket's _API_ credentials only; the MCP path is
  untouched and unaffected.
- `.github/workflows/check.yml:120` runs `uv run --directory tools/strava_probe
pytest -q` and will fail once that directory is deleted. That file is outside
  this task's ownership, so the line is handed over as a precise instruction
  rather than removed here. **The `harness-tests` CI job is red until it lands.**
- `docs/STARTUP_ACCESS.md` §5 links `STRAVA_SETUP.md` and will dangle for the same
  reason. Also handed over.

---

## Checklist

- [x] Delete `tools/strava_probe/` and `docs/STRAVA_SETUP.md`
- [x] Amend `tasks/integration-harness.md` — Strava half withdrawn, header change noted
- [x] `REDLINES.md` — computed-aggregates rule (F10), deterministic-planner rule (F11)
- [x] `docs/ci-gates.md` — three `NOT IMPLEMENTED` rows, harness row corrected
- [x] `AGENTS.md` §3 — explicit-paths staging line (F4)
- [x] `docs/decisions.md` — Strava withdrawal entry citing §5.3
- [x] All gates green

## Commits

(populated as work lands)
