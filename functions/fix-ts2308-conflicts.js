/**
 * Script to fix TS2308 duplicate export errors
 * 
 * Strategy: For each conflicting export, rename it in the source file
 * to include a prefix based on the module name.
 * 
 * Example: ModerationAction in adminPanel.ts -> AdminPanelModerationAction
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const buildErrorsPath = path.join(__dirname, 'build-errors.txt');

// Parse build errors to find conflicts
const buildErrors = fs.readFileSync(buildErrorsPath, 'utf8');

// Pattern: Module './moduleName' has already exported a member named 'ExportName'
const ts2308Pattern = /src\/index\.ts\(\d+,\d+\): error TS2308: Module '([^']+)' has already exported a member named '([^']+)'/g;

// Track which modules export which conflicting names
// Map: exportName -> [module1, module2, ...]
const exportConflicts = new Map();

let match;
while ((match = ts2308Pattern.exec(buildErrors)) !== null) {
  const modulePath = match[1]; // e.g., './adminPanel'
  const exportName = match[2]; // e.g., 'ModerationAction'
  
  if (!exportConflicts.has(exportName)) {
    exportConflicts.set(exportName, []);
  }
  
  // Add module if not already in list
  const modules = exportConflicts.get(exportName);
  if (!modules.includes(modulePath)) {
    modules.push(modulePath);
  }
}

console.log('Found conflicting exports:');
for (const [name, modules] of exportConflicts) {
  console.log(`  ${name}: exported by ${modules.length} modules`);
}

// For each conflict, we need to decide which module keeps the original name
// and which modules get renamed exports

// Strategy: The FIRST module in alphabetical order keeps the original name
// Other modules get prefixed names

const renamings = []; // { file, oldName, newName }

for (const [exportName, modules] of exportConflicts) {
  // Sort modules alphabetically
  const sortedModules = [...modules].sort();
  
  // First module keeps original name
  const keepOriginal = sortedModules[0];
  
  // Other modules get renamed
  for (let i = 1; i < sortedModules.length; i++) {
    const modulePath = sortedModules[i];
    
    // Convert module path to prefix
    // './adminPanel' -> 'AdminPanel'
    // './brands/brandModeration' -> 'BrandModeration'
    let prefix = modulePath
      .replace(/^\.\//, '')
      .split('/')
      .pop()
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    
    // Remove common suffixes
    prefix = prefix.replace(/Functions$/, '').replace(/Api$/, '').replace(/Endpoints$/, '');
    
    const newName = prefix + exportName;
    
    // Get the actual file path
    let filePath = path.join(srcDir, modulePath.replace(/^\.\//, '') + '.ts');
    
    // Handle index files
    if (!fs.existsSync(filePath)) {
      filePath = path.join(srcDir, modulePath.replace(/^\.\//, ''), 'index.ts');
    }
    
    if (fs.existsSync(filePath)) {
      renamings.push({
        file: filePath,
        modulePath,
        oldName: exportName,
        newName,
      });
    } else {
      console.log(`  Warning: File not found: ${filePath}`);
    }
  }
}

console.log(`\nPlanned renamings: ${renamings.length}`);

// Group renamings by file
const renamingsByFile = new Map();
for (const r of renamings) {
  if (!renamingsByFile.has(r.file)) {
    renamingsByFile.set(r.file, []);
  }
  renamingsByFile.get(r.file).push(r);
}

// Apply renamings
let filesModified = 0;
let totalRenamings = 0;

for (const [filePath, fileRenamings] of renamingsByFile) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  for (const r of fileRenamings) {
    // Rename export declarations
    // export type ModerationAction = ...
    // export interface ModerationAction { ... }
    // export const ModerationAction = ...
    // export function ModerationAction(...) { ... }
    // export enum ModerationAction { ... }
    
    const patterns = [
      // export type Name = ...
      new RegExp(`(export\\s+type\\s+)${r.oldName}(\\s*[=<])`, 'g'),
      // export interface Name { ... }
      new RegExp(`(export\\s+interface\\s+)${r.oldName}(\\s*[{<])`, 'g'),
      // export const Name = ...
      new RegExp(`(export\\s+const\\s+)${r.oldName}(\\s*[=:])`, 'g'),
      // export function Name(...) { ... }
      new RegExp(`(export\\s+function\\s+)${r.oldName}(\\s*[(<])`, 'g'),
      // export async function Name(...) { ... }
      new RegExp(`(export\\s+async\\s+function\\s+)${r.oldName}(\\s*[(<])`, 'g'),
      // export enum Name { ... }
      new RegExp(`(export\\s+enum\\s+)${r.oldName}(\\s*{)`, 'g'),
      // export class Name { ... }
      new RegExp(`(export\\s+class\\s+)${r.oldName}(\\s*[{<])`, 'g'),
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, `$1${r.newName}$2`);
        modified = true;
        totalRenamings++;
        console.log(`  Renamed: ${r.oldName} -> ${r.newName} in ${path.basename(filePath)}`);
      }
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    filesModified++;
  }
}

console.log(`\nDone! Modified ${filesModified} files with ${totalRenamings} renamings.`);
console.log('\nNote: You may need to update references to renamed exports in other files.');
