# plan-option-a

**Scope boundary:** rewrite `docs/plans/PLAN-2026-001-m1-core-loop.md` so the
document on disk describes the scope Luis ratified on 2026-09-07 (option A)
rather than the ten-stage plan written on 2026-08-16. Covers: the option-A
scope cuts and their Deferred-Items Register, per-stage wall-clock budgets and
cut-lines, the MVP restated against the ledger's (a)-(e) foundation
definition, the corrected MCP SDK / `mcp-handler` facts and the Stage 4 pin,
Stage 5's move behind the planner and check-in loop, the two race fixtures on
Stage 7, the re-ranked DoHardThings lift table, the dated anti-static-viewer
gate, the Stage 3b wellness-coverage line, and the withdrawal of open question
4's TSB recommendation. Does NOT cover: any file other than that plan. No
config, spec, REDLINES, ci-gates, decisions, task-file or source change is made
here even where the same finding also calls for one — those rows belong to
other agents and are listed as instructions in the handover.

**References:** `docs/reviews/2026-09-07-response-ledger.md` — the "Do now"
rows F30/F2/F31, F22, F23, F29/S6.8, F25, F32, F21, F14, and their detail
sections; `docs/reviews/2026-09-06-adversarial-review.md` F25's lift table and
F30's option-A definition; Luis's 2026-09-07 ratification of option A.
The ledger is authoritative over the review where the two differ: it verified
against the branch and the npm registry, the review did not.

**Alternative rejected:** renumbering the stages so the running order reads
1..n. Rejected because the stage numbers are identities referenced from
`tasks/*.md`, both review documents and `docs/ci-gates.md`; renaming Stage 6 to
Stage 5 would silently retarget every one of those references. The stage
sections are physically reordered and the deferred ones labelled instead, so a
grep for "Stage 5" still lands on OAuth.

**Interface touched:** `docs/plans/PLAN-2026-001-m1-core-loop.md` only. It is
a plan document with no importers; nothing executes it. Stage numbering, stage
titles and the `Status:` lines are the surfaces other documents reference, and
all three are preserved.

**Acceptance criteria:**

- Stage 3's second store implementation and shared contract suite, and Stage 5
  in its entirety, are struck from the pre-race path and appear in a
  Deferred-Items Register with a classification, a named owner and a
  re-ratification date, per the deferral-closure rule.
- Every surviving pre-race stage carries one line of wall-clock budget and one
  cut-line naming a date and what gets cut if that date passes.
- The MVP section states the foundation as (a)-(e) and names (b), rules as
  cited data, as its only unstarted pillar.
- No sentence in the plan still claims `mcp-handler` was superseded or that
  `@modelcontextprotocol/sdk` is frozen; Stage 4 pins `mcp-handler@1.1.0` and
  `@modelcontextprotocol/sdk@1.29.0` exactly; the Stage 0 SDK spike and zod-3
  probe are gone from both Stage 0 and the Phase 4 todo list.
- The Stage 5 section sits after Stage 7 and is titled as deferred.
- Stage 7's RED block contains a race-added and a race-cancelled case seeded
  from `RACES`, and nothing in the plan proposes an LLM-as-judge tier.
- The DoHardThings lift table is present and ordered wiring, utilities, ingest
  pattern, ICS pair, push stack, OAuth shim.
- The 2026-09-14 gate (`src/data/recent-activities.json` deleted, the page
  reading from Postgres and accepting a check-in) is in the plan with its
  failure consequence stated.
- Open question 4 carries no standing recommendation to gate on TSB.
- All seven gates green: `npm run typecheck`, `lint`, `format:check`, `test`,
  `check_gate_ledger.py`, `test_guards.py`, `check_task_trace.py`.

**Assumptions:** that the review's F25 line counts, which the ledger
spot-checked against DoHardThings' working tree, still hold — the lift table
is reproduced from the review with the ledger's corrections (the push stack is
650 lines, not ~500) rather than re-counted here. That Stage 4's residual risk
is Next 16 rather than the MCP stack: DoHardThings proves
`mcp-handler@1.1.0` + `sdk@1.29.0` in production but on Next 15.5.18, and
rocket is on 16.3.1; this is recorded as the assumption to verify rather than
asserted as proven.

---

## Checklist

- [x] F22: correct the SDK/`mcp-handler` facts at the discovered-facts table, the
      dependency table and the data-flow diagram; delete the Stage 0 SDK spike and
      zod-3 probe; pin Stage 4 to the DoHardThings stack
- [x] F23: move Stage 5 behind Stage 7, retitle it as deferred, fix the pre-mortem
      ordering sentence
- [x] F30/F2/F31: strike Stage 3's second store and contract suite; Deferred-Items
      Register; per-stage budget and cut-line; MVP restated against (a)-(e)
- [x] F25: re-ranked lift table
- [x] F29/S6.8: two race fixtures on Stage 7
- [x] F32: the dated 2026-09-14 gate
- [x] F21: Stage 3b wellness-coverage line
- [x] F14: withdraw open question 4's recommendation
- [x] Gates green, commit, record the SHA below

## Commits

- `54f55a5` — docs: rewrite PLAN-2026-001 for option A and correct the MCP
  stack facts. All nine checklist items; seven gates green before commit
  (`typecheck`, `lint`, `format:check`, `test`, `check_gate_ledger.py`,
  `test_guards.py` 12/12, `check_task_trace.py --range main..HEAD`).
- `bc9c3e5` — docs: resolve the out-of-scope contradiction the F32 gate creates.
  The scope block still read "MCP is the only interface in M1" against a gate
  requiring the page to accept a check-in by 2026-09-14.
