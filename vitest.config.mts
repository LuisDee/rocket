import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Colocated *.test.ts next to what they test. No separate tests/ tree until
    // there is enough to need one.
    include: ['**/*.test.ts'],
    exclude: [
      'node_modules/**',
      '.next/**',
      // Feature worktrees live under .worktrees/ and carry their own copies of
      // these files. Without this, a run from the main checkout picks up a
      // branch's tests mid-edit and fails on work that is not even ours.
      '.worktrees/**',
    ],
  },
});
