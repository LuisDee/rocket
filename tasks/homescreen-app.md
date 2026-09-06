# homescreen-app

**Scope boundary:** rocket's first real front end — an installable home-screen
page rendering the training block. Covers: web app manifest, PNG icons, layout
metadata for iOS, a single server-rendered page showing days-to-race, the macro
week table with the current week highlighted, and a snapshot of recent actual
runs. Explicitly does NOT cover: service worker, offline support, web push,
check-in form, database, Garmin calls at request time, or the crop-preview
screen — there are no cropped files to preview yet, so a placeholder for it
would be scaffolding for later.

**References:** `config/training.ts` (`BLOCK`, `BLOCK_WEEKS`, `MEASURED_BASE`,
`PACE_ESTIMATES`); `~/dev/marathonApp` as a design reference only;
`docs/decisions.md` 2026-09-06 (macro layer re-derived).

**Alternative rejected:** porting DoHardThings' `components/pwa/` install
journey. It is roughly 26 KB of mock-Safari-chrome walkthrough that drags in
motion, lucide-react, sonner and @base-ui as new dependencies, and it exists to
teach strangers on mixed devices. iOS 26 removed installability requirements
entirely, and this is one user on one phone. Also rejected: a service worker —
not required for home-screen install, and offline is meaningless for a page
whose value is freshness.

**Interface touched:** `src/app/layout.tsx` and `src/app/page.tsx` (both
create-next-app scaffold, replaced wholesale). Everything else is new. No
existing behaviour depends on either.

**Acceptance criteria:**

- `/manifest.webmanifest` returns parseable JSON with `display: "standalone"`
  and three or more icons. Asserted by parsing the body — a bare 200 is vacuous
  under a catch-all route.
- `apple-touch-icon` resolves to a real PNG. iOS ignores SVG for home-screen
  icons, which is why `marathonApp`'s icon is a screenshot fallback.
- The page renders at 390x844 with no horizontal scroll.
- The current week is visually distinguished, selected by comparing today
  against each week's `monday`. Correct when today IS a Monday, and correct
  before the block starts and after it ends.
- No training number is hardcoded outside `config/training.ts` (REDLINES 1).
- No GPS, heart-rate stream, or coordinate data is committed.
- All seven gates green.

**Assumptions:** `BLOCK_WEEKS` is the current macro shape (it was `SEED_WEEKS`
until `758a2dc` renamed and re-derived it). The recent-activities snapshot is a
committed derivative, correct only until the real sync lands — the page must say
so rather than implying live data.

---

## Checklist

- [x] Extractor script deriving a values-only activity summary
- [x] Committed snapshot under `src/data/`
- [x] Manifest, icons, apple-touch-icon
- [x] Layout metadata and viewport
- [x] The page
- [x] Current-week selection with its boundary tests
- [x] Browser-verified at iPhone width
- [x] Decision-log entry
- [x] Gates green

## Commits

- `866f7b6` feat(app): the block on the home screen
