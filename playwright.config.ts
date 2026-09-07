import { defineConfig, devices } from '@playwright/test';

/**
 * The rendered-viewport gate.
 *
 * Three defects have reached a "done" state in this repo and been caught only
 * by a human opening a browser: text the same colour as its background, ten
 * check-in pills clipped off the right edge, and three 16px-tall links. All
 * three passed typecheck, lint, format and the whole vitest suite, because none
 * of those ever renders a page. This runs the pages.
 *
 * Two viewports on purpose. The pill overflow only showed at 375px -- a sweep
 * at 390 alone would have called it clean.
 */
// Not 3000. The sweep must measure the production build, and reusing whatever
// happens to be on 3000 measured a dev server instead -- which streams HMR
// websocket failures into the console check and never fails the same way twice.
const PORT = Number(process.env.ROCKET_E2E_PORT ?? 3100);
const DIST = '.next-e2e';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // A viewport failure is a real defect, never a flake, so a retry would only
  // hide a genuine intermittent rather than rescue a good run.
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Failures name a selector and a measured value; a trace is for the rare
    // case where that is not enough to see it.
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'iphone-390',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'iphone-375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    // Always builds and serves its own production output. Two things follow
    // from that, both deliberate:
    //
    // It is what actually ships, so the sweep measures the real thing rather
    // than a dev server's instrumented output. And the gate runs identically on
    // a laptop and in CI -- `reuseExistingServer` would have made the local run
    // a different test from the CI run, which is how a gate comes to pass in one
    // place and fail in the other with nobody able to say which was right.
    //
    // Its own port and its own distDir so it never touches a `next dev` someone
    // has open.
    command: `npx next build && npx next start -p ${PORT}`,
    env: { ROCKET_E2E_DIST: DIST },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
