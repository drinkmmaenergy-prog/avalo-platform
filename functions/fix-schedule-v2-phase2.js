/**
 * BATCH B Migration Phase 2: Fix import paths and return types
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getTypescriptFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      getTypescriptFiles(filePath, fileList);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Calculate relative path from file to src directory
  const relDir = path.relative(srcDir, path.dirname(filePath));
  const depth = relDir ? relDir.split(path.sep).length : 0;
  const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';
  
  // Fix wrong runtime import paths (./runtime -> ../runtime for subdirectories)
  if (depth > 0) {
    content = content.replace(
      /from\s*(['"`])\.\/runtime\1/g,
      `from '${runtimePath}'`
    );
  }
  
  // Fix remaining pubsub.schedule patterns that weren't caught
  // Pattern: pubsub.schedule('...')
  content = content.replace(
    /pubsub\s*\.schedule\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g,
    (match, q, schedule) => {
      return `onSchedule('${schedule}',`;
    }
  );
  
  // Clean up double imports of onSchedule
  // Remove duplicate onSchedule from import statements
  content = content.replace(
    /import\s*\{\s*onSchedule\s*,\s*onSchedule\s*}/g,
    'import { onSchedule }'
  );
  
  // Fix: remove functions. prefix from onSchedule calls that shouldn't have it
  content = content.replace(
    /functions\.onSchedule/g,
    'onSchedule'
  );
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed: ${path.relative(srcDir, filePath)}`);
    return true;
  }
  return false;
}

console.log('Phase 2: Fixing import paths and remaining patterns');
console.log('='.repeat(60));

const files = getTypescriptFiles(srcDir);
let fixedCount = 0;

files.forEach(file => {
  try {
    if (fixFile(file)) {
      fixedCount++;
    }
  } catch (err) {
    console.error(`Error: ${file}: ${err.message}`);
  }
});

console.log(`\nFixed ${fixedCount} files`);
