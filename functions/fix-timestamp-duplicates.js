/**
 * Fix duplicate Timestamp imports
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const files = [
  'pack122-cultural-safety.ts',
  'pack122-region-policy.ts',
  'pack122-safety-resources.ts',
  'pack164-accelerator.ts',
  'pack95-anomaly-detection.ts',
  'pack95-session-security.ts',
];

for (const file of files) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  // Pattern 1: import { ..., timestamp as Timestamp } from './init'
  // Remove the "timestamp as Timestamp" part
  if (/import\s*{[^}]*timestamp\s+as\s+Timestamp[^}]*}\s*from\s*['"]\.\/init['"]/.test(content)) {
    content = content.replace(
      /import\s*{([^}]*)timestamp\s+as\s+Timestamp([^}]*)}\s*from\s*['"]\.\/init['"]/,
      (match, before, after) => {
        const parts = (before + after).split(',').map(p => p.trim()).filter(p => p);
        if (parts.length === 0) {
          return '// Timestamp now imported from runtime';
        }
        return `import { ${parts.join(', ')} } from './init'`;
      }
    );
    modified = true;
    console.log(`✅ Removed timestamp as Timestamp from init import in ${file}`);
  }
  
  // Pattern 2: import { Timestamp } from 'firebase-admin/firestore' AND import { Timestamp } from './runtime'
  // Keep only the runtime import
  const firestoreTimestampMatch = content.match(/import\s*{[^}]*Timestamp[^}]*}\s*from\s*['"]firebase-admin\/firestore['"]/);
  const runtimeTimestampMatch = content.match(/import\s*{[^}]*Timestamp[^}]*}\s*from\s*['"]\.\/runtime['"]/);
  
  if (firestoreTimestampMatch && runtimeTimestampMatch) {
    // Remove Timestamp from firebase-admin/firestore import
    content = content.replace(
      /import\s*{([^}]*)Timestamp([^}]*)}\s*from\s*['"]firebase-admin\/firestore['"]/,
      (match, before, after) => {
        const parts = (before + after).split(',').map(p => p.trim()).filter(p => p && p !== 'Timestamp');
        if (parts.length === 0) {
          return '// Timestamp now imported from runtime';
        }
        return `import { ${parts.join(', ')} } from 'firebase-admin/firestore'`;
      }
    );
    modified = true;
    console.log(`✅ Removed Timestamp from firebase-admin/firestore import in ${file}`);
  }
  
  // Pattern 3: type Timestamp = ... declaration
  if (/^type\s+Timestamp\s*=/m.test(content)) {
    content = content.replace(/^type\s+Timestamp\s*=.+;?\s*$/gm, '// Timestamp imported from runtime');
    modified = true;
    console.log(`✅ Removed type Timestamp declaration in ${file}`);
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content);
  }
}

console.log('\n✅ Timestamp duplicate fix complete!');
