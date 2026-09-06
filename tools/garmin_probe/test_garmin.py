"""Checks for the parts that would fail silently.

Deliberately small. These cover the two things that break without anyone noticing:
the MFA code never reaching the library, and the token not being persisted after a
refresh (which degrades to a credential login every run and trips Garmin's 429).
"""

from __future__ import annotations

import json
import os
import stat
import sys
import types
from pathlib import Path

import pytest

import garmin
import garmin_guard


class FakeClient:
    """Stands in for garminconnect's client: only dumps() matters to us."""

    def __init__(self, token: str = '{"di_token": "t", "di_refresh_token": "r"}'):
        self._token = token

    def dumps(self) -> str:
        return self._token


def test_mfa_reader_prefers_file(tmp_path: Path) -> None:
    f = tmp_path / "mfa"
    f.write_text("123456\n")
    assert garmin.make_mfa_reader(f, "NOPE")() == "123456"


def test_mfa_reader_falls_back_to_env(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ROCKET_TEST_MFA", "654321")
    assert garmin.make_mfa_reader(tmp_path / "absent", "ROCKET_TEST_MFA")() == "654321"


def test_mfa_reader_ignores_empty_file_and_uses_env(tmp_path: Path, monkeypatch) -> None:
    f = tmp_path / "mfa"
    f.write_text("   \n")
    monkeypatch.setenv("ROCKET_TEST_MFA", "999999")
    assert garmin.make_mfa_reader(f, "ROCKET_TEST_MFA")() == "999999"


def test_mfa_reader_exits_when_no_code_and_no_tty(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("ROCKET_TEST_MFA", raising=False)
    monkeypatch.setattr("sys.stdin.isatty", lambda: False)
    with pytest.raises(SystemExit):
        garmin.make_mfa_reader(tmp_path / "absent", "ROCKET_TEST_MFA")()


def test_token_round_trips(tmp_path: Path) -> None:
    path = tmp_path / "out" / "token.json"
    garmin.save_token(FakeClient(), path)
    assert json.loads(garmin.load_token(path))["di_refresh_token"] == "r"


def test_token_file_is_owner_only(tmp_path: Path) -> None:
    """The refresh token grants persistent account access; 0600 is not optional."""
    path = tmp_path / "out" / "token.json"
    garmin.save_token(FakeClient(), path)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700


def test_save_token_overwrites_rotated_token(tmp_path: Path) -> None:
    """A refresh mid-session must land on disk, or the next run does a full login."""
    path = tmp_path / "out" / "token.json"
    garmin.save_token(FakeClient('{"di_token": "old", "di_refresh_token": "old"}'), path)
    garmin.save_token(FakeClient('{"di_token": "new", "di_refresh_token": "new"}'), path)
    assert json.loads(path.read_text())["di_refresh_token"] == "new"


def test_load_token_exits_cleanly_when_absent(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        garmin.load_token(tmp_path / "nothing.json")


def test_shape_records_structure_not_values() -> None:
    """The catalogue is committed, so it must never carry a real reading."""
    out = garmin.shape(
        {"hrv": {"lastNightAvg": 47, "status": "BALANCED"}, "readings": [1, 2, 3]}
    )
    blob = json.dumps(out)
    assert "47" not in blob and "BALANCED" not in blob
    assert "int" in blob and "str" in blob


def test_credentials_error_names_both_sources(monkeypatch) -> None:
    monkeypatch.setattr(garmin, "_from_pass", lambda _entry: None)
    for var in ("GARMIN_EMAIL", "GARMIN_PASSWORD"):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(SystemExit) as e:
        garmin.read_credentials()
    assert "pass insert" in str(e.value) and "GARMIN_EMAIL" in str(e.value)


def test_cli_requires_a_subcommand() -> None:
    with pytest.raises(SystemExit):
        garmin.main([])


# --------------------------------------------------------------------------- guard
#
# Five properties that turn "unlikely to be locked out" into "cannot be". Each
# test below fails if its property is removed; what was broken to prove that is
# recorded in the docs/ci-gates.md row.


class Boom(Exception):
    """A failure that is not a 429."""


class TooMany(Exception):
    """Stands in for GarminConnectTooManyRequestsError, matched by class name."""


TooMany.__name__ = "GarminConnectTooManyRequestsError"


def _guard(tmp_path: Path, clock: list[float]) -> garmin_guard.GarminGuard:
    """Guard on a throwaway ledger with a fake clock; sleeping advances that clock
    so spacing waits are instant but still ordered."""

    def sleeper(seconds: float) -> None:
        clock[0] += seconds

    return garmin_guard.GarminGuard(
        tmp_path / "ledger.sqlite3", clock=lambda: clock[0], sleeper=sleeper
    )


def test_crashing_call_still_consumes_budget(tmp_path: Path) -> None:
    """Property 2. Budget is reserved before the request, so a crash-loop cannot
    mint free attempts. Remove the reserve-before-yield and this passes wrongly."""
    t = [1000.0]
    g = _guard(tmp_path, t)
    with pytest.raises(Boom):
        with g.call("data", "crash"):
            raise Boom("died mid-call")
    assert g.status("data")["used_last_day"] == 1


def test_breaker_survives_a_new_process(tmp_path: Path) -> None:
    """Property 4. The breaker is on disk, so re-running the script 'just to
    check' during a cooldown is refused. Hold it in memory and this fails."""
    t = [1000.0]
    g = _guard(tmp_path, t)
    with pytest.raises(TooMany):
        with g.call("data", "boom"):
            raise TooMany("429 rate limited")

    t[0] += 60
    fresh = _guard(tmp_path, t)  # a different object, as a new process would be
    with pytest.raises(garmin_guard.RateLimitGuard, match="breaker open"):
        with fresh.call("data", "after-restart"):
            pass


def test_429_aborts_the_sweep_instead_of_continuing(tmp_path: Path, monkeypatch) -> None:
    """Property 5. A 429 on one endpoint must stop the remaining calls: continuing
    into an actively limited endpoint is what turns a soft limit into a lockout.
    Restore `except Exception: continue` and this fails."""
    t = [1000.0]
    monkeypatch.setattr(garmin, "GUARD", _guard(tmp_path, t))
    results: dict[str, dict] = {}

    def rate_limited():
        raise TooMany("API Error 429")

    assert garmin.run_call("first", rate_limited, results) is False
    assert results["first"]["ok"] is False

    # Defence in depth: even a caller that ignored the False return is now blocked
    # by the breaker rather than being trusted to stop.
    def anything():
        pytest.fail("guard let a call through after a 429")

    assert garmin.run_call("second", anything, results) is False


def test_ordinary_failure_does_not_stop_the_sweep(tmp_path: Path, monkeypatch) -> None:
    """The counterpart to the 429 rule: a single 404 says nothing about the other
    endpoints, so it must not cost us the rest of the sweep."""
    t = [1000.0]
    monkeypatch.setattr(garmin, "GUARD", _guard(tmp_path, t))
    results: dict[str, dict] = {}

    def not_found():
        raise Boom("404")

    assert garmin.run_call("missing", not_found, results) is True
    assert results["missing"]["ok"] is False


def test_corrupt_ledger_refuses_rather_than_proceeds(tmp_path: Path) -> None:
    """Property 3. Fail closed: no accounting means no calls. Swallow the sqlite
    error and a corrupt ledger becomes an unlimited one."""
    ledger = tmp_path / "ledger.sqlite3"
    ledger.write_bytes(b"this is not a database" * 100)
    g = garmin_guard.GarminGuard(ledger, clock=lambda: 1000.0)
    with pytest.raises(garmin_guard.RateLimitGuard):
        with g.call("data", "should-refuse"):
            pytest.fail("guard let a call through on a corrupt ledger")


def test_connect_refuses_a_client_holding_credentials(tmp_path: Path, monkeypatch) -> None:
    """Property 1. Credentials on the token path re-enable the library's credential
    cascade (tens of auth requests) on any transient 401. Drop the assert and this
    passes silently."""
    t = [1000.0]
    monkeypatch.setattr(garmin, "GUARD", _guard(tmp_path, t))
    token = tmp_path / "token.json"
    token.write_text('{"di_token": "t", "di_refresh_token": "r"}')

    class LeakyGarmin:
        def __init__(self, **_kw):
            self.username = "luis@example.com"  # the thing that must not be set
            self.password = "hunter2"
            self.client = FakeClient()

        def login(self, **_kw):
            raise AssertionError("must not reach login with credentials present")

    fake_module = types.ModuleType("garminconnect")
    setattr(fake_module, "Garmin", LeakyGarmin)  # noqa: B010 - module attr, not a class
    monkeypatch.setitem(sys.modules, "garminconnect", fake_module)

    with pytest.raises(AssertionError, match="never hold credentials"):
        garmin.connect(token)


def test_spacing_is_waited_out_but_a_cap_is_not(tmp_path: Path) -> None:
    """The one refusal a caller may sleep through is the mandatory gap. A daily cap
    must still raise -- sleeping out a cap would be an unbounded hang."""
    t = [1000.0]
    g = _guard(tmp_path, t)
    with g.call("data", "a"):
        pass
    with g.call("data", "b", wait_s=5.0):  # spacing slept, not raised
        pass
    assert g.status("data")["used_last_day"] == 2

    g.trip("data", "manual")
    with pytest.raises(garmin_guard.RateLimitGuard, match="breaker open"):
        with g.call("data", "c", wait_s=3600.0):  # generous wait, still refused
            pass
