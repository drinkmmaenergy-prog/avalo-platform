/**
 * Add logger import to files that use logger but don't import it
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files that need logger import based on build output
const filesNeedingLogger = [
  'compliancePack55.ts',
  'pack115-reputation-endpoints.ts',
  'pack193-sexuality-consent-functions.ts',
  'pack301-daily-churn.ts',
  'pack301-winback.ts',
  'pack306-verification.ts',
  'pack328a-identity-verification.ts',
  'pack336-aggregation-cron.ts',
  'pack346-alert-routing.ts',
  'pack352-daily-aggregator.ts',
  'pack356-kpi-extensions.ts',
];

function addLoggerImport(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if logger is used
  if (!content.includes('logger.')) {
    console.log(`No logger usage in ${path.basename(filePath)}`);
    return false;
  }
  
  // Check if logger is already imported
  if (content.includes("import { logger }") || 
      content.includes("import {logger}") ||
      content.includes(", logger }") ||
      content.includes(", logger,") ||
      content.includes("{ logger,")) {
    console.log(`Logger already imported in ${path.basename(filePath)}`);
    return false;
  }
  
  // Check if there's a runtime import we can extend
  const runtimeImportMatch = content.match(/import\s*{([^}]+)}\s*from\s*['"]\.\/runtime['"]/);
  
  if (runtimeImportMatch) {
    // Add logger to existing runtime import
    const existingImports = runtimeImportMatch[1];
    if (!existingImports.includes('logger')) {
      const newImports = existingImports.trim() + ', logger';
      content = content.replace(runtimeImportMatch[0], `import { ${newImports} } from './runtime'`);
      fs.writeFileSync(filePath, content);
      console.log(`Added logger to runtime import in ${path.basename(filePath)}`);
      return true;
    }
  }
  
  // Check for init import
  const initImportMatch = content.match(/import\s*{([^}]+)}\s*from\s*['"]\.\/init['"]/);
  
  if (initImportMatch) {
    // Add logger to existing init import
    const existingImports = initImportMatch[1];
    if (!existingImports.includes('logger')) {
      const newImports = existingImports.trim() + ', logger';
      content = content.replace(initImportMatch[0], `import { ${newImports} } from './init'`);
      fs.writeFileSync(filePath, content);
      console.log(`Added logger to init import in ${path.basename(filePath)}`);
      return true;
    }
  }
  
  // No existing runtime/init import, add a new one after the first import
  const firstImportMatch = content.match(/^import\s+.+$/m);
  if (firstImportMatch) {
    const insertPos = firstImportMatch.index + firstImportMatch[0].length;
    content = content.slice(0, insertPos) + "\nimport { logger } from './runtime';" + content.slice(insertPos);
    fs.writeFileSync(filePath, content);
    console.log(`Added new logger import in ${path.basename(filePath)}`);
    return true;
  }
  
  console.log(`Could not add logger import to ${path.basename(filePath)}`);
  return false;
}

// Run fixes
console.log('Adding logger imports...\n');

let fixedCount = 0;
for (const file of filesNeedingLogger) {
  const filePath = path.join(srcDir, file);
  if (addLoggerImport(filePath)) {
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
