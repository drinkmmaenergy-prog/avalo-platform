/**
 * Fix functions.pubsub.schedule patterns
 * These files use: import * as functions from 'firebase-functions'
 * and call: functions.pubsub.schedule('cron').onRun(...)
 * 
 * Need to convert to onSchedule from runtime
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllTsFiles(fullPath, files);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

let totalFixes = 0;
let filesFixed = 0;

const files = getAllTsFiles(srcDir);

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fileFixed = false;
  const relativePath = path.relative(srcDir, filePath);
  const depth = relativePath.split(path.sep).length - 1;
  const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';

  // Check if file uses functions.pubsub.schedule or pubsub.schedule
  if (!content.includes('functions.pubsub.schedule') && !content.includes('pubsub.schedule')) {
    continue;
  }

  // Pattern 1: functions.pubsub.schedule('cron').onRun(async () => {
  const pattern1 = /functions\.pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern1, (match, cron) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule("${cron}", async (event) => {`;
  });

  // Pattern 2: functions.pubsub.schedule('cron').onRun(async (context) => {
  const pattern2 = /functions\.pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern2, (match, cron, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule("${cron}", async (event) => {`;
  });

  // Pattern 3: functions.pubsub.schedule('cron').timeZone('tz').onRun(async () => {
  const pattern3 = /functions\.pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern3, (match, cron, tz) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
  });

  // Pattern 4: functions.pubsub.schedule('cron').timeZone('tz').onRun(async (context) => {
  const pattern4 = /functions\.pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern4, (match, cron, tz, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
  });

  // Pattern 5: pubsub.schedule('cron').onRun(async () => {
  const pattern5 = /(?<!functions\.)pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern5, (match, cron) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule("${cron}", async (event) => {`;
  });

  // Pattern 6: pubsub.schedule('cron').onRun(async (context) => {
  const pattern6 = /(?<!functions\.)pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern6, (match, cron, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule("${cron}", async (event) => {`;
  });

  // Pattern 7: pubsub.schedule('cron').timeZone('tz').onRun(async () => {
  const pattern7 = /(?<!functions\.)pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern7, (match, cron, tz) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
  });

  // Pattern 8: pubsub.schedule('cron').timeZone('tz').onRun(async (context) => {
  const pattern8 = /(?<!functions\.)pubsub\s*\.\s*schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern8, (match, cron, tz, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
  });

  // If we made changes, ensure onSchedule is imported from runtime
  if (fileFixed) {
    // Check if onSchedule is already imported from runtime
    const hasRuntimeImport = content.includes("from './runtime'") || content.includes("from '../runtime'") || content.includes('from "./runtime"') || content.includes('from "../runtime"');
    
    if (!hasRuntimeImport) {
      // Add import from runtime at the top after existing imports
      const lastImportMatch = content.match(/^import\s+.*?;\n/gm);
      if (lastImportMatch && lastImportMatch.length > 0) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        const insertPos = content.lastIndexOf(lastImport) + lastImport.length;
        content = content.slice(0, insertPos) + `import { onSchedule } from '${runtimePath}';\n` + content.slice(insertPos);
      }
    } else {
      // Check if onSchedule is in the runtime import
      const runtimeImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\.?\/runtime['"];?/);
      if (runtimeImportMatch && !runtimeImportMatch[1].includes('onSchedule')) {
        const newImports = runtimeImportMatch[1].trim() + ', onSchedule';
        content = content.replace(runtimeImportMatch[0], `import { ${newImports} } from '${runtimePath}';`);
      }
    }
  }

  if (fileFixed && content !== originalContent) {
    fs.writeFileSync(filePath, content);
    filesFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\nTotal patterns fixed: ${totalFixes}`);
console.log(`Total files fixed: ${filesFixed}`);
