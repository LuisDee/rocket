# 00 — Overview

## What this is
An adaptive training planner whose primary interface is an LLM conversation (via MCP), backed by a small web server and a PWA calendar/check-in view. It plans an aggressive but guarded marathon block, absorbs real-world disruption (spontaneous long runs, soreness, timetable changes), and re-plans continuously using Garmin metrics plus daily subjective feedback.

## The two loops the system must nail
These come from real scenarios and are the acceptance bar for the whole product:

**Loop A — the spanner.** User says "I feel great, doing 30km today" (or just does it). System: logs it, spikes acute load, re-plans the rolling window — downgrades/kills the next quality session, shifts the long run — and *explains the trade it made*. If the request violates a hard guardrail, it negotiates: "30km puts you over ramp cap; 22km easy keeps Saturday's quality session alive — your call, but here's the cost of each."

**Loop B — the tumble dryer.** Daily check-in reports severe DOMS (with location + severity, distinguishing "tired" from "wrecked"). System rebuilds the week: easy-or-nothing until soreness clears, swim volume unaffected (zero impact), quality gated on a recovery signal (subjective + HRV/resting HR when available).

## Interfaces
1. **MCP tools** (primary) — conversation drives everything: status, check-in, replan, adjust, availability.
2. **PWA** (secondary) — read-mostly calendar of sessions + races + work/commute blocks; one-tap daily check-in; one-tap activity context tags (shoe, surface).

## Design principles
- Subjective check-in is a first-class signal, not a fallback. It shipped before any API integration and remains the tiebreaker.
- Aggression goes into easy volume, not intensity. The system enforces this distribution.
- Races already on the calendar are structural constraints with assigned *roles* (rehearsal / sharpener / easy), not open questions.
- Single user. No auth complexity, no multi-tenancy, no premature abstraction.
