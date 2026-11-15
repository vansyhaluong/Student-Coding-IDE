import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'out',
      'dist',
      'release',
      'spikes/csharp-lsp-compatibility/.dotnet',
      'spikes/csharp-lsp-compatibility/.tools',
      'spikes/csharp-lsp-compatibility/artifacts',
      'spikes/csharp-lsp-compatibility/dist',
      'spikes/csharp-lsp-compatibility/node_modules',
      // Frozen 9D Common records. evidence/ is archived source snapshots and
      // build artifacts. The listed sources are the same pre-existing limitation
      // (1,106 errors with the snapshots). Other spike directories stay linted,
      // as do the harness files in this directory that already pass.
      'spikes/exercise-shutdown-9d-common/evidence',
      'spikes/exercise-shutdown-9d-common/host.ts',
      'spikes/exercise-shutdown-9d-common/limits/prepare.mjs',
      'spikes/exercise-shutdown-9d-common/policy-b-checkpoint.ts',
      'spikes/exercise-shutdown-9d-common/policy-b-host.ts',
      'spikes/exercise-shutdown-9d-common/policy-b-recovery.ts',
      'spikes/exercise-shutdown-9d-common/policy-b-runtime.ts',
      'spikes/exercise-shutdown-9d-common/staged-host.ts',
      'spikes/exercise-shutdown-9d-common/staged-integrity.mjs',
      'spikes/exercise-shutdown-9d-common/staged-preload.cjs',
      'spikes/exercise-shutdown-9d-common/staged-run.mjs',
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: [
      'scripts/learning-official-tests/reference-child.mjs',
      'scripts/learning-official-tests/run.mjs',
      'scripts/learning-official-tests/run-stage.mjs',
    ],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['electron-builder.config.cjs', 'scripts/csharp-ls-payload.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Fixed developer references execute through Node's CommonJS loader.
    files: ['scripts/learning-official-tests/references/ch[23456]-*/solution.js'],
    ignores: [
      'scripts/learning-official-tests/references/ch2-04/solution.js',
      'scripts/learning-official-tests/references/ch3-04/solution.js',
      'scripts/learning-official-tests/references/ch4-09/solution.js',
      'scripts/learning-official-tests/references/ch5-03/solution.js',
      'scripts/learning-official-tests/references/ch5-07/solution.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'readonly' },
    },
  },

  {
    files: [
      'src/renderer/**/*.{ts,tsx}',
    ],

    languageOptions: {
      globals: globals.browser,
    },
  },

  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'tests/**/*.ts',
      'electron.vite.config.ts',
    ],

    languageOptions: {
      globals: globals.node,
    },
  },

  {
    files: [
      'spikes/csharp-lsp-compatibility/**/*.ts',
    ],

    languageOptions: {
      globals: globals.node,
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
