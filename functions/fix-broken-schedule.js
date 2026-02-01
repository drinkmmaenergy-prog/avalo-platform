/**
 * BATCH B Migration: Fix all broken onSchedule patterns
 * 
 * The previous migration left patterns like:
 *   onSchedule('cron',
 *     .onRun(async (context) => {
 * 
 * This script fixes them to:
 *   onSchedule('cron', async (event) => {
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function processFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Calculate relative path for runtime import
  const relativePath = path.relative(srcDir, filePath);
  const depth = relativePath.split(path.sep).length - 1;
  const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';
  
  // Pattern 1: onSchedule('cron',\n  .onRun(async (context) => {
  // This is the most common broken pattern
  content = content.replace(
    /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*,?\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
    (match, quote, cron, params) => {
      return `onSchedule('${cron}', async (event) => {`;
    }
  );
  
  // Pattern 2: onSchedule('cron',\n  .timeZone('tz')\n  .onRun(async (context) => {
  content = content.replace(
    /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*,?\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
    (match, q1, cron, q2, tz, params) => {
      return `onSchedule({ schedule: '${cron}', timeZone: '${tz}' }, async (event) => {`;
    }
  );
  
  // Pattern 3: onSchedule('cron'\n  .timeZone('tz')\n  .onRun(async (context) => {
  // (missing comma after cron)
  content = content.replace(
    /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*\n\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
    (match, q1, cron, q2, tz, params) => {
      return `onSchedule({ schedule: '${cron}', timeZone: '${tz}' }, async (event) => {`;
    }
  );
  
  // Pattern 4: onSchedule('cron'\n  .onRun(async (context) => {
  // (missing comma, no timeZone)
  content = content.replace(
    /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*\n\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
    (match, q1, cron, params) => {
      return `onSchedule('${cron}', async (event) => {`;
    }
  );
  
  // Pattern 5: onSchedule('cron', // comment\n  .onRun(async (context) => {
  content = content.replace(
    /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*,?\s*\/\/[^\n]*\n\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
    (match, q1, cron, params) => {
      return `onSchedule('${cron}', async (event) => {`;
    }
  );
  
  // Pattern 6: onSchedule('cron', // comment\n  .timeZone('tz')\n  .onRun(async (context) => {
  content = content.replace(
    /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*,?\s*\/\/[^\n]*\n\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
    (match, q1, cron, q2, tz, params) => {
      return `onSchedule({ schedule: '${cron}', timeZone: '${tz}' }, async (event) => {`;
    }
  );
  
  // Remove return statements with objects in onSchedule handlers (v2 must return void)
  // Pattern: return { success: true, ... };
  // Only remove if inside an onSchedule handler - this is tricky, so we'll be conservative
  
  // Ensure onSchedule is imported from runtime
  if (content.includes('onSchedule(') && !content.includes("from './runtime'") && !content.includes("from '../runtime'") && !content.includes("from '../../runtime'")) {
    // Check if there's already a runtime import we can extend
    const runtimeImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*(['"`])\.\.?\/runtime\2/);
    if (runtimeImportMatch) {
      // Extend existing import
      const existingImports = runtimeImportMatch[1];
      if (!existingImports.includes('onSchedule')) {
        content = content.replace(
          /import\s*\{([^}]+)\}\s*from\s*(['"`])(\.\.?\/runtime)\2/,
          (match, imports, q, path) => {
            return `import { ${imports.trim()}, onSchedule, logger } from ${q}${path}${q}`;
          }
        );
      }
    } else {
      // Add new import after first import
      const firstImportEnd = content.indexOf('\n', content.indexOf('import '));
      if (firstImportEnd > 0) {
        content = content.slice(0, firstImportEnd + 1) + 
          `import { onSchedule, logger } from '${runtimePath}';\n` + 
          content.slice(firstImportEnd + 1);
      }
    }
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      callback(filePath);
    }
  }
}

console.log('Fixing broken onSchedule patterns...');
console.log('='.repeat(60));

let fixed = 0;
let total = 0;

walkDir(srcDir, (filePath) => {
  total++;
  const relativePath = path.relative(srcDir, filePath);
  if (processFile(filePath)) {
    console.log(`Fixed: ${relativePath}`);
    fixed++;
  }
});

console.log('='.repeat(60));
console.log(`Processed ${total} files, fixed ${fixed} files`);
