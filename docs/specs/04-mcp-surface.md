# 04 — MCP surface

The MCP tools are the real product API; the PWA is a viewer. Tool responses are prose-friendly: structured data plus a short human-readable summary, because the consumer is an LLM mid-conversation.

Every tool name carries the `rocket_` prefix. The names are frozen the moment the connector is added on claude.ai — they are baked into the connector, into every eval assertion written against it, and into habit; changing one afterwards means re-adding the connector. Choosing the prefix now costs a find-replace against zero implementation. It also keeps the surface legible in the conversation rocket actually lives in, where routr, DoHardThings and Strava are all present and a bare `get_status` does not say whose status it is.

## Tools (v1)

**rocket_get_status()** → today's readiness (with rationale), today's session(s), load state (ATL/CTL/TSB per component, ramp %), days to next race + goal race, the goal band (a range, never a single time — `PACE_ESTIMATES.planningBandSeconds`, see 06), the trailing-14-day trend (below), any pending flags (e.g. "Garmin sync stale 3 days").

**rocket_get_week(offset=0)** → the rolling window: sessions with slots, races, availability blocks, weekly target vs projected.

**rocket_daily_checkin(rpe_yesterday, soreness[{location, severity}], sleep, motivation, note?)** → recomputes readiness; auto-replans if red/amber; returns readiness + any plan diff.

**rocket_log_activity(type, distance?, duration?, rpe, shoe?, surface?, elevation_gain?, note?)** → manual log (pre-Garmin, or Garmin-outage fallback). Scores stress, updates load, triggers spanner-replan if deviant. Returns stress breakdown + plan diff.

**rocket_replan(reason)** → free-text driven replan of the rolling window. Returns diff + rationale. This is the "I feel good, let's do 30km today" / "meeting ran over, no lunch run" entry point; the planner negotiates guardrails here.

**rocket_adjust_session(session_id, changes)** → targeted single-session edit (move slot, change distance, swap type). Guardrail-checked against the whole window, not the session — see the write contract.

**rocket_set_availability(rules|overrides)** → work pattern, commute, the weekly swim slot, one-off exceptions.

**rocket_get_calendar(from, to)** → merged view: sessions + races + work/commute + markers. Feeds the PWA too.

**rocket_get_load_history(days=42)** → time series for "how's the block going" conversations and charts.

**rocket_propose_route(session_id)** → (post-routr wiring) turn a session prescription into a routr request: distance, intensity-appropriate terrain (flat for MP work), start point home/office by slot.

**rocket_sync_now(source)** → force Garmin/DoHardThings pull; returns what changed.

## The write contract

Six of the eleven mutate state the plan depends on: `rocket_daily_checkin`, `rocket_log_activity`, `rocket_replan`, `rocket_adjust_session`, `rocket_set_availability`, and `rocket_sync_now` — the last because an ingested activity can fire the spanner trigger and move the window. Each returns the same envelope:

```
{
  applied: boolean,
  violated_rules: rule_id[],
  compliant_alternative: Diff | null,
  resulting_window: Session[]
}
```

- **`applied`** is the field that separates "your request was refused" from "your request changed nothing". Those two serialise to an identical diff, and a model asked to narrate an ambiguous result fills the gap with optimism — the failure Strava shipped publicly when Athlete Intelligence congratulated a rider on the ride that ended in his crash. A boolean can be asserted by a test; a paragraph cannot. A rejected write returns `applied: false`, and the transcript that follows must not claim it landed.
- **`violated_rules`** carries stable string ids from the guardrail set, not sentences. Ids survive rewording and are matchable in an eval; the prose belongs in the summary.
- **`compliant_alternative`** is the counter-offer that "tools never dead-end" already requires, in the same diff shape as an applied change — so accepting it is one more call rather than a re-negotiation.
- **`resulting_window`** is the rolling window as it stands after the call, applied or refused. The caller never has to ask what the plan is now, and a narration can be checked against it.

**Validation scope is the whole rolling window on every write, `rocket_adjust_session` included.** A single-session edit that is legal on its own can still break the week: ten individually-valid `rocket_adjust_session` calls can walk a compliant week past the ramp cap, past the quality-session budget, or into a long run the morning after a race, with every call truthfully reporting success. Validating only the session is the cheap thing that looks correct and is not.

This is the half that cannot be retrofitted. The envelope's fields can be added to a shipped tool at any time; the scope cannot — widening `rocket_adjust_session` from session to window later moves the validator, the placement rules it has to consult, and every caller and test written against the narrow signature. It is a change to the planner's call graph, not to a return type.

## Trailing-14-day trend

`rocket_get_status` returns one trend object: completed run km over the trailing 14 days against the same window's weekly targets, and mean easy-run pace over that window against `PACE_ESTIMATES` — two values, each with a direction. One function, computed by code over the full series and returned with its coverage window stated; the model never derives a trend by reading an activity list.

It informs and never acts. No table, no tool of its own, no automatic replan. Over-performing is exactly the evidence that should move the goal band after the 12 September half, and under-performing is an input to the check-in gate — both are decisions taken by the gate or by Luis, not by a threshold firing. `REPLAN.spannerDeviationPct` already covers the single-activity deviation; this covers the slow drift in either direction that nothing else would notice.

## Conversation-first behaviors
- Tools never dead-end: guardrail refusals always include a compliant counter-offer.
- Diffs are minimal and narrated ("moved Thu quality → Sat, killed Fri easy, week stays at 52km").
- `rocket_get_status` is designed to open every conversation — cheap, complete, current.
