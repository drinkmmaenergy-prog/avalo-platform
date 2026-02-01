/**
 * Fix self-reference patterns like:
 * const storage = storage;
 * const auth = auth;
 * const db = db;
 * 
 * These are broken code patterns that need to be removed.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      callback(filePath);
    }
  }
}

let totalFixed = 0;

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Pattern: const X = X; (self-reference)
  const selfRefPattern = /const\s+(\w+)\s*=\s*\1\s*;/g;
  
  const matches = content.match(selfRefPattern);
  if (matches) {
    for (const match of matches) {
      // Remove the self-reference line
      content = content.replace(match, `// Removed self-reference: ${match}`);
      modified = true;
      console.log(`  Fixed in ${path.relative(srcDir, filePath)}: ${match}`);
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    totalFixed++;
  }
}

console.log('Fixing self-reference patterns...');
walkDir(srcDir, fixFile);
console.log(`Fixed ${totalFixed} files`);
