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
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

  {
    files: ['electron-builder.config.cjs', 'scripts/csharp-ls-payload.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    // Fixed developer references execute through Node's CommonJS loader.
    files: ['scripts/learning-official-tests/references/ch[234]-*/solution.js'],
    ignores: [
      'scripts/learning-official-tests/references/ch2-04/solution.js',
      'scripts/learning-official-tests/references/ch3-04/solution.js',
      'scripts/learning-official-tests/references/ch4-09/solution.js',
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
