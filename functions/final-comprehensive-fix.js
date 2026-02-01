/**
 * FINAL COMPREHENSIVE FIX
 * Fixes all remaining TypeScript compilation errors
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

  // Skip init.ts and runtime.ts - they are the source of truth
  if (fileName === 'init.ts' || fileName === 'runtime.ts') {
    return false;
  }

  // ============================================
  // FIX 1: Fix "server" -> "serverTimestamp" in imports from init
  // ============================================
  content = content.replace(
    /import\s*{([^}]*)server([^}]*)}\s*from\s*(['"])(\.\.?\/init)\3/g,
    (match, before, after, quote, initPath) => {
      // Replace 'server' with 'serverTimestamp'
      const newBefore = before.replace(/\bserver\b/g, 'serverTimestamp');
      const newAfter = after.replace(/\bserver\b/g, 'serverTimestamp');
      fixes.push('Fixed server -> serverTimestamp');
      return `import { ${newBefore}serverTimestamp${newAfter} } from ${quote}${initPath}${quote}`;
    }
  );

  // ============================================
  // FIX 2: Remove duplicate Timestamp imports - consolidate to runtime
  // ============================================
  // First, check if file uses Timestamp
  const usesTimestamp = /\bTimestamp\b/.test(content);
  
  // Remove all Timestamp imports
  content = content.replace(/import\s*{\s*Timestamp\s*}\s*from\s*['"][^'"]+['"];?\n?/g, '');
  
  // Remove Timestamp from combined imports
  content = content.replace(
    /import\s*{([^}]*)Timestamp([^}]*)}\s*from\s*(['"][^'"]+['"])/g,
    (match, before, after, source) => {
      const otherImports = (before + after)
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s !== 'Timestamp')
        .join(', ');
      
      if (otherImports) {
        fixes.push('Removed Timestamp from combined import');
        return `import { ${otherImports} } from ${source}`;
      }
      return '';
    }
  );
  
  // Add single Timestamp import from runtime if needed
  if (usesTimestamp && !content.includes("import { Timestamp }")) {
    const firstImport = content.match(/^import\s/m);
    if (firstImport) {
      // Determine correct relative path to runtime
      const depth = relativePath.split(/[/\\]/).length - 1;
      const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';
      content = content.slice(0, firstImport.index) + 
        `import { Timestamp } from '${runtimePath}';\n` + 
        content.slice(firstImport.index);
      fixes.push('Added Timestamp import from runtime');
    }
  }

  // ============================================
  // FIX 3: Add missing serverTimestamp import where used but not imported
  // ============================================
  const usesServerTimestamp = /\bserverTimestamp\b/.test(content);
  const hasServerTimestampImport = /import\s*{[^}]*\bserverTimestamp\b[^}]*}\s*from/.test(content);
  
  if (usesServerTimestamp && !hasServerTimestampImport) {
    // Find the init import and add serverTimestamp to it
    const initImportMatch = content.match(/import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/init)\2/);
    if (initImportMatch) {
      const existingImports = initImportMatch[1];
      if (!existingImports.includes('serverTimestamp')) {
        content = content.replace(
          initImportMatch[0],
          `import { ${existingImports.trim()}, serverTimestamp } from ${initImportMatch[2]}${initImportMatch[3]}${initImportMatch[2]}`
        );
        fixes.push('Added serverTimestamp to init import');
      }
    } else {
      // No init import exists, add one
      const firstImport = content.match(/^import\s/m);
      if (firstImport) {
        const depth = relativePath.split(/[/\\]/).length - 1;
        const initPath = depth > 0 ? '../'.repeat(depth) + 'init' : './init';
        content = content.slice(0, firstImport.index) + 
          `import { serverTimestamp } from '${initPath}';\n` + 
          content.slice(firstImport.index);
        fixes.push('Added serverTimestamp import from init');
      }
    }
  }

  // ============================================
  // FIX 4: Remove duplicate db imports - keep only from init
  // ============================================
  // Find all db imports
  const dbImports = [];
  const dbImportRegex = /import\s*{([^}]*)\bdb\b([^}]*)}\s*from\s*(['"][^'"]+['"])/g;
  let match;
  while ((match = dbImportRegex.exec(content)) !== null) {
    dbImports.push({
      full: match[0],
      before: match[1],
      after: match[2],
      source: match[3]
    });
  }
  
  if (dbImports.length > 1) {
    // Keep only the first one (should be from init)
    for (let i = 1; i < dbImports.length; i++) {
      const imp = dbImports[i];
      const otherImports = (imp.before + imp.after)
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s !== 'db')
        .join(', ');
      
      if (otherImports) {
        content = content.replace(imp.full, `import { ${otherImports} } from ${imp.source}`);
      } else {
        content = content.replace(imp.full + '\n', '');
        content = content.replace(imp.full, '');
      }
      fixes.push('Removed duplicate db import');
    }
  }

  // ============================================
  // FIX 5: Remove duplicate HttpsError imports
  // ============================================
  const httpsErrorImports = [];
  const httpsErrorRegex = /import\s*{([^}]*)\bHttpsError\b([^}]*)}\s*from\s*(['"][^'"]+['"])/g;
  while ((match = httpsErrorRegex.exec(content)) !== null) {
    httpsErrorImports.push({
      full: match[0],
      before: match[1],
      after: match[2],
      source: match[3]
    });
  }
  
  if (httpsErrorImports.length > 1) {
    // Keep only the first one
    for (let i = 1; i < httpsErrorImports.length; i++) {
      const imp = httpsErrorImports[i];
      const otherImports = (imp.before + imp.after)
        .split(',')
        .map(s => s.trim())
        .filter(s => s && s !== 'HttpsError')
        .join(', ');
      
      if (otherImports) {
        content = content.replace(imp.full, `import { ${otherImports} } from ${imp.source}`);
      } else {
        content = content.replace(imp.full + '\n', '');
        content = content.replace(imp.full, '');
      }
      fixes.push('Removed duplicate HttpsError import');
    }
  }

  // ============================================
  // FIX 6: Clean up empty imports and syntax issues
  // ============================================
  content = content.replace(/import\s*{\s*}\s*from\s*['"][^'"]+['"];?\n?/g, '');
  content = content.replace(/,\s*,/g, ',');
  content = content.replace(/{\s*,\s*/g, '{ ');
  content = content.replace(/,\s*}/g, ' }');
  content = content.replace(/\n{3,}/g, '\n\n');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes.length || 1;
    if (fixes.length > 0) {
      console.log(`✅ ${relativePath}: ${fixes.join(', ')}`);
    }
    return true;
  }
  return false;
}

console.log('🔧 Starting FINAL COMPREHENSIVE FIX...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  fixFile(file);
}

console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes applied`);
