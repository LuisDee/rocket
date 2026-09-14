import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

/**
 * What the other gates cannot see.
 *
 * typecheck, lint, format and 268 vitest tests never render a page, so an
 * entire class of defect walks past all of them. Three have, and each was
 * caught by a person looking:
 *
 *   1. `body { background }` bound to a light variable beat the layout's
 *      classes -- dark cards on a white page, and a target-km figure that was
 *      white on white and simply not there.
 *   2. Ten 44px check-in pills do not fit 375px; the last was clipped off.
 *   3. Three inline links rendered 16px tall against a 44px minimum.
 *
 * All three are measurable properties of the rendered DOM. So measure them.
 */

const MIN_TAP_PX = 44;

/** Below this, text is invisible against its background. Identical colours are 1. */
const MIN_CONTRAST = 1.5;

type Finding = { rule: string; selector: string; detail: string };

/**
 * Runs inside the page. Returns findings rather than throwing, so one pass
 * reports every problem on the route instead of only the first.
 */
type Rgba = [number, number, number, number];

function audit(minTap: number, minContrast: number): Finding[] {
  const out: Finding[] = [];

  const where = (el: Element): string => {
    const id = (el as HTMLElement).id;
    if (id) return `#${id}`;
    const cls = (el.className || '')
      .toString()
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join('.');
    const text = (el.textContent || '').trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${text ? ` "${text}"` : ''}`;
  };

  /**
   * Colour, via the browser rather than a regex.
   *
   * This is the second version. The first matched `rgba?(...)` and returned
   * null on anything else, which meant it returned null for EVERY element on
   * every page: Tailwind v4 emits oklch, and Chrome serialises computed colour
   * in the authored space, so `getComputedStyle().color` reads
   * `lab(96.16 0.09 -0.36)`. The null then hit a `continue` and the contrast
   * check skipped the entire document while reporting green. It was caught by
   * reintroducing the white-on-white defect and watching the gate pass it.
   *
   * Painting into a 1x1 canvas hands the conversion to the engine, so it is
   * right for lab, oklch, colour-mix, currentColor and whatever ships next.
   */
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const rgb = (s: string): Rgba | null => {
    if (!ctx) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [
      d[0] as number,
      d[1] as number,
      d[2] as number,
      (d[3] as number) / 255,
    ];
  };

  /** `top` painted over `bottom`. Straight-alpha source-over. */
  const over = (top: Rgba, bottom: Rgba): Rgba => {
    const a = top[3] + bottom[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    const mix = (i: 0 | 1 | 2): number =>
      (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  };

  const luminance = ([r, g, b]: Rgba): number => {
    const f = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };

  /**
   * The nearest ancestor that actually paints. An element's own background is
   * almost always transparent, so reading it and comparing would have missed
   * the white-on-white bug entirely.
   */
  const effectiveBackground = (el: Element): Rgba => {
    // Composited, not first-hit: a `bg-zinc-900/60` card over a white body is a
    // pale grey, and taking the card's colour at face value would call dark
    // text on it perfectly readable.
    let acc: Rgba = [0, 0, 0, 0];
    let node: Element | null = el;
    while (node && acc[3] < 1) {
      const c = rgb(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) acc = over(acc, c);
      node = node.parentElement;
    }
    // Nothing opaque the whole way up. What shows through is the browser's own
    // canvas, which is white.
    return acc[3] >= 1 ? acc : over(acc, [255, 255, 255, 1]);
  };

  // ---- 1. horizontal overflow -------------------------------------------
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth) {
    out.push({
      rule: 'overflow-document',
      selector: 'html',
      detail: `scrollWidth ${doc.scrollWidth}px > clientWidth ${doc.clientWidth}px`,
    });
  }
  // Per-element too: an ancestor with `overflow: hidden` clips the child and
  // keeps the document honest, so the document check alone misses it.
  const limit = doc.clientWidth;
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).position === 'fixed') continue;
    if (r.right > limit + 1) {
      out.push({
        rule: 'overflow-element',
        selector: where(el),
        detail: `right edge ${Math.round(r.right)}px exceeds viewport ${limit}px`,
      });
    }
  }

  // ---- 2. text the same colour as what is behind it ----------------------
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (
      cs.visibility === 'hidden' ||
      cs.display === 'none' ||
      parseFloat(cs.opacity) === 0
    )
      continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const fg = rgb(cs.color);
    if (!fg || fg[3] === 0) continue;
    const bg = effectiveBackground(el);
    const l1 = luminance(over(fg, bg));
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    if (ratio < minContrast) {
      out.push({
        rule: 'invisible-text',
        selector: where(el),
        detail: `contrast ${ratio.toFixed(2)}:1 -- text ${cs.color} on rgb(${Math.round(bg[0])}, ${Math.round(bg[1])}, ${Math.round(bg[2])})`,
      });
    }
  }

  // ---- 3. tap targets ----------------------------------------------------
  //
  // The thing a thumb hits is not always the element itself. An accessible
  // radio is a 1x1 `sr-only` input with a visible label styled as the control,
  // so measuring the input reports 1px for a perfectly good 44px pill. Resolve
  // to whatever actually paints before measuring.
  const paintedTarget = (el: Element): Element => {
    const r = el.getBoundingClientRect();
    if (Math.max(r.width, r.height) > 2) return el;
    const id = (el as HTMLInputElement).id;
    const labelled =
      (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
      el.closest('label');
    return labelled ?? el;
  };

  const targets = document.querySelectorAll(
    'a, button, input, select, [role="button"]',
  );
  const measured = new Set<Element>();
  for (const raw of Array.from(targets)) {
    const cs = getComputedStyle(raw);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if ((raw as HTMLInputElement).type === 'hidden') continue;
    const el = paintedTarget(raw);
    if (measured.has(el)) continue;
    measured.add(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const smaller = Math.min(r.width, r.height);
    if (smaller < minTap) {
      out.push({
        rule: 'tap-target',
        selector: where(el),
        detail: `${Math.round(r.width)}x${Math.round(r.height)}px, smaller side ${Math.round(
          smaller,
        )}px < ${minTap}px`,
      });
    }
  }

  return out;
}

async function sweep(page: Page, path: string): Promise<void> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`uncaught: ${e.message}`));

  const response = await page.goto(path, { waitUntil: 'networkidle' });
  expect(response?.status(), `${path} did not load`).toBeLessThan(400);

  const findings = await page.evaluate(
    ([tap, contrast]) => audit(tap as number, contrast as number),
    [MIN_TAP_PX, MIN_CONTRAST],
  );

  const report = findings
    .map((f) => `  [${f.rule}] ${f.selector}\n      ${f.detail}`)
    .join('\n');
  expect(findings, `${path}\n${report}`).toEqual([]);
  expect(
    consoleErrors,
    `${path} console errors:\n  ${consoleErrors.join('\n  ')}`,
  ).toEqual([]);
}

// The audit function is defined above in module scope for readability, but has
// to exist inside the page. Inject it before every navigation.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(`window.audit = ${audit.toString()}`);
});

const STATIC_ROUTES = ['/', '/block', '/checkin', '/activities'];

for (const route of STATIC_ROUTES) {
  test(`${route} renders within the viewport`, async ({ page }) => {
    await sweep(page, route);
  });
}

/**
 * The same sweep with every disclosure OPEN.
 *
 * The week list and the stride explainer hide their content inside `<details>`,
 * and a closed disclosure's content has no layout -- so the audit above measures
 * nothing inside it and would pass an overflowing session description forever.
 * Open them all, then audit what a tap actually reveals.
 */
test('/ renders within the viewport with every disclosure open', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const opened = await page.evaluate(() => {
    const all = [...document.querySelectorAll('details')];
    for (const d of all) d.open = true;
    return all.length;
  });
  // Not vacuous: if the page stops rendering disclosures, this says so instead
  // of auditing an empty set and passing.
  expect(opened, 'no <details> found on /').toBeGreaterThan(0);

  const findings = await page.evaluate(
    ([tap, contrast]) => audit(tap as number, contrast as number),
    [MIN_TAP_PX, MIN_CONTRAST],
  );
  const report = findings
    .map((f) => `  [${f.rule}] ${f.selector}\n      ${f.detail}`)
    .join('\n');
  expect(findings, `/ (disclosures open)\n${report}`).toEqual([]);
});

test('every page carries the tab bar, and it names where you are', async ({
  page,
}) => {
  // The app installs standalone, with no browser back button. A page without
  // the bar is a dead end -- which is what /checkin was.
  for (const route of STATIC_ROUTES) {
    await page.goto(route, { waitUntil: 'networkidle' });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav, `${route} has no tab bar`).toBeVisible();
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(
      nav.locator('[aria-current="page"]'),
      `${route} does not mark its own tab`,
    ).toHaveAttribute('href', route);
  }
});

/**
 * One activity per status, sourced from the database rather than the list.
 *
 * The obvious approach -- scrape `a[href^="/activities/"]` off `/activities`
 * and sweep those -- cannot work here, and quietly. That page calls
 * `listPending()`, a queue of runs awaiting a decision, so a shipped run is
 * deliberately absent from it and is reachable only by direct URL. A sweep
 * built on the list would have reported covering "every activity page" while
 * being structurally incapable of ever loading a shipped one, which is exactly
 * the branch that hid an undersized tap target until 2026-09-07.
 *
 * So ask the database. A status with no row is genuinely uncovered -- a gap in
 * the data, not in the sweep -- and CI plants one row per interesting status
 * (see `e2e/fixtures.mts`) so the branches are always exercised there.
 */
test('/activities/[id] renders within the viewport, one per status', async ({
  page,
}) => {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  let rows: { garmin_activity_id: string; status: string }[];
  try {
    rows = (
      await pool.query<{ garmin_activity_id: string; status: string }>(
        `select distinct on (status) garmin_activity_id, status
           from ingested_activities
          order by status, created_at desc`,
      )
    ).rows;
  } finally {
    await pool.end();
  }

  expect(
    rows.length,
    'no activity in the queue to sweep -- run the ingest, or e2e/fixtures.mts',
  ).toBeGreaterThan(0);

  for (const row of rows) {
    await test.step(`${row.status} -> ${row.garmin_activity_id}`, () =>
      sweep(page, `/activities/${row.garmin_activity_id}`));
  }
});
