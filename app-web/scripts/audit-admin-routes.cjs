#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const appRoot = path.join(root, "src", "app");

const scanRoots = [
  path.join(appRoot, "admin", "moderation"),
  path.join(appRoot, "moderator"),
];

const TARGET_FILE_NAME = "page.tsx";

const riskImportMatchers = [
  { label: "@/lib/firebase", test: (s) => s === "@/lib/firebase" || s.startsWith("@/lib/firebase/") },
  { label: "firebase/app", test: (s) => s === "firebase/app" || s.startsWith("firebase/app/") },
  { label: "firebase/auth", test: (s) => s === "firebase/auth" || s.startsWith("firebase/auth/") },
  { label: "firebase/firestore", test: (s) => s === "firebase/firestore" || s.startsWith("firebase/firestore/") },
  { label: "realtime helper/hook import", test: (s) => /(^@\/.*realtime)|(^\.{1,2}\/.*realtime)/.test(s) },
];

const topLevelRiskPatterns = [
  { label: "initializeApp()", re: /\binitializeApp\s*\(/ },
  { label: "initializeAuth()", re: /\binitializeAuth\s*\(/ },
  { label: "getAuth()", re: /\bgetAuth\s*\(/ },
  { label: "getFirestore()", re: /\bgetFirestore\s*\(/ },
  { label: "getFunctions()", re: /\bgetFunctions\s*\(/ },
  { label: "requireDb()", re: /\brequireDb\s*\(/ },
  { label: "onSnapshot()", re: /\bonSnapshot\s*\(/ },
];

function exists(p) {
  return fs.existsSync(p);
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && entry.name === TARGET_FILE_NAME) {
      out.push(full);
    }
  }
  return out;
}

function toRel(p) {
  return path.relative(root, p).replace(/\\/g, "/");
}

function hasDynamicGuard(src) {
  return /export\s+const\s+dynamic\s*=\s*['"`]force-dynamic['"`]\s*;?/.test(src);
}

function hasRevalidateZero(src) {
  return /export\s+const\s+revalidate\s*=\s*0\s*;?/.test(src);
}

function hasUseClient(src) {
  const lines = src.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) continue;
    return line === "'use client';" || line === '"use client";' || line === "'use client'" || line === '"use client"';
  }
  return false;
}

function collectImports(src) {
  const imports = [];
  const re = /^\s*import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]\s*;?/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function stripInlineNoise(line) {
  const noStrings = line
    .replace(/`(?:\\.|[^`])*`/g, "``")
    .replace(/"(?:\\.|[^"])*"/g, '""')
    .replace(/'(?:\\.|[^'])*'/g, "''");
  return noStrings.replace(/\/\/.*$/, "");
}

function findTopLevelUsageHits(src) {
  const hits = new Set();
  const lines = src.split(/\r?\n/);
  let depth = 0;

  for (const rawLine of lines) {
    const line = stripInlineNoise(rawLine);

    if (depth === 0) {
      for (const p of topLevelRiskPatterns) {
        if (p.re.test(line)) hits.add(p.label);
      }
    }

    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    depth += opens - closes;
    if (depth < 0) depth = 0;
  }

  return Array.from(hits);
}

function makeTable(rows) {
  const headers = ["file", "useClient", "dynamic", "revalidate=0", "riskImports", "topLevelRiskUsage", "status"];

  const data = rows.map((r) => [
    r.file,
    r.useClient ? "yes" : "no",
    r.dynamic ? "yes" : "no",
    r.revalidate ? "yes" : "no",
    r.riskImports.length ? r.riskImports.join(",") : "-",
    r.topLevelRiskUsage.length ? r.topLevelRiskUsage.join(",") : "-",
    r.ok ? "PASS" : "FAIL",
  ]);

  const widths = headers.map((h, i) =>
    Math.max(h.length, ...data.map((row) => String(row[i]).length))
  );

  const line = "+" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+";
  const fmt = (cols) =>
    "| " +
    cols
      .map((v, i) => String(v).padEnd(widths[i], " "))
      .join(" | ") +
    " |";

  const out = [];
  out.push(line);
  out.push(fmt(headers));
  out.push(line);
  for (const row of data) out.push(fmt(row));
  out.push(line);
  return out.join("\n");
}

function main() {
  const pageFiles = scanRoots.flatMap((dir) => walk(dir, []));
  const uniqueFiles = Array.from(new Set(pageFiles)).sort();

  if (uniqueFiles.length === 0) {
    console.log("[audit:routes] No matching page.tsx files found in:");
    for (const r of scanRoots) console.log(` - ${toRel(r)}`);
    console.log("[audit:routes] PASS");
    process.exit(0);
  }

  const rows = uniqueFiles.map((file) => {
    const src = fs.readFileSync(file, "utf8");
    const imports = collectImports(src);

    const riskImports = riskImportMatchers
      .filter((m) => imports.some((imp) => m.test(imp)))
      .map((m) => m.label);

    const topLevelRiskUsage = findTopLevelUsageHits(src);
    const dynamic = hasDynamicGuard(src);
    const revalidate = hasRevalidateZero(src);
    const useClient = hasUseClient(src);
    const hasGuard = dynamic || revalidate;

    const ok = hasGuard && riskImports.length === 0 && topLevelRiskUsage.length === 0;

    return {
      file: toRel(file),
      useClient,
      dynamic,
      revalidate,
      riskImports,
      topLevelRiskUsage,
      ok,
      hasGuard,
    };
  });

  console.log(makeTable(rows));

  const failures = rows.filter((r) => !r.ok);
  if (failures.length === 0) {
    console.log(`[audit:routes] PASS (${rows.length} files checked)`);
    process.exit(0);
  }

  console.error(`[audit:routes] FAIL (${failures.length}/${rows.length} files)`);
  for (const f of failures) {
    const reasons = [];
    if (!f.hasGuard) reasons.push("missing dynamic/revalidate guard");
    if (f.riskImports.length) reasons.push(`risk imports: ${f.riskImports.join(", ")}`);
    if (f.topLevelRiskUsage.length) reasons.push(`top-level risk usage: ${f.topLevelRiskUsage.join(", ")}`);
    console.error(` - ${f.file}: ${reasons.join(" | ")}`);
  }

  process.exit(1);
}

main();
