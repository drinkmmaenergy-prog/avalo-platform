// metro.config.js — Monorepo-aware Metro configuration for Expo
// Fixes pnpm virtual store path resolution issues on Windows
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "..", "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "..", "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

module.exports = config;


// Enable pnpm symlink support
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// CRITICAL FIX: Override asyncRequireModulePath to use a RELATIVE path
const absoluteAsyncPath = require.resolve('expo/internal/async-require-module');
config.transformer.asyncRequireModulePath = path.relative(projectRoot, absoluteAsyncPath);

// CRITICAL FIX #2: Override getModulesRunBeforeMainModule to use relative paths
const origGetModules = config.serializer.getModulesRunBeforeMainModule;
config.serializer.getModulesRunBeforeMainModule = (entryFilePath) => {
  const modules = origGetModules ? origGetModules(entryFilePath) : [];
  return modules.map((modulePath) => {
    if (path.isAbsolute(modulePath)) {
      return path.relative(projectRoot, modulePath);
    }
    return modulePath;
  });
};

// Map workspace packages to their source directories
config.resolver.extraNodeModules = {
  '@avalo/i18n': path.resolve(monorepoRoot, 'packages', 'i18n', 'src'),
};

// Add .md to asset extensions so legal markdown files can be require()'d as assets
config.resolver.assetExts = [...(config.resolver.assetExts || []), 'md'];

module.exports = config;
