## honestAnswer

**The short version: the volume layer is evidence-shaped; the prescription layer is expert practice with two well-evidenced guardrails and one honest measurement plan. Nothing here is invented, and nothing here is proven.**

**What the sources actually are.** The pace arithmetic is Daniels & Gilbert's 1979 oxygen-cost and duration curves (the VDOT machinery in *Daniels' Running Formula*) and Riegel's 1981 power law. Both are curve-fits to performance data with decades of coaching use, not trials. The five-zone vocabulary (easy / marathon / threshold / interval / repetition) and every per-workout cap — threshold ≤10% of weekly km, marathon-pace ≤20% or 110 min, long run ≤25–30% or 2.5 h — is one coach's judgement. There is no dose-response study behind any of those numbers. I am using them because they are internally consistent and auditable, not because they are validated.

**How do we know it is optimal? We don't, and the closest-matched trial says the question barely matters at his level.** Festa et al. 2019 randomised 38 recreational runners (mean VO2max 53.2 — his is 53.0) to polarised 77/3/20 versus threshold-heavy 40/50/10 for eight weeks and found no significant between-group difference in speed at VO2max, running economy, or 2 km performance. Two distributions about as far apart as you can construct, same outcome. Rosenblat 2019 does favour polarised over threshold (ES −0.66) but pools three trials, all scoring 4–5/10 on PEDro, with 5–10 km outcomes. Muniz-Pumares 2025 (119,452 marathoners) finds the opposite — higher Z2 *and* Z3 proportions both correlate with slower marathons — but it is observational and confounded by ability. Foster and Burnley argue opposite conclusions in the same 2022 *MSSE* issue. **The distribution choice here is a risk decision, not a performance optimisation, and rocket's UI must never call it optimal.**

**What is genuinely well-evidenced, and it is not much:**
- HRmax 201 is a direct measurement, not a model. Everything HR-derived rests on it.
- Garmin's threshold *pace* of 4:20.9/km is wrong, and this is the strongest claim in the document: it is **2 s/km slower than his best 5.10 km race pace (4:19/km)**, i.e. Garmin asserts his 22-minute race pace is sustainable for an hour. Self-refuting on his own file. Lu et al. 2025 (Front Physiol 16:1621996) independently found Garmin LT pace overestimated with MAPE 25.78%, p<0.01, in recreational runners — while LT *heart rate* was not significantly different from lab GXT. Trust the device's HR anchor; discard its pace anchor.
- Vickers & Vertosick 2016 (n=2,303 recreational runners) is the best population match in the whole literature and shows fixed-exponent equivalence models underestimate marathon time by ≥10 minutes for half of recreational runners. This is why 3:36:12 is rejected.
- Rejecting ACWR as a gate (Lolli 2019 mathematical coupling; Impellizzeri 2020; Frandsen 2025 found the *largest* ACWR spikes associated with *fewer* injuries, HRR 0.75). rocket's config already says this and is right.
- Strength training reduces injuries to roughly one third (Lauersen 2018, RR 0.338 across strength-training RCTs). It is the strongest injury-prevention finding available and the plan currently contains none of it.

**Three claims in the brief do not survive checking, and you should know:**
1. **The "Garmin over-predicts by 1.118" factor does not reproduce.** Normalising his efforts to standard distances: half 1:46:21 vs predicted 1:38:25 → 1.081; marathon 3:52:59 vs 3:36:12 → 1.078. The 5 km ratios are useless (his two 5 km efforts disagree by 25 s/km). The real factor is **1.083 at half and marathon distance**, from n=2.
2. **The marathon miss was 19:42, not 27 minutes** — 16:47 once normalised to 42.195 km.
3. **The single most useful thing nobody noticed: Garmin's *decay* is right; only its *level* is wrong.** Garmin's implied half→marathon exponent is 1.135. His own measured exponent from his own two races is 1.1315. Applying his measured level error to Garmin's marathon prediction gives 3:54:09; deriving it independently from his half via his own exponent gives 3:53:02. **Two unrelated routes, 67 seconds apart.** That is the closest thing to genuine corroboration in this entire exercise, and it means Saturday's half fixes Garmin's marathon number in one step.

**What nobody knows.** No trial has ever tested a 24 → 100 km/week ramp — not in novices, not in marathoners. The usual citation against it, Nielsen 2014, is a **non-significant** finding (HR 1.59, 95% CI 0.96–2.66, p=.07) on a subgroup, in a study whose primary outcome was null, in *novice* runners; and Buist's GRONORUN RCT (n=532) found the 10% rule prevented nothing (20.8% vs 20.3%). The evidence is absent in both directions — he is not defying it, and it is not protecting him. No trial establishes a minimum long-run distance for the marathon. And the block's entire thesis — that six weeks of volume moves his personal fatigue exponent from 1.131 toward 1.10 — has **no supporting trial at all**. It is a reasoned bet with a measurement attached, which is the honest description.

**What is invented rather than sourced:** the specific 4:52/km threshold number (three converging derivations, none validated on him — the 16 September session is its first real test), the 1.118→1.083 correction being applied at all with n=2, the 4–6 km/week absolute threshold cap, and the 1.118 exponent target. All flagged in the evidence grades.

## thresholdResolution

**Garmin's threshold pace is wrong. Its threshold heart rate is right. Discard the pace, keep the HR.**

**Why the pace cannot be right, from his own files alone.** His best 5.10 km race (2026-04-11) was run at 4:19/km. Garmin claims his lactate threshold — an intensity sustainable for roughly an hour — is 4:20.9/km. That is **2 s/km slower than a pace he could only hold for 22 minutes**. No physiological reading survives that. The most likely mechanism is that Firstbeat's detector fitted to one of his April 5 km efforts (the 2026-04-25 run at 3:54/km is a 25 s/km outlier against the 4:19 run three weeks earlier, and carries a *lower* average and max HR — 172/196 against 174/199 — which is at minimum a distance or GPS anomaly).

**Why the heart rate is right.** 177 bpm is 88.1% of the measured HRmax of 201 — squarely where LT2 sits. And he averaged **174 bpm for 106 minutes** in the July half. You cannot average above LT2 for 106 minutes, so his true threshold HR sits just above 174 — and 177 is exactly there. Independent device detection and his own race file agree. Lu et al. 2025 supports this split directly: smartwatch LT *heart rate* was not significantly different from laboratory graded exercise testing, while LT *pace* was overestimated with MAPE 25.78% (p<0.01).

**His real threshold: 4:52/km at a work-interval mean HR of 172–177.** Three independent derivations, converging inside 5 s/km:
1. **Daniels VDOT.** His 2026-07-19 half (1:46:35 / 21.14 km) gives VDOT 42.0. Threshold = velocity at 88% of VDOT = **4:54/km**.
2. **Riegel to a 60-minute effort.** From the normalised half (1:46:21) using his own short-to-half exponent (k=1.109, from the 5.10 km race): a 3600-second effort covers 12.6 km → **4:46/km**. With the population exponent (1.06): **4:53/km**.
3. **Practitioner convention.** Threshold ≈ half-marathon race pace minus 10–12 s/km for a runner whose half takes well over an hour: 5:02.5 − 11 = **4:52/km**.

Encoded as a multiplier so it re-derives from Saturday automatically: **threshold pace = half-marathon pace × 0.965** (5:02.5 × 0.965 = 4:51.9). Band ±4 s/km.

**The consequence of getting this wrong.** Garmin's number is **31 s/km faster** than the derived threshold (not the ~60 s/km the brief's research claimed — 4:52 is 292 s/km, 4:20.9 is 261 s/km). A 30-minute "tempo" run at 4:21/km is a 10 km race effort. Prescribed weekly on an 80–100 km ramp, that is the single most likely way this block ends in injury or non-functional overreaching.

**The self-correcting loop, because 4:52 is still a formula until it is run.** On the first threshold session (Wed 16 September), record the *mean* HR of the work intervals — not an instantaneous ceiling, which would abort the session by rep three on any correctly-paced threshold effort. If that mean lands 172–177, the pace is right. **If it lands above 180, the pace column is too fast: drop 5 s/km and re-anchor.** If it lands below 168, the pace is conservative — but do not raise it before week 4, because his TSB of +24.7 flatters the first session of any block.

## paceTable

**Anchor: 2026-07-19 half, 21.14 km in 1:46:35 → 5:02.5/km raw (1:46:21 normalised to 21.0975 km).** This is his best genuine continuous effort. PROVISIONAL — replaced by the Battersea Half result on Sunday 13 September. Never derive from the 2026-07-26 run (17:27 of stopped time across 22 laps) or the 2026-04-25 5.04 km (25 s/km outlier with inverted HR).

Every pace below is a **multiplier of the anchor pace**, so re-anchoring is one number in config and the whole block repaces.

| Zone | Multiplier | Pace (July anchor) | Heart rate | What it is for |
|---|---|---|---|---|
| Recovery | ×1.36–1.45 | 6:51–7:19/km | ≤ 138 | day after quality or long |
| **Easy** | ×1.24–1.36 | **6:15–6:52/km** | **138–150, hard ceiling 150** | ~83% of the block. This is the training. |
| **Marathon (MP)** | ×1.085 | **5:28/km** (5:24–5:32) | 158–168, ceiling 170 | specificity + the durability measurement |
| **Threshold (T)** | ×0.965 | **4:52/km** (4:48–4:56) | work-interval mean 172–177 | raise the ceiling MP sits under |
| Strides | — | 20 s, ~3:55–4:10 feel | not used | economy, tendon stiffness. 6×20 s, walk-back. |
| 10K race (11 Oct) | — | **46:30–48:15** (4:39–4:49/km) | 185–196 | the block's only supra-threshold dose |

**Derivations.**
- **Easy is defined by heart rate, not pace.** 150 bpm is 74.6% of the measured 201. The pace band is the *expected output*, not the prescription — and it should get faster across the block at the same HR. That fall is the adaptation signal (see validation). On a ramp from 24 to 100 km/week this ceiling is the single most load-bearing number in the plan: easy runs drifting to 5:45/km is the specific, likely, invisible way this block fails.
- **Marathon pace ×1.085 = the exponent midpoint.** His measured half→marathon Riegel exponent is **k = 1.1315** (from the normalised July half and the normalised May marathon), against a population 1.06. Marathon pace = half pace × 2^(k−1). At his measured k: 5:31/km = **3:53:02** — which is, to the second, what he actually ran in May. That is the *floor*: what he runs if the block buys nothing. At the block's durability target k = 1.10: 5:24/km = **3:48:01**. The prescribed ×1.085 corresponds to k = 1.118, the midpoint — deliberately, so training pace does not assume an adaptation that has not been measured yet.
- **10K prediction, three routes:** from the half with his short-side exponent k=1.109 → 46:28; with the population exponent → 48:12; Garmin's 43:29 × the measured 1.083 level factor → 47:06. **Do not pace off 43:29.**
- **Marathon target: 3:48–3:53.** This lands just faster than the band already in `PACE_ESTIMATES.planningBandSeconds` (3:50–4:00). Reconcile to **3:50–3:56**, with 4:00 the number if Saturday goes badly.

---

**AFTER SATURDAY — the version for each plausible result.** Apply the same multipliers to the new anchor. Fall back to the 1:46:30 column if the race is not run flat out, is slower than 1:54, or shows more than two minutes of stoppage.

| Battersea | Threshold | Marathon pace | Easy band | Marathon: floor (k=1.131) → target (k=1.10) | 11 Oct 10K |
|---|---|---|---|---|---|
| **1:40** | 4:34 | 5:09 | 5:53–6:27 | 3:39:04 → 3:34:21 | 43:42 |
| **1:44** | 4:45 | 5:21 | 6:07–6:42 | 3:47:50 → 3:42:56 | 45:27 |
| **1:46:30** *(= July form)* | **4:52** | **5:29** | **6:16–6:52** | **3:53:19 → 3:48:17** | **46:32** |
| **1:50** | 5:02 | 5:39 | 6:28–7:06 | 4:00:59 → 3:55:47 | 48:04 |
| **1:54** | 5:13 | 5:52 | 6:42–7:21 | 4:09:45 → 4:04:22 | 49:49 |

Heart-rate anchors do **not** move with the result — HRmax 201 and LT HR 177 are measured, not derived. Only paces re-anchor. If a new pace column and the HR bands disagree in a session, **the heart rate wins and the pace column is wrong.**

Note the top row: if he runs 1:40, Garmin's 43:29 10K prediction becomes roughly correct — because at that level his fitness has caught up to the prediction, not because the prediction was ever right for the athlete who ran 1:46:35 in July.

## weekByWeek

**Numbering note, from the code rather than the brief.** `config/training.ts` already numbers the ratified block **week 1 = w/c 2026-09-07** (28 km, race taper). So the "six weeks of 60/80/100/80/60 then race week" are config **weeks 2–7**. The long-run ladder (22 / 27 / 33 / 16 / 18), `minRunDays`, `rampExemption` and the spike audit are already committed. **I am attaching prescriptions to that plan, not re-cutting it.** Verified: the ladder's spike percentages are 104% / 123% / 122% with the marathon at 128%, exactly as the config claims.

Session paces below use the July anchor. Everything repaces on 13 September.

---

**WEEK 2 — w/c Mon 14 Sep — 60 km — 6 run days — long run Sat 19 Sep, 22 km.** Opens two days after a maximal half. Days already laid out in config; I am adding one quality session inside the existing Wednesday.
| Day | Km | Session | Purpose |
|---|---|---|---|
| Mon 14 | 6 | Recovery, HR ≤138. Rest instead if the half left anything sore. | 48 h post-race |
| Tue 15 | 8 | Easy + 6×20 s strides | volume, neuromuscular |
| **Wed 16** | **10** | **QUALITY: 3 km wu + 5×4 min @ 4:52 (90 s jog float) + 2.5 km cd. 4.1 km at T.** | first threshold touch, deliberately small, 4 days post-race. **This session validates the 4:52.** |
| Thu 17 | 8 | Easy | |
| Fri 18 | 6 | Easy + strides | |
| **Sat 19** | **22** | **17 km easy + final 5 km @ MP 5:28, HR ceiling 170** | first MP-on-tired-legs. **Baseline for the primary adaptation measurement.** |
| Sun 20 | 0 | Rest or swim | |

**WEEK 3 — w/c Mon 21 Sep — 80 km — 6 run days — long run Sun 27 Sep, 27 km.** The last uninterrupted long run of the block.
| Day | Km | Session |
|---|---|---|
| Mon 21 | 0 | Rest + swim |
| Tue 22 | 12 | Easy + strides |
| **Wed 23** | **13** | **QUALITY: 3 km wu + 5×6 min @ 4:52 (90 s float) + 3 km cd. 6.2 km at T.** |
| Thu 24 | 10 | Recovery, HR ≤138 |
| Fri 25 | 12 | Easy + strides |
| Sat 26 | 6 | Easy shakeout |
| **Sun 27** | **27** | **19 km easy + final 8 km @ MP. Fuelling rehearsal at race rate.** |

**WEEK 4 — w/c Mon 28 Sep — 100 km — Lincoln Half Sun 4 Oct inside 33 km. ZERO threshold work.** Peak volume, peak long session, 20 days out. Six days, eight sessions (two doubles) — see open risks: `minRunDays: 7` collides with `minRestOrSwimOnlyDaysPerWeek: 1`.
| Day | Km | Session |
|---|---|---|
| Mon 28 | 0 | Rest + swim |
| Tue 29 | 16 | Easy, double (8 am + 8 pm) — `evening.maxKm` is 14 |
| Wed 30 | 12 | Easy + strides — **last strides before Sunday** |
| Thu 1 Oct | 21 | Easy, double (12 am + 9 pm) |
| Fri 2 | 12 | Easy |
| Sat 3 | 6 | Very easy shakeout |
| **Sun 4** | **33** | **LINCOLN — 8 km easy wu + 21.1 km @ MP 5:28 + 4 km easy cd. NOT RACED. HR ceiling 170; if HR exceeds 172 for two consecutive kilometres, slow to 5:45 and finish there.** |

**WEEK 5 — w/c Mon 5 Oct — 80 km — ASICS LDNX 10K Sun 11 Oct. ZERO threshold work** (the race spends the week's quality budget).
| Day | Km | Session |
|---|---|---|
| Mon 5 | 0 | Rest + swim — recovery from Lincoln |
| Tue 6 | 10 | Recovery |
| Wed 7 | 20 | Medium-long, all easy (double: 12 am + 8 pm) |
| Thu 8 | 14 | Easy |
| Fri 9 | 14 | Easy |
| Sat 10 | 6 | Easy + 4 strides |
| **Sun 11** | **16** | **LDNX 10K RACED — 3 km wu + 10 km flat out + 3 km cd. Expect 46:30–48:15. Do not chase 43:29.** |

**WEEK 6 — w/c Mon 12 Oct — 60 km — 5 run days — long run Sun 18 Oct, 18 km.** Protected taper.
| Day | Km | Session |
|---|---|---|
| Mon 12 | 0 | Rest + swim |
| Tue 13 | 10 | Recovery |
| **Wed 14** | **12** | **QUALITY: 3.5 km wu + 4×5 min @ 4:52 + 3.5 km cd. 4.1 km at T.** Taper sharpener — intensity kept, volume cut. |
| Thu 15 | 10 | Easy |
| Fri 16 | 10 | Easy + strides |
| Sat 17 | 0 | Rest |
| **Sun 18** | **18** | **10 km easy + 8 km @ final race pace, in race kit, full race-day fuelling. Last rehearsal.** |

**WEEK 7 — race week — w/c Mon 19 Oct — 32 km + marathon Sat 24 Oct.** One MP touch, four days out. Nothing hard after Tuesday.
| Day | Km | Session |
|---|---|---|
| Mon 19 | 0 | Rest / swim |
| Tue 20 | 10 | Easy incl. 3×1 km @ MP |
| Wed 21 | 8 | Easy + 6×20 s strides |
| Thu 22 | 8 | Very easy |
| Fri 23 | 6 | Very easy shakeout (optional — rest is equally correct) |
| **Sat 24** | **42.195** | **BATTERSEA PARK MARATHON.** First 5 km at MP+8 s/km. No kilometre in the first half faster than MP. |

---

**HOW MUCH QUALITY IS SAFE, AND WHY — the answer to the central tension.**

Block ledger, weeks 2–7 (412 km excluding the marathon), independently computed:
- **Easy: 342.5 km — 83.1%**
- **Marathon pace: 45.1 km — 10.9%**
- **Threshold or faster: 24.4 km — 5.9%** (of which 10 km is the raced 10K)
- By *time*: roughly 86% / 9.5% / 4.5%. Pyramidal.

**The design rule that resolves the tension: the threshold dose is fixed in absolute kilometres, not as a percentage.** 4.1 / 6.2 / 0 / 10 (race) / 4.1 / 0 km. Because it is absolute, its *share* falls automatically as volume climbs — and it is **zero in the 100 km week**. Volume risk and intensity risk therefore never peak together, which is the one combination for which the evidence offers no cover at all. This mirrors the only marathon-specific observation available at scale (Muniz-Pumares 2025: absolute Z2 and Z3 time is roughly constant across all performance levels; only Z1 scales with performance) — observational, confounded, and still the best thing there is.

Per-week threshold as a share: 6.8% / 7.7% / 0% / 12.5% (race) / 6.8% / 0%. All inside Daniels' 10% cap except the race week, which is a race.

**What is deliberately omitted, and it is an omission not an oversight:** no VO2max intervals, no repetition sessions, no third quality session. His VDOT spread — roughly 45 from 5 km against 39 from the marathon — says top-end speed is the quality he already has most of. Six weeks is at the short end for VO2max adaptation and it is the wrong currency for a marathon. The 11 October 10K supplies the entire supra-threshold dose and it is free, because he is racing it anyway. Adding the highest-strain-rate running to a ramp this steep is exactly the compounding this design exists to avoid. Rosenblat 2019 is the one piece of evidence pointing the other way (ES −0.66 favouring polarised over threshold) and it was weighed: three pooled trials, all PEDro 4–5/10, with 5–10 km outcomes.

**Two named, accepted deviations, surfaced rather than absorbed:** the 4 October session's 21.1 km at MP is 21.1% of a 100 km week against Daniels' 20% cap, and at 115 minutes exceeds his 110-minute cap. Both breaches follow from the athlete's ratified plan, and the 33 km day is already a documented 122% single-session-spike advisory in the config.

## configShape

All of this goes in `/Users/luisdeburnay/dev/rocket/config/training.ts`. It satisfies REDLINES rule 1 by construction: **no session ever stores a pace.** A prescription names a *zone*; `derivePaces()` turns zones into seconds-per-kilometre at render time from a single anchor. Re-anchoring after Saturday is one field change and the entire block repaces.

```ts
/**
 * Measured physiology. Not estimated, not modelled, not device-inferred.
 */
export const ATHLETE = {
  /** Peak HR in an activity file, 2026-06-14. OVERRIDES the Garmin profile
   *  value of 196 and Luis's own belief of 195. Every HR band derives from
   *  this; using 196 shifts every ceiling down ~2.5%. */
  hrMax: 201,

  /** Garmin auto-detect, 2026-08-08. = 88.1% of hrMax, where LT2 sits.
   *  CORROBORATED INDEPENDENTLY: he averaged 174 bpm for 106 minutes in the
   *  2026-07-19 half. Nobody averages above LT2 for 106 minutes, so true LTHR
   *  sits just above 174 — and 177 is there. Lu et al. 2025 (Front Physiol
   *  16:1621996) found smartwatch LT *heart rate* not significantly different
   *  from laboratory GXT. */
  lactateThresholdHr: 177,

  /** Garmin smoothed, 2026-09-07 (raw 50). Still drifting down from 84 in
   *  March, so a RISE could be regression toward a stable value rather than
   *  fatigue. Re-fit the baseline on the 14 days to 2026-09-13. */
  restingHrSmoothed: 57,

  /** DELIBERATELY ABSENT: Garmin's lactateThresholdPace of 4:20.9/km.
   *  It is 2 s/km SLOWER than his best 5.10 km race pace (4:19/km,
   *  2026-04-11) — Garmin asserts his 22-minute race pace is sustainable for
   *  an hour. Self-refuting on his own file. Lu et al. 2025: Garmin LT *pace*
   *  overestimated, MAPE 25.78%, p<0.01. The rule this encodes: trust device
   *  HR anchors, distrust device PACE anchors. Adding this field back is the
   *  single most likely way to injure him. */
} as const;

/**
 * The one race every pace in the block is derived from.
 * PROVISIONAL — replaced on 2026-09-13 by the Battersea Half.
 */
export const PACE_ANCHOR = {
  source: 'race' as const,
  date: '2026-07-19',
  distanceKm: 21.14,
  timeSec: 6395,
  /** Riegel exponent used ONLY to normalise to a standard distance.
   *  1.109, from his 2026-04-11 5.10 km against this half. */
  normalisationExponent: 1.109,
  normalisedDistanceKm: 21.0975,
  /** = 302.4 s/km. Everything below multiplies this. */
  normalisedPaceSecPerKm: 302.4,
  reanchorOn: '2026-09-12',
  /** Fall back to this anchor if Battersea is not raced flat out, is slower
   *  than 1:54, or the file shows >2 min stopped. NEVER anchor on the
   *  2026-07-26 run (17:27 stopped across 22 laps) or the 2026-04-25 5.04 km
   *  (25 s/km outlier, with LOWER mean and max HR than the slower 4:19 run). */
  excludedEfforts: ['2026-07-26', '2026-04-25'],
} as const;

/**
 * Zone paces as multipliers of PACE_ANCHOR.normalisedPaceSecPerKm.
 * Multipliers rather than paces so re-anchoring is one field, not 40 sessions.
 */
export const PACE_MULTIPLIERS = {
  recovery:  [1.36, 1.45],  // 6:51-7:19 on the July anchor
  easy:      [1.24, 1.36],  // 6:15-6:52. ADVISORY — the HR ceiling governs.
  /** ×1.085 = 5:28/km. Corresponds to Riegel k = 1.118, the midpoint of his
   *  MEASURED half->marathon exponent (1.1315) and the block's durability
   *  target (1.10). Deliberately does not assume an adaptation not yet
   *  measured. Race pace is set from the 2026-10-04 evidence, inside
   *  [×1.0718 (k=1.10, 5:24) .. ×1.0954 (k=1.131, 5:31)]. */
  marathon:  1.085,
  /** ×0.965 = 4:52/km. Three converging derivations: Daniels VDOT 42.0 from
   *  the anchor half -> 4:54; Riegel to a 3600 s effort -> 4:46-4:53;
   *  half-pace-minus-11 s convention -> 4:52. All formulas, none validated on
   *  him — the 2026-09-16 session is the first real test. */
  threshold: 0.965,
  thresholdBandSecPerKm: 4,
} as const;

/** HR bands. Do NOT re-derive on the Battersea result — these are measured. */
export const HR_ZONES = {
  recoveryCeiling: 138,
  /** 74.6% of hrMax. The most load-bearing number in the block: easy runs
   *  drifting to 5:45/km is the specific, likely, invisible failure mode of a
   *  24 -> 100 km ramp. ~75% is convention, not a trial finding. */
  easyCeiling: 150,
  marathonTarget: [158, 168],
  marathonCeiling: 170,
  /** MEAN of the work intervals, not an instantaneous ceiling. An
   *  instantaneous 177 aborts any correctly-paced threshold session by rep 3. */
  thresholdWorkMean: [172, 177],
  /** Above this on the work-interval mean, the PACE column is too fast:
   *  drop 5 s/km and re-anchor down. This is the self-correcting loop. */
  thresholdPaceTooFastAbove: 180,
} as const;

/** Riegel exponents. The block's whole thesis is moving the first one. */
export const RIEGEL = {
  population: 1.06,                 // Riegel 1981. NOT re-verified this session.
  /** From his own normalised 2026-07-19 half and 2026-05-10 marathon. n=2, no
   *  error bars, and a single marathon in which a fuelling or pacing failure is
   *  indistinguishable from poor durability. */
  athleteHalfToMarathon: 1.1315,
  /** Garmin's own 2026-09-07 predictions imply 1.1354 — 0.004 from his
   *  measured value. Garmin's DECAY is right for him; only its LEVEL is wrong. */
  garminImplied: 1.1354,
  prescriptionTarget: 1.118,        // the midpoint used by PACE_MULTIPLIERS.marathon
  /** What a successful block looks like. REASONED TARGET, NOT EVIDENCE: no
   *  trial establishes that the personal fatigue exponent moves in six weeks. */
  durabilityGoal: 1.10,
} as const;

/**
 * Device prediction bias. NOT the 1.118 scalar in the brief — that does not
 * reproduce from any combination of his efforts.
 */
export const DEVICE_CALIBRATION = {
  /** actual / predicted, distances normalised: half 1.081, marathon 1.078.
   *  n=2, both at or above half distance. */
  levelFactorAtOrAboveHalf: 1.083,
  n: 2,
  /** No usable estimate below 10 km: his two 5 km efforts disagree by 25 s/km. */
  levelFactorBelowHalf: null,
  /** Applying levelFactorAtOrAboveHalf to Garmin's marathon prediction gives
   *  3:54:09; deriving independently from his half via athleteHalfToMarathon
   *  gives 3:53:02. Two unrelated routes, 67 seconds apart. That is the
   *  closest thing to corroboration available, and it means Saturday's half
   *  repairs Garmin's marathon number in one step.
   *  For the record: the marathon miss was 19:42 (16:47 normalised), not the
   *  27 minutes reported. */
  decayTermIndependentlyConfirmed: true,
  /** Display only. Never prescribe from a two-point fit. */
  useForPrescription: false,
} as const;

/** Intensity budget. Absolute km, not percentages — see the block ledger. */
export const INTENSITY_CAPS = {
  thresholdKmPctOfWeek: 10,          // Daniels. Coaching judgement, no dose-response.
  marathonPaceKmPctOfWeek: 20,
  marathonPaceMaxMinutes: 110,
  /** The rule that stops volume risk and intensity risk peaking together.
   *  Fixed in km, so the SHARE falls as the week grows. */
  thresholdKmAbsoluteMax: 7,
  /** Weeks where threshold work is zero regardless of budget. w/c 28 Sep is
   *  peak volume AND peak long session; w/c 5 Oct's quality IS the raced 10K. */
  zeroThresholdWeekMondays: ['2026-09-28', '2026-10-05'],
} as const;
```

**`PlannedSession` changes** — `src/domain/planner/types.ts`:

```ts
export type PaceZone =
  'recovery' | 'easy' | 'marathon' | 'threshold' | 'stride' | 'race';

export type Segment = {
  readonly zone: PaceZone;
  /** Exactly one of km or minutes. Threshold reps and strides are timed. */
  readonly km?: number;
  readonly minutes?: number;
  readonly reps?: number;
  readonly recoveryMin?: number;
};

export type Prescription = {
  readonly segments: readonly Segment[];
  /** bpm. THE BINDING ANCHOR: when HR and the derived pace disagree in a
   *  session, the HR wins and the pace column is wrong. */
  readonly hrCeiling: number | null;
  /** One sentence for the athlete, not the log. */
  readonly purpose: string;
};

export type PlannedSession = {
  readonly date: string;
  readonly km: number;
  readonly kind: SessionKind;
  readonly slot: string | null;
  readonly note?: string;
  /** Absent on rest and swim. NO PACE IS STORED HERE — resolve at render time
   *  via derivePaces(PACE_ANCHOR, PACE_MULTIPLIERS). */
  readonly prescription?: Prescription;
};
```

Plus one pure function, `derivePaces(anchor, multipliers): Record<PaceZone, [number, number]>`, in `src/domain/planner/paces.ts`. It is the only place a pace number exists.

**What a test would assert** (`config/training.test.ts`, extending the existing 699-line suite):

1. `derivePaces()` on the July anchor returns threshold 292 ±1 s/km, marathon 328 ±1, easy `[375, 411]`. Pins the arithmetic against silent drift.
2. **Re-anchoring to a 1:44 half changes every session's rendered pace and no session's date, km, kind or slot.** Snapshot the whole block before and after. This is the test that proves the one-line update works.
3. **No prescription segment resolves to a pace faster than threshold unless `kind === 'race'`.** This is the test that would refuse any session derived from Garmin's 4:20.9/km.
4. `ATHLETE` has no `lactateThresholdPace` key (type-level), plus a runtime assertion that the value `260.9` and the string `4:20.9` appear nowhere in the config module.
5. For every week in `BLOCK_WEEKS`: summed threshold-or-faster prescribed km ≤ `INTENSITY_CAPS.thresholdKmPctOfWeek` × `targetKm`, and ≤ `thresholdKmAbsoluteMax`. **Fails the moment anyone adds a session.**
6. Weeks in `zeroThresholdWeekMondays` carry zero prescribed threshold km outside a race.
7. `qualitySessionCount()` ≤ `GUARDRAILS.maxQualitySessionsPerWeekBuild` for every build week *once prescriptions are attached* — the regression that catches the "two quality days in race week" class of error.
8. Every marathon segment's `hrCeiling` ≤ `HR_ZONES.marathonCeiling`; every easy segment's ≤ `HR_ZONES.easyCeiling`.
9. **`singleSessionSpikes()` over the fully-prescribed block returns exactly the three already-ratified advisories (27 Sep 123%, 4 Oct 122%, race day 128%) and no others** — so adding a prescription layer can never silently change a session's distance.

## validationPlan

Every measurement below runs on data rocket already ingests. Nothing needs a lab. Each names a threshold, a timescale, and what it does when it fires.

**1. RE-ANCHOR — Sun 13 Sep, one config field.** Set `PACE_ANCHOR` from the Battersea result and every pace in the block moves. If the race is not run flat out, is slower than 1:54, or shows more than two minutes of stoppage, keep the July anchor and record why.

**2. THRESHOLD-PACE VALIDATION — Wed 16 Sep, day 3 of the block.** The cheapest falsification test available, and it happens on day 3. Record the **mean HR of the work intervals** at 4:52/km. Expect 172–177. Above 180 → the pace column is too fast: drop 5 s/km, re-anchor down, re-test in week 3. Below 168 → conservative, but hold it until week 4; his TSB of +24.7 flatters the first session of any block.

**3. PRIMARY ADAPTATION SIGNAL — marathon-pace heart rate at fixed pace.** Measured on the MP segment of the long run: **Sat 19 Sep (5 km, baseline) → Sun 27 Sep (8 km) → Sun 18 Oct (8 km)**. Compare the *last 5 km of the MP block* at identical prescribed pace, temperature within 5 °C, same route class.
- **Working:** −4 to −8 bpm from 19 Sep to 18 Oct.
- **Neutral:** flat. Acceptable during a ramp this steep; accumulated fatigue commonly holds HR level while genuine adaptation is occurring.
- **Failing:** +4 bpm or more sustained. The ramp is outrunning recovery.
- **Noise floor, stated so it is not read past:** submaximal HR standard error of measurement is roughly 1.5–2 bpm, so anything under 4 bpm is not a reading.

**4. THE PRIMARY INSTRUMENT — Lincoln, Sun 4 Oct.** Twenty-one kilometres at marathon pace, finishing at 29 km cumulative, past the ~25 km point where decoupling typically begins. This is a measurement disguised as a workout, and it sets race pace. Split the MP block into thirds and compute pace-per-heartbeat drift, first third to last.
- **PASS** — 5:28 ±3 s/km held throughout, mean HR ≤ 168, drift < 5% → durability moved. Race pace **5:24/km, marathon 3:48**.
- **MARGINAL** — pace held, mean HR 168–172, drift 5–8% → race pace **5:28/km, marathon 3:51**.
- **FAIL** — pace not held, or mean HR > 172, or drift > 8% → race pace is **the pace he actually held at ≤168 bpm**, floor 5:31–5:40, marathon 3:53–3:59.
- **Honest flags.** The 5% figure is coaching convention, not a validated cut-point. And a 21 km MP block has no distance-matched baseline earlier in the block, so the within-block comparison is confounded by duration. **Fix this before the block starts:** compute the same drift on his 10 May marathon file (km 5–10 versus km 35–40, the Smyth 2022 method). That is a genuinely distance-matched pre-block durability number and it costs nothing but a query against data already held.

**5. THE OVERREACHING TEST — ASICS 10K, Sun 11 Oct.** Performance decrement is the *definitional* criterion separating functional from non-functional overreaching (ECSS/ACSM consensus, Meeusen 2013) — not HRV, not soreness. Predicted from the 12 September half: **46:30–48:15**.
- Within 2% of prediction or faster → the block is being absorbed.
- 2–4% slower **and** any readiness channel tripped → race week becomes genuine recovery; marathon pace holds at the conservative end.
- More than 4% slower → non-functional overreaching. Cut the marathon target by the same percentage and taper harder. Thirteen days is just enough to turn this into a salvage rather than a bad day.

**6. DAILY READINESS — 7-day means, concordance required.** Single-day resting HR and HRV correlate weakly with adaptation (r = .35, −.21); the 7-day means correlate strongly (r = −.62). Never gate a session on one morning.
- **Resting HR:** 7-day mean ≥ **59** (baseline 57 + 3%, the effect size that separated overreached from responding recreational runners in Nuuttila 2024). **Not 60** — rounding a safety trip-wire up by 1.3 bpm on a 3 bpm effect roughly doubles the excursion needed to fire it.
- **HRV: INERT, and say so in the UI.** rocket's own `READINESS` docstring records `hrv_day`, `hrv_range_7d` and `sleep_daily_7d` empty across a seven-day probe — the watch is not worn asleep. Do not build a gate on a channel with no data.
- **Subjective:** soreness ≥ 3 (rocket's existing `sorenessBlocksQuality`) or motivation in his worst personal tertile on 5 of 7 days.
- **Action:** two available channels tripped for 7 consecutive days → next week's volume −25% and its quality deleted. **Intensity is cut before volume** — the volume ramp is the ratified experiment; the intensity plan is the buffer around it, so the buffer is spent first.

**7. THE MUSCULOSKELETAL CHANNEL — currently missing, and injury is the overwhelmingly likeliest way this block ends.** Nothing in rocket's readiness model detects a developing bone stress injury; `check_ins.soreness` carries a location and severity but nothing keys off site persistence. Add a daily pain-by-site item. **Any pain that alters gait, any focal bony tenderness (shin, metatarsal, femoral neck, sacrum), or pain not back to baseline the following morning** → all threshold and marathon-pace work to zero, long run capped at the previous week's distance, swim substituted. **This overrides every other rule in the design, including the ratified weekly kilometres.**

**8. COMPLIANCE — weekly, from HR streams.** Bin realised km: Z1 ≤ 150, Z2 151–171, Z3 ≥ 172.
- Gate A: Z3 ≤ 7 km in any week except w/c 5 Oct (the raced 10K).
- Gate B: Z1 ≥ 80% of weekly km, every week.
- Gate C, the one most likely to fire: unintentional Z2 accumulation from easy runs creeping to 5:45/km. It looks like enthusiasm and behaves like overtraining, and it is invisible unless measured.
- Also: **delivered** versus planned km. A week hit only by truncating easy runs is a failed week even when the total lands. And CTL/ATL must be computed from actual sessions only — a chronic load part-built from planned-but-not-run sessions is a fiction that reads as fitness.

---

**THE REVERSAL TRIGGER.** The condition is already ratified but lives as prose in `BLOCK_WEEKS[4].note`, and the config's own comment says it best: *"A gate expressed as a paragraph in a note is a gate nobody applies."* Structure it as a second entry in `CHECK_IN_GATES`, `afterWeekMonday: '2026-09-21'`, deciding whether w/c 28 September runs at 100 km or reverts to the 50 km ladder. Judged **Sunday 27 September on delivered data, not on enthusiasm.** Any one criterion fires the reversal:

- (a) Weeks of 14 and 21 Sep delivered under 85% of 140 km — i.e. under **119 km**. *(config's own "missing target by more than 15%")*
- (b) Resting HR more than 5 bpm above its trailing 7-day mean for 3 consecutive days. *(config's own wording)*
- (c) Two LOW readiness days in one week. *(config's own wording)*
- (d) Soreness at severity 3 or above at any point. *(rocket's existing `sorenessBlocksQuality`)*
- (e) **NEW** — mean HR on the 27 Sep MP block 5 bpm or more above the 19 Sep MP block, at matched pace and conditions.
- (f) **NEW** — any criterion in (7) above.

**WHAT WOULD FALSIFY THE WHOLE DESIGN, stated now so it cannot be rationalised later.** If on 4 October he covers 21.1 km at 5:28/km with mean HR at or above 172 and drift above 8%, then six weeks of unprecedented volume did not buy durability, the ramp cost more than it returned, and the correct response is to abandon the 3:48 ambition and race 3:55–4:00 with a longer taper. Conversely, if compliance is clean, the zone split holds, readiness stays in band, and he still breaks down — then the volume ramp itself was the cause and the intensity rationing was never the operative variable. Both conclusions are readable from files rocket already receives, which is the point.

## evidenceGrades

[
 {
  "decision": "Use HRmax 201 (measured 2026-06-14) for every HR band, overriding Garmin's profile value of 196 and the athlete's belief of 195",
  "grade": "strong-evidence",
  "source": "Direct measurement from his own activity file. Not modelled, not device-inferred. Everything HR-derived in this design rests on it; using 196 shifts every ceiling down ~2.5%."
 },
 {
  "decision": "Discard Garmin's lactate-threshold PACE of 4:20.9/km",
  "grade": "strong-evidence",
  "source": "Self-refuting on his own file: it is 2 s/km SLOWER than his best 5.10 km race pace (4:19/km, 2026-04-11), i.e. Garmin asserts his 22-minute race pace is sustainable for an hour. Independently supported by Lu et al. 2025, Front Physiol 16:1621996 (n=23 for Garmin): LT pace overestimated, MAPE 25.78%, p<0.01."
 },
 {
  "decision": "Keep Garmin's lactate-threshold HEART RATE of 177 as the threshold anchor",
  "grade": "moderate-evidence",
  "source": "Device auto-detect (2026-08-08) corroborated by his own race: 174 bpm mean for 106 minutes in the 2026-07-19 half, so true LTHR sits just above 174. 177 = 88.1% of measured HRmax. Lu et al. 2025 found smartwatch LT heart rate not significantly different from lab GXT (MAE 11.4 bpm) while LT pace was significantly overestimated \u2014 the split this design encodes."
 },
 {
  "decision": "Reject the acute:chronic workload ratio as any kind of gate",
  "grade": "strong-evidence",
  "source": "Lolli et al., BJSM 2019 (mathematical coupling produces spurious correlation by construction); Impellizzeri et al., IJSPP 2020;15(6):907-913 (no coherent causal interpretation); Frandsen et al., BJSM 2025;59(17):1203-1210 \u2014 in 5,205 runners the LARGEST ACWR spikes were associated with FEWER injuries (HRR 0.75, 95% CI 0.59-0.96). rocket's config already refuses it and is right."
 },
 {
  "decision": "Reject Garmin's 3:36:12 marathon prediction as a goal pace",
  "grade": "strong-evidence",
  "source": "Vickers & Vertosick 2016, BMC Sports Sci Med Rehabil 8:26 \u2014 2,303 recreational runners, the best population match available: fixed-exponent distance-equivalence models are well calibrated to the half then underestimate marathon time by at least 10 minutes for half of recreational runners. Confirmed on his own data: his measured half-to-marathon exponent is 1.1315 against a population 1.06."
 },
 {
  "decision": "Garmin's LEVEL error is 1.083 at half and marathon distance, and its DECAY term is correct",
  "grade": "moderate-evidence",
  "source": "n=2 realised efforts, both landing within 0.5% of each other after normalising to standard distances (half 1.081, marathon 1.078). Garmin's implied half-to-marathon exponent (1.1354) sits 0.004 from his measured 1.1315. Two unrelated routes to his marathon time \u2014 Garmin x level factor (3:54:09) and his own exponent (3:53:02) \u2014 agree to 67 seconds. NOTE: the 1.118 factor in the brief does not reproduce from any combination of his efforts, and the marathon miss was 19:42, not 27 minutes."
 },
 {
  "decision": "Threshold pace 4:52/km (half pace x 0.965)",
  "grade": "moderate-evidence",
  "source": "Three independent derivations converging inside 5 s/km: Daniels VDOT 42.0 from the anchor half -> 4:54; Riegel extrapolation to a 3600 s effort using his own short-side exponent -> 4:46-4:53; half-pace-minus-11 s practitioner convention -> 4:52. HR-consistent (he raced the half at 174 bpm, 3 below LTHR). The only direct empirical support for VDOT-derived T pace is Scudamore et al. 2018 \u2014 an UNDERPOWERED NULL at n=9 recreational runners (d=0.57), which is absence of evidence, not equivalence."
 },
 {
  "decision": "Marathon pace 5:28/km, race band 5:24-5:31, marathon target 3:48-3:53",
  "grade": "moderate-evidence",
  "source": "Bracketed by his own two performances rather than by a formula: the floor (5:31, 3:53:02) reproduces his realised 10 May marathon from his own measured exponent; the target (5:24, 3:48:01) assumes the exponent moves to 1.10. Reconciles with rocket's existing PACE_ESTIMATES.planningBandSeconds (3:50-4:00). n=1 marathon, so weather, fuelling and pacing on 10 May are indistinguishable from poor durability in that data point."
 },
 {
  "decision": "Pyramidal distribution \u2014 83% easy / 11% marathon-pace / 6% threshold-or-above by distance",
  "grade": "expert-practice",
  "source": "Deliberately NOT graded as evidence. Festa et al. 2019 (n=38 recreational runners, VO2max 53.2 vs his 53.0 \u2014 the closest population match in the literature) is a clean NULL between polarised 77/3/20 and threshold-heavy 40/50/10. Rosenblat 2019 favours polarised over threshold (ES -0.66) but pools three trials all scoring PEDro 4-5/10, on 5-10 km outcomes. Muniz-Pumares 2025 points the other way but is observational. Foster and Burnley argue opposite conclusions in the same 2022 MSSE issue. This is a risk decision, not an optimisation, and rocket's UI must never call it optimal."
 },
 {
  "decision": "Fix the threshold dose in absolute kilometres (4-6 km/week) rather than as a percentage of the week",
  "grade": "reasoned-guess",
  "source": "The rule is a design invention. Its underlying observation is moderate: Muniz-Pumares et al. 2025 (119,452 marathoners) found absolute Z2 and Z3 time roughly constant across all performance levels, with only Z1 scaling. Observational and confounded by ability. What the rule buys is that volume risk and intensity risk cannot peak together \u2014 which is the one combination for which no evidence offers cover."
 },
 {
  "decision": "Zero threshold work in the 100 km peak week (w/c 28 Sep)",
  "grade": "expert-practice",
  "source": "No trial. The reasoning is that the week already contains peak volume, the longest session of the block, and a 21 km marathon-pace block \u2014 three novel stressors, and adding a fourth is the specific compounding this design exists to avoid."
 },
 {
  "decision": "No VO2max intervals or repetition sessions anywhere in the block",
  "grade": "expert-practice",
  "source": "Reasoned from his own numbers: VDOT ~45 from 5 km against ~39 from the marathon says speed is the quality he already has most of. Six weeks is at the short end for VO2max adaptation and it is the wrong currency for a marathon. The 11 Oct 10K supplies the supra-threshold dose free. Rosenblat 2019 (ES -0.66 favouring polarised) is the one piece of evidence pointing the other way and was weighed, not ignored."
 },
 {
  "decision": "Daniels' per-workout caps: threshold <=10% of weekly km, marathon-pace <=20% or 110 min, long run <=25-30% or 2.5 h",
  "grade": "expert-practice",
  "source": "Daniels' Running Formula 3rd ed. One coach's judgement codified. There is no published dose-response data behind any of these numbers. They are used here because they are internally consistent and auditable, and because two of them are knowingly breached at Lincoln (21.1% of week, 115 min) and that breach is surfaced rather than absorbed."
 },
 {
  "decision": "The 110% single-session spike cap already in rocket's GUARDRAILS",
  "grade": "moderate-evidence",
  "source": "Frandsen et al., BJSM 2025;59(17):1203-1210 \u2014 5,205 runners, 588,071 sessions: a session exceeding 110% of the trailing-30-day longest run raised overuse-injury rate (HRR 1.64 / 1.52 / 2.28). Observational, and the hazard ratios are NON-MONOTONIC, so only the binary over-or-under carries signal. Also confounded by session type: the reference state contains every short recovery run, and the spike states are by construction the long runs. rocket's config already documents both caveats correctly."
 },
 {
  "decision": "The 15%/35% weekly ramp cap, and the whole framing of ramp-rate risk",
  "grade": "reasoned-guess",
  "source": "The nearest evidence is Nielsen et al., JOSPT 2014;44(10):739-747, and it is NOT SIGNIFICANT: the distance-related-injury association is HR 1.59, 95% CI 0.96-2.66, p=.07, in a study whose PRIMARY outcome was null, in 874 NOVICE runners. Buist et al., AJSM 2008 (GRONORUN RCT, n=532) found the 10% rule prevented nothing (20.8% vs 20.3%). No trial has tested a ramp of this magnitude in anyone. The evidence is absent in both directions \u2014 he is not defying it, and it is not protecting him."
 },
 {
  "decision": "Six weeks of volume will move his personal fatigue exponent from 1.131 toward 1.10 \u2014 the block's entire thesis",
  "grade": "reasoned-guess",
  "source": "No trial establishes that durability is trainable on this timescale. Jones & Kirby 2025 (Scand J Med Sci Sports 35:e70032) proposes the mechanism and explicitly states the physiological underpinnings remain elusive and the data are scant. It is a bet with a measurement attached (the 4 October session), which is the honest description."
 },
 {
  "decision": "Marathon-pace blocks placed at the END of long runs, on already-fatigued legs",
  "grade": "expert-practice",
  "source": "Near-universal coaching practice (Daniels, Pfitzinger, Hansons, Canova). Jones & Kirby 2025 gives the mechanism-level recommendation \u2014 prolonged sessions containing bouts at race pace \u2014 and is a narrative review, not trial evidence that MP-in-long-run beats an easy long run."
 },
 {
  "decision": "Running Lincoln at marathon pace rather than racing it",
  "grade": "expert-practice",
  "source": "No trial. Enforced by an HR ceiling of 170 with a 172-for-two-kilometres abort, because a heart-rate number is checkable in the file afterwards and 'don't race it' is not enforceable on a start line. Already the role the config's own RACES entry assigns it."
 },
 {
  "decision": "Easy running governed by an HR ceiling of 150 (74.6% HRmax) with pace as the output, not the prescription",
  "grade": "expert-practice",
  "source": "The ~75%-of-HRmax easy convention. No trial sets it. Reasoned as the single most load-bearing number in the plan: on a 24 -> 100 km ramp, easy runs drifting to 5:45/km is the specific, likely and invisible failure mode, and a pace band invites exactly that drift while an HR cap forbids it."
 },
 {
  "decision": "Strides, 6 x 20 s, twice a week",
  "grade": "reasoned-guess",
  "source": "The tendon load-magnitude mechanism (Bohm, Mersmann & Arampatzis 2015, Sports Med Open 1:7) was established in resistance-type interventions of 8 weeks or more, not in 20-second running strides. Included because the cost is about two minutes a week and the mechanism is coherent \u2014 not because anything shows it prevents injury during a volume ramp."
 },
 {
  "decision": "Add 2 x 20 min heavy-slow strength work (calf, soleus, single-leg), starting light NOW rather than in week 2",
  "grade": "strong-evidence",
  "source": "Lauersen, Andersen & Andersen, BJSM 2018;52(24):1557-1563: strength training reduced sports injuries to roughly one third (RR 0.338, 95% CI 0.238-0.480) with a dose-response and no evidence of harm. The strongest injury-prevention finding available, from 6 RCTs / 7,738 participants / 177 injuries, and NOT running-specific. The timing inside this ramp is a reasoned-guess: starting a novel eccentric calf stimulus in the same week as a +72% volume step is itself compounding, which is why it starts before the block."
 },
 {
  "decision": "Seven-day rolling means for resting HR and HRV, never a single morning; and two-channel concordance before acting",
  "grade": "moderate-evidence",
  "source": "Plews et al., IJSPP 2013;8(6):688-691 \u2014 single-day resting HR correlated with adaptation at r = .35 and 10 km performance at r = -.21, while the 7-day means reached r = -.62. n=10, very small. Saw, Main & Gastin, BJSM 2016 (56 studies) found subjective measures more sensitive than objective ones. Concordance is required because Plews' own 2013 Sports Med review documents HRV direction inverting its usual meaning."
 },
 {
  "decision": "Resting-HR trip-wire at a 7-day mean of 59 bpm, not 60",
  "grade": "moderate-evidence",
  "source": "Nuuttila et al., Eur J Sport Sci 2024;24(7):857-869 \u2014 24 recreational runners through a deliberate overload: nocturnal HR rose 3.2 +/- 3.1% in the overreached and fell 2.8 +/- 3.7% in responders (p=0.002). 57 x 1.03 = 58.7. Rounding a safety trip-wire up to 60 doubles the excursion needed to fire it on a 3 bpm effect. Small n, and subgroups were defined post hoc by outcome, so the predictive values are optimistic."
 },
 {
  "decision": "Use the 11 Oct 10K performance, not HRV or soreness, as the definitive overreaching test",
  "grade": "expert-practice",
  "source": "Meeusen et al. 2013, the joint ECSS/ACSM consensus statement (MSSE 45(1):186-205): performance decrement is the DEFINITIONAL criterion separating functional from non-functional overreaching. A consensus statement, not a trial."
 },
 {
  "decision": "Add a musculoskeletal pain-by-site channel with a hard stop, overriding the ratified weekly kilometres",
  "grade": "moderate-evidence",
  "source": "The continue-training-under-a-pain-cap rule is Silbernagel et al., AJSM 2007;35(6):897-906 \u2014 an RCT, but n=38 Achilles tendinopathy patients with a NULL between-group result, generalised well beyond that population by clinical convention rather than by trial. Included because injury is the overwhelmingly likeliest way this block ends and rocket's readiness model currently cannot see it at all."
 },
 {
  "decision": "Ignore Garmin VO2max (53.0) and Endurance Score as in-block progress markers",
  "grade": "moderate-evidence",
  "source": "Engel et al., Eur J Appl Physiol 2026;126:591-603: smartwatch VO2max MAPE 2.8-4.1% in moderately trained athletes, mean underestimate 4.73 ml/kg/min \u2014 against a plausible true six-week change of 1-3%. Stronger still is his own data: 53.0 held flat through a five-week training dip, so it demonstrably does not respond. No peer-reviewed validation of Garmin Endurance Score could be found at all."
 },
 {
  "decision": "The Lincoln aerobic-decoupling pass/fail thresholds (5% and 8%)",
  "grade": "reasoned-guess",
  "source": "The 5% figure is TrainingPeaks/Friel coaching convention, not a validated cut-point. The reference distribution (Smyth et al., Sports Med 2022;52(9):2283-2295, 82,303 marathoners: mean decoupling 1.16 +/- 0.22, onset 25.2 +/- 9.9 km) is real and population-matched, but was measured on a fixed 35-40 km versus 5-10 km window in a full marathon, not on thirds of a 21 km training block. The distance-matched baseline that would fix this is his own 10 May marathon file, which rocket can compute before the block starts."
 }
]

## disagreements

[
 "LONG RUN \u2014 Daniels/Pfitzinger (progressive, up to 2.5 h) versus Hansons (hard cap at 16 miles / ~26 km, on cumulative fatigue). CHOSE: neither, because rocket already resolved it. The committed ladder is 22 / 27 / 33 / 16 / 18 with the 33 km Lincoln day audited at 122% of its trailing-30-day baseline and named as an advisory spike. Verified independently: 104% / 123% / 122% / 128% (race day), exactly as the config claims. WHY: the brief's \"27-29 km ceiling\" would have re-cut a ladder that is already spike-audited and ratified, and there is no trial evidence for a minimum OR a maximum long-run distance for the marathon \u2014 none, in any tradition. Code owns truth here; the ladder stands.",
 "INTENSITY DISTRIBUTION \u2014 Seiler/polarised (hard work at the extremes, vacate the middle) versus pyramidal/threshold-weighted. CHOSE: pyramidal, ~83/11/6 by distance. WHY, and the honesty matters more than the choice: the evidence does NOT settle this. Rosenblat 2019 favours polarised over threshold (ES -0.66) on three PEDro-4/5 trials with 5-10 km outcomes; Muniz-Pumares 2025 (119,452 marathoners) points the other way but is observational; Festa 2019, the closest population match that exists (n=38, VO2max 53.2 against his 53.0), is a clean NULL between the two. Foster and Burnley argue opposite conclusions in the same 2022 MSSE issue. The choice is made on RISK \u2014 a 24 -> 100 km ramp cannot afford the mechanical load of the polarised arm \u2014 not on performance evidence, and it must be labelled that way in the UI.",
 "THRESHOLD PACE \u2014 Garmin (4:20.9/km) versus every derivation from his own races (4:46-4:54/km). CHOSE: 4:52/km, discarding the device. WHY: Garmin's number is 2 s/km SLOWER than his best 5.10 km race pace, which is self-refuting. The gap is 31 s/km, not the ~60 s/km one research strand claimed \u2014 an arithmetic error in the brief's own record that would have overstated the correction. The device's HEART RATE anchor (177) is kept because his own race file corroborates it.",
 "THE GARMIN CORRECTION FACTOR \u2014 the brief's 1.118 scalar versus a distance-banded factor. CHOSE: 1.083, applied only at half distance and above, display-only, never used to prescribe. WHY: 1.118 does not reproduce from any combination of his efforts. Normalised to standard distances the ratios are 1.081 (half) and 1.078 (marathon); the 5 km band has no usable estimate because his two 5 km efforts disagree by 25 s/km. And the deeper finding overturns the brief's framing entirely: Garmin's DECAY term is right for him (implied exponent 1.1354 against his measured 1.1315) \u2014 the entire error is in the LEVEL, which Saturday's half repairs in one step.",
 "MARATHON PACE \u2014 VDOT/Daniels (3:38 from a 1:46 half) and Garmin (3:36:12) versus his own measured fatigue exponent (3:53). CHOSE: the durability-corrected figure, 5:28/km in training with a race band of 5:24-5:31. WHY: VDOT and Garmin agree because they share the same population fatigue curve, so their agreement is not corroboration \u2014 it is the same assumption counted twice. Vickers & Vertosick 2016 (n=2,303 recreational runners) shows that curve underestimates the marathon by 10+ minutes for half of this population, and his own exponent of 1.1315 against 1.06 makes him a severe case. I also rejected the research's k=1.164 (fitted from his 5 km to his marathon) as CIRCULAR \u2014 under that exponent his April 5 km predicts a 1:44 half, so recovering his May marathon pace from it is an algebraic identity, not a validation. The half-to-marathon pair (1.1315) is the one that matches the extrapolation actually being made.",
 "WHETHER TO ADD A SECOND QUALITY SESSION PER WEEK \u2014 Daniels' 2Q structure (threshold + long-with-MP as two distinct quality days) versus rocket's committed maxQualitySessionsPerWeekBuild = 1. CHOSE: rocket's rule, exploiting its own carve-out that marathon-pace segments INSIDE a long run do not count separately. The block therefore gets exactly three dedicated threshold sessions (weeks of 14 Sep, 21 Sep, 12 Oct) plus two races, and every long run still carries marathon-pace work. WHY: this satisfies both traditions without an override, and the config's docstring already argues the case at length against a second interval session on a ramp this steep.",
 "RESTING-HR TRIP-WIRE \u2014 60 bpm (as several strands proposed) versus 59. CHOSE: 59. WHY: 57 x 1.03 = 58.7. Rounding a safety trip-wire upward by 1.3 bpm on a 3 bpm effect roughly doubles the excursion required to fire it, on the one block where the athlete has ratified risk against contrary evidence.",
 "HRV GATING \u2014 build it (Vesterinen 2016 RCT) versus declare it inert. CHOSE: declare it inert and say so in the UI. WHY: rocket's own READINESS docstring records hrv_day, hrv_range_7d and sleep_daily_7d empty across a seven-day probe \u2014 the watch is not worn asleep. Building a gate on a channel with no data is worse than having no gate, because it reads as protection. Vesterinen 2016's between-group result was also a small non-significant difference (ES 0.42), and Manresa-Rocamora 2021 found HRV-guided training reliably raises HRV (SMD 0.50) with small non-significant effects on endurance performance.",
 "TAPER SHAPE \u2014 Mujika's maintain-intensity-cut-volume versus cutting both. CHOSE: maintain intensity, cut volume, but with one short threshold session in the week of 12 Oct rather than two. WHY: he arrives at the taper 12 days past the largest volume week of his life and one day past a raced 10K. Note that the brief's record misquotes Mujika & Padilla 2003 twice \u2014 the paper says reduce volume 'up to 60-90%' and reduce frequency slightly, 'no more than 20%', not the 41-60% volume cut with frequency maintained that was reported. The direction of the advice survives; the numbers cited for it do not.",
 "STRENGTH TRAINING \u2014 omitted by every research strand except two verifications, versus included. CHOSE: include it, 2 x 20 min, starting NOW (10 Sep) at light load rather than in week 2. WHY: Lauersen 2018 (RR 0.338) is the strongest injury-prevention finding in the whole evidence base and the plan contained none of it. But starting novel heavy eccentric calf work in the same week as a +72% volume step is itself the compounding this design forbids \u2014 so it starts in the free window before the ramp, not inside it."
]

## openRisks

[
 "THE ENTRY IS THE DANGER, NOT THE PEAK. The week of 14 Sep is 60 km beginning two days after an all-out half, from a four-week mean of 19.2 km \u2014 a +72% step on the pre-taper baseline, and the one step rocket's own aggressive 35% cap actually catches (already documented in BLOCK_WEEKS[2].rampExemption). Damsted 2019 found ramp-related injury risk concentrated in the first 21 days and gone by day 56 \u2014 the danger window is 14 Sep to 4 Oct and it closes just as the plan reaches its peak. If any week must be cut, cut this one before touching the 100.",
 "RUN FREQUENCY IS AN UNRATIFIED SECOND EXPERIMENT. His recorded maximum is 4 runs in any week. This block needs 6 running days from week two and 6 days with two doubles in the peak week. That is a 50-75% increase in session frequency stacked on a 3-4x increase in volume, and every injury citation in the record measures DISTANCE progression only. The volume was ratified in writing; the frequency was never discussed. It belongs in the 27 September reversal decision, and it should be put to him explicitly before the peak week.",
 "CONFIG BUG: week of 28 Sep sets minRunDays: 7 while GUARDRAILS.minRestOrSwimOnlyDaysPerWeek is 1. Those cannot both hold in a seven-day week. Either read minRunDays as running SESSIONS (which the week-4 plan above assumes \u2014 six days, eight sessions, two doubles) or drop it to 6. Nothing currently catches the contradiction.",
 "NO TRIAL HAS EVER TESTED A RAMP OF THIS MAGNITUDE, in anyone. Nielsen 2014 is non-significant (HR 1.59, CI 0.96-2.66, p=.07) on a subgroup, in novices, in a study with a null primary outcome; Buist 2008 (n=532 RCT) found the 10% rule prevented nothing. The evidence is genuinely absent in both directions. This design cannot make the ramp safe \u2014 it can only refuse to compound it, which is what the absolute threshold cap and the zero-quality peak week do.",
 "n=1 MARATHON. His fatigue exponent of 1.1315 rests on a single marathon in which a fuelling failure, a hot day or a pacing error is indistinguishable from poor durability. If 10 May was a fuelling failure rather than a physiological one, this design is over-conservative and 3:45 is available. The 4 October session is the only thing that can tell the difference before race day.",
 "THE THRESHOLD PACE IS UNVALIDATED ON HIM. 4:52/km rests on three converging formulas and nothing else. The Wednesday 16 September session is its first real test, and the design's correction loop (work-interval mean HR above 180 -> drop 5 s/km) is the only thing standing between a formula error and six weeks of mis-paced quality.",
 "NO FUELLING LAYER. Glycogen depletion is one of the two things that actually breaks at 32 km, and a 3:50 marathon sits in the duration band where carbohydrate intake above 60 g/h requires a glucose:fructose blend and a trained gut. Nothing in rocket prescribes or logs it, and the 4 October session is the only full dress rehearsal available. Separately, the recorded weight of 85.5 kg was typed once in March and is stale \u2014 it scales nothing in this design but would scale any carbohydrate-loading or caffeine prescription. Reweigh before adding one.",
 "HRV IS INERT AND THE UI MUST SAY SO. rocket's own READINESS docstring records hrv_day, hrv_range_7d and sleep_daily_7d empty across a seven-day probe. One of the three readiness channels does not exist, so 'two of three must agree' is really 'two of two'. A gate that reads as protection while measuring nothing is worse than no gate.",
 "THE MUSCULOSKELETAL CHANNEL DOES NOT EXIST YET. Resting HR and pace-at-HR cannot detect a developing tibial stress reaction, which is the likeliest way this block ends. The daily pain-by-site item in the validation plan is new work, not a configuration change, and it needs to exist before 14 September.",
 "TWO KNOWN DANIELS BREACHES AT LINCOLN, accepted rather than hidden: 21.1 km at marathon pace is 21.1% of a 100 km week (cap 20%) and 115 minutes (cap 110). Both follow from the athlete's ratified plan. They should be surfaced in rocket's output as accepted deviations, not silently absorbed \u2014 which is what GUARDRAILS already does for the 122% spike on the same day.",
 "THE MARATHON IS A 128% SINGLE-SESSION SPIKE over the longest run that can precede it, and no version of this block can avoid that. The rule is advisory for exactly this reason, and rocket's config already documents it. Worth stating to him plainly: race day is the one spike the design deliberately accepts, because a spike on 4 October has twenty days left in which to end the block and a spike on 24 October costs nothing after the finish line.",
 "PACE_ESTIMATES CARRIES A STALE GARMIN SNAPSHOT. The config holds the 2026-09-06 predictions (half 5892 s, marathon 12940 s) while the brief supplies 2026-09-07 values (5905, 12972). Trivial in magnitude, but DEVICE_CALIBRATION.levelFactorAtOrAboveHalf is computed against the newer pair, so the two must be reconciled in the same commit or the factor will not reproduce from the config's own numbers."
]
