/**
 * Fix undefined 'context' and 'request' variables
 * These are typically copy-paste errors where the variable name doesn't match
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with context/request issues based on build output
const filesToFix = {
  'integrations/dataAccess.ts': {
    // Replace 'context' with 'request' in logAccessAttempt calls
    patterns: [
      { find: /, context,/g, replace: ', request,' },
      { find: /, context\)/g, replace: ', request)' },
    ]
  },
  'brands/brandModeration.ts': {
    patterns: [
      { find: /, context\)/g, replace: ', request)' },
    ]
  },
  'middleware/teamPermissions.ts': {
    patterns: [
      { find: /context\./g, replace: 'request.' },
    ]
  },
  'pack296-admin-management.ts': {
    patterns: [
      { find: /context\./g, replace: 'request.' },
    ]
  },
  'pack296-data-retention.ts': {
    patterns: [
      { find: /context\./g, replace: 'request.' },
    ]
  },
  'pack303-endpoints.ts': {
    patterns: [
      { find: /context\./g, replace: 'request.' },
    ]
  },
  'pack384-store-policy-monitor.ts': {
    patterns: [
      { find: /context\./g, replace: 'request.' },
    ]
  },
  'pack392-trust-score.ts': {
    patterns: [
      { find: /context\./g, replace: 'request.' },
    ]
  },
};

function fixFile(relativePath, fixes) {
  const filePath = path.join(srcDir, relativePath);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${relativePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  for (const fix of fixes.patterns) {
    content = content.replace(fix.find, fix.replace);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${relativePath}`);
    return true;
  }
  
  console.log(`No changes needed in ${relativePath}`);
  return false;
}

// Run fixes
console.log('Fixing context/request variable references...\n');

let fixedCount = 0;
for (const [file, fixes] of Object.entries(filesToFix)) {
  if (fixFile(file, fixes)) {
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
