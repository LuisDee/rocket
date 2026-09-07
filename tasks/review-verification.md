# review-verification

**Scope boundary:** an independent, adversarial completeness check of the
2026-09-07 response ledger against the branch as it actually stands at
`7abbafc` — one row per finding F1-F34, per section-6 gap S6.1-S6.10 and per
section-9 housekeeping bullet H1-H3, each verified against the code rather than
against the ledger's assertion about the code. Covers: reading every file the
ledger names, running every gate, and checking Luis's six named spot-checks.
Explicitly does NOT cover: fixing anything. No source, spec, plan, config or
task file other than this one and the report is touched, deliberately — the
verifier that also remediates cannot report on its own work.

**References:** `docs/reviews/2026-09-06-adversarial-review.md` (F1-F34,
section 6's ten-item gap list, section 8's four Luis decisions, section 9's
housekeeping bullets); `docs/reviews/2026-09-07-response-ledger.md` (the
disposition per finding and the "Consolidated actions → Do now" table, whose
rows are the promises this task audits); `AGENTS.md` §2 (a decision landing
without a log entry is a bug) and §3 (task trailers); `tasks/README.md`.

**Alternative rejected:** verifying only the items the ledger classed ACCEPT or
ACCEPT-MODIFIED. Rejected because ALREADY-DONE is the status most likely to be
wrong — it asserts a fact about the repo rather than promising a change, so
nobody re-reads it — and because a REJECT can also be undermined by a later
commit that quietly does the rejected thing anyway. Every row is checked.

**Interface touched:** none. Two new files: this task file and
`docs/reviews/2026-09-07-verification.md`.

**Acceptance criteria:**

- Every F1-F34, S6.1-S6.10 and H1-H3 row carries a verified yes / partial / no
  verdict with a file-and-line citation or a named absence — never "looks fine".
- Every gap names the exact ledger promise it fails against, quoted from the
  do-now table, so the reader can act without re-deriving it.
- Findings whose remediation created a NEW defect are listed separately from
  findings that were simply not delivered; the two need different fixes.
- Luis's six spot-checks (personal place name, LICENSE/README,
  `tools/strava_probe`, the 22/27/33 ladder, long sessions on live race dates,
  `docs/decisions.md` unedited) each get an explicit yes or no, including where
  the literal check fails against a design that was deliberately chosen.
- Gates run by the verifier, not quoted from the ledger: `npm run typecheck`,
  `lint`, `format:check`, `test`, `scripts/check_gate_ledger.py`,
  `scripts/test_guards.py`, `scripts/check_task_trace.py --range main..HEAD`,
  plus a read of `.github/workflows/check.yml` for jobs that cannot pass.
- Working tree clean at the point of verification.

**Assumptions:** the ledger's "Do now" table is the authoritative statement of
what was promised, since the per-finding **Action** paragraphs and that table
agree wherever both speak. Where a do-now row names an owner agent that has not
yet run, the row is still reported as an open gap rather than excused — the
review asked what is in the repo, not who owed it. Rows the ledger classified
under "Deferred past 2026-10-24" with a register entry are checked for the
register row, not for the implementation.

---

## Checklist

- [x] Read the review in full: F1-F34, section 6, section 8, section 9
- [x] Read the response ledger in full, including the rejections table
- [x] Verify each finding against the code, independently of the ledger's claim
- [x] Run every gate on HEAD; read the CI workflow for jobs that cannot pass
- [x] Run Luis's six named spot-checks
- [x] Write `docs/reviews/2026-09-07-verification.md`

## Commits

(populated as work lands)
