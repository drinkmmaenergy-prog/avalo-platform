import { execSync } from "node:child_process";

const BLOCKLIST = [
  /functions\/src\/.*pricing/i,
  /functions\/src\/.*treasury/i,
  /functions\/src\/.*econom/i,
  /functions\/src\/.*wallet/i,
  /functions\/src\/.*subscriptions/i,
  /app-web\/.*pricing/i,
  /app-web\/.*wallet/i,
  /app-mobile\/.*pricing/i,
  /app-mobile\/.*wallet/i,
];

function getGitChangedFiles() {
  try {
    const s = execSync("git status --porcelain", { encoding: "utf8" });
    return s
      .split(/\r?\n/)
      .filter(Boolean)
      .map(l => l.slice(3).trim().replace(/\\/g,"/"));
  } catch {
    return [];
  }
}

const changed = getGitChangedFiles();
if (!changed.length) process.exit(0);

const blocked = changed.filter(f =>
  BLOCKLIST.some(rx => rx.test(f))
);

if (blocked.length) {
  console.error("GUARDRAIL FAIL:");
  blocked.forEach(f => console.error(" - " + f));
  process.exit(2);
}

process.exit(0);
