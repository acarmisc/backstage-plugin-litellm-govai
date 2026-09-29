/**
 * Node ESM resolver hook for the component tests.
 *
 * Some Backstage/react-use/@material-ui ESM builds import subpaths without a
 * file extension or as bare directories (e.g. `react-use/esm/useAsync`,
 * `@material-ui/core/styles`), which bundlers resolve but Node's strict ESM
 * resolver rejects. Fall back to Node's CommonJS resolution for those, which
 * honours file extensions and each subpath's own package.json `main`.
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const retryable =
      err &&
      (err.code === 'ERR_MODULE_NOT_FOUND' ||
        err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') &&
      !specifier.startsWith('node:') &&
      !specifier.startsWith('/') &&
      !specifier.startsWith('file:');
    if (!retryable || !context.parentURL) throw err;
    try {
      const parentPath = context.parentURL.startsWith('file:')
        ? fileURLToPath(context.parentURL)
        : undefined;
      if (!parentPath) throw err;
      const resolved = createRequire(parentPath).resolve(specifier);
      return nextResolve(pathToFileURL(resolved).href, context);
    } catch {
      throw err;
    }
  }
}

/** Static assets imported by component libraries: stub them as empty strings. */
export async function load(url, context, nextLoad) {
  // lodash ships only CommonJS, so `import { trimEnd } from 'lodash'` fails in
  // Node's ESM loader. Wrap it in a module with a named export per function.
  if (/\/node_modules\/lodash\/lodash\.js$/.test(url)) {
    const lodashPath = fileURLToPath(url);
    const lodash = createRequire(lodashPath)(lodashPath);
    const names = Object.keys(lodash).filter(k => /^[A-Za-z_$][\w$]*$/.test(k) && k !== 'default' && k !== '__lodash');
    const source = [
      "import { createRequire } from 'node:module';",
      `const __lodash = createRequire(${JSON.stringify(lodashPath)})(${JSON.stringify(lodashPath)});`,
      'export default __lodash;',
      ...names.map(n => `export const ${n} = __lodash.${n};`),
    ].join('\n');
    return { format: 'module', source, shortCircuit: true };
  }

  if (/\.(svg|png|jpe?g|gif|webp|css)(\?.*)?$/.test(url)) {
    return { format: 'module', source: 'export default "";', shortCircuit: true };
  }
  return nextLoad(url, context);
}
