import config from './astro.config.mjs';
import { localSsrNodeResolution } from './scripts/local-ssr-node-resolution.mjs';

// Opt-in Windows development configuration; production configuration is unchanged.
export default {
  ...config,
  vite: {
    ...config.vite,
    plugins: [...(config.vite?.plugins ?? []), localSsrNodeResolution()],
  },
};
