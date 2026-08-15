# Decision log

Append-only. Newest last. One entry per consequential decision, written in the
same commit as the thing it decides -- never backfilled in bulk.

**What counts as consequential:** anything a future reader would otherwise
reconstruct by archaeology. A dependency choice, a schema shape, a rejected
alternative, a deliberate gap, a threshold and how it was picked.

**What does not:** anything the code already says plainly.

## Format

```markdown
## YYYY-MM-DD -- <short title>

**Context:** what forced a decision. The constraint, not the backstory.
**Decision:** what was chosen.
**Alternatives rejected:** what else was on the table, and why it lost.
**Consequences:** what this makes easy, what it makes hard, what it forecloses.
**Status:** ACTIVE | SUPERSEDED by <entry> | PROVISIONAL pending <what>
```

`PROVISIONAL` is load-bearing. A number chosen before there is data to choose it
from should say so, with what would settle it. Marking it provisional at the time
is the difference between a placeholder and a number nobody dares touch because
it looks deliberate.

## Entries

<!-- Append below. Do not edit entries above; supersede them with a new one. -->

## 2026-08-15 -- rocket is a separate repo from routr, consuming it over MCP

**Context:** routr (GPX surface classifier and route builder) was described as
"one tool of" this system, which could have meant absorbing it into a monorepo.

**Decision:** rocket is its own repo at `~/dev/rocket`. routr stays where it is,
with its own deploy, and is consumed at M5 over its already-live MCP endpoint.

**Alternatives rejected:** monorepo -- rocket's day-one `docker compose up` would
inherit a 5 GB-heap GraphHopper JVM, a 248 MB data volume, a 30-minute graph
build, and ~1,294 tests it did not write, for a dependency the spec defers to M5
of 6. It would also mean merging into `feat/route-builder-public-exposure`, which
gained three commits during a single survey -- a race against a live worktree.
Submodule -- worst of both: pins a commit on an unmerged branch, drags the Docker
stack into every clone, and still gives no contract.

**Consequences:** rocket depends on an interface with no compile-time contract,
hosted on a laptop, whose candidate cache expires in 30 minutes. Mitigations:
rocket persists route geometry at ingest rather than storing `gpx_url`
references, and treats route suggestion as optional (specs invariant 2 already
requires every feature work without integrations). Plan M5 as
sequential-with-retry: routr serialises generation behind a semaphore and
returns 429 rather than queueing, so five parallel route requests get four
refusals.

**Status:** ACTIVE

## 2026-08-15 -- Vercel plus Neon Postgres, with the Garmin job on Vercel too

**Context:** rocket must answer MCP calls from the phone and a PWA check-in at
06:30, and pull Garmin data daily. routr's laptop-plus-Tailscale answer works for
on-demand route requests but not for a scheduled job behind a closed lid.

**Decision:** Vercel for the app, MCP surface, PWA and the daily job. Neon
Postgres for state. The laptop keeps routr only, because route generation is the
one genuinely compute-heavy piece.

**Alternatives rejected:** Fly.io or a Hetzner VPS (~EUR 4/mo) -- initially
recommended on the premise that `python-garminconnect` needs a real Linux box.
That premise was wrong: Vercel supports Python 3.12/3.13/3.14 with framework
presets, and `curl_cffi` ships manylinux wheels that install on Linux build
images. Cloudflare Workers plus D1 -- free and a good fit for the light compute,
but TypeScript-only, so the Garmin job would have to live elsewhere.

**Consequences:** no durable disk, so the Garmin OAuth token must live in
Postgres and be rehydrated per invocation rather than cached on disk. If that
round-trip breaks, the library silently falls back to a fresh login every run and
Garmin rate-limits the account (429 lockout, warned about at
`docs/specs/05-integrations.md:9`). A test asserting the token is reused rather
than re-minted is therefore mandatory when M3 lands.

**Status:** ACTIVE

## 2026-08-15 -- discipline-kit adopted partially; two guards rejected outright

**Context:** `~/dev/discipline-kit` packages ds-lestrade's engineering discipline
for greenfield repos. Not all of it fits a single-user TypeScript project with a
70-day deadline.

**Decision:** installed with `--hooks`. Kept `check_gate_ledger.py`,
`check_task_trace.py`, `test_guards.py`, the task-file convention, REDLINES,
the decision log and the gate ledger. Removed `check_hook_parity.py` and
`check_structure_docs.py` (plus its `collect_structure_docs.py` companion) and
the pre-commit hook.

**Alternatives rejected:** full adoption -- a fresh install fails two of its own
guards, which contradicts `ADOPTION.md:56`. Also rejected: ds-lestrade's
vocabulary, reveal and two-domain guards, which exist to stop a generic framework
core being captured by one domain. rocket has exactly one domain.

**Consequences:** both removals are `REJECTED` rows in `docs/ci-gates.md` with
reasons, which is the sanctioned path rather than silent omission. Kit bugs found
and worth reporting upstream: `templates/AGENTS.md:34` names
`scripts/collect-structure-docs.py` (hyphens) while `install.sh` lands
`collect_structure_docs.py` (underscores).

**Status:** ACTIVE

## 2026-08-15 -- no pre-commit framework; one pre-push hook

**Context:** the kit's `.githooks/pre-commit` shells out to the Python
`pre-commit` runner, and `check_hook_parity.py` reads hook ids only from
`.pre-commit-config.yaml`.

**Decision:** nothing fires on `git commit`. `.githooks/pre-push` runs
task-trace (fails closed), then typecheck, then the test suite.

**Alternatives rejected:** husky or lint-staged -- more machinery for a solo
repo. Installing Python `pre-commit` into a Node project purely to satisfy a
parity guard -- the tail wagging the dog.

**Consequences:** zero friction on commit, one hard stop before a wasted deploy.
The local/CI asymmetry is deliberate and declared in the gate ledger.

**Status:** ACTIVE

## 2026-08-15 -- Node pinned to 24.x

**Context:** `create-next-app` scaffolded against the local Node 25.6.1.

**Decision:** `.nvmrc` = 24, `engines.node` = "24.x".

**Alternatives rejected:** Node 25 -- Vercel supports only 24.x (default), 22.x
and 20.x, so pinning the local version would have run CI on a runtime production
cannot use.

**Consequences:** local dev on Node 25 still works; CI and Vercel agree on 24.

**Status:** ACTIVE

## 2026-08-15 -- type-aware eslint added after the stock config failed its probe

**Context:** proving each gate fails, per AGENTS.md section 4.

**Decision:** added `typescript-eslint` with `projectService`, enabling four
rules: `no-floating-promises`, `await-thenable`, `no-explicit-any`, `no-console`.

**Alternatives rejected:** a broad recommended-type-checked preset -- a 200-rule
config is a day this project does not have.

**Consequences (negative result, recorded per AGENTS.md section 5):** the stock
`eslint-config-next` is **not** type-aware. It passed a deliberate probe that
`tsc` also catches, meaning the lint gate could not fail independently of the
typecheck gate -- a decoration. `no-floating-promises` is the rule that matters
most here: an unawaited promise in a Vercel function is swallowed silently, which
is exactly how the daily Garmin sync would die unnoticed.

**Status:** ACTIVE

## 2026-08-15 -- ramp cap contradiction, unresolved

**Context:** `docs/specs/03-planner.md:23` caps weekly run km at +15%
week-over-week, permitting a rebuild week to measure against the pre-rest
baseline. `docs/specs/06-training-block.md:25` invokes that exemption for week 2
and calls 40 km "within tolerance" -- but the pre-rest baseline is 30 km, so the
step is +33%, over the cap either way. The seed fixture violates the rule the
planner must enforce.

**Decision:** `GUARDRAILS.returningFromRestRampCapPct` set to 35 so the seed
block is expressible, with the contradiction stated in the config comment and
asserted by `config/training.test.ts`, which requires exactly one week to need
the exemption.

**Alternatives rejected:** silently lowering week 2 to 34 km to fit the cap --
that is changing the athlete's plan to satisfy a document. Silently raising
`rampCapPct` -- that weakens the guardrail for every week to accommodate one.

**Consequences:** the number is a placeholder chosen to make the seed legal, not
a training judgement. Luis must either ratify 35 or restate the rule.

**Status:** PROVISIONAL pending Luis ratifying the returning-from-rest rule

## 2026-08-15 -- readiness formula does not define its musculoskeletal term

**Context:** `docs/specs/02-load-engine.md:16` mandates ATL/CTL/TSB per stress
component and two components (cardio, musculoskeletal). The readiness section
then lists subjective and objective terms without saying how musculoskeletal load
enters, and `docs/specs/07-wiring-todo.md:23` says "start: total-load only",
which contradicts the two-component design.

**Decision:** `READINESS` weights encode the subjective and objective terms only.
No musculoskeletal term yet.

**Alternatives rejected:** inventing a weight -- readiness gates both acceptance
loops in the spec, so a guessed term would silently drive real training decisions.

**Consequences:** readiness is incomplete until this is settled. Flagged in the
config block comment and in AGENTS.md section 1 as a known spec defect.

**Status:** PROVISIONAL pending Luis deciding whether musculoskeletal load gates
run readiness or only feeds total-load accounting

## 2026-08-15 -- every training threshold is provisional

**Context:** `config/training.ts` holds ~30 numbers -- ramp caps, EWMA windows,
surface and descent multipliers, readiness weights and bands, shoe policy.

**Decision:** all of them are seeded from the specs or from defensible defaults
and are explicitly provisional. `docs/specs/02-load-engine.md:26` already
prescribes calibration against accumulated prediction-vs-outcome pairs.

**Alternatives rejected:** waiting for data before choosing -- the block is
already running; there is no version of this where the numbers get chosen later
in peace.

**Consequences:** no threshold in this file should be treated as deliberate until
calibration has run. The multipliers most likely to be wrong are the descent and
surface terms, which exist because a 33 km/600 m trail run in new shoes scored
like an easy flat 30 km and wrecked the athlete for a week.

**Status:** PROVISIONAL pending M6 calibration
