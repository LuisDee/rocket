# connector-auth-and-strava-upload

**Scope boundary:** two questions settled against primary sources, so neither is
re-asked. (1) What authentication the claude.ai "Add custom connector" dialog
actually offers, and therefore whether rocket needs to host an OAuth server to
reach Luis's phone before the race. (2) Whether rocket may upload a cropped FIT
file to Strava. Covers: the two decision entries, a phone-setup runbook in
`docs/STARTUP_ACCESS.md`, a correction to the now-false comment in
`src/mcp/auth.ts`, and one mechanical guard that turns "rocket must not call the
Strava API" from prose into a check. Explicitly does NOT cover: deploying rocket
to Vercel (no `rocket` project exists under `luisdees-projects`; the deploy ships
fifteen agents' in-flight work and needs Luis's hands on the environment
variables, so it is a coordinator act, not this task's); porting
`DoHardThings/lib/mcp-oauth.ts` (the conditional in the directive did not fire —
see below); changing `src/db/ingest-schema.ts`'s `uploading`/`uploaded` states or
anything else owned by `tasks/preview-and-ship.md`; and re-litigating the
2026-09-07 withdrawal of the Strava read API, which stands.

**References:** Anthropic, `claude.com/docs/connectors/custom/remote-mcp`, "The
Add custom connector dialog, field by field" and "Authenticating with request
headers"; `claude.com/docs/connectors/building/authentication`, "Supported
authentication types" table. Strava, `strava.com/legal/api_policy` (API Policy
2026, effective 2026-06-01) sections 3.5, 5.1, 5.3, 5.5, 5.10; and
`strava.com/legal/api` (API Agreement 2026) sections 1.1, 2.3(i), 7.1 plus the
`Strava API Materials` definition in its opening paragraph. Live Strava MCP tool
surface observed in-session, `eligibility` returning `{"eligible":true}`.
`docs/decisions.md` 2026-09-07 "the Strava API is withdrawn";
`docs/STARTUP_ACCESS.md` step 5; `docs/specs/04-mcp-surface.md` (tool responses
are written for "an LLM mid-conversation"); `tasks/preview-and-ship.md`, whose
`POST /api/ship` this verdict decides; `REDLINES.md` rule 5;
`docs/ci-gates.md` evidence convention.

**Alternative rejected:** (a) Porting `mcp-oauth.ts` with the owner-email
allowlist and `typ` claim the directive specifies. Rejected because its
precondition is false: `None` is not a beta, not an entitlement and not
plan-gated — it is one of three choices every account sees, and the directive's
own criterion says that ends the job. Roughly 400 lines of authorization server,
five routes and a Google sign-in dependency, to replace a shared secret that
already works, eleven days before a race. The allowlist finding is real and is
recorded anyway so it is not lost if OAuth is ever built. (b) Relying on the
`Request headers` field instead. Rejected as the primary path because it is beta
and "available to a limited set of organizations", so it may simply be absent
from Luis's dialog; worse, reaching it needs the URL probe to succeed first, and
an unauthenticated probe of `/api/mcp/mcp` returns a bare 401 with no
`WWW-Authenticate`, which Anthropic's own troubleshooting says ends in "Couldn't
reach the MCP server". It is documented as the upgrade, not the instruction.
(c) Adding `WWW-Authenticate` to the 401 so the header path probes cleanly.
Rejected for the reason already written in `src/mcp/auth.ts`: it makes claude.ai
start dynamic client registration against a sign-in service this app does not
host, converting a working connection into a failing one. (d) For the Strava
half, designing the upload behind a feature flag pending clarification.
Rejected — section 5.3 is not ambiguous about the mechanism, only about the
term, and a flag would leave `src/lib/strava.ts` in the tree as a thing someone
switches on. (e) Leaving the Strava verdict as prose in `docs/decisions.md`.
Rejected by `docs/ci-gates.md`'s own rule: a constraint nobody can watch fail is
a decoration, and an agent is building `src/lib/strava.ts` right now.

**Interface touched:** new `scripts/check_no_strava_api.py`; new `no-strava-api`
job in `.github/workflows/check.yml` and a call added to the `guards` script in
`package.json`. Edited: `docs/decisions.md` (two appended entries),
`docs/ci-gates.md` (one row, plus the stale Strava clause in the existing
harness-tests row), `docs/STARTUP_ACCESS.md` (a new step 7, and step 5 extended
with the upload verdict), `src/mcp/auth.ts` (comment only — the claim that the
connector UI "has no header field" is now false). No behaviour changes: no
production TypeScript is altered, and no OAuth code is written.

**Acceptance criteria:**

1. `docs/decisions.md` carries a dated entry stating the three authentication
   choices verbatim, naming `None` as the one that needs no server-side work,
   and recording the owner-allowlist and `typ`-claim findings so a future OAuth
   port inherits them rather than repeating the flaw.
2. `docs/decisions.md` carries a dated entry giving the Strava upload verdict
   with the section numbers it rests on, and stating plainly that the pipeline
   ends at the preview and Luis uploads by hand.
3. `python3 scripts/check_no_strava_api.py` exits 0 on the tree as it stands.
4. The same guard exits non-zero, naming the file and line, when a Strava API
   hostname or a Strava OAuth credential name is introduced under `src/`,
   `config/`, `tools/`, `scripts/`, `.env.example` or `.github/` — proven by
   introducing one, watching it fail, and reverting.
5. The guard does NOT fire on the words already in the tree that are not API
   calls: `strava_activity_id`, `stravaActivityId`, and prose mentioning Strava.
   Asserted by criterion 3 passing on a tree that contains all three.
6. `docs/ci-gates.md` has an `IMPLEMENTED` row for the guard with a resolvable
   `Enforced by:` and the deliberate violation from criterion 4 written down.
7. `docs/STARTUP_ACCESS.md` gives Luis a runbook he can follow on the phone
   without asking a question: the exact URL shape, which of the three
   authentication choices to pick, and what to do if `Request headers` is
   present.
8. `npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`,
   `npm run test`, `python3 scripts/check_gate_ledger.py`,
   `python3 scripts/test_guards.py` and
   `python3 scripts/check_task_trace.py --range main..HEAD` all pass.

**Assumptions:**

- **Whether Luis's dialog is the one-step or the two-step version is
  unobservable from here, and does not change the answer.** Anthropic notes the
  two-step dialog "is rolling out gradually". The one-step version has no
  Authentication selector at all — it simply adds the URL, which is behaviourally
  identical to `None`. Both therefore accept a URL carrying `?token=`. The
  runbook is written so it does not need to know which he has.
- **`?token=` survives into every request.** Not stated as a guarantee anywhere;
  inferred from Anthropic's authentication page enumerating `?token=`,
  `?apiKey=` and `?userToken=` as connector-URL patterns it advises against —
  advice against a pattern that does not function would be pointless. It is
  already what `src/mcp/auth.ts` was built for. Falsifiable in about thirty
  seconds against a real deployment, which is the first thing to try, and if it
  is wrong the fallback is the `Request headers` field, not OAuth.
- **The credential travels in a URL, which Anthropic calls a vulnerability and
  the MCP authorization specification prohibits for access tokens.** Accepted
  deliberately and with a named ceiling: one user, a private endpoint, a 256-bit
  token, and an append-only history behind it. Rotation means changing
  `MCP_BEARER_TOKEN` and re-adding the connector, because authentication settings
  cannot be edited after a connector is added. The upgrade path is the
  `Request headers` beta, not an OAuth server.
- **"AI Application" is used but never defined** — not in the API Policy, not in
  the API Agreement, and the Policy defers capitalised terms to the Agreement,
  which does not carry it. The verdict therefore does not rest on the definition.
  It rests on section 5.3's enumerated activities, which include "ingestion into
  a context window or working memory", and on section 3.5 naming the Strava MCP
  the "sole authorized" agent-mediated interface. Both bite regardless of how the
  undefined term is read.
- **The restricted noun in section 5.3 is `Strava API Materials`, not only
  `Strava Data`.** This is the point on which the intuitive defence — "it is my
  own Garmin file, Strava has no data in it" — fails, and it is why the verdict
  is not close. Uploading requires a registered Developer Application and its
  API Token, and the API Token is `Strava API Materials` by the Agreement's own
  opening definition.
- **Section 5.5 binds the Strava MCP path too, and that is somebody else's
  problem to act on.** Section 3.5 permits subscriber MCP access "in accordance
  with this Policy", and 5.5 forbids storing Strava Data in any Persistent Index
  including "retrieval-augmented data stores". Rocket's Neon database is one. No
  code reads Strava today and Garmin is the ingest source, so nothing is in
  breach; flagged here and in the decision entry rather than fixed, because
  changing the ingest contract is `tasks/ingest-pipeline.md`'s call, not this
  task's.
- **The deploy is the real remaining blocker and this task does not clear it.**
  `vercel project ls` under `luisdees-projects` lists `do-hard-things`,
  `dance-website`, `rsdwui` and `marathon-plan` — no `rocket`. Until one exists
  there is no URL to paste, so criteria 1-8 are everything that can be finished
  without Luis's hands and without shipping fifteen agents' in-flight branch.

**Header amendment, 2026-09-07** (recorded rather than silently rewritten, per
`tasks/README.md`). _Interface touched_ attributed the stale Strava clause to
`docs/ci-gates.md`'s harness-tests row. That row is accurate — it already
records the 2026-09-07 withdrawal correctly. The stale clause was in
`.github/workflows/check.yml`'s `harness-tests` job comment, which still
described a Strava harness and an `activity:read_all` grant that no longer
exist. Fixed there; `docs/ci-gates.md` gains the new row only.

---

## Checklist

- [x] Guard `scripts/check_no_strava_api.py`, proven against a deliberate violation
- [x] Wire it into CI and `npm run guards`
- [x] `docs/ci-gates.md` row + the stale Strava clause in the harness-tests row
- [x] `docs/decisions.md` — connector authentication entry
- [x] `docs/decisions.md` — Strava upload verdict entry
- [x] `docs/STARTUP_ACCESS.md` — phone runbook, and step 5 extended
- [x] `src/mcp/auth.ts` — correct the now-false header-field claim
- [x] All gates green

## Commits

57e0608 docs(connector): no OAuth server is needed, and Strava uploads are prohibited
