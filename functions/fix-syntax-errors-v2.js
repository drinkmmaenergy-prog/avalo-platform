/**
 * Fix syntax errors created by the aggressive fix script
 * - Fix broken import statements like "timestamp as , FieldValue"
 * - Fix duplicate Timestamp imports
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
let totalFixes = 0;
let filesModified = 0;

function getAllTsFiles(dir) {
  const files = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (item.name.endsWith('.ts') && !item.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory doesn't exist
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const fixes = [];
  const relativePath = path.relative(srcDir, filePath);
  const fileName = path.basename(filePath);

  // Skip init.ts and runtime.ts
  if (fileName === 'init.ts' || fileName === 'runtime.ts') {
    return false;
  }

  // Fix 1: Remove broken "timestamp as ," patterns
  // Pattern: "timestamp as , FieldValue" -> "FieldValue"
  content = content.replace(/timestamp\s+as\s*,\s*/g, '');
  
  // Fix 2: Remove broken ", ," patterns in imports
  content = content.replace(/,\s*,/g, ',');
  
  // Fix 3: Remove broken "{ , " patterns
  content = content.replace(/{\s*,\s*/g, '{ ');
  
  // Fix 4: Remove broken ", }" patterns
  content = content.replace(/,\s*}/g, ' }');
  
  // Fix 5: Remove duplicate Timestamp imports - keep only the first one
  const timestampImportRegex = /import\s*{\s*Timestamp\s*}\s*from\s*['"][^'"]+['"];?\n?/g;
  const timestampMatches = content.match(timestampImportRegex);
  if (timestampMatches && timestampMatches.length > 1) {
    // Keep only the first one
    let first = true;
    content = content.replace(timestampImportRegex, (match) => {
      if (first) {
        first = false;
        return match;
      }
      fixes.push('Removed duplicate Timestamp import');
      return '';
    });
  }
  
  // Fix 6: Remove duplicate imports of same identifier from same source
  const importLines = [];
  const seenImports = new Set();
  const lines = content.split('\n');
  const newLines = [];
  
  for (const line of lines) {
    const importMatch = line.match(/^import\s*{([^}]+)}\s*from\s*(['"][^'"]+['"])/);
    if (importMatch) {
      const identifiers = importMatch[1].split(',').map(id => id.trim()).filter(Boolean);
      const source = importMatch[2];
      const key = `${identifiers.sort().join(',')}|${source}`;
      
      if (seenImports.has(key)) {
        fixes.push(`Removed duplicate import line`);
        continue;
      }
      seenImports.add(key);
    }
    newLines.push(line);
  }
  content = newLines.join('\n');
  
  // Fix 7: Clean up empty imports
  content = content.replace(/import\s*{\s*}\s*from\s*['"][^'"]+['"];?\n?/g, '');
  
  // Fix 8: Clean up multiple consecutive newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes.length || 1;
    if (fixes.length > 0) {
      console.log(`✅ ${relativePath}: ${fixes.length} fixes`);
    } else {
      console.log(`✅ ${relativePath}: syntax cleanup`);
    }
    return true;
  }
  return false;
}

console.log('🔧 Fixing syntax errors...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  fixFile(file);
}

console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes applied`);
