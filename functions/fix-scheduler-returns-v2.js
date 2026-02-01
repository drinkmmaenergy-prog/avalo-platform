/**
 * Fix scheduler functions that return variables instead of void
 * TS2769: No overload matches this call - scheduler handlers must return void | Promise<void>
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with scheduler return issues based on build output
const schedulerFiles = [
  'pack261-payout-service.ts',
  'pack301-winback.ts',
  'pack306-verification.ts',
  'pack336-aggregation-cron.ts',
  'pack346-churn-engine.ts',
  'pack346-creator-kpi.ts',
  'pack379-aso-reputation.ts',
  'pack388-retention.ts',
];

function fixSchedulerReturns(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Pattern 1: return variableName; at the end of scheduler functions
  // Look for return statements followed by a variable name (not an object literal)
  // and replace with logger.info + return;
  
  // Find all return statements that return a variable (not an object)
  // Pattern: return variableName; where variableName is a simple identifier
  const returnVarPattern = /(\s+)(return\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*;(\s*}\s*catch|\s*}\s*\)\s*;|\s*}\s*$)/g;
  
  let modified = false;
  
  content = content.replace(returnVarPattern, (match, indent, returnKeyword, varName, suffix) => {
    // Skip if it's a common non-result variable
    if (['error', 'err', 'e', 'undefined', 'null', 'true', 'false'].includes(varName)) {
      return match;
    }
    modified = true;
    return `${indent}logger.info('Scheduler completed', ${varName});${indent}return;${suffix}`;
  });
  
  // Pattern 2: return { ... }; inline objects that weren't caught before
  const returnObjPattern = /(\s+)(return\s+)(\{[^}]+\})\s*;(\s*}\s*catch|\s*}\s*\)\s*;|\s*}\s*$)/g;
  
  content = content.replace(returnObjPattern, (match, indent, returnKeyword, obj, suffix) => {
    modified = true;
    return `${indent}logger.info('Scheduler completed', ${obj});${indent}return;${suffix}`;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed scheduler returns in ${path.basename(filePath)}`);
    return true;
  }
  
  console.log(`No changes needed in ${path.basename(filePath)}`);
  return false;
}

// Run fixes
console.log('Fixing scheduler return types (TS2769) - v2...\n');

let fixedCount = 0;
for (const file of schedulerFiles) {
  const filePath = path.join(srcDir, file);
  if (fixSchedulerReturns(filePath)) {
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
