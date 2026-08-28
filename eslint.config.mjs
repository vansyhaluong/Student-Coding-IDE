import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      'out',
      'dist',
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommended,

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
)
