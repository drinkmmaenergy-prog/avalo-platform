/**
 * PHASE 2.3.2 — BATCH C — FIRESTORE TRIGGERS v1 → v2 MIGRATION SCRIPT
 * 
 * This script performs mechanical, deterministic migration of Firestore triggers
 * from Firebase Functions v1 API to v2 API.
 * 
 * PATTERNS MIGRATED:
 * - functions.firestore.document('path').onCreate() → onDocumentCreated('path', handler)
 * - functions.firestore.document('path').onUpdate() → onDocumentUpdated('path', handler)
 * - functions.firestore.document('path').onDelete() → onDocumentDeleted('path', handler)
 * - functions.firestore.document('path').onWrite() → onDocumentWritten('path', handler)
 * - context.params → event.params
 * - (snap, context) / (snapshot, context) → (event) + event.data
 * - (change, context) → (event) + event.data.before / event.data.after
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');

// Find all .ts files recursively
function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Check if file contains v1 Firestore patterns
function hasV1FirestorePatterns(content) {
  return (
    /\.firestore\.document\(/.test(content) ||
    /functions\.firestore/.test(content) ||
    /\.onCreate\s*\(\s*async\s*\(\s*(?:snap|snapshot),\s*context\s*\)/.test(content) ||
    /\.onUpdate\s*\(\s*async\s*\(\s*change,\s*context\s*\)/.test(content) ||
    /\.onWrite\s*\(\s*async\s*\(\s*change,\s*context\s*\)/.test(content) ||
    /\.onDelete\s*\(\s*async\s*\(\s*(?:snap|snapshot),\s*context\s*\)/.test(content)
  );
}

// Migrate a single file
function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  if (!hasV1FirestorePatterns(content)) {
    return { modified: false };
  }
  
  const relativePath = path.relative(SRC_DIR, filePath);
  console.log(`Migrating: ${relativePath}`);
  
  // Track needed imports
  let needsOnDocumentCreated = false;
  let needsOnDocumentUpdated = false;
  let needsOnDocumentDeleted = false;
  let needsOnDocumentWritten = false;
  
  // Detect which triggers are used
  if (/\.onCreate\s*\(/.test(content)) needsOnDocumentCreated = true;
  if (/\.onUpdate\s*\(/.test(content)) needsOnDocumentUpdated = true;
  if (/\.onDelete\s*\(/.test(content)) needsOnDocumentDeleted = true;
  if (/\.onWrite\s*\(/.test(content)) needsOnDocumentWritten = true;
  
  // Calculate depth for import path
  const depth = relativePath.split(/[\/\\]/).length - 1;
  const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';
  
  // Build v2 imports list
  const v2Imports = [];
  if (needsOnDocumentCreated) v2Imports.push('onDocumentCreated');
  if (needsOnDocumentUpdated) v2Imports.push('onDocumentUpdated');
  if (needsOnDocumentDeleted) v2Imports.push('onDocumentDeleted');
  if (needsOnDocumentWritten) v2Imports.push('onDocumentWritten');
  
  // Add v2 imports if not already present
  if (v2Imports.length > 0) {
    const existingImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/runtime['"]/);
    
    if (existingImportMatch) {
      // Add to existing runtime import
      const existingImports = existingImportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      const newImports = [...new Set([...existingImports, ...v2Imports])];
      content = content.replace(
        /import\s*\{([^}]+)\}\s*from\s*['"]\.\/runtime['"]/,
        `import { ${newImports.join(', ')} } from './runtime'`
      );
    } else {
      // Check for runtime import with different path depth
      const runtimeImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"](?:\.\.\/)*runtime['"]/;
      const runtimeMatch = content.match(runtimeImportRegex);
      
      if (runtimeMatch) {
        const existingImports = runtimeMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        const newImports = [...new Set([...existingImports, ...v2Imports])];
        content = content.replace(
          runtimeImportRegex,
          `import { ${newImports.join(', ')} } from '${runtimePath}'`
        );
      } else {
        // Add new import at top of file after other imports
        const importStatement = `import { ${v2Imports.join(', ')} } from '${runtimePath}';\n`;
        
        // Find the last import statement and add after it
        const lastImportMatch = content.match(/^(import .+;\n)+/m);
        if (lastImportMatch) {
          const insertPos = lastImportMatch.index + lastImportMatch[0].length;
          content = content.slice(0, insertPos) + importStatement + content.slice(insertPos);
        } else {
          // No imports found, add at beginning
          content = importStatement + content;
        }
      }
    }
  }
  
  // Pattern: Export with functions.firestore.document().onCreate()
  // Capture: export const NAME = functions.firestore.document('PATH').onCreate(async (snap/snapshot, context) => {
  // Transform to: export const NAME = onDocumentCreated('PATH', async (event) => {
  
  // onCreate transformation
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*functions\s*\.?\s*firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath, snapVar) => {
      return `export const ${funcName} = onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Alternative: without 'functions' prefix (e.g., functions already assigned)
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*(?:functions\s*\.)?firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath, snapVar) => {
      return `export const ${funcName} = onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // onUpdate transformation
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*functions\s*\.?\s*firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onUpdate\s*\(\s*async\s*\(\s*change\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath) => {
      return `export const ${funcName} = onDocumentUpdated(${docPath}, async (event) => {
  const change = event.data;
  if (!change) return;`;
    }
  );
  
  // Alternative onUpdate without functions prefix
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*(?:functions\s*\.)?firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onUpdate\s*\(\s*async\s*\(\s*change\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath) => {
      return `export const ${funcName} = onDocumentUpdated(${docPath}, async (event) => {
  const change = event.data;
  if (!change) return;`;
    }
  );
  
  // onWrite transformation
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*functions\s*\.?\s*firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onWrite\s*\(\s*async\s*\(\s*change\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath) => {
      return `export const ${funcName} = onDocumentWritten(${docPath}, async (event) => {
  const change = event.data;
  if (!change) return;`;
    }
  );
  
  // Alternative onWrite without functions prefix
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*(?:functions\s*\.)?firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onWrite\s*\(\s*async\s*\(\s*change\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath) => {
      return `export const ${funcName} = onDocumentWritten(${docPath}, async (event) => {
  const change = event.data;
  if (!change) return;`;
    }
  );
  
  // onDelete transformation
  content = content.replace(
    /export\s+const\s+(\w+)\s*=\s*functions\s*\.?\s*firestore\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onDelete\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, funcName, docPath, snapVar) => {
      return `export const ${funcName} = onDocumentDeleted(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Replace context.params with event.params
  content = content.replace(/context\.params/g, 'event.params');
  
  // If content changed, save
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { modified: true };
  }
  
  return { modified: false };
}

// Main
function main() {
  console.log('=== PHASE 2.3.2 — BATCH C — FIRESTORE TRIGGERS v1 → v2 MIGRATION ===\n');
  
  const files = findTsFiles(SRC_DIR);
  console.log(`Found ${files.length} TypeScript files\n`);
  
  let modifiedCount = 0;
  const modifiedFiles = [];
  
  for (const file of files) {
    const result = migrateFile(file);
    if (result.modified) {
      modifiedCount++;
      modifiedFiles.push(path.relative(SRC_DIR, file));
    }
  }
  
  console.log(`\n=== MIGRATION COMPLETE ===`);
  console.log(`Files modified: ${modifiedCount}`);
  console.log(`\nModified files:`);
  modifiedFiles.forEach(f => console.log(`  - ${f}`));
}

main();
