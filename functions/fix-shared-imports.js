/**
 * Script to fix shared type imports
 * Changes ../../shared/* to ./types/shared/*
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Mapping of old paths to new paths
const pathMappings = [
  // From src/*.ts files
  { from: "'../../shared/types/", to: "'./types/shared/types/" },
  { from: '"../../shared/types/', to: '"./types/shared/types/' },
  { from: "'../../shared/src/types/", to: "'./types/shared/src/types/" },
  { from: '"../../shared/src/types/', to: '"./types/shared/src/types/' },
  { from: "'../../shared/integration/", to: "'./types/shared/integration/" },
  { from: '"../../shared/integration/', to: '"./types/shared/integration/' },
  { from: "'../../shared/config/", to: "'./types/shared/config/" },
  { from: '"../../shared/config/', to: '"./types/shared/config/' },
  { from: "'../../shared/compliance/", to: "'./types/shared/compliance/" },
  { from: '"../../shared/compliance/', to: '"./types/shared/compliance/' },
  { from: "'../../shared/legal/", to: "'./types/shared/legal/" },
  { from: '"../../shared/legal/', to: '"./types/shared/legal/' },
  // From src/legal/*.ts files (one level deeper)
  { from: "'../../../shared/legal/", to: "'../types/shared/legal/" },
  { from: '"../../../shared/legal/', to: '"../types/shared/legal/' },
];

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  for (const mapping of pathMappings) {
    if (content.includes(mapping.from)) {
      content = content.split(mapping.from).join(mapping.to);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${filePath}`);
    return true;
  }
  return false;
}

function processDirectory(dir) {
  let fixedCount = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and types/shared (the destination)
      if (entry.name !== 'node_modules' && !(entry.name === 'shared' && dir.endsWith('types'))) {
        fixedCount += processDirectory(fullPath);
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      if (fixFile(fullPath)) {
        fixedCount++;
      }
    }
  }
  
  return fixedCount;
}

console.log('Fixing shared type imports...');
const count = processDirectory(srcDir);
console.log(`\nDone! Fixed ${count} files.`);
