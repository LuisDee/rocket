#!/usr/bin/env python3
"""Derive a committable activity summary from the gitignored Garmin capture.

The raw capture (tools/garmin_probe/out/activities_recent.json) holds GPS
polylines, per-zone heart-rate dwell times and running dynamics. None of that
belongs in a public repo, and the page does not need it. This pulls out the six
fields the page renders and nothing else.

    uv run python tools/extract_activity_summary.py

ponytail: a script rather than a build step, because it runs once per probe --
not once per build -- and a snapshot that regenerates on every `next build`
would silently change what is committed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "tools" / "garmin_probe" / "out" / "activities_recent.json"
DEST = ROOT / "src" / "data" / "recent-activities.json"

# Everything the page shows. Anything not on this list is deliberately dropped.
KEEP = ("date", "type", "distanceKm", "movingSeconds", "elapsedSeconds", "name")

RUN_TYPES = {"running", "trail_running", "treadmill_running", "track_running"}


def summarise(activity: dict) -> dict | None:
    """One activity reduced to the fields the page renders, or None to skip."""
    started = activity.get("startTimeLocal") or ""
    type_key = (activity.get("activityType") or {}).get("typeKey") or "unknown"
    if not started:
        return None

    distance_m = activity.get("distance") or 0
    # Garmin reports movingDuration only when it differs from duration; a run
    # with no pauses omits it. Falling back to duration keeps pace honest
    # rather than dividing by zero.
    moving = activity.get("movingDuration") or activity.get("duration") or 0

    return {
        "date": started[:10],
        "type": type_key,
        "distanceKm": round(distance_m / 1000, 2),
        "movingSeconds": round(moving),
        "elapsedSeconds": round(activity.get("elapsedDuration") or moving),
        # The athlete's own activity title. Useful context ("Sóller Running"),
        # and it carries no location precision beyond what he typed himself.
        "name": activity.get("activityName") or "",
    }


def main() -> int:
    if not SOURCE.is_file():
        print(f"no capture at {SOURCE}", file=sys.stderr)
        print("run: uv run python garmin.py probe (from tools/garmin_probe)", file=sys.stderr)
        return 1

    raw = json.loads(SOURCE.read_text())
    rows = [s for s in (summarise(a) for a in raw) if s is not None]
    rows.sort(key=lambda r: r["date"], reverse=True)

    # Fail loudly rather than committing a file that leaked a field.
    for row in rows:
        extra = set(row) - set(KEEP)
        assert not extra, f"summary carries unexpected fields: {extra}"

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(rows, indent=2) + "\n")

    runs = [r for r in rows if r["type"] in RUN_TYPES]
    print(f"{len(rows)} activities ({len(runs)} runs) -> {DEST.relative_to(ROOT)}")
    print(f"date range: {rows[-1]['date']} to {rows[0]['date']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
