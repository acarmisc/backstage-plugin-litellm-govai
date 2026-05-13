const esbuild = require('esbuild');

async function build() {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'browser',
    outfile: 'dist/index.esm.js',
    format: 'esm',
    packages: 'external',
    sourcemap: true,
    loader: { '.ts': 'tsx', '.tsx': 'tsx' },
  });
  console.log('Build complete');
}

build().catch(() => process.exit(1));
