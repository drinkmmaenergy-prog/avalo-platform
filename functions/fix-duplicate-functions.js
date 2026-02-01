/**
 * Fix duplicate functions imports
 * Remove standalone 'import * as functions' when functions is also imported from runtime
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
let totalChanges = 0;
const changedFiles = new Set();

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  changedFiles.add(filePath);
}

function processFile(filePath) {
  let content = readFile(filePath);
  if (!content) return;
  
  const originalContent = content;
  const fileName = path.basename(filePath);
  
  // Check if file has both:
  // 1. import * as functions from 'firebase-functions'
  // 2. import { ..., functions, ... } from './runtime'
  const hasStandaloneImport = /import \* as functions from ['"]firebase-functions['"];?/.test(content);
  const hasRuntimeImport = /import \{[^}]*functions[^}]*\} from ['"]\.\/runtime['"]/.test(content);
  
  if (hasStandaloneImport && hasRuntimeImport) {
    // Remove the standalone import
    content = content.replace(/import \* as functions from ['"]firebase-functions['"];?\n?/g, '');
    console.log(`  Removed duplicate functions import in ${fileName}`);
    totalChanges++;
  }
  
  // Also check for duplicate routeRegion - remove import if local function exists
  const hasRouteRegionImport = /import \{[^}]*routeRegion[^}]*\}/.test(content);
  const hasRouteRegionFunction = /function routeRegion\(/.test(content);
  
  if (hasRouteRegionImport && hasRouteRegionFunction) {
    // Remove routeRegion from imports
    content = content.replace(/,\s*routeRegion\s*,/g, ',');
    content = content.replace(/,\s*routeRegion\s*\}/g, ' }');
    content = content.replace(/\{\s*routeRegion\s*,/g, '{ ');
    content = content.replace(/import \{\s*routeRegion\s*\} from ['"][^'"]+['"];?\n?/g, '');
    console.log(`  Removed conflicting routeRegion import in ${fileName}`);
    totalChanges++;
  }
  
  // Write if changed
  if (content !== originalContent) {
    writeFile(filePath, content);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      processFile(filePath);
    }
  }
}

console.log('Fixing duplicate functions imports...\n');
walkDir(srcDir);

console.log(`\n=== Summary ===`);
console.log(`Total changes: ${totalChanges}`);
console.log(`Files modified: ${changedFiles.size}`);
changedFiles.forEach(f => console.log(`  - ${path.relative(srcDir, f)}`));
