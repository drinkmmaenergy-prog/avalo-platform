/**
 * Fix remaining "timestamp as }" patterns
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
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
  const relativePath = path.relative(srcDir, filePath);

  // Fix pattern: "timestamp as }" or "timestamp as ," 
  // These are broken imports where the alias was removed
  
  // Pattern 1: timestamp as } from
  content = content.replace(/timestamp\s+as\s*}\s*from/g, '} from');
  
  // Pattern 2: timestamp as , something
  content = content.replace(/timestamp\s+as\s*,\s*/g, '');
  
  // Pattern 3: , timestamp as } 
  content = content.replace(/,\s*timestamp\s+as\s*}/g, ' }');
  
  // Pattern 4: { timestamp as }
  content = content.replace(/{\s*timestamp\s+as\s*}/g, '{ }');
  
  // Clean up empty imports
  content = content.replace(/import\s*{\s*}\s*from\s*['"][^'"]+['"];?\n?/g, '');
  
  // Clean up double commas
  content = content.replace(/,\s*,/g, ',');
  
  // Clean up { , 
  content = content.replace(/{\s*,\s*/g, '{ ');
  
  // Clean up , }
  content = content.replace(/,\s*}/g, ' }');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    console.log(`✅ ${relativePath}`);
    return true;
  }
  return false;
}

console.log('🔧 Fixing remaining "timestamp as" patterns...\n');

const files = getAllTsFiles(srcDir);

for (const file of files) {
  fixFile(file);
}

console.log(`\n✅ Complete: ${filesModified} files modified`);
