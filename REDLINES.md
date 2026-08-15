# Redlines

Non-negotiable. A violation blocks the commit or the merge -- it is not a
judgement call, and it is not a warning.

**Scope:** these govern the product -- the load engine, the planner, the MCP
tool surface, the PWA, and the sync jobs. Everything that decides what Luis
runs, or stores what he ran. They do not govern local dev helpers, one-off
scripts under `scripts/`, or the guard tooling itself, which is advisory
infrastructure rather than the audited system.

## The rules

| Rule                                                                                                                                      | Rationale                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No hardcoded training threshold. Every cap, window, weight, ratio, and band is read from `config/training.ts` at evaluation time.         | An adaptive planner _is_ a pile of thresholds. Scattered as literals across route handlers they cannot be audited, tuned mid-block, or explained -- and the spec requires the model stay inspectable (`docs/specs/02-load-engine.md:27`). |
| Logged history is append-only. Adaptation writes new rows; it never edits or deletes a recorded activity, check-in, or completed session. | Training history is the one artefact in this project that cannot be regenerated. You cannot re-run week 3. Enforced in Postgres, not by convention.                                                                                       |
| The daily sync fails loudly. A failed or stale Garmin pull surfaces in `get_status` and never degrades into a silent no-op.               | A sync that dies quietly during taper is the worst outcome this system has, and it is invisible without a heartbeat. The spec already demands staleness be a visible flag (`docs/specs/05-integrations.md:10`).                           |
| Any readiness verdict or plan built on less than one CTL time constant states its own insufficiency.                                      | CTL is a 42-day average. Training data starts 2026-07-05, so every score before roughly mid-September is running on partial history. An amber presented as authoritative when it is guesswork is worse than no amber.                     |
| No secret in source, ever -- including test fixtures and example config.                                                                  | Rotation cost is unbounded once it is in git history. The live risks here are Garmin credentials, the Neon `DATABASE_URL`, and MCP tokens.                                                                                                |
| No unpinned dependency in any pipeline, including the CI tooling itself. Actions pinned by commit SHA, images by digest.                  | A supply-chain compromise arrives through the unpinned scanner in CI, not through the mandated dependency.                                                                                                                                |

## On violation

- **Mechanically checkable** (lint rule, CI guard, git hook): the check
  blocks. No override without editing this file first, in its own reviewed commit.
- **Not yet mechanically checkable**: it still applies, but the gap gets a row in
  [docs/ci-gates.md](docs/ci-gates.md) as `NOT IMPLEMENTED` -- never a silent
  absence.

That second bullet is the whole point. It converts "we should really check this
one day" from a good intention into a tracked row that a reviewer can see.
