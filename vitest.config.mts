import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Colocated *.test.ts next to what they test. No separate tests/ tree until
    // there is enough to need one.
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
