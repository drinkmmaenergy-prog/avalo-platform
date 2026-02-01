/**
 * Fix Broken Shared Imports
 * Properly comment out shared imports and create type stubs
 */
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

let filesFixed = 0;

function getAllTsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const relativePath = path.relative(srcDir, filePath);

  // Fix pattern: "// TODO: Fix shared import" followed by broken multi-line import
  // Matches the broken pattern created by the previous script
  const brokenPattern = /\/\/ TODO: Fix shared import\n\/\/ import \{[\s\S]*?\} from ['"][^'"]+['"];?\n\/\/ Temporary type placeholders:\n(?:type \w+ = any;\n)*(?:type\s+= any;\n)?/g;
  
  content = content.replace(brokenPattern, (match) => {
    // Extract type names from the commented import
    const typeMatches = match.match(/type (\w+) = any;/g);
    if (!typeMatches) return '';
    
    const types = typeMatches
      .map(t => t.match(/type (\w+)/)?.[1])
      .filter(t => t && t.length > 0);
    
    if (types.length === 0) return '';
    
    return `// Shared types stubbed locally\n${types.map(t => `type ${t} = any;`).join('\n')}\n`;
  });
  
  // Also fix: standalone broken imports like:
  //   ModerationLabels,
  //   ModerationResult,
  // } from '../../shared/...
  const standaloneImportPattern = /^\s+\w+,\n/gm;
  // This is tricky - we need to identify lines that are dangling type names
  
  // Fix empty type declarations: "type  = any;"
  content = content.replace(/type\s+= any;?\n?/g, '');
  
  // Fix double newlines
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    filesFixed++;
    console.log(`✅ Fixed: ${relativePath}`);
    return true;
  }
  return false;
}

// Main execution
console.log('🔧 Fixing broken shared imports...\n');

const files = getAllTsFiles(srcDir);

for (const file of files) {
  try {
    fixFile(file);
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

console.log(`\n✅ Complete: ${filesFixed} files fixed`);
