const esbuild = require('esbuild');

async function build() {
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'browser',
    outfile: 'dist/index.esm.js',
    format: 'esm',
    packages: 'external', // all node_modules external; only bundle local source
    sourcemap: true,
  });
  console.log('Build complete');
}

build().catch(() => process.exit(1));
