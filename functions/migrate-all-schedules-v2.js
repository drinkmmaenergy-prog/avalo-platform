/**
 * BATCH B Migration - Complete Schedule Migration v1→v2
 * 
 * Handles ALL v1 schedule patterns:
 * 1. functions.pubsub.schedule('cron').onRun(async (context) => {...})
 * 2. functions.pubsub.schedule('cron').timeZone('TZ').onRun(async (context) => {...})
 * 3. functions.region('r').pubsub.schedule('cron').onRun(...)
 * 4. functions.runWith({...}).pubsub.schedule('cron').onRun(...)
 * 5. functions.region().onSchedule() - INVALID, needs full rewrite
 * 6. functions.runWith().onSchedule() - INVALID, needs full rewrite
 * 
 * Converts to v2:
 * onSchedule({ schedule: 'cron', timeZone: 'TZ', region: 'r' }, async (event) => {...})
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

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fixes = 0;
  
  // Calculate relative path for runtime import
  const relativePath = path.relative(path.join(__dirname, 'src'), filePath);
  const depth = relativePath.split(path.sep).length - 1;
  const runtimePath = depth === 0 ? './runtime' : '../'.repeat(depth) + 'runtime';
  
  // Pattern 1: functions.pubsub.schedule('cron').timeZone('TZ').onRun(async (context) => {
  // Convert to: onSchedule({ schedule: 'cron', timeZone: 'TZ' }, async (event) => {
  const pattern1 = /functions\.pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern1, (match, cron, tz) => {
    fixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) =>`;
  });
  
  // Pattern 2: functions.pubsub.schedule('cron').onRun(async (context) => {
  // Convert to: onSchedule("cron", async (event) => {
  const pattern2 = /functions\.pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern2, (match, cron) => {
    fixes++;
    return `onSchedule("${cron}", async (event) =>`;
  });
  
  // Pattern 3: functions.pubsub.schedule('cron').onRun(async () => {
  // Convert to: onSchedule("cron", async (event) => {
  const pattern3 = /functions\.pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>/g;
  content = content.replace(pattern3, (match, cron) => {
    fixes++;
    return `onSchedule("${cron}", async (event) =>`;
  });
  
  // Pattern 4: functions.region('r').pubsub.schedule('cron').onRun(async (context) => {
  // Convert to: onSchedule({ schedule: 'cron', region: 'r' }, async (event) => {
  const pattern4 = /functions\s*\n?\s*\.region\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\n?\s*\.pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern4, (match, region, cron) => {
    fixes++;
    return `onSchedule({ schedule: "${cron}", region: "${region}" }, async (event) =>`;
  });
  
  // Pattern 5: functions.runWith({...}).pubsub.schedule('cron').onRun(async (context) => {
  // Convert to: onSchedule("cron", async (event) => {
  // Note: runWith options are dropped as v2 uses different config
  const pattern5 = /functions\s*\n?\s*\.runWith\s*\(\s*\{[^}]*\}\s*\)\s*\n?\s*\.pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern5, (match, cron) => {
    fixes++;
    return `onSchedule("${cron}", async (event) =>`;
  });
  
  // Pattern 6: functions.runWith({...}).pubsub.schedule('cron').timeZone('TZ').onRun(async (context) => {
  const pattern6 = /functions\s*\n?\s*\.runWith\s*\(\s*\{[^}]*\}\s*\)\s*\n?\s*\.pubsub\.schedule\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.timeZone\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(?:context)?\s*\)\s*=>/g;
  content = content.replace(pattern6, (match, cron, tz) => {
    fixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) =>`;
  });
  
  // Pattern 7: functions.region('r').onSchedule({...}, async (event) => {
  // This is INVALID - onSchedule is not a method on functions
  // Convert to: onSchedule({ ..., region: 'r' }, async (event) => {
  const pattern7 = /functions\s*\n?\s*\.region\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\n?\s*\.onSchedule\s*\(\s*\{\s*schedule:\s*['"]([^'"]+)['"]\s*,\s*timeZone:\s*['"]([^'"]+)['"]\s*\}\s*,\s*async\s*\(\s*event\s*\)\s*=>/g;
  content = content.replace(pattern7, (match, region, cron, tz) => {
    fixes++;
    return `onSchedule({ schedule: "${cron}", timeZone: "${tz}", region: "${region}" }, async (event) =>`;
  });
  
  // Pattern 8: functions.runWith({...}).onSchedule({...}, async (event) => {
  // This is INVALID - onSchedule is not a method on functions
  // Convert to: onSchedule({...}, async (event) => {
  const pattern8 = /functions\s*\n?\s*\.runWith\s*\(\s*\{[^}]*\}\s*\)\s*\n?\s*\.onSchedule\s*\(\s*(\{[^}]+\})\s*,\s*async\s*\(\s*event\s*\)\s*=>/g;
  content = content.replace(pattern8, (match, options) => {
    fixes++;
    return `onSchedule(${options}, async (event) =>`;
  });
  
  // Pattern 9: functions.runWith({...}).onSchedule("cron", async (event) => {
  const pattern9 = /functions\s*\n?\s*\.runWith\s*\(\s*\{[^}]*\}\s*\)\s*\n?\s*\.onSchedule\s*\(\s*['"]([^'"]+)['"]\s*,\s*async\s*\(\s*event\s*\)\s*=>/g;
  content = content.replace(pattern9, (match, cron) => {
    fixes++;
    return `onSchedule("${cron}", async (event) =>`;
  });
  
  // Pattern 10: functions.region('r').onSchedule("cron", async (event) => {
  const pattern10 = /functions\s*\n?\s*\.region\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\n?\s*\.onSchedule\s*\(\s*['"]([^'"]+)['"]\s*,\s*async\s*\(\s*event\s*\)\s*=>/g;
  content = content.replace(pattern10, (match, region, cron) => {
    fixes++;
    return `onSchedule({ schedule: "${cron}", region: "${region}" }, async (event) =>`;
  });
  
  if (fixes > 0 && content !== originalContent) {
    // Ensure onSchedule is imported from runtime
    if (!content.match(/import\s*{[^}]*onSchedule[^}]*}\s*from\s*['"][^'"]*runtime['"]/)) {
      // Check if there's already a runtime import
      const runtimeImportRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${runtimePath.replace(/[./]/g, '\\$&')}['"]`);
      const match = content.match(runtimeImportRegex);
      
      if (match && !match[1].includes('onSchedule')) {
        // Add onSchedule to existing runtime import
        content = content.replace(
          runtimeImportRegex,
          (m, imports) => `import { ${imports.trim()}, onSchedule } from '${runtimePath}'`
        );
      } else if (!match) {
        // Add new runtime import after other imports
        const lastImportMatch = content.match(/^(import\s+.+from\s+['"][^'"]+['"];?\s*\n)+/m);
        if (lastImportMatch) {
          const insertPos = lastImportMatch.index + lastImportMatch[0].length;
          content = content.slice(0, insertPos) + 
            `import { onSchedule } from '${runtimePath}';\n` + 
            content.slice(insertPos);
        } else {
          // No imports found, add at the beginning
          content = `import { onSchedule } from '${runtimePath}';\n` + content;
        }
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    return { modified: true, fixes };
  }
  
  return { modified: false, fixes: 0 };
}

console.log('🔧 Migrating ALL schedule patterns to v2...\n');

const srcDir = path.join(__dirname, 'src');
const files = getAllTsFiles(srcDir);

let totalFiles = 0;
let totalFixes = 0;

for (const file of files) {
  const result = migrateFile(file);
  if (result.modified) {
    const relativePath = path.relative(__dirname, file);
    console.log(`✅ Fixed ${result.fixes} pattern(s) in ${relativePath}`);
    totalFiles++;
    totalFixes += result.fixes;
  }
}

console.log(`\n📊 Summary: Fixed ${totalFixes} patterns in ${totalFiles} files`);
