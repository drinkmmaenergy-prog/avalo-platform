/**
 * Fix remaining functions.pubsub.schedule patterns
 * Handles patterns with arrow function without parentheses
 * Pattern:
 * export const name = functions.pubsub
 *   .schedule('cron')
 *   .onRun(async context => {
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

  // Check if file uses functions.pubsub
  if (!content.includes('functions.pubsub')) {
    continue;
  }

  // Pattern 1: functions.pubsub\n  .schedule('cron')\n  .onRun(async context => {
  // Without parentheses around context
  const pattern1 = /functions\.pubsub\s*\n\s*\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:\/\/[^\n]*)?\s*\n\s*\.onRun\s*\(\s*async\s+(\w+)\s*=>\s*\{/g;
  content = content.replace(pattern1, (match, cron, param) => {
    fileFixed = true;
    totalFixes++;
    return `onSchedule("${cron}", async (event) => {`;
  });

  // Pattern 2: functions.pubsub\n  .schedule('cron')\n  .timeZone('tz')\n  .onRun(async context => {
  const pattern2 = /functions\.pubsub\s*\n\s*\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:\/\/[^\n]*)?\s*\n\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\n\s*\.onRun\s*\(\s*async\s+(\w+)\s*=>\s*\{/g;
  content = content.replace(pattern2, (match, cron, tz, param) => {
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
