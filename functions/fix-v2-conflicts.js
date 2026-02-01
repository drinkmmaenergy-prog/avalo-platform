/**
 * Fix v2 Migration Conflicts
 * 
 * This script fixes:
 * 1. Duplicate `event` variable names (rename to `eventData` or document variable)
 * 2. Duplicate import statements
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');

// Find all .ts files recursively
function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;
  
  const relativePath = path.relative(SRC_DIR, filePath);
  let modified = false;
  
  // Fix 1: Inside v2 trigger handlers, rename `const event = snap.data()` to `const eventData = snap.data()`
  // Pattern: onDocumentCreated(..., async (event) => { ... const event = snap.data() ...
  
  // Fix duplicate variable name: const event = snap.data() -> const eventData = snap.data()
  // Only when inside an async (event) => handler
  const triggerHandlerRegex = /(onDocumentCreated|onDocumentUpdated|onDocumentDeleted|onDocumentWritten)\([^,]+,\s*async\s*\(\s*event\s*\)\s*=>\s*\{/g;
  
  if (triggerHandlerRegex.test(content)) {
    // Reset lastIndex
    triggerHandlerRegex.lastIndex = 0;
    
    // Find all trigger handlers and fix variable conflicts
    let match;
    while ((match = triggerHandlerRegex.exec(content)) !== null) {
      const startIdx = match.index + match[0].length;
      
      // Find the corresponding closing brace by counting open/close braces
      let braceCount = 1;
      let idx = startIdx;
      let handlerEnd = content.length;
      
      while (idx < content.length && braceCount > 0) {
        if (content[idx] === '{') braceCount++;
        if (content[idx] === '}') braceCount--;
        if (braceCount === 0) {
          handlerEnd = idx;
          break;
        }
        idx++;
      }
      
      // Extract the handler body
      const handlerBody = content.slice(startIdx, handlerEnd);
      
      // Replace "const event = snap.data()" or "const event = snapshot.data()" with "const eventData = ..."
      // And update all references to event.xxx within this handler
      const fixedBody = handlerBody
        .replace(/const\s+event\s*=\s*(snap|snapshot)\.data\(\)/g, 'const eventData = $1.data()')
        // Update references to the renamed variable (not event.params, those are correct)
        .replace(/event\.(user_id|creator_id|tokens|event_date|userId|creatorId|status|type|amount|platform|store|rating|review|text|metadata|analytics|hostId|senderId|receiverId)/g, 'eventData.$1');
      
      if (fixedBody !== handlerBody) {
        content = content.slice(0, startIdx) + fixedBody + content.slice(handlerEnd);
        modified = true;
      }
      
      // Update regex lastIndex after modification
      triggerHandlerRegex.lastIndex = startIdx;
    }
  }
  
  // Fix 2: Remove duplicate Timestamp imports when already imported from init
  // Pattern: import { timestamp as Timestamp } from '../init' or similar
  if (/from\s*['"][^'"]*\/init['"]/.test(content) && /Timestamp/.test(content)) {
    // If already importing Timestamp from init, remove from runtime import
    content = content.replace(
      /import\s*\{([^}]*),?\s*Timestamp\s*,?([^}]*)\}\s*from\s*['"](?:\.\.\/)*runtime['"]/g,
      (match, before, after) => {
        const cleanBefore = before.replace(/,\s*$/, '').trim();
        const cleanAfter = after.replace(/^\s*,/, '').trim();
        const imports = [cleanBefore, cleanAfter].filter(Boolean).join(', ');
        if (!imports) return match; // Keep original if would result in empty import
        return `import { ${imports} } from '${match.includes('../') ? match.match(/'([^']+)'/)[1] : './runtime'}'`;
      }
    );
    modified = true;
  }
  
  // Fix 3: Handle duplicate event identifier by renaming document data variable
  // Search for patterns like: const eventId = event.params.eventId;\n    const event = snap.data();
  content = content.replace(
    /const\s+(\w+)\s*=\s*event\.params\.(\w+);(\s*\n\s*)const\s+event\s*=\s*(snap|snapshot)\.data\(\);/g,
    'const $1 = event.params.$2;$3const eventData = $4.data();'
  );
  
  if (content !== originalContent) {
    console.log(`Fixing: ${relativePath}`);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { modified: true };
  }
  
  return { modified: false };
}

function main() {
  console.log('=== Fixing v2 Migration Conflicts ===\n');
  
  const files = findTsFiles(SRC_DIR);
  console.log(`Found ${files.length} TypeScript files\n`);
  
  let modifiedCount = 0;
  const modifiedFiles = [];
  
  for (const file of files) {
    const result = fixFile(file);
    if (result.modified) {
      modifiedCount++;
      modifiedFiles.push(path.relative(SRC_DIR, file));
    }
  }
  
  console.log(`\n=== FIX COMPLETE ===`);
  console.log(`Files modified: ${modifiedCount}`);
  console.log(`\nModified files:`);
  modifiedFiles.forEach(f => console.log(`  - ${f}`));
}

main();
