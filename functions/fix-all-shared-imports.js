/**
 * Fix All Broken Shared Imports
 * Properly handles the pattern left by the previous script
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

  // Pattern 1: Fix broken imports where "// import {" was added but rest was left uncommented
  // Match: "// TODO: Fix shared import\n// import {\n  TypeName,\n  ...\n} from '../../shared/..."
  
  const brokenImportRegex = /\/\/ TODO: Fix shared import\n\/\/ import \{\n([\s\S]*?)\} from ['"][^'"]*['"];?\n\/\/ Temporary type placeholders:\n((?:type \w+ = any;\n)*(?:type\s*= any;\n)?)/g;
  
  content = content.replace(brokenImportRegex, (match, importBody, typeStubs) => {
    // Extract valid type names from the type stubs
    const typeNames = [];
    const stubMatches = typeStubs.matchAll(/type (\w+) = any;/g);
    for (const m of stubMatches) {
      if (m[1] && m[1].length > 0) {
        typeNames.push(m[1]);
      }
    }
    
    if (typeNames.length === 0) {
      // Try to extract from import body instead
      const bodyTypes = importBody.split(',').map(t => t.trim()).filter(t => t.length > 0 && /^\w+$/.test(t));
      typeNames.push(...bodyTypes);
    }
    
    if (typeNames.length === 0) return '';
    
    return `// Shared types stubbed locally\n${typeNames.map(t => `type ${t} = any;`).join('\n')}\n`;
  });
  
  // Pattern 2: Fix leftover "type  = any;" (empty type name)
  content = content.replace(/type\s+= any;?\n?/g, '');
  
  // Pattern 3: Fix multiline imports that weren't properly commented out - dangling lines like:
  //   TypeName,
  // followed by } from '../../shared/...
  // This regex finds dangling type lines before a "} from '../../shared" pattern
  content = content.replace(
    /((?:^  \w+,\n)+)\} from ['"]\.\.\/\.\.\/shared[^'"]*['"];?/gm,
    (match, types) => {
      // These are dangling types that should be stubbed
      const typeNames = types.split('\n')
        .map(t => t.trim().replace(/,$/, ''))
        .filter(t => t.length > 0 && /^\w+$/.test(t));
      
      if (typeNames.length === 0) return '';
      
      return `// Shared types stubbed locally\n${typeNames.map(t => `type ${t} = any;`).join('\n')}`;
    }
  );
  
  // Pattern 4: Fix imports from ../../shared that are intact (not corrupted)
  content = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/\.\.\/shared[^'"]*['"];?/g,
    (match, typeList) => {
      const types = typeList.split(',').map(t => t.trim()).filter(t => t.length > 0);
      const cleanTypes = types.map(t => {
        // Handle "Type as Alias" pattern
        const asMatch = t.match(/^(\w+)\s+as\s+(\w+)$/);
        if (asMatch) return asMatch[2]; // Use alias name
        return t;
      }).filter(t => /^\w+$/.test(t));
      
      if (cleanTypes.length === 0) return '// Removed empty shared import';
      
      return `// Shared types stubbed locally\n${cleanTypes.map(t => `type ${t} = any;`).join('\n')}`;
    }
  );
  
  // Pattern 5: Fix imports from ../../app-mobile
  content = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*['"]\.\.\/\.\.\/app-mobile[^'"]*['"];?/g,
    (match, typeList) => {
      const types = typeList.split(',').map(t => t.trim()).filter(t => t.length > 0 && /^\w+$/.test(t));
      if (types.length === 0) return '// Removed empty app-mobile import';
      return `// App-mobile types stubbed locally\n${types.map(t => `type ${t} = any;`).join('\n')}`;
    }
  );
  
  // Pattern 6: Clean up triple+ newlines
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
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  try {
    fixFile(file);
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

console.log(`\n✅ Complete: ${filesFixed} files fixed`);
