# dht-calendar-push

**Scope boundary:** DESIGN ONLY. Produce `docs/DHT_PRIVATE_TRAINING_DESIGN.md`
describing how DoHardThings could show each user their own training runs and
nobody else's, and how rocket would push them. Explicitly does NOT cover: any
rocket implementation, any change to `~/dev/DoHardThings`, storing rocket's
training data in DHT as the system of record, or pushing completed activities
(DHT already ingests those from its Strava webhook).

**References:** `~/dev/DoHardThings` at `origin/main` — `lib/auth.ts:17-28`
(identity-only Google scopes, no callbacks), `lib/strava-store-types.ts:8-42`
(per-user store interface), `lib/strava-store-upstash.ts:33-114` (Redis key
shapes), `lib/push-store.ts` (the 24-line seam factory), `app/page.tsx:15-24`
(session gate), `app/api/events/route.ts:16-28` (authenticated read),
`lib/mcp-auth.ts:53-58` (app-level bearer), `lib/mcp-create.ts:53-55`
(`mcpActorEmail()` static actor).

**Alternative rejected:** the shared-calendar marker approach, which was built
and then removed. `create_race` with `kind: "marker"` writes to DHT's Google
Calendar, which is shared by construction — Google Calendar's `visibility:
private` hides _detail_ on a personal calendar, not _existence_ on a shared one.
It cannot satisfy per-user isolation and was abandoned rather than patched.

**Interface touched:** none. Documentation only.

**Acceptance criteria:**

- The design names actual files and line numbers in DHT, verified by reading
  `origin/main`, not recalled from summary.
- It gives ONE storage recommendation with the strongest argument against it.
- It states precisely what per-user keying protects and what it does not, given
  that any Google account can obtain a session.
- It enumerates the concrete changes DHT would need, including the identity gap
  that the current app-level bearer cannot close.
- It is honest about size and about not being on the critical path for
  24 October.

**Assumptions:**

- rocket remains the system of record for training data; DHT would hold a
  read-optimised copy for display only. Nothing in the design should make DHT
  authoritative for anything rocket needs to function.
- The friend group is small and trusted. The design states the trust boundary
  rather than engineering around it.

---

## Checklist

- [x] Remove the shared-calendar marker implementation (superseded)
- [x] Verify DHT's store seam, auth model and key shapes from `origin/main`
- [x] Write `docs/DHT_PRIVATE_TRAINING_DESIGN.md`
- [ ] Gates green

## Commits

(populated as work lands)
