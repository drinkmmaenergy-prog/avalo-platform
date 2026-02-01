/**
 * Fix TS2308 duplicate export errors in index.ts
 * 
 * Strategy: 
 * 1. Parse error messages to find which modules have conflicting exports
 * 2. For each conflicting module, read the source file and extract ALL exports
 * 3. Change from `export * from './module'` to explicit named exports
 *    that exclude the conflicting names
 * 
 * This version uses a more robust export detection that handles:
 * - export const/let/var/function/class/type/interface/enum NAME
 * - export { name1, name2 }
 * - export { name as alias }
 * - export * from './other' (re-exports)
 */

const fs = require('fs');
const path = require('path');

// Read the build errors
const errorsFile = path.join(__dirname, 'build-errors.txt');
const errors = fs.readFileSync(errorsFile, 'utf8');

// Parse TS2308 errors to find conflicting exports
// Format: src/index.ts(40,1): error TS2308: Module './adminPanel' has already exported a member named 'ModerationAction'.
const ts2308Pattern = /src\/index\.ts\((\d+),\d+\): error TS2308: Module '([^']+)' has already exported a member named '([^']+)'/g;

// Map: lineNumber -> { modulePath, conflictingNames: Set }
const lineConflicts = new Map();

// Track all conflicting names globally
const allConflictingNames = new Set();

let match;
while ((match = ts2308Pattern.exec(errors)) !== null) {
  const [, lineNum, modulePath, memberName] = match;
  const line = parseInt(lineNum);
  
  if (!lineConflicts.has(line)) {
    lineConflicts.set(line, { modulePath, conflictingNames: new Set() });
  }
  lineConflicts.get(line).conflictingNames.add(memberName);
  allConflictingNames.add(memberName);
}

console.log(`Found ${lineConflicts.size} lines with conflicts`);
console.log(`Total conflicting names: ${allConflictingNames.size}`);
console.log(`Conflicting names: ${[...allConflictingNames].slice(0, 20).join(', ')}...`);

// Read index.ts
const indexPath = path.join(__dirname, 'src', 'index.ts');
let indexContent = fs.readFileSync(indexPath, 'utf8');
const lines = indexContent.split('\n');

// Helper function to get ALL exports from a module (including re-exports)
function getModuleExports(modulePath, visited = new Set()) {
  // Prevent infinite recursion
  if (visited.has(modulePath)) {
    return new Set();
  }
  visited.add(modulePath);
  
  // Convert relative path to absolute
  let fullPath = path.join(__dirname, 'src', modulePath);
  if (!fullPath.endsWith('.ts')) {
    fullPath += '.ts';
  }
  
  // Handle index files
  if (!fs.existsSync(fullPath)) {
    const indexPath = path.join(__dirname, 'src', modulePath, 'index.ts');
    if (fs.existsSync(indexPath)) {
      fullPath = indexPath;
    } else {
      // Try .js extension
      fullPath = fullPath.replace('.ts', '.js');
      if (!fs.existsSync(fullPath)) {
        console.log(`  Module not found: ${modulePath}`);
        return new Set();
      }
    }
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const exports = new Set();
  
  // Match export declarations
  // export const/let/var/function/class/type/interface/enum NAME
  const exportDeclPattern = /export\s+(?:const|let|var|function|class|type|interface|enum|async\s+function)\s+(\w+)/g;
  let m;
  while ((m = exportDeclPattern.exec(content)) !== null) {
    exports.add(m[1]);
  }
  
  // Match export { name1, name2 }
  const exportBracePattern = /export\s*\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/g;
  while ((m = exportBracePattern.exec(content)) !== null) {
    const names = m[1].split(',').map(n => {
      // Handle "name as alias" syntax - take the alias (right side)
      const parts = n.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    }).filter(n => n && !n.includes('*'));
    names.forEach(n => exports.add(n));
  }
  
  // Match export * from './other' (re-exports)
  const reExportPattern = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = reExportPattern.exec(content)) !== null) {
    const reExportPath = m[1];
    // Resolve relative path
    const baseDir = path.dirname(fullPath);
    let resolvedPath = path.join(baseDir, reExportPath);
    // Make it relative to src
    resolvedPath = path.relative(path.join(__dirname, 'src'), resolvedPath);
    // Normalize path separators
    resolvedPath = './' + resolvedPath.replace(/\\/g, '/');
    
    // Recursively get exports from re-exported module
    const reExports = getModuleExports(resolvedPath, visited);
    reExports.forEach(e => exports.add(e));
  }
  
  // Match default export
  if (/export\s+default\s+/.test(content)) {
    exports.add('default');
  }
  
  return exports;
}

// Process each conflicting line
let modified = 0;
const sortedLines = [...lineConflicts.keys()].sort((a, b) => b - a); // Process from bottom to top

for (const lineNum of sortedLines) {
  const { modulePath, conflictingNames } = lineConflicts.get(lineNum);
  const lineIndex = lineNum - 1;
  
  if (lineIndex < 0 || lineIndex >= lines.length) continue;
  
  const line = lines[lineIndex];
  
  // Check if it's an export * line
  if (!line.trim().startsWith('export * from')) continue;
  
  console.log(`\nLine ${lineNum}: ${line.trim()}`);
  console.log(`  Conflicts: ${[...conflictingNames].join(', ')}`);
  
  // Get all exports from the module
  const allExports = getModuleExports(modulePath);
  
  if (!allExports || allExports.size === 0) {
    console.log(`  Could not parse exports, skipping`);
    continue;
  }
  
  console.log(`  Total exports: ${allExports.size}`);
  
  // Filter out conflicting names
  const safeExports = [...allExports].filter(e => !conflictingNames.has(e));
  
  if (safeExports.length === 0) {
    // All exports conflict, comment out the line
    lines[lineIndex] = `// ${line} // All exports conflict with earlier modules`;
    modified++;
    console.log(`  Commented out (all exports conflict)`);
  } else if (safeExports.length < allExports.size) {
    // Some exports conflict, use explicit exports
    // Format nicely
    if (safeExports.length <= 5) {
      const newLine = `export { ${safeExports.join(', ')} } from '${modulePath}';`;
      lines[lineIndex] = newLine;
    } else {
      // Multi-line format for many exports
      const exportList = safeExports.join(',\n  ');
      const newLine = `export {\n  ${exportList}\n} from '${modulePath}';`;
      lines[lineIndex] = newLine;
    }
    modified++;
    console.log(`  Changed to explicit exports (${safeExports.length} exports)`);
  }
}

console.log(`\nModified ${modified} lines`);

// Write back
fs.writeFileSync(indexPath, lines.join('\n'));
console.log('Updated index.ts');
