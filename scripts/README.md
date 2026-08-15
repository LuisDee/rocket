# guards

Stdlib-only Python 3. No install, no lockfile, no dependency -- each runs on a
bare `python3` in any CI image, which is the point: a guard that needs its own
toolchain is a guard that gets skipped in the image where it matters.

Every guard exits non-zero on violation, prints one line per problem to stderr,
and names the fix in the message rather than making the reader go and find it.

| Guard                     | Enforces                              | Fails when                                                                                                                                               |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check_gate_ledger.py`    | Every claimed gate names its enforcer | An `IMPLEMENTED` row has no `Enforced by:`, or names a path/job/hook that does not exist; a `NOT IMPLEMENTED`/`REJECTED`/`DISABLED` row has no `Reason:` |
| `check_hook_parity.py`    | Local and CI gates match              | A hook has no CI job of that name, or a job has no hook, and the asymmetry is not declared as `Local-only:`/`CI-only:` in the ledger                     |
| `check_task_trace.py`     | Commits trace to work items           | A commit has no `Task:` trailer, or the trailer names a file that does not exist or does not list the commit                                             |
| `check_structure_docs.py` | Directory documentation               | A tracked directory has no `README.md`, or has one under 20 bytes                                                                                        |

`collect_structure_docs.py` is not a guard -- it is the session-start context
loader that prints every README. `check_structure_docs.py` is the gate that keeps
its output meaningful.

## Usage

```bash
python3 scripts/check_gate_ledger.py                     # defaults to cwd
python3 scripts/check_hook_parity.py --repo /path/to/repo
python3 scripts/check_structure_docs.py

# Commit traceability, two modes:
python3 scripts/check_task_trace.py                      # pre-push, reads git stdin
python3 scripts/check_task_trace.py --range origin/main..HEAD   # CI
```

## Configuration

Environment variables, for `check_task_trace.py`:

| Variable                    | Default               | Purpose                                                    |
| --------------------------- | --------------------- | ---------------------------------------------------------- |
| `TASK_TRACE_KEY`            | `Task`                | Trailer key -- set to `Ticket` for a Jira-style convention |
| `TASK_TRACE_BASELINE`       | `task-trace-baseline` | Tag before which history is exempt                         |
| `TASK_TRACE_DEFAULT_BRANCH` | `main`                | Used to pick a range when pushing a new branch             |

File-based, for `check_structure_docs.py`: `.structure-docs-ignore`, one glob per
line, `#` for comments.

## Adding a guard

1. Write it. Stdlib only, `--repo` argument, one line per problem to stderr.
2. **Add a test to `test_guards.py` that proves it catches a violation.** Not
   optional -- a guard with only a passing test may be checking nothing.
3. Wire it in both the hook config and CI, or declare the asymmetry in the ledger.
4. Add its ledger row with `Enforced by:` and what you broke to prove it fails.

Step 2 is the one people skip. Both bugs found on this kit's first self-test run
were in tests that had been written to pass rather than to catch.
