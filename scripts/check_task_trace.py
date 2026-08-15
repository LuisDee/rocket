#!/usr/bin/env python3
"""Every commit traces to a work item, and that work item knows about it.

Ported from a bash original, with its dogfooded bug fixes preserved:

  - The trailer is the LAST non-blank line, not the first body line matching
    the shape. A `grep -m1` version once matched a sentence in the commit body
    that happened to begin "Task: ..." and ignored the real trailer below it.
  - Merge commits are exempt. Their content is other commits, each already
    checked on its own branch; without this, merging the default branch into a
    feature branch before push -- an ordinary operation -- always fails.
  - A baseline tag exempts history that predates the convention, so this can be
    adopted mid-project without rewriting anything.

Both halves are enforced: a missing trailer blocks, and a trailer pointing at a
work item that does not list the commit also blocks. One-way references rot.

Two modes:
  pre-push (default)  reads git's stdin contract: <local ref> <sha> <remote ref> <sha>
  --range <rev-range> checks exactly that range, for CI on a merge request

Fails closed. No network, no external tool, so there is no infra-flake excuse.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ZERO_SHA = "0" * 40
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"

TRAILER_KEY = os.environ.get("TASK_TRACE_KEY", "Task")
BASELINE_TAG = os.environ.get("TASK_TRACE_BASELINE", "task-trace-baseline")
DEFAULT_BRANCH = os.environ.get("TASK_TRACE_DEFAULT_BRANCH", "main")
EXEMPT_VALUE = "none"


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def git_ok(repo: Path, *args: str) -> bool:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True,
    ).returncode == 0


def trailer_of(repo: Path, sha: str) -> str | None:
    """The trailer value, or None. Last non-blank line only -- see module docs."""
    body = git(repo, "log", "-1", "--format=%B", sha)
    lines = [line for line in body.splitlines() if line.strip()]
    if not lines:
        return None
    match = re.match(rf"^{re.escape(TRAILER_KEY)}:\s*(.+?)\s*$", lines[-1])
    return match.group(1) if match else None


def check_range(repo: Path, rev_range: str) -> list[str]:
    args = ["rev-list", "--no-merges", rev_range]
    if git_ok(repo, "rev-parse", "--verify", "--quiet", BASELINE_TAG):
        args.append(f"^{BASELINE_TAG}")

    problems: list[str] = []
    for sha in git(repo, *args).splitlines():
        if not sha.strip():
            continue
        short = git(repo, "rev-parse", "--short=7", sha)
        subject = git(repo, "log", "-1", "--format=%s", sha)
        where = f"commit {short} ({subject!r})"

        value = trailer_of(repo, sha)
        if value is None:
            problems.append(
                f"{where} has no {TRAILER_KEY!r} trailer. Add "
                f"'{TRAILER_KEY}: tasks/<slug>.md' as the last line, or "
                f"'{TRAILER_KEY}: {EXEMPT_VALUE}' for a typo or doc-only change."
            )
            continue
        if value == EXEMPT_VALUE:
            continue

        target = repo / value
        if not target.is_file():
            problems.append(f"{where} references {value!r}, which does not exist.")
            continue
        if short not in target.read_text():
            problems.append(
                f"{where} claims {value!r} but is not recorded in that file's "
                "'## Commits' section. Add it before pushing."
            )
    return problems


def ranges_from_stdin(repo: Path) -> list[str]:
    ranges: list[str] = []
    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 4:
            continue
        local_ref, local_sha, _remote_ref, remote_sha = parts
        if local_sha == ZERO_SHA:          # branch deletion
            continue
        if local_ref.startswith("refs/tags/"):  # a tag is a pointer, not new code
            continue
        if remote_sha == ZERO_SHA:         # new branch: diff from the default branch
            base = ""
            if git_ok(repo, "show-ref", "--verify", "--quiet",
                      f"refs/remotes/origin/{DEFAULT_BRANCH}"):
                try:
                    base = git(repo, "merge-base", f"origin/{DEFAULT_BRANCH}", local_sha)
                except subprocess.CalledProcessError:
                    base = ""
            ranges.append(f"{base or EMPTY_TREE}..{local_sha}")
        else:
            ranges.append(f"{remote_sha}..{local_sha}")
    return ranges


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".")
    parser.add_argument("--range", dest="rev_range", help="check this range, for CI")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    try:
        repo = Path(git(repo, "rev-parse", "--show-toplevel"))
    except subprocess.CalledProcessError:
        print("check-task-trace: not a git repository", file=sys.stderr)
        return 1

    rev_ranges = [args.rev_range] if args.rev_range else ranges_from_stdin(repo)
    problems = [p for r in rev_ranges for p in check_range(repo, r)]

    for problem in problems:
        print(f"check-task-trace: {problem}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
