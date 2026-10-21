import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

function moduleType(filename) {
  if (filename.endsWith('.mjs')) return 'module';
  if (filename.endsWith('.cjs')) return 'commonjs';
  let directory = path.dirname(filename);
  for (;;) {
    const manifest = path.join(directory, 'package.json');
    if (fs.existsSync(manifest)) {
      return JSON.parse(fs.readFileSync(manifest, 'utf8')).type === 'module' ? 'module' : 'commonjs';
    }
    const parent = path.dirname(directory);
    if (parent === directory) return 'commonjs';
    directory = parent;
  }
}

// Local development only. Keep native CJS dependencies out of the ESM runner.
export function localSsrNodeResolution({ platform = process.platform } = {}) {
  return {
    name: 'vetit:local-ssr-node-resolution',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      if (platform !== 'win32') return;
      if (!process.execArgv.includes('--experimental-import-meta-resolve') &&
          !process.env.NODE_OPTIONS?.split(/\s+/).includes('--experimental-import-meta-resolve')) {
        throw new Error('Use node scripts/dev-local.mjs for parent-aware local SSR resolution.');
      }
      for (const [name, environment] of Object.entries(server.environments)) {
        if (name === 'client') continue;
        const original = environment.fetchModule.bind(environment);
        environment.fetchModule = async (id, importer, options) => {
          const nativeResult = () => {
            if (!importer || !path.isAbsolute(importer) || !fs.existsSync(importer)) return null;
            const request = id.startsWith('/node_modules/') ? path.join(server.config.root, id) : id;
            // The launcher enables Node's parent-aware ESM resolver. Require-only
            // resolution selects the wrong entry for packages such as eventemitter3.
            const resolved = import.meta.resolve(request, pathToFileURL(importer).href);
            const filename = resolved.startsWith('file:') ? fileURLToPath(resolved) : createRequire(importer).resolve(request);
            if (!/\.(?:mjs|cjs|js)$/.test(filename)) return null;
            return { externalize: pathToFileURL(filename).href, type: moduleType(filename) };
          };
          // Keep installed runtime dependencies native, including conditional CJS
          // wrappers. Astro itself and the explicitly bundled Supabase clients
          // still require Vite's transforms; application modules are untouched.
          const packagePath = id.replaceAll('\\', '/').split('/node_modules/').at(-1);
          const installedJs = id.includes('/node_modules/') && /\.(mjs|cjs|js)$/.test(id);
          const bareDependency = /^[\w@][^:]*$/.test(id) && !id.startsWith('astro');
          if ((installedJs && !/^(astro\/|@supabase\/)/.test(packagePath)) ||
              (bareDependency && importer?.replaceAll('\\', '/').includes('/node_modules/') &&
               !id.startsWith('@supabase/'))) {
            const result = nativeResult();
            if (result) return result;
          }
          try {
            return await original(id, importer, options);
          } catch (error) {
            // Only recover an unresolved bare dependency from a real installed module.
            if (error.code !== 'ERR_MODULE_NOT_FOUND' || !/^[\w@][^:]*$/.test(id) ||
                id.startsWith('astro') || id.startsWith('@supabase/') ||
                !importer?.replaceAll('\\', '/').includes('/node_modules/')) throw error;
            try {
              const result = nativeResult();
              if (result) return result;
            } catch { /* Preserve the original Vite diagnostic. */ }
            throw error;
          }
        };
      }
    },
  };
}
