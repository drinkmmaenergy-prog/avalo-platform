/**
 * PHASE 2.3.2 — BATCH C — FIRESTORE TRIGGERS v1 → v2 MIGRATION SCRIPT (PASS 2)
 * 
 * This script completes the migration by handling:
 * 1. Patterns with .region() or .runWith() before .firestore
 * 2. Cases where context.params was replaced but signature wasn't updated
 * 3. Cases where functions or functions.firestore patterns remain
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
    /\.firestore\s*\.document\(/.test(content) ||
    /event\.params\.[a-zA-Z]+;/.test(content) && /\.onCreate\s*\(\s*async\s*\(\s*(?:snap|snapshot),\s*context\s*\)/.test(content) ||
    /event\.params\.[a-zA-Z]+;/.test(content) && /\.onUpdate\s*\(\s*async\s*\(\s*change,\s*context\s*\)/.test(content) ||
    /event\.params\.[a-zA-Z]+;/.test(content) && /\.onWrite\s*\(\s*async\s*\(\s*change,\s*context\s*\)/.test(content)
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
  
  // Check if imports already exist
  const hasV2ImportAlready = content.includes('onDocumentCreated') || 
                              content.includes('onDocumentUpdated') ||
                              content.includes('onDocumentDeleted') ||
                              content.includes('onDocumentWritten');
  
  // Add v2 imports if not already present
  if (v2Imports.length > 0 && !hasV2ImportAlready) {
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
  
  // More flexible patterns - handle .region(), .runWith() etc.
  
  // Pattern 1: functions.region().firestore.document().onCreate()
  content = content.replace(
    /=\s*functions\s*(?:\n\s*)?\.region\s*\([^)]+\)\s*(?:\n\s*)?(?:\.runWith\s*\(\s*\{[^}]+\}\s*\)\s*)?(?:\n\s*)?\.firestore\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*(?:\n\s*)?\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath, snapVar) => {
      return `= onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Pattern 2: functions.runWith().firestore.document().onCreate()
  content = content.replace(
    /=\s*functions\s*(?:\n\s*)?\.runWith\s*\(\s*\{[^}]+\}\s*\)\s*(?:\n\s*)?\.firestore\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*(?:\n\s*)?\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath, snapVar) => {
      return `= onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Pattern 3: functions.runWith().firestore\n.document().onCreate()  (newline before .document)
  content = content.replace(
    /=\s*functions\s*(?:\n\s*)?\.runWith\s*\(\s*\{[^}]+\}\s*\)\s*(?:\n\s*)?\.firestore\s*\n\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*(?:\n\s*)?\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath, snapVar) => {
      return `= onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Pattern 4: More general - any pattern ending with .firestore.document().onCreate()
  content = content.replace(
    /=\s*functions[\s\S]*?\.firestore\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath, snapVar) => {
      return `= onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Pattern 5: Same for .onUpdate()
  content = content.replace(
    /=\s*functions[\s\S]*?\.firestore\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onUpdate\s*\(\s*async\s*\(\s*change\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath) => {
      return `= onDocumentUpdated(${docPath}, async (event) => {
  const change = event.data;
  if (!change) return;`;
    }
  );
  
  // Pattern 6: Same for .onWrite()
  content = content.replace(
    /=\s*functions[\s\S]*?\.firestore\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onWrite\s*\(\s*async\s*\(\s*change\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath) => {
      return `= onDocumentWritten(${docPath}, async (event) => {
  const change = event.data;
  if (!change) return;`;
    }
  );
  
  // Pattern 7: Same for .onDelete()
  content = content.replace(
    /=\s*functions[\s\S]*?\.firestore\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onDelete\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath, snapVar) => {
      return `= onDocumentDeleted(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // Pattern 8: Handle .firestore\n.document() (firestore on separate line from document)
  content = content.replace(
    /=\s*functions[\s\S]*?\.firestore\s*\n\s*\.document\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*\.onCreate\s*\(\s*async\s*\(\s*(snap|snapshot)\s*,\s*context\s*\)\s*=>\s*\{/g,
    (match, docPath, snapVar) => {
      return `= onDocumentCreated(${docPath}, async (event) => {
  const ${snapVar} = event.data;
  if (!${snapVar}) return;`;
    }
  );
  
  // If content changed, save
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { modified: true };
  }
  
  return { modified: false };
}

// Main
function main() {
  console.log('=== PHASE 2.3.2 — BATCH C — FIRESTORE TRIGGERS v1 → v2 MIGRATION (PASS 2) ===\n');
  
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
  
  console.log(`\n=== MIGRATION PASS 2 COMPLETE ===`);
  console.log(`Files modified: ${modifiedCount}`);
  console.log(`\nModified files:`);
  modifiedFiles.forEach(f => console.log(`  - ${f}`));
}

main();
