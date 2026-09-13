# readiness-acts

**Scope boundary:** make the morning check-in change the day's session. Covers:
`qualityBlocked` demoting threshold and marathon-pace work to easy, soreness
capping session distance, and the demotion being visible with its reason.
Explicitly does NOT cover: changing the readiness SCORE or its weights, HRV (no
baseline exists), or automatic replanning of future weeks.

**References:** `src/domain/readiness.ts`; `config/training.ts` READINESS;
REDLINES.md rule 4; `docs/specs/02-load-engine.md:19-24`.

**Alternative rejected:** having the app merely warn and let the athlete decide.
That is what it does today -- `qualityBlocked` appends `&gated=1` to a URL and
prints a sentence -- and it is the weakest possible form of the feature: the
gate fires exactly when judgement is least reliable, which is the morning after
a session that hurt.

**Interface touched:** the session returned for today; `readiness.ts` gains no
new fields.

**Acceptance criteria:**

- With `qualityBlocked` true, today's threshold session comes back as easy, at
  the easy pace band, carrying a sentence naming the reason.
- Soreness at or above `READINESS.sorenessBlocksQuality` also caps distance, and
  the cap is stated.
- The demotion is REVERSIBLE and logged -- the athlete can see what he was
  originally given.
- A test proves a red morning changes the session, not just the copy.

**Assumptions:**

- Demotion, never deletion. A blocked quality day becomes an easy run of the same
  distance rather than a rest day; removing the volume is a bigger intervention
  than the signal supports.

**CRITERION NOT MET, DELIBERATELY.** The third criterion above -- "soreness at or
above `READINESS.sorenessBlocksQuality` also caps distance" -- is wrong, and the
evidence base says so in two separate places. I wrote it before reading
`docs/research/session-prescription-design.json` properly. It says:

- "Intensity is cut before volume -- the volume ramp is the ratified experiment;
  the intensity plan is the buffer around it, so the buffer is spent first."
- A volume cut sits behind TWO readiness channels tripped for SEVEN CONSECUTIVE
  DAYS (-25 %), or all three (-40 %). Not behind one sore morning.

So the distance stands and the intensity goes: quality becomes a genuinely easy
run and the strides come off. The same file forbids the halfway house too -- "Do
not downgrade the session to 'easy tempo' -- cancel it. There is no version of
this block where a compromised threshold session is worth its cost."

The seven-day concordance rule that WOULD justify a volume cut is real work and it
is not here. It belongs with the reversal condition in `feedback-loop`, because it
needs the same trailing-mean machinery. Registered there rather than dropped.

---

## Checklist

- [x] demotion in the generator's output path -- `today.prescribeWeek`, the single
      composition point every surface now calls
- [x] reason text carried with it, alongside the zone and prescription it replaced
- [x] ~~distance cap on severe soreness~~ **refused on evidence** -- see above;
      the seven-day volume rule moves to `feedback-loop`
- [x] strides gated on the same threshold, which the research asks for explicitly
      and nothing did
- [x] gate is date-bounded forwards (no retroactive rewriting) and expires when
      the reading goes stale
- [x] soreness alone decides, in both directions -- the cron's green-band veto and
      the repair's missing threshold were both wrong
- [x] test: red morning demotes, green morning is byte-identical to no check-in
- [x] the cron's rollover now carries the standing gate -- `59cbe9a`, see
      `tasks/the-stored-plan-is-real.md`

## Commits

- `b0e5c12` feat(readiness): make a red morning change the session
