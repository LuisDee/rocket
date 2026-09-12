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

---

## Checklist

- [ ] demotion in the generator's output path
- [ ] reason text carried with it
- [ ] distance cap on severe soreness
- [ ] test: red morning demotes, green morning does not

## Commits

(populated as work lands)
