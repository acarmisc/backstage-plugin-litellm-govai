const esbuild = require('esbuild');

const external = [
  '@backstage/plugin-permission-common',
  'zod',
];

esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/index.cjs.js',
  format: 'cjs',
  external,
  sourcemap: true,
}).catch(() => process.exit(1));
