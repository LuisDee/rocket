# 04 — MCP surface

The MCP tools are the real product API; the PWA is a viewer. Tool responses are prose-friendly: structured data plus a short human-readable summary, because the consumer is an LLM mid-conversation.

## Tools (v1)

**get_status()** → today's readiness (with rationale), today's session(s), load state (ATL/CTL/TSB per component, ramp %), days to next race + goal race, any pending flags (e.g. "Garmin sync stale 3 days").

**get_week(offset=0)** → the rolling window: sessions with slots, races, availability blocks, weekly target vs projected.

**daily_checkin(rpe_yesterday, soreness[{location, severity}], sleep, motivation, note?)** → recomputes readiness; auto-replans if red/amber; returns readiness + any plan diff.

**log_activity(type, distance?, duration?, rpe, shoe?, surface?, elevation_gain?, note?)** → manual log (pre-Garmin, or Garmin-outage fallback). Scores stress, updates load, triggers spanner-replan if deviant. Returns stress breakdown + plan diff.

**replan(reason)** → free-text driven replan of the rolling window. Returns diff + rationale. This is the "I feel good, let's do 30km today" / "meeting ran over, no lunch run" entry point; the planner negotiates guardrails here.

**adjust_session(session_id, changes)** → targeted single-session edit (move slot, change distance, swap type). Guardrail-checked.

**set_availability(rules|overrides)** → work pattern, commute, swim evenings, one-off exceptions.

**get_calendar(from, to)** → merged view: sessions + races + work/commute + markers. Feeds the PWA too.

**get_load_history(days=42)** → time series for "how's the block going" conversations and charts.

**propose_route(session_id)** → (post-routr wiring) turn a session prescription into a routr request: distance, intensity-appropriate terrain (flat for MP work), start point home/office by slot.

**sync_now(source)** → force Garmin/DoHardThings pull; returns what changed.

## Conversation-first behaviors
- Tools never dead-end: guardrail refusals always include a compliant counter-offer.
- Diffs are minimal and narrated ("moved Thu quality → Sat, killed Fri easy, week stays at 52km").
- `get_status` is designed to open every conversation — cheap, complete, current.
