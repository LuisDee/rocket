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

## 2026-08-18 -- Fenix 8 confirmed; Garmin's own load and readiness become an oracle

**Context:** `docs/specs/07-wiring-todo.md:12` carried "confirm watch model" as an
open item because which wellness fields exist at all is model-gated. Readiness
(`docs/specs/02-load-engine.md:22`) depends on HRV, resting HR, sleep and body
battery.

**Decision:** the watch is a Fenix 8. Top capability tier: HRV status with a
personalised baseline band, Body Battery, sleep staging and sleep score, Training
Readiness, Training Status, and native running dynamics (ground contact time,
vertical oscillation, stride length, running power). No readiness input is
hardware-blocked. Separately: store Garmin's own `dailyTrainingLoadAcute`,
`dailyTrainingLoadChronic`, `dailyAcuteChronicWorkloadRatio` and Training
Readiness score alongside our computed values rather than discarding them.

**Alternatives rejected:** computing everything ourselves and ignoring Garmin's
derived metrics. Rejected because they cost nothing to store and are the only
independent check available on a load model whose two-component split has no
published validation behind it. Disagreement between the two series is precisely
the signal M6 calibration needs. Also rejected: adopting Garmin's Training
Readiness as our readiness score -- it does not know about soreness, which
`docs/specs/02-load-engine.md:21` makes the dominant term.

**Consequences:** every overnight metric is now gated on behaviour rather than
hardware -- the watch must be worn asleep, and HRV `status`/`baseline` stay null
until roughly three weeks of consistent nights. Two questions no API can answer
are now on Luis (worn asleep? for how long?), and if the answer is "only for
runs" then readiness degrades to a resting-HR-and-subjective model and the spec
must say so. Running dynamics are an _optional refinement_ to the musculoskeletal
component, never its core term: ground contact _balance_ additionally requires a
chest strap or pod on every device ever made.

**Status:** ACTIVE

## 2026-08-18 -- Garmin source decided by probe; the token consequence is superseded

**Context:** the 2026-08-15 entry "Vercel plus Neon Postgres, with the Garmin job
on Vercel too" concluded that the Garmin OAuth token must live in Postgres and be
rehydrated per invocation, and that a test asserting the token is reused rather
than re-minted would be mandatory when M3 lands. Research on 2026-08-18 changed
the shape of the problem.

**Decision:** the Garmin source is chosen by a 30-minute probe before any schema
is designed, not by this entry. Branch A: a partner bridge (intervals.icu holds
genuine Garmin partner OAuth and issues a self-serve personal API key) -- no
OAuth token, no rotation, no MFA, activities arrive by webhook. Branch B: the
`python-garminconnect` library direct on a scheduled runner, with the token as a
row in Postgres. The probe decides by reading the actual wellness payload: if
`hrv`, `restingHR`, `sleepScore` and `bodyBattery` are populated, take Branch A.

**Alternatives rejected:** running the Python library inside a Vercel function,
which the 2026-08-15 entry implied. Rejected because Vercel Hobby cron fires once
a day, plus or minus 59 minutes, is never retried, and can be missed with no log
produced -- shipping a 40 MB compiled C extension into a serverless bundle to get
the worst available scheduler. Also rejected: the official Garmin Developer
Program, which is documented business-use-only and whose request form has been a
"System Maintenance" block since 2026-03-25 (verified live 2026-08-18).

**Consequences:** this **supersedes the Garmin-token consequence** of the
2026-08-15 entry; that entry's hosting decision stands unchanged. Under Branch A
the mandatory token-reuse test is unnecessary because there is nothing to
re-mint. Under Branch B it is necessary and sharper than previously understood:
`Garmin.login()` accepts an inline JSON token string, but in that mode the
library **never writes rotated tokens back** -- every `client.dump()` is gated on
a filesystem path being set, while the refresh token does rotate. The caller must
persist `client.dumps()` after every login or silently degrade to a credential
login per run and trip the 429. Under either branch, retry loops against Garmin
auth are forbidden: the 429 is keyed per-account, inescapable by changing IP or
headers, and lasts 48-72+ hours with no recovery process.

**Status:** ACTIVE. The probe result is PROVISIONAL pending Luis running it; the
branch it selects should be recorded as a further entry.

## 2026-08-18 -- guardrails ship before the load engine; two-component model deferred

**Context:** `PLAN-2026-001` ordered the M1 stages as load engine (stress
cascade, then rolling load state) followed by the planner and its guardrails.
That ordering assumed guardrail enforcement needs load state. Re-reading
`03-planner.md:22-28` against what each guardrail actually consumes shows it
does not: the ramp cap compares weekly km against the previous week, the
minimum rest-or-swim-only day and the taper protection read the schedule, and
the quality gate reads reported soreness from the check-in. Three of four need
distance and the schedule only; the fourth needs the check-in. None needs TSS,
ATL, CTL, TSB or the two-component split. With 67 days to the race and the
block already running, that ordering put the project's differentiator behind
three stages of unvalidated modelling.

**Decision:** the planner/guardrail stage and the replan/negotiation stage move
ahead of the stress cascade and the load-state stage — stages now read 6
planner, 7 replan, 8 stress cascade, 9 load state. The MVP is stated
explicitly in the plan as: a persistent, phone-accessible training plan that
auto-ingests Garmin activities and pushes back when Luis breaks his own rules.
The two-component cardio/musculoskeletal load model is deferred, not deleted.

**Alternatives rejected:** keeping the original order, which is defensible only
if the guardrails need load state, and they do not. Deleting the two-component
model outright — rejected because it is the spec's stated intent
(`02-load-engine.md:9-13`) and the evidence that would justify or kill it does
not exist yet. Shipping the guardrails without the ramp cap to avoid open
question 3 — rejected because the ramp cap is the guardrail most likely to
actually fire during a rebuild block.

**Consequences:** the coach argues back several stages earlier, on manual
logging alone, which is what spec invariant 2 always intended. Open question 3
becomes more urgent — it now blocks Stage 6 rather than Stage 8. Readiness as a
distinct signal from raw soreness is unavailable until Stage 9, so Loop B's
recovery gate reads the check-in alone until then and upgrades in place when
HRV and resting HR arrive. Garmin's own `get_training_readiness()` and
`get_training_status()` cover the gap in the meantime at no cost. The named
trigger for revisiting the deferral: once Stage 9 has run ~3 weeks against real
data with Garmin's series stored alongside ours, the divergence between them is
the evidence that says whether a second computed component earns its place.

**Status:** ACTIVE. The deferral is PROVISIONAL pending that divergence
evidence; it is a deferral with a trigger, not a silent scope cut.

## 2026-09-06 -- macro layer re-derived from measured Garmin history

**Context:** the seed block in `config/training.ts` was authored against a
2026-08-10 start and a training history that did not happen. Garmin was
bootstrapped on 2026-09-06 and the real weekly volumes are: 22 Jun 21.3,
29 Jun 38.4, 6 Jul 25.1, 13 Jul 42.3, 20 Jul 24.2, 27 Jul 39.7, 3 Aug 39.5,
10 Aug 27.2, 17 Aug 34.8, 24 Aug 0 (holiday), 31 Aug 14.8 km. Longest run
31.5 km on 2026-08-09. Garmin's own load model reads acute 296, chronic 287,
ratio 1.00, training readiness 63.

**Decision:** `SEED_WEEKS` is replaced by `BLOCK_WEEKS`, re-derived from that
history. The block starts 2026-09-07 with a taper into the Battersea Park Half
(Sat 12 Sep), then four build weeks (35 / 45 / 52 / 58 km) and two taper weeks
(38 km, then race week). Long runs 22 / 26 / 32 / 24 km, the longest on Sun
4 Oct, 20 days out, with a deliberate cut-back the Sunday after.
`PRE_BLOCK_BASELINE_KM` (a guessed 30) is replaced by `MEASURED_BASE`, which
carries the observed weekly series, a 34.8 km pre-taper baseline, and Garmin's
load figures as an independent cross-check.

**Alternatives rejected:** keeping the seed block -- its dates are wrong and
its 65 km peak is unreachable inside the ramp cap from here. Also rejected:
demoting or abandoning the goal race, which an earlier revision of the plan
raised as an option on the mistaken basis that the block had collapsed.

**Consequences:** only **four long runs** fit before the taper, against the six
to eight a normal marathon block carries. That, not weekly volume and not
aerobic fitness, is the constraint that sets race day -- long-run durability is
what the closing 10 km is made of. Three week-over-week steps exceed
`GUARDRAILS.rampCapPct`; they are recorded as explicit `rampExemption` strings
on the weeks concerned rather than absorbed by raising the cap, and two of the
three are marked UNRATIFIED pending Luis's explicit override.

**Status:** ACTIVE

## 2026-09-06 -- correction: the block had not collapsed

**Context:** an earlier revision of PLAN-2026-001 stated that weeks 3 and 4
delivered "one 4.83 km run and a treadmill session against 45 and 50 km
targets", described this as roughly 5 km/week against 95 km planned, and
offered demoting the goal race as a serious option.

**Decision:** that framing was wrong and is withdrawn. It was derived from a
truncated view of the recent-activities list. The full series shows ten weeks
averaging about 30 km with a 42.3 km peak, one blank week and one light one --
an interruption, not a collapse. Garmin's acute:chronic ratio of 1.00 says the
same thing independently: neither detrained nor overreached.

**Alternatives rejected:** quietly re-deriving the plan without recording the
error. `AGENTS.md` section 5 requires negative results to be written down;
a wrong conclusion that drove a serious recommendation qualifies.

**Consequences:** the goal race stands. The lesson is procedural and worth
keeping: a truncated list read as a complete one produced a confident
recommendation to abandon a race. Aggregate from the full series before
drawing a conclusion about a trend.

**Status:** ACTIVE

## 2026-09-06 -- pace estimates are provisional pending the 12 Sep half

**Context:** Garmin predicts a 1:38:12 half and a 3:35:40 marathon. Luis's own
assessment is that 1:38 is too ambitious: he would love 1:40 and thinks 1:45 is
realistic.

**Decision:** record all three in `PACE_ESTIMATES` and lock none of them.
Garmin's implied half-to-marathon ratio is 12940/5892 = 2.196, a Riegel-style
exponent of about 1.135 and more conservative than the classic 1.06. Applied to
the athlete's own numbers a 1:45 half implies about 3:50:35 and a 1:40 about
3:39:36; with only four long runs banked the back half degrades more than any
formula predicts, so the honest planning band off a 1:45 half is 3:50-4:00.

**Alternatives rejected:** adopting Garmin's 3:35:40, which the athlete does not
believe and which no rehearsal supports. Also rejected: picking a goal pace now
-- `docs/specs/06-training-block.md` already requires marathon pace to be
derived from a rehearsal result rather than guessed, and Saturday's half is that
rehearsal, on the goal-race course, six days away.

**Consequences:** every pace-dependent session is unspecified until 12 Sep.
That is correct rather than inconvenient: a maximal effort on the actual course
settles empirically in six days what a formula would only estimate.

**Status:** PROVISIONAL pending the Battersea Park Half result, 2026-09-12

## 2026-09-06 -- daily trainer bought; shoe inventory recorded

**Context:** `docs/specs/07-wiring-todo.md` carried "buy road daily trainer" as
an open task on Luis. The ramp to 45-58 km weeks was explicitly conditioned on
it: running that volume in carbons or in trail shoes was a named injury risk.

**Decision:** the trainer is bought and in use; carbons are ready for the
Battersea Half on 12 Sep as well as the marathon. The inventory is now typed
data in `config/training.ts` `SHOES.inventory` -- daily trainer for everyday
road mileage, carbons for races and long runs at or above
`carbonMinDistanceKm`, Peregrine 16 for trail only and still capped at
`trailAdaptationCapKm` until adapted.

**Alternatives rejected:** recording only the thresholds and leaving the
inventory implicit. The foundation should carry the inventory even though
nothing reads it yet, per the standing scope rule that the MVP accommodates all
data rather than the minimum v1 consumes.

**Consequences:** the ramp's stated prerequisite is met and that injury risk is
retired. But the trainer is **new**, so its first uses carry the
`MULTIPLIERS.shoeNovelty` penalty, and a new shoe during a volume ramp is two
novel stressors at once. The 2026-08-09 run that wrecked him stacked three:
new Peregrines, trail surface, 600 m of descent. `SHOES.inventory[].isNew`
exists so the load model can charge that novelty rather than discover it.

**Status:** ACTIVE

## 2026-09-06 -- the home-screen app ships without a service worker

**Context:** rocket needed a front end Luis could add to his iPhone home screen,
ahead of any database work. The plan had assumed this meant porting
DoHardThings' PWA machinery -- service worker, install journey, Serwist.

**Decision:** a manifest, PNG icons and a page. No service worker, no offline
support, no install-prompt UI.

**Alternatives rejected:** porting `DoHardThings/components/pwa/` -- roughly
26 KB of mock-Safari-chrome walkthrough that would add motion, lucide-react,
sonner and @base-ui as dependencies. It exists to teach strangers on mixed
devices to install a web app. Also rejected: `app/sw.ts` plus Serwist, which is
wired through a webpack plugin while rocket's Next 16 uses Turbopack -- a
rewrite rather than a copy.

**Consequences:** iOS 26 removed installability requirements entirely -- Safari
adds any page to the home screen -- so none of that machinery buys anything for
one user on one phone. The page therefore has no offline story: no signal means
an error page. That is the right trade for a view whose entire value is
freshness. Web push, which genuinely does need a service worker, is deferred.

Icons are PNG, not SVG. iOS silently ignores SVG for home-screen icons, which
is why `~/dev/marathonApp`'s icon on his phone is a Safari screenshot rather
than its intended art.

**Status:** ACTIVE

## 2026-09-06 -- recent runs ship as a committed snapshot, not a live read

**Context:** the page shows what was actually run. The real capture at
`tools/garmin_probe/out/activities_recent.json` is gitignored: it carries GPS
polylines, per-zone heart-rate dwell times and running dynamics, and the repo
is public.

**Decision:** `tools/extract_activity_summary.py` derives a six-field summary
(date, type, distance, moving and elapsed seconds, the athlete's own title) into
`src/data/recent-activities.json`, which is committed. The page states plainly
that it is a snapshot taken on 2026-09-06 and not a running sync.

**Alternatives rejected:** reading the gitignored capture at request time --
works locally, absent in a deployment, and would put personal health data into
the build. Committing the raw capture -- publishes GPS traces that mostly start
at his front door.

**Consequences:** new runs do not appear until the summary is regenerated, which
is why the page says so rather than implying freshness. The extractor asserts no
unexpected field survives, so a future capture with new keys fails loudly rather
than leaking quietly. This is replaced wholesale when the sync lands.

**Status:** PROVISIONAL pending the scheduled Garmin sync

## 2026-09-06 -- the aggressive volume block: 60 / 80 / 100 / 80 / 60

**Context:** the macro layer re-derived earlier today peaked at 58 km, built
from an eleven-week Garmin window averaging ~30 km. Luis rejected it twice, and
the second time with reasoning that checked out: "just because I historically
run less I MUST have high weekly mileage... WE NEED THE VOLUME if we get it in
early we can taper right down."

**Decision:** 20 (race taper) / 60 / 80 / 100 / 80 / 60, peaking at 100 km in
the week of 28 September with the 35 km long run in the same week, leaving three
taper weeks into the marathon.

**Alternatives rejected:** the 35/45/52/58 block, on the grounds above. An
intermediate 42/58/75 proposal, same grounds. Peaking at 100 in the week of
5 October -- rejected because it leaves only two taper weeks, and Luis's own
framing was to get the volume in early and taper right down. Also rejected:
holding the 15 % cap and marking every week an exemption.

**Consequences:** deeper history pulled through the rate-limit guard supports
the decision more than the recent window did -- 45.8, 48.0 and 57.1 km weeks in
April and May, the last carrying a 42.7 km long run. Luis further stipulates he
has run 60 km weeks comfortably and that some history never reached Garmin;
recorded as `MEASURED_BASE.stipulatedComfortableWeekKm` and treated as given.

The honest cost, recorded because a breach must be named rather than absorbed:
100 km is roughly 75 % above anything recorded, reached in three weeks, in a new
shoe. The destination is not the hazard, the slope is. Three mitigations carry
the weight and are encoded rather than advised: `minRunDaysAtHighVolume` (a
100 km week over five days is 20 km a day; over seven it is 14), keeping nearly
all of it easy, and the week-2 check-in gate.

**Status:** ACTIVE

## 2026-09-06 -- ramp cap raised to 35 % in an explicit aggressive mode

**Context:** the block above breaches the 15 % ramp cap every single week.

**Decision:** `GUARDRAILS.aggressiveRampCapPct` = 35, with `rampMode` recording
which is in force and `ACTIVE_RAMP_CAP_PCT` as the single value everything
reads. The 15 % standard cap is retained, not deleted.

**Alternatives rejected:** leaving the cap at 15 % and marking all five weeks as
exemptions. A guardrail overridden every week is repealed in practice, and worse
than absent: it trains the athlete to click through the one warning that
eventually matters. Also rejected: removing the cap, which would have left
nothing to catch a genuine spike.

**Consequences:** under 35 % exactly one step breaches -- the 20 to 60 return
from the race taper, +72.4 % on the pre-taper base. That is the step that
deserves scrutiny, and it now gets it alone rather than in a crowd of five. It
exceeds the returning-from-rest allowance too, so it stands on Luis's explicit
ratification and nothing else; the test asserts the exemption says RATIFIED.
The 80 (+33 %) and 100 (+25 %) steps sit inside the cap.

**Status:** ACTIVE

## 2026-09-06 -- swim frequency corrected: one session a week, not five evenings

**Context:** the spec pack stated swimming five evenings a week plus a lesson,
in `01-domain-model.md`, `03-planner.md`, `04-mcp-surface.md` and
`06-training-block.md`. It is one two-hour session per week. There is also no
cycling at all.

**Decision:** corrected in all four specs and recorded as `AVAILABILITY` in
`config/training.ts`. Cycling is not modelled for availability or load; the term
survives only in the generated Garmin field catalogue, which records Garmin's
field names rather than our model and was left alone.

**Alternatives rejected:** treating it as a documentation tidy for a later pass.
It is load-bearing for the volume block committed in the same change, so it
belongs in the same commit.

**Consequences:** the earlier feasibility arithmetic concluded weekday running
was confined to early mornings because five evenings were taken. With four of
those evenings free, evening runs and AM/PM doubles are available -- the
difference between a 100 km week meaning a 05:30 alarm every weekday and being
comfortably spread. **The volume plan is more feasible than the availability
model implied, not less.** `minRunDaysAtHighVolume` is realistic on this
schedule rather than aspirational.

**Status:** ACTIVE

## 2026-09-06 -- the first per-day session layer

**Context:** `config/training.ts` held weekly totals and long runs only. That
gap was already identified as the thing stopping the app being worth opening
daily, and it matters more now: the sharpest risk in this block is not the
100 km week but the 60 km week starting two days after a raced half.

**Decision:** `BLOCK_WEEKS[].days` carries `DayPlan` entries. Week 2 is
populated (6/8/10/10/6/20/rest); every other week carries `days: null` until
authored.

**Alternatives rejected:** authoring all seven weeks now. Weeks 3 onward depend
on the week-2 check-in gate, so authoring them would be inventing detail the
gate exists to decide.

**Consequences:** a weekly total cannot express "rest instead if the half left
anything sore" or "short shakeout before the long run", and those are the
instructions that make the week safe. Tests assert the days sum to the weekly
target, that the running-day count matches `minRunDays`, and that the day marked
`long` matches `longRunKm` -- so the layer cannot silently drift from the total
above it.

**Status:** ACTIVE

## 2026-09-07 -- races become first-class data, and the peak fortnight is reshaped around them

**Context:** the adversarial review (F6) found that three entered October races
appeared nowhere in `config/` or this log, and that the macro layer re-derived on
2026-09-06 consequently placed the block's peak 35 km long run on Sunday 4
October -- Lincoln Half day -- and a 26 km week ending Sunday 11 October, LDNX
10K day. Nothing caught it, because `BLOCK` held only the goal and tune-up races
and no other race existed anywhere the planner could see.

**Decision:** Luis ratified on 2026-09-07: **Dorney Triathlon (3 Oct) is
dropped**; **Lincoln Half (4 Oct) and ASICS LDNX 10K (11 Oct) still stand**. A
new exported `RACES` carries every fixture with date, distance, role and
droppable, including Dorney as `dropped` rather than deleted. Every `BLOCK_WEEKS`
entry now carries `longRunDate`, and `longRunOnRace` names the race when one
carries the session. The two races carry their weeks' long sessions:

- Sun 27 Sep, 30 km -- the last uninterrupted long run of the block.
- Sun 4 Oct -- Lincoln as ~8 km warm-up + 21.1 km at marathon pace + ~6 km easy,
  a ~35 km day, 20 days out.
- Sun 11 Oct -- LDNX 10K hard inside a ~16 km day, cut from the 26 km that week
  previously held.

**Alternatives rejected:** moving the long runs to the Saturday before each race,
which stacks a 30 km+ run the day before a race and is the same collision moved
by 24 hours. Also rejected: dropping the peak long run, which would leave the
block with nothing over 30 km.

**Consequences:** the Lincoln construction turns a race that would have wrecked
the peak week into the block's best marathon-specific session. It is
**conditional on Lincoln being run at marathon pace, not raced flat out** -- the
role the original spec gave it. Reversible: if Luis races it hard, week 4 loses
its long session and the 100 km target should come down. Week 5's 80 km now sits
in midweek volume rather than the weekend, which is the correct taper shape.
Race week's `longRunKm` is null: the marathon is the goal, not a planned training
session, and counting it put 42.195 into every long-run aggregate.

Week 1's target moved 20 -> 28 km, because the half is 21.1 km and the week's own
long session was larger than its total.

**Status:** ACTIVE

## 2026-09-07 -- race attendance is not derivable from DoHardThings

**Context:** Luis asked why rocket could not see that he had dropped Dorney,
noting it is visible in DoHardThings. It is not reachable: DoHardThings records
attendance in Google Calendar `extendedProperties`, and the Google Calendar
connector returns the event without them. Verified against the Lincoln Half
event -- summary, dates and description come back, no extended properties, no
attendees. Its calendar is also a shared catalogue containing races nobody is
entered in, so presence on it means nothing about attendance.

**Decision:** `RACES` is ratified by hand until a `rocket_import_race` seam
exists. Do not infer attendance from calendar presence.

**Consequences:** this is exactly how three entered races went missing from a
committed block, so it is a standing hazard rather than a one-off. It is the
concrete argument for the review's F26 seam.

**Status:** ACTIVE

## 2026-09-07 -- the Strava API is withdrawn; the MCP carve-out is the only Strava path

**Context:** the adversarial review (F17) flagged Strava's API Policy. Verified
against the primary source at <https://www.strava.com/legal/api_policy>, not the
review's appendix. Section 5.3, effective 2026-06-01, reads verbatim: "You may
not use the Strava API Materials or Strava Data, directly or indirectly, in
connection with the development, training, evaluation, or operation of any AI
Application", extended to "any data derived from, aggregated from, anonymized
from, or generated using Strava Data, in any form" and to "grounding,
evaluation, benchmarking, embedding generation, retrieval-augmented generation".
rocket is a coach whose reasoning is an LLM reading training history: grounding,
named explicitly. The policy does not define "AI Application", which cuts against
a narrow reading rather than for it -- the drafters wrote an explicit carve-out
for the personal-own-data case, which they would not have needed if single-user
use already fell outside 5.3.

**Decision:** `tools/strava_probe/` (174 lines) and `docs/STRAVA_SETUP.md` are
deleted. rocket holds no Strava API credentials and registers no Strava
application. Where Claude needs Strava streams it reads them through the official
Strava MCP connector under the same policy's carve-out -- "This prohibition does
not extend to use of the Strava MCP" / "Subscribers to Strava may access the
Strava MCP in connection with their personal use of their own Strava data" --
which is Luis's own subscription, his own data, and is confirmed live on this
account. That path is unaffected by this entry.

**Alternatives rejected:** keeping the probe unwired behind a comment. Section
5.3 prohibits the materials in connection with the _operation_ of an AI
application, and a registered application holding a live refresh token is
operation; dead code carrying a licence liability is the worst of both. Also
rejected: reading the single-user case as outside "AI Application" -- undefined
terms are read broadly when the cost of compliance is zero, and here it is zero,
because Garmin is primary anyway and the MCP returns richer data (per-second
streams, zones) than the API tier the probe held.

**Consequences:** the two justifications the deleted doc gave for existing were
both false. A fallback activity feed is grounding under 5.3. Publishing routes is
not a capability the API has at all -- verified at
<https://developers.strava.com/docs/reference/>, the Routes resource exposes only
`GET /routes/{id}`, `GET /routes?athlete_id=`, `export_gpx` and `export_tcx`, no
write verb. So routr delivers GPX and a Strava route is created by hand in
Strava's web UI, which is how DoHardThings' `stravaRouteUrl` fields are populated
today. Coupling cost of the deletion is zero: nothing under `src/` or `scripts/`
referenced the probe. What it makes hard: any future automated upload of a
finished activity file to Strava, which `tasks/preview-and-ship.md` currently
specifies against `POST /api/v3/uploads` -- that path needs re-reading against 5.3
before it is built, and it is not this entry's to decide.

**Left to Luis, not done by an agent:** revoke the Strava API application at
<https://www.strava.com/settings/api>, and remove the `pass` entries
`strava/client-id` and `strava/client-secret`. Until both are done the
application still exists under his account.

**Status:** ACTIVE

## 2026-09-07 -- scope for the 48 days: a thin working coach, not a complete one

**Context:** the adversarial review's section 8 Q4 put two options to Luis. Ship a
thin vertical slice in about two weeks and defer the rest past the race, or run
this block by hand with a Claude Project and build rocket properly for the spring.
48 days to the goal race, of which the last two are taper.

**Decision:** option A. Ship the thin working coach: five Neon tables, the
deterministic planner and guardrails over `BLOCK_WEEKS`, five tools behind a
bearer for Claude Code, a one-page check-in, a daily sync and the watch push.

**Alternatives rejected:** option B, running the block by hand. It is what happens
by default if A is not chosen deliberately, and it generates none of the
prediction-versus-outcome pairs the calibration milestone needs -- only running a
real block through the system does that.

**Consequences:** deferred past 2026-10-24 and recorded in the plan's register --
the two-component load model, the readiness implementation, the capability-pack
seams to routr and DoHardThings, and the deep database guard stack. Nothing cut is
foundation: append-only history, thresholds as cited data, the deterministic
planner and the write-tool contract all survive and all land before the race.

**Status:** ACTIVE

## 2026-09-07 -- intervals.icu is the primary Garmin bridge; the probe stays as a fallback

**Context:** review finding F18. Two ways to get Fenix 8 data in. The unofficial
`python-garminconnect` probe is already built, guarded and working, and exposes
everything Garmin holds including the Training Readiness sub-factors and Garmin's
own acute/chronic pair. intervals.icu holds official Garmin partner OAuth, relays
the wellness metrics within minutes of a sync, computes fitness and fatigue, and
can push a planned session onto the watch.

**Decision:** intervals.icu as the primary bridge and the outbound watch push,
with the `python-garminconnect` probe retained as a manual fallback for deep pulls
and backfill. Luis delegated this choice explicitly -- "literally whatever idk
you're the pro at this" -- so it is recorded as a judgement made on his behalf and
reversible on his word.

**Alternatives rejected:** the direct library as primary. Its per-account 429 locks
the account for 48 to 72 hours with no recovery path, it cannot run on Vercel so it
needs a machine at home or GitHub Actions, and it broke twice in the twelve months
to September 2026. Choosing the bridge removes Python from production entirely.

**Consequences:** production rocket becomes a single Node component with one daily
job and no Python. Field coverage is still unverified -- the G1 probe in
`07-wiring-todo.md` remains unticked and must run before schema design leans on any
bridge-supplied field. Garmin's readiness sub-factors are not exposed by the
bridge; if they turn out to matter, the fallback path is already built.

**Status:** ACTIVE

## 2026-09-07 -- the goal is a range derived from the 12 September half

**Context:** review finding F5. The top-level docs carried an implied goal band of
3:25 to 3:35, written before a three-week holiday. Garmin predicts 3:35:40 off an
implied 1:38 half; Luis judges 1:38 "way too ambitious", would love 1:40 and calls
1:45 realistic. Applying Garmin's own half-to-marathon ratio of 2.196 to 1:45 gives
roughly 3:50, and with only four long runs banked the back half degrades further
than any formula predicts.

**Decision:** the goal marathon time is whatever the Battersea Park Half on
2026-09-12 implies, expressed as a range in `PACE_ESTIMATES.planningBandSeconds`
and surfaced by `rocket_get_status`. "As fast as possible" is retired as a planning
input; it remains a motivation and is no longer a number anything derives from.

**Alternatives rejected:** keeping 3:25 to 3:35. Training paces derived from it
would be faster than current fitness supports, which makes the easy runs not easy
-- and on a 100 km week that is how the volume becomes the injury rather than the
adaptation.

**Consequences:** no pace target is locked until 12 September. Every pace in the
config is provisional until then and is marked so. Once the half is run, the band
is recomputed and the plan's training paces follow from it.

**Status:** ACTIVE

## 2026-09-07 -- OAuth for the phone is back in the pre-race scope

**Context:** the option-A scope decision above deferred the OAuth 2.1 server past
the race, on the review's F23 reasoning that ~600 lines of auth work before any
coaching exists is the wrong order. Luis reversed it the same day: "we can build
the phone access its quick, we have built a tremendous amount in a few hours."

**Decision:** the connector work returns to the pre-race path. It stays sequenced
AFTER the planner and the check-in loop -- the sound half of F23, since a coach
that does not work from Claude Code is not worth putting on a phone -- and the
claude.ai connector dialog is checked first, because if it offers a static header
or none, the OAuth server may not be needed at all.

**Alternatives rejected:** leaving it deferred. The estimate it rested on was
inherited from the review rather than measured, and a day's observed velocity
contradicted it.

**Consequences:** the OAuth row leaves the plan's Deferred-Items Register and its
RATIFIED-out classification is withdrawn. The DoHardThings shim moves back up the
lift table. One acceptance criterion is mandatory rather than advisory: DHT's
`app/api/mcp/oauth/authorize/route.ts:42-57` mints an authorization code for ANY
Google account that completes sign-in -- no allowlist, and no `signIn` callback in
`lib/auth.ts`. rocket is single-user and private, so the owner-email allowlist ships
with a negative test asserting a non-owner is refused.

**Status:** ACTIVE

## 2026-09-07 -- returningFromRestRampCapPct is deleted, superseding its provisional entry

**Context:** the 2026-08-15 entry "ramp cap contradiction, unresolved" set
`GUARDRAILS.returningFromRestRampCapPct` to 35 as "a placeholder chosen to make the
seed block expressible" and left it PROVISIONAL pending ratification. That entry
cannot be edited -- the log is append-only -- so this supersedes it.

**Decision:** the field is deleted. The block it existed to express was replaced on
2026-09-06 by the 60/80/100/80/60 shape Luis ratified, whose single exemption is
week 2's and is marked RATIFIED rather than provisional. The test is rewritten
against `ACTIVE_RAMP_CAP_PCT` plus the RATIFIED marker.

**Alternatives rejected:** ratifying 35. Nothing now needs it: no week in the
committed block invokes a returning-from-rest allowance, so ratifying would preserve
a number with no caller.

**Consequences:** the 2026-08-15 entry is SUPERSEDED by this one. The plan's open
question 3 and its Stage 6 blocker are removed -- both described config that no
longer exists.

**Status:** ACTIVE, superseding the 2026-08-15 ramp-cap entry

## 2026-09-07 -- static_headers is not a path to phone access

**Context:** F23 suggested checking whether the claude.ai connector dialog offers a
static header before building an OAuth server. It was investigated during the plan
rewrite and the answer recorded there rather than here, which is the wrong artefact
-- the decision log exists precisely so a settled question is not re-asked.

**Decision:** `static_headers` is not available for this use. It is an Anthropic
Beta described as a fixed credential entered by an organization, not a personal
connector option. Phone access therefore requires the OAuth flow.

**Alternatives rejected:** waiting to discover this at connector-add time, which is
what DoHardThings and routr both did -- routr's connector guide records that
claude.ai "discards static tokens and insists on the flow", established the hard way.

**Consequences:** the OAuth shim is required rather than contingent. The dialog is
still worth a five-minute look before the work starts, in case the offering has
changed.

**Status:** ACTIVE

## 2026-09-07 -- the single-session spike exemption is narrowed to pure races

**Context:** F7 added `singleSessionSpikePct` measured against the trailing-30-day
longest run, exempting any session falling on a live race date. The independent
verification found that this made the block's largest single session invisible to
it: week 4 is 33 km on Lincoln Half day, of which 21.1 km is the race and roughly
12 km is warm-up and cool-down the planner chose this week.

**Decision:** the exemption applies only to a PURE race -- a session whose distance
does not exceed the race distance. A race the planner has built a longer session
around is measured in full.

**Alternatives rejected:** netting the race distance out and measuring the
remainder, which the verification suggested. That scores ~12 km against a 27 km
baseline, passes trivially, and hides the session it was meant to surface. The
tissue runs 33 km either way; the denominator does not care which kilometres had a
race number pinned to them.

**Consequences:** the block now reports two breaches rather than one -- 27 km on
27 September at 123%, and 33 km on 4 October at 122%, the latter naming Lincoln as
the race it contains. Both are advisory and neither blocks. Four tests fail if the
old date-level exemption is restored.

**Status:** ACTIVE
