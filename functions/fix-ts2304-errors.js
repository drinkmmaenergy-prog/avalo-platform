/**
 * Fix TS2304 "Cannot find name" errors
 * 
 * This script adds missing imports for common undefined names.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Map of missing names to their import statements
const importFixes = {
  'Timestamp': {
    import: "import { Timestamp } from 'firebase-admin/firestore';",
    checkExisting: /import\s*{[^}]*Timestamp[^}]*}\s*from\s*['"]firebase-admin\/firestore['"]/
  },
  'getStorage': {
    import: "import { storage } from './init';",
    replacement: 'storage', // Replace getStorage() with storage
    checkExisting: /import\s*{[^}]*storage[^}]*}\s*from\s*['"]\.\/init['"]/
  },
  'getAuth': {
    import: "import { auth } from './init';",
    replacement: 'auth', // Replace getAuth() with auth
    checkExisting: /import\s*{[^}]*auth[^}]*}\s*from\s*['"]\.\/init['"]/
  },
  'functions': {
    import: "import { functions } from './runtime';",
    checkExisting: /import\s*{[^}]*functions[^}]*}\s*from\s*['"]\.\/runtime['"]/
  }
};

// Files with specific fixes needed
const fileFixes = {
  'lib/alerting.ts': {
    addImport: "import { Timestamp } from 'firebase-admin/firestore';"
  },
  'lib/logger.ts': {
    addImport: "import { Timestamp } from 'firebase-admin/firestore';"
  },
  'lib/metricsAggregation.ts': {
    addImport: "import { Timestamp } from 'firebase-admin/firestore';"
  },
  'analyticsExport.ts': {
    replace: [
      { from: /getStorage\(\)/g, to: 'storage' }
    ],
    addImport: "import { storage } from './init';"
  },
  'compliance.ts': {
    replace: [
      { from: /getStorage\(\)/g, to: 'storage' },
      { from: /getAuth\(\)/g, to: 'auth' }
    ],
    addImport: "import { storage, auth } from './init';"
  },
  'media.ts': {
    replace: [
      { from: /getStorage\(\)/g, to: 'storage' }
    ],
    addImport: "import { storage } from './init';"
  },
  'privacy.ts': {
    replace: [
      { from: /getStorage\(\)/g, to: 'storage' }
    ],
    addImport: "import { storage } from './init';"
  },
  'creatorShop.ts': {
    replace: [
      { from: /getStorage\(\)/g, to: 'storage' }
    ],
    addImport: "import { storage } from './init';"
  },
  'creatorStore.ts': {
    replace: [
      { from: /getStorage\(\)/g, to: 'storage' }
    ],
    addImport: "import { storage } from './init';"
  },
  'engines/riskEngine.ts': {
    replace: [
      { from: /getAuth\(\)/g, to: 'auth' }
    ],
    addImport: "import { auth } from './init';"
  },
  'pack414-integration-audit.ts': {
    addImport: "import { functions } from './runtime';"
  },
  'secondChance/rewriteFirstMessage.ts': {
    addImport: "import { functions } from './runtime';"
  }
};

function processFile(filePath, fixes) {
  const fullPath = path.join(srcDir, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  // Apply replacements
  if (fixes.replace) {
    for (const { from, to } of fixes.replace) {
      if (from.test(content)) {
        content = content.replace(from, to);
        modified = true;
        console.log(`  Replaced ${from} with ${to}`);
      }
    }
  }
  
  // Add import if needed
  if (fixes.addImport) {
    // Check if import already exists
    const importLine = fixes.addImport;
    const importModule = importLine.match(/from\s*['"]([^'"]+)['"]/)?.[1];
    
    if (importModule && !content.includes(importModule)) {
      // Add import after the first import statement or at the top
      const firstImportMatch = content.match(/^import\s+/m);
      if (firstImportMatch) {
        const insertPos = content.indexOf('\n', firstImportMatch.index) + 1;
        content = content.slice(0, insertPos) + importLine + '\n' + content.slice(insertPos);
      } else {
        content = importLine + '\n' + content;
      }
      modified = true;
      console.log(`  Added import: ${importLine}`);
    }
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content);
    return true;
  }
  return false;
}

// Process each file
let totalFixed = 0;
for (const [filePath, fixes] of Object.entries(fileFixes)) {
  console.log(`Processing ${filePath}...`);
  if (processFile(filePath, fixes)) {
    totalFixed++;
  }
}

console.log(`\nFixed ${totalFixed} files`);
