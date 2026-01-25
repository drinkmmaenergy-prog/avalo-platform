/**
 * Avalo Functions - Runtime Import Fixer v2
 * 
 * This script:
 * 1. Scans all .ts files in functions/src
 * 2. Identifies missing imports (getFirestore, onCall, z, logger, ethers, etc.)
 * 3. Adds a single import from './runtime' at the top of the file
 * 4. Properly handles multi-line imports
 */

const fs = require('fs');
const path = require('path');

// Symbols that should be imported from runtime.ts
const RUNTIME_SYMBOLS = new Set([
  // Firebase Admin
  'admin',
  'db',
  'auth',
  'storage',
  'getFirestore',
  'FieldValue',
  'Timestamp',
  'timestamp',
  'serverTimestamp',
  'increment',
  'arrayUnion',
  'arrayRemove',
  'deleteField',
  'generateId',
  
  // Firebase Functions v2
  'onCall',
  'onRequest',
  'HttpsError',
  'onSchedule',
  'logger',
  'onDocumentCreated',
  'onDocumentUpdated',
  'onDocumentDeleted',
  'onDocumentWritten',
  'onMessagePublished',
  'onObjectFinalized',
  'onObjectDeleted',
  'CallableRequest',
  'CallableOptions',
  'ScheduleOptions',
  
  // Firebase Functions v1
  'functions',
  'functionsConfig',
  
  // Zod
  'z',
  
  // Ethers
  'ethers',
]);

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

function findUsedSymbols(content) {
  const used = new Set();
  
  for (const symbol of RUNTIME_SYMBOLS) {
    // Match symbol as a word boundary (not part of another identifier)
    const regex = new RegExp(`\\b${symbol}\\b`, 'g');
    if (regex.test(content)) {
      used.add(symbol);
    }
  }
  
  return used;
}

function findImportedSymbols(content) {
  const imported = new Set();
  
  // Match all import statements (single and multi-line)
  const importRegex = /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*['"][^'"]+['"]/gs;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const symbols = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
    symbols.forEach(s => {
      if (s) imported.add(s);
    });
  }
  
  // Also check for namespace imports like: import * as admin from 'firebase-admin'
  const namespaceRegex = /import\s*\*\s*as\s+(\w+)\s+from/g;
  while ((match = namespaceRegex.exec(content)) !== null) {
    imported.add(match[1]);
  }
  
  // Check for default imports
  const defaultRegex = /import\s+(\w+)\s+from/g;
  while ((match = defaultRegex.exec(content)) !== null) {
    imported.add(match[1]);
  }
  
  return imported;
}

function hasRuntimeImport(content) {
  return /from\s*['"]\.\/runtime['"]/.test(content) || 
         /from\s*['"]\.\.\/runtime['"]/.test(content) ||
         /from\s*['"]\.\.\/\.\.\/runtime['"]/.test(content);
}

function findInsertPosition(content) {
  const lines = content.split('\n');
  let lastImportEnd = -1;
  let inMultiLineImport = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if we're starting a multi-line import
    if (/^\s*import\s/.test(line)) {
      if (line.includes('{') && !line.includes('}')) {
        inMultiLineImport = true;
      } else if (line.includes('from')) {
        lastImportEnd = i;
      }
    }
    
    // Check if we're ending a multi-line import
    if (inMultiLineImport && line.includes('}') && line.includes('from')) {
      inMultiLineImport = false;
      lastImportEnd = i;
    }
    
    // Also handle imports that end with just 'from "..."' on a separate line
    if (inMultiLineImport && /^\s*\}\s*from\s*['"]/.test(line)) {
      inMultiLineImport = false;
      lastImportEnd = i;
    }
  }
  
  return lastImportEnd;
}

function calculateRelativePath(filePath, srcDir) {
  const fileDir = path.dirname(filePath);
  const runtimePath = path.join(srcDir, 'runtime');
  let relativePath = path.relative(fileDir, runtimePath).replace(/\\/g, '/');
  
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  return relativePath;
}

function processFile(filePath, srcDir) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already has runtime import
  if (hasRuntimeImport(content)) {
    return { modified: false, reason: 'already has runtime import' };
  }
  
  // Find symbols used in the file
  const usedSymbols = findUsedSymbols(content);
  
  // Find symbols already imported
  const importedSymbols = findImportedSymbols(content);
  
  // Find symbols that need to be imported from runtime
  const missingSymbols = new Set();
  for (const symbol of usedSymbols) {
    if (!importedSymbols.has(symbol)) {
      missingSymbols.add(symbol);
    }
  }
  
  if (missingSymbols.size === 0) {
    return { modified: false, reason: 'no missing symbols' };
  }
  
  // Calculate relative path to runtime
  const relativePath = calculateRelativePath(filePath, srcDir);
  
  // Create the import statement
  const sortedSymbols = Array.from(missingSymbols).sort();
  const importStatement = `import { ${sortedSymbols.join(', ')} } from '${relativePath}';`;
  
  // Find where to insert the import
  const lines = content.split('\n');
  const insertAfter = findInsertPosition(content);
  
  if (insertAfter >= 0) {
    // Insert after the last import
    lines.splice(insertAfter + 1, 0, importStatement);
  } else {
    // No imports found, insert at the beginning (after any comments/directives)
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || 
          line.startsWith('"use') || line.startsWith("'use") || line === '') {
        insertAt = i + 1;
      } else {
        break;
      }
    }
    lines.splice(insertAt, 0, importStatement, '');
  }
  
  const newContent = lines.join('\n');
  fs.writeFileSync(filePath, newContent, 'utf8');
  
  return { 
    modified: true, 
    symbols: sortedSymbols,
    relativePath 
  };
}

function main() {
  const srcDir = path.join(__dirname, 'src');
  
  console.log('🔍 Scanning for TypeScript files...');
  const files = getAllTsFiles(srcDir);
  console.log(`📁 Found ${files.length} TypeScript files to process\n`);
  
  let modifiedCount = 0;
  let skippedCount = 0;
  const modifiedFiles = [];
  
  for (const file of files) {
    const relativePath = path.relative(srcDir, file);
    const result = processFile(file, srcDir);
    
    if (result.modified) {
      modifiedCount++;
      modifiedFiles.push(relativePath);
      console.log(`✅ ${relativePath}: Added imports for [${result.symbols.join(', ')}]`);
    } else {
      skippedCount++;
      // console.log(`⏭️  ${relativePath}: ${result.reason}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   Modified: ${modifiedCount} files`);
  console.log(`   Skipped:  ${skippedCount} files`);
  console.log('='.repeat(60));
  
  if (modifiedFiles.length > 0) {
    console.log('\n📝 Modified files:');
    modifiedFiles.forEach(f => console.log(`   - ${f}`));
  }
}

main();
