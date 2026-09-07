#!/usr/bin/env python3
"""Fail if anything in the product tree talks to the Strava API.

Rocket may read Luis's Strava data through the official Strava MCP connector
and by no other route. It may not call api.strava.com, hold Strava OAuth
credentials, or upload to Strava -- see docs/decisions.md, "the Strava API is
withdrawn" (2026-09-07) and "Strava uploads are prohibited, and the pipeline
ends at the preview" (2026-09-07).

Why a script rather than a sentence in a decision log: the constraint reads like
a preference and looks satisfiable by anyone in a hurry. `POST /api/v3/uploads`
is four lines of `fetch`, it makes a real feature work, and nothing about the
tree resists it. docs/ci-gates.md's own rule applies -- a constraint nobody can
watch fail is a decoration.

What it catches: a Strava hostname in a string, and Strava OAuth credential
names. Those are the two things a Strava HTTP call cannot be written without.
What it deliberately does NOT catch: the word "Strava" in prose, the
`strava_activity_id` column, or `stravaActivityId` -- an activity that came from
Strava is a fact worth recording, and a guard that fires on the word would be
turned off within a day.

    python3 scripts/check_no_strava_api.py

Exit 0 clean, 1 with every offending file:line printed.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Everything that ships or runs. `docs/` and `tasks/` are excluded on purpose:
# they are where the prohibition is written down, so scanning them would make
# the guard fire on its own rationale.
ROOTS = ("src", "config", "tools", "scripts", ".github")
FILES = (".env.example",)

SKIP_DIRS = {"node_modules", ".next", "__pycache__", ".git", "out"}

# This file quotes the patterns it bans.
SELF = Path(__file__).resolve()

PATTERNS = (
    (
        re.compile(r"\bstrava\.com\b", re.IGNORECASE),
        "a Strava API hostname -- rocket reads Strava only through the MCP connector",
    ),
    (
        re.compile(r"\bSTRAVA_(?:CLIENT_ID|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)\b"),
        "a Strava OAuth credential name -- rocket registers no Developer Application",
    ),
    (
        re.compile(r"\bstrava_probe\b"),
        "the withdrawn Strava probe -- removed 2026-09-07 on API Policy 5.3 grounds",
    ),
)


def candidates() -> list[Path]:
    """Every readable file under the scanned roots, self excluded."""
    found: list[Path] = []
    for name in FILES:
        path = REPO_ROOT / name
        if path.is_file():
            found.append(path)
    for root in ROOTS:
        base = REPO_ROOT / root
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file():
                continue
            if SKIP_DIRS & set(path.relative_to(REPO_ROOT).parts):
                continue
            if path.resolve() == SELF:
                continue
            found.append(path)
    return found


def main() -> int:
    failures: list[str] = []
    for path in candidates():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable: no source line hides in it
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pattern, why in PATTERNS:
                if pattern.search(line):
                    rel = path.relative_to(REPO_ROOT)
                    failures.append(f"{rel}:{lineno}: {why}\n    {line.strip()}")

    probe = REPO_ROOT / "tools" / "strava_probe"
    if probe.exists():
        failures.append(
            "tools/strava_probe: reintroduced -- withdrawn 2026-09-07, "
            "see docs/decisions.md"
        )

    if failures:
        print("rocket must not call the Strava API. Found:\n", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        print(
            "\nThe sanctioned read path is the Strava MCP connector, which exposes "
            "reads only.\nUploads are prohibited: API Policy 2026 sections 5.3 and "
            "3.5. See docs/decisions.md.",
            file=sys.stderr,
        )
        return 1

    print(f"no-strava-api: clean ({len(candidates())} files scanned)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
