/**
 * Fix TS2300 duplicate identifier errors
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with duplicate Timestamp
const timestampFiles = [
  'pack122-cultural-safety.ts',
  'pack122-region-policy.ts',
  'pack122-safety-resources.ts',
  'pack164-accelerator.ts',
  'pack95-anomaly-detection.ts',
  'pack95-session-security.ts',
];

// Files with duplicate request parameter
const requestFiles = [
  'pack154-endpoints.ts',
  'pack212-reputation-functions.ts',
  'pack303-endpoints.ts',
  'pack359-gdpr-retention.ts',
  'pack385-launch-payout-safety.ts',
];

// Fix Timestamp duplicates - remove local type declaration if Timestamp is imported
for (const file of timestampFiles) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Check if Timestamp is imported from firebase-admin
  const hasTimestampImport = /import\s*{[^}]*Timestamp[^}]*}\s*from\s*['"]firebase-admin/.test(content);
  
  if (hasTimestampImport) {
    // Remove local type Timestamp declaration
    content = content.replace(/^type Timestamp = .+;?\s*$/gm, '// Timestamp imported from firebase-admin');
    content = content.replace(/^export type Timestamp = .+;?\s*$/gm, '// Timestamp imported from firebase-admin');
    console.log(`✅ Removed duplicate Timestamp type in ${file}`);
  } else {
    // Check if there's a duplicate import
    const timestampImports = content.match(/Timestamp/g);
    if (timestampImports && timestampImports.length > 2) {
      // Remove duplicate Timestamp from import
      content = content.replace(/(import\s*{[^}]*),\s*Timestamp([^}]*}\s*from\s*['"]firebase-admin)/, '$1$2');
      console.log(`✅ Removed duplicate Timestamp import in ${file}`);
    }
  }
  
  fs.writeFileSync(fullPath, content);
}

// Fix request parameter duplicates - rename inner request to req
for (const file of requestFiles) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  // Pattern: async (request) => { ... const { ... } = request.data; ... const request = ...
  // This happens when there's an outer request parameter and an inner request variable
  
  // Find functions with request parameter that also declare request inside
  const functionPattern = /async\s*\(\s*request\s*\)\s*=>\s*\{/g;
  let match;
  
  while ((match = functionPattern.exec(content)) !== null) {
    const startIndex = match.index + match[0].length;
    let braceCount = 1;
    let endIndex = startIndex;
    
    // Find the matching closing brace
    while (braceCount > 0 && endIndex < content.length) {
      if (content[endIndex] === '{') braceCount++;
      if (content[endIndex] === '}') braceCount--;
      endIndex++;
    }
    
    const functionBody = content.slice(startIndex, endIndex - 1);
    
    // Check if there's a const request = or let request = inside
    if (/\b(const|let)\s+request\s*=/.test(functionBody)) {
      // Rename the inner request to innerRequest
      const newBody = functionBody.replace(/\b(const|let)\s+request\s*=/g, '$1 innerRequest =');
      content = content.slice(0, startIndex) + newBody + content.slice(endIndex - 1);
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Fixed duplicate request in ${file}`);
  }
}

console.log('\n✅ Duplicate identifier fix complete!');
