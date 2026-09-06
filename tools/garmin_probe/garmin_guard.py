"""Hard rate-limit guard for Garmin Connect calls.

One sqlite file is the whole mechanism: it is the ledger, the lock, and the
circuit breaker. sqlite because it is stdlib, gives us cross-process atomicity
for free, and survives restarts -- a JSON file plus flock would be more code
and weaker.

Two buckets, because Garmin has two rate limiters with wildly different blast
radii:

  LOGIN  -> sso.garmin.com / diauth.garmin.com credential flows.
            A 429 here is account-keyed and lasts 48-72h+. Treated as
            catastrophic: 2/day, 15 min apart, breaker trips for 72h.
  DATA   -> connectapi.garmin.com reads with an existing token.
            A 429 here clears in ~5-30 min. 20/min, 2s apart, 600/day,
            breaker trips for 30 min.

Everything is deny-by-default: the guard reserves BEFORE the call, so a crash
mid-call still consumes budget. Fail-closed if the ledger is unreachable.
"""

from __future__ import annotations

import contextlib
import os
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path

DEFAULT_LEDGER = Path(
    os.environ.get("GARMIN_LEDGER", Path.home() / ".garmin_ledger.sqlite3")
)


class RateLimitGuard(Exception):
    """Raised instead of making a call. Never retry this -- it is the point.

    ``spacing_deficit`` is set only when the refusal is the mandatory gap between
    calls, which is the one refusal a caller may legitimately wait out. A breaker
    or a daily cap leaves it None: those must never be slept through, because
    waiting out a 72-hour breaker inside a process is indistinguishable from a
    hang.
    """

    def __init__(self, message: str, spacing_deficit: float | None = None) -> None:
        super().__init__(message)
        self.spacing_deficit = spacing_deficit


@dataclass(frozen=True)
class Budget:
    min_spacing_s: float
    per_minute: int
    per_day: int
    breaker_s: float


BUDGETS: dict[str, Budget] = {
    # 2/day is deliberate: a valid refresh token means you need ~1 login per
    # 6 months. 2 leaves room for one genuine re-bootstrap and nothing more.
    "login": Budget(min_spacing_s=900.0, per_minute=1, per_day=2, breaker_s=72 * 3600),
    # 2s spacing and 20/min sit an order of magnitude under Home Assistant's
    # 9 parallel coordinators every 5 min, which is the field-proven safe rate.
    "data": Budget(min_spacing_s=2.0, per_minute=20, per_day=600, breaker_s=30 * 60),
}

_SCHEMA = """
CREATE TABLE IF NOT EXISTS calls (
    id      INTEGER PRIMARY KEY,
    bucket  TEXT NOT NULL,
    ts      REAL NOT NULL,
    label   TEXT
);
CREATE INDEX IF NOT EXISTS calls_bucket_ts ON calls (bucket, ts);
CREATE TABLE IF NOT EXISTS breaker (
    bucket  TEXT PRIMARY KEY,
    until   REAL NOT NULL,
    reason  TEXT
);
"""


def _connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=30, isolation_level=None)
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(_SCHEMA)
    return con


class GarminGuard:
    def __init__(
        self, ledger: Path = DEFAULT_LEDGER, clock=time.time, sleeper=time.sleep
    ) -> None:
        self._path = Path(ledger)
        self._now = clock
        self._sleep = sleeper

    # -- the only two methods callers need ---------------------------------

    @contextlib.contextmanager
    def call(self, bucket: str, label: str = "", wait_s: float = 0.0):
        """Reserve budget, run the call, record any 429 on the way out.

        Reservation happens before the request, so a crash still costs budget.

        ``wait_s`` caps how long we may sleep out a *spacing* refusal, and only
        that: a sweep of 40 endpoints at 2s spacing would otherwise die on call
        two, and making every caller reimplement the sleep is how one of them
        ends up not doing it. Breaker and cap refusals still raise immediately.
        """
        try:
            self._reserve(bucket, label)
        except RateLimitGuard as exc:
            deficit = exc.spacing_deficit
            if deficit is None or wait_s <= 0 or deficit > wait_s:
                raise
            self._sleep(deficit)
            # One retry only. A second failure is a real refusal (another process
            # took the slot, or a cap was hit), and looping would be a busy-wait
            # against a limiter we are trying to respect.
            self._reserve(bucket, label)
        try:
            yield
        except Exception as exc:  # noqa: BLE001 -- classification, then re-raise
            if _is_429(exc):
                self.trip(bucket, f"429 on {label or bucket}")
            raise

    def trip(self, bucket: str, reason: str) -> None:
        """Open the breaker. Called automatically on a 429; call it manually
        for anything else that smells like Garmin pushing back."""
        budget = BUDGETS[bucket]
        until = self._now() + budget.breaker_s
        with _connect(self._path) as con:
            con.execute(
                "INSERT INTO breaker (bucket, until, reason) VALUES (?, ?, ?) "
                "ON CONFLICT(bucket) DO UPDATE SET "
                "until=max(breaker.until, excluded.until), reason=excluded.reason",
                (bucket, until, reason),
            )
        # A login 429 poisons data too: the account is flagged, stop everything.
        if bucket == "login" and "data" in BUDGETS:
            self.trip_until("data", until, "collateral: login bucket 429")

    def trip_until(self, bucket: str, until: float, reason: str) -> None:
        with _connect(self._path) as con:
            con.execute(
                "INSERT INTO breaker (bucket, until, reason) VALUES (?, ?, ?) "
                "ON CONFLICT(bucket) DO UPDATE SET "
                "until=max(breaker.until, excluded.until), reason=excluded.reason",
                (bucket, until, reason),
            )

    def status(self, bucket: str) -> dict[str, float | str]:
        now = self._now()
        with _connect(self._path) as con:
            row = con.execute(
                "SELECT until, reason FROM breaker WHERE bucket=?", (bucket,)
            ).fetchone()
            minute = con.execute(
                "SELECT COUNT(*) FROM calls WHERE bucket=? AND ts>?",
                (bucket, now - 60),
            ).fetchone()[0]
            day = con.execute(
                "SELECT COUNT(*) FROM calls WHERE bucket=? AND ts>?",
                (bucket, now - 86400),
            ).fetchone()[0]
            last = con.execute(
                "SELECT MAX(ts) FROM calls WHERE bucket=?", (bucket,)
            ).fetchone()[0]
        b = BUDGETS[bucket]
        return {
            "blocked_for_s": max(0.0, (row[0] - now) if row else 0.0),
            "reason": (row[1] if row else "") or "",
            "used_last_minute": minute,
            "used_last_day": day,
            "remaining_today": max(0, b.per_day - day),
            "seconds_since_last": (now - last) if last else float("inf"),
        }

    # -- internals ---------------------------------------------------------

    def _reserve(self, bucket: str, label: str) -> None:
        if bucket not in BUDGETS:
            raise RateLimitGuard(f"unknown bucket {bucket!r}")
        b = BUDGETS[bucket]
        now = self._now()
        try:
            con = _connect(self._path)
        except sqlite3.Error as e:
            # Fail closed: no ledger means no accounting means no calls.
            raise RateLimitGuard(f"ledger unavailable, refusing call: {e}") from e
        try:
            # BEGIN IMMEDIATE takes the write lock now, so two processes cannot
            # both read "1 call used" and both decide they may proceed.
            con.execute("BEGIN IMMEDIATE")
            row = con.execute(
                "SELECT until, reason FROM breaker WHERE bucket=?", (bucket,)
            ).fetchone()
            if row and row[0] > now:
                raise RateLimitGuard(
                    f"{bucket} breaker open for another {row[0] - now:.0f}s "
                    f"({row[1]}). Waiting is the only fix."
                )
            last = con.execute(
                "SELECT MAX(ts) FROM calls WHERE bucket=?", (bucket,)
            ).fetchone()[0]
            if last is not None and now - last < b.min_spacing_s:
                deficit = b.min_spacing_s - (now - last)
                raise RateLimitGuard(
                    f"{bucket}: {deficit:.1f}s of mandatory spacing left",
                    spacing_deficit=deficit,
                )
            minute = con.execute(
                "SELECT COUNT(*) FROM calls WHERE bucket=? AND ts>?",
                (bucket, now - 60),
            ).fetchone()[0]
            if minute >= b.per_minute:
                raise RateLimitGuard(f"{bucket}: {b.per_minute}/min window full")
            day = con.execute(
                "SELECT COUNT(*) FROM calls WHERE bucket=? AND ts>?",
                (bucket, now - 86400),
            ).fetchone()[0]
            if day >= b.per_day:
                raise RateLimitGuard(
                    f"{bucket}: daily cap {b.per_day} reached; resets rolling 24h"
                )
            con.execute(
                "INSERT INTO calls (bucket, ts, label) VALUES (?, ?, ?)",
                (bucket, now, label),
            )
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
        finally:
            con.close()


def _is_429(exc: BaseException) -> bool:
    """garminconnect raises GarminConnectTooManyRequestsError; be liberal in
    case a raw HTTPError or a wrapped ConnectionError carries the 429."""
    seen = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if type(cur).__name__ == "GarminConnectTooManyRequestsError":
            return True
        status = getattr(getattr(cur, "response", None), "status_code", None)
        if status == 429 or "429" in str(cur):
            return True
        cur = cur.__cause__ or cur.__context__
    return False


# --------------------------------------------------------------------------- test

def _selftest() -> None:
    import tempfile

    t = [1_000_000.0]
    with tempfile.TemporaryDirectory() as d:
        g = GarminGuard(Path(d) / "l.db", clock=lambda: t[0])

        # spacing is enforced
        with g.call("data", "a"):
            pass
        try:
            with g.call("data", "b"):
                pass
            raise AssertionError("spacing not enforced")
        except RateLimitGuard:
            pass

        # per-minute window
        for i in range(19):
            t[0] += 2.1
            with g.call("data", f"c{i}"):
                pass
        t[0] += 2.1
        try:
            with g.call("data", "overflow"):
                pass
            raise AssertionError("per-minute cap not enforced")
        except RateLimitGuard as e:
            assert "20/min" in str(e), e

        # a 429 trips the breaker and it survives a new guard object (on disk)
        t[0] += 120
        class Boom(Exception):
            pass
        err = Boom("API Error 429 - rate limited")
        try:
            with g.call("data", "boom"):
                raise err
        except Boom:
            pass
        g2 = GarminGuard(Path(d) / "l.db", clock=lambda: t[0])
        try:
            t[0] += 60
            with g2.call("data", "after"):
                pass
            raise AssertionError("breaker did not trip")
        except RateLimitGuard as e:
            assert "breaker open" in str(e), e
        assert float(g2.status("data")["blocked_for_s"]) > 25 * 60

        # breaker expires
        t[0] += 31 * 60
        with g2.call("data", "recovered"):
            pass

        # a login 429 also freezes data
        t[0] += 10_000
        try:
            with g2.call("login", "cred"):
                raise Boom("HTTP 429")
        except Boom:
            pass
        assert float(g2.status("login")["blocked_for_s"]) > 71 * 3600
        assert float(g2.status("data")["blocked_for_s"]) > 71 * 3600

        # daily login cap: fresh ledger, breaker clear
        g3 = GarminGuard(Path(d) / "m.db", clock=lambda: t[0])
        with g3.call("login", "1"):
            pass
        t[0] += 901
        with g3.call("login", "2"):
            pass
        t[0] += 901
        try:
            with g3.call("login", "3"):
                pass
            raise AssertionError("daily login cap not enforced")
        except RateLimitGuard as e:
            assert "daily cap 2" in str(e), e

    print("garmin_guard selftest OK")


if __name__ == "__main__":
    _selftest()
