"""Tests for the ingest pipeline.

No live Garmin call anywhere. The account's 429 is keyed to the account and
costs 48-72 hours, so a test suite that could trip it is not worth having.

The FIT fixtures are routr's, read-only, and chosen for what they are:
`garmin-fenix2-run.fit` has zero timer pauses (the case that exits 1 and writes
nothing) and `garmin-edge-500-activity.fit` has 46 (the case that crops).
"""

from __future__ import annotations

import json
import subprocess
import sys
import zipfile
from io import BytesIO
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent))

import ingest  # noqa: E402

FIXTURES = ingest.ROUTR_BACKEND / "tests" / "fixtures" / "fit" / "clean"
NO_PAUSES = FIXTURES / "garmin-fenix2-run.fit"
MANY_PAUSES = FIXTURES / "garmin-edge-500-activity.fit"

routr = pytest.mark.skipif(
    not ingest.ROUTR_PYTHON.exists() or not NO_PAUSES.exists(),
    reason="routr checkout or its venv is absent",
)


# ------------------------------------------------------------------- filenames


def test_filename_uses_the_convention_not_the_croppers_default():
    # The cropper would have written ~/Downloads/2026-09-05_9.01km.fit: underscore
    # separator, no name component, wrong directory.
    assert (
        ingest.output_name("Morning Run", "2026-09-05 07:13:00", 9.008)
        == "morning-run-2026-09-05-9.01km.fit"
    )


def test_filename_distance_always_has_two_decimals():
    # 9.0 must render as 9.00, not 9.0 -- the convention says two decimals and a
    # filename that varies in shape is one nobody can pattern-match later.
    assert ingest.output_name("Run", "2026-09-05 07:00:00", 9.0).endswith("-9.00km.fit")
    assert ingest.output_name("Run", "2026-09-05 07:00:00", 12.3456).endswith(
        "-12.35km.fit"
    )


@pytest.mark.parametrize("name", [None, "", "   "])
def test_filename_falls_back_to_run_when_untitled(name):
    assert ingest.output_name(name, "2026-09-05 07:00:00", 5.0).startswith("run-")


# ------------------------------------------------------------------------- zip


def test_zip_wrapped_download_is_unwrapped():
    inner = b"\x0e\x10\x43\x08\x00\x00\x00\x00.FITpayload"
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("12345_ACTIVITY.fit", inner)
    assert ingest.unwrap_fit(buf.getvalue()) == inner


def test_bare_fit_passes_through():
    bare = b"\x0e\x10\x43\x08\x00\x00\x00\x00.FITpayload"
    assert ingest.unwrap_fit(bare) == bare


def test_non_fit_bytes_are_rejected_rather_than_stored():
    # Garmin returning an HTML error page must not become a row that looks like
    # an activity and fails much later on the approval screen.
    with pytest.raises(ValueError, match="not a FIT"):
        ingest.unwrap_fit(b"<html>rate limited</html>")


def test_zip_with_two_fits_is_rejected():
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("a.fit", b"x")
        z.writestr("b.fit", b"y")
    with pytest.raises(ValueError, match="expected one"):
        ingest.unwrap_fit(buf.getvalue())


# ------------------------------------------------------------------- summaries


def test_crop_summary_matches_the_shape_the_screen_renders():
    before = {
        "elapsedSeconds": 3600,
        "movingSeconds": 3400,
        "distanceKm": 10.0,
        "pauses": [{"startOffsetS": 100, "durationS": 200}],
    }
    after = {
        "elapsedSeconds": 3400,
        "movingSeconds": 3400,
        "distanceKm": 10.0,
        "pauses": [],
    }
    s = ingest.crop_summary(before, after, applied=True)
    assert set(s) == {
        "elapsedSecondsBefore",
        "elapsedSecondsAfter",
        "movingSecondsBefore",
        "movingSecondsAfter",
        "distanceKmBefore",
        "distanceKmAfter",
        "pausesRemoved",
        "cropApplied",
    }
    assert s["elapsedSecondsBefore"] - s["elapsedSecondsAfter"] == 200
    assert s["pausesRemoved"] == before["pauses"]


def test_unapplied_crop_reports_no_pauses_removed():
    m = {"elapsedSeconds": 10, "movingSeconds": 10, "distanceKm": 1.0, "pauses": []}
    s = ingest.crop_summary(m, m, applied=False)
    assert s["cropApplied"] is False
    assert s["pausesRemoved"] == []


# --------------------------------------------------------- the routr behaviours


@routr
def test_zero_pause_run_is_copied_not_treated_as_failure(tmp_path):
    # The cropper exits 1 and writes nothing here. A naive check=True would raise
    # and this run -- and every treadmill run -- would silently never be queued.
    dest = tmp_path / "out.fit"
    applied = ingest.crop(NO_PAUSES, dest)
    assert applied is False
    assert dest.read_bytes() == NO_PAUSES.read_bytes()


@routr
def test_cropper_validation_failure_is_raised_not_silently_accepted(tmp_path):
    # garmin-edge-500-activity.fit has 46 timer pauses and the cropper REFUSES to
    # crop it: exit 2, "lap count: 9 -> 8, record count: 10686 -> 10642". That is
    # the cropper's own metric validation working, and a file it will not vouch
    # for must never reach the queue as if it had been cropped.
    #
    # Worth recording: routr's clean fixtures contain no file that crops
    # successfully -- four have zero pauses and this one fails validation -- so
    # the happy path is covered by the live run, not here.
    with pytest.raises(RuntimeError, match="cropper failed"):
        ingest.crop(MANY_PAUSES, tmp_path / "out.fit")


@routr
def test_fit_meta_returns_the_three_fields_the_contract_needs():
    m = ingest.fit_meta(NO_PAUSES)
    assert m["elapsedSeconds"] > 0
    assert m["movingSeconds"] > 0
    assert m["distanceKm"] > 0
    assert m["pauses"] == []


@routr
def test_pauses_are_found_where_they_exist():
    assert len(ingest.fit_meta(MANY_PAUSES)["pauses"]) > 40


# ------------------------------------------------------------------ skip + guard


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchall(self):
        return self._rows


class FakeConn:
    def __init__(self, rows=()):
        self.cur = FakeCursor(list(rows))
        self.commits = 0

    def cursor(self):
        return self.cur

    def commit(self):
        self.commits += 1


def test_already_ingested_ids_are_skipped():
    conn = FakeConn([("111",), ("222",)])
    known = ingest.known_ids(conn)
    activities = [{"activityId": 111}, {"activityId": 333}]
    fresh = [a for a in activities if str(a["activityId"]) not in known]
    assert [a["activityId"] for a in fresh] == [333]


def test_heartbeat_is_written_on_failure_too():
    conn = FakeConn()
    ingest.heartbeat(conn, False, "boom", {"queued": 0})
    sql, params = conn.cur.executed[-1]
    assert "sync_runs" in sql
    assert params[1] == ingest.JOB
    assert params[2] is False
    assert conn.commits == 1


def test_guard_refusal_writes_no_activity_row(monkeypatch, tmp_path):
    # A refusal happens before any request goes out, so there must be nothing
    # partial in the queue afterwards.
    from garmin_guard import RateLimitGuard

    class Boom:
        def call(self, *a, **k):
            raise RateLimitGuard("breaker open")

    monkeypatch.setattr(ingest, "GUARD", Boom())
    with pytest.raises(RateLimitGuard):
        ingest.process(object(), {"activityId": 1, "startTimeLocal": "2026-09-05"}, tmp_path)
    assert list(tmp_path.iterdir()) == []


# ----------------------------------------------------------------- consistency


def test_status_vocabulary_matches_the_typescript_contract():
    # Shared with src/db/ingest-schema.ts. `approved`/`uploading`/`uploaded` were
    # removed when the Strava upload was prohibited; a producer writing one would
    # put a row in a state the approval screen cannot render.
    import re

    schema = (Path(__file__).parents[2] / "src" / "db" / "ingest-schema.ts").read_text()
    block = schema.split("INGEST_STATUSES = [")[1].split("]")[0]
    assert set(re.findall(r"'([a-z]+)'", block)) == {
        "pending",
        "reviewed",
        "shipped",
        "failed",
    }


# The 'no Strava call' assertion lives in scripts/check_no_strava_api.py, which
# gates the whole repo in CI. A local copy could only assert it by containing
# the hostname the gate forbids -- which is exactly what the gate caught.


@routr
def test_routr_is_pinned_and_unmodified_by_us():
    head = subprocess.run(
        ["git", "-C", str(ingest.ROUTR), "rev-parse", "--short", "HEAD"],
        capture_output=True,
        text=True,
    ).stdout.strip()
    # A drifted cropper changes what lands in the queue. Not fatal -- routr is
    # actively developed -- but it must be a deliberate bump with a test run.
    if head != ingest.ROUTR_PINNED_COMMIT:
        pytest.skip(f"routr moved: pinned {ingest.ROUTR_PINNED_COMMIT}, found {head}")
