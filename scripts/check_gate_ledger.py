#!/usr/bin/env python3
"""Every claimed gate must name the thing that enforces it.

The failure this exists to prevent: a gate ledger row reading IMPLEMENTED when
nothing re-checks the claim. That is not a hypothetical -- it is the exact
defect found in the repo this kit was extracted from, where "README.md per
directory | IMPLEMENTED" described a one-time manual pass, and 26 directories
had drifted uncovered by the time anyone looked.

The rule: a status is a promise about mechanism, so it must cite mechanism.

  IMPLEMENTED*      -> must carry `Enforced by: <ref>`
  NOT IMPLEMENTED   -> must carry `Reason: <text>`
  REJECTED          -> must carry `Reason: <text>`
  DISABLED          -> must carry `Reason: <text>`

`<ref>` is one of:
  a repo-relative path      -- must exist on disk
  ci:<job-name>             -- must appear as a job in the CI config
  hook:<hook-id>            -- must appear as a hook id in .pre-commit-config.yaml
  external:<description>    -- an escape hatch for things outside the repo
                               (branch protection, an IT-managed binary), which
                               is deliberately unverifiable but explicitly so

Zero dependencies -- stdlib only, so it runs on a bare python3 in any CI image.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _config_readers import ci_job_names, hook_ids  # noqa: E402

STATUS_NEEDS_MECHANISM = ("IMPLEMENTED",)
STATUS_NEEDS_REASON = ("NOT IMPLEMENTED", "REJECTED", "DISABLED")
KNOWN_STATUSES = STATUS_NEEDS_REASON + STATUS_NEEDS_MECHANISM

# End the ref at a sentence break (". ") or end of cell, not at any period:
# cutting at the first period made every dotted filename uncitable --
# "garmin_guard.py" parsed as "garmin_guard" and failed to resolve.
ENFORCED_BY = re.compile(r"Enforced by:\s*([^|]+?)(?:\.\s|\.$|$)", re.MULTILINE)
REASON = re.compile(r"Reason:\s*\S+")
HOOK_ID = re.compile(r"^\s*-\s*id:\s*(\S+)", re.MULTILINE)


def parse_rows(ledger: str) -> list[tuple[int, str, str, str]]:
    """Return (line_no, gate, status, notes) for each markdown table body row."""
    rows: list[tuple[int, str, str, str]] = []
    for line_no, line in enumerate(ledger.splitlines(), start=1):
        stripped = line.strip()
        if not stripped.startswith("|") or not stripped.endswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 3:
            continue
        # Skip the header and its |---|---| separator.
        if cells[0].lower() == "gate" or set(cells[0]) <= {"-", ":", " "}:
            continue
        rows.append((line_no, cells[0], cells[1], " ".join(cells[2:])))
    return rows


def status_family(status: str) -> str | None:
    """IMPLEMENTED, or 'IMPLEMENTED (local only)', both map to IMPLEMENTED.

    Longest match first so 'NOT IMPLEMENTED' never matches as 'IMPLEMENTED'.
    """
    upper = status.upper()
    for known in sorted(KNOWN_STATUSES, key=len, reverse=True):
        if upper.startswith(known):
            return known
    return None


def ci_job_names(repo: Path) -> set[str]:
    """Job names from a GitLab or GitHub Actions config, best-effort.

    Regex rather than a YAML parse, deliberately: this must run with no
    dependencies, and a job name is a top-level (or under `jobs:`) key. A false
    positive here only ever makes the check more permissive, never wrongly red.
    """
    names: set[str] = set()
    reserved = {
        "stages", "include", "variables", "default", "workflow",
        "image", "services", "before_script", "after_script", "cache",
        "name", "on", "jobs", "env", "permissions", "concurrency", "defaults",
    }
    for path in (repo / ".gitlab-ci.yml", repo / ".gitlab-ci.yaml"):
        if path.is_file():
            for match in re.finditer(r"^([A-Za-z][\w.-]*):", path.read_text(), re.MULTILINE):
                if match.group(1) not in reserved:
                    names.add(match.group(1))
    workflows = repo / ".github" / "workflows"
    if workflows.is_dir():
        for path in sorted(workflows.glob("*.y*ml")):
            text = path.read_text()
            if (jobs := re.search(r"^jobs:\s*$", text, re.MULTILINE)) is None:
                continue
            for match in re.finditer(
                r"^  ([A-Za-z][\w.-]*):", text[jobs.end():], re.MULTILINE
            ):
                names.add(match.group(1))
    return names


def hook_ids(repo: Path) -> set[str]:
    config = repo / ".pre-commit-config.yaml"
    if not config.is_file():
        return set()
    return set(HOOK_ID.findall(config.read_text()))


def check_ref(ref: str, repo: Path, jobs: set[str], hooks: set[str]) -> str | None:
    """Return an error string, or None if the reference resolves."""
    ref = ref.strip().rstrip(".,;").strip("`")
    if ref.startswith("external:"):
        return None
    if ref.startswith("ci:"):
        job = ref[len("ci:"):].strip()
        if job not in jobs:
            return f"cites CI job {job!r}, which is not defined in any CI config"
        return None
    if ref.startswith("hook:"):
        hook = ref[len("hook:"):].strip()
        if hook not in hooks:
            return f"cites hook {hook!r}, which is not in .pre-commit-config.yaml"
        return None
    if not (repo / ref).exists():
        return f"cites path {ref!r}, which does not exist"
    return None


def check(repo: Path, ledger_path: Path) -> list[str]:
    if not ledger_path.is_file():
        return [f"{ledger_path} does not exist -- the gate ledger is mandatory"]

    rows = parse_rows(ledger_path.read_text())
    if not rows:
        return [f"{ledger_path} has no table rows -- an empty ledger is not a clean state"]

    jobs, hooks = ci_job_names(repo), hook_ids(repo)
    problems: list[str] = []

    for line_no, gate, status, notes in rows:
        where = f"{ledger_path.name}:{line_no} [{gate}]"
        family = status_family(status)
        if family is None:
            problems.append(
                f"{where}: status {status!r} is not one of {', '.join(KNOWN_STATUSES)}"
            )
            continue
        if family in STATUS_NEEDS_REASON:
            if not REASON.search(notes):
                problems.append(f"{where}: {family} rows must carry 'Reason: <text>'")
            continue
        refs = ENFORCED_BY.findall(notes)
        if not refs:
            problems.append(
                f"{where}: {family} rows must carry 'Enforced by: <path|ci:job|"
                f"hook:id|external:desc>' -- a status with no mechanism is a claim, not a gate"
            )
            continue
        for ref in refs:
            if (error := check_ref(ref, repo, jobs, hooks)) is not None:
                problems.append(f"{where}: {error}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="repo root (default: cwd)")
    parser.add_argument(
        "--ledger", default="docs/ci-gates.md", help="path to the gate ledger"
    )
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    problems = check(repo, repo / args.ledger)
    for problem in problems:
        print(f"check-gate-ledger: {problem}", file=sys.stderr)
    if problems:
        print(
            f"\ncheck-gate-ledger: {len(problems)} problem(s). "
            "Every claimed gate names what enforces it, or it is not a gate.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
