/**
 * AGGRESSIVE FIX V2 - Complete TypeScript Error Resolution
 * 
 * Fixes:
 * 1. TS2440: Remove duplicate db imports from runtime when already in init
 * 2. TS2339: Fix Zod .error pattern to use optional chaining
 * 3. TS2300: Fix duplicate Timestamp declarations
 * 4. Clean up malformed imports
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllTsFiles(dir) {
  const files = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (item.name.endsWith('.ts') && !item.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // ignore
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const fixes = [];
  const fileName = path.relative(srcDir, filePath);

  // ============================================
  // FIX 1: Remove db from runtime imports when already imported from init
  // ============================================
  
  // Check if db is imported from init
  const hasDbFromInit = /import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*['"][^'"]*init[^'"]*['"]/.test(content);
  
  if (hasDbFromInit) {
    // Remove db from runtime imports
    const beforeDb = content;
    content = content.replace(
      /(import\s*\{)([^}]*)(\}\s*from\s*['"][^'"]*runtime[^'"]*['"])/g,
      (match, before, imports, after) => {
        // Parse imports
        const importList = imports.split(',').map(s => s.trim()).filter(s => s);
        const filtered = importList.filter(imp => {
          const name = imp.split(/\s+as\s+/)[0].trim();
          return name !== 'db';
        });
        if (filtered.length === importList.length) return match; // no change
        if (filtered.length === 0) {
          fixes.push('Removed entire runtime import (only had db)');
          return '';
        }
        fixes.push('Removed duplicate db from runtime import');
        return before + ' ' + filtered.join(', ') + ' ' + after;
      }
    );
  }

  // ============================================
  // FIX 2: Remove HttpsError from firebase-functions when already in runtime
  // ============================================
  
  const hasHttpsErrorFromRuntime = /import\s*\{[^}]*\bHttpsError\b[^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"]/.test(content);
  
  if (hasHttpsErrorFromRuntime) {
    // Remove standalone HttpsError import from firebase-functions
    content = content.replace(
      /import\s*\{\s*HttpsError\s*\}\s*from\s*['"]firebase-functions\/v2\/https['"];\n?/g,
      (match) => {
        fixes.push('Removed duplicate HttpsError import');
        return '';
      }
    );
  }

  // ============================================
  // FIX 3: Remove duplicate Timestamp imports
  // ============================================
  
  // If Timestamp is imported from runtime, remove from firebase-admin/firestore
  const hasTimestampFromRuntime = /import\s*\{[^}]*\bTimestamp\b[^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"]/.test(content);
  
  if (hasTimestampFromRuntime) {
    // Remove Timestamp from firebase-admin/firestore
    content = content.replace(
      /(import\s*\{)([^}]*)(\}\s*from\s*['"]firebase-admin\/firestore['"])/g,
      (match, before, imports, after) => {
        const importList = imports.split(',').map(s => s.trim()).filter(s => s);
        const filtered = importList.filter(imp => {
          const name = imp.split(/\s+as\s+/)[0].trim();
          return name !== 'Timestamp';
        });
        if (filtered.length === importList.length) return match;
        if (filtered.length === 0) {
          fixes.push('Removed entire firebase-admin/firestore import');
          return '';
        }
        fixes.push('Removed duplicate Timestamp from firebase-admin/firestore');
        return before + ' ' + filtered.join(', ') + ' ' + after;
      }
    );
  }

  // ============================================
  // FIX 4: Fix Zod validation .error access
  // ============================================
  
  // Pattern: validationResult.error.message -> validationResult.error?.message
  // But only if not already using optional chaining
  content = content.replace(/(\w+)\.error\.message(?!\?)/g, (match, varName) => {
    if (varName === 'console' || varName === 'logger') return match;
    fixes.push(`Fixed ${varName}.error.message to use optional chaining`);
    return `${varName}.error?.message`;
  });
  
  content = content.replace(/(\w+)\.error\.issues(?!\?)/g, (match, varName) => {
    if (varName === 'console' || varName === 'logger') return match;
    fixes.push(`Fixed ${varName}.error.issues to use optional chaining`);
    return `${varName}.error?.issues`;
  });

  content = content.replace(/(\w+)\.error\.format(?!\?)/g, (match, varName) => {
    if (varName === 'console' || varName === 'logger') return match;
    fixes.push(`Fixed ${varName}.error.format to use optional chaining`);
    return `${varName}.error?.format`;
  });

  // ============================================
  // FIX 5: Clean up empty imports
  // ============================================
  content = content.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]*['"]\s*;?\n?/g, '');

  // ============================================
  // FIX 6: Clean up malformed imports
  // ============================================
  content = content.replace(/\{\s*,\s*(\w)/g, '{ $1');
  content = content.replace(/(\w)\s*,\s*\}/g, '$1 }');
  content = content.replace(/,\s*,/g, ',');

  // ============================================
  // FIX 7: Remove extra newlines
  // ============================================
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return { file: fileName, fixes };
  }
  return null;
}

console.log('🔧 Starting AGGRESSIVE FIX V2...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

let totalFixes = 0;
let filesModified = 0;

for (const file of files) {
  const result = fixFile(file);
  if (result && result.fixes.length > 0) {
    console.log(`✅ ${result.file}: ${result.fixes.join(', ')}`);
    totalFixes += result.fixes.length;
    filesModified++;
  }
}

console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes applied`);
