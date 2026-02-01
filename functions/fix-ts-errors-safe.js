/**
 * TypeScript Error Fix Script - Safe Version
 * Only removes duplicate imports, does NOT rename variables
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
  // FIX 1: Remove duplicate imports from firebase-admin/firestore
  // when already imported from runtime
  // =====================================================
  
  // Check if file imports from runtime
  const runtimeImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*["'](?:\.\/|\.\.\/)+runtime["']/);
  
  if (runtimeImportMatch) {
    const runtimeImports = runtimeImportMatch[1].split(',').map(s => s.trim().split(' as ')[0].trim());
    
    // Remove conflicting imports from firebase-admin/firestore
    const firestoreImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']firebase-admin\/firestore["'];?\n?/g;
    content = content.replace(firestoreImportRegex, (match, imports) => {
      const importList = imports.split(',').map(s => s.trim().split(' as ')[0].trim());
      // Filter out items that are in runtime imports OR are FieldValue/Timestamp (always from runtime)
      const nonConflicting = importList.filter(i => {
        const name = i.trim();
        return !runtimeImports.includes(name) && 
               name !== 'FieldValue' && 
               name !== 'Timestamp' &&
               name !== 'db' &&
               name !== 'getFirestore';
      });
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
      const nonConflicting = importList.filter(i => {
        const name = i.trim();
        return !runtimeImports.includes(name);
      });
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
    
    // Remove conflicting imports from firebase-functions/v2
    const functionsV2ImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']firebase-functions\/v2["'];?\n?/g;
    content = content.replace(functionsV2ImportRegex, (match, imports) => {
      const importList = imports.split(',').map(s => s.trim().split(' as ')[0].trim());
      const nonConflicting = importList.filter(i => {
        const name = i.trim();
        return !runtimeImports.includes(name) && name !== 'logger';
      });
      if (nonConflicting.length === 0) {
        fixes.push(`Removed duplicate firebase-functions/v2 import`);
        return '';
      } else if (nonConflicting.length < importList.length) {
        const newImport = `import { ${nonConflicting.join(', ')} } from "firebase-functions/v2";\n`;
        fixes.push(`Reduced firebase-functions/v2 import to: ${nonConflicting.join(', ')}`);
        return newImport;
      }
      return match;
    });
  }

  // =====================================================
  // FIX 2: Remove duplicate Timestamp imports
  // Keep only the first one
  // =====================================================
  
  // Count Timestamp occurrences in imports
  const timestampMatches = content.match(/import\s*\{[^}]*\bTimestamp\b[^}]*\}/g) || [];
  if (timestampMatches.length > 1) {
    let firstFound = false;
    content = content.replace(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/g, (match, imports, source) => {
      if (/\bTimestamp\b/.test(imports)) {
        if (!firstFound) {
          firstFound = true;
          return match;
        } else {
          // Remove Timestamp from this import
          const importList = imports.split(',').map(s => s.trim());
          const filtered = importList.filter(i => !/\bTimestamp\b/.test(i));
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

console.log('🔧 Starting TypeScript Error Fix - Safe Version...\n');
walkDir(srcDir);
console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes`);
