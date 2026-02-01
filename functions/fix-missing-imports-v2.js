/**
 * FIX MISSING IMPORTS V2
 * Re-adds HttpsError and Timestamp imports where they were incorrectly removed
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

  // Check if file uses HttpsError but doesn't import it
  const usesHttpsError = /\bHttpsError\b/.test(content);
  const hasHttpsErrorImport = /import\s*{[^}]*HttpsError[^}]*}\s*from/.test(content);
  const hasRuntimeImport = /import\s*{[^}]*}\s*from\s*['"]\.\/runtime['"]/.test(content) || 
                           /import\s*{[^}]*}\s*from\s*['"]\.\.\/runtime['"]/.test(content);

  // Check if file uses Timestamp but doesn't import it
  const usesTimestamp = /\bTimestamp\b/.test(content);
  const hasTimestampImport = /import\s*{[^}]*Timestamp[^}]*}\s*from/.test(content);
  const hasInitImport = /import\s*{[^}]*}\s*from\s*['"]\.\/init['"]/.test(content) ||
                        /import\s*{[^}]*}\s*from\s*['"]\.\.\/init['"]/.test(content);

  // Check if file uses db but doesn't import it
  const usesDb = /\bdb\b/.test(content) && /db\./.test(content);
  const hasDbImport = /import\s*{[^}]*\bdb\b[^}]*}\s*from/.test(content);

  // Determine the correct relative path for imports
  const depth = relativePath.split(path.sep).length - 1;
  const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';
  const initPath = depth > 0 ? '../'.repeat(depth) + 'init' : './init';

  // Fix missing HttpsError
  if (usesHttpsError && !hasHttpsErrorImport) {
    if (hasRuntimeImport) {
      // Add HttpsError to existing runtime import
      content = content.replace(
        /import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/)+runtime\2/,
        (match, imports, quote, prefix) => {
          if (!imports.includes('HttpsError')) {
            return `import { ${imports.trim()}, HttpsError } from ${quote}${prefix}runtime${quote}`;
          }
          return match;
        }
      );
      fixes.push('Added HttpsError to runtime import');
    } else if (hasInitImport) {
      // Add HttpsError import from firebase-functions/v2/https
      const firstImport = content.indexOf('import ');
      if (firstImport !== -1) {
        content = content.slice(0, firstImport) + 
          "import { HttpsError } from 'firebase-functions/v2/https';\n" + 
          content.slice(firstImport);
        fixes.push('Added HttpsError import from firebase-functions');
      }
    } else {
      // Add both runtime import with HttpsError
      const firstImport = content.indexOf('import ');
      if (firstImport !== -1) {
        content = content.slice(0, firstImport) + 
          `import { HttpsError } from '${runtimePath}';\n` + 
          content.slice(firstImport);
        fixes.push('Added HttpsError import from runtime');
      }
    }
  }

  // Fix missing Timestamp
  if (usesTimestamp && !hasTimestampImport) {
    if (hasInitImport) {
      // Add Timestamp to existing init import
      content = content.replace(
        /import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/)+init\2/,
        (match, imports, quote, prefix) => {
          if (!imports.includes('Timestamp')) {
            return `import { ${imports.trim()}, Timestamp } from ${quote}${prefix}init${quote}`;
          }
          return match;
        }
      );
      fixes.push('Added Timestamp to init import');
    } else if (hasRuntimeImport) {
      // Add Timestamp to existing runtime import
      content = content.replace(
        /import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/)+runtime\2/,
        (match, imports, quote, prefix) => {
          if (!imports.includes('Timestamp')) {
            return `import { ${imports.trim()}, Timestamp } from ${quote}${prefix}runtime${quote}`;
          }
          return match;
        }
      );
      fixes.push('Added Timestamp to runtime import');
    } else {
      // Add init import with Timestamp
      const firstImport = content.indexOf('import ');
      if (firstImport !== -1) {
        content = content.slice(0, firstImport) + 
          `import { Timestamp } from '${initPath}';\n` + 
          content.slice(firstImport);
        fixes.push('Added Timestamp import from init');
      }
    }
  }

  // Fix missing db
  if (usesDb && !hasDbImport) {
    if (hasInitImport) {
      // Add db to existing init import
      content = content.replace(
        /import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/)+init\2/,
        (match, imports, quote, prefix) => {
          if (!imports.includes('db')) {
            return `import { ${imports.trim()}, db } from ${quote}${prefix}init${quote}`;
          }
          return match;
        }
      );
      fixes.push('Added db to init import');
    } else if (hasRuntimeImport) {
      // Add db to existing runtime import
      content = content.replace(
        /import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/)+runtime\2/,
        (match, imports, quote, prefix) => {
          if (!imports.includes('db')) {
            return `import { ${imports.trim()}, db } from ${quote}${prefix}runtime${quote}`;
          }
          return match;
        }
      );
      fixes.push('Added db to runtime import');
    } else {
      // Add init import with db
      const firstImport = content.indexOf('import ');
      if (firstImport !== -1) {
        content = content.slice(0, firstImport) + 
          `import { db } from '${initPath}';\n` + 
          content.slice(firstImport);
        fixes.push('Added db import from init');
      }
    }
  }

  // Write back if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes.length;
    console.log(`✅ ${relativePath}: ${fixes.join(', ')}`);
    return true;
  }
  return false;
}

console.log('🔧 Starting FIX MISSING IMPORTS V2...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  fixFile(file);
}

console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes applied`);
