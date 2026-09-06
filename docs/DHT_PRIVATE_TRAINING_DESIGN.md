# Private per-user training in DoHardThings — design

**Status:** DESIGN ONLY. Nothing here is built. No DoHardThings code has been
modified.
**Written:** 2026-09-06, against `DoHardThings@origin/main`.

## The requirement

Each user sees their own training runs on the DoHardThings calendar and nobody
else's. The shared calendar keeps showing what it shows today — events plus
Strava activities — and training plans become private per user, which is what
keeps the shared view uncluttered.

## Why the obvious approach cannot work

The first implementation used DHT's existing `create_race` tool with
`kind: "marker"` (`lib/mcp-tools.ts:104-160`). It was built, then removed.

DHT's event store is a Google Calendar written through a service account
(`lib/auth.ts:17-21` states this explicitly: _"We never request calendar access
here — all calendar I/O goes through the service account"_). Everything on that
calendar is visible to everyone with access to it. Google Calendar's
`visibility: private` hides an event's **detail** from other people's view of a
_personal_ calendar; it does not hide its **existence** on a _shared_ one. There
is no per-attendee filtering to reach for. The approach is not fixable, so it was
abandoned rather than patched.

---

## 1. Where per-user training data should live

**Recommendation: Redis, keyed by the signed-in user's email, mirroring the store
seam DHT already has.**

DHT already contains both halves of this pattern, which is the strongest argument
for it — nothing new is being invented:

| Existing key                            | Shape                               | Visibility                                                          |
| --------------------------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| `strava:link:${email}`                  | per-user                            | private by construction (`strava-store-upstash.ts:37`)              |
| `strava:consent:${email}`               | per-user                            | private (`:93`)                                                     |
| `strava:act:${athleteId}:${activityId}` | per-activity                        | shared                                                              |
| `strava:day:${dayKey}`                  | Redis SET of `athleteId:activityId` | **shared** — this is why everyone sees everyone's runs (`:104,112`) |

So `strava:day:*` is exactly the shared-visibility mechanism the new requirement
wants training to avoid, and `strava:link:*` is exactly the private-per-user
mechanism it wants training to copy.

Proposed keys:

```
training:${lower(email)}:${dayKey}      -> the session(s) planned for that day
training:${lower(email)}:days           -> SET of dayKeys, for month-grid dots
```

Note there is deliberately **no** `training:day:${dayKey}` cross-user index. The
absence of that key is the privacy property: there is no way to ask "who is
training today" because nothing stores the answer.

### The alternative, and why not

**Writing to each user's own Google Calendar via an added OAuth scope.** Rejected
on DHT's own documented reasoning. `lib/auth.ts:17-21` explains that the current
Google scopes (`openid`, `email`, `profile`) are _non-sensitive_, and spells out
the cost of going beyond them: _"no verification, no domain, no 'unverified app'
warning, and no 7-day refresh-token expiry."_ Requesting `calendar.events` is a
sensitive scope and forfeits all four. That would mean a Google verification
process, a scary consent screen for the friend group, and refresh tokens expiring
weekly for an app in testing mode — a large, ongoing cost to display training
data that the app can render itself from Redis.

It does have one genuine advantage worth recording: training would then appear in
each user's _phone_ calendar, outside the app entirely. If that ever becomes the
point, revisit. It is not the point today.

### The strongest argument against my recommendation

**It puts a second copy of training data somewhere rocket does not control.**
rocket is the system of record; DHT would hold a display copy that can drift —
if a plan changes and the push fails, DHT shows a stale week with nothing to
detect it. The mitigation is to treat the DHT copy as a cache with a full
idempotent re-push rather than incremental edits, and to make the push cheap
enough to run on every plan change. That is a real cost and it is the price of
the requirement.

---

## 2. The identity problem, precisely

`lib/auth.ts:26-28` constructs NextAuth with `providers` and **nothing else** —
no `signIn` callback, no allowlist. Any Google account that completes sign-in
gets a valid session. `DoHardThings/CLAUDE.md` calls the resulting access
"Intentional" for a friend group.

Email is the only identity the app carries: a grep across `app/`, `lib/` and
`components/` finds `session.user.email` three times and `session.user.id` never.

### What per-user keying does protect

Reads are scoped to the requester's own session email, server-side. A signed-in
user cannot see another user's training, because the API never looks up a key
they do not own. A stranger who signs in with a fresh Google account sees an
empty training list — their own, which is empty. That is the requirement met.

### What it does not protect

- **It is not a security boundary against account compromise.** Anyone who can
  sign in as you sees your training. That is true of the whole app today.
- **It does not restrict who can sign up.** The open door in `lib/auth.ts`
  stays open; this design neither widens nor narrows it.
- **It does not survive the MCP write path as it stands.** See §3.

### Is email a sufficient key?

**Yes, and it is the consistent choice.** Every existing per-user key in DHT is
`lower(email)`. Introducing a stable Google `sub` claim for training alone would
mean adding a NextAuth `jwt`/`session` callback, and would leave the Strava vault
still keyed on email — two identity schemes in one app, which is worse than one
imperfect one.

The known weakness, recorded rather than solved: a Google account's primary email
can change, which would orphan that user's data. It is rare, it already applies
to `strava:link:*`, and the fix if it ever happens is a one-off key rename.

---

## 3. What DHT would have to gain

Four concrete pieces.

**(a) A training store — four files, mirroring an existing seam.**
`lib/training-store-types.ts` (interface, zero imports),
`lib/training-store-memory.ts` (tests and E2E),
`lib/training-store-upstash.ts` (production), and a
`lib/training-store.ts` factory with a `trainingStoreConfigured()` predicate.
`lib/push-store.ts` is 24 lines and is the template to copy verbatim, including
`import "server-only"` and the E2E routing. Interface roughly:

```ts
getDay(email: string, dayKey: string): Promise<TrainingDay | null>;
putDay(email: string, day: TrainingDay): Promise<void>;
listDays(email: string): Promise<string[]>;
replaceBlock(email: string, days: TrainingDay[]): Promise<void>;  // idempotent re-push
```

**(b) An API route.** `app/api/training/route.ts`, following
`app/api/events/route.ts:16-28` exactly: `const session = await auth()`, reject
without an email, and scope every read to that email. `GET` returns only the
caller's own days. The route must never accept an owner parameter on `GET` —
that is the whole isolation property, and it should carry a test that a second
signed-in user gets an empty list rather than the first user's data.

**(c) UI merge.** `app/page.tsx:15-35` gates on the session then renders
`RaceBoard`. Training days need to arrive alongside events and Strava activities
and render visually distinct — planned rather than happened, and private rather
than shared. A small "only you can see this" affordance is worth the pixels; it
is the kind of thing users otherwise have to be told twice.

**(d) The identity gap on the write path — the actual hard part.**

`lib/mcp-auth.ts:53-58` checks a single static `MCP_BEARER_TOKEN`. It identifies
**the calling application, not a person**. Worse, the tool handlers then attribute
everything to `mcpActorEmail()` (`lib/mcp-create.ts:53-55`), a static environment
variable — so DHT's MCP surface has no concept of _who_ is calling at all. Earlier
analysis of this repo noted the same thing: the OAuth subject is verified at the
gate and then discarded.

That is fine for a shared calendar where every write is public anyway. It is not
fine for per-user private data, where "who is this write for?" is the whole
question. Three options:

1. **Static bearer plus an explicit owner email on the request.** Simplest. DHT
   trusts the caller to name the right owner — the same trust level as
   `mcpActorEmail()` today. Anything holding the bearer can write to any user's
   training. Acceptable while Luis is the only holder; unacceptable the moment a
   second person integrates. Must be documented as a limitation, not buried.
2. **Per-user tokens.** DHT issues a token bound to one email; rocket holds
   Luis's. Real isolation on the write path, and a small amount of new machinery
   (issue, store, revoke).
3. **Use DHT's existing OAuth server.** `app/api/mcp/oauth/*` already mints
   access tokens carrying a subject, and `lib/mcp-auth.ts` already resolves that
   subject. This is the only option that needs no new identity concept — the
   plumbing exists and is currently discarded rather than absent.

**Recommend (3)**, falling back to (1) if wiring the subject through the tool
handlers proves larger than it looks. (3) also fixes the underlying design flaw
rather than routing around it.

---

## 4. How rocket would push

rocket stays the system of record. On any plan change it does a full idempotent
re-push of future days:

```
rocket  ──POST /api/training  (owner from the token's subject, not the body)
        ──body: [{ dayKey, kind, distanceKm, note }, ...]
DHT     ──replaceBlock(email, days)   -- replace, not merge
```

Replace rather than incremental edit, for the same reason the marker approach hit
trouble: without it, a session that moves from Saturday to Sunday leaves a ghost
on Saturday, and there is no reconciliation pass to catch it. Replacing the whole
future window is one call, trivially idempotent, and cannot drift.

Only future days are ever written. Completed activities are never pushed — DHT
already ingests those from its Strava webhook (`lib/strava-webhook.ts` →
`lib/strava-ingest.ts`), and Luis's runs reach Strava, so pushing them would
duplicate what is already there.

---

## 5. Size and sequencing

**Half a day to a day of work in DoHardThings**, not two hours. The store seam is
~250 lines but it is a close copy of one that already exists; the API route is
small; the UI merge is the fiddly part, and threading the OAuth subject through
the tool handlers (option 3 above) is the genuinely unknown piece. Add tests for
the isolation property, which is the one thing that must not regress silently.

**It is not on the critical path for 24 October.** This is a convenience — seeing
planned training next to races in an app Luis already opens. The crop-and-ship
pipeline is the thing he touches after _every single run_, and it automates a
manual workflow he performs today. That ships first.

Sensible sequencing: build this after the marathon, or in a gap while waiting on
something else. Nothing in rocket depends on it, and rocket's own home-screen app
already shows the block.

## Open question for Luis

The requirement says each user sees only their own training. Worth confirming
whether that extends to **long runs specifically** — a shared long run is the one
training session a friend might actually want to join, and total privacy removes
the "anyone fancy 30k Saturday?" affordance the shared calendar is good at. A
per-session "share this one" flag would cost little and preserve it, but it is
scope, so it is recorded here rather than assumed.
