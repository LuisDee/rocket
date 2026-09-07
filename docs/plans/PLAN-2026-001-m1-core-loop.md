# PLAN-2026-001 — M1: the core loop (domain, load engine, planner, MCP surface)

**Spec**: `docs/specs/00-overview.md` … `07-wiring-todo.md` (the seeded spec pack — no `SPEC-YYYY-NNN` file exists; the pack is the source of truth and this plan consumes it rather than re-deriving it).
**Status**: ACTIVE, rewritten 2026-09-07 for **option A** (ratified by Luis that day). Stage 1 is delivered; Stages 3 and 5 are cut in place; every cut carries a row in the Deferred-Items Register at the end of Phase 2. The corrections applied in that rewrite answer `docs/reviews/2026-09-07-response-ledger.md` rows F30/F2/F31, F22, F23, F29/S6.8, F25, F32, F21 and F14, and the ledger is authoritative over the 2026-09-06 review where the two differ.
**Branch/worktree**: `.worktrees/m1-core-loop` on `feat/m1-core-loop`. Main stays on `main`.
**Clock**: written 2026-08-16, Garmin sections revised 2026-08-18, macro layer re-derived 2026-09-06, rewritten for option A 2026-09-07. Race is 2026-10-24, **47 days out**. The block now runs from 2026-09-07: a taper week into the **Battersea Park Half on Sat 12 Sep** (same park as the goal race, so it doubles as a course rehearsal AND is what settles goal marathon pace -- it replaces Lincoln in that role, three weeks earlier), then four build weeks, then two taper weeks. Only **four long runs** fit before the taper against the six to eight a normal block carries, which is the binding constraint on race day and what makes the Stage 3b backfill urgent.

---

## Phase 0 — Discovery

### Project context

`rocket` is a greenfield Next.js 16.3.1 / React 19.2.8 / TypeScript app scaffolded on 2026-08-15 (`08cdf28`). It has no domain code: 9 default `create-next-app` files, plus `config/training.ts` (every training threshold, all `PROVISIONAL`) and its 12-assertion test. Toolchain: npm, Node 24.x, `tsc --noEmit` with `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`; eslint with four type-aware rules; prettier; vitest. Seven gates run in CI, all proven to fail on a deliberate violation (`docs/ci-gates.md`).

Because rocket has no patterns of its own yet, "codebase patterns to follow" means **DoHardThings** (`~/dev/DoHardThings`), the same author's working Next.js-on-Vercel app with a live claude.ai MCP connector. It is the porting source. Its local `main` is 13 commits behind `origin/main`; **fetch before porting** — of the MCP surface only `lib/mcp-tools.ts`, `lib/mcp-create.ts` and the new `lib/mcp-image.ts` differ.

### What to lift from DoHardThings, in option-A order

Re-ranked 2026-09-07 (ledger F25). The original table was ordered by size, which put its largest row — the OAuth shim —
first; option A defers exactly that row, so following the old order would have spent the first days of a two-week window on
the one thing that was just cut. Line counts are the review's, corrected by the ledger's spot-check against the working tree.

| #   | Asset                        | Files                                                                                    | Lines                                        | Reuse                                                                                                                                                                                                                                                                                                                            | Lands at                                                         |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **MCP handler wiring**       | `app/api/mcp/[transport]/route.ts`                                                       | 63                                           | verbatim, including `basePath` and the dual-mode 401                                                                                                                                                                                                                                                                             | Stage 4                                                          |
| 2   | **Utilities**                | `calendar-grid.ts`, `format.ts`, `day-param.ts`, `rate-limit.ts`, `logger.ts`, `http.ts` | 358                                          | verbatim                                                                                                                                                                                                                                                                                                                         | Stages 2–4, as each is needed                                    |
| 3   | **Ingest ordering pattern**  | DHT's ingest/token/webhook/crypto quartet plus its store triple                          | ~550                                         | **shape only**, retargeted at intervals.icu. Reading our own source for an ordering pattern is not use of Strava API materials under §5.3; no Strava endpoint is called and rocket holds no Strava API credentials. `tasks/integration-harness.md:19` withdrew it as a _reference_ — narrowed here to what §5.3 actually reaches | Stage 3b and the daily job                                       |
| 4   | **ICS export + signed feed** | `lib/ics.ts`, `lib/ics-feed.ts`                                                          | 232                                          | verbatim                                                                                                                                                                                                                                                                                                                         | With the outbound calendar leg                                   |
| 5   | **Push stack**               | `lib/push-*`, `lib/sw-push.ts`, `app/sw.ts`                                              | 650 (the review said ~500; it under-counted) | verbatim minus branding                                                                                                                                                                                                                                                                                                          | Last before the race, per the 2026-09-06 service-worker decision |
| 6   | **MCP OAuth 2.1 shim**       | `app/api/mcp/oauth/*`, `lib/mcp-oauth.ts`, `lib/mcp-auth.ts`, `next.config.ts` rewrites  | ~600                                         | near verbatim, plus an owner allowlist                                                                                                                                                                                                                                                                                           | **Pre-race** (Stage 5, after the planner — reversed 2026-09-07)  |

Do **not** inherit Google-Calendar-as-database or DHT's signed-in-equals-god-access model. Closing evidence on the repo
boundary, discovered after the review: DHT stores its race domain fields in Google Calendar `extendedProperties`, and the
Google Calendar connector does not return `extendedProperties` — so DHT's own race data is not queryable by a third party
through the store it lives in. Merging the repos would inherit an unqueryable store for precisely the one entity that made
the merge argument. The question is closed.

### Skills and agents to leverage

| Skill / agent                                             | When                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `test-driven-development`                                 | Before every stage — RED first                                                            |
| `systematic-debugging`                                    | On any test failure, before a fix attempt                                                 |
| `code-reviewer`                                           | After every stage                                                                         |
| `security-reviewer-fullstack`                             | After Stages 1, 4, 5 — **mandatory** (append-only guards, bearer auth, OAuth)             |
| `typescript-pro`                                          | Stages 2, 8 — branded types for the two load components, discriminated unions for results |
| `database-migrations` / `postgres-pro`                    | Stage 1 — migration ordering, trigger semantics                                           |
| `nextjs-developer`                                        | Stages 4, 5 — App Router route handlers, nested well-known paths                          |
| `fewer-permission-prompts`                                | Not applicable                                                                            |
| `verified-not-claimed` / `verification-before-completion` | Before any done-claim                                                                     |

### Key discovered facts (verified this session)

| Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Source                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **CORRECTED 2026-09-07 — SDK v1 is current, not frozen.** `@modelcontextprotocol/sdk` is at 1.30.0, published 2026-07-27: maintained, not abandoned. The monolith additionally split into `@modelcontextprotocol/server@2.0.0`, `client@2.0.0`, `core@2.0.0`, so v2 is real — but "frozen" overstated v1's status and this plan built on that overstatement                                                                                                                                                                                             | npm registry, re-read 2026-09-07 (ledger F22)                                                                                |
| **CORRECTED 2026-09-07 — `mcp-handler` was not superseded.** It is at 2.1.1, published 2026-08-13, `peerDependencies {"@modelcontextprotocol/server": "^2.0.0", "next": ">=13.0.0"}`, serving the 2026-07-28 spec natively with fallback for 2025-era clients. Vercel's package **tracked** v2 rather than being displaced by it. The "thin re-wrapper — drop it" claim is withdrawn                                                                                                                                                                    | npm registry, re-read 2026-09-07 (ledger F22)                                                                                |
| DoHardThings runs the **proven** stack in production against the real claude.ai connector, iOS included: `mcp-handler` **1.1.0** + `@modelcontextprotocol/sdk` **1.29.0** (installed versions, not the caret ranges), mounted at `app/api/mcp/[transport]/route.ts` via `createMcpHandler` with `basePath: '/api/mcp'` — so the endpoint claude.ai is given is `/api/mcp/mcp`. Trap: `mcp-handler@1.1.0`'s peer pins the SDK at exactly 1.26.0, so DHT's 1.29.0 is an unmet peer that happens to work. Pin what DHT has installed, never the peer range | `DoHardThings/package.json`, `app/api/mcp/[transport]/route.ts:1-40`                                                         |
| **zod v4 is required.** zod 3 registers fine then explodes at `tools/list` — invisible until claude.ai first talks to the server. DHT pins `zod@^4.4.3` and imports `import { z } from 'zod'`: with zod 4 installed the root export **is** v4, so no `zod/v4` subpath is needed. The `npm ls zod` CI gate is what keeps a transitive 3.x out, at zero cost                                                                                                                                                                                              | `DoHardThings/package.json:42`, `lib/mcp-tools.ts:2`                                                                         |
| Stateless is the only mode: the 2026-07-28 spec revision removed `Mcp-Session-Id` entirely, and claude.ai is still a 2025-era client (`SUPPORTED_PROTOCOL_VERSIONS` tops at 2025-11-25). `mcp-handler@1.1.0` is stateless by default — Redis is needed only for SSE session resumability, which we do not use. v2's dual-era `legacy` option is a post-race concern, not a v1 problem                                                                                                                                                                   | Anthropic connector docs; `DoHardThings/app/api/mcp/[transport]/route.ts:6-8`                                                |
| **DHT security trap CONFIRMED:** `app/api/mcp/oauth/authorize/route.ts:42-57` mints an authorization code for **any** email completing Google sign-in. No allowlist, and no `signIn` callback in `lib/auth.ts:26-28`. `friends.json` is display-only                                                                                                                                                                                                                                                                                                    | read directly on `origin/main`                                                                                               |
| DHT tool handlers **do not know who is calling** — the OAuth subject is verified at the gate then discarded; handlers call `mcpActorEmail()`, a static env var                                                                                                                                                                                                                                                                                                                                                                                          | `lib/mcp-create.ts:53-55`                                                                                                    |
| DHT tool results are text-only, and handlers **never throw**: `ok()` / `fail()` / `reason()` map a `ZodError` to field-level guidance (`date: Invalid`, not a stack trace)                                                                                                                                                                                                                                                                                                                                                                              | `lib/mcp-tools.ts:52-74`                                                                                                     |
| DHT `inputSchema` is a **plain object of zod validators, not a wrapping `z.object()`** — the most common porting mistake                                                                                                                                                                                                                                                                                                                                                                                                                                | `lib/mcp-tools.ts:112-132`                                                                                                   |
| DHT genuinely has **no database** (`DATABASE_URL` deliberately removed). Google Calendar is the event store; Upstash Redis holds structured records; Vercel Blob holds images                                                                                                                                                                                                                                                                                                                                                                           | `DoHardThings/CLAUDE.md:101`, `lib/*-store.ts`                                                                               |
| DHT's store seam — `*-types.ts` (interface, zero imports) / `*-memory.ts` / `*-real.ts` / factory with a `configured()` predicate — is the testability pattern to copy                                                                                                                                                                                                                                                                                                                                                                                  | `lib/push-store.ts`                                                                                                          |
| Vercel's Neon recommendation **reversed**: with Fluid compute it is now plain `pg` Pool + `attachDatabasePool()` over TCP to the `-pooler` host, **not** the Neon HTTP driver. Most search results still say otherwise                                                                                                                                                                                                                                                                                                                                  | Neon/Vercel docs, 2026-08                                                                                                    |
| Append-only needs **two** binding layers: privilege revoke binds the app role (SQLSTATE 42501) but is void against the owner, who can re-grant to itself; an `ENABLE ALWAYS BEFORE UPDATE OR DELETE` trigger binds the owner (23001). **Rules and RLS fail silently** — verified: a rule reported `UPDATE 0` and left the row intact                                                                                                                                                                                                                    | executed on PostgreSQL 18.6                                                                                                  |
| Prisma's drift remedy is `migrate reset`, which drops and recreates — **verified to destroy triggers and ACLs**. Drizzle's "the SQL file is the migration" model keeps guards inside the migration chain                                                                                                                                                                                                                                                                                                                                                | verified                                                                                                                     |
| Drizzle 1.0 has been in RC since May 2026 and still is not GA; `0.45.2` is what you actually pin                                                                                                                                                                                                                                                                                                                                                                                                                                                        | npm, 2026-08-16                                                                                                              |
| **No validated two-component cardio/musculoskeletal stress score exists in the literature.** Closest commercial: Polar Training Load Pro (Cardio Load = TRIMP, Muscle Load = mechanical kJ). Closest science: differential RPE, which validates a _perceptual_ split, not a computed one                                                                                                                                                                                                                                                                | literature review                                                                                                            |
| **No published coefficient converts descent metres into muscle-damage load.** The effect is qualitatively certain (CK, MVC loss, DOMS rise while metabolic cost falls) but every number is a calibration knob                                                                                                                                                                                                                                                                                                                                           | Minetti; EIMD literature                                                                                                     |
| ACWR has been statistically dismantled — Lolli 2019 (mathematical coupling / spurious correlation), Impellizzeri 2020 (acute-to-_random_ predicts injury as well as acute-to-chronic)                                                                                                                                                                                                                                                                                                                                                                   | published critique                                                                                                           |
| Raw Foster sRPE is ~180–360 AU/hour while TSS is ~100/hour. Mixing them in one EWMA would **triple ATL** on a week of missing HR data and fake an overreaching alarm                                                                                                                                                                                                                                                                                                                                                                                    | units analysis                                                                                                               |
| ATL/CTL 7/42-day EWMA is a **vendor convention** (TrainingPeaks), not a finding. Hellard showed individual time constants are non-identifiable (tau correlation 0.99) — do not fit them                                                                                                                                                                                                                                                                                                                                                                 | literature                                                                                                                   |
| **Watch is a Fenix 8** (confirmed 2026-08-18). Top tier: HRV status + baseline band, Body Battery, sleep staging, sleep score, Training Readiness, Training Status, native running dynamics. Every overnight metric gated on being **worn asleep**, not on the model                                                                                                                                                                                                                                                                                    | Garmin support tiering; research rated device lists only _medium_ confidence — they are the least stable thing in the report |
| Garmin exposes a **real acute/chronic pair**: `get_training_status()` → `acuteTrainingLoadDTO.dailyTrainingLoadAcute` / `dailyTrainingLoadChronic` / `dailyAcuteChronicWorkloadRatio`; and `get_training_readiness()` → score 1–100, level, and five weighted factors                                                                                                                                                                                                                                                                                   | `garminconnect/__init__.py:2213-2219`, typed.py                                                                              |
| HRV comes back in **all shapes at once**: `hrvSummary.lastNightAvg`, `.weeklyAvg` (7-day), `.status` enum, `.baseline` band, plus raw ~5-minute overnight readings                                                                                                                                                                                                                                                                                                                                                                                      | `garminconnect/__init__.py:2027-2046`, typed.py `HrvData`                                                                    |
| `python-garminconnect` **no longer depends on `garth`** as of 0.3.11. Every third-party guide documenting `garth.dumps()` / `GARMINTOKENS_BASE64` is stale                                                                                                                                                                                                                                                                                                                                                                                              | pyproject.toml + PyPI, read 2026-08-18                                                                                       |
| `Garmin.login()` accepts an **inline JSON token string** (`_looks_like_json()` → `client.loads()`), so no filesystem is needed. **But in that mode it never writes rotated tokens back** — every `client.dump()` is gated on `tokenstore_path is not None`, while `_refresh_di_token()` does rotate. The caller must persist `client.dumps()` after every login                                                                                                                                                                                         | `garminconnect/__init__.py:182-192,739-749,772-781`                                                                          |
| **429 lockout is keyed per-account** (clientId + email), empirically inescapable by changing IP or headers, lasting 48–72+ hours with no recovery process                                                                                                                                                                                                                                                                                                                                                                                               | issue #344                                                                                                                   |
| No official route for one person: Developer Program is business-use-only and its request form has been a "System Maintenance" block since 2026-03-25                                                                                                                                                                                                                                                                                                                                                                                                    | verified live 2026-08-18                                                                                                     |
| intervals.icu holds **genuine Garmin partner OAuth** (connecting shows Garmin's own consent screen) and issues a self-serve personal API key. **But its wellness field coverage is UNVERIFIED** — the claim rests on an undated third-party guide plus forum threads, and a 2026-05-19 bug report shows partial syncs (sleep arriving; RHR, HRV, steps, body battery missing)                                                                                                                                                                           | research, explicitly hedged                                                                                                  |
| Vercel Hobby cron: **1×/day, ±59 min, never retried, best-effort** — runs can be missed with no log produced                                                                                                                                                                                                                                                                                                                                                                                                                                            | Vercel docs                                                                                                                  |

### Data flow (target state, M1)

```
Claude (phone / Claude Code)
   └─ MCP tools ──▶ /api/mcp/[transport]  (mcp-handler 1.1.0 + sdk 1.29.0, stateless, bearer)
                       │
                       ├─ tool layer   (zod v4 in, ok()/fail() out, never throws)
                       └─ domain core  (pure functions, no I/O, no Next imports)
                              │
                              ├─ load engine   activity → {cardio, msk} → ATL/CTL/TSB → readiness
                              └─ planner       macro targets + availability → rolling window
                                     │
                              store seam (types / memory / drizzle)
                                     │
                              Neon Postgres — history tables APPEND-ONLY at the DB level
```

### Existing tests and gaps

`config/training.test.ts` (12 assertions over thresholds and the seed block) is the only test. Everything below is a gap.

### External dependencies

| Dependency                               | Stability                                                     | Constraint                                                                                                                                                               | Fallback                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Neon Postgres                            | Stable                                                        | Free tier; **history retention defaults to a plan-dependent window, 30-day ceiling** — set it explicitly, this is the highest-value config change for irreplaceable data | none needed                                                                                                                      |
| `mcp-handler@1.1.0` + `sdk@1.29.0`       | Proven in production on this account                          | Both v1 majors and maintained (sdk 1.30.0 shipped 2026-07-27). `mcp-handler@1.1.0` peer-pins sdk 1.26.0; 1.29.0 is an unmet peer DHT runs anyway                         | pin **exact**, both. The retreat points forward: revisit `mcp-handler@2.1.1` + `@modelcontextprotocol/server@2` after 2026-10-24 |
| `drizzle-orm@0.45.2`                     | 0.x, 1.0 in RC 4 months                                       | 1.0 may ship mid-block                                                                                                                                                   | pin **exact**, no caret; treat 1.0 as a scheduled task                                                                           |
| claude.ai connector                      | Stable but opaque                                             | Requires OAuth; rejects static tokens                                                                                                                                    | Claude Code with a static bearer keeps working                                                                                   |
| Garmin source (bridge or direct library) | Bridge unverified; library healthy (0.3.10, zero open issues) | Probe decides before schema design. **Never retry against auth** — 429 is per-account, 48–72h                                                                            | Manual FIT download from Connect web UI; RPE floor keeps the engine running                                                      |
| DoHardThings / routr                     | —                                                             | **Out of scope for M1**                                                                                                                                                  | n/a                                                                                                                              |

### Previous incidents and reviews informing this plan

routr's `PLAN-2026-004` paranoid pass produced findings that transfer directly: an authorization code accepted as a bearer token unless a `typ` claim separates them; discovery metadata served at the bare well-known path only when clients probe the suffixed one; positive auth tests made vacuous by a fail-open default; and tool results carrying enough payload to blow the model's context. Each is addressed below.

---

## Phase 1 — Clarify

**Business outcome**: Luis can run his marathon block by talking to Claude on his phone — logging what he actually did, checking in each morning, and getting a re-planned rolling window that respects his own guardrails — with zero integrations, so the coach works on manual input alone from day one.

**How we'll know it worked**:

1. From the claude.ai app on his phone: "I did 12k easy this morning, felt fine, road shoes" → logged, load state updated, plan diff explained in prose.
2. A 30-second morning check-in that changes the day's session when soreness is high (Loop B).
3. "I feel great, doing 30km today" is **negotiated**, not silently executed — the reply states the rule, quantifies the cost, and offers a compliant alternative (Loop A).
4. `get_status` opens a conversation with today's readiness, today's session, load state and days to race.
5. Every logged activity survives a deliberate `UPDATE` and `DELETE` attempt at the database level.
6. Full suite green: unit + integration against a real Postgres + the MCP contract tests.

### The MVP, and what is deliberately deferred

**Scope is option A, ratified by Luis on 2026-09-07.** What follows was written on 2026-08-16 against 48 days and ten
stages. It is now 47 days to 2026-10-24 and the ratified scope is a thin working coach, not the ten-stage build. Everything
option A cuts is struck in place below and carried in the **Deferred-Items Register** at the end of Phase 2, with a
classification, a named owner and a re-ratification date. A deferral that lives only in a chat decision and not in the plan
file is a deferral the next agent reading the plan will build anyway.

**MVP: a persistent, phone-accessible training plan that auto-ingests Garmin activities and pushes back when Luis breaks his own rules.**

**Pre-race running order: 0 → 1 (delivered) → 2 → 3 → 3b → 4 → 6 → 7 → 10.** Stage 5 (OAuth 2.1) sits behind the planner
and the check-in loop and out of the pre-race path entirely (ledger F23, F30); Stages 8 and 9 remain after it. Stage numbers
are identities referenced from `tasks/*.md`, `docs/ci-gates.md` and both review documents, so nothing is renumbered — the
order changed, the names did not.

**What "a strong foundation" means here**, restated against the definition the 2026-09-07 ledger settled (F31), because the
standing instruction "the MVP must accommodate ALL data" has been read as a mandate for guard depth and auth ceremony and is
neither — it is a **capture** requirement, and one `jsonb` column satisfies it:

| Pillar                                     | What it is                                                                                                                                                                                                                    | Where it stands                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) The data model                         | Append-only history, provenance columns, notes                                                                                                                                                                                | Six tables delivered — five in `9153fde`, the mutable `notes` table and its grant on 2026-09-07; `rocket_add_note` is specified in `04-mcp-surface.md` and implemented with Stage 6. Provenance columns land at Stage 3b                                                                                                    |
| (b) Thresholds and rules as **cited data** | Every guardrail carries a stable string id and its citation, emitted as `applied_rules[]` / `violated_rules[]` on every write result                                                                                          | **Started 2026-09-07.** `GUARDRAIL_RULE_IDS` (`config/training.ts:226`) carries the ids and citations; `applied_rules[]` and `violated_rules[]` are both in the write envelope (`04-mcp-surface.md`). The planner that emits them lands with Stages 6-7. Folded into the write-tool contract, not run as its own workstream |
| (c) The deterministic planner              | Sole writer of session and week rows; every write returns `{applied, applied_rules[], violated_rules[], compliant_alternative, resulting_window}`, validated over the **whole** rolling window rather than the single session | Stages 6–7. The contract is spec text and a return type, authored before the first tool exists                                                                                                                                                                                                                              |
| (d) Degrade gracefully, proven by tests    | The RPE floor is always computable; objective terms drop out and weights renormalise; `warmingUp` is never presented as authoritative                                                                                         | Shape stated in the Garmin degradation path below; the tests land with Stages 4, 7 and 9                                                                                                                                                                                                                                    |
| (e) Lossless capture of upstream payloads  | Everything upstream returns is kept — typed columns for what we query, the whole payload in `raw` so a field we did not think to type is neither lost nor needs re-ingesting                                                  | Delivered: `src/db/schema.ts:16-22`, `raw: jsonb`, with one **measured** exception — per-second streams at 587,968 bytes against a 0.5 GB tier, held as `streams_ref`                                                                                                                                                       |

Guard depth, the auth server and the SDK major are **not** on that list. The DB guards shipped correctly and cheaply and are
done; the auth server is deferred; the SDK question is answered by reuse. The weakest part of the foundation is (b) — the part
nobody has started, not the part someone over-built.

**The dated gate that decides whether this repeats the first attempt (ledger F32).** `~/dev/marathonApp` (2026-03-28) was the
previous block's tool: 137 lines of static plan data behind completion toggles, with a run log and session notes. Rocket's
home page today imports `src/data/recent-activities.json` and its own footer says "not live yet … a snapshot taken on
2026-09-06". On that one dimension rocket is currently **less** than marathonApp. The difference this time has to be that the
plan adapts, and the honest test of that is not "reads from Postgres" but "accepts a write", because
`docs/specs/00-overview.md:19` makes the subjective check-in a first-class signal shipped before any API integration:

> **By 2026-09-14** (`CHECK_IN_GATES[0].afterWeekMonday`): `src/data/recent-activities.json` is **deleted**, and
> `src/app/page.tsx` both reads activities from Postgres **and** accepts a check-in write. If that date passes with the JSON
> snapshot still wired in, F32 is proven — scope gets cut further rather than defended.

That is a date and a `git rm`, so it can be checked rather than nodded at.

**Deferred hardest: the two-component cardio/musculoskeletal load model.** It is the weakest bet in the project, and naming
that plainly is the point of this paragraph:

- No published validation exists for a computed cardio/MSK split. The closest commercial precedent is Polar's Muscle Load in
  kJ; the closest science is differential RPE, which validates a _perceptual_ split rather than a computed one.
- Its coefficients — `w_ecc`, the surface factors, footwear novelty decay — are calibration knobs, not findings. No published
  coefficient converts descent metres into muscle-damage load.
- Calibrating them needs prediction-vs-outcome pairs that do not exist yet and cannot exist until the system has been in use
  for weeks.
- Its principal output, readiness, is still gated on open question 4 — the specs mandate two components and then define
  readiness without one.
- Garmin already provides a readiness score with five weighted factors and a real acute/chronic pair for free, via
  `get_training_readiness()` and `get_training_status()`.

Rocket's genuine differentiator is the conversation and the guardrails, not a second load number. **Trigger to revisit**: once
Stage 9 has run for ~3 weeks against real data and Garmin's own numbers are stored alongside ours, the divergence between the
two series is the evidence that says whether the second component earns its place. That is a decision with data behind it,
which is the only honest way to make it.

### Open questions — resolved this session

1. **M1 boundary** → **the phone**. OAuth 2.1 is in scope (Stage 5). Ratified 2026-08-16.
2. **Run-commuting** → **no** — not feasible (sweat, no facilities). Design instruction carried forward: _"focus on the framework so this will support varying training"_ — availability and session placement stay fully data-driven, with no slot shape baked into the planner.

### Open questions — still open (do not block Stages 0–4)

3. ~~**The returning-from-rest ramp rule.**~~ **CLOSED 2026-09-07.** The block this question was asked about was replaced on 2026-09-06, and `GUARDRAILS.returningFromRestRampCapPct` was deleted with it — no week in the committed block invokes a returning-from-rest allowance. The single exemption is week 2's, marked RATIFIED and asserted by test. Nothing here blocks Stage 6. See `docs/decisions.md` 2026-09-07, which supersedes the 2026-08-15 entry.
4. **How musculoskeletal load enters readiness.** The specs mandate two components, then define readiness without one, and `07-wiring-todo.md:23` says "total-load only", contradicting the design. Needed before Stage 9. **The recommendation that stood on this line is withdrawn (2026-09-07, ledger F14).** It read "musculoskeletal TSB gates _quality_ sessions only; cardio TSB drives the overall green/amber/red" — which is TSB gating a session on its own, queued for a signature that would have contradicted `CHECK_IN_GATES`' own refusal to gate on an acute:chronic figure and made that paragraph decoration. The criticism that bites is not Impellizzeri's mathematical coupling (a difference is not a ratio) but Hellard 2006 and Vermeire 2022: the 7/42 constants are nominal conventions, non-identifiable, and they shift with the load metric, so the number has no calibrated meaning to threshold against — which applies to a difference exactly as to a ratio. **Musculoskeletal load is a trend display.** Quality is gated by the soreness gate (`READINESS.sorenessBlocksQuality`, currently 3) and the readiness verdict, never by a TSB threshold. What stays open is only how the component is displayed, and that cannot be answered until the component exists.
5. **CTL seeding.** History starts 2026-07-05, so CTL has under one time constant until roughly mid-September. Practitioners either backfill months of data or hand-seed CTL and ignore the first ~6 weeks. **Recommendation**: hand-seed CTL from the stated ~30 km/week baseline and have every verdict carry an explicit `warmingUp` flag until 42 days of history exist (REDLINES rule 4). Needed before Stage 9.

### Volume feasibility without run-commuting — the arithmetic

The spec calls run-commutes "the biggest lever for fitting 60 km around five swim evenings" (`03-planner.md:11`). With them removed, peak weeks must fit into mornings and weekends. Working it through:

- Out of the house ~08:15–19:45 (09:00–18:00/19:00 plus 45 min each way). Swim evenings land ~20:00.
- Weekday running is therefore **early morning**, 60–75 min ≈ 10–13 km easy.
- Friday is the swim lesson (rest from running); Sunday is recovery/swim.
- **Week 6 (60 km)**: long run 24–28 km Saturday leaves 32–36 km over Mon–Thu ≈ **8–9 km per morning**.
- **Week 7 (65 km, peak)**: long run 32–34 km leaves 31–33 km over Mon–Thu ≈ **8 km per morning**.

**Conclusion: the targets are reachable without run-commuting.** The binding constraint is not distance per session — 8–9 km is a comfortable morning — it is the _number of mornings_: four weekday runs every week with no slack for a missed alarm. The planner must therefore treat a missed morning as a first-class replan trigger, not an exception. This contradicts the spec's framing that run-commutes are essential at this volume; `03-planner.md:11` should be amended.

### Assumptions

| #   | Assumption                                                                                  | Confidence                       | How to verify                                                                                                                                                        | Fallback if wrong                                                                                                 |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | `mcp-handler@1.1.0` + `sdk@1.29.0` work inside a **Next 16.3.1** App Router route on Vercel | Med-High                         | Stage 4 itself. DHT proves the stack in production but on **Next 15.5.18**, so the Next major is the only untested variable — a spike would re-prove the proven half | `mcp-handler@2.1.1` + `@modelcontextprotocol/server@2`, accepting the `z.object()` input-schema rewrite v2 forces |
| 2   | claude.ai adds a connector against an SDK-v2 stateless server                               | Med                              | Stage 5, on the real deployment                                                                                                                                      | Keep Claude Code path working; fall back to DHT's exact v1 shape                                                  |
| 3   | An `ENABLE ALWAYS` trigger blocks the owner on **Neon** as it does on stock Postgres 18.6   | Med                              | **Stage 0 spike against a real Neon branch** — Neon's role model differs (`neon_superuser`, no true superuser)                                                       | Rely on the role-grant layer plus a CI assertion; document the gap in the ledger                                  |
| 4   | `pg` Pool + `attachDatabasePool()` is right for Neon on Fluid compute                       | Med                              | Stage 1; monitor Neon connection count after week 1                                                                                                                  | Neon HTTP driver, accepting loss of interactive transactions                                                      |
| 5   | Drizzle 1.0 does not GA mid-block, or upgrades cleanly                                      | Low-Med                          | Watch the `rc` tag                                                                                                                                                   | Pin exact versions; defer the upgrade past the race                                                               |
| 6   | Four weekday morning runs are sustainable                                                   | Low — behavioural, not technical | Weeks 3–4 of real use                                                                                                                                                | Macro targets get revised down; the planner must surface the shortfall rather than hide it                        |
| 7   | A hand-seeded CTL produces sane readiness in weeks 1–4                                      | Low                              | Stage 9 against the real July–August activity history                                                                                                                | `warmingUp` flag suppresses the verdict entirely rather than showing a misleading amber                           |

### Pre-mortem

1. **The engine is beautiful and he never talks to it.** The most likely failure by far. Mitigated by ordering: Stage 4 delivers a bearer-gated coach usable from Claude Code, Stages 6–7 add the guardrails and negotiation that make it a coach rather than a spreadsheet, and only then does auth plumbing (Stage 5, pre-race) or load modelling (Stages 8–9, deferred) land. **Reordered 2026-09-07 (ledger F23)**: nothing about the OAuth port gets harder by waiting, and it is the only stage whose output is zero coaching. The cost is named rather than hidden — see the phone-access note under Stage 5.
2. **The two-component model is invented and produces nonsense.** No literature validates a computed cardio/MSK split. Mitigated by building MSK as **mechanical work in joules** — dimensionally honest, computable from mass + GPS — rather than a second invented 0–100 score, and by keeping every coefficient a named calibration knob.
3. **Units discontinuity fakes an alarm.** Foster sRPE at ~180–360 AU/h versus TSS at ~100/h would triple ATL on an HR-less week. Mitigated by anchoring all three cascade tiers to one currency: _one hour at threshold = 100_.
4. **Elevation double-counted.** Ascent is already inside HR and inside grade-adjusted pace. Mitigated by applying the descent multiplier **only** when the cardio score came from the pace tier, with an explicit test.
5. **A migration eats training history.** The irreplaceable-data failure. Mitigated by three DB-level layers plus a CI assertion that the triggers exist _and_ are `ENABLE ALWAYS` (`tgenabled = 'A'`).
6. **Integration tests silently skip when the DB is absent** and CI is green having tested nothing. Mitigated by a `globalSetup` that **throws** on a missing `DATABASE_URL`.
7. **zod 3 arrives transitively** and the connector fails at `tools/list` with no error detail. Mitigated by an `npm ls zod` CI gate.
8. **The connector 401s opaquely** because discovery is served at the bare well-known path only. Mitigated by serving both the path-suffixed and bare RFC 9728 documents.
9. **Any Google account can rewrite the training plan** — the exact DHT trap, ported unthinkingly. Mitigated by an owner allowlist checked _before_ code issuance, with a negative test.
10. **A retry loop locks Luis out of his own Garmin account** for 48–72+ hours mid-block. The 429 is keyed per-account and cannot be escaped by changing IP or headers. Mitigated by an absolute prohibition on auth retries, stated in the spec, this plan, and `AGENTS.md`.
11. **The Garmin pipe is built and delivers Strava-grade data** — the bridge relays activities but not HRV, body battery or sleep score, which were the entire reason for choosing Garmin. Mitigated by making the probe a gate at Stage 0, before any schema work.
12. **The load model is still cold when taper decisions arrive.** CTL is a 42-day average against ~44 days of history, and the taper starts ~3 October. Mitigated by moving the backfill to Stage 3b and warm-starting CTL from an external chronic value rather than ramping from zero.

---

## Phase 2 — Plan

### Scope

**In scope**

- Postgres schema, **five tables first**: `weeks`, `sessions`, `activities`, `check_ins`, `races` — with DB-level append-only guards on `activities` and `check_ins` from the very first migration. `wellness_snapshots` waits for the Garmin branch, `plan_revisions` and `decision_log` for replanning. `notes` was added on 2026-09-07 (mutable, so outside the guards); `availability_rules` is struck — see Stage 3b. The guards are the exception to that deferral: retrofitting them onto a table that already holds data is the painful case, and it is the one irreversible decision in this plan.
- Stress scoring: three-tier cascade normalised to one currency; two components (cardio score, musculoskeletal joules); surface, descent and footwear-novelty multipliers.
- Rolling load state: ATL/CTL/TSB per component over calendar days; daily readiness with renormalising weights and an explicit warm-up state.
- Two-layer planner: macro weekly targets seeded from `06-training-block.md`; micro rolling 7–10 day window placed against availability; hard guardrails that negotiate.
- Replan: all five triggers, returning a diff plus plain-language rationale (Loops A and B).
- MCP surface: `get_status`, `get_week`, `daily_checkin`, `log_activity`, `replan`, `adjust_session`, `set_availability`, `get_calendar`, `get_load_history`.
- Auth: static bearer (Claude Code) at Stage 4. **OAuth 2.1 with an owner allowlist is IN the pre-race path** — deferred by option A on 2026-09-07 and reversed the same day on Luis's judgement that observed velocity contradicted the estimate. It stays sequenced after Stage 7: a coach that does not yet work from Claude Code is not worth putting on a phone. The claude.ai connector dialog is checked first — `static_headers` is an organisation-level Beta and not a path here, so the shim is required rather than contingent (`docs/decisions.md` 2026-09-07).
- Seed data for the Battersea block and the four known races.

**Out of scope** — each tracked as a `NOT IMPLEMENTED` row in `docs/ci-gates.md` or a milestone in `07-wiring-todo.md`

- The full PWA (M2). **Amended 2026-09-07**: MCP is no longer the only interface, because the F32 gate above requires `src/app/page.tsx` to read activities from Postgres and accept a check-in write by 2026-09-14. One page that takes one check-in is in scope; installability, offline behaviour and the one-tap UI are not.
- Garmin sync, wellness ingest, `sync_now` (M3).
- DoHardThings race sync (M4) — races are seeded by hand in M1.
- routr and `propose_route` (M5).
- Calibration / prediction-vs-outcome fitting (M6).
- Work-calendar ICS ingest — manual availability only.

**Grey areas**

- Whether `adjust_session` and `set_availability` are needed on day one or can follow `replan`. Kept in scope because without them every change routes through free-text replanning, which is harder to make deterministic.
- The `warmingUp` presentation: a flag on the response versus suppressing the verdict. Recommendation above; needs ratification with open question 5.

### TDD workflow

Per stage: `test-driven-development` → RED (fails for the right reason) → GREEN → REFACTOR → `code-reviewer` (plus `security-reviewer-fullstack` on 1, 4, 5) → `verification-before-completion`. Gating, and non-clean **blocks the stage**, fixed and re-run before commit:

```
npm run typecheck && npm run lint && npm run format:check && npm run test
python3 scripts/check_gate_ledger.py && python3 scripts/test_guards.py
```

Every commit carries a `Task: tasks/<slug>.md` trailer; `.githooks/pre-push` fails closed. Each stage gets its own task file with a frozen header, and **stops for review before its first checklist item**.

---

### Decision gate G1 — the Garmin source (before Stage 3b, ideally at Stage 0)

Two viable sources. The probe in Stage 0 decides, by reading a real payload rather than by argument. **Do not design the wellness schema before it returns.**

|                | **Branch A — partner bridge (intervals.icu)**                         | **Branch B — `python-garminconnect` direct**                                                                                                   |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Taken when     | probe shows `hrv`, `restingHR`, `sleepScore`, `bodyBattery` populated | probe shows any of them missing or null                                                                                                        |
| Auth           | personal API key in an env var. No OAuth, no rotation, no MFA         | credentials + inline-JSON token row in Postgres; one-time MFA bootstrap **on the MacBook, never in CI**                                        |
| Activities     | pushed by webhook                                                     | pulled on a schedule                                                                                                                           |
| Runs on        | the existing Vercel app                                               | a scheduled GitHub Actions workflow (free at this volume; a full Linux box where `curl_cffi` installs cleanly)                                 |
| Cost           | ~a day                                                                | ~a day plus the bootstrap, and it carries the per-account 429 hazard                                                                           |
| Gets you       | activities + whatever wellness the bridge relays                      | everything, including Garmin's `dailyTrainingLoadChronic` and the five Training Readiness factors, which **no other legitimate route exposes** |
| Breakage owner | intervals.icu's maintainer fixes it                                   | we upgrade the library (historical pattern: 16 days, then 3 days)                                                                              |

**The bridge is the lower-effort default, but it is not the safe default for this project's stated purpose.** Luis chose Garmin over Strava specifically for the granular metrics, and the bridge's coverage of exactly those fields is the one thing the research could not confirm from a primary source — it rests on an undated third-party guide plus forum threads, and a 2026-05-19 bug report shows partial syncs (sleep arriving; RHR, HRV, steps and body battery missing). If the probe comes back thin, Branch A delivers Strava-grade data through a Garmin-shaped pipe, which defeats the point.

**Under either branch, retry loops against Garmin auth are forbidden.** The 429 is keyed per-account, empirically inescapable by changing IP or headers, and lasts 48–72+ hours with no recovery process and no Garmin staff response. Fail closed, alert, wait.

**Branch B carries one non-obvious trap.** `Garmin.login()` accepts an inline JSON token string, so no filesystem is needed — but **in that mode the library never writes rotated tokens back**: every `client.dump()` is gated on `tokenstore_path is not None`, while `_refresh_di_token()` does rotate the refresh token. The caller must persist `client.dumps()` **after every login, before fetching anything**, or silently degrade to a credential login per run and trip the 429. Note also that every third-party guide documenting `garth.dumps()` / `GARMINTOKENS_BASE64` is stale: the library dropped `garth` as of 0.3.11.

---

### Stage 0 — De-risk spikes (no production code)

**Goal**: Prove the one externally-unknowable thing, and start the two that have a human turnaround.
**Why**: Assumption 3 (`ENABLE ALWAYS` triggers on **Neon** specifically, whose role model differs from stock Postgres) invalidates a whole stage if false. routr's plan learned this the expensive way by testing its tunnel at Stage 8 instead of Stage 0. The Garmin items are here because they wait on Luis and on a 24–48h Garmin turnaround, not because they are risky.
**Depends on**: —
**Files**: `spikes/` (deleted at the end), plan updated with recorded results.
**Budget**: 2 h of agent time plus ~30 min of Luis's. **Cut line**: if the Neon spike has not run by **2026-09-09**, ship on the role-grant layer alone, note the unverified owner-path in `docs/ci-gates.md`, and move on — it is a recorded gap, not a blocker.

**Deleted 2026-09-07 (ledger F22).** Two spikes that were here are gone: the SDK v2 spike and the zod-3 probe. DoHardThings
proves `mcp-handler@1.1.0` + `@modelcontextprotocol/sdk@1.29.0` in production against the real claude.ai connector on this
account, so the SDK spike would have re-proved the proven half while leaving the only untested variable (Next 16 rather than
DHT's Next 15.5.18) to Stage 4 regardless; and the `npm ls zod` CI gate at Stage 4 covers the zod-3 risk at zero cost, which
a probe does not.

**Approach**:

1. **Neon append-only spike.** On a throwaway Neon branch: create a table, create the `app_rw` role with `SELECT, INSERT` only, add an `ENABLE ALWAYS BEFORE UPDATE OR DELETE` trigger raising `restrict_violation`, then attempt `UPDATE` and `DELETE` **as the table owner** and **as `app_rw`**. Record the SQLSTATEs. This is the one behaviour verified only on stock Postgres 18.6, and Neon's role model differs.
2. **Garmin source probe (Luis's hands, ~30 min).** Connect Garmin → intervals.icu, wait one sync cycle, then `curl` the wellness endpoint for the last 7 days and **read the actual payload**. This is a go/no-go, not a formality — see Decision gate G1. Do not design the activity or wellness schema before it returns.
3. **Request the Garmin bulk export (Luis, 2 min + 24–48h wait).** Connect web → Account Settings → Export Your Data. Free, sanctioned, and the only complete-history source. It has a multi-day turnaround, so requesting it at Stage 0 removes it from the critical path at Stage 3b.

**Observability**: none — spike.
**TDD**: the artifact is recorded evidence in this file. Gate: spike 1 must show a _non-zero_ SQLSTATE for all four attempts, or Assumption 3 is false and Stage 1 changes.
**Risks**: if the owner can bypass the trigger on Neon, append-only rests on the role grant alone — survivable, but it must be written down rather than assumed. The Garmin probe risks nothing: it reads a third-party API with a personal key and never touches Garmin auth.
**Rollback**: delete `spikes/`, drop the Neon branch.
**Status**: [ ] Not Started

---

### Stage 1 — Database foundation: schema, append-only guards, connection

**Goal**: The five tables the MVP needs exist as a typed Drizzle schema on Neon, and the two history tables physically reject `UPDATE`/`DELETE`.
**Why**: REDLINES rule 2, and everything downstream reads and writes through it. Getting the store decision wrong here means the migration touches the engine, the planner, every tool and every test.
**Depends on**: Stage 0.
**Files as planned**: `db/schema.ts`, `db/client.ts`, `db/migrations/0000_init/`, `db/migrations/0001_append_only_guards/` (custom SQL), `drizzle.config.ts`, `vitest.integration.setup.ts`, `db/schema.test.ts`.
**Files as delivered**: the same set under `src/db/` — `src/db/schema.ts` (222), `src/db/client.ts` (73), `src/db/ingest-schema.ts` (83), `src/db/migrations/0000_init.sql` (103), `src/db/migrations/0001_append_only_guards.sql` (110).

**DELIVERED at option-A depth in `9153fde` (ledger F30).** Read this section as a record, not as work. What landed is exactly
option A's cut of it: five tables, **one** grant layer plus `ENABLE ALWAYS` row triggers and two statement-level TRUNCATE
triggers, and the `sql_drop` event trigger below **explicitly rejected with reasoning** at
`src/db/migrations/0001_append_only_guards.sql:30-37` rather than skipped silently. The two-layer construction is not guard
depth for its own sake: the privilege revoke is void against the table owner, who can re-grant to itself, so the
`ENABLE ALWAYS` trigger is the layer that binds the other actor, and the TRUNCATE triggers exist because owner TRUNCATE was
observed to succeed on Neon PG 18.6 until they were added. Still outstanding from this stage: `9153fde`'s own commit body
records that the layer is **not yet exercised against the live database**, so the SQLSTATE assertions below are authored
against a real Postgres at Stage 3, not claimed here.

**Approach**:

- Pin **exact** versions, no caret: `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `pg@8.23.0`, `@vercel/functions@3.9.3`. Do **not** install `@neondatabase/serverless`.
- `db/client.ts`: a module-scope `pg.Pool` with `max: 3` against the **pooled** `-pooler` host from `DATABASE_URL`, registered with `attachDatabasePool()`. A second `DATABASE_URL_UNPOOLED` (direct host) is used **only** by `drizzle-kit migrate` and `psql` — PgBouncer transaction mode cannot do session-level operations.
- Schema, **five tables only**: `weeks`, `sessions`, `races` (mutable — the plan changes) and `activities`, `check_ins` (**append-only** — history does not). A completed session links to its fulfilling activity rather than being overwritten.
- **Deferred until the feature that needs them lands**: `wellness_snapshots` (the Garmin branch, once G1 decides the payload shape — designing it before the probe returns is exactly what G1 forbids), `plan_revisions` and `decision_log` (Stage 7). **`availability_rules` is struck rather than deferred** — the `notes` table shipped 2026-09-07 with `kind: 'availability'`, and a dated note with an expiry covers "I'm in Leeds Thursday" better than a recurring-rule table does; recurring work hours live in `AVAILABILITY` in `config/training.ts`. Adding a table later is an additive migration; adding a guard to a populated table is not, which is why the guards below are the one thing that cannot wait.
- `0001_append_only_guards` generated with `drizzle-kit generate --custom --name=append_only_guards`, committed and reviewed **in the same PR as the schema it protects**. Three layers, because none is sufficient alone:
  - `app_rw` role with `SELECT, INSERT` only, plus `ALTER DEFAULT PRIVILEGES` so future tables inherit it. Binds the application role (42501) but is void against the owner, who may re-grant to itself.
  - `ENABLE ALWAYS BEFORE UPDATE OR DELETE FOR EACH ROW` trigger plus a `BEFORE TRUNCATE FOR EACH STATEMENT` trigger, both raising `ERRCODE 'restrict_violation'` (23001). Binds the owner.
  - An `sql_drop` event trigger protecting the guarded tables by name, with a documented, deliberately awkward escape hatch for legitimate teardown. The name list is a maintenance trap: every later append-only table must be added to it, so assert in CI that the list matches the guarded set.
- **Rejected on verified evidence**: rules (`DO INSTEAD NOTHING`) and RLS-without-an-UPDATE-policy. Both fail **silently** — the rule reported `UPDATE 0` and left the row intact, which is worse than no guard.

**Codebase patterns to follow**: DHT's store seam (`lib/push-store.ts`) — `*-types.ts` with zero imports, `*-memory.ts` for tests, `*-drizzle.ts` real, and a small factory exposing a `configured()` predicate. Add `import "server-only"` to the real implementation.
**Observability**: one `key=value` INFO line per write path. Never log row contents of a check-in note.

**TDD — RED** (`npm run test:integration`):

```ts
describe('append-only guards', () => {
  it('rejects UPDATE on activities as the app role', async () =>
    await expectSqlState(() => appRw.update(activities)..., '42501'));
  it('rejects UPDATE on activities as the table owner', async () =>
    await expectSqlState(() => owner.update(activities)..., '23001'));
  it('rejects DELETE on check_ins as the owner', ...);
  it('rejects TRUNCATE on activities', ...);
  it('allows INSERT and SELECT on activities as the app role', ...);
  it('allows UPDATE on sessions — the plan is mutable, history is not', ...);
  it('has all guard triggers ENABLE ALWAYS (tgenabled = A)', ...);
});
```

Assert on **SQLSTATE**, never message text. The `tgenabled = 'A'` check catches both a destructive migration and the subtler regression where someone recreates the trigger without `ENABLE ALWAYS`.
A `globalSetup` **throws** when `DATABASE_URL` is absent — a `skipIf` at describe level is how this gate silently becomes vacuous.
**GREEN**: schema + migrations.
**REFACTOR**: extract `expectSqlState`.
**Post-stage**: `security-reviewer-fullstack` (mandatory), `database-reviewer`, `code-reviewer`.
**Risks**: the event trigger blocks legitimate teardown including local resets — the escape hatch must be documented in the same commit. The name-list is a maintenance trap; prefer protecting a dedicated schema, or add a CI assertion that every append-only table is listed.
**Rollback**: drop the Neon branch and re-migrate. **Point of no return once real training data lands** — see Holistic Rollback.
**Status**: [x] Delivered in `9153fde` at option-A depth; live-database verification of the SQLSTATEs still owed.

---

### Stage 2 — Domain core and the RPE stress floor

**Goal**: Pure, I/O-free domain functions that score an activity from RPE alone, in the project's single load currency.
**Why**: Tier 3 is the always-computable floor (`02-load-engine.md:7`) and it is all a manual log can produce. Everything else is an upgrade to it.
**Depends on**: Stage 1.
**Files**: `domain/types.ts`, `domain/stress.ts`, `domain/stress.test.ts`.
**Budget**: 3 h. **Cut line**: if not done by **2026-09-09**, ship the RPE floor and the currency anchor test alone and drop the branded types — they buy compile-time safety on a component (musculoskeletal joules) that option A has deferred past the race anyway.

**Approach**:

- **One currency, fixed at the outset: one hour at threshold = 100.** Tier 3 before ~10 dual-labelled sessions exist: `score = hours × (RPE/7)² × 100`, taking RPE 7 on the CR-10 scale as threshold. Foster session-RPE assumes **CR-10, not Borg 6–20** — assert this in a test, since the scales differ by a factor that would silently distort everything.
- Branded types (`CardioScore`, `MskJoules`) so the two components cannot be added together by accident — `typescript-pro`.
- Discriminated-union results, following DHT's in-domain convention; zod only at the boundary.
  **Observability**: none — pure functions.

**TDD — RED**:

```ts
it('scores one hour at RPE 7 as 100 — the currency anchor', ...);
it('scores a half hour at RPE 7 as 50', ...);
it('scales quadratically with intensity, not linearly', ...);
it('rejects an RPE above 10 as out of CR-10 range', ...);
it('refuses to add a cardio score to musculoskeletal joules', ...); // type-level
```

**Post-stage**: `code-reviewer`, `typescript-pro`.
**Risks**: choosing the currency wrong here silently distorts every downstream number. It is tested explicitly for that reason.
**Rollback**: revert; pure and additive.
**Status**: [ ] Not Started

---

### Stage 3 — Store seam and the first two writes

**Goal**: `logActivity` and `recordCheckIn` persist to Postgres through the seam.
**Depends on**: Stages 1–2.
**Files**: `store/types.ts`, `store/drizzle.ts`, `store/index.ts`, `store/store.test.ts`.
**Budget**: 3 h. **Cut line**: if not done by **2026-09-10**, drop the seam entirely and have the tool layer call Drizzle directly — the seam is a testability convenience, not a foundation pillar, and Stage 4 is what the clock is for.

**STRUCK by option A (ledger F30): the second store implementation and the two-store contract suite.** As planned this stage
was DHT's four-file seam — `types.ts` / `memory.ts` / `drizzle.ts` / factory — with one contract suite parameterised over both
implementations so the memory store could not drift from the real one. Under option A there is **one** implementation. The
interface file stays, because it costs a type and it is what a second implementation would later be written against; the
in-memory store and the parameterised suite do not, and are carried in the Deferred-Items Register.

The reason this is safe rather than merely cheaper: the drift the contract suite guards against cannot occur when there is
nothing to drift from, and the integration `globalSetup` **throws** on a missing `DATABASE_URL`, so store tests against real
Postgres cannot silently become vacuous the way a `skipIf` would. The cost is honest and worth naming — store tests now
require a database, so they are slower and they cannot run in a context that has none.

**Approach**: DHT's seam minus the second implementation. `store/types.ts` is the interface with zero imports;
`store/drizzle.ts` carries `import "server-only"`; `store/index.ts` is a small factory exposing `storeConfigured()` so callers
503 rather than throw. Reads return copies.
**Observability**: `activity_logged rpe=%d duration_min=%d source=manual`.
**TDD — RED**: one suite against the Drizzle store on a real database; a test asserting a logged activity cannot be mutated
through the seam; a test asserting `storeConfigured()` is false with no `DATABASE_URL`, so the 503 path is armed rather than assumed.
**Post-stage**: `code-reviewer`.
**Status**: [ ] Not Started

---

### Stage 3b — Historical backfill (decoupled from any sync)

**Goal**: 42+ days of real activity and wellness history in the store, so the load model is warm before anything trusts it.
**Why this is urgent, and why it is here rather than in M3**: CTL is a 42-day EWMA. The block started 2026-07-05, so roughly 44 days of history exist — meaning a self-computed chronic average has _almost exactly zero_ warm-up margin. REDLINES rule 4 already forbids presenting a verdict built on less than one time constant as authoritative. The taper decisions, the highest-stakes calls of the block, start landing around **3 October**. The model has to be warm before then, so the import cannot wait for the sync milestone.
**Depends on**: Stage 3 (store seam). **Independent of Decision gate G1** — the bulk export works under either branch.
**Files**: `scripts/backfill.ts`, `src/db/schema.ts` (wellness table + provenance columns), `scripts/backfill.test.ts`.
**Budget**: 4 h, gated on the export arriving. **Cut line**: if the export has not arrived by **2026-09-14**, do not wait for it — seed CTL from Garmin's own `dailyTrainingLoadChronic = 287` and `dailyTrainingLoadAcute = 296` (already captured in `tools/garmin_probe/out/training_status.json`), ship with `warmingUp` armed, and run the backfill whenever the archive lands.

**If the bridge is primary, its historical import is expected to cover activities but not wellness** (ledger F21), so the bulk
export is the only route to 42+ days of **wellness** history and its urgency does not fall when Branch A is chosen. That is
the opposite of the intuition — picking the easier integration makes this stage more load-bearing, not less.

**Approach**:

- **Source: the Garmin bulk account export** requested at Stage 0. It is the only sanctioned complete-history route, it includes `DI_CONNECT/DI-Connect-Wellness/`, and it needs no API access at all. `GarminDB` already parses this archive shape — read its parser rather than writing one.
- This is a **one-off script, not the sync**. It shares the store seam and nothing else. Running it twice must be idempotent (upsert by `calendar_date` / activity id).
- **Provenance columns are mandatory, not nice-to-have**: `fetched_at`, `source` (`bulk-export` | `bridge` | `library` | `manual`), and a completeness flag. **"Not worn" and "not yet synced" are different states** — conflating them makes the 42-day average silently interpolate across holes, and a watch left on the charger is not a rest day.
- Capture Garmin's own `dailyTrainingLoadAcute` / `dailyTrainingLoadChronic` where the export carries them. The chronic figure is the **warm-start seed** for Stage 9; without it the CTL series has to ramp from zero.
- Store the raw payload alongside the parsed row. Field shapes are the least-verified thing in this whole plan; keep the evidence.

**Observability**: `backfill source=%s days=%d activities=%d wellness_days=%d gaps=%d`. The gap count is the number worth reading — it is the honest measure of how warm the model actually is.

**TDD — RED**:

```ts
it('is idempotent — a second run changes no row count', ...);
it('records a not-worn day distinctly from a missing day', ...);
it('refuses to overwrite a manually logged activity with an imported one', ...);  // REDLINES rule 2
it('reports the gap count rather than silently interpolating', ...);
it('extracts a chronic-load seed when the export carries one', ...);
```

**Post-stage**: `code-reviewer`. Then the honest check: how many of the last 42 days actually have data, and does Stage 9 still say `warmingUp`?
**Risks**: the export may not contain what we expect — it is an archive format, not an API contract. Mitigated by reading `GarminDB`'s parser first and by storing raw payloads.
**Rollback**: the history tables are append-only, so a bad import cannot be deleted. **Import into a staging table first and promote after inspection** — this is the one place in the plan where append-only works against us.
**Status**: [ ] Not Started

---

### Stage 4 — MCP server with a static bearer (Claude Code usable)

**Goal**: `/api/mcp/[transport]` serves `log_activity`, `daily_checkin` and `get_status` on the DoHardThings stack, gated by a static bearer. **First end-to-end usable milestone.**
**Why**: A thin vertical slice beats a deep engine nobody can talk to. The pre-mortem's most likely failure is an unused system.
**Depends on**: Stage 3.
**Files**: `app/api/mcp/[transport]/route.ts`, `mcp/tools.ts`, `mcp/result.ts`, `mcp/tools.test.ts`.
**Budget**: 6 h. **Cut line**: if not done by **2026-09-14**, ship the three tools and nothing else — no fourth tool, no polish on the descriptions — because a coach reachable from Claude Code on 14 September beats a better one reachable on the 21st.

**Approach**:

```ts
export const runtime = 'nodejs'; // `pg` needs Node; edge also has a hard 25s TTFB rule
export const maxDuration = 60;
```

- **Pin the stack DoHardThings actually runs, exactly, no carets: `mcp-handler@1.1.0` + `@modelcontextprotocol/sdk@1.29.0` + `zod@4.x`** (ledger F22, superseding this plan's 2026-08-16 choice of SDK v2). `mcp-handler@1.1.0`'s peer pins the SDK at exactly 1.26.0, so 1.29.0 is an unmet peer — that is DHT's live production combination and it is what to install, not what the peer range asks for. Revisit `mcp-handler@2.1.1` on `@modelcontextprotocol/server@2` **after 2026-10-24**.
- Copy `DoHardThings/app/api/mcp/[transport]/route.ts` (63 lines, verbatim): `createMcpHandler(initialiser, { serverInfo, capabilities }, { basePath: '/api/mcp', maxDuration: 60, verboseLogs: false })`. `basePath` **must** match the location of the `[transport]` route, which makes the endpoint claude.ai and Claude Code are given `/api/mcp/mcp`. No Redis — that is only needed for SSE session resumability, which we do not use.
- Register tools inside the initialiser callback. **No session state in module scope**, so the handler is safe under Fluid instance reuse.
- `inputSchema` as a **plain object of zod validators**, not a wrapping `z.object()`. This is the concrete reason the v1 pin matters rather than a stylistic preference: `mcp-handler`'s v2 migration notes require a complete Standard Schema (`z.object(...)`) instead of raw zod shapes, along with removed variadic registration and a changed handler signature — so on v2 the DHT tool layer does not port verbatim, which was the entire reason for porting it. Every field carries `.describe()` written as instructions aimed at the model; this is the real prompt surface, not a type annotation, and deserves actual writing effort.
- Copy DHT's `ok()` / `fail()` / `reason()` verbatim (`lib/mcp-tools.ts:52-74`). **Handlers never throw** — a thrown error becomes a transport failure the model cannot recover from, whereas `isError: true` with readable text lets it self-correct. `reason()` maps a `ZodError` to `date: Invalid` rather than a stack trace.
- Serve the RFC 9728 document at **both** the path-suffixed `/.well-known/oauth-protected-resource/api/mcp` (a literal nested directory in App Router) and the bare path.
- `npm ls zod` CI gate asserting no transitive 3.x.

**TDD — RED** — drive a real `Client` through the route's own fetch, not hand-rolled JSON-RPC:

```ts
it('lists exactly the three M1 tools', ...);
it('round-trips log_activity and persists an activity', ...);
it('returns 401 with a resource_metadata pointer when unauthenticated', ...);
it('returns isError with field guidance for a malformed rpe, not a transport failure', ...);
it('serves the path-suffixed and bare well-known documents identically', ...);
it('never returns a tool result larger than 8 KB', ...);  // context-blowout guard
```

The 401 test runs **unconditionally** and every positive test first asserts the credential-less variant 401s — otherwise an unarmed gate makes them vacuous (routr's finding).
**Post-stage**: `security-reviewer-fullstack` (mandatory), `code-reviewer`, `nextjs-developer`. Manual: `claude mcp add --transport http rocket <url> --header "Authorization: Bearer $TOKEN"`, then log a real run.
**Risks**: the MCP stack itself is de-risked by DHT running it in production against the real connector, iOS included. The one untested variable is **Next 16.3.1** — DHT is on Next 15.5.18 — and it surfaces here rather than in a spike, because a spike could only have tested the same thing one stage earlier at the cost of the whole SDK-v2 detour. If Next 16 breaks `mcp-handler@1.1.0`, the fallback is `mcp-handler@2.1.1` + `@modelcontextprotocol/server@2`, accepting the `z.object()` input-schema rewrite that comes with it.
**Rollback**: remove the route and the two packages; the domain and store stand alone.
**Status**: [ ] Not Started

---

### Stage 6 — Planner: macro seed, micro placement, guardrails

**Goal**: Weekly targets and a rolling 7–10 day window placed against availability, with guardrails that negotiate rather than silently comply.
**Depends on**: Stage 3 (store seam) — **not** the load engine. **Blocked on open question 3.**
**Files**: `domain/planner/macro.ts`, `domain/planner/micro.ts`, `domain/planner/guardrails.ts`, plus tests.
**Budget**: 8 h — the largest surviving stage, and the one that makes this a coach rather than a viewer. **Cut line**: if not done by **2026-09-18**, ship the macro seed plus the ramp and single-session-spike guardrails only, and leave micro placement manual — a plan that argues about the sessions Luis proposes is most of the value; a plan that also places them is the rest.

**Why this precedes the load engine.** Three of the four hard guardrails need only distance and the schedule:
the ramp cap compares weekly km against last week; the minimum rest-or-swim-only day and taper protection read
the schedule alone; and the quality gate on soreness reads the check-in. None needs TSS, ATL, CTL, TSB or the
two-component model. The behaviour that makes this a coach rather than a spreadsheet is therefore reachable
before any of the load modelling, which is why it moved ahead of it (`docs/decisions.md`, 2026-08-18).
The one guardrail input that genuinely needs load state — a readiness **red** as a distinct signal from raw
soreness — is deferred to Stage 9 and expressed here in terms of the check-in alone.

**Approach**:

- **The macro layer is already authored.** `config/training.ts` `BLOCK_WEEKS` is typed, tested data covering all
  11 weeks with phases and km targets, guarded by `config/training.test.ts`. Seeding is an insert, not an
  authoring job — read it, do not re-derive it.
- Availability is **fully data-driven** — no slot shape baked in (Luis's design instruction). Run-commute slots exist as a capability the model supports and the data does not currently enable.
- Placement rules from `03-planner.md:7-11`: one long run per week; max one quality session in build; never on consecutive days; never the day after a race or long run; swims coexist with easy runs but not with quality-plus-long.
- Guardrail response pattern: state the rule, quantify the cost of breaking it, offer the closest compliant alternative, allow explicit override of everything except the taper and injury gates, and log every override.
- **A missed weekday morning is a first-class replan trigger**, not an exception — the volume arithmetic shows four weekday mornings with no slack.

**TDD — RED**:

```ts
it('fits week 6 (60km) into available slots without run-commutes, or reports the shortfall', ...);
it('reports a shortfall rather than silently generating an unrunnable week', ...);
it('never places quality on consecutive days', ...);
it('never places quality the day after the long run', ...);
it('protects the final two weeks from any addition above target', ...);
it('offers a compliant alternative when a request breaks the ramp cap', ...);
```

**Post-stage**: `code-reviewer`.
**Risks**: the planner could generate a technically-compliant week that is humanly unrunnable. The shortfall test is the guard.
**Status**: [ ] Not Started

---

### Stage 7 — Replan, negotiation, and the remaining tools

**Goal**: Loops A and B work end to end; the full nine-tool surface ships.
**Depends on**: Stage 6.
**Files**: `domain/replan.ts`, `mcp/tools.ts`, plus tests.
**Budget**: 6 h. **Cut line**: if not done by **2026-09-21**, ship Loop B (the check-in path) and let Loop A degrade to a costed refusal without counterfactuals — naming the rule and its cost is the safety property; explaining the trade it _would_ have made is the polish.

**Approach**: Every replan returns a **diff plus plain-language rationale** ("moved Thu quality → Sat, killed Fri easy, week stays at 52km"). Loop A must keep counterfactuals to explain the trade it made — that is the hard part, not the re-placement. Tools never dead-end: a guardrail refusal always carries a counter-offer.
**TDD — RED**: the two acceptance loops from `00-overview.md:9-11`, driven through `tools/call`:

```ts
it('Loop A: a 30km request over the ramp cap is negotiated with a costed alternative', ...);
it('Loop A: an unplanned 30km logged after the fact downgrades the next quality session', ...);
it('Loop B: severe DOMS rebuilds the week easy-or-nothing and leaves swim volume untouched', ...);
it('Loop B: quality stays gated until reported soreness clears', ...);  // check-in only at this stage
it('every replan response names what moved and what it cost', ...);
it('a race added mid-block moves the long run off that date and says so', ...);   // seeded from RACES: Lincoln, LDNX
it('a race cancelled mid-block returns the date to ordinary planning', ...);      // seeded from RACES: Dorney, role 'dropped'
```

**Why those last two are not speculative coverage (ledger F29, S6.8).** The 2026-09-06 macro re-derivation put the block's
peak 35 km long run on Lincoln Half day and a cut-back long run on LDNX 10K day, and nothing in the repo caught it, because
`BLOCK` held only the goal and tune-up races and no other race existed anywhere the planner could see. That is a defect this
repo actually shipped, not a hypothetical. Both fixtures lift straight out of `config/training.ts` `RACES` as it stands —
Lincoln and LDNX as the added case, Dorney's `role: 'dropped'` as the cancelled one — which makes them close to free.

**Eval posture for this stage, settled 2026-09-07 (ledger F29).** The vitest fixture tier above is the whole mandatory
tier and carries roughly 90% of the value. A small promptfoo tier (five to ten transcript cases) has exactly one job the
fixtures cannot do — asserting that Claude does not narrate a write the tool rejected — and that assertion is only writable
once the write-tool contract's `applied` boolean exists. So promptfoo is **sequenced after** that contract and **cut if it
slips**. **LLM-as-judge is cut outright**: a second model grading transcripts is a second unvalidated source of truth on a
plan whose whole premise is that guardrails are evaluated deterministically.

Loop B's recovery signal is the **subjective check-in alone** here. `02-load-engine.md:21` also wants HRV and
resting HR in that gate; those terms arrive with Stage 9 and upgrade this behaviour without changing its shape.

**Post-stage**: `code-reviewer`, then the full suite.
**Status**: [ ] Not Started

---

### Stage 5 (pre-race, after Stage 7) — OAuth 2.1 with an owner allowlist (the phone connector)

**Goal**: The claude.ai phone app adds the connector and calls tools.
**Status of the goal itself**: this was ratified on 2026-08-16 as the M1 boundary. **That ratification is superseded by
option A (2026-09-07)**, and this stage now sits after the planner and the check-in loop and outside the pre-race path
(ledger F23, F30). Nothing about the port gets harder by waiting — it is a near-verbatim lift of a working file — and it is
the only stage in the plan whose output is zero coaching.

**The consequence, stated rather than left implicit.** With OAuth past 24 October, the coach is reachable from Claude Code and
the desktop but **not from the phone** for the whole block, and a 06:00 check-in happens in bed rather than at a desk. Two
facts settle how that gets closed, both established empirically rather than assumed:

- **`static_headers` is not a path.** It is an Anthropic Beta, described as a fixed credential entered by an _organization
  administrator_ as a request header — an org-admin surface, not a Pro individual one. Empirically, claude.ai's custom
  connectors ignore a static token and run the full OAuth flow regardless: established the hard way on DoHardThings
  (`routr/docs/MCP_CONNECTOR_GUIDE.md:14-24` — "there is no field for it in the connector dialog"). Do **not** spend a
  five-minute check on this; the answer is no.
- **Authless is supported**, with Anthropic's egress fixed at `160.79.104.0/21`. So the ten-line alternative for the two-week
  window is to publish the MCP route with auth type `none` at an unguessable path, allowlisted to that range. The residual
  risk in one sentence: anyone who obtains the URL _and_ can reach it from Anthropic's network could read Luis's training
  data — they could not corrupt his history, which the append-only guards refuse. **This is Luis's to veto**, and it is one
  of the two open decisions in the 2026-09-07 ledger.

**Depends on**: Stage 4.
**Budget when it lands (post-race)**: ~600 lines and the highest-scrutiny security review in the plan. Not budgeted before 2026-10-24.
**Files**: `app/oauth/authorize/route.ts`, `app/oauth/token/route.ts`, `app/oauth/register/route.ts`, `app/.well-known/oauth-authorization-server/route.ts`, `oauth/jwt.ts`, `oauth/oauth.test.ts`.

**Approach**:

- Port DHT's `lib/mcp-oauth.ts` (227 lines, stateless HS256 JWTs, nothing persisted, no client store) — the design is proven against the real connector.
- **The one change that matters.** DHT's `authorize/route.ts:42-57` mints a code for _any_ Google account that signs in, with no allowlist and no `signIn` callback. rocket is single-user and private: an owner-email allowlist is checked **before** code issuance, with a negative test asserting a non-owner is refused.
- **Thread the principal into handlers.** DHT verifies the subject at the gate then discards it, and handlers read a static env var (`lib/mcp-create.ts:53-55`). rocket carries `AuthInfo` into the tool factory.
- `typ` claim separating authorization codes from access tokens, checked on verify — without it a code travelling in a redirect URL and browser history is accepted verbatim as a bearer token (routr's finding).
- Advertise `client_id_metadata_document_supported: true` **and** DCR: CIMD is preferred in the 2026-07-28 spec and avoids unbounded client accumulation, but claude.ai still accepts DCR, so support both. `code_challenge_methods_supported: ["S256"]`; accept `application/x-www-form-urlencoded` at `/token`; return `invalid_grant` (never `invalid_request`) for dead refresh tokens; rotate refresh tokens. Redirect allowlist: `https://claude.ai/api/mcp/auth_callback`, plus loopback `http://localhost/callback` and `http://127.0.0.1/callback` **with the port ignored** — mandatory for Claude Code and the kind of thing an off-the-shelf IdP rejects by default.
- One `verifyAccessToken` satisfies both paths: the static Claude Code token is just another valid token. It **must** populate `expiresAt` in unix seconds — v2 rejects tokens without it.

**TDD — RED**:

```ts
it('refuses to mint a code for a non-owner email', ...);        // the DHT trap
it('rejects an authorization code presented as a bearer token', ...);  // typ separation
it('completes a full PKCE flow that then unlocks /api/mcp', ...);
it('rejects a tampered redirect_uri on the POST, not only the GET', ...);
it('matches a loopback redirect ignoring the port', ...);
it('threads the authenticated principal into the tool handler', ...);
```

**Post-stage**: `security-reviewer-fullstack` — **highest scrutiny in this plan**. Then the real device check: add the connector on the phone, log a run from bed.
**Risks**: connector behaviour is only observable against the real deployment. Stage 4 keeps Claude Code working regardless.
**Rollback**: drop the OAuth routes; `/api/mcp` falls back to bearer-only.
**Status**: [ ] Not Started

---

### Stage 8 — Full stress cascade and context multipliers

**Goal**: Tiers 1 and 2 of the cascade, plus the musculoskeletal component in joules.
**Depends on**: Stage 2.
**Files**: `domain/stress.ts`, `domain/msk.ts`, `domain/stress.test.ts`, `domain/msk.test.ts`.

**Approach**:

- Tier 1 (HR): `score = 100 × TRIMP_session / TRIMP_1h_at_LTHR` — the community-standard normalisation. Tier 2 (pace): `score = hours × IF² × 100`.
- **MSK in joules, not a second 0–100 score**: `MSK_kJ = [k_level × m × distance^0.9 + m×g×ascent + w_ecc × m×g×descent] × surface × footwear / 1000`, with `k_level ≈ 1.0–1.5 J/kg/m`, `g = 9.81`, `w_ecc` starting 2.0–3.0 as a **named calibration knob**. Sublinear in distance because bone mechanotransduction desensitises to repetitive loading.
- **Descent multiplier applies only when the cardio score came from tier 2.** Ascent is already priced into grade-adjusted pace and already inside HR by definition. Double-counting climb is the most likely quantitative bug in this engine.
- Swim: full cardio credit, `surface ≈ 0.05` musculoskeletal — which is precisely why swim volume survives a run-recovery week.
- **Unchanged by the Garmin decision**: neither Garmin nor the bridge exposes a musculoskeletal component. It is built from distance + elevation + duration + cadence — Tier-0 fields present on every Garmin watch ever made — with routr's surface classification as the genuinely differentiated input. The Fenix 8's running dynamics (ground contact time, vertical oscillation, running power) are **optional refinement terms** that sharpen the estimate when present. Never make a watch- or accessory-gated field the core term: ground contact _balance_ additionally needs a chest strap or pod on every device ever made.
- **Say plainly in the module docstring that the two-component split is largely novel.** No validated computed cardio/MSK score exists; the closest precedent is Polar's Muscle Load in kJ, and the closest science is differential RPE, which validates a perceptual split rather than a computed one.

**TDD — RED**:

```ts
it('scores the 33km/600m trail run materially higher on MSK than the flat 30km road run', ...);
it('scores those two runs similarly on CARDIO — which is exactly the spec failure case', ...);
it('does not apply the descent multiplier when the score came from heart rate', ...);
it('gives a swim full cardio credit and near-zero musculoskeletal load', ...);
it('decays footwear novelty toward neutral across uses', ...);
it('keeps three tiers within 15% of each other on one dual-labelled session', ...);
```

The first two together are the whole point of the two-component model and are drawn from the real 2026-08-09 incident.
**Post-stage**: `code-reviewer`, `typescript-pro`.
**Risks**: every coefficient is a knob, not a finding. Mitigated by keeping them in `config/training.ts` and `PROVISIONAL` in the decision log.
**Status**: [ ] Not Started

---

### Stage 9 — Rolling load state and readiness

**Goal**: ATL/CTL/TSB per component and a daily green/amber/red with an honest warm-up state.
**Depends on**: Stage 8. **Blocked on open questions 4 and 5.**
**Files**: `domain/load-state.ts`, `domain/readiness.ts`, plus tests.

**Approach**:

- `ATL_t = ATL_{t-1} + (L_t − ATL_{t-1})/7`, `CTL_t = CTL_{t-1} + (L_t − CTL_{t-1})/42`, `TSB_t = CTL_{t-1} − ATL_{t-1}` (yesterday's values, matching the reference implementation). **Iterate over calendar days with rest days zero-filled, never over activities** — the most common implementation error.
- Comment in code that 7/42 and `λ = 1/k` are **conventions**, not findings, and that the EWMA literature uses `λ = 2/(N+1)`. Do not fit time constants per athlete: Hellard showed they are non-identifiable (tau correlation 0.99).
- Readiness weights renormalise when wellness data is absent, so a missing HRV reading cannot distort the score.
- **Do not gate on an acute:chronic ratio crossing a threshold.** ACWR has been statistically dismantled — Lolli 2019 (mathematical coupling), Impellizzeri 2020 (acute-to-_random_ predicts as well). Use ramp rate against the config cap, which is what the spec actually asks for.
- **Warm-start CTL from an external chronic value; do not compute a mean over a filling window.** A naive 42-day mean ramps upward purely as an artefact of the window filling, inflating acute:chronic early and then "improving" for no physiological reason — false-red during exactly the weeks the block is being established. Seed from Garmin's `dailyTrainingLoadChronic` (bulk export, or the live API once wired), then evolve our own series forward from that seed.
- **Persist both series and reconcile.** Garmin's acute/chronic pair and Training Readiness are stored alongside ours. They cost nothing and are the only independent check available on a two-component model with no published validation behind it. Divergence is the M6 calibration signal, not a bug to suppress.
- **`fetched_at` plus a completeness flag per day. "Not worn" and "not yet synced" must be distinct states** — conflating them makes the 42-day average silently interpolate over holes, and a watch left on the charger is not a rest day.
- Every verdict carries `warmingUp: true` until 42 days of history exist (REDLINES rule 4).

**TDD — RED**:

```ts
it('zero-fills rest days rather than iterating over activities', ...);
it('flags warmingUp until 42 days of history exist', ...);
it('warm-starts CTL from a seed rather than ramping as the window fills', ...);
it('distinguishes a not-worn day from a not-yet-synced day', ...);
it('stores Garmin chronic load alongside ours without overwriting either', ...);
it('renormalizes weights when wellness data is missing, leaving the score comparable', ...);
it('gates all quality when soreness is severe, whatever the objective data says', ...);
it('does not change the run verdict when only swim load rose', ...);  // the swim invariant
```

**Post-stage**: `code-reviewer`.
**Risks**: readiness drives real training decisions on thin data. The `warmingUp` flag is the mitigation and must be surfaced in `get_status`, not swallowed.
**Status**: [ ] Not Started

---

### Stage 10 — Seed data and end-to-end validation

**Goal**: The Battersea block is loaded and the whole loop is proven with recorded evidence.
**Depends on**: all prior **pre-race** stages — 0, 1, 2, 3, 3b, 4, 6, 7. Not Stage 5, 8 or 9.
**Files**: `db/seed.ts`, `docs/M1_OPERATOR_GUIDE.md`.
**Budget**: 3 h. **Cut line**: if not done by **2026-09-23**, items 1–4 and 10 below are mandatory and 5–9 become best-effort — the gates and the append-only proof are what make the system trustworthy; the screenshots are what make it presentable.

**Each item names its evidence artifact**:

1. `npm run typecheck && lint && format:check && test` green — log path.
2. Integration suite against real Postgres green, with the `globalSetup` throw armed — log path.
3. Guards: `check_gate_ledger.py`, `test_guards.py` — output.
4. Seed loads the 11 macro weeks and 4 races **from `config/training.ts` `BLOCK_WEEKS`** — an insert, not an authoring job; a second run is idempotent.
5. Backfill the real July–August activity history; CTL reports `warmingUp` — screenshot.
6. Claude Code: add the connector with a bearer, `get_status`, log a run, check in — screenshots. (The **phone** variant of this item moves with Stage 5, unless Luis takes the authless option in the ledger's open decision 2.)
7. Loop A and Loop B driven from the phone in natural language — transcript.
8. Unauthenticated `curl` against `/api/mcp` from outside → 401 — capture.
9. A planted secret is caught by gitleaks — capture (closes the one unproven ledger row).
10. `UPDATE`/`DELETE` attempted against `activities` on the live database → rejected — capture.
    **Status**: [ ] Not Started

---

### Garmin degradation path (what happens when it breaks mid-block)

Assume it breaks at least once before 24 October: it happened twice in the last twelve months (17 Mar 2026, fixed in 16 days; 2 Jun, fixed in 3 days).

**Hour 0–1 — it becomes loud on its own.** Three layers, because each catches what the one above structurally cannot:

1. `sync_run(job, ok, detail, ran_at)` written **under autocommit**, so the failure row survives the throw that caused it.
2. A **dead-man's switch** — the job's final step pings a healthchecks.io URL; a missed ping emails Luis. This is the only layer that can detect _"the job never ran at all"_, which a row in our own database is blind to by construction. It is also what makes Vercel Hobby cron's best-effort delivery (±59 min, never retried, can be missed with no log) harmless.
3. `get_status` reports `garmin: stale since <ts>` once `SYNC.staleAfterHours` (36, already in `config/training.ts`) trips.

**Hour 1–36 — the system degrades, it does not stop.** Readiness keeps producing a verdict: the objective terms drop out and weights renormalise onto the subjective ones, which `docs/specs/02-load-engine.md:24` already mandates. The rationale string says so out loud — _"amber — soreness 3/5, sleep 5h; Garmin stale 2 days, objective terms excluded."_ An amber presented as authoritative when it is guesswork is exactly what REDLINES rule 4 exists to prevent.

**Day 1 onward — the load engine does not degrade at all.** Stress scoring has RPE × duration as its floor and that is always computable from a check-in. `log_activity` and `daily_checkin` were built as the primary path at Stage 4, before any integration existed. This is spec invariant 2 doing its job: Garmin was never load-bearing.

**Day 1–3 — the manual bridge, if the data matters.** Per-activity FIT download from the Connect web UI: always works, no API, no ToS question, two minutes per run. Covers the activity side completely. Only wellness is genuinely lost, and those are precisely the terms that renormalised away.

**Day 3–14 — decide once, then stop thinking about it.** Under Branch A it is the bridge maintainer's problem, usually days. Under Branch B the historical pattern is _upgrade, don't debug_. Pin with a floor and a compatible-release ceiling (`>=0.3.10,<0.4`), **never an exact pin** — an exact pin converts a 3-day upstream outage into an indefinite one.

**Day 14+, or any time after 3 October — do nothing.** If the outage runs into the taper, log manually and ship the marathon. Spending taper-week hours restoring an optional data source, on a system explicitly built to run without it, is the failure this whole plan is shaped to avoid.

**Forbidden throughout: retry loops against Garmin auth.** Fail closed, alert, wait.

---

### What Luis has to do himself

None of this is code, and the first item has a multi-day turnaround, so it gates Stage 3b.

| #   | Action                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                                | Time         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1   | **Request the Garmin bulk export** (Connect web → Account Settings → Export Your Data)                                                  | 24–48h asynchronous, free, zero ToS risk, and the only sanctioned complete-history source. Requesting it now removes it from the critical path later. **Do this first.**                                                                                                                                                           | 2 min + wait |
| 2   | Connect Garmin to intervals.icu, then generate a personal API key under Developer Settings                                              | Gates Decision gate G1, and triggers their historical import too                                                                                                                                                                                                                                                                   | 10 min       |
| 3   | **Probe the wellness payload** — after one sync cycle, read the last 7 days and confirm `hrv`, `restingHR`, `sleepScore`, `bodyBattery` | The go/no-go. Field coverage is the one thing the research could not confirm from a primary source                                                                                                                                                                                                                                 | 20 min       |
| 4   | Answer: **do you wear the watch asleep** — every night, most nights, or only for runs?                                                  | Every overnight metric needs the watch on the wrist while asleep, regardless of model. If the answer is "only for runs", readiness must degrade to a resting-HR-and-subjective model and the spec should say so                                                                                                                    | 1 min        |
| 5   | Answer: **has it been worn continuously for more than ~3 weeks?**                                                                       | Garmin's HRV `status` and `baseline` stay null until roughly three weeks of consistent nights. A null baseline is not a bug to debug                                                                                                                                                                                               | 1 min        |
| 6   | Answer: **do you own a chest strap or running pod?** (HRM-Pro / HRM-Fit / HRM-Run / RD Pod)                                             | Ground contact _balance_ requires one on every device ever made. Decides whether the musculoskeletal component gets real biomechanical inputs or is estimated                                                                                                                                                                      | 1 min        |
| 7   | _(Branch B only)_ Run the MFA bootstrap **on the MacBook, never in CI**                                                                 | Login self-throttles 10–20s per strategy across a 5-strategy cascade and MFA needs a human. Datacenter-IP login is the **largest unresolved unknown in the research** — one report of connectapi 401s from cloud IPs, with "bootstrap locally, transfer tokens" as the workaround. A failed attempt risks a 48–72h account lockout | 15 min       |

---

### Access is a prerequisite, and it is currently absent

Verified 2026-08-18:

- **There is no Garmin MCP connector on this machine at all.** No Garmin API access exists in any form today.
- **The Strava connector is installed but unauthenticated** — only `authenticate` and `complete_authentication` are exposed,
  which is the shape an MCP server takes before its OAuth flow has been completed. Strava is not a substitute here in any
  case: it strips the granular wellness metrics that were the whole reason for choosing Garmin.

**The distinction that matters, because it is easy to conflate.** An authenticated connector in a Claude session grants
_Claude_ read access for probing and prototyping — useful for running the G1 probe against a real payload without writing
code first. It is **not** a credential the deployed app can use. rocket needs its own registration and its own tokens in its
own environment regardless of what any conversational session can reach: an intervals.icu personal API key under Branch A, or
Garmin credentials plus a bootstrapped token row under Branch B. Nothing in Stage 0 or Stage 3b is unblocked by connecting a
session-level tool.

---

### Holistic rollback

- **Order**: reverse-chronological, 10 → 1. Stages 2, 6, 7, 8, 9 are pure domain code and revert cleanly.
- **Point of no return: Stage 1, the moment real training data lands.** After that the schema cannot be dropped and re-created — that is the entire premise of the append-only rule. Schema changes past that point are additive migrations only. The event trigger will block a `drizzle-kit migrate` that drops a protected table, which is the desired behaviour and requires the documented escape hatch to override deliberately.
- **Persisting state after rollback**: logged activities and check-ins survive by design. OAuth tokens are stateless and die with a secret rotation. Connector entries in claude.ai must be removed by hand.
- **Partial-failure posture**: every stage leaves a working system. Stage 4 alone ships a Claude Code coach; Stages 6–7 make it argue back; Stage 5 later ships the phone. Stages 8–9 deepen a system already in daily use. Under option A the pre-race path stops after Stage 10, and stopping there is a legitimate end state rather than an abandonment.

---

### Deferred-Items Register

Every row option A cut, with a classification, a named owner and a re-ratification date, per the deferral-closure rule. Prose
in a review document or an MR description does not count as tracking — it scrolls out of view at merge, which is exactly how
the 2026-08-16 plan came to contain stages nobody intended to build. **No row may carry "future hygiene", "consider later" or
an empty owner**: an item that cannot be classified belongs in the pre-race path instead. This plan is not complete while any
MUST-this-sprint row is open, and closure is evidence — a merged commit link in the row, never an assertion.

| Item                                                                             | Struck from  | Classification                                                                                                                                   | Owner                                                           | Re-ratification                                                                                      |
| -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Second store implementation (`store/memory.ts`) and the two-store contract suite | Stage 3      | RATIFIED-out                                                                                                                                     | Post-race session                                               | After 2026-10-24, or sooner if a second backing store is proposed                                    |
| `sql_drop` event trigger over the guarded-table name list                        | Stage 1      | RATIFIED-out — already rejected **with reasoning** in `src/db/migrations/0001_append_only_guards.sql:30-37`, not skipped silently                | Post-race session                                               | Only if a guarded table is ever dropped by a migration in anger                                      |
| Two-component cardio/musculoskeletal load model                                  | Stage 8      | RATIFIED-out; the revisit trigger is already named in this plan's "Deferred hardest" paragraph                                                   | Post-race session                                               | After ~3 weeks of Stage 9 data alongside Garmin's own series                                         |
| Readiness formula implementation                                                 | Stage 9      | RATIFIED-out — the `config/training.ts` and `02-load-engine.md` edits land now, the implementation does not                                      | `config/training.ts` owner now; implementation post-race        | After 2026-10-24                                                                                     |
| Grade- and pace-dependent descent multiplier                                     | Stage 8      | BLOCKED-external: `MULTIPLIERS` has no consumer until Stage 8 exists, so tuning it tunes a number nothing reads                                  | With Stage 8                                                    | With Stage 8                                                                                         |
| Swim-night HRV exclusion, as implementation                                      | Stage 9      | BLOCKED-external: no overnight HRV and no sleep score exist in the account — `hrv_day` and `hrv_range_7d` came back empty over a seven-day probe | Blocked on the watch being worn asleep (`07-wiring-todo.md:22`) | When overnight metrics start arriving                                                                |
| Structured workout steps, pace/HR targets, Garmin-direct workout upload          | outbound leg | RATIFIED-out; the one-event-per-day calendar leg still ships                                                                                     | Post-race session                                               | After 2026-10-24                                                                                     |
| `docs/specs/08-capability-packs.md` and the routr / DoHardThings seams           | out of scope | RATIFIED-out. The `rocket_` tool-name prefix is pulled **forward** regardless, because tool names cannot be changed after the connector is added | spec owner now for the rename; seams post-race                  | After 2026-10-24; the register row names routr's 30-minute candidate expiry as the design constraint |
| promptfoo transcript tier                                                        | Stage 7      | **MUST-this-sprint**, conditional on the write-tool contract's `applied` boolean landing; cut if that slips                                      | Same session as Stage 7                                         | At Stage 7 close-out                                                                                 |

---

## Phase 3 — Verification checklist

### TDD compliance

- [ ] Every stage's tests written before implementation and failed for the right reason, recorded per stage
- [ ] No test modified to make an implementation pass
- [ ] `test-driven-development` before each stage; `systematic-debugging` on every failure
- [ ] No vacuous tests: every positive auth test first proves the gate is armed; integration `globalSetup` throws rather than skipping when the database is absent

### Quality gates

- [ ] `npm run typecheck && lint && format:check && test` clean, fixed-then-rerun, never committed dirty
- [ ] `npm ls zod` shows no transitive 3.x
- [ ] Append-only proven by SQLSTATE assertions, and `tgenabled = 'A'` asserted
- [ ] Error paths covered: malformed tool input, non-owner OAuth, code-as-bearer, tampered redirect, missing wellness data, empty history, a week that will not fit
- [ ] Every tool call, auth rejection, OAuth grant and replan emits one greppable `key=value` line; no secrets, no check-in note contents
- [ ] No duplication: one currency conversion, one store seam, one guardrail evaluator
- [ ] Every Phase 1 assumption validated or its fallback executed
- [ ] Open question 3 answered before Stage 6; 4 and 5 before Stage 9 — 4's TSB-gating recommendation was **withdrawn** on 2026-09-07 and must not be re-proposed without new evidence

### Skill/agent gates

- [ ] `code-reviewer` after every stage
- [ ] `security-reviewer-fullstack` after Stages 1, 4, 5 — evidence linked
- [ ] Plan-vs-implementation alignment walk before merge: every stage bullet maps to a diff hunk or carries a divergence note
- [ ] `docs/ci-gates.md` updated in the same commit as each gate it describes; the four `NOT IMPLEMENTED` rows owned by this plan either closed or re-ratified

---

## Phase 4 — Todo breakdown

- [ ] **S0** (2 h, cut 09-09): Neon `ENABLE ALWAYS` spike · **Garmin source probe (G1)** · **request the bulk export** · record results here
- [x] **S1**: delivered in `9153fde` — pinned deps · `src/db/client.ts` pool + `attachDatabasePool` · **five-table** schema · init migration · custom guard migration (role, row triggers, TRUNCATE triggers; event trigger rejected with reasoning). Still owed: integration `globalSetup` throw · SQLSTATE tests against the live database · security review
- [ ] **S2** (3 h, cut 09-09): branded types · RPE tier · currency anchor tests
- [ ] **S3** (3 h, cut 09-10): store seam, **one** implementation — `types.ts` / `drizzle.ts` / factory · suite against real Postgres · `storeConfigured()` false-path test
- [ ] **S3b** (4 h, cut 09-14): bulk export parsed (read `GarminDB`'s parser first) · provenance columns · staging-table-then-promote · idempotency + gap-count tests · chronic-load seed extracted (`dailyTrainingLoadChronic = 287`)
- [ ] **S4** (6 h, cut 09-14): `app/api/mcp/[transport]/route.ts` on `mcp-handler@1.1.0` + `sdk@1.29.0`, pinned exact · 3 tools · `ok`/`fail`/`reason` · both well-known docs · `npm ls zod` gate · client-driven contract tests · Claude Code manual check · security review
- [ ] **S6** (8 h, cut 09-18): macro seed read from `BLOCK_WEEKS` · micro placement · guardrails (distance + schedule + check-in only) · week-6 feasibility test
- [ ] **S7** (6 h, cut 09-21): replan diffs + rationale · Loops A and B through `tools/call` · **race-added and race-cancelled fixtures seeded from `RACES`** · remaining tools
- [ ] ~~**S5**~~ **deferred past 2026-10-24**: OAuth routes · owner allowlist · `typ` separation · CIMD + DCR · port-agnostic loopback · principal threading · PKCE flow tests · **phone connector check** · security review
- [ ] **S8**: TRIMP + pace tiers · MSK joules · descent-only-on-pace-tier · trail-vs-road regression pair
- [ ] **S9**: ATL/CTL/TSB calendar-day recurrence · **warm-start CTL from a seed** · readiness renormalisation · `warmingUp` · Garmin oracle stored alongside and reconciled
- [ ] **S10** (3 h, cut 09-23): seed · backfill · ten-item validation with named artifacts
- **Pre-race total: ~35 h of agent time** across S0, S2, S3, S3b, S4, S6, S7, S10 — two weeks of evenings, live around 20 September, five weeks of real use before 24 October. If the running total passes 35 h with S4 unshipped, stop adding stages and take the cut lines.
- [ ] Close-out: **Deferred-Items Register swept** — every MUST-this-sprint row delivered with a commit link, or escalated to Luis for explicit re-ratification; self-downgrading a MUST row is forbidden. Then: spec amendments raised (`03-planner.md:11` run-commute framing; the two spec defects), and the G1 branch taken recorded as a decision-log entry.
