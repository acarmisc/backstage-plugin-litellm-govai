const esbuild = require('esbuild');

const external = [
  '@backstage/core-components',
  '@backstage/core-plugin-api',
  '@backstage/frontend-plugin-api',
  '@backstage/plugin-catalog-react',
  '@backstage/theme',
  '@backstage/types',
  '@mui/material',
  '@mui/icons-material',
  '@emotion/react',
  '@emotion/styled',
  'react',
  'react-use',
  'recharts',
  'zod',
];

async function build() {
  await Promise.all([
    esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      platform: 'browser',
      outfile: 'dist/index.esm.js',
      format: 'esm',
      external,
      sourcemap: true,
    }),
  ]);
  console.log('Build complete');
}

build().catch(() => process.exit(1));
