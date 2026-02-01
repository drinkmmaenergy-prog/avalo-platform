/**
 * Fix TS2440 import conflicts - where import declarations conflict with local declarations
 * 
 * Pattern: Files import { storage } from './runtime' but also declare const storage = ...
 * Fix: Remove the conflicting import or rename the local variable
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with known TS2440 conflicts based on build output
const filesToFix = [
  'analyticsExport.ts',
  'compliance.ts',
  'creatorStore.ts',
  'liveEngine.ts',
  'media.ts',
  'mediaUpload.ts',
];

function fixFile(filename) {
  const filePath = path.join(srcDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Pattern 1: Import storage from runtime, but also declare const storage
  // Fix: Remove storage from the import
  if (content.includes('import { storage') && content.includes('const storage')) {
    // Remove storage from import
    content = content.replace(
      /import \{ ([^}]*)\bstorage\b([^}]*) \} from ['"]\.\/runtime['"]/g,
      (match, before, after) => {
        const parts = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'storage');
        if (parts.length === 0) {
          return '// Removed: storage import conflicts with local declaration';
        }
        return `import { ${parts.join(', ')} } from './runtime'`;
      }
    );
    modified = true;
  }
  
  // Pattern 2: Import HttpsError from runtime, but also declare const HttpsError
  if (content.includes('import { HttpsError') && content.includes('const HttpsError')) {
    content = content.replace(
      /import \{ ([^}]*)\bHttpsError\b([^}]*) \} from ['"]\.\/runtime['"]/g,
      (match, before, after) => {
        const parts = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'HttpsError');
        if (parts.length === 0) {
          return '// Removed: HttpsError import conflicts with local declaration';
        }
        return `import { ${parts.join(', ')} } from './runtime'`;
      }
    );
    modified = true;
  }
  
  // Pattern 3: Import auth from runtime, but also declare const auth
  if (content.includes('import { auth') && content.includes('const auth')) {
    content = content.replace(
      /import \{ ([^}]*)\bauth\b([^}]*) \} from ['"]\.\/runtime['"]/g,
      (match, before, after) => {
        const parts = (before + after).split(',').map(s => s.trim()).filter(s => s && s !== 'auth');
        if (parts.length === 0) {
          return '// Removed: auth import conflicts with local declaration';
        }
        return `import { ${parts.join(', ')} } from './runtime'`;
      }
    );
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filename}`);
    return true;
  }
  
  return false;
}

console.log('Fixing TS2440 import conflicts...');
let fixedCount = 0;
for (const file of filesToFix) {
  if (fixFile(file)) {
    fixedCount++;
  }
}
console.log(`Fixed ${fixedCount} files`);
