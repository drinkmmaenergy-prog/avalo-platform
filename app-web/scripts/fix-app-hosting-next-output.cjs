const fs = require("fs");
const path = require("path");

const root = process.cwd();
const nextDir = path.join(root, ".next");
const standaloneNextDir = path.join(nextDir, "standalone", ".next");
const standaloneServerDir = path.join(standaloneNextDir, "server");
const serverDir = path.join(nextDir, "server");

fs.mkdirSync(standaloneNextDir, { recursive: true });
fs.mkdirSync(standaloneServerDir, { recursive: true });

const rootFiles = [
  "routes-manifest.json",
  "build-manifest.json",
  "prerender-manifest.json",
  "required-server-files.json",
];

const serverFiles = [
  "middleware-manifest.json",
  "app-path-routes-manifest.json",
  "pages-manifest.json",
  "app-paths-manifest.json",
  "middleware-build-manifest.js",
  "middleware-react-loadable-manifest.js",
  "font-manifest.json",
];

for (const file of rootFiles) {
  const src = path.join(nextDir, file);
  const dst = path.join(standaloneNextDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[app-hosting-fix] copied root ${file}`);
  } else {
    console.warn(`[app-hosting-fix] missing root ${file}`);
  }
}

for (const file of serverFiles) {
  const src = path.join(serverDir, file);
  const dst = path.join(standaloneServerDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[app-hosting-fix] copied server ${file}`);
  } else {
    console.warn(`[app-hosting-fix] missing server ${file}`);
  }
}
