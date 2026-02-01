/**
 * BATCH B Migration - Comprehensive Schedule Fix
 * 
 * This script fixes ALL schedule-related issues:
 * 1. Adds missing onSchedule imports
 * 2. Converts pubsub.schedule patterns to onSchedule
 * 3. Fixes return value issues (v2 requires void return)
 */

const fs = require('fs');
const path = require('path');

// Get all TypeScript files in src/
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

function getRuntimePath(filePath) {
  const relativePath = path.relative(path.join(__dirname, 'src'), filePath);
  const depth = relativePath.split(path.sep).length - 1;
  return depth === 0 ? './runtime' : '../'.repeat(depth) + 'runtime';
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fixes = [];
  
  const runtimePath = getRuntimePath(filePath);
  
  // Check if file uses onSchedule or pubsub.schedule
  const usesOnSchedule = content.includes('onSchedule(') || content.includes('onSchedule ');
  const usesPubsubSchedule = content.includes('pubsub.schedule');
  
  if (!usesOnSchedule && !usesPubsubSchedule) {
    return { modified: false, fixes: [] };
  }
  
  // STEP 1: Convert pubsub.schedule patterns to onSchedule
  
  // Pattern: pubsub.schedule('cron').timeZone('TZ').onRun(async (context) => {
  const pattern1 = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern1, (match, cron, tz) => {
    fixes.push('pubsub.schedule with timeZone');
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) =>`;
  });
  
  // Pattern: pubsub.schedule('cron').onRun(async (context) => {
  const pattern2 = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern2, (match, cron) => {
    fixes.push('pubsub.schedule');
    return `onSchedule("${cron}", async (event) =>`;
  });
  
  // Pattern: pubsub.schedule('cron').onRun(async () => {
  const pattern3 = /pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>/g;
  content = content.replace(pattern3, (match, cron) => {
    fixes.push('pubsub.schedule no args');
    return `onSchedule("${cron}", async (event) =>`;
  });
  
  // STEP 2: Ensure onSchedule is imported if used
  if (content.includes('onSchedule(') || content.includes('onSchedule ')) {
    // Check if onSchedule is already imported
    const hasOnScheduleImport = content.match(/import\s*{[^}]*onSchedule[^}]*}\s*from\s*['"][^'"]*runtime['"]/);
    
    if (!hasOnScheduleImport) {
      // Try to add to existing runtime import
      const runtimeImportRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${runtimePath.replace(/[./]/g, '\\$&')}['"]`);
      const match = content.match(runtimeImportRegex);
      
      if (match && !match[1].includes('onSchedule')) {
        content = content.replace(
          runtimeImportRegex,
          (m, imports) => `import { ${imports.trim()}, onSchedule } from '${runtimePath}'`
        );
        fixes.push('added onSchedule to existing import');
      } else if (!match) {
        // Add new runtime import after other imports
        const lastImportMatch = content.match(/^(import\s+.+from\s+['"][^'"]+['"];?\s*\n)+/m);
        if (lastImportMatch) {
          const insertPos = lastImportMatch.index + lastImportMatch[0].length;
          content = content.slice(0, insertPos) + 
            `import { onSchedule } from '${runtimePath}';\n` + 
            content.slice(insertPos);
          fixes.push('added new onSchedule import');
        } else {
          // No imports found, add at the beginning after any comments
          const firstCodeMatch = content.match(/^(\/\*[\s\S]*?\*\/\s*\n|\/\/.*\n)*/);
          const insertPos = firstCodeMatch ? firstCodeMatch[0].length : 0;
          content = content.slice(0, insertPos) + 
            `import { onSchedule } from '${runtimePath}';\n` + 
            content.slice(insertPos);
          fixes.push('added onSchedule import at top');
        }
      }
    }
  }
  
  // STEP 3: Fix return values in onSchedule handlers
  // This is tricky - we need to find return statements inside onSchedule handlers
  // and convert them to logger.info calls
  
  // Simple approach: Find return { ... }; patterns and convert them
  // We'll be conservative and only convert obvious status returns
  const returnPattern = /(\s+)return\s+(\{[^}]+\})\s*;/g;
  content = content.replace(returnPattern, (match, indent, obj) => {
    // Only convert if it looks like a status return
    if (obj.includes('success') || obj.includes('error') || obj.includes('result') || 
        obj.includes('count') || obj.includes('processed') || obj.includes('updated') ||
        obj.includes('deleted') || obj.includes('created') || obj.includes('total') ||
        obj.includes('refreshed') || obj.includes('degraded') || obj.includes('decayed') ||
        obj.includes('removed') || obj.includes('cleaned') || obj.includes('partnersProcessed') ||
        obj.includes('partnersChecked') || obj.includes('ticketsClosed') || obj.includes('notificationsSent') ||
        obj.includes('reviewsProcessed') || obj.includes('optimized') || obj.includes('analyzed') ||
        obj.includes('calculated') || obj.includes('actionsExecuted') || obj.includes('globalScore')) {
      fixes.push('converted return to void');
      return `${indent}console.log('Scheduled job result:', ${obj});\n${indent}return;`;
    }
    return match;
  });
  
  // Also handle return null; which is common in v1
  content = content.replace(/(\s+)return\s+null\s*;/g, (match, indent) => {
    fixes.push('removed return null');
    return `${indent}return;`;
  });
  
  if (fixes.length > 0 && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    return { modified: true, fixes };
  }
  
  return { modified: false, fixes: [] };
}

console.log('🔧 Fixing ALL schedule-related issues...\n');

const srcDir = path.join(__dirname, 'src');
const files = getAllTsFiles(srcDir);

let totalFiles = 0;
let totalFixes = 0;

for (const file of files) {
  const result = fixFile(file);
  if (result.modified) {
    const relativePath = path.relative(__dirname, file);
    console.log(`✅ ${relativePath}: ${result.fixes.join(', ')}`);
    totalFiles++;
    totalFixes += result.fixes.length;
  }
}

console.log(`\n📊 Summary: Applied ${totalFixes} fixes in ${totalFiles} files`);
