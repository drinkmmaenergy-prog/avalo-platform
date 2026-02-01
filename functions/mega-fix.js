/**
 * MEGA FIX - Complete TypeScript Error Resolution
 * 
 * init.ts exports: db, auth, storage, admin, FieldValue, serverTimestamp, increment, arrayUnion, arrayRemove, timestamp, generateId
 * runtime.ts exports: everything from init + Timestamp, HttpsError, onCall, onRequest, onSchedule, getAuth, getStorage, functions, logger
 * 
 * Fixes:
 * 1. Remove 'server' from all imports (doesn't exist - should be 'serverTimestamp')
 * 2. Fix duplicate imports (TS2440)
 * 3. Fix Zod .error pattern (TS2339)
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
  // FIX 1: Remove 'server' from imports - it should be 'serverTimestamp'
  // ============================================
  
  // Pattern: import { ..., server, ... } from '...init...'
  // Replace 'server' with nothing (serverTimestamp should already be there or added separately)
  
  // Handle: server, (with comma after)
  content = content.replace(/\bserver\s*,\s*(?=\w)/g, (match) => {
    fixes.push('Removed orphan "server" from import');
    return '';
  });
  
  // Handle: , server (with comma before, at end)
  content = content.replace(/,\s*server\s*(?=\})/g, (match) => {
    fixes.push('Removed orphan "server" from import');
    return '';
  });
  
  // Handle: , server, (in middle)
  content = content.replace(/,\s*server\s*,/g, ',');
  
  // Handle: { server } alone
  content = content.replace(/\{\s*server\s*\}/g, '{}');

  // ============================================
  // FIX 2: Remove duplicate db imports from runtime when already in init
  // ============================================
  
  // Check if db is imported from init
  const dbFromInitMatch = content.match(/import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*['"]([^'"]*init[^'"]*)['"]/);
  
  if (dbFromInitMatch) {
    // Remove db from any runtime import
    content = content.replace(
      /(import\s*\{[^}]*)(\bdb\b\s*,?\s*)([^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"])/g,
      (match, before, dbPart, after) => {
        fixes.push('Removed duplicate db from runtime import');
        let result = before + after;
        // Clean up double commas
        result = result.replace(/,\s*,/g, ',');
        result = result.replace(/\{\s*,/g, '{ ');
        result = result.replace(/,\s*\}/g, ' }');
        return result;
      }
    );
  }

  // ============================================
  // FIX 3: Remove duplicate HttpsError imports
  // ============================================
  
  const httpsErrorFromRuntimeMatch = content.match(/import\s*\{[^}]*\bHttpsError\b[^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"]/);
  
  if (httpsErrorFromRuntimeMatch) {
    // Remove standalone HttpsError imports from firebase-functions
    content = content.replace(
      /import\s*\{\s*HttpsError\s*\}\s*from\s*['"]firebase-functions\/v2\/https['"];\n?/g,
      (match) => {
        fixes.push('Removed duplicate HttpsError import from firebase-functions');
        return '';
      }
    );
  }

  // ============================================
  // FIX 4: Remove duplicate Timestamp imports
  // ============================================
  
  // If Timestamp is imported from runtime, remove from firebase-admin/firestore
  const timestampFromRuntimeMatch = content.match(/import\s*\{[^}]*\bTimestamp\b[^}]*\}\s*from\s*['"][^'"]*runtime[^'"]*['"]/);
  
  if (timestampFromRuntimeMatch) {
    // Remove Timestamp from firebase-admin/firestore imports
    content = content.replace(
      /(import\s*\{[^}]*)(\bTimestamp\b\s*,?\s*)([^}]*\}\s*from\s*['"]firebase-admin\/firestore['"])/g,
      (match, before, tsPart, after) => {
        fixes.push('Removed duplicate Timestamp from firebase-admin/firestore');
        let result = before + after;
        result = result.replace(/,\s*,/g, ',');
        result = result.replace(/\{\s*,/g, '{ ');
        result = result.replace(/,\s*\}/g, ' }');
        return result;
      }
    );
  }

  // ============================================
  // FIX 5: Fix Zod validation error access pattern
  // ============================================
  
  // Change: validationResult.error.message -> validationResult.error?.message
  // Change: validationResult.error.issues -> validationResult.error?.issues
  content = content.replace(/(\w+Result)\.error\.(\w+)/g, (match, varName, prop) => {
    fixes.push(`Fixed ${varName}.error.${prop} to use optional chaining`);
    return `${varName}.error?.${prop}`;
  });
  
  content = content.replace(/validation\.error\.(\w+)/g, (match, prop) => {
    fixes.push(`Fixed validation.error.${prop} to use optional chaining`);
    return `validation.error?.${prop}`;
  });
  
  content = content.replace(/parsed\.error\.(\w+)/g, (match, prop) => {
    fixes.push(`Fixed parsed.error.${prop} to use optional chaining`);
    return `parsed.error?.${prop}`;
  });
  
  content = content.replace(/result\.error\.(\w+)/g, (match, prop) => {
    if (prop === 'message' || prop === 'issues' || prop === 'errors' || prop === 'format') {
      fixes.push(`Fixed result.error.${prop} to use optional chaining`);
      return `result.error?.${prop}`;
    }
    return match;
  });

  // ============================================
  // FIX 6: Clean up empty imports
  // ============================================
  content = content.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]*['"]\s*;?\n?/g, '');

  // ============================================
  // FIX 7: Clean up malformed imports
  // ============================================
  content = content.replace(/\{\s*,\s*(\w)/g, '{ $1');
  content = content.replace(/(\w)\s*,\s*\}/g, '$1 }');
  content = content.replace(/,\s*,/g, ',');

  // ============================================
  // FIX 8: Remove lines that are just whitespace after import removal
  // ============================================
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return { file: fileName, fixes };
  }
  return null;
}

console.log('🔧 Starting MEGA FIX...\n');

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
