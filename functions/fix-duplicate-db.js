/**
 * FIX DUPLICATE DB - Remove local db declarations when db is imported from runtime
 * 
 * Pattern to fix:
 * import { ..., db, ... } from './runtime';
 * const db = getFirestore();  // <-- REMOVE THIS LINE
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

  // Check if db is imported from runtime or init
  const hasDbImport = /import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*['"][^'"]*(?:runtime|init)[^'"]*['"]/.test(content);
  
  if (hasDbImport) {
    // Remove local db declarations
    // Pattern: const db = getFirestore();
    const beforeRemove = content;
    content = content.replace(/^const\s+db\s*=\s*getFirestore\(\s*\)\s*;?\s*\n?/gm, (match) => {
      fixes.push('Removed duplicate const db = getFirestore()');
      return '';
    });
    
    // Also remove: const db = admin.firestore();
    content = content.replace(/^const\s+db\s*=\s*admin\.firestore\(\s*\)\s*;?\s*\n?/gm, (match) => {
      fixes.push('Removed duplicate const db = admin.firestore()');
      return '';
    });
  }

  // Check if HttpsError is imported from runtime
  const hasHttpsErrorFromRuntime = /import\s*\{[^}]*\bHttpsError\b[^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"]/.test(content);
  
  if (hasHttpsErrorFromRuntime) {
    // Remove HttpsError from firebase-functions/v2/https imports
    content = content.replace(
      /(import\s*\{)([^}]*)(\}\s*from\s*['"]firebase-functions\/v2\/https['"])/g,
      (match, before, imports, after) => {
        const importList = imports.split(',').map(s => s.trim()).filter(s => s);
        const filtered = importList.filter(imp => {
          const name = imp.split(/\s+as\s+/)[0].trim();
          return name !== 'HttpsError';
        });
        if (filtered.length === importList.length) return match;
        if (filtered.length === 0) {
          fixes.push('Removed entire firebase-functions/v2/https import (only had HttpsError)');
          return '';
        }
        fixes.push('Removed HttpsError from firebase-functions/v2/https import');
        return before + ' ' + filtered.join(', ') + ' ' + after;
      }
    );
  }

  // Check if Timestamp is imported from runtime
  const hasTimestampFromRuntime = /import\s*\{[^}]*\bTimestamp\b[^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"]/.test(content);
  
  if (hasTimestampFromRuntime) {
    // Remove Timestamp from firebase-admin/firestore imports
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
        fixes.push('Removed Timestamp from firebase-admin/firestore import');
        return before + ' ' + filtered.join(', ') + ' ' + after;
      }
    );
  }

  // Check if FieldValue is imported from init
  const hasFieldValueFromInit = /import\s*\{[^}]*\bFieldValue\b[^}]*\}\s*from\s*['"][^'"]*init[^'"]*['"]/.test(content);
  
  if (hasFieldValueFromInit) {
    // Remove FieldValue from firebase-admin/firestore imports
    content = content.replace(
      /(import\s*\{)([^}]*)(\}\s*from\s*['"]firebase-admin\/firestore['"])/g,
      (match, before, imports, after) => {
        const importList = imports.split(',').map(s => s.trim()).filter(s => s);
        const filtered = importList.filter(imp => {
          const name = imp.split(/\s+as\s+/)[0].trim();
          return name !== 'FieldValue';
        });
        if (filtered.length === importList.length) return match;
        if (filtered.length === 0) {
          fixes.push('Removed entire firebase-admin/firestore import');
          return '';
        }
        fixes.push('Removed FieldValue from firebase-admin/firestore import');
        return before + ' ' + filtered.join(', ') + ' ' + after;
      }
    );
  }

  // Clean up empty imports
  content = content.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]*['"]\s*;?\n?/g, '');
  
  // Clean up extra newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return { file: fileName, fixes };
  }
  return null;
}

console.log('🔧 Starting FIX DUPLICATE DB...\n');

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
