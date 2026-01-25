/**
 * Codemod: Fix Missing Imports
 * 
 * This script:
 * 1. Removes empty semicolon-only lines (broken imports)
 * 2. Adds runtime.ts imports for missing symbols
 * 3. Consolidates Firebase imports
 * 
 * Symbols to track:
 * - getFirestore, db, FieldValue, Timestamp (firebase-admin/firestore)
 * - onCall, onRequest, HttpsError (firebase-functions/v2/https)
 * - onSchedule (firebase-functions/v2/scheduler)
 * - logger (firebase-functions/v2)
 * - z (zod)
 * - ethers (ethers)
 * - admin, auth, storage, serverTimestamp, increment, arrayUnion, arrayRemove, generateId
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');

// Symbols that can be imported from runtime.ts
const RUNTIME_EXPORTS = [
  // Admin SDK
  'admin', 'db', 'auth', 'storage', 'getFirestore', 'FieldValue', 'Timestamp',
  'serverTimestamp', 'increment', 'arrayUnion', 'arrayRemove', 'deleteField',
  'timestamp', 'generateId',
  // Functions v2
  'onCall', 'onRequest', 'HttpsError', 'onSchedule', 'logger',
  'onDocumentCreated', 'onDocumentUpdated', 'onDocumentDeleted', 'onDocumentWritten',
  'onMessagePublished', 'onObjectFinalized', 'onObjectDeleted',
  // Functions v1 compat
  'functions', 'functionsConfig',
  // Libraries
  'z', 'ethers',
];

// Import patterns to remove/replace
const IMPORT_PATTERNS_TO_CONSOLIDATE = [
  /^import \* as admin from ['"]firebase-admin['"];?$/,
  /^import \{ getFirestore[^}]*\} from ['"]firebase-admin\/firestore['"];?$/,
  /^import \{ FieldValue[^}]*\} from ['"]firebase-admin\/firestore['"];?$/,
  /^import \{ Timestamp[^}]*\} from ['"]firebase-admin\/firestore['"];?$/,
  /^import \{ onCall[^}]*\} from ['"]firebase-functions\/v2\/https['"];?$/,
  /^import \{ onRequest[^}]*\} from ['"]firebase-functions\/v2\/https['"];?$/,
  /^import \{ HttpsError[^}]*\} from ['"]firebase-functions\/v2\/https['"];?$/,
  /^import \{ logger \} from ['"]firebase-functions\/v2['"];?$/,
  /^import \{ onSchedule \} from ['"]firebase-functions\/v2\/scheduler['"];?$/,
  /^import \{ z \} from ['"]zod['"];?$/,
  /^import \{ ethers \} from ['"]ethers['"];?$/,
];

// Check if a line is an empty semicolon (broken import)
function isEmptySemicolon(line) {
  return /^\s*;\s*$/.test(line);
}

// Check if file uses any runtime symbols
function findUsedRuntimeSymbols(content) {
  const used = new Set();
  
  for (const symbol of RUNTIME_EXPORTS) {
    // Check for usage as identifier (word boundary)
    const regex = new RegExp(`\\b${symbol}\\b`, 'g');
    if (regex.test(content)) {
      used.add(symbol);
    }
  }
  
  return used;
}

// Check if file already imports from runtime
function hasRuntimeImport(content) {
  return /from ['"]\.\/runtime['"]/.test(content) || 
         /from ['"]\.\.\/runtime['"]/.test(content) ||
         /from ['"]\.\.\/\.\.\/runtime['"]/.test(content);
}

// Build the runtime import statement
function buildRuntimeImport(symbols, relativePath) {
  if (symbols.size === 0) return null;
  
  const sorted = Array.from(symbols).sort();
  return `import { ${sorted.join(', ')} } from '${relativePath}';`;
}

// Calculate relative path to runtime from file location
function getRelativeRuntimePath(filePath) {
  const fileDir = path.dirname(filePath);
  const relative = path.relative(fileDir, SRC_DIR);
  
  if (relative === '') {
    return './runtime';
  }
  
  const normalized = relative.replace(/\\/g, '/');
  return `${normalized}/runtime`;
}

// Process a single file
function processFile(filePath) {
  const relativePath = path.relative(SRC_DIR, filePath);
  
  // Skip runtime.ts itself and init.ts (which sets up runtime)
  if (relativePath === 'runtime.ts' || relativePath === 'init.ts') {
    return { skipped: true, reason: 'core file' };
  }
  
  // Skip test files
  if (relativePath.includes('.test.') || relativePath.includes('.spec.')) {
    return { skipped: true, reason: 'test file' };
  }
  
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  // Already has runtime import - skip importing again but still clean up
  const alreadyHasRuntime = hasRuntimeImport(content);
  
  // Remove empty semicolon lines
  let lines = content.split('\n');
  lines = lines.filter(line => !isEmptySemicolon(line));
  content = lines.join('\n');
  
  // Find used runtime symbols
  const usedSymbols = findUsedRuntimeSymbols(content);
  
  // If already has runtime import, don't add another one
  if (alreadyHasRuntime) {
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content);
      return { 
        modified: true, 
        changes: ['removed empty semicolons'],
        usedSymbols: Array.from(usedSymbols)
      };
    }
    return { skipped: true, reason: 'already has runtime import' };
  }
  
  // Filter symbols that are actually used and not already imported
  const symbolsToImport = new Set();
  for (const symbol of usedSymbols) {
    // Check if already imported explicitly
    const importPattern = new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`);
    const importAllPattern = new RegExp(`import\\s*\\*\\s*as\\s+${symbol}\\s+from`);
    
    if (!importPattern.test(content) && !importAllPattern.test(content)) {
      symbolsToImport.add(symbol);
    }
  }
  
  if (symbolsToImport.size === 0 && content === originalContent) {
    return { skipped: true, reason: 'no missing imports' };
  }
  
  // Remove old firebase-admin/functions imports that we're consolidating
  lines = content.split('\n');
  const newLines = [];
  let removedImports = [];
  
  for (const line of lines) {
    let shouldRemove = false;
    
    for (const pattern of IMPORT_PATTERNS_TO_CONSOLIDATE) {
      if (pattern.test(line.trim())) {
        // Only remove if we're going to import from runtime
        if (symbolsToImport.size > 0) {
          shouldRemove = true;
          removedImports.push(line.trim());
          break;
        }
      }
    }
    
    if (!shouldRemove) {
      newLines.push(line);
    }
  }
  
  content = newLines.join('\n');
  
  // Add runtime import if we have symbols to import
  if (symbolsToImport.size > 0) {
    const runtimePath = getRelativeRuntimePath(filePath);
    const importStatement = buildRuntimeImport(symbolsToImport, runtimePath);
    
    // Find the best place to insert (after existing imports or at start)
    const importEndIndex = findLastImportIndex(content);
    
    if (importEndIndex >= 0) {
      const beforeImports = content.substring(0, importEndIndex);
      const afterImports = content.substring(importEndIndex);
      content = beforeImports + importStatement + '\n' + afterImports;
    } else {
      // No existing imports, add at start (after any initial comments)
      const docCommentEnd = content.indexOf('*/');
      if (docCommentEnd > 0 && docCommentEnd < 500) {
        const before = content.substring(0, docCommentEnd + 2);
        const after = content.substring(docCommentEnd + 2);
        content = before + '\n\n' + importStatement + after;
      } else {
        content = importStatement + '\n\n' + content;
      }
    }
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return {
      modified: true,
      changes: [
        ...(symbolsToImport.size > 0 ? [`added runtime import for: ${Array.from(symbolsToImport).join(', ')}`] : []),
        ...(removedImports.length > 0 ? [`removed ${removedImports.length} old imports`] : []),
      ],
    };
  }
  
  return { skipped: true, reason: 'no changes needed' };
}

// Find the index after the last import statement
function findLastImportIndex(content) {
  const lines = content.split('\n');
  let lastImportEnd = -1;
  let currentIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentIndex += line.length + 1; // +1 for newline
    
    if (/^\s*import\s/.test(line) || /^\s*export\s+\{[^}]+\}\s+from/.test(line)) {
      lastImportEnd = currentIndex;
    }
    
    // Stop searching after first non-import, non-comment, non-empty line
    if (lastImportEnd > 0 && !/^\s*(import|export\s+\{|\/\/|\/\*|\*|$)/.test(line)) {
      break;
    }
  }
  
  return lastImportEnd;
}

// Walk directory recursively
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

// Main execution
console.log('🔧 Fixing runtime imports...\n');

let modified = 0;
let skipped = 0;
let errors = 0;

walkDir(SRC_DIR, (filePath) => {
  const relativePath = path.relative(SRC_DIR, filePath);
  
  try {
    const result = processFile(filePath);
    
    if (result.modified) {
      console.log(`✅ ${relativePath}`);
      if (result.changes) {
        result.changes.forEach(c => console.log(`   - ${c}`));
      }
      modified++;
    } else if (result.skipped) {
      skipped++;
    }
  } catch (error) {
    console.error(`❌ ${relativePath}: ${error.message}`);
    errors++;
  }
});

console.log(`\n📊 Summary:`);
console.log(`   Modified: ${modified}`);
console.log(`   Skipped:  ${skipped}`);
console.log(`   Errors:   ${errors}`);
