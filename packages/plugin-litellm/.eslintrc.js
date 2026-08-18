const { createConfigForRole } = require('@backstage/cli/config/eslint-factory');

module.exports = createConfigForRole(__dirname, 'frontend-plugin', {
  // This package uses node's built-in test runner, not jest, so
  // eslint-plugin-jest can't auto-detect a jest version from node_modules.
  // Pin one explicitly to avoid the "Unable to detect Jest version" crash.
  settings: {
    jest: { version: 29 },
  },
});
