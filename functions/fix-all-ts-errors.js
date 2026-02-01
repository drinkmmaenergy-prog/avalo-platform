/**
 * Comprehensive TypeScript Error Fix Script
 * 
 * This script fixes multiple categories of TypeScript errors:
 * 1. TS2304 - Cannot find name (missing imports)
 * 2. TS2552 - Cannot find name, did you mean... (typos/missing imports)
 * 3. TS2339 - Property does not exist on type (type issues)
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Track changes
let totalChanges = 0;

// Helper to read and modify a file
function modifyFile(relativePath, modifications) {
  const fullPath = path.join(srcDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${relativePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  for (const mod of modifications) {
    if (mod.type === 'addImport') {
      // Check if import already exists
      const importModule = mod.import.match(/from\s*['"]([^'"]+)['"]/)?.[1];
      if (importModule && content.includes(importModule)) {
        // Module already imported, check if we need to add specific imports
        const importNames = mod.import.match(/import\s*{([^}]+)}/)?.[1];
        if (importNames) {
          const names = importNames.split(',').map(n => n.trim());
          const existingImportMatch = content.match(new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${importModule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
          if (existingImportMatch) {
            const existingNames = existingImportMatch[1].split(',').map(n => n.trim());
            const missingNames = names.filter(n => !existingNames.includes(n));
            if (missingNames.length > 0) {
              // Add missing names to existing import
              const newImport = existingImportMatch[0].replace(
                existingImportMatch[1],
                existingImportMatch[1] + ', ' + missingNames.join(', ')
              );
              content = content.replace(existingImportMatch[0], newImport);
              modified = true;
              console.log(`  Added ${missingNames.join(', ')} to existing import from ${importModule}`);
            }
          }
        }
      } else {
        // Add new import after first import or at top
        const firstImportMatch = content.match(/^import\s+/m);
        if (firstImportMatch) {
          const insertPos = content.indexOf('\n', firstImportMatch.index) + 1;
          content = content.slice(0, insertPos) + mod.import + '\n' + content.slice(insertPos);
        } else {
          content = mod.import + '\n' + content;
        }
        modified = true;
        console.log(`  Added import: ${mod.import}`);
      }
    } else if (mod.type === 'replace') {
      if (mod.pattern.test(content)) {
        content = content.replace(mod.pattern, mod.replacement);
        modified = true;
        console.log(`  Replaced: ${mod.pattern}`);
      }
    } else if (mod.type === 'replaceAll') {
      const matches = content.match(mod.pattern);
      if (matches) {
        content = content.replace(mod.pattern, mod.replacement);
        modified = true;
        console.log(`  Replaced all: ${mod.pattern} (${matches.length} occurrences)`);
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content);
    totalChanges++;
    return true;
  }
  return false;
}

// Files that need 'functions' import added
const filesNeedingFunctions = [
  'pack392-aso-engine.ts',
  'pack392-store-defense.ts',
  'pack392-trust-score.ts',
  'pack414-integration-audit.ts',
  'secondChance/rewriteFirstMessage.ts'
];

// Files that need Timestamp import
const filesNeedingTimestamp = [
  'lib/alerting.ts',
  'lib/logger.ts',
  'lib/metricsAggregation.ts'
];

// Process files needing functions import
console.log('\n=== Adding functions import ===');
for (const file of filesNeedingFunctions) {
  console.log(`Processing ${file}...`);
  modifyFile(file, [
    { type: 'addImport', import: "import { functions } from './runtime';" }
  ]);
}

// Process files needing Timestamp import
console.log('\n=== Adding Timestamp import ===');
for (const file of filesNeedingTimestamp) {
  console.log(`Processing ${file}...`);
  modifyFile(file, [
    { type: 'addImport', import: "import { Timestamp } from 'firebase-admin/firestore';" }
  ]);
}

// Fix getStorage -> storage replacements
console.log('\n=== Fixing getStorage -> storage ===');
const filesWithGetStorage = [
  'analyticsExport.ts',
  'compliance.ts',
  'media.ts',
  'privacy.ts',
  'creatorShop.ts',
  'creatorStore.ts'
];

for (const file of filesWithGetStorage) {
  console.log(`Processing ${file}...`);
  modifyFile(file, [
    { type: 'replaceAll', pattern: /getStorage\(\)/g, replacement: 'storage' },
    { type: 'addImport', import: "import { storage } from './init';" }
  ]);
}

// Fix getAuth -> auth replacements
console.log('\n=== Fixing getAuth -> auth ===');
const filesWithGetAuth = [
  'compliance.ts',
  'engines/riskEngine.ts'
];

for (const file of filesWithGetAuth) {
  console.log(`Processing ${file}...`);
  modifyFile(file, [
    { type: 'replaceAll', pattern: /getAuth\(\)/g, replacement: 'auth' },
    { type: 'addImport', import: "import { auth } from './init';" }
  ]);
}

// Fix crypto imports (Node.js crypto vs Web Crypto)
console.log('\n=== Fixing crypto imports ===');
const filesWithCrypto = [
  'chatSecurity.ts',
  'creatorShop.ts'
];

for (const file of filesWithCrypto) {
  console.log(`Processing ${file}...`);
  modifyFile(file, [
    { type: 'addImport', import: "import * as crypto from 'crypto';" },
    // Replace global crypto with imported crypto
    { type: 'replaceAll', pattern: /\bcrypto\.createHash\b/g, replacement: 'crypto.createHash' },
    { type: 'replaceAll', pattern: /\bcrypto\.randomBytes\b/g, replacement: 'crypto.randomBytes' }
  ]);
}

console.log(`\n=== Total files modified: ${totalChanges} ===`);
