import http from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const BASE = process.env.FUNCTIONS_BASE
  || "http://127.0.0.1:5001/demo-avalo-local/us-central1";

const CHECKS = [
  { name: "ciHealth", url: `${BASE}/ciHealth` },
];

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () =>
        resolve({ status: res.statusCode || 0, body: data })
      );
    });
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  // emulator needs a moment even after port is open
  await delay(1200);

  const failures = [];
  for (const c of CHECKS) {
    try {
      const r = await get(c.url);
      if (r.status >= 200 && r.status < 300) {
        console.log(`OK: ${c.name}`);
      } else {
        failures.push(`${c.name} => HTTP ${r.status}, body: ${String(r.body).slice(0, 200)}`);
      }
    } catch (e) {
      failures.push(`${c.name} => ${e?.message || String(e)}`);
    }
  }

  if (failures.length) {
    console.error("SMOKE FAIL:");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }

  console.log("SMOKE PASS");
  process.exit(0);
}

main();
