"""Checks for the parts that would fail silently.

Deliberately small. These cover the two things that break without anyone noticing:
the MFA code never reaching the library, and the token not being persisted after a
refresh (which degrades to a credential login every run and trips Garmin's 429).
"""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path

import pytest

import garmin


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
