/**
 * BATCH B Migration Script: v1 pubsub.schedule -> v2 onSchedule
 * 
 * This script migrates Firebase scheduled functions from v1 to v2 API.
 * 
 * v1 Pattern:
 *   export const myJob = functions.pubsub.schedule('every 24 hours')
 *     .timeZone('UTC')
 *     .onRun(async (context) => { ... });
 * 
 * v2 Pattern:
 *   export const myJob = onSchedule({ schedule: 'every 24 hours', timeZone: 'UTC' }, async (event) => { ... });
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Patterns to detect v1 scheduled functions
const V1_PATTERNS = {
  // functions.pubsub.schedule('...').timeZone('...').onRun(...)
  scheduleWithTimezoneAndOnRun: /functions\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
  // functions.pubsub.schedule('...').onRun(...)
  scheduleWithOnRun: /functions\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
  // pubsub.schedule('...').timeZone('...').onRun(...)
  pubsubScheduleWithTimezoneAndOnRun: /pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
  // pubsub.schedule('...').onRun(...)  
  pubsubScheduleWithOnRun: /pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
};

// Files to process (collect all .ts files in src directory recursively)
function getTypescriptFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getTypescriptFiles(filePath, fileList);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let hasChanges = false;
  
  // Track what needs to be imported
  let needsOnScheduleImport = false;
  let needsLoggerImport = false;
  
  // Check if file has v1 patterns
  const hasV1Patterns = 
    /functions\.pubsub\s*\.schedule/.test(content) ||
    /pubsub\s*\.schedule/.test(content);
  
  if (!hasV1Patterns) {
    return { modified: false, file: filePath };
  }
  
  console.log(`Processing: ${filePath}`);
  
  // Pattern 1: functions.pubsub.schedule('...').timeZone('...').onRun(async (context) => {
  content = content.replace(
    /functions\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
    (match, q1, schedule, q2, timezone, contextVar) => {
      needsOnScheduleImport = true;
      const eventVar = contextVar || 'event';
      return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async (${eventVar}) => {`;
    }
  );
  
  // Pattern 2: functions.pubsub.schedule('...').onRun(async (context) => {
  content = content.replace(
    /functions\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
    (match, q1, schedule, contextVar) => {
      needsOnScheduleImport = true;
      const eventVar = contextVar || 'event';
      return `onSchedule('${schedule}', async (${eventVar}) => {`;
    }
  );
  
  // Pattern 3: pubsub.schedule('...').timeZone('...').onRun(async (context) => {
  content = content.replace(
    /pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
    (match, q1, schedule, q2, timezone, contextVar) => {
      needsOnScheduleImport = true;
      const eventVar = contextVar || 'event';
      return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async (${eventVar}) => {`;
    }
  );
  
  // Pattern 4: pubsub.schedule('...').onRun(async (context) => {
  content = content.replace(
    /pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*(\w*)?\s*\)\s*=>\s*\{/g,
    (match, q1, schedule, contextVar) => {
      needsOnScheduleImport = true;
      const eventVar = contextVar || 'event';
      return `onSchedule('${schedule}', async (${eventVar}) => {`;
    }
  );
  
  // Pattern 5: Handle .onRun(async () => { without context
  content = content.replace(
    /functions\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g,
    (match, q1, schedule, q2, timezone) => {
      needsOnScheduleImport = true;
      return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async () => {`;
    }
  );
  
  content = content.replace(
    /functions\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g,
    (match, q1, schedule) => {
      needsOnScheduleImport = true;
      return `onSchedule('${schedule}', async () => {`;
    }
  );
  
  content = content.replace(
    /pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g,
    (match, q1, schedule, q2, timezone) => {
      needsOnScheduleImport = true;
      return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async () => {`;
    }
  );
  
  content = content.replace(
    /pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(\s*\)\s*=>\s*\{/g,
    (match, q1, schedule) => {
      needsOnScheduleImport = true;
      return `onSchedule('${schedule}', async () => {`;
    }
  );
  
  // Check if changes were made
  if (content !== originalContent) {
    hasChanges = true;
    
    // Add or update runtime import for onSchedule if needed
    if (needsOnScheduleImport) {
      // Check if onSchedule is already imported
      if (!content.includes('onSchedule')) {
        // onSchedule was added but not imported, we need to add it
        needsOnScheduleImport = true;
      }
      
      // Check existing imports from runtime
      const runtimeImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*(['"`])\.\/runtime\2/);
      if (runtimeImportMatch) {
        // Add onSchedule to existing runtime import if not there
        const imports = runtimeImportMatch[1];
        if (!imports.includes('onSchedule')) {
          const newImports = imports.trim() + ', onSchedule';
          content = content.replace(
            /import\s*\{([^}]+)\}\s*from\s*(['"`])\.\/runtime\2/,
            `import { ${newImports} } from './runtime'`
          );
        }
      } else {
        // Check if there's a direct import from firebase-functions/v2/scheduler
        const v2SchedulerImport = content.match(/import\s*\{([^}]+)\}\s*from\s*(['"`])firebase-functions\/v2\/scheduler\2/);
        if (v2SchedulerImport) {
          const imports = v2SchedulerImport[1];
          if (!imports.includes('onSchedule')) {
            const newImports = imports.trim() + ', onSchedule';
            content = content.replace(
              /import\s*\{([^}]+)\}\s*from\s*(['"`])firebase-functions\/v2\/scheduler\2/,
              `import { ${newImports} } from 'firebase-functions/v2/scheduler'`
            );
          }
        } else {
          // Need to add the import
          // Find a good place to add it (after other imports or at the top)
          const firstImport = content.search(/^import\s/m);
          if (firstImport >= 0) {
            // Find the line after the import block
            const importBlockEnd = content.indexOf('\n\n', firstImport);
            if (importBlockEnd > 0) {
              content = content.slice(0, importBlockEnd) + 
                        "\nimport { onSchedule, logger } from './runtime';" + 
                        content.slice(importBlockEnd);
            } else {
              // Add at the very beginning
              content = "import { onSchedule, logger } from './runtime';\n" + content;
            }
          } else {
            // No imports found, add at top
            content = "import { onSchedule, logger } from './runtime';\n" + content;
          }
        }
      }
    }
    
    // Remove unused v1 pubsub imports
    // Check if pubsub is still used elsewhere
    const pubsubStillUsed = /pubsub\.(?!schedule)/.test(content);
    if (!pubsubStillUsed) {
      // Remove pubsub from imports
      content = content.replace(/,?\s*pubsub\s*(?=,|\})/g, '');
      content = content.replace(/{\s*pubsub\s*,/g, '{');
      content = content.replace(/import\s*\{\s*\}\s*from\s*['"`]firebase-functions\/v2['"`];?\n?/g, '');
    }
    
    // Clean up remaining v1 patterns that might be multiline
    // Pattern: assignment with schedule
    content = content.replace(
      /=\s*functions\s*\n?\s*\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
      (match, q1, schedule, q2, timezone, params) => {
        return `= onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async (${params || 'event'}) => {`;
      }
    );
    
    content = content.replace(
      /=\s*functions\s*\n?\s*\.pubsub\s*\n?\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g,
      (match, q1, schedule, params) => {
        return `= onSchedule('${schedule}', async (${params || 'event'}) => {`;
      }
    );
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Modified: ${filePath}`);
    return { modified: true, file: filePath };
  }
  
  return { modified: false, file: filePath };
}

// Main
console.log('BATCH B Migration: v1 pubsub.schedule -> v2 onSchedule');
console.log('='.repeat(60));

const files = getTypescriptFiles(srcDir);
console.log(`Found ${files.length} TypeScript files to scan\n`);

const results = {
  modified: [],
  unchanged: [],
  errors: []
};

files.forEach(file => {
  try {
    const result = migrateFile(file);
    if (result.modified) {
      results.modified.push(result.file);
    } else {
      results.unchanged.push(result.file);
    }
  } catch (err) {
    console.error(`  ✗ Error processing ${file}: ${err.message}`);
    results.errors.push({ file, error: err.message });
  }
});

console.log('\n' + '='.repeat(60));
console.log('Migration Summary:');
console.log(`  Modified: ${results.modified.length} files`);
console.log(`  Unchanged: ${results.unchanged.length} files`);
console.log(`  Errors: ${results.errors.length} files`);

if (results.modified.length > 0) {
  console.log('\nModified files:');
  results.modified.forEach(f => console.log(`  - ${path.relative(srcDir, f)}`));
}

if (results.errors.length > 0) {
  console.log('\nErrors:');
  results.errors.forEach(e => console.log(`  - ${path.relative(srcDir, e.file)}: ${e.error}`));
}
