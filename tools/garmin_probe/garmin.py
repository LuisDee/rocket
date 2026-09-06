"""Garmin Connect access for rocket: one-time login, then a full-surface probe.

Two subcommands:

    uv run garmin.py bootstrap      log in once, write the token
    uv run garmin.py probe          with a token, enumerate everything and catalogue it

Why this exists: the schema for rocket's activity and wellness tables must be designed
against what Garmin actually returns, not against what the specs hope it returns. The
probe writes one JSON file per endpoint plus a CATALOGUE.md of field names and shapes.
The raw JSON stays local (personal health data, live refresh token); the catalogue is
what gets committed and designed against.

Safety rules encoded here, each with a reason:

  * Never retry a failed login. Garmin's 429 is keyed to the account, cannot be escaped
    by changing IP or headers, and lasts 48-72+ hours with no recovery process. The
    library's own default is retry_attempts=3, which is exactly wrong for a first login;
    we override it to 1.
  * Credentials are read from `pass` at call time so they never appear in argv, the
    environment, or a shell history.
  * The token is persisted by us, not by the library. In inline-JSON mode the library
    never writes rotated tokens back (client.dump() is gated on tokenstore_path, which
    stays None for an inline token), while the session does refresh in the background.
    Missing this degrades silently to a credential login on every run, which is how the
    429 gets tripped.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
OUT = HERE / "out"
DEFAULT_TOKEN = OUT / "token.json"


# --------------------------------------------------------------------------- creds


def _from_pass(entry: str) -> str | None:
    """Read a secret from the `pass` store. Returns None if absent."""
    try:
        r = subprocess.run(
            ["pass", "show", entry], capture_output=True, text=True, timeout=30
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    return r.stdout.splitlines()[0].strip() or None


def read_credentials() -> tuple[str, str, str]:
    """Return (email, password, source). Prefers `pass`, falls back to env."""
    email = _from_pass("garmin/email")
    password = _from_pass("garmin/password")
    if email and password:
        return email, password, "pass"
    email = email or os.environ.get("GARMIN_EMAIL")
    password = password or os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        raise SystemExit(
            "No Garmin credentials found.\n"
            "  Preferred:  pass insert garmin/email && pass insert garmin/password\n"
            "  Fallback:   export GARMIN_EMAIL=... GARMIN_PASSWORD=...\n"
        )
    return email, password, "env"


def make_mfa_reader(mfa_file: Path | None, mfa_env: str) -> Callable[[], str]:
    """Build a zero-arg callable returning the MFA code.

    Non-interactive by design so the login can be driven without a TTY: the code comes
    from a file or an environment variable. Falls back to a prompt only when attached to
    a terminal.
    """

    def read() -> str:
        if mfa_file and mfa_file.is_file():
            code = mfa_file.read_text(encoding="utf-8").strip()
            if code:
                return code
        code = os.environ.get(mfa_env, "").strip()
        if code:
            return code
        if sys.stdin.isatty():
            return input("Garmin MFA code: ").strip()
        raise SystemExit(
            f"MFA required but no code available.\n"
            f"  Write it to {mfa_file} or set {mfa_env}, then re-run.\n"
        )

    return read


# --------------------------------------------------------------------------- token


def save_token(client: Any, path: Path) -> None:
    """Persist the session token. Must be called after every login and refresh.

    client.dumps() yields {di_token, di_refresh_token, di_client_id}. The refresh token
    grants persistent account access, so the file is written 0600 in a 0700 directory.
    """
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(client.dumps())
    path.chmod(0o600)


def load_token(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(
            f"No token at {path}. Run `uv run garmin.py bootstrap` first."
        )
    return path.read_text(encoding="utf-8").strip()


# --------------------------------------------------------------------------- login


def bootstrap(args: argparse.Namespace) -> int:
    from garminconnect import Garmin

    email, password, source = read_credentials()
    print(f"credentials source: {source}")
    mfa = make_mfa_reader(args.mfa_file, args.mfa_env)

    # retry_attempts=1: never hammer the login endpoint. See module docstring.
    api = Garmin(
        email=email,
        password=password,
        prompt_mfa=mfa,
        return_on_mfa=True,
        retry_attempts=1,
    )

    try:
        status, state = api.login()
    except Exception as exc:  # noqa: BLE001 - we deliberately do not classify further
        print(f"LOGIN FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        print(
            "Not retrying. A repeated failure risks a 48-72h account lockout.",
            file=sys.stderr,
        )
        return 1

    if status == "needs_mfa":
        print("MFA required.")
        try:
            api.resume_login(state, mfa())
        except Exception as exc:  # noqa: BLE001
            print(f"MFA RESUME FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1
        print("MFA accepted.")
    else:
        print("Logged in without MFA.")

    save_token(api.client, args.token_file)
    print(f"token written: {args.token_file} (0600)")
    print("Bootstrap complete. Run `uv run garmin.py probe` next.")
    return 0


def connect(token_file: Path) -> Any:
    """Return an authenticated client from a stored token, refreshing if needed."""
    from garminconnect import Garmin

    api = Garmin(retry_attempts=1)
    api.login(tokenstore=load_token(token_file))
    # The library refreshes in the background but never writes an inline token back,
    # so we re-persist unconditionally. Cheap, and the alternative is a silent
    # degradation to credential login.
    save_token(api.client, token_file)
    return api


# --------------------------------------------------------------------------- probe


def shape(value: Any, depth: int = 0) -> Any:
    """Describe a JSON value's structure without retaining any of its content."""
    if depth > 3:
        return "..."
    if isinstance(value, dict):
        return {k: shape(v, depth + 1) for k, v in list(value.items())[:60]}
    if isinstance(value, list):
        if not value:
            return ["<empty>"]
        return [shape(value[0], depth + 1), f"<{len(value)} items>"]
    if value is None:
        return "null"
    return type(value).__name__


def probe(args: argparse.Namespace) -> int:
    api = connect(args.token_file)
    OUT.mkdir(mode=0o700, parents=True, exist_ok=True)

    today = date.today()
    d = lambda n: (today - timedelta(days=n)).isoformat()  # noqa: E731
    yday, weekago = d(1), d(7)

    # Ordered so the cheap identity calls run first: if the token is stale we find out
    # immediately rather than half way through a long sweep.
    calls: list[tuple[str, Callable[[], Any]]] = [
        ("user_profile", api.get_user_profile),
        ("userprofile_settings", api.get_userprofile_settings),
        ("primary_training_device", api.get_primary_training_device),
        ("heart_rate_zones", api.get_heart_rate_zones),
        ("activities_recent", lambda: api.get_activities(0, 30)),
        ("last_activity", api.get_last_activity),
        ("training_status", lambda: api.get_training_status(yday)),
        ("training_readiness", lambda: api.get_training_readiness(yday)),
        ("morning_training_readiness", lambda: api.get_morning_training_readiness(yday)),
        ("hrv_day", lambda: api.get_hrv_data(yday)),
        ("hrv_range_7d", lambda: api.get_hrv_data_range(weekago, yday)),
        ("rhr_day", lambda: api.get_rhr_day(yday)),
        ("rhr_daily_7d", lambda: api.get_rhr_daily(weekago, yday)),
        ("sleep_day", lambda: api.get_sleep_data(yday)),
        ("sleep_daily_7d", lambda: api.get_sleep_daily(weekago, yday)),
        ("body_battery_7d", lambda: api.get_body_battery(weekago, yday)),
        ("body_battery_events", lambda: api.get_body_battery_events(yday)),
        ("all_day_stress", lambda: api.get_all_day_stress(yday)),
        ("stress_day", lambda: api.get_stress_data(yday)),
        ("respiration", lambda: api.get_respiration_data(yday)),
        ("spo2", lambda: api.get_spo2_data(yday)),
        ("max_metrics_vo2", lambda: api.get_max_metrics(yday)),
        ("endurance_score", lambda: api.get_endurance_score(weekago, yday)),
        ("hill_score", lambda: api.get_hill_score(weekago, yday)),
        ("race_predictions", api.get_race_predictions),
        ("body_composition", lambda: api.get_body_composition(weekago, yday)),
        ("stats_and_body", lambda: api.get_stats_and_body(yday)),
        ("user_summary", lambda: api.get_user_summary(yday)),
        ("intensity_minutes", lambda: api.get_intensity_minutes_data(yday)),
        ("floors", lambda: api.get_floors(yday)),
        ("steps_day", lambda: api.get_steps_data(yday)),
        ("personal_record", api.get_personal_record),
        ("activity_types", api.get_activity_types),
    ]

    results: dict[str, dict[str, Any]] = {}
    for name, fn in calls:
        try:
            payload = fn()
        except Exception as exc:  # noqa: BLE001 - a failing endpoint must not stop the sweep
            results[name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
            print(f"  {name}: ERROR {type(exc).__name__}")
            continue
        blob = json.dumps(payload, indent=2, default=str)
        (OUT / f"{name}.json").write_text(blob, encoding="utf-8")
        results[name] = {"ok": True, "bytes": len(blob), "shape": shape(payload)}
        print(f"  {name}: {len(blob):,} bytes")

    # The richest single object: one activity with its streams. Done last because it is
    # the largest response and depends on the activity list having succeeded.
    acts = results.get("activities_recent", {})
    if acts.get("ok"):
        first = json.loads((OUT / "activities_recent.json").read_text())
        if isinstance(first, list) and first:
            aid = str(first[0].get("activityId"))
            for name, fn in [
                ("activity_detail", lambda: api.get_activity(aid)),
                ("activity_streams", lambda: api.get_activity_details(aid)),
                ("activity_splits", lambda: api.get_activity_splits(aid)),
                ("activity_typed_splits", lambda: api.get_activity_typed_splits(aid)),
                ("activity_hr_zones", lambda: api.get_activity_hr_in_timezones(aid)),
                ("activity_weather", lambda: api.get_activity_weather(aid)),
                ("activity_gear", lambda: api.get_activity_gear(aid)),
            ]:
                try:
                    payload = fn()
                except Exception as exc:  # noqa: BLE001
                    results[name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
                    print(f"  {name}: ERROR {type(exc).__name__}")
                    continue
                blob = json.dumps(payload, indent=2, default=str)
                (OUT / f"{name}.json").write_text(blob, encoding="utf-8")
                results[name] = {"ok": True, "bytes": len(blob), "shape": shape(payload)}
                print(f"  {name}: {len(blob):,} bytes")

    write_catalogue(results, HERE / "CATALOGUE.md")
    ok = sum(1 for r in results.values() if r.get("ok"))
    print(f"\n{ok}/{len(results)} endpoints returned data")
    print(f"raw JSON (gitignored): {OUT}")
    print(f"catalogue (committed): {HERE / 'CATALOGUE.md'}")
    return 0


def write_catalogue(results: dict[str, dict[str, Any]], path: Path) -> None:
    """Write the committed record: endpoint names, sizes and field shapes. No values."""
    lines = [
        "# Garmin Connect field catalogue",
        "",
        "Generated by `tools/garmin_probe/garmin.py probe` against Luis's own account.",
        "**Field names and types only — no values.** The raw JSON stays gitignored in",
        "`out/`. This file is what rocket's activity and wellness schema is designed",
        "against, so that the foundation accommodates every field Garmin exposes even",
        "where the first release does not read it.",
        "",
        "| Endpoint | Status | Bytes |",
        "| --- | --- | --- |",
    ]
    for name, r in results.items():
        status = "ok" if r.get("ok") else f"ERROR — {r.get('error', '')[:60]}"
        lines.append(f"| `{name}` | {status} | {r.get('bytes', 0):,} |")
    lines += ["", "## Shapes", ""]
    for name, r in results.items():
        if not r.get("ok"):
            continue
        lines += [
            f"### `{name}`",
            "",
            "```json",
            json.dumps(r["shape"], indent=2)[:6000],
            "```",
            "",
        ]
    path.write_text("\n".join(lines), encoding="utf-8")


# --------------------------------------------------------------------------- cli


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "--token-file", type=Path, default=DEFAULT_TOKEN, help="where the token lives"
    )
    p.add_argument("--mfa-file", type=Path, default=None, help="file holding the MFA code")
    p.add_argument("--mfa-env", default="GARMIN_MFA", help="env var holding the MFA code")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("bootstrap", help="one-time login, writes the token")
    sub.add_parser("probe", help="enumerate every endpoint and write the catalogue")
    args = p.parse_args(argv)
    return {"bootstrap": bootstrap, "probe": probe}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
