# doubles-and-fuelling

**Scope boundary:** the two things that make the block physically runnable.
Covers: AM/PM session splitting so a 100 km week fits six days, and a fuelling
prescription attached to long runs with a gut-training progression. Explicitly
does NOT cover: hydration modelling, sweat-rate estimation, or anything
requiring a scale.

**References:** `config/training.ts` AVAILABILITY (`runSlots`, `evening.maxKm`);
`docs/research/training-evidence-quantified.json` -- fuelling ranked the single
largest intervention at 5-9 minutes, on Hansen 2014, a controlled trial in
non-elite marathoners running 3:38-3:49.

**Alternative rejected:** leaving week 4 as six single sessions. It does not fit
-- 100 km over six days is 16.7 km a day and the evening slot caps at 14 km, so
the week as generated is unrunnable rather than merely hard.

**Interface touched:** `Prescribed` gains a second session per day;
`prescribe.ts` gains the split rule and the fuelling attachment.

**Acceptance criteria:**

- No generated session exceeds its slot's `maxKm`.
- Week 4 places 100 km across six days without breaching a slot.
- Every run over 90 minutes carries a carbohydrate rate and a timing interval.
- Gut training starts in week 2 and progresses -- the adaptation takes about two
  weeks and the marathon is six away, so starting late wastes the intervention.
- A test asserts the fuelling rate reaches race rate before the last long run,
  not after it.

**Assumptions:**

- ~75 g/h is the target rate, from the World Athletics consensus and Hansen 2014. It is the number the evidence supports for a runner of this duration, not
  the 90-120 g/h figures drawn from cycling studies.

---

## Checklist

- [ ] slot-aware splitting into AM/PM
- [ ] week 4 fits without breaching `evening.maxKm`
- [ ] fuelling attached to sessions over 90 minutes
- [ ] gut-training progression from week 2
- [ ] tests for both

## Commits

(populated as work lands)
