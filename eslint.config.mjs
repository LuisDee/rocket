import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Type-aware rules. The stock Next config is not type-aware, which means
  // eslint catches nothing tsc does not already catch -- a lint gate that
  // cannot fail independently is a decoration (AGENTS.md section 4).
  //
  // Four rules, deliberately. A 200-rule config is a day we do not have.
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // The one that matters most here. An unawaited promise in a Vercel
      // function or a server action is swallowed silently -- precisely how the
      // daily Garmin sync would fail for a week without anyone noticing
      // (REDLINES.md rule 3).
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // Config files and guards run outside the app's type graph.
  {
    files: ['*.config.mjs', '*.config.mts', 'vitest.config.mts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'scripts/**', // stdlib python guards, not TypeScript
    'tools/**', // uv-managed python harnesses, not TypeScript
  ]),
]);

export default eslintConfig;
