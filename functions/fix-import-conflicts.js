/**
 * Fix Import Conflicts - Remove conflicting imports from runtime
 * 
 * This script finds files where:
 * 1. We added imports from './runtime'
 * 2. Those symbols are also declared locally (e.g., `const db = getFirestore()`)
 * 3. Removes the conflicting symbols from the runtime import
 */

const fs = require('fs');
const path = require('path');

// Files to skip
const SKIP_FILES = new Set([
  'runtime.ts',
  'init.ts',
  'index.ts',
]);

function getAllTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      getAllTsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !SKIP_FILES.has(entry.name)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function findLocalDeclarations(content) {
  const declarations = new Set();
  
  // Match const/let/var declarations
  const declRegex = /(?:const|let|var)\s+(\w+)\s*=/g;
  let match;
  while ((match = declRegex.exec(content)) !== null) {
    declarations.add(match[1]);
  }
  
  // Match function declarations
  const funcRegex = /function\s+(\w+)\s*\(/g;
  while ((match = funcRegex.exec(content)) !== null) {
    declarations.add(match[1]);
  }
  
  // Match class declarations
  const classRegex = /class\s+(\w+)/g;
  while ((match = classRegex.exec(content)) !== null) {
    declarations.add(match[1]);
  }
  
  return declarations;
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if file has a runtime import
  const runtimeImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]\.\/runtime['"];?/;
  const match = content.match(runtimeImportRegex);
  
  if (!match) {
    return { modified: false, reason: 'no runtime import' };
  }
  
  // Get the imported symbols from runtime
  const importedSymbols = match[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s);
  
  // Find local declarations
  const localDeclarations = findLocalDeclarations(content);
  
  // Find conflicts
  const conflicts = importedSymbols.filter(s => localDeclarations.has(s));
  
  if (conflicts.length === 0) {
    return { modified: false, reason: 'no conflicts' };
  }
  
  // Remove conflicting symbols from the runtime import
  const remainingSymbols = importedSymbols.filter(s => !localDeclarations.has(s));
  
  if (remainingSymbols.length === 0) {
    // Remove the entire import line
    content = content.replace(runtimeImportRegex, '');
    // Clean up empty lines
    content = content.replace(/\n\n\n+/g, '\n\n');
  } else {
    // Replace with remaining symbols
    const newImport = `import { ${remainingSymbols.join(', ')} } from './runtime';`;
    content = content.replace(runtimeImportRegex, newImport);
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  
  return {
    modified: true,
    removed: conflicts,
    remaining: remainingSymbols,
  };
}

function main() {
  const srcDir = path.join(__dirname, 'src');
  
  console.log('🔍 Scanning for import conflicts...');
  const files = getAllTsFiles(srcDir);
  console.log(`📁 Found ${files.length} TypeScript files to check\n`);
  
  let fixedCount = 0;
  let skippedCount = 0;
  const fixedFiles = [];
  
  for (const file of files) {
    const relativePath = path.relative(srcDir, file);
    const result = processFile(file);
    
    if (result.modified) {
      fixedCount++;
      fixedFiles.push(relativePath);
      console.log(`✅ ${relativePath}: Removed [${result.removed.join(', ')}]`);
      if (result.remaining.length > 0) {
        console.log(`   Kept: [${result.remaining.join(', ')}]`);
      }
    } else {
      skippedCount++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   Fixed:   ${fixedCount} files`);
  console.log(`   Skipped: ${skippedCount} files`);
  console.log('='.repeat(60));
  
  if (fixedFiles.length > 0) {
    console.log('\n📝 Fixed files:');
    fixedFiles.forEach(f => console.log(`   - ${f}`));
  }
}

main();
