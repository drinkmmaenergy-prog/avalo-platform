/**
 * Fix scheduler functions that return objects instead of void
 * TS2769: No overload matches this call - scheduler handlers must return void | Promise<void>
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with scheduler return issues
const schedulerFiles = [
  'pack261-payout-service.ts',
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

  // Pattern 1: return { key: value, ... }; at end of scheduler handler
  // Replace with: logger.info('Scheduler completed', { key: value, ... }); return;
  
  // Find scheduler handlers and fix their returns
  // Look for patterns like: async (event: ScheduledEvent) => { ... return { ... }; }
  
  // Pattern to match return statements with objects in scheduler handlers
  const returnObjectPattern = /(\s+)return\s+(\{[^}]+\});\s*$/gm;
  
  let modified = false;
  
  // Replace return { ... } with logger.info and return;
  content = content.replace(returnObjectPattern, (match, indent, obj) => {
    modified = true;
    return `${indent}logger.info('Scheduler completed', ${obj});\n${indent}return;`;
  });

  if (modified && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed scheduler returns in: ${path.basename(filePath)}`);
    return true;
  }
  
  return false;
}

// Also fix missing request/context variables
function fixMissingRequestContext(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;

  // Pattern: standalone 'request' or 'context' that should be from function parameter
  // These are typically in onCall handlers where the parameter is named differently
  
  // Check if file has issues with undefined 'request' or 'context'
  const hasRequestIssue = /\brequest\.(auth|data|rawRequest)\b/.test(content) && 
                          !/const\s+request\s*=/.test(content) &&
                          !/function.*\(request[,\)]/.test(content);
  
  const hasContextIssue = /\bcontext\.(auth|params)\b/.test(content) &&
                          !/const\s+context\s*=/.test(content) &&
                          !/function.*\(context[,\)]/.test(content);

  if (hasRequestIssue || hasContextIssue) {
    console.log(`File ${path.basename(filePath)} has request/context issues - needs manual review`);
  }

  return false;
}

let totalFixed = 0;

for (const file of schedulerFiles) {
  const filePath = path.join(srcDir, file);
  if (fixSchedulerReturns(filePath)) {
    totalFixed++;
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
