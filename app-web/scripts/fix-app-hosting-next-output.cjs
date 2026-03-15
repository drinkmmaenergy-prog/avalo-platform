const fs = require("fs");
const path = require("path");

const root = process.cwd();
const nextDir = path.join(root, ".next");
const standaloneNextDir = path.join(nextDir, "standalone", ".next");

fs.mkdirSync(standaloneNextDir, { recursive: true });

const filesToCopy = [
  "routes-manifest.json",
  "build-manifest.json",
  "prerender-manifest.json",
  "required-server-files.json",
];

for (const file of filesToCopy) {
  const src = path.join(nextDir, file);
  const dst = path.join(standaloneNextDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[app-hosting-fix] copied ${file}`);
  } else {
    console.warn(`[app-hosting-fix] missing ${file}`);
  }
}
