const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const repositoryRoot = path.resolve(__dirname, '..');

// Shared API contracts and the original logo live outside this Expo project.
config.watchFolders = [...new Set([...(config.watchFolders || []), repositoryRoot])];
config.resolver.nodeModulesPaths = [
  path.join(__dirname, 'node_modules'),
  ...(config.resolver.nodeModulesPaths || []),
];

// The web dependency cache/builds are not mobile sources. In particular, avoid
// crawling the preserved pnpm store when exposing the shared repository files.
const escapedRoot = repositoryRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ignored = new RegExp(`^${escapedRoot}[\\\\/](?:\\.pnpm-store|\\.git|\\.vercel|\\.astro|dist)(?:[\\\\/]|$)`);
const existing = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ignored];

module.exports = config;
