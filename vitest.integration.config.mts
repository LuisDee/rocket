import { defineConfig } from 'vitest/config';

/**
 * The integration run. Separate from the unit config because it needs a
 * database and the unit run must not.
 *
 * `globalSetup` THROWS when DATABASE_URL is absent -- see
 * `src/db/integration-setup.ts`. A `skipIf` in its place is how this gate
 * silently becomes vacuous: green, having tested nothing.
 */
export default defineConfig({
  test: {
    include: ['**/*.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**', '.worktrees/**'],
    globalSetup: ['./src/db/integration-setup.ts'],
    // One database, shared. Parallel files racing on the same rows is a source
    // of flake that buys nothing for a suite this size.
    fileParallelism: false,
  },
});
