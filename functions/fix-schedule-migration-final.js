/**
 * Final Schedule Migration Fix Script
 * Fixes:
 * 1. Duplicate onSchedule imports
 * 2. pubsub.schedule patterns still remaining
 * 3. Return value issues in onSchedule handlers
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

  // Fix 1: Remove duplicate onSchedule imports from firebase-functions/v2/scheduler
  // if we also have it from runtime
  if (content.includes("from './runtime'") || content.includes('from "../runtime"') || content.includes("from '../runtime'")) {
    // Check if there's a direct import of onSchedule from firebase-functions
    const directScheduleImport = /import\s*\{\s*onSchedule\s*\}\s*from\s*['"]firebase-functions\/v2\/scheduler['"];?\n?/g;
    if (directScheduleImport.test(content)) {
      content = content.replace(directScheduleImport, '');
      fileFixed = true;
    }
    
    // Also check for onSchedule in combined imports
    const combinedImport = /import\s*\{([^}]*onSchedule[^}]*)\}\s*from\s*['"]firebase-functions\/v2\/scheduler['"];?/g;
    let match;
    while ((match = combinedImport.exec(content)) !== null) {
      const imports = match[1];
      const newImports = imports.split(',')
        .map(i => i.trim())
        .filter(i => i !== 'onSchedule' && i !== '')
        .join(', ');
      
      if (newImports) {
        content = content.replace(match[0], `import { ${newImports} } from 'firebase-functions/v2/scheduler';`);
      } else {
        content = content.replace(match[0] + '\n', '');
        content = content.replace(match[0], '');
      }
      fileFixed = true;
    }
  }

  // Fix 2: Convert pubsub.schedule patterns to onSchedule
  // Pattern: pubsub.schedule("cron").timeZone("tz").onRun(async (context) => {
  const pubsubSchedulePattern = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  if (pubsubSchedulePattern.test(content)) {
    content = content.replace(pubsubSchedulePattern, (match, cron, tz, param) => {
      return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) => {`;
    });
    fileFixed = true;
  }

  // Pattern: pubsub.schedule("cron").onRun(async (context) => {
  const pubsubScheduleNoTzPattern = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>\s*\{/g;
  if (pubsubScheduleNoTzPattern.test(content)) {
    content = content.replace(pubsubScheduleNoTzPattern, (match, cron, param) => {
      return `onSchedule("${cron}", async (event) => {`;
    });
    fileFixed = true;
  }

  // Fix 3: Ensure onSchedule is imported from runtime if used
  if (content.includes('onSchedule(') && !content.includes("from './runtime'") && !content.includes("from '../runtime'") && !content.includes('from "./runtime"') && !content.includes('from "../runtime"')) {
    // Add import from runtime
    const importMatch = content.match(/^(import\s+.*?;\n)/m);
    if (importMatch) {
      const insertPos = content.indexOf(importMatch[0]) + importMatch[0].length;
      content = content.slice(0, insertPos) + `import { onSchedule } from '${runtimePath}';\n` + content.slice(insertPos);
      fileFixed = true;
    }
  }

  // Fix 4: Fix duplicate onSchedule in runtime imports
  // Pattern: import { ..., onSchedule, ..., onSchedule, ... } from './runtime'
  const runtimeImportPattern = /import\s*\{([^}]+)\}\s*from\s*['"]\.\.?\/runtime['"];?/g;
  let runtimeMatch;
  while ((runtimeMatch = runtimeImportPattern.exec(content)) !== null) {
    const imports = runtimeMatch[1].split(',').map(i => i.trim()).filter(i => i);
    const uniqueImports = [...new Set(imports)];
    if (imports.length !== uniqueImports.length) {
      const newImport = `import { ${uniqueImports.join(', ')} } from '${runtimePath}';`;
      content = content.replace(runtimeMatch[0], newImport);
      fileFixed = true;
    }
  }

  if (fileFixed && content !== originalContent) {
    fs.writeFileSync(filePath, content);
    filesFixed++;
    console.log(`Fixed: ${relativePath}`);
  }
}

console.log(`\nTotal files fixed: ${filesFixed}`);
