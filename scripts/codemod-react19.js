#!/usr/bin/env node

/**
 * React 19 Codemod - Adds React imports to TSX files
 * This ensures compatibility with React 19's JSX transform
 */

const fs = require('fs');
const path = require('path');

const REACT_IMPORT_REGEX = /^import\s+(?:React|{[^}]*React[^}]*}|\*\s+as\s+React)\s+from\s+['"]react['"]/m;
const TSX_EXTENSION_REGEX = /\.tsx$/;

function shouldAddReactImport(content) {
  // Check if file already has a React import
  if (REACT_IMPORT_REGEX.test(content)) {
    return false;
  }
  
  // Check if file uses JSX (contains JSX elements)
  const hasJSX = /<[A-Z][a-zA-Z0-9]*/.test(content) || /<\/[A-Z][a-zA-Z0-9]*>/.test(content);
  
  return hasJSX;
}

function addReactImport(content) {
  // Find the first import statement or the beginning of the file
  const lines = content.split('\n');
  let insertIndex = 0;
  
  // Find the first non-comment, non-empty line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
      insertIndex = i;
      break;
    }
  }
  
  // Insert React import at the beginning
  lines.splice(insertIndex, 0, "import React from 'react';");
  
  return lines.join('\n');
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    if (shouldAddReactImport(content)) {
      const newContent = addReactImport(content);
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✓ Added React import to: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function walkDirectory(dir, callback) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (file !== 'node_modules' && !file.startsWith('.')) {
        walkDirectory(filePath, callback);
      }
    } else if (TSX_EXTENSION_REGEX.test(file)) {
      callback(filePath);
    }
  });
}

function main() {
  console.log('🔧 React 19 Codemod - Adding React imports to TSX files...\n');
  
  const appMobileDir = path.join(__dirname, '..', 'app-mobile');
  
  if (!fs.existsSync(appMobileDir)) {
    console.error('✗ app-mobile directory not found');
    process.exit(1);
  }
  
  let processedCount = 0;
  let modifiedCount = 0;
  
  walkDirectory(appMobileDir, (filePath) => {
    processedCount++;
    if (processFile(filePath)) {
      modifiedCount++;
    }
  });
  
  console.log(`\n📊 Summary:`);
  console.log(`   Files processed: ${processedCount}`);
  console.log(`   Files modified: ${modifiedCount}`);
  console.log(`   Files unchanged: ${processedCount - modifiedCount}`);
  
  if (modifiedCount > 0) {
    console.log('\n✅ React 19 codemod completed successfully!');
  } else {
    console.log('\n✅ All TSX files already have React imports.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { shouldAddReactImport, addReactImport, processFile };