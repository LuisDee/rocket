"""Poll Garmin for new runs, crop and inspect them, queue them for review.

Runs on Luis's MacBook every 30 minutes. One activity at a time, guard-respecting,
and it stops at the queue: rocket does not upload to Strava (their API policy 5.3
prohibits it -- see docs/decisions.md, 2026-09-07), so the last step is a human
tapping download on the approval screen.

    uv run ingest.py --once      one pass, then exit
    uv run ingest.py --status    what the guard would allow right now

The pipeline per activity:

    Garmin activity list  ->  original FIT (a ZIP, per the library's own docstring)
      ->  routr's cropper  ->  routr's forensic inspector  ->  a `pending` row

Three things here exist because they bit someone already:

  * The cropper EXITS 1 on a run with no timer pauses, having written nothing.
    That is not an error -- it is most treadmill runs. `subprocess.run(check=True)`
    would treat it as a crash and silently drop them, so exit 1 is handled as a
    real outcome: copy the source to the resolved path, set cropApplied False.
  * The output filename convention lives only in routr's fit-cropper agent prose,
    which a subprocess does not inherit. The cropper's own default is
    `~/Downloads/<date>_<km>.fit` -- wrong separator, no name, wrong directory --
    so --output is always passed explicitly.
  * ORIGINAL returns a ZIP. The library's docstring says so outright: "For
    'Original' will return the zip file content, up to user to extract it."
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import unicodedata
import subprocess
import sys
import uuid
import zipfile
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
PROBE = HERE.parent / "garmin_probe"
sys.path.insert(0, str(PROBE))

from garmin_guard import GarminGuard, RateLimitGuard  # noqa: E402

# routr is a read-only dependency, pinned so a cropper change cannot silently
# alter what lands in the queue. Bump deliberately, with a re-run of the tests.
ROUTR = Path.home() / "dev" / "routr"
ROUTR_BACKEND = ROUTR / "backend"
ROUTR_PYTHON = ROUTR_BACKEND / ".venv" / "bin" / "python"
ROUTR_PINNED_COMMIT = "be825a9"

JOB = "garmin-ingest"
GUARD = GarminGuard()


# --------------------------------------------------------------------------- db


def db_url() -> str:
    """Pooled URL for ordinary reads and writes. Migrations use the direct host."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    r = subprocess.run(
        ["pass", "show", "neon/database-url"], capture_output=True, text=True, timeout=30
    )
    if r.returncode != 0 or not r.stdout.strip():
        raise SystemExit("no DATABASE_URL and `pass show neon/database-url` failed")
    return r.stdout.strip().splitlines()[0]


def known_ids(conn: Any) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("select garmin_activity_id from ingested_activities")
        return {r[0] for r in cur.fetchall()}


def insert_row(conn: Any, row: dict[str, Any]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into ingested_activities
              (garmin_activity_id, status, activity_name, started_at,
               original_fit, cropped_fit, cropped_filename,
               crop_summary, forensic_report, error)
            values (%(id)s, %(status)s, %(name)s, %(started_at)s,
                    %(original)s, %(cropped)s, %(filename)s,
                    %(summary)s, %(report)s, %(error)s)
            on conflict (garmin_activity_id) do nothing
            """,
            row,
        )
    conn.commit()


def heartbeat(conn: Any, ok: bool, detail: str, summary: dict[str, Any]) -> None:
    """One row per run, success or failure.

    REDLINES rule 3: the sync fails loudly. A pipeline that stops silently looks
    exactly like a week with no runs in it, which is the one week you would want
    to know about.
    """
    with conn.cursor() as cur:
        cur.execute(
            "insert into sync_runs (id, job, ok, detail, summary) "
            "values (%s, %s, %s, %s, %s)",
            (str(uuid.uuid4()), JOB, ok, detail, json.dumps(summary)),
        )
    conn.commit()


# ----------------------------------------------------------------------- naming

_SLUG = re.compile(r"[^a-z0-9]+")


# Garmin's typeKey covers running, treadmill_running, trail_running, track_running,
# indoor_running and virtual_running. A hike or a swim has no business in a pipeline
# whose cropper and forensic checks are both tuned for running.
RUN_TYPES = frozenset({
    "running", "treadmill_running", "trail_running", "track_running",
    "indoor_running", "virtual_running", "obstacle_run", "ultra_run",
})


def is_run(activity: dict) -> bool:
    """True for running activities only. Everything else is skipped, not failed."""
    key = ((activity.get("activityType") or {}).get("typeKey") or "").lower()
    return key in RUN_TYPES


def slugify(name: str | None) -> str:
    """`run` unless the activity carries a real title.

    Garmin names an untitled run for its location and type ("Colindale Running"),
    which is a title in the sense the convention means -- so only a blank or
    missing name falls back.
    """
    # Fold accents to their ASCII base first. Without this, "Sóller Running"
    # slugs to "s-ller-running" -- the accented letter is not [a-z0-9] so it
    # becomes a separator, silently mangling the name of a real run.
    folded = unicodedata.normalize("NFKD", (name or "").strip().lower())
    folded = folded.encode("ascii", "ignore").decode("ascii")
    slug = _SLUG.sub("-", folded).strip("-")
    return slug or "run"


def output_name(activity_name: str | None, start_local: str, distance_km: float) -> str:
    """`<name>-<date>-<distance>.fit`, distance to exactly two decimals.

    From routr's CLAUDE.md via its fit-cropper agent. The cropper cannot produce
    this itself -- its default is `~/Downloads/<date>_<km>.fit` -- so we resolve
    it and always pass --output.
    """
    date = start_local[:10]
    return f"{slugify(activity_name)}-{date}-{distance_km:.2f}km.fit"


# ------------------------------------------------------------------------- fit


def unwrap_fit(blob: bytes) -> bytes:
    """A Garmin ORIGINAL download is a ZIP holding one FIT. Return the FIT.

    Tolerates a bare FIT too, so a future library change that stops zipping does
    not break this. A FIT file's bytes 8-11 are the ASCII `.FIT` signature, which
    is what makes the check cheap and unambiguous.
    """
    if blob[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            fits = [n for n in z.namelist() if n.lower().endswith(".fit")]
            if len(fits) != 1:
                raise ValueError(f"expected one .fit in the zip, found {len(fits)}")
            blob = z.read(fits[0])
    if blob[8:12] != b".FIT":
        raise ValueError("downloaded bytes are not a FIT file")
    return blob


def fit_meta(path: Path) -> dict[str, Any]:
    """Session totals and pauses, via routr's own parser under routr's venv."""
    r = subprocess.run(
        [str(ROUTR_PYTHON), str(HERE / "fitmeta.py"), str(ROUTR_BACKEND), str(path)],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if r.returncode != 0:
        raise RuntimeError(f"fitmeta failed: {r.stderr.strip()[:400]}")
    return json.loads(r.stdout)


def crop(src: Path, dest: Path) -> bool:
    """Crop `src` to `dest`. Returns whether any bytes actually changed.

    Exit 1 means "no timer pauses" and the cropper writes nothing. That is a
    normal, common outcome -- every treadmill run -- so the source is copied to
    the resolved path and the caller is told nothing was applied. Anything else
    non-zero is a real failure.
    """
    r = subprocess.run(
        [
            str(ROUTR_PYTHON),
            str(ROUTR_BACKEND / "scripts" / "crop_fit_pauses.py"),
            "--input",
            str(src),
            "--output",
            str(dest),
        ],
        capture_output=True,
        text=True,
        timeout=900,
    )
    if r.returncode == 1:
        dest.write_bytes(src.read_bytes())
        return False
    if r.returncode != 0:
        raise RuntimeError(f"cropper failed ({r.returncode}): {r.stderr.strip()[:400]}")
    # The cropper validates its own output and says so; if it stopped saying so,
    # we would be queueing files nobody checked.
    if "Structural validation: OK" not in r.stdout:
        raise RuntimeError("cropper did not report structural validation")
    return True


def inspect(path: Path) -> dict[str, Any] | None:
    """The forensic report, or None if the inspector could not produce one.

    Never gates ingestion. The report deliberately carries no verdict field --
    interpretation belongs to the human reading the approval screen, and a
    pipeline that refused anomalous files would hide exactly the runs worth
    looking at.
    """
    r = subprocess.run(
        [
            str(ROUTR_PYTHON),
            str(ROUTR_BACKEND / "scripts" / "inspect_fit.py"),
            str(path),
            "--quiet",
        ],
        capture_output=True,
        text=True,
        timeout=900,
    )
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        return None


def crop_summary(
    before: dict[str, Any], after: dict[str, Any], applied: bool
) -> dict[str, Any]:
    """The shape src/lib/crop.ts renders. Do not reorder or rename."""
    return {
        "elapsedSecondsBefore": before["elapsedSeconds"],
        "elapsedSecondsAfter": after["elapsedSeconds"],
        "movingSecondsBefore": before["movingSeconds"],
        "movingSecondsAfter": after["movingSeconds"],
        "distanceKmBefore": before["distanceKm"],
        "distanceKmAfter": after["distanceKm"],
        "pausesRemoved": before["pauses"] if applied else [],
        "cropApplied": applied,
    }


# -------------------------------------------------------------------- pipeline


def process(api: Any, activity: dict[str, Any], workdir: Path) -> dict[str, Any]:
    """Download, crop, inspect. Returns the row to insert."""
    aid = str(activity["activityId"])
    name = activity.get("activityName")
    start_local = activity.get("startTimeLocal") or ""

    with GUARD.call("data", f"download {aid}", wait_s=10.0):
        blob = api.download_activity(aid, api.ActivityDownloadFormat.ORIGINAL)
    original = unwrap_fit(blob)

    src = workdir / f"{aid}-original.fit"
    src.write_bytes(original)

    before = fit_meta(src)
    dest = workdir / output_name(name, start_local, before["distanceKm"])
    applied = crop(src, dest)
    after = fit_meta(dest)

    return {
        "id": aid,
        "status": "pending",
        "name": name,
        "started_at": start_local or None,
        "original": original,
        "cropped": dest.read_bytes(),
        "filename": dest.name,
        "summary": json.dumps(crop_summary(before, after, applied)),
        "report": json.dumps(inspect(dest)),
        "error": None,
    }


def summarise(queued: int, failed: int) -> str:
    """The sentence Luis reads at 07:00. Failures named, never implied by absence."""
    if not queued and not failed:
        return "no new activities"
    parts = []
    if queued:
        parts.append(f"{queued} queued")
    if failed:
        parts.append(f"{failed} FAILED")
    return ", ".join(parts)


def run_once(limit: int) -> int:
    import psycopg

    from garmin import connect  # noqa: PLC0415 -- sys.path is set at import time

    conn = psycopg.connect(db_url(), connect_timeout=30)
    seen = 0
    try:
        api = connect(PROBE / "out" / "token.json")
        with GUARD.call("data", "activity-list", wait_s=10.0):
            activities = api.get_activities(0, limit)

        known = known_ids(conn)
        runs = [a for a in activities if is_run(a)]
        fresh = [a for a in runs if str(a["activityId"]) not in known]
        workdir = HERE / "work"
        workdir.mkdir(exist_ok=True)

        failed = 0
        for a in fresh:
            aid = str(a["activityId"])
            try:
                row = process(api, a, workdir)
            except RateLimitGuard:
                # Garmin pushing back is not this activity's fault and the next
                # one would hit the same wall. Stop the pass; do not mark it
                # failed, because nothing is wrong with the file.
                raise
            except Exception as exc:  # noqa: BLE001 -- queued as failed, then next
                # One unprocessable file must not wedge the pipeline. The cropper
                # legitimately refuses a file whose crop would drop a lap or a
                # record (exit 2), and that verdict belongs in the queue where it
                # is visible, not in a traceback that stops every later activity
                # from ever being ingested.
                failed += 1
                insert_row(
                    conn,
                    {
                        "id": aid,
                        "status": "failed",
                        "name": a.get("activityName"),
                        "started_at": a.get("startTimeLocal") or None,
                        "original": None,
                        "cropped": None,
                        "filename": None,
                        "summary": None,
                        "report": None,
                        "error": f"{type(exc).__name__}: {exc}"[:1000],
                    },
                )
                print(f"failed {aid}: {type(exc).__name__}: {exc}", file=sys.stderr)
                continue
            insert_row(conn, row)
            seen += 1
            print(f"queued {row['id']} {row['filename']}")

        heartbeat(
            conn,
            True,
            summarise(seen, failed),
            {"checked": len(activities), "queued": seen, "failed": failed},
        )
        return 0
    except RateLimitGuard as exc:
        # Refused before any request went out, so there is nothing partial to
        # clean up. Loud, and emphatically not retried: the 429 is keyed to the
        # account and costs 48-72 hours.
        heartbeat(conn, False, f"rate-limit guard refused: {exc}", {"queued": seen})
        print(f"guard refused: {exc}", file=sys.stderr)
        return 0
    except Exception as exc:  # noqa: BLE001 -- recorded, then surfaced
        heartbeat(
            conn, False, f"{type(exc).__name__}: {exc}"[:400], {"queued": seen}
        )
        print(f"FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        conn.close()


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--once", action="store_true", help="one pass, then exit")
    ap.add_argument("--status", action="store_true", help="what the guard allows now")
    ap.add_argument("--limit", type=int, default=5, help="activities to examine")
    args = ap.parse_args(argv)

    if args.status:
        for bucket in ("login", "data"):
            print(bucket, GUARD.status(bucket))
        return 0
    if not ROUTR_PYTHON.exists():
        print(f"routr interpreter missing: {ROUTR_PYTHON}", file=sys.stderr)
        return 2
    return run_once(args.limit)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
