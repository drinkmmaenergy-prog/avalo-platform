/**
 * Fix pubsub.schedule patterns in v2 imports
 * These files import { pubsub } from 'firebase-functions/v2/providers/pubsub'
 * and use pubsub.schedule() which doesn't exist in v2
 * 
 * Need to convert to onSchedule from firebase-functions/v2/scheduler
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

  // Check if file uses pubsub.schedule
  if (!content.includes('pubsub.schedule')) {
    continue;
  }

  // Pattern 1: pubsub.schedule("cron").onRun(async (context) => {
  const pattern1 = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern1, (match, cron, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule("${cron}", async (event) => {`;
  });

  // Pattern 2: pubsub.schedule("cron").timeZone("tz").onRun(async (context) => {
  const pattern2 = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern2, (match, cron, tz, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
  });

  // Pattern 3: pubsub.schedule({ schedule: "cron", timeZone: "tz" }).onRun(async (context) => {
  const pattern3 = /pubsub\.schedule\s*\(\s*\{\s*schedule:\s*['"]([^'"]+)['"]\s*,\s*timeZone:\s*['"]([^'"]+)['"]\s*\}\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  content = content.replace(pattern3, (match, cron, tz, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
  });

  // Pattern 4: Just pubsub.schedule("cron") without .onRun - convert to onSchedule
  // This is for cases like: export const job = pubsub.schedule("cron")
  const pattern4 = /=\s*pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  content = content.replace(pattern4, (match, cron) => {
    fileFixed = true;
    totalFixes++;
    return `= onSchedule("${cron}", async (event) => { /* TODO: add handler */ })`;
  });

  // If we made changes, ensure onSchedule is imported from runtime
  if (fileFixed) {
    // Check if onSchedule is already imported from runtime
    if (!content.includes("from './runtime'") && !content.includes("from '../runtime'") && !content.includes('from "./runtime"') && !content.includes('from "../runtime"')) {
      // Add import from runtime at the top after existing imports
      const firstImportMatch = content.match(/^import\s+.*?;\n/m);
      if (firstImportMatch) {
        const insertPos = content.indexOf(firstImportMatch[0]) + firstImportMatch[0].length;
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

    // Remove pubsub import if it's only used for schedule
    // Check if pubsub is used for anything else
    const pubsubUsages = content.match(/pubsub\./g);
    if (!pubsubUsages || pubsubUsages.length === 0) {
      // Remove pubsub from imports
      content = content.replace(/,?\s*pubsub\s*,?/g, (match) => {
        if (match.startsWith(',') && match.endsWith(',')) return ',';
        return '';
      });
      // Clean up empty imports
      content = content.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]+['"];?\n?/g, '');
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
