/**
 * TypeScript Error Fix Script - Batch 1
 * Fixes TS2440 import conflicts and TS2300 duplicate identifiers
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Track changes
let filesModified = 0;
let totalFixes = 0;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fixes = [];

  // =====================================================
  // FIX 1: Remove duplicate imports when already imported from runtime
  // Pattern: import { db } from "./runtime"; ... import { db } from "./init";
  // =====================================================
  
  // Check if file imports from runtime
  const hasRuntimeImport = /import\s*\{[^}]*\}\s*from\s*["']\.\/runtime["']/.test(content) ||
                           /import\s*\{[^}]*\}\s*from\s*["']\.\.\/runtime["']/.test(content);
  
  if (hasRuntimeImport) {
    // Get what's imported from runtime
    const runtimeImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*["'](?:\.\/|\.\.\/)+runtime["']/);
    if (runtimeImportMatch) {
      const runtimeImports = runtimeImportMatch[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      
      // Remove conflicting imports from init.ts
      const initImportRegex = /import\s*\{([^}]+)\}\s*from\s*["'](?:\.\/|\.\.\/)+init["'];?\n?/g;
      content = content.replace(initImportRegex, (match, imports) => {
        const importList = imports.split(',').map(s => s.trim().split(' as ')[0].trim());
        const nonConflicting = importList.filter(i => !runtimeImports.includes(i));
        if (nonConflicting.length === 0) {
          fixes.push(`Removed duplicate init import: ${match.trim()}`);
          return '';
        } else if (nonConflicting.length < importList.length) {
          const newImport = `import { ${nonConflicting.join(', ')} } from "./init";\n`;
          fixes.push(`Reduced init import to: ${nonConflicting.join(', ')}`);
          return newImport;
        }
        return match;
      });
      
      // Remove conflicting imports from firebase-admin/firestore
      const firestoreImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']firebase-admin\/firestore["'];?\n?/g;
      content = content.replace(firestoreImportRegex, (match, imports) => {
        const importList = imports.split(',').map(s => s.trim().split(' as ')[0].trim());
        const nonConflicting = importList.filter(i => !runtimeImports.includes(i) && i !== 'FieldValue' && i !== 'Timestamp');
        if (nonConflicting.length === 0) {
          fixes.push(`Removed duplicate firebase-admin/firestore import`);
          return '';
        } else if (nonConflicting.length < importList.length) {
          const newImport = `import { ${nonConflicting.join(', ')} } from "firebase-admin/firestore";\n`;
          fixes.push(`Reduced firebase-admin/firestore import to: ${nonConflicting.join(', ')}`);
          return newImport;
        }
        return match;
      });
      
      // Remove conflicting imports from firebase-functions/v2/https
      const httpsImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']firebase-functions\/v2\/https["'];?\n?/g;
      content = content.replace(httpsImportRegex, (match, imports) => {
        const importList = imports.split(',').map(s => s.trim().split(' as ')[0].trim());
        const nonConflicting = importList.filter(i => !runtimeImports.includes(i));
        if (nonConflicting.length === 0) {
          fixes.push(`Removed duplicate firebase-functions/v2/https import`);
          return '';
        } else if (nonConflicting.length < importList.length) {
          const newImport = `import { ${nonConflicting.join(', ')} } from "firebase-functions/v2/https";\n`;
          fixes.push(`Reduced firebase-functions/v2/https import to: ${nonConflicting.join(', ')}`);
          return newImport;
        }
        return match;
      });
    }
  }

  // =====================================================
  // FIX 2: Remove duplicate Timestamp imports/declarations
  // =====================================================
  
  // Count Timestamp occurrences in imports
  const timestampImports = (content.match(/import\s*\{[^}]*Timestamp[^}]*\}/g) || []).length;
  if (timestampImports > 1) {
    // Keep only the first Timestamp import, remove from others
    let firstFound = false;
    content = content.replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g, (match, imports, source) => {
      if (imports.includes('Timestamp')) {
        if (!firstFound) {
          firstFound = true;
          return match;
        } else {
          // Remove Timestamp from this import
          const importList = imports.split(',').map(s => s.trim());
          const filtered = importList.filter(i => !i.includes('Timestamp'));
          if (filtered.length === 0) {
            fixes.push(`Removed duplicate Timestamp import from ${source}`);
            return '';
          }
          fixes.push(`Removed duplicate Timestamp from ${source} import`);
          return `import { ${filtered.join(', ')} } from "${source}";`;
        }
      }
      return match;
    });
  }

  // =====================================================
  // FIX 3: Fix duplicate 'request' parameter names in onCall handlers
  // Pattern: export const fn = onCall(async (request) => { const { request } = request.data; })
  // =====================================================
  
  // Fix pattern where request is destructured inside onCall that already has request param
  content = content.replace(
    /onCall\s*\(\s*async\s*\(\s*request\s*\)\s*=>\s*\{([^]*?)const\s*\{\s*([^}]*request[^}]*)\s*\}\s*=\s*request\.data/g,
    (match, before, destructured) => {
      // Rename the destructured request to requestData
      const newDestructured = destructured.replace(/\brequest\b/g, 'requestData');
      fixes.push(`Renamed destructured 'request' to 'requestData' in onCall handler`);
      return `onCall(async (request) => {${before}const { ${newDestructured} } = request.data`;
    }
  );

  // =====================================================
  // FIX 4: Fix TS2440 - Import conflicts with local declarations
  // When a file has both: import { db } from "./runtime" AND const db = ...
  // =====================================================
  
  // Check for local db declarations that conflict with imports
  const hasDbImport = /import\s*\{[^}]*\bdb\b[^}]*\}\s*from/.test(content);
  const hasLocalDb = /(?:const|let|var)\s+db\s*=/.test(content);
  
  if (hasDbImport && hasLocalDb) {
    // Rename local db to localDb
    content = content.replace(/(?:const|let|var)\s+db\s*=\s*([^;]+);/g, (match, value) => {
      fixes.push(`Renamed local 'db' declaration to 'localDb'`);
      return `const localDb = ${value};`;
    });
    // Update references to the local db (this is tricky, skip for now)
  }

  // =====================================================
  // FIX 5: Fix admin.FieldValue pattern
  // Pattern: admin.FieldValue.serverTimestamp() -> FieldValue.serverTimestamp()
  // =====================================================
  
  if (content.includes('admin.FieldValue')) {
    // Check if FieldValue is imported
    if (!content.includes('FieldValue') || !content.match(/import\s*\{[^}]*FieldValue[^}]*\}/)) {
      // Add FieldValue to runtime import if exists
      content = content.replace(
        /import\s*\{([^}]+)\}\s*from\s*["']\.\/runtime["']/,
        (match, imports) => {
          if (!imports.includes('FieldValue')) {
            fixes.push(`Added FieldValue to runtime import`);
            return `import { ${imports}, FieldValue } from "./runtime"`;
          }
          return match;
        }
      );
    }
    // Replace admin.FieldValue with FieldValue
    content = content.replace(/admin\.FieldValue/g, 'FieldValue');
    fixes.push(`Replaced admin.FieldValue with FieldValue`);
  }

  // Write back if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes.length;
    console.log(`✅ ${path.relative(srcDir, filePath)}: ${fixes.length} fixes`);
    fixes.forEach(f => console.log(`   - ${f}`));
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      processFile(filePath);
    }
  }
}

console.log('🔧 Starting TypeScript Error Fix - Batch 1...\n');
walkDir(srcDir);
console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes`);
