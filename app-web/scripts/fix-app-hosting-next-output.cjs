const fs = require('fs');
const path = require('path');

const root = process.cwd();
const nextDir = path.join(root, '.next');
const standaloneDir = path.join(nextDir, 'standalone');
const standaloneNextDir = path.join(standaloneDir, '.next');
const standaloneServerDir = path.join(standaloneNextDir, 'server');

function log(msg) {
  console.log(`[app-hosting-fix] ${msg}`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
  return fs.existsSync(p);
}

function copyFileSafe(src, dest) {
  if (!exists(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  log(`copied ${path.relative(root, src)} -> ${path.relative(root, dest)}`);
  return true;
}

function writeJson(dest, value) {
  ensureDir(path.dirname(dest));
  fs.writeFileSync(dest, JSON.stringify(value, null, 2), 'utf8');
  log(`wrote ${path.relative(root, dest)}`);
}

function walk(dir, matcher, results = []) {
  if (!exists(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, matcher, results);
    } else if (matcher(full)) {
      results.push(full);
    }
  }
  return results;
}

function normalizeSlashes(p) {
  return p.replace(/\\/g, '/');
}

function findBestServerJs() {
  const candidates = walk(nextDir, (full) => path.basename(full) === 'server.js')
    .map((full) => normalizeSlashes(full));

  const ranked = candidates
    .filter((full) => !full.endsWith('/.next/standalone/server.js'))
    .sort((a, b) => {
      const score = (p) => {
        let s = 0;
        if (p.includes('/.next/standalone/')) s += 100;
        if (p.endsWith('/server.js')) s += 10;
        if (p.includes('/app-web/')) s += 5;
        return s;
      };
      return score(b) - score(a);
    });

  return ranked.length ? ranked[0] : null;
}

function copyManifestIfPresent(fileName) {
  const src = path.join(nextDir, fileName);
  const dest = path.join(standaloneNextDir, fileName);
  copyFileSafe(src, dest);
}

function main() {
  if (!exists(nextDir)) {
    throw new Error(`Missing .next directory at ${nextDir}`);
  }

  ensureDir(standaloneDir);
  ensureDir(standaloneNextDir);
  ensureDir(standaloneServerDir);

  // 1) Ensure standalone server.js exists
  const targetServerJs = path.join(standaloneDir, 'server.js');
  if (!exists(targetServerJs)) {
    const bestServerJs = findBestServerJs();
    if (!bestServerJs) {
      throw new Error(`Could not find any generated server.js under ${nextDir}`);
    }

    const srcServerJs = bestServerJs.includes(':')
      ? bestServerJs
      : path.normalize(bestServerJs);

    copyFileSafe(srcServerJs, targetServerJs);
  } else {
    log('standalone/server.js already present');
  }

  // 2) Root manifests expected by Firebase adapter
  [
    'routes-manifest.json',
    'build-manifest.json',
    'prerender-manifest.json',
    'required-server-files.json',
    'app-build-manifest.json',
    'app-path-routes-manifest.json',
    'react-loadable-manifest.json',
  ].forEach(copyManifestIfPresent);

  // 3) Server manifests expected by adapter / runtime
  const serverManifestMap = [
    ['middleware-manifest.json', 'middleware-manifest.json'],
    ['functions-config-manifest.json', 'functions-config-manifest.json'],
    ['next-font-manifest.json', 'next-font-manifest.json'],
    ['server-reference-manifest.json', 'server-reference-manifest.json'],
  ];

  for (const [srcName, destName] of serverManifestMap) {
    const src = path.join(nextDir, 'server', srcName);
    const dest = path.join(standaloneServerDir, destName);
    copyFileSafe(src, dest);
  }

  // 4) Firebase adapter expects middleware-manifest even when there is no middleware
  const middlewareManifestDest = path.join(standaloneServerDir, 'middleware-manifest.json');
  if (!exists(middlewareManifestDest)) {
    writeJson(middlewareManifestDest, {
      version: 2,
      middleware: {},
      functions: {},
      sortedMiddleware: [],
    });
  }

  // 5) Print final checks
  const checks = [
    targetServerJs,
    path.join(standaloneNextDir, 'routes-manifest.json'),
    path.join(standaloneNextDir, 'build-manifest.json'),
    path.join(standaloneNextDir, 'prerender-manifest.json'),
    middlewareManifestDest,
  ];

  for (const check of checks) {
    log(`${path.relative(root, check)} => ${exists(check) ? 'OK' : 'MISSING'}`);
  }
}

main();
