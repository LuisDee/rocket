# tasks

One file per unit of nontrivial work, created **before** the code, not after.
Slug is human-readable, never a ticket number or spec section (`incident-state-machine.md`,
not `section-4.md`) -- a number means nothing to a reader without the index open.

This replaces a separate `plans/` directory. The design record and the progress
checklist are the same lifecycle event, so they live in one file. But the two
halves behave differently, and that difference is the whole design:

- **The header is write-once.** It is the decision. It does not change after
  review. If it must change, that is itself a decision -- update it and say so,
  do not silently rewrite it as though it was always that way.
- **The checklist churns freely** as work proceeds.

Keep them visually separated (the `---` below) so a checklist edit can never
quietly rewrite the design record.

## Format

```markdown
# <slug>

**Scope boundary:** what this task does and, explicitly, does not cover.
**References:** the spec/design/ticket sections this implements.
**Alternative rejected:** what else was considered, and why it lost.
**Interface touched:** existing module, endpoint, schema, or config this changes.
**Acceptance criteria:** how we know this is done. Observable, not "works".
**Assumptions:** anything the references leave open, and the assumption made --
a gap, flagged, not papered over. "None" if there are none.

---

## Checklist

- [ ] step one
- [ ] step two

## Commits

(populated as work lands)
```

## The header is a mini-spec: write it, then stop

Write the header and **wait for human review before starting the checklist.**
This is the highest-value five minutes in the process. It is where a wrong
assumption costs a sentence instead of a day.

## Why the Assumptions field matters most

It is the anti-invention control. Any nontrivial task will hit something the
references do not settle. Without a designated place to say so, the gap gets
silently filled with a guess that reads exactly like a decision.

If writing the header requires inventing something the references do not say,
that is a gap in the references -- flag it here, do not paper over it.

## Commit traceability

Every commit for this task carries a `Task: tasks/<slug>.md` trailer as the
**last line** of the commit message, and gets appended to this file's
`## Commits` section (`<short-sha> <subject>`, one per line) before it is pushed.

`Task: none` exempts typo fixes and doc edits -- including the bookkeeping commit
that appends to `## Commits`, since a commit cannot record its own SHA.

Both halves are enforced by `guards/check_task_trace.py`: a missing trailer
blocks, and a trailer pointing at a file that does not list the commit also
blocks. One-way references rot.
