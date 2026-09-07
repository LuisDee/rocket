# viewport-gate

**Scope boundary:** an automated sweep of every rendered route at phone width,
asserting four properties the existing gates are blind to: no horizontal
overflow, no text the same colour as its own background, no tap target under
44px, and no console errors. Covers the Playwright config, the spec, a global
setup that fails closed on a missing database, an npm script and a CI job.
Explicitly does NOT cover: visual regression or screenshot diffing, interaction
or user-journey testing, accessibility auditing beyond tap-target size, any
route's content or correctness, and anything owned by the concurrent
`strava-ship` task (`src/lib/strava.ts`, `src/app/api/ship/`,
`src/app/activities/[id]/approval-view.tsx`, `src/db/ingest-schema.ts`,
`scripts/strava-auth.mts`, `scripts/check_no_strava_api.py`).

**References:** `docs/ci-gates.md` row "Rendered-viewport sweep at phone width
(390px)", currently NOT IMPLEMENTED with this as its closure condition.
`AGENTS.md` section 4 (prove the gate fails). Three prior defects, all of which
passed every existing gate: white-on-white text from a `body` background bound
to a light variable; ten RPE pills clipped off the right edge at 375px; three
16px-tall inline links fixed in `5fd85fe`.

**Alternative rejected:** screenshot comparison. It answers "did this change?"
rather than "is this broken", needs a blessed baseline per route per viewport,
and goes red on every legitimate copy edit. All three real defects are
measurable properties of the rendered DOM, so measure them. Also rejected:
running the sweep against an assumed-running dev server, which makes the gate
silently unrunnable in CI.

**Interface touched:** new `playwright.config.ts`, `e2e/` directory,
`package.json` scripts, `.github/workflows/check.yml` (one added job),
`docs/ci-gates.md` (one row flipped to IMPLEMENTED).

**Acceptance criteria:**

- Every route (`/`, `/block`, `/checkin`, `/activities`, `/activities/[id]`)
  swept at 390x844 and 375x667.
- A failure names the route, the selector and the measured value.
- Absent `DATABASE_URL` throws rather than skips.
- All three historical defects, reintroduced one at a time, are caught, and the
  message is recorded in the ledger row.
- `npx playwright test` starts its own server; no assumption a dev server is up.
- Every CI action pinned by commit SHA with a trailing version comment.

**Assumptions:** `@playwright/test` was stated in the directive to be an
existing devDependency. It is not -- only `vitest` is installed; the cached
browsers under `~/Library/Caches/ms-playwright` belong to the Playwright MCP
plugin, not to this repo. Adding it is therefore unavoidable and is the one new
dependency here. Assumed acceptable because the directive asked for a Playwright
sweep by name and no installed package can drive a browser.

---

## Checklist

- [x] `@playwright/test` added and pinned
- [x] `playwright.config.ts` with `webServer` and both viewport projects
- [x] Global setup fails closed on a missing `DATABASE_URL`
- [x] `e2e/viewport.spec.ts` asserting the four properties
- [x] npm script
- [x] CI job, actions SHA-pinned
- [x] Defect 1 (white-on-white) reintroduced, caught, reverted
- [x] Defect 2 (pill overflow) reintroduced, caught, reverted
- [x] Defect 3 (16px link) reintroduced, caught, reverted
- [x] `docs/ci-gates.md` row flipped to IMPLEMENTED with all three violations recorded
- [x] All other gates green -- `check_no_strava_api.py` now passes too, fixed
      on the strava-ship branch while this was in flight

**Found while proving it:** the contrast check was vacuous on its first
version. It parsed colour with an `rgba?(...)` regex; Tailwind v4 emits oklch
and Chrome serialises computed colour in the authored space, so every element
read `lab(...)`, parsed to null, and hit a `continue`. The check skipped every
text node on every page and reported green -- and was only caught because the
white-on-white defect was actually reintroduced rather than assumed caught.
Colour now converts through a 1x1 canvas and backgrounds composite up the
ancestor chain.

**Two real defects the gate found on its first honest run:** the six soreness
pills on `/checkin` measured 39-42x36px, under the minimum by construction at
every phone width (fixed here by moving the row label above the pills); and two
16px links on the approval screen (fixed by strava-ship in `c5ca561`, that file
being theirs).

**Scope added beyond the plan:** `e2e/fixtures.mts`, unforeseen. `/activities`
renders `listPending()`, so a shipped run never appears in the list and the
link-scraping approach could not reach that branch however many rows existed.
Activity ids now come from the database, and CI plants one row per interesting
status.

## Commits

- `5751538` feat: rendered-viewport gate at phone width -- config, spec,
  fixtures, CI job, ledger row, and the soreness-pill defect it found.
