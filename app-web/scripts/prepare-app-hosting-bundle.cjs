const fs = require("fs");
const path = require("path");

const appRoot = process.cwd();
const standaloneRoot = path.join(appRoot, ".next", "standalone");
const nextRoot = path.join(appRoot, ".next");
const publicRoot = path.join(appRoot, "public");
const targetRoot = path.join(appRoot, ".apphosting");

function rm(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function exists(p) {
  return fs.existsSync(p);
}

function copyDir(src, dest) {
  if (!exists(src)) throw new Error(`Missing directory: ${src}`);
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function copyFileIfExists(src, dest) {
  if (exists(src)) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    console.log(`[prepare-app-hosting] copied ${path.relative(appRoot, src)} -> ${path.relative(appRoot, dest)}`);
  }
}

function findAllServerJs(dir) {
  const results = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name === "server.js") {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function scoreRuntimeRoot(serverJsPath) {
  const dir = path.dirname(serverJsPath);
  let score = 0;
  if (exists(path.join(dir, "node_modules"))) score += 5;
  if (exists(path.join(dir, "package.json"))) score += 2;
  if (exists(path.join(dir, ".next"))) score += 3;
  if (exists(path.join(dir, "context.js")) || exists(path.join(dir, "context"))) score += 4;
  return score;
}

function detectRuntimeRoot() {
  if (!exists(standaloneRoot)) {
    throw new Error(`Missing standalone output: ${standaloneRoot}`);
  }

  const serverFiles = findAllServerJs(standaloneRoot);
  if (serverFiles.length === 0) {
    throw new Error(`No server.js found under ${standaloneRoot}`);
  }

  const ranked = serverFiles
    .map((p) => ({ server: p, root: path.dirname(p), score: scoreRuntimeRoot(p) }))
    .sort((a, b) => b.score - a.score || a.root.length - b.root.length);

  console.log("[prepare-app-hosting] candidate runtime roots:");
  for (const item of ranked) {
    console.log(` - score=${item.score} root=${item.root}`);
  }

  return ranked[0].root;
}

console.log("[prepare-app-hosting] start");

rm(targetRoot);
ensureDir(targetRoot);

const runtimeRoot = detectRuntimeRoot();
console.log(`[prepare-app-hosting] selected runtime root: ${runtimeRoot}`);

// Copy actual runtime root contents into .apphosting root
for (const entry of fs.readdirSync(runtimeRoot, { withFileTypes: true })) {
  const src = path.join(runtimeRoot, entry.name);
  const dest = path.join(targetRoot, entry.name);

  if (entry.isDirectory()) {
    copyDir(src, dest);
  } else if (entry.isFile()) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}
console.log("[prepare-app-hosting] copied runtime root contents");

// Ensure Firebase adapter-required manifests are available in .apphosting/.next
ensureDir(path.join(targetRoot, ".next"));
ensureDir(path.join(targetRoot, ".next", "server"));

copyFileIfExists(path.join(nextRoot, "BUILD_ID"), path.join(targetRoot, ".next", "BUILD_ID"));
copyFileIfExists(path.join(nextRoot, "routes-manifest.json"), path.join(targetRoot, ".next", "routes-manifest.json"));
copyFileIfExists(path.join(nextRoot, "build-manifest.json"), path.join(targetRoot, ".next", "build-manifest.json"));
copyFileIfExists(path.join(nextRoot, "prerender-manifest.json"), path.join(targetRoot, ".next", "prerender-manifest.json"));
copyFileIfExists(path.join(nextRoot, "required-server-files.json"), path.join(targetRoot, ".next", "required-server-files.json"));
copyFileIfExists(path.join(nextRoot, "server", "middleware-manifest.json"), path.join(targetRoot, ".next", "server", "middleware-manifest.json"));
copyFileIfExists(path.join(nextRoot, "server", "app-paths-manifest.json"), path.join(targetRoot, ".next", "server", "app-paths-manifest.json"));
copyFileIfExists(path.join(nextRoot, "server", "pages-manifest.json"), path.join(targetRoot, ".next", "server", "pages-manifest.json"));
copyFileIfExists(path.join(nextRoot, "server", "server-reference-manifest.json"), path.join(targetRoot, ".next", "server", "server-reference-manifest.json"));

// Copy static assets
if (exists(path.join(nextRoot, "static"))) {
  copyDir(path.join(nextRoot, "static"), path.join(targetRoot, ".next", "static"));
  console.log("[prepare-app-hosting] copied .next/static");
}

if (exists(publicRoot)) {
  copyDir(publicRoot, path.join(targetRoot, "public"));
  console.log("[prepare-app-hosting] copied public");
}

const finalServer = path.join(targetRoot, "server.js");
if (!exists(finalServer)) {
  throw new Error(`Prepared bundle missing server.js at ${finalServer}`);
}

console.log("[prepare-app-hosting] bundle ready");
console.log(`[prepare-app-hosting] entrypoint: ${finalServer}`);
