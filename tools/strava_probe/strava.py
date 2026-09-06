"""Strava OAuth exchange for rocket.

Strava's OAuth is a plain authorization-code flow with no PKCE and no discovery, so the
whole thing is one HTTPS POST. Two subcommands:

    uv run strava.py url        print the authorize URL to open in a browser
    uv run strava.py exchange   swap the ?code= from the redirect for tokens

The scope that matters is `activity:read_all`. Strava's consent screen presents scopes as
individual checkboxes the athlete can decline, so a grant can come back *without* it and
every later read then silently omits private activities. `exchange` therefore verifies the
granted scope rather than trusting the request, and refuses a downgraded grant.

Client ID and secret come from `pass` (strava/client-id, strava/client-secret) or the
environment. The refresh token is written 0600; Strava's access tokens expire in ~6 hours,
so the refresh token is the durable credential and is treated as one.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"
AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
REQUIRED_SCOPE = "activity:read_all"
# Strava validates the redirect's DOMAIN against the app's registered callback domain,
# not the full URL, so localhost works for a one-time local exchange.
REDIRECT = "http://localhost/exchange_token"


def _from_pass(entry: str) -> str | None:
    try:
        r = subprocess.run(
            ["pass", "show", entry], capture_output=True, text=True, timeout=30
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return r.stdout.splitlines()[0].strip() if r.returncode == 0 else None


def credentials() -> tuple[str, str]:
    cid = _from_pass("strava/client-id") or os.environ.get("STRAVA_CLIENT_ID")
    sec = _from_pass("strava/client-secret") or os.environ.get("STRAVA_CLIENT_SECRET")
    if not cid or not sec:
        raise SystemExit(
            "No Strava app credentials.\n"
            "  Create the app at https://www.strava.com/settings/api, then:\n"
            "  pass insert strava/client-id && pass insert strava/client-secret\n"
            "  (or export STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET)\n"
        )
    return cid, sec


def cmd_url(_args: argparse.Namespace) -> int:
    cid, _ = credentials()
    q = urllib.parse.urlencode(
        {
            "client_id": cid,
            "redirect_uri": REDIRECT,
            "response_type": "code",
            "approval_prompt": "force",  # always re-show, so scope is chosen explicitly
            "scope": REQUIRED_SCOPE,
        }
    )
    print("Open this, approve, then copy the ?code= value from the redirected URL:\n")
    print(f"{AUTHORIZE_URL}?{q}\n")
    print("The browser will fail to load localhost. That is expected —")
    print("the code in the address bar is still valid.")
    return 0


def cmd_exchange(args: argparse.Namespace) -> int:
    cid, sec = credentials()
    body = urllib.parse.urlencode(
        {
            "client_id": cid,
            "client_secret": sec,
            "code": args.code,
            "grant_type": "authorization_code",
        }
    ).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read())
    except Exception as exc:  # noqa: BLE001
        print(f"EXCHANGE FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    granted = payload.get("scope", "")
    if not has_scope(granted, REQUIRED_SCOPE):
        print(
            f"Grant is missing {REQUIRED_SCOPE} (got: {granted!r}).\n"
            "Private activities would be silently invisible. Re-run `url` and tick"
            " every box on the consent screen.",
            file=sys.stderr,
        )
        return 1

    OUT.mkdir(mode=0o700, parents=True, exist_ok=True)
    path = OUT / "token.json"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
    path.chmod(0o600)

    athlete = payload.get("athlete") or {}
    print(f"athlete id: {athlete.get('id')}")
    print(f"scope granted: {granted}")
    print(f"token written: {path} (0600)")
    return 0


def has_scope(granted: str | None, required: str) -> bool:
    """Exact-token match. A substring test would accept `activity:read` for
    `activity:read_all`'s prefix and hand back public-only data forever."""
    return required in (granted or "").split(",")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("url", help="print the authorize URL")
    ex = sub.add_parser("exchange", help="swap ?code= for tokens")
    ex.add_argument("code", help="the code from the redirect URL")
    args = p.parse_args(argv)
    return {"url": cmd_url, "exchange": cmd_exchange}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
