const { createConfigForRole } = require('@backstage/cli/config/eslint-factory');

module.exports = createConfigForRole(__dirname, 'frontend-plugin', {
  // This package uses node's built-in test runner, not jest, so
  // eslint-plugin-jest can't auto-detect a jest version from node_modules.
  // Pin one explicitly to avoid the "Unable to detect Jest version" crash.
  settings: {
    jest: { version: 29 },
  },
  overrides: [
    {
      // Allow node: builtin imports (node:test, node:assert) in test files
      // run via `node --test`, which the shared config otherwise restricts
      // on the assumption that tests run under jest/jsdom.
      files: ['**/*.test.ts', '**/*.test.tsx'],
      rules: {
        'no-restricted-imports': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Test support and tests import devDependencies (jsdom, testing-library).
      files: ['src/testing/**', '**/*.test.ts', '**/*.test.tsx'],
      rules: {
        '@backstage/no-undeclared-imports': 'off',
        'no-restricted-imports': 'off',
        'no-restricted-syntax': 'off',
      },
    },
  ],
});
