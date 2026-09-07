# merge-main

**Scope boundary:** merges `main` (`65fb66b`, `64cea56`) into `feat/m1-core-loop` and
resolves the two hand-resolution conflicts in `docs/specs/03-planner.md` and
`docs/specs/01-domain-model.md`. Covers nothing else: no remediation of any other
ledger finding, no edits to product code, no rewrite of `RACES`, no push.
**References:** `docs/reviews/2026-09-07-response-ledger.md` F3 (branch behind main,
LICENSE/README/vitest exclusion missing) and F33 (`03-planner.md:11` carries the
personal place name main removed); "Do now" table row "F3, F33".
**Alternative rejected:** `git merge -X theirs` or `-X ours`. Either side wins
wholesale and both are wrong: `theirs` resurrects main's stale swim-slot wording
and drops the branch's `RACES`-backed race section; `ours`
keeps the place name main deliberately scrubbed before the repo goes public. The
ledger says the same at F3 detail. Rebase also rejected -- the branch is shared with
concurrent agents, so rewriting its published SHAs would break every task file's
`## Commits` section at once.
**Interface touched:** `docs/specs/03-planner.md`, `docs/specs/01-domain-model.md`
(conflict resolution only); `vitest.config.mts`, `LICENSE`, `README.md`, `.gitignore`
and any other non-conflicting file arrive from main unmodified.
**Acceptance criteria:** a case-insensitive `git grep` for the scrubbed place name is
silent across the worktree, the ledger's verbatim quotation of it included; `LICENSE`
and `README.md` present; `vitest.config.mts` excludes `.worktrees/**` and `npm run test`
collects no file under `.worktrees/`; `git log HEAD..main` empty; the six-evenings /
once-a-week-swim fact still stated in `03-planner.md` without place names; no Dorney
line in `01-domain-model.md`, which points at `config/training.ts` `RACES` instead; all
gates green.
**Assumptions:** the branch side of every non-conflicting hunk in the two spec files is
newer than main's and wins -- main's `65fb66b` only generalised personal details, it did
not revise training content, so any branch/main disagreement outside the scrubbed lines
is branch work postdating main. Dorney stays in `RACES` (role `dropped`, retained on the
record deliberately); only the spec extract loses its line, per the ledger's "`RACES` is
the authority".

---

## Checklist

- [ ] `git merge main`, expect conflicts in the two spec files only
- [ ] Resolve `03-planner.md`: main's line 11 wholesale, six-evenings fact preserved
- [ ] Resolve `01-domain-model.md`: branch structure, Dorney line deleted
- [ ] Verify LICENSE, README, vitest `.worktrees/**` exclusion recovered
- [ ] case-insensitive grep for the scrubbed place name silent, ledger quote included
- [ ] All gates green, then commit

## Commits

(populated as work lands)
