/**
 * Fix TS2308 duplicate export errors by converting export * to explicit function exports
 * 
 * Strategy: 
 * 1. Parse each module to find what it exports
 * 2. Filter to only export Cloud Functions (onCall, onRequest, onSchedule, etc.)
 * 3. Replace `export * from './module'` with explicit named exports
 * 
 * This preserves all Cloud Functions while avoiding type conflicts.
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const srcDir = path.join(__dirname, 'src');
const indexPath = path.join(srcDir, 'index.ts');

// Read index.ts
let indexContent = fs.readFileSync(indexPath, 'utf8');

// Find all export * statements
const exportStarPattern = /^export \* from ['"]([^'"]+)['"];?$/gm;
const exportStars = [];
let match;
while ((match = exportStarPattern.exec(indexContent)) !== null) {
  exportStars.push({
    fullMatch: match[0],
    modulePath: match[1],
    index: match.index
  });
}

console.log(`Found ${exportStars.length} export * statements`);

// Function to get exports from a module
function getModuleExports(modulePath) {
  const fullPath = path.join(srcDir, modulePath.replace(/^\.\//, '') + '.ts');
  
  if (!fs.existsSync(fullPath)) {
    // Try as directory with index.ts
    const indexPath = path.join(srcDir, modulePath.replace(/^\.\//, ''), 'index.ts');
    if (fs.existsSync(indexPath)) {
      return getExportsFromFile(indexPath);
    }
    // Try .tsx
    const tsxPath = fullPath.replace('.ts', '.tsx');
    if (fs.existsSync(tsxPath)) {
      return getExportsFromFile(tsxPath);
    }
    console.log(`  Module not found: ${fullPath}`);
    return { functions: [], types: [], all: [] };
  }
  
  return getExportsFromFile(fullPath);
}

function getExportsFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );
  
  const exports = { functions: [], types: [], all: [] };
  
  function visit(node) {
    // Export declarations: export const foo = ...
    if (ts.isVariableStatement(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            exports.all.push(name);
            // Check if it's a Cloud Function (onCall, onRequest, etc.)
            if (decl.initializer) {
              const initText = decl.initializer.getText(sourceFile);
              if (initText.includes('onCall') || 
                  initText.includes('onRequest') || 
                  initText.includes('onSchedule') ||
                  initText.includes('onDocumentCreated') ||
                  initText.includes('onDocumentUpdated') ||
                  initText.includes('onDocumentDeleted') ||
                  initText.includes('onDocumentWritten') ||
                  initText.includes('onValueCreated') ||
                  initText.includes('onValueUpdated') ||
                  initText.includes('onValueDeleted') ||
                  initText.includes('onValueWritten') ||
                  initText.includes('functions.https') ||
                  initText.includes('functions.firestore') ||
                  initText.includes('functions.pubsub') ||
                  initText.includes('functions.storage') ||
                  initText.includes('functions.auth')) {
                exports.functions.push(name);
              }
            }
          }
        }
      }
    }
    
    // Export function declarations: export function foo() {}
    if (ts.isFunctionDeclaration(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.name) {
          const name = node.name.text;
          exports.all.push(name);
          // Functions are usually Cloud Functions if they're exported
          exports.functions.push(name);
        }
      }
    }
    
    // Type/Interface exports
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.name) {
          exports.types.push(node.name.text);
          exports.all.push(node.name.text);
        }
      }
    }
    
    // Enum exports
    if (ts.isEnumDeclaration(node)) {
      const modifiers = ts.getModifiers(node);
      if (modifiers && modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.name) {
          exports.types.push(node.name.text);
          exports.all.push(node.name.text);
        }
      }
    }
    
    // Re-exports: export { foo, bar } from './other'
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const name = element.name.text;
          exports.all.push(name);
          // Assume re-exports are functions unless they look like types
          if (name[0] === name[0].toUpperCase() && !name.includes('_')) {
            exports.types.push(name);
          } else {
            exports.functions.push(name);
          }
        }
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return exports;
}

// Process each export * and convert to explicit exports
let newIndexContent = indexContent;
let offset = 0;

// Track which names have been exported to avoid duplicates
const exportedNames = new Set();

// First pass: collect all exports to find conflicts
const allModuleExports = new Map();
for (const exp of exportStars) {
  const exports = getModuleExports(exp.modulePath);
  allModuleExports.set(exp.modulePath, exports);
}

// Find conflicting names
const nameCount = new Map();
for (const [modulePath, exports] of allModuleExports) {
  for (const name of exports.all) {
    nameCount.set(name, (nameCount.get(name) || 0) + 1);
  }
}

const conflictingNames = new Set();
for (const [name, count] of nameCount) {
  if (count > 1) {
    conflictingNames.add(name);
  }
}

console.log(`Found ${conflictingNames.size} conflicting export names`);

// Second pass: replace export * with explicit exports, excluding conflicts
for (const exp of exportStars) {
  const exports = allModuleExports.get(exp.modulePath);
  
  // Filter to only non-conflicting exports OR first occurrence of conflicting ones
  const toExport = [];
  for (const name of exports.all) {
    if (!exportedNames.has(name)) {
      toExport.push(name);
      exportedNames.add(name);
    }
  }
  
  if (toExport.length === 0) {
    // All exports are duplicates, comment out the line
    const newLine = `// SKIP: all exports duplicate - ${exp.fullMatch}`;
    newIndexContent = newIndexContent.replace(exp.fullMatch, newLine);
  } else if (toExport.length === exports.all.length) {
    // No conflicts, keep as is
    // Do nothing
  } else {
    // Some conflicts, convert to explicit exports
    const newLine = `export { ${toExport.join(', ')} } from '${exp.modulePath}';`;
    newIndexContent = newIndexContent.replace(exp.fullMatch, newLine);
  }
}

// Write back
fs.writeFileSync(indexPath, newIndexContent);
console.log('Done! Re-run pnpm build to verify.');
