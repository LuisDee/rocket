# repo-scaffold

**Scope boundary:** stand up the repository, its quality gates, and the training
threshold config. Covers: git init, the spec pack as source of truth, a Next.js
app skeleton, typecheck/lint/format/test gates, the discipline-kit guards, the
gate ledger and decision log, and `config/training.ts`. Explicitly does NOT
cover: any domain code (load engine, planner, MCP tools), the database schema,
migrations, Garmin, DoHardThings, routr, or the PWA. Those belong to M1 and
later, and each gets its own task.

**References:** `docs/specs/00-overview.md` through `07-wiring-todo.md`;
`~/dev/ds-lestrade` (governance model); `~/dev/discipline-kit` (portable
extraction of it); `~/dev/DoHardThings` (the porting source for MCP, OAuth and
PWA, not yet drawn on).

**Alternative rejected:** absorbing routr into a monorepo, and adopting
discipline-kit wholesale. Both recorded with reasoning in `docs/decisions.md`
(2026-08-15). Also rejected: scaffolding no gates at all to save time against the
70-day clock -- the gates cost roughly two hours once, and the failure modes they
catch (a silent sync, an overwritten training history) are the ones that cannot
be recovered from.

**Interface touched:** none. Greenfield.

**Acceptance criteria:**

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test` all
  green from a clean tree.
- `python3 scripts/check_gate_ledger.py` and `python3 scripts/test_guards.py`
  both exit 0.
- Every `IMPLEMENTED` row in `docs/ci-gates.md` names an enforcer that resolves,
  and every non-implemented row carries a reason.
- Each of the four stack gates has been observed failing on a deliberate
  violation, with the violation recorded in its ledger row.
- Node version agrees across `.nvmrc`, `engines.node`, and what Vercel supports.
- `config/training.ts` holds every threshold the specs name, each with a comment
  and a `PROVISIONAL` entry in `docs/decisions.md`.
- The two open spec defects are recorded as decisions, not silently resolved.

**Assumptions:**

- Next.js on Vercel is the target stack, reusing DoHardThings as the porting
  source. Not yet ratified in writing by Luis beyond the hosting choice.
- `35` as `returningFromRestRampCapPct` is a placeholder chosen to make the seed
  block expressible, not a training judgement. See the PROVISIONAL decision.
- The repo has no remote yet, so branch protection and the secrets-scan proof are
  deferred to first push.

---

## Checklist

- [x] `git init`, spec pack committed as `docs/specs/`
- [x] Next.js scaffold merged in, `strict` plus the four extra tsconfig flags
- [x] Node pinned to 24.x across `.nvmrc` and `engines`
- [x] discipline-kit installed with `--hooks`; two guards rejected and logged
- [x] `REDLINES.md` rewritten for rocket (6 rules)
- [x] `AGENTS.md` merged below Next's generated block
- [x] `config/training.ts` plus `config/training.test.ts` (12 assertions)
- [x] type-aware eslint added after the stock config failed its probe
- [x] `.github/workflows/check.yml`, every action SHA-pinned
- [x] `.githooks/pre-push` runs task-trace, typecheck, tests
- [x] `docs/ci-gates.md` filled in with evidence per row
- [x] `docs/decisions.md` seeded with 9 entries
- [ ] first feature worktree created, ready for M1

## Commits

(populated as work lands)
