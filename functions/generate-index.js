/**
 * Script to generate index.ts with all Cloud Function exports
 * Run: node generate-index.js
 */

const fs = require('fs');
const path = require('path');

// Read the audit data
const auditPath = path.join(__dirname, '..', 'audit', 'BACKEND_EXPORT_COVERAGE.json');
const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

// Get unique file paths
const files = [...new Set(data.functions.map(f => f.file))].sort();

console.log(`Total unique files with functions: ${files.length}`);
console.log(`Total functions: ${data.statistics.totalFunctions}`);

// Group files by first letter for domain organization
const byLetter = {};
files.forEach(f => {
  // Get first letter, handling special cases
  let letter = f[0].toUpperCase();
  // Handle files starting with underscore or numbers
  if (!/[A-Z]/.test(letter)) {
    letter = '_OTHER';
  }
  if (!byLetter[letter]) byLetter[letter] = [];
  byLetter[letter].push(f);
});

// Generate index.ts content
let content = `/**
 * Avalo Cloud Functions - Main Entry Point
 * Firebase Functions exports - Full Export Patch
 * 
 * Generated: ${new Date().toISOString()}
 * Commit: 91c9eb03829c0caf34296b1bacae6643903f8a40
 * Total files: ${files.length}
 * Total functions: ${data.statistics.totalFunctions}
 * 
 * This file exports ALL Cloud Functions from the repository.
 * Functions are grouped by domain (A-Z) for organization.
 */

// Initialize Firebase Admin first
import './init';

console.log('🚀 Avalo Cloud Functions loaded (full export - ${files.length} files, ${data.statistics.totalFunctions} functions)');

// Re-export init utilities for other modules
export { db, auth, storage, admin, generateId, serverTimestamp } from './init';

`;

// Add exports grouped by letter
const sortedLetters = Object.keys(byLetter).sort();
sortedLetters.forEach(letter => {
  const letterFiles = byLetter[letter];
  content += `// ============================================\n`;
  content += `// DOMAIN ${letter} (${letterFiles.length} files)\n`;
  content += `// ============================================\n`;
  
  letterFiles.forEach(file => {
    // Convert file path to import path (remove .ts extension)
    let importPath = file.replace(/\.ts$/, '');
    content += `export * from './${importPath}';\n`;
  });
  content += '\n';
});

// Write the index.ts file
const indexPath = path.join(__dirname, 'src', 'index.ts');
fs.writeFileSync(indexPath, content, 'utf8');

console.log(`\nGenerated index.ts at: ${indexPath}`);
console.log(`Total export lines: ${files.length}`);
console.log('\nDomain breakdown:');
sortedLetters.forEach(letter => {
  console.log(`  ${letter}: ${byLetter[letter].length} files`);
});
