const esbuild = require('esbuild');

const external = [
  '@backstage/backend-plugin-api',
  '@backstage/config',
  '@backstage/types',
  'express',
];

Promise.all([
  esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    outfile: 'dist/index.cjs.js',
    format: 'cjs',
    external,
    sourcemap: true,
  }),
  esbuild.build({
    entryPoints: ['src/types.ts'],
    bundle: true,
    platform: 'node',
    outfile: 'dist/types.cjs.js',
    format: 'cjs',
    external,
    sourcemap: true,
  }),
]).catch(() => process.exit(1));