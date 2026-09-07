#!/usr/bin/env python3
"""Pin rocket's Strava API surface to the two files allowed to have one.

Until 2026-09-07 this guard banned the Strava API outright. Luis then overrode
Strava API Policy 2026 section 5.3 in the open -- see docs/decisions.md, "the
Strava upload is built anyway" -- so an outright ban would now be a guard that
contradicts a ratified decision, and the first person to hit it would delete it.

The override is bounded, and this is what enforces the bound:

  * rocket UPLOADS an approved file, and does nothing else with the API. Reads
    still go through the Strava MCP connector (section 3.5), which is why the
    sanctioned endpoint list below contains no read endpoint.
  * exactly three files may hold Strava credentials or API endpoints. A fourth
    is how "one bounded upload" quietly becomes "rocket uses the Strava API".

What it catches
  * a Strava hostname or OAuth credential name in any file outside the pin
  * a Strava endpoint inside the pinned files that is not one of the three
    sanctioned ones -- `api/v3/athlete` or `api/v3/activities` fails here, and
    that is the check that keeps a write-only override write-only
  * `tools/strava_probe/` reappearing (withdrawn 2026-09-07)

What it deliberately does NOT catch
  * the word "Strava" in prose, `strava_activity_id`, `stravaActivityId`, or a
    comment recalling the withdrawn probe. A guard that fires on the word gets
    switched off within a day.
  * `strava.com/activities/<id>` anywhere -- a deep link to Luis's own run on
    the web is not an API call, and the approval screen shows one after a
    successful upload.

    python3 scripts/check_no_strava_api.py

Exit 0 clean, 1 with every offending file:line printed.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Everything that ships or runs. `docs/` and `tasks/` are excluded on purpose:
# they are where the decision is written down, so scanning them would make the
# guard fire on its own rationale.
ROOTS = ("src", "config", "tools", "scripts", ".github")
FILES = (".env.example",)

SKIP_DIRS = {"node_modules", ".next", "__pycache__", ".git", "out"}

# This file quotes the patterns it bans.
SELF = Path(__file__).resolve()

# The pin. Adding a path here is a deliberate widening of the override and
# belongs in docs/decisions.md, not in a commit that happens to touch this file.
PINNED = {
    "src/lib/strava.ts": "the upload client",
    "src/lib/strava.test.ts": "its tests, which stub the credential names",
    "scripts/strava-auth.mts": "the one-off authorise CLI",
}

# Every Strava URL a pinned file may contain. Upload and the OAuth handshake
# that makes it possible -- no read endpoint, by design.
SANCTIONED_ENDPOINTS = (
    "strava.com/oauth/token",
    "strava.com/oauth/authorize",
    "strava.com/api/v3/uploads",
)

# A link to an activity page on the web. Not the API; allowed everywhere.
WEB_LINK = re.compile(r"strava\.com/activities/", re.IGNORECASE)

HOSTNAME = re.compile(r"\bstrava\.com\b", re.IGNORECASE)
CREDENTIAL = re.compile(
    r"\bSTRAVA_(?:CLIENT_ID|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)\b"
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


def check_pinned(rel: str, line: str) -> str | None:
    """Inside the pin, only the sanctioned endpoints are allowed."""
    if not HOSTNAME.search(line) or WEB_LINK.search(line):
        return None
    if any(endpoint in line.lower() for endpoint in SANCTIONED_ENDPOINTS):
        return None
    return (
        f"a Strava endpoint that is not one of {', '.join(SANCTIONED_ENDPOINTS)} "
        f"-- the override in docs/decisions.md covers uploading an approved file "
        f"and nothing else; reads go through the MCP connector"
    )


def check_unpinned(rel: str, line: str) -> str | None:
    """Outside the pin, no hostname and no credential at all."""
    if HOSTNAME.search(line) and not WEB_LINK.search(line):
        return (
            "a Strava API hostname outside the pin -- the Strava client is "
            f"{', '.join(sorted(PINNED))}"
        )
    if CREDENTIAL.search(line):
        return (
            "a Strava OAuth credential name outside the pin -- only "
            f"{', '.join(sorted(PINNED))} may hold one"
        )
    return None


def main() -> int:
    failures: list[str] = []
    for path in candidates():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable: no source line hides in it
        rel = str(path.relative_to(REPO_ROOT))
        check = check_pinned if rel in PINNED else check_unpinned
        for lineno, line in enumerate(text.splitlines(), start=1):
            why = check(rel, line)
            if why is not None:
                failures.append(f"{rel}:{lineno}: {why}\n    {line.strip()}")

    probe = REPO_ROOT / "tools" / "strava_probe"
    if probe.exists():
        failures.append(
            "tools/strava_probe: reintroduced -- withdrawn 2026-09-07, "
            "see docs/decisions.md"
        )

    if failures:
        print("rocket's Strava API surface is pinned. Found:\n", file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        print(
            "\nrocket uploads an approved file and reads nothing through the API "
            "(docs/decisions.md,\n\"the Strava upload is built anyway\", 2026-09-07). "
            "Widening that is a decision,\nnot a diff: record it before adding a "
            "path to PINNED.",
            file=sys.stderr,
        )
        return 1

    print(
        f"no-strava-api: clean ({len(candidates())} files scanned, "
        f"{len(PINNED)} pinned)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
