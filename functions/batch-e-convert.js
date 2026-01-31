/**
 * Batch E - Convert v1 region/runWith to v2 options
 * Handles:
 * - functions.region('x').https.onCall(...)
 * - functions.runWith({...}).https.onCall(...)
 * - functions.region('x').runWith({...}).https.onCall(...)
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files to process (from grep results)
const filesToProcess = [
  'pack358-stress-scenarios.ts',
  'pack358-ltv-model.ts',
  'pack358-financial-forecast.ts',
  'pack358-burnrate-engine.ts',
  'pack303-endpoints.ts',
  'pack298-unified-engine.ts',
  'discoveryFeed.ts',
  'chemistryMatchingApi.ts',
  'chemistryFeedApi.ts',
  'aiMemory.ts',
  'secondChance/rewriteFirstMessage.ts',
  'scheduled/secondChanceScan.ts',
  'pack427-sync-endpoints.ts',
  'pack427-realtime-signals.ts',
  'pack414-integration-audit.ts',
  'pack411-store-reviews-ingestion.ts',
  'pack393-marketing-orchestrator.ts',
  'pack392-trust-score.ts',
  'pack392-store-defense.ts',
  'pack392-aso-engine.ts',
  'pack370-ltv-engine.ts',
  'pack339-disaster-recovery.ts',
  'content/contentUploadProcessor.ts',
];

// Memory value mapping from v1 to v2
const memoryMap = {
  '128MB': '128MiB',
  '256MB': '256MiB',
  '512MB': '512MiB',
  '1GB': '1GiB',
  '2GB': '2GiB',
  '4GB': '4GiB',
  '8GB': '8GiB',
};

function convertMemory(mem) {
  return memoryMap[mem] || mem;
}

function processFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️ File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Remove "import * as functions from 'firebase-functions';" if present
  // but only if we're converting away from v1
  const hasRegion = content.includes('.region(');
  const hasRunWith = content.includes('.runWith(');
  
  if (!hasRegion && !hasRunWith) {
    console.log(`  ✅ No v1 patterns in: ${path.basename(filePath)}`);
    return false;
  }

  // Pattern 1: functions.region('xxx').https.onCall(async (request) => {
  // Convert to: onCall({ region: 'xxx' }, async (request) => {
  const regionHttpsOnCallPattern = /functions\s*\n?\s*\.region\(['"]([^'"]+)['"]\)\s*\n?\s*\.https\.onCall\(\s*async\s*\(\s*request\s*\)\s*=>\s*\{/g;
  content = content.replace(regionHttpsOnCallPattern, (match, region) => {
    modified = true;
    return `onCall(\n  { region: '${region}' },\n  async (request) => {`;
  });

  // Pattern 2: functions.region('xxx').runWith({...}).https.onCall(async (request) => {
  // Convert to: onCall({ region: 'xxx', ...options }, async (request) => {
  const regionRunWithOnCallPattern = /functions\s*\n?\s*\.region\(['"]([^'"]+)['"]\)\s*\n?\s*\.runWith\(\s*\{([^}]+)\}\s*\)\s*\n?\s*\.https\.onCall\(\s*async\s*\(\s*request\s*\)\s*=>\s*\{/g;
  content = content.replace(regionRunWithOnCallPattern, (match, region, options) => {
    modified = true;
    // Parse options
    let opts = options.trim();
    // Convert memory values
    opts = opts.replace(/memory:\s*['"](\d+[MG]B)['"]/g, (m, mem) => `memory: '${convertMemory(mem)}'`);
    return `onCall(\n  { region: '${region}', ${opts} },\n  async (request) => {`;
  });

  // Pattern 3: functions.runWith({...}).https.onCall(async (request) => {
  // Convert to: onCall({ ...options }, async (request) => {
  const runWithOnCallPattern = /functions\s*\n?\s*\.runWith\(\s*\{([^}]+)\}\s*\)\s*\n?\s*\.https\.onCall\(\s*async\s*\(\s*request\s*\)\s*=>\s*\{/g;
  content = content.replace(runWithOnCallPattern, (match, options) => {
    modified = true;
    let opts = options.trim();
    // Convert memory values
    opts = opts.replace(/memory:\s*['"](\d+[MG]B)['"]/g, (m, mem) => `memory: '${convertMemory(mem)}'`);
    return `onCall(\n  { ${opts} },\n  async (request) => {`;
  });

  // Pattern 4: functions.runWith({...}).https\n    .onCall(...) multiline
  const runWithMultilinePattern = /functions\s*\n?\s*\.runWith\(\s*\{([^}]+)\}\s*\)\s*\n?\s*\.https\s*\n?\s*\.onCall\(\s*async\s*\(\s*request\s*\)\s*=>\s*\{/g;
  content = content.replace(runWithMultilinePattern, (match, options) => {
    modified = true;
    let opts = options.trim();
    opts = opts.replace(/memory:\s*['"](\d+[MG]B)['"]/g, (m, mem) => `memory: '${convertMemory(mem)}'`);
    return `onCall(\n  { ${opts} },\n  async (request) => {`;
  });

  // Convert functions.https.HttpsError to HttpsError
  if (content.includes('functions.https.HttpsError')) {
    content = content.replace(/functions\.https\.HttpsError/g, 'HttpsError');
    modified = true;
  }

  // Convert functions.https.onCall remaining patterns that may be simple
  // Pattern: functions.https.onCall(async (request) => {
  const simpleOnCallPattern = /functions\.https\.onCall\(\s*async\s*\(\s*request\s*\)\s*=>\s*\{/g;
  content = content.replace(simpleOnCallPattern, (match) => {
    modified = true;
    return `onCall(async (request) => {`;
  });

  // Remove import * as functions from 'firebase-functions' if no longer needed
  if (modified && !content.includes('functions.')) {
    content = content.replace(/import \* as functions from ['"]firebase-functions['"];\n?/g, '');
    // Ensure HttpsError and onCall are imported from runtime
    if (!content.includes("from './runtime'") && !content.includes('from "./runtime"')) {
      // Add import at the top after first import
      const firstImportMatch = content.match(/(import .+ from .+;\n)/);
      if (firstImportMatch) {
        content = content.replace(
          firstImportMatch[0],
          firstImportMatch[0] + "import { HttpsError, onCall } from './runtime';\n"
        );
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Converted: ${path.basename(filePath)}`);
    return true;
  }

  return false;
}

console.log('🔧 Batch E: Converting v1 region/runWith patterns to v2\n');

let converted = 0;
for (const file of filesToProcess) {
  const filePath = path.join(srcDir, file);
  if (processFile(filePath)) {
    converted++;
  }
}

console.log(`\n✅ Converted ${converted} files`);

// Second pass: catch any remaining patterns
console.log('\n🔍 Second pass: scanning for remaining patterns...\n');

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      scanDir(filePath);
    } else if (file.endsWith('.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const hasRegion = content.includes('.region(');
      const hasRunWith = content.includes('.runWith(');
      if (hasRegion || hasRunWith) {
        processFile(filePath);
      }
    }
  }
}

scanDir(srcDir);

console.log('\n🔧 Batch E conversion complete');
