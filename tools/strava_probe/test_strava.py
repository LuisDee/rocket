"""The scope check is the only non-trivial logic here, and getting it wrong is silent."""

from __future__ import annotations

import pytest

import strava


def test_exact_scope_accepted() -> None:
    assert strava.has_scope("read,activity:read_all", "activity:read_all")


def test_prefix_scope_rejected() -> None:
    """`activity:read` must NOT satisfy `activity:read_all` — a substring test would
    accept it and every private run would be invisible forever."""
    assert not strava.has_scope("read,activity:read", "activity:read_all")


def test_missing_and_empty_scope_rejected() -> None:
    assert not strava.has_scope("", "activity:read_all")
    assert not strava.has_scope(None, "activity:read_all")


def test_cli_requires_subcommand() -> None:
    with pytest.raises(SystemExit):
        strava.main([])
