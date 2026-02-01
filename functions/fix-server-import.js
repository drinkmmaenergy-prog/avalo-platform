/**
 * Remove unused 'server' import from files
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with server import issues based on build output
const filesToFix = [
  'creator/earnings.ts',
  'tax-engine/tax-calculation.ts',
  'tax-engine/tax-profile.ts',
  'tax-engine/tax-reporting.ts',
  'triggers/chemistryLockInTriggers.ts',
];

function fixFile(relativePath) {
  const filePath = path.join(srcDir, relativePath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${relativePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Remove 'server' from import statements
  // Pattern: , server, or , server } or server,
  content = content.replace(/, server,/g, ',');
  content = content.replace(/, server\s*}/g, ' }');
  content = content.replace(/{\s*server,/g, '{');
  content = content.replace(/,\s*server\s*,/g, ',');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${relativePath}`);
    return true;
  }
  
  console.log(`No changes needed in ${relativePath}`);
  return false;
}

// Run fixes
console.log('Removing unused server imports...\n');

let fixedCount = 0;
for (const file of filesToFix) {
  if (fixFile(file)) {
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
