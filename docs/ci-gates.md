# CI gate status

Every gate this project should have, whether or not it exists yet. A needed gate
that is not built is a row marked `NOT IMPLEMENTED`, never an unlisted gap.

Update this table in the same commit that adds, removes, or fixes a gate. A row
more than one merge request stale is itself a finding.

## Rules this table obeys (enforced by `scripts/check_gate_ledger.py`)

- Status is one of: `IMPLEMENTED`, `NOT IMPLEMENTED`, `REJECTED`, `DISABLED`.
  A qualifier may follow: `IMPLEMENTED (local only)`, `DISABLED (was silently broken)`.
- An `IMPLEMENTED` row **must** carry `Enforced by:` naming one of:
  - a repo-relative path that exists (`scripts/foo/check.sh`)
  - `ci:<job-name>` that exists in the CI config
  - `hook:<hook-id>` that exists in `.pre-commit-config.yaml`
  - `external:<description>` for things outside the repo
- A `NOT IMPLEMENTED`, `REJECTED` or `DISABLED` row **must** carry `Reason:`.

The point of the mechanism field: a status is a promise about mechanism. Without
it, "IMPLEMENTED" degrades into "someone checked once", which is how a gate ends
up green for months while enforcing nothing.

## Evidence convention

For each gate, record **how you proved it fails**, not just that it passes. A
gate nobody watched fail is a decoration.

## Local/CI split

There is no local mirror of the CI jobs, by design. The only local hook is
`pre-push`, running task-trace, typecheck and tests -- the three worth catching
before a wasted deploy. Nothing fires on `git commit`. `check_hook_parity.py` was
removed rather than satisfied; see its `REJECTED` row.

## The table

| Gate                                                          | Status          | Notes                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type check (`tsc --noEmit`, strict + 4 extra flags)           | IMPLEMENTED     | Enforced by: ci:typecheck. Proven against a deliberate violation (assigned a string to a `number`), caught, reverted. Also runs on pre-push.                                                                                                                                                                                   |
| Lint (type-aware: floating promises, await-thenable, no-any)  | IMPLEMENTED     | Enforced by: ci:lint. Proven against a deliberate violation (unawaited `pull()` in a void function), caught, reverted. **Negative result:** stock `eslint-config-next` is not type-aware and passed the same probe; `typescript-eslint` with `projectService` was added for it.                                                |
| Formatter enforced in CI (`--check`, not auto-fix)            | IMPLEMENTED     | Enforced by: ci:format-check. Proven against a deliberate violation (unformatted object literal), caught, reverted.                                                                                                                                                                                                            |
| Unit test suite                                               | IMPLEMENTED     | Enforced by: ci:test. Proven against a deliberate violation (week 3 target raised to 95 km, breaking the ramp-cap assertion), caught, reverted. Also runs on pre-push.                                                                                                                                                         |
| Secrets scan                                                  | IMPLEMENTED     | Enforced by: ci:secrets-scan. Gitleaks, SHA-pinned. NOT yet proven against a planted secret -- do so on the first push once a remote exists.                                                                                                                                                                                   |
| Commit-to-task traceability                                   | IMPLEMENTED     | Enforced by: ci:task-trace. Fails closed on pre-push via `.githooks/pre-push`. Proven by `scripts/test_guards.py` (5 deliberate violations incl. missing trailer, dangling task path, commit absent from its task file).                                                                                                       |
| Gate-ledger honesty (this table names its own enforcers)      | IMPLEMENTED     | Enforced by: ci:gate-ledger. Proven by `scripts/test_guards.py` (5 deliberate violations incl. a cited CI job that does not exist and a status with no reason).                                                                                                                                                                |
| Guard self-test (each guard still catches its violation)      | IMPLEMENTED     | Enforced by: ci:guard-self-test. 12/12 green. A broken guard looks exactly like a clean repo, which is why this job exists.                                                                                                                                                                                                    |
| Dependency pinning (lockfile committed, actions SHA-pinned)   | IMPLEMENTED     | Enforced by: ci:test. Every job runs `npm ci`, which fails on lockfile drift; every action in the workflow is pinned by commit SHA with a version comment. NOT yet proven against a deliberately drifted lockfile.                                                                                                             |
| Node version parity (local, CI, Vercel)                       | IMPLEMENTED     | Enforced by: .nvmrc. Pinned to 24 with `engines.node`; Vercel supports 24.x/22.x/20.x only. Caught during setup -- the scaffold defaulted to Node 25, which Vercel cannot run.                                                                                                                                                 |
| Append-only training history (no edit/delete of a logged run) | NOT IMPLEMENTED | Reason: no schema yet. REDLINES.md rule 2, and the single most important gate in the project -- training history cannot be regenerated. Must be a Postgres constraint, not an app-level convention. Owner: the M1 schema task.                                                                                                 |
| Garmin sync heartbeat (a stale pull is loud, not silent)      | NOT IMPLEMENTED | Reason: no sync job yet. REDLINES.md rule 3. `SYNC.staleAfterHours` (36) already sits in `config/training.ts` waiting for it. Owner: the M3 Garmin task.                                                                                                                                                                       |
| CTL warm-up disclosure on readiness verdicts                  | NOT IMPLEMENTED | Reason: no load engine yet. REDLINES.md rule 4. `LOAD.ctlWarmUpDays` already in config. Owner: the M1 load-engine task.                                                                                                                                                                                                        |
| No hardcoded training threshold outside `config/training.ts`  | NOT IMPLEMENTED | Reason: REDLINES.md rule 1 is prose only today -- nothing stops a literal `0.15` appearing in a route handler. Candidate mechanism: a custom eslint rule or a grep guard over `src/`. Wanted before the planner grows past one file.                                                                                           |
| Architectural boundary (MCP tools and PWA share one core)     | NOT IMPLEMENTED | Reason: only one consumer exists, so the rule would be vacuous today. Candidate: `dependency-cruiser`, one forbidden rule. Trigger: the first time an adaptation bug needs the same fix in two places.                                                                                                                         |
| Dependency vulnerability scan                                 | NOT IMPLEMENTED | Reason: pinning is not scanning -- a pinned version can still be a known-vulnerable one. Wanted as a weekly scheduled job, not per-commit.                                                                                                                                                                                     |
| Dependency update path (Renovate/Dependabot)                  | NOT IMPLEMENTED | Reason: pins with no update path rot. Wanted once the repo has a remote.                                                                                                                                                                                                                                                       |
| Integration tests actually run in CI (no silent skip)         | NOT IMPLEMENTED | Reason: no database and no integration tests yet. When they exist CI must fail on skip rather than report green, and the Postgres service image must be digest-pinned -- the kit's own example tag-pins it, contradicting its own rule. Do not copy that part.                                                                 |
| Default-branch protection (no direct push)                    | NOT IMPLEMENTED | Reason: no remote exists yet. Record as `external:` once GitHub is wired. Low value while there is exactly one committer.                                                                                                                                                                                                      |
| Test coverage floor                                           | REJECTED        | Reason: a percentage floor measures lines executed, not behaviour asserted, and is trivially satisfied by bare imports. Replaced by the rule that every gate must be proven to fail. Revisit only if untested paths start biting.                                                                                              |
| Local/CI hook parity                                          | REJECTED        | Reason: `check_hook_parity.py` reads local hook ids only from `.pre-commit-config.yaml` (`_config_readers.py:52-56`). This repo deliberately has no pre-commit framework, and installing a Python hook runner in a Node project to satisfy a parity check is the tail wagging the dog. Guard removed rather than left failing. |
| Structure-doc coverage (README per tracked directory)         | REJECTED        | Reason: a repo this size fits in one head, and the guard fails on a fresh install because `docs/` gets files but no `docs/README.md`. Guard and its `collect_structure_docs.py` companion removed. Re-add when the layout stops being memorable.                                                                               |
| Container image scan + non-root user                          | REJECTED        | Reason: no containers. Deploys to Vercel; the only heavy container in the wider system is routr's GraphHopper, which lives in a separate repo.                                                                                                                                                                                 |
| Cross-model pre-push review                                   | REJECTED        | Reason: ds-lestrade's `gemini-review.sh` fails open, needs an external binary, and costs latency on every push. On a solo project the second model is already in the loop driving the work.                                                                                                                                    |
