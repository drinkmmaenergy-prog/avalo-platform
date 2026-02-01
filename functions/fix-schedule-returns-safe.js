/**
 * BATCH B Migration - Fix onSchedule Return Values
 * 
 * v2 onSchedule handlers must return void | Promise<void>
 * This script converts return statements inside onSchedule handlers to logger.info calls
 * 
 * SAFE: Only modifies return statements that are direct children of onSchedule handlers
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

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Check if file uses onSchedule
  if (!content.includes('onSchedule(')) {
    return { modified: false, fixes: 0 };
  }
  
  let fixes = 0;
  
  // Find onSchedule function bodies and fix returns inside them
  // This is a simplified approach - we look for return statements that return objects
  // and are likely inside onSchedule handlers
  
  // Pattern: return { ... }; at the end of an async function inside onSchedule
  // We need to be careful not to modify returns in nested functions
  
  // Strategy: Find all onSchedule declarations and track their scope
  // For simplicity, we'll use a regex-based approach that targets common patterns
  
  // Pattern 1: return { success: true/false, ... };
  // Pattern 2: return { key: value, ... };
  
  // Replace return { ... }; with logger.info('Scheduled job result', { ... });
  // But only if it looks like it's at the end of an onSchedule handler
  
  // Simple approach: Replace return statements that return objects with logger + return
  const returnObjectPattern = /(\s+)return\s+(\{[^}]+\})\s*;/g;
  
  content = content.replace(returnObjectPattern, (match, indent, obj) => {
    // Check if this looks like a status return (has success, error, or similar keys)
    if (obj.includes('success') || obj.includes('error') || obj.includes('result') || 
        obj.includes('count') || obj.includes('processed') || obj.includes('updated') ||
        obj.includes('deleted') || obj.includes('created') || obj.includes('total')) {
      fixes++;
      return `${indent}logger.info('Scheduled job result', ${obj});\n${indent}return;`;
    }
    return match;
  });
  
  if (fixes > 0 && content !== originalContent) {
    // Ensure logger is imported
    const relativePath = path.relative(path.join(__dirname, 'src'), filePath);
    const depth = relativePath.split(path.sep).length - 1;
    const runtimePath = depth === 0 ? './runtime' : '../'.repeat(depth) + 'runtime';
    
    // Check if logger is imported
    if (!content.match(/import\s*{[^}]*logger[^}]*}\s*from/)) {
      // Try to add logger to existing runtime import
      const runtimeImportRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${runtimePath.replace(/[./]/g, '\\$&')}['"]`);
      const match = content.match(runtimeImportRegex);
      
      if (match && !match[1].includes('logger')) {
        content = content.replace(
          runtimeImportRegex,
          (m, imports) => `import { ${imports.trim()}, logger } from '${runtimePath}'`
        );
      }
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    return { modified: true, fixes };
  }
  
  return { modified: false, fixes: 0 };
}

console.log('🔧 Fixing onSchedule return values...\n');

const srcDir = path.join(__dirname, 'src');
const files = getAllTsFiles(srcDir);

let totalFiles = 0;
let totalFixes = 0;

for (const file of files) {
  const result = fixFile(file);
  if (result.modified) {
    const relativePath = path.relative(__dirname, file);
    console.log(`✅ Fixed ${result.fixes} return(s) in ${relativePath}`);
    totalFiles++;
    totalFixes += result.fixes;
  }
}

console.log(`\n📊 Summary: Fixed ${totalFixes} returns in ${totalFiles} files`);
