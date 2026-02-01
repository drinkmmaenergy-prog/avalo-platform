/**
 * FIX ALL CONFLICTS - Remove duplicate imports and fix conflicts
 * This script removes the problematic imports that were added
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
let totalFixes = 0;
let filesModified = 0;

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
  const relativePath = path.relative(srcDir, filePath);

  // Skip init.ts and runtime.ts
  if (relativePath === 'init.ts' || relativePath === 'runtime.ts') {
    return false;
  }

  // ============================================
  // FIX 1: Remove duplicate db from runtime import when db is already imported elsewhere
  // Pattern: import { ..., db } from './runtime' when there's also const db = ... or import { db } from './init'
  // ============================================
  
  // Check if file has db imported from both runtime and init
  const hasDbFromRuntime = /import\s*{[^}]*\bdb\b[^}]*}\s*from\s*['"]\.\.?\/runtime['"]/.test(content);
  const hasDbFromInit = /import\s*{[^}]*\bdb\b[^}]*}\s*from\s*['"]\.\.?\/init['"]/.test(content);
  const hasLocalDb = /const\s+db\s*=/.test(content);
  
  if (hasDbFromRuntime && (hasDbFromInit || hasLocalDb)) {
    // Remove db from runtime import
    content = content.replace(
      /import\s*{([^}]*)}\s*from\s*(['"])(\.\.?\/runtime)\2/g,
      (match, imports, quote, path) => {
        const importList = imports.split(',').map(i => i.trim()).filter(i => i && i !== 'db');
        if (importList.length > 0) {
          return `import { ${importList.join(', ')} } from ${quote}${path}${quote}`;
        }
        return '';
      }
    );
    fixes.push('Removed duplicate db from runtime import');
  }

  // ============================================
  // FIX 2: Fix Timestamp import from init (should be from runtime or firebase-admin/firestore)
  // ============================================
  if (content.includes("Timestamp } from './init'") || content.includes("Timestamp } from '../init'")) {
    // Change to import from runtime instead
    content = content.replace(
      /import\s*{([^}]*)Timestamp([^}]*)}\s*from\s*(['"])(\.\.?\/init)\3/g,
      (match, before, after, quote, path) => {
        const otherImports = (before + after).replace(/,\s*,/g, ',').replace(/^,|,$/g, '').trim();
        const runtimePath = path.replace('/init', '/runtime');
        if (otherImports) {
          return `import { ${otherImports} } from ${quote}${path}${quote};\nimport { Timestamp } from ${quote}${runtimePath}${quote}`;
        }
        return `import { Timestamp } from ${quote}${runtimePath}${quote}`;
      }
    );
    fixes.push('Fixed Timestamp import to use runtime');
  }

  // ============================================
  // FIX 3: Remove duplicate HttpsError imports
  // ============================================
  const httpsErrorImportCount = (content.match(/import\s*{[^}]*HttpsError[^}]*}\s*from/g) || []).length;
  if (httpsErrorImportCount > 1) {
    // Keep only the first HttpsError import
    let first = true;
    content = content.replace(
      /import\s*{([^}]*)HttpsError([^}]*)}\s*from\s*(['"][^'"]+['"])/g,
      (match, before, after, source) => {
        if (first) {
          first = false;
          return match;
        }
        // Remove HttpsError from this import
        const otherImports = (before + after).replace(/,\s*,/g, ',').replace(/^,|,$/g, '').trim();
        if (otherImports) {
          return `import { ${otherImports} } from ${source}`;
        }
        return '';
      }
    );
    fixes.push('Removed duplicate HttpsError imports');
  }

  // ============================================
  // FIX 4: Remove duplicate Timestamp imports
  // ============================================
  const timestampImportCount = (content.match(/import\s*{[^}]*Timestamp[^}]*}\s*from/g) || []).length;
  if (timestampImportCount > 1) {
    // Keep only the first Timestamp import
    let first = true;
    content = content.replace(
      /import\s*{([^}]*)Timestamp([^}]*)}\s*from\s*(['"][^'"]+['"])/g,
      (match, before, after, source) => {
        if (first) {
          first = false;
          return match;
        }
        // Remove Timestamp from this import
        const otherImports = (before + after).replace(/,\s*,/g, ',').replace(/^,|,$/g, '').trim();
        if (otherImports) {
          return `import { ${otherImports} } from ${source}`;
        }
        return '';
      }
    );
    fixes.push('Removed duplicate Timestamp imports');
  }

  // ============================================
  // FIX 5: Remove duplicate db imports
  // ============================================
  const dbImportCount = (content.match(/import\s*{[^}]*\bdb\b[^}]*}\s*from/g) || []).length;
  if (dbImportCount > 1) {
    // Keep only the first db import
    let first = true;
    content = content.replace(
      /import\s*{([^}]*)}\s*from\s*(['"][^'"]+['"])/g,
      (match, imports, source) => {
        if (!imports.includes('db')) return match;
        if (first) {
          first = false;
          return match;
        }
        // Remove db from this import
        const importList = imports.split(',').map(i => i.trim()).filter(i => i && i !== 'db');
        if (importList.length > 0) {
          return `import { ${importList.join(', ')} } from ${source}`;
        }
        return '';
      }
    );
    fixes.push('Removed duplicate db imports');
  }

  // ============================================
  // FIX 6: Clean up empty import statements
  // ============================================
  content = content.replace(/import\s*{\s*}\s*from\s*['"][^'"]+['"];\s*\n?/g, '');
  
  // ============================================
  // FIX 7: Clean up multiple consecutive newlines
  // ============================================
  content = content.replace(/\n{3,}/g, '\n\n');

  // Write back if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes.length;
    if (fixes.length > 0) {
      console.log(`✅ ${relativePath}: ${fixes.join(', ')}`);
    }
    return true;
  }
  return false;
}

console.log('🔧 Starting FIX ALL CONFLICTS...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  fixFile(file);
}

console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes applied`);
