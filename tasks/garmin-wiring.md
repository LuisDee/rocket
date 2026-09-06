# garmin-wiring

**Scope boundary:** fold the 2026-08-18 Garmin research into the governing
documents. Covers: correcting three factual errors in `docs/specs/05-integrations.md`,
recording the Fenix 8 confirmation and the superseded token consequence in
`docs/decisions.md`, restructuring the Garmin and backfill content of
`docs/plans/PLAN-2026-001-m1-core-loop.md`, and updating the Garmin heartbeat row
in `docs/ci-gates.md`. Explicitly does NOT cover: writing any Garmin client code,
schema, migration, or sync job. No implementation, documents only.

**References:** the 2026-08-18 four-agent research (journal at
`~/.claude/projects/-Users-luisdeburnay-dev-routr/0f6602a3-b43a-46c6-b392-056cf6dbcf31/subagents/workflows/wf_8bf765f3-dc0/`);
`docs/specs/05-integrations.md:3-11`; `docs/specs/07-wiring-todo.md:6,12-13`;
`docs/decisions.md` (2026-08-15 Vercel/Neon entry); `docs/ci-gates.md:51`.

**Alternative rejected:** editing the 2026-08-15 decision entry in place to
correct its voided token consequence. The decision log is append-only by its own
stated format, and an entry rewritten after the fact records what someone
remembered rather than what happened. Superseded by a new dated entry instead.

**Interface touched:** documents only -- four markdown files plus this task file.
No code, no schema, no config. `config/training.ts` is unchanged:
`SYNC.staleAfterHours` (36) already holds the value the new design needs.

**Acceptance criteria:**

- The three factual errors at `docs/specs/05-integrations.md:4,9` are corrected,
  and the spec still reads as intent rather than mechanism.
- `docs/decisions.md` gains two appended 2026-08-18 entries; no prior entry is
  edited; the superseding entry names the entry it supersedes.
- The plan carries the probe as a gating decision point with both branches
  specified, not as a footnote.
- The plan carries a backfill stage decoupled from the sync, warm-start CTL, and
  the "not worn" vs "not yet synced" distinction.
- `docs/ci-gates.md` Garmin heartbeat row describes the new three-layer design.
- All gates green: typecheck, lint, format:check, test, gate ledger, guard self-test.

**Assumptions:**

- intervals.icu field coverage is UNVERIFIED and must stay hedged in every
  document. It rests on an undated third-party guide plus forum threads, and a
  2026-05-19 bug report shows partial syncs occur.
- The Fenix 8 tiering is taken from Garmin support pages, which the research
  itself rated only medium confidence -- device compatibility lists are the least
  stable thing in the report. The probe output is authoritative over any matrix.

---

## Checklist

- [x] `docs/specs/05-integrations.md` corrected
- [x] `docs/decisions.md` two entries appended
- [x] `docs/plans/PLAN-2026-001-m1-core-loop.md` restructured
- [x] `docs/ci-gates.md` heartbeat row updated
- [x] `docs/specs/07-wiring-todo.md` watch-model item closed
- [x] all gates green, committed

## Commits

- `ad39735` docs: fold the Garmin research into the specs, plan and ledger
