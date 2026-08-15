#!/usr/bin/env python3
"""Prove each guard FAILS on a deliberate violation, and passes on a clean tree.

This is the kit's own core discipline applied to itself. A guard that has only
ever been watched pass is unproven: it might be checking nothing. Every test
here breaks something on purpose and asserts the guard catches it.

Deliberately dependency-free -- no pytest, no fixtures. Run it:

    python3 test_guards.py

Exit 0 means every guard both catches its violation and clears a clean tree.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

# Two layouts must both work: the kit itself (guards live in guards/) and an
# installed repo (install.sh flattens everything into scripts/). Resolving this
# at runtime rather than assuming one layout is what lets the self-test ship
# into a target repo and keep proving the guards there -- which is the whole
# point of shipping it.
_HERE = Path(__file__).resolve().parent
GUARDS = _HERE / "guards" if (_HERE / "guards").is_dir() else _HERE

CLEAN_LEDGER = """# CI gate status

| Gate | Status | Notes |
|---|---|---|
| Lint | IMPLEMENTED | Enforced by: hook:ruff. Proven against a deliberate violation. |
| Type check | IMPLEMENTED | Enforced by: ci:typecheck. |
| Secrets scan | NOT IMPLEMENTED | Reason: no credentials in this repo yet. |
| Branch protection | IMPLEMENTED | Enforced by: external:forge setting, verified 2026-01-01. |
"""

CLEAN_PRECOMMIT = """repos:
  - repo: local
    hooks:
      - id: ruff
        name: ruff
      - id: typecheck
        name: typecheck
"""

CLEAN_CI = """stages:
  - check

variables:
  FOO: bar

ruff:
  stage: check
  script:
    - ruff check .

typecheck:
  stage: check
  script:
    - pyright
"""

results: list[tuple[str, bool, str]] = []


def run(script: str, *args: str) -> tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, str(GUARDS / script), *args],
        capture_output=True, text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def record(name: str, passed: bool, detail: str = "") -> None:
    results.append((name, passed, detail))
    print(f"{'PASS' if passed else 'FAIL'}  {name}")
    if not passed and detail:
        print(f"      {detail}")


def git_repo(root: Path) -> None:
    for args in (
        ["init", "-q"],
        ["config", "user.email", "kit@example.com"],
        ["config", "user.name", "kit"],
        ["config", "commit.gpgsign", "false"],
    ):
        subprocess.run(["git", "-C", str(root), *args], check=True,
                       capture_output=True)


def commit(root: Path, message: str) -> None:
    subprocess.run(["git", "-C", str(root), "add", "-A"], check=True,
                   capture_output=True)
    subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", message],
                   check=True, capture_output=True)


def scaffold(root: Path, ledger: str = CLEAN_LEDGER) -> None:
    (root / "docs").mkdir(parents=True, exist_ok=True)
    (root / "docs" / "ci-gates.md").write_text(ledger)
    (root / ".pre-commit-config.yaml").write_text(CLEAN_PRECOMMIT)
    (root / ".gitlab-ci.yml").write_text(CLEAN_CI)


# --------------------------------------------------------------------------
# check_gate_ledger.py
# --------------------------------------------------------------------------

def test_gate_ledger() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold(root)
        code, out = run("check_gate_ledger.py", "--repo", str(root))
        record("gate_ledger: clean ledger passes", code == 0, out)

    # Violation 1: IMPLEMENTED with no mechanism named. This is the exact defect
    # the guard exists for -- a status that is a claim rather than a gate.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold(root, CLEAN_LEDGER.replace(
            "| Lint | IMPLEMENTED | Enforced by: hook:ruff. Proven against a deliberate violation. |",
            "| Lint | IMPLEMENTED | We ran it once and it was fine. |",
        ))
        code, out = run("check_gate_ledger.py", "--repo", str(root))
        record("gate_ledger: catches IMPLEMENTED with no 'Enforced by'",
               code != 0 and "Enforced by" in out, out)

    # Violation 2: cites a CI job that does not exist.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold(root, CLEAN_LEDGER.replace("ci:typecheck", "ci:nonexistent-job"))
        code, out = run("check_gate_ledger.py", "--repo", str(root))
        record("gate_ledger: catches a cited CI job that does not exist",
               code != 0 and "nonexistent-job" in out, out)

    # Violation 3: cites a path that does not exist.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold(root, CLEAN_LEDGER.replace("hook:ruff", "scripts/does-not-exist.sh"))
        code, out = run("check_gate_ledger.py", "--repo", str(root))
        record("gate_ledger: catches a cited path that does not exist",
               code != 0 and "does not exist" in out, out)

    # Violation 4: NOT IMPLEMENTED with no reason -- a silent absence.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold(root, CLEAN_LEDGER.replace(
            "| Secrets scan | NOT IMPLEMENTED | Reason: no credentials in this repo yet. |",
            "| Secrets scan | NOT IMPLEMENTED | TODO |",
        ))
        code, out = run("check_gate_ledger.py", "--repo", str(root))
        record("gate_ledger: catches NOT IMPLEMENTED with no 'Reason'",
               code != 0 and "Reason" in out, out)

    # Violation 5: a status outside the vocabulary.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        scaffold(root, CLEAN_LEDGER.replace("| Lint | IMPLEMENTED |", "| Lint | mostly done |"))
        code, out = run("check_gate_ledger.py", "--repo", str(root))
        record("gate_ledger: catches an invented status", code != 0, out)

    # Violation 6: no ledger at all.
    with tempfile.TemporaryDirectory() as tmp:
        code, out = run("check_gate_ledger.py", "--repo", tmp)
        record("gate_ledger: catches a missing ledger", code != 0, out)


# --------------------------------------------------------------------------
# check_task_trace.py
# --------------------------------------------------------------------------

def test_task_trace() -> None:
    def repo_with_commit(root: Path, message: str, task_body: str | None = None) -> str:
        git_repo(root)
        if task_body is not None:
            (root / "tasks").mkdir(exist_ok=True)
            (root / "tasks" / "thing.md").write_text(task_body)
        (root / "code.py").write_text("x = 1\n")
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True,
                       capture_output=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", message],
                       check=True, capture_output=True)
        return subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--short=7", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()

    # Trailer present and recorded in the task file. Two-step because the SHA
    # is only knowable after the commit exists.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        sha = repo_with_commit(
            root, "feat: a thing\n\nTask: tasks/thing.md", "# thing\n\n## Commits\n"
        )
        (root / "tasks" / "thing.md").write_text(f"# thing\n\n## Commits\n{sha} feat: a thing\n")
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True, capture_output=True)
        subprocess.run(["git", "-C", str(root), "commit", "-q", "-m",
                        "docs: record commit\n\nTask: none"], check=True, capture_output=True)
        code, out = run("check_task_trace.py", "--repo", str(root), "--range", "HEAD~1..HEAD")
        record("task_trace: 'Task: none' bookkeeping commit passes", code == 0, out)

    # Violation: no trailer at all.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        repo_with_commit(root, "feat: untraceable")
        code, out = run("check_task_trace.py", "--repo", str(root), "--range", "HEAD")
        record("task_trace: catches a missing trailer",
               code != 0 and "trailer" in out, out)

    # Violation: trailer points at a file that does not exist.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        repo_with_commit(root, "feat: a thing\n\nTask: tasks/ghost.md")
        code, out = run("check_task_trace.py", "--repo", str(root), "--range", "HEAD")
        record("task_trace: catches a trailer pointing at a missing file",
               code != 0 and "ghost" in out, out)

    # Violation: task file exists but does not list the commit -- the one-way
    # reference the two-halves rule exists to prevent.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        repo_with_commit(root, "feat: a thing\n\nTask: tasks/thing.md",
                         "# thing\n\n## Commits\n")
        code, out = run("check_task_trace.py", "--repo", str(root), "--range", "HEAD")
        record("task_trace: catches a commit absent from its task file",
               code != 0 and "not recorded" in out, out)

    # The dogfooded regression: a body line starting "Task: " must not be taken
    # as the trailer. Only the LAST non-blank line counts.
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        repo_with_commit(
            root,
            "feat: a thing\n\nTask: trailers are checked as the last line, not\n"
            "the first body line that looks like one.\n\nTask: tasks/ghost.md",
        )
        code, out = run("check_task_trace.py", "--repo", str(root), "--range", "HEAD")
        record("task_trace: reads the LAST line, not a body line that looks like one",
               code != 0 and "ghost" in out, out)


def main() -> int:
    print("Proving each guard fails on a deliberate violation.\n")
    test_gate_ledger()
    test_task_trace()

    failed = [name for name, passed, _ in results if not passed]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    if failed:
        print("\nUnproven guards:")
        for name in failed:
            print(f"  - {name}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
