/**
 * BATCH FIX ALL - Comprehensive TypeScript Error Fix
 * 
 * Fixes:
 * 1. TS2305: Remove 'server' from imports (it doesn't exist)
 * 2. TS2440: Remove duplicate db, HttpsError, Timestamp imports
 * 3. TS2339: Fix Zod .error pattern to use .success check
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllTsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (item.name.endsWith('.ts') && !item.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const fixes = [];
  const fileName = path.relative(srcDir, filePath);

  // FIX 1: Remove 'server' from init imports (it doesn't exist as 'server')
  // Pattern: import { ..., server, ... } from './init' or '../init' etc
  const serverImportPatterns = [
    // server at start
    /from\s+['"]([.\/]+init(?:\.js)?)['"]\s*;?\s*\nimport\s*\{\s*server\s*,\s*/g,
    // server in middle
    /,\s*server\s*,/g,
    // server at end
    /,\s*server\s*\}/g,
    // server alone (shouldn't happen but just in case)
    /\{\s*server\s*\}/g,
  ];

  // More targeted: find init imports and remove 'server' from them
  content = content.replace(
    /(import\s*\{[^}]*)\bserver\b([^}]*\}\s*from\s*['"][^'"]*init[^'"]*['"])/g,
    (match, before, after) => {
      // Remove 'server' and clean up commas
      let result = before + after;
      result = result.replace(/,\s*,/g, ',');
      result = result.replace(/\{\s*,/g, '{');
      result = result.replace(/,\s*\}/g, '}');
      if (result !== match) {
        fixes.push('Removed server from init import');
      }
      return result;
    }
  );

  // FIX 2: Remove duplicate imports of db, HttpsError, Timestamp from runtime when already imported from init
  // Check if file has both init and runtime imports
  const hasInitImport = /from\s*['"][^'"]*init[^'"]*['"]/.test(content);
  const hasRuntimeImport = /from\s*['"][^'"]*runtime[^'"]*['"]/.test(content);

  if (hasInitImport && hasRuntimeImport) {
    // Get what's imported from init
    const initImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*init[^'"]*['"]/);
    if (initImportMatch) {
      const initImports = initImportMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim());
      
      // Remove duplicates from runtime import
      content = content.replace(
        /(import\s*\{)([^}]+)(\}\s*from\s*['"][^'"]*runtime[^'"]*['"])/g,
        (match, before, imports, after) => {
          const importList = imports.split(',').map(s => s.trim());
          const filtered = importList.filter(imp => {
            const name = imp.split(/\s+as\s+/)[0].trim();
            return !initImports.includes(name);
          });
          if (filtered.length === 0) {
            fixes.push('Removed entire duplicate runtime import');
            return ''; // Remove entire import if nothing left
          }
          if (filtered.length < importList.length) {
            fixes.push('Removed duplicate items from runtime import');
          }
          return before + ' ' + filtered.join(', ') + ' ' + after;
        }
      );
    }
  }

  // FIX 3: Remove duplicate db imports specifically
  // Pattern: import { db } from './runtime' when db already imported from init
  const dbFromInit = /import\s*\{[^}]*\bdb\b[^}]*\}\s*from\s*['"][^'"]*init[^'"]*['"]/.test(content);
  if (dbFromInit) {
    // Remove db from runtime imports
    content = content.replace(
      /(import\s*\{)([^}]*)\bdb\b([^}]*)(\}\s*from\s*['"][^'"]*runtime[^'"]*['"])/g,
      (match, before, pre, post, after) => {
        let newImports = (pre + post).replace(/,\s*,/g, ',').replace(/^\s*,/, '').replace(/,\s*$/, '').trim();
        if (!newImports || newImports === ',') {
          fixes.push('Removed duplicate db runtime import line');
          return '';
        }
        fixes.push('Removed duplicate db from runtime import');
        return before + ' ' + newImports + ' ' + after;
      }
    );
  }

  // FIX 4: Fix Zod validation pattern - .error to .success check
  // Pattern: if (!validationResult.success) throw new HttpsError('invalid-argument', validationResult.error?.message || '...')
  // Current broken: validationResult.error.message (error doesn't exist on success type)
  
  // Fix pattern: validationResult.error.message -> validationResult.error?.message
  content = content.replace(
    /validationResult\.error\.message/g,
    (match) => {
      fixes.push('Fixed validationResult.error.message to use optional chaining');
      return 'validationResult.error?.message';
    }
  );

  // Also fix: validation.error.message
  content = content.replace(
    /validation\.error\.message/g,
    (match) => {
      fixes.push('Fixed validation.error.message to use optional chaining');
      return 'validation.error?.message';
    }
  );

  // Fix: parsed.error.message
  content = content.replace(
    /parsed\.error\.message/g,
    (match) => {
      fixes.push('Fixed parsed.error.message to use optional chaining');
      return 'parsed.error?.message';
    }
  );

  // Fix: result.error.message
  content = content.replace(
    /result\.error\.message/g,
    (match) => {
      fixes.push('Fixed result.error.message to use optional chaining');
      return 'result.error?.message';
    }
  );

  // FIX 5: Clean up empty imports
  content = content.replace(/import\s*\{\s*\}\s*from\s*['"][^'"]*['"]\s*;?\n?/g, '');

  // FIX 6: Clean up malformed imports with just commas
  content = content.replace(/import\s*\{\s*,\s*\}\s*from/g, 'import {} from');
  content = content.replace(/\{\s*,\s*([^}])/g, '{ $1');
  content = content.replace(/([^{])\s*,\s*\}/g, '$1 }');

  // FIX 7: Remove duplicate consecutive newlines (more than 2)
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return { file: fileName, fixes };
  }
  return null;
}

console.log('🔧 Starting BATCH FIX ALL...\n');

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
