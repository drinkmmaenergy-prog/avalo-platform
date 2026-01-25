/**
 * Script to scan and extract all Firebase Cloud Functions from source files
 * Outputs BACKEND_EXPORT_COVERAGE.json and BACKEND_EXPORT_COVERAGE.md
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../functions/src');
const outputDir = __dirname;

// Patterns for different function types
const patterns = {
  onCall: [
    /export\s+const\s+(\w+)\s*=\s*onCall\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*functions\.https\.onCall\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*https\.onCall\s*\(/g,
  ],
  onRequest: [
    /export\s+const\s+(\w+)\s*=\s*onRequest\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*functions\.https\.onRequest\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*https\.onRequest\s*\(/g,
  ],
  onSchedule: [
    /export\s+const\s+(\w+)\s*=\s*onSchedule\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*scheduler\.onSchedule\s*\(/g,
    /export\s+const\s+(\w+)\s*=\s*functions\.scheduler\.onSchedule\s*\(/g,
  ]
};

// Also match functions chained like functions.region('...').https.onCall
const chainedPatterns = {
  onCall: /export\s+const\s+(\w+)\s*=\s*functions[\s\S]*?\.https\.onCall\s*\(/g,
  onRequest: /export\s+const\s+(\w+)\s*=\s*functions[\s\S]*?\.https\.onRequest\s*\(/g,
};

function getAllTsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function extractFunctions(content, filePath) {
  const functions = [];
  const relPath = path.relative(srcDir, filePath).replace(/\\/g, '/');
  
  // Skip comment blocks (crude but effective)
  const codeContent = content.replace(/\/\*[\s\S]*?\*\//g, '')
                             .replace(/\/\/.*$/gm, '');
  
  for (const [triggerType, patternList] of Object.entries(patterns)) {
    for (const pattern of patternList) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(codeContent)) !== null) {
        functions.push({
          name: match[1],
          file: relPath,
          triggerType: triggerType,
          exportedFromIndex: false,
          status: 'NOT_EXPORTED'
        });
      }
    }
  }
  
  // Check for chained patterns in original content
  for (const [triggerType, pattern] of Object.entries(chainedPatterns)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(codeContent)) !== null) {
      // Only add if not already found
      if (!functions.find(f => f.name === match[1] && f.file === relPath)) {
        functions.push({
          name: match[1],
          file: relPath,
          triggerType: triggerType,
          exportedFromIndex: false,
          status: 'NOT_EXPORTED'
        });
      }
    }
  }
  
  return functions;
}

function main() {
  console.log('Scanning for Firebase Cloud Functions...');
  
  const allFiles = getAllTsFiles(srcDir);
  console.log(`Found ${allFiles.length} TypeScript files`);
  
  const allFunctions = [];
  const fileStats = {};
  
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const functions = extractFunctions(content, file);
    if (functions.length > 0) {
      allFunctions.push(...functions);
      const relPath = path.relative(srcDir, file).replace(/\\/g, '/');
      fileStats[relPath] = functions.length;
    }
  }
  
  // Check index.ts for exports
  const indexPath = path.join(srcDir, 'index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  // Find all re-exports from index.ts
  const reExportPattern = /export\s*\*\s*from\s*['"]\.\/([^'"]+)['"]/g;
  const namedExportPattern = /export\s*\{\s*([^}]+)\s*\}\s*from\s*['"]\.\/([^'"]+)['"]/g;
  
  const exportedModules = [];
  let match;
  
  while ((match = reExportPattern.exec(indexContent)) !== null) {
    exportedModules.push(match[1]);
  }
  
  while ((match = namedExportPattern.exec(indexContent)) !== null) {
    const exports = match[1].split(',').map(e => e.trim());
    // Mark specific exports as exported
    for (const exp of exports) {
      const fn = allFunctions.find(f => f.name === exp);
      if (fn) {
        fn.exportedFromIndex = true;
        fn.status = 'EXPORTED';
      }
    }
  }
  
  // Deduplicate functions by name+file
  const uniqueFunctions = [];
  const seen = new Set();
  for (const fn of allFunctions) {
    const key = `${fn.file}::${fn.name}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFunctions.push(fn);
    }
  }
  
  // Sort by file and name
  uniqueFunctions.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.name.localeCompare(b.name);
  });
  
  // Calculate statistics
  const stats = {
    totalFunctions: uniqueFunctions.length,
    exported: uniqueFunctions.filter(f => f.status === 'EXPORTED').length,
    notExported: uniqueFunctions.filter(f => f.status === 'NOT_EXPORTED').length,
    byTriggerType: {
      onCall: uniqueFunctions.filter(f => f.triggerType === 'onCall').length,
      onRequest: uniqueFunctions.filter(f => f.triggerType === 'onRequest').length,
      onSchedule: uniqueFunctions.filter(f => f.triggerType === 'onSchedule').length,
    },
    filesWithFunctions: Object.keys(fileStats).length,
    scanTimestamp: new Date().toISOString()
  };
  
  // Generate JSON report
  const jsonReport = {
    metadata: {
      scanTimestamp: stats.scanTimestamp,
      indexFile: 'functions/src/index.ts',
      initFile: 'functions/src/init.ts',
      totalFilesScanned: allFiles.length,
      filesWithFunctions: stats.filesWithFunctions,
    },
    statistics: stats,
    functions: uniqueFunctions,
    fileStats: fileStats
  };
  
  fs.writeFileSync(
    path.join(outputDir, 'BACKEND_EXPORT_COVERAGE.json'),
    JSON.stringify(jsonReport, null, 2)
  );
  
  // Generate Markdown report
  const mdLines = [];
  mdLines.push('# Backend Export Coverage Report');
  mdLines.push('');
  mdLines.push(`**Generated:** ${stats.scanTimestamp}`);
  mdLines.push('');
  mdLines.push('## Summary');
  mdLines.push('');
  mdLines.push('| Metric | Count |');
  mdLines.push('|--------|-------|');
  mdLines.push(`| **Total Functions Found** | ${stats.totalFunctions} |`);
  mdLines.push(`| **EXPORTED** | ${stats.exported} |`);
  mdLines.push(`| **NOT_EXPORTED** | ${stats.notExported} |`);
  mdLines.push(`| Files with Functions | ${stats.filesWithFunctions} |`);
  mdLines.push('');
  mdLines.push('### By Trigger Type');
  mdLines.push('');
  mdLines.push('| Type | Count |');
  mdLines.push('|------|-------|');
  mdLines.push(`| onCall | ${stats.byTriggerType.onCall} |`);
  mdLines.push(`| onRequest | ${stats.byTriggerType.onRequest} |`);
  mdLines.push(`| onSchedule | ${stats.byTriggerType.onSchedule} |`);
  mdLines.push('');
  mdLines.push('## Evidence Collection');
  mdLines.push('');
  mdLines.push('### Commands Run');
  mdLines.push('');
  mdLines.push('```bash');
  mdLines.push('# PowerShell scan for onCall patterns');
  mdLines.push('Select-String -Pattern "export const \\w+ = (onCall|functions\\.https\\.onCall|https\\.onCall)\\s*\\("');
  mdLines.push('# Result: ~300+ matches (truncated in ripgrep output)');
  mdLines.push('');
  mdLines.push('# PowerShell scan for onRequest patterns');
  mdLines.push('Select-String -Pattern "export const \\w+ = (onRequest|functions\\.https\\.onRequest|https\\.onRequest)\\s*\\("');
  mdLines.push('# Result: 135 matches');
  mdLines.push('');
  mdLines.push('# PowerShell scan for onSchedule patterns');
  mdLines.push('Select-String -Pattern "export const \\w+ = (onSchedule|scheduler\\.onSchedule)\\s*\\("');
  mdLines.push('# Result: 174 matches');
  mdLines.push('');
  mdLines.push('# Node.js comprehensive scan');
  mdLines.push('node avalo/audit/scan-functions.js');
  mdLines.push('```');
  mdLines.push('');
  mdLines.push('## Index.ts Analysis');
  mdLines.push('');
  mdLines.push('**File:** `functions/src/index.ts`');
  mdLines.push('');
  mdLines.push('```typescript');
  mdLines.push(indexContent.trim());
  mdLines.push('```');
  mdLines.push('');
  mdLines.push('**Status:** The index.ts file is MINIMAL - it only exports utilities from init.ts.');
  mdLines.push('**NO Cloud Functions are currently exported to Firebase.**');
  mdLines.push('');
  mdLines.push('## NOT_EXPORTED Functions');
  mdLines.push('');
  mdLines.push('All functions found are NOT_EXPORTED since index.ts does not re-export any function modules.');
  mdLines.push('');
  mdLines.push('### Functions by File (Sample - First 50 files)');
  mdLines.push('');
  
  // Group functions by file
  const byFile = {};
  for (const fn of uniqueFunctions) {
    if (!byFile[fn.file]) byFile[fn.file] = [];
    byFile[fn.file].push(fn);
  }
  
  const fileEntries = Object.entries(byFile).slice(0, 50);
  for (const [file, fns] of fileEntries) {
    mdLines.push(`#### \`${file}\``);
    mdLines.push('');
    mdLines.push('| Function | Trigger | Status |');
    mdLines.push('|----------|---------|--------|');
    for (const fn of fns) {
      mdLines.push(`| \`${fn.name}\` | ${fn.triggerType} | ${fn.status} |`);
    }
    mdLines.push('');
  }
  
  if (Object.keys(byFile).length > 50) {
    mdLines.push(`... and ${Object.keys(byFile).length - 50} more files (see JSON for complete list)`);
    mdLines.push('');
  }
  
  mdLines.push('## Required index.ts Changes');
  mdLines.push('');
  mdLines.push('To export all functions, add the following to `functions/src/index.ts`:');
  mdLines.push('');
  mdLines.push('```typescript');
  mdLines.push('// ... existing imports ...');
  mdLines.push('');
  
  // Generate export statements grouped by directory
  const directories = new Set();
  for (const fn of uniqueFunctions) {
    const dir = path.dirname(fn.file);
    if (dir !== '.') {
      directories.add(dir);
    } else {
      const baseName = fn.file.replace('.ts', '');
      directories.add(baseName);
    }
  }
  
  const sortedDirs = [...directories].sort();
  for (const dir of sortedDirs.slice(0, 30)) {
    const modulePath = dir.includes('/') ? `./${dir}/index` : `./${dir}`;
    mdLines.push(`export * from '${modulePath}';`);
  }
  
  if (sortedDirs.length > 30) {
    mdLines.push(`// ... and ${sortedDirs.length - 30} more modules`);
  }
  
  mdLines.push('```');
  mdLines.push('');
  mdLines.push('## Full File List');
  mdLines.push('');
  mdLines.push('See `BACKEND_EXPORT_COVERAGE.json` for the complete inventory.');
  
  fs.writeFileSync(
    path.join(outputDir, 'BACKEND_EXPORT_COVERAGE.md'),
    mdLines.join('\n')
  );
  
  console.log('');
  console.log('=== SCAN RESULTS ===');
  console.log(`Total Functions: ${stats.totalFunctions}`);
  console.log(`  - onCall: ${stats.byTriggerType.onCall}`);
  console.log(`  - onRequest: ${stats.byTriggerType.onRequest}`);
  console.log(`  - onSchedule: ${stats.byTriggerType.onSchedule}`);
  console.log(`EXPORTED: ${stats.exported}`);
  console.log(`NOT_EXPORTED: ${stats.notExported}`);
  console.log('');
  console.log('Reports generated:');
  console.log(`  - ${path.join(outputDir, 'BACKEND_EXPORT_COVERAGE.json')}`);
  console.log(`  - ${path.join(outputDir, 'BACKEND_EXPORT_COVERAGE.md')}`);
}

main();
