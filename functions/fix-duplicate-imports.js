/**
 * Fix TS2440 duplicate import errors
 * 
 * Pattern: File imports X from './init' AND from './runtime'
 * Fix: Remove the duplicate import from './init'
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

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

let totalFixed = 0;

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Check if file has both init and runtime imports
  const hasInitImport = /import\s*\{[^}]*\}\s*from\s*['"]\.\/init['"]/.test(content);
  const hasRuntimeImport = /import\s*\{[^}]*\}\s*from\s*['"]\.\/runtime['"]/.test(content);
  
  if (hasInitImport && hasRuntimeImport) {
    // Extract what's imported from init
    const initMatch = content.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/init['"]/);
    if (initMatch) {
      const initImports = initMatch[1].split(',').map(s => s.trim()).filter(s => s);
      
      // Check if any of these are also in runtime import
      const runtimeMatch = content.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/runtime['"]/);
      if (runtimeMatch) {
        const runtimeImports = runtimeMatch[1].split(',').map(s => s.trim()).filter(s => s);
        
        // Find duplicates
        const duplicates = initImports.filter(i => runtimeImports.includes(i));
        
        if (duplicates.length > 0) {
          // Remove duplicates from init import
          const remainingInitImports = initImports.filter(i => !duplicates.includes(i));
          
          if (remainingInitImports.length === 0) {
            // Remove entire init import line
            content = content.replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/init['"];?\n?/g, '');
          } else {
            // Update init import to only have non-duplicates
            content = content.replace(
              /import\s*\{[^}]*\}\s*from\s*['"]\.\/init['"]/,
              `import { ${remainingInitImports.join(', ')} } from './init'`
            );
          }
          
          modified = true;
          console.log(`  Fixed in ${path.relative(srcDir, filePath)}: removed duplicates [${duplicates.join(', ')}] from init import`);
        }
      }
    }
  }
  
  // Also fix cases where HttpsError is imported from both places
  if (content.includes("import { HttpsError }") && content.includes("const HttpsError")) {
    // Remove the import
    content = content.replace(/import\s*\{\s*HttpsError\s*\}\s*from\s*['"][^'"]+['"];?\n?/g, '');
    modified = true;
    console.log(`  Fixed in ${path.relative(srcDir, filePath)}: removed HttpsError import (local declaration exists)`);
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    totalFixed++;
  }
}

console.log('Fixing duplicate import patterns...');
walkDir(srcDir, fixFile);
console.log(`Fixed ${totalFixed} files`);
