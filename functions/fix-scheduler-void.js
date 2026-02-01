/**
 * Fix scheduler functions that return objects instead of void
 * TS2769: No overload matches this call - scheduler handlers must return void | Promise<void>
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with scheduler return issues based on build output
const schedulerFiles = [
  'compliancePack55.ts',
  'pack115-reputation-endpoints.ts',
  'pack193-sexuality-consent-functions.ts',
  'pack261-payout-service.ts',
  'pack301-daily-churn.ts',
  'pack301-winback.ts',
  'pack306-verification.ts',
  'pack328a-identity-verification.ts',
  'pack336-aggregation-cron.ts',
  'pack346-alert-routing.ts',
  'pack346-churn-engine.ts',
  'pack346-creator-kpi.ts',
  'pack352-daily-aggregator.ts',
  'pack356-kpi-extensions.ts',
];

function fixSchedulerReturns(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Pattern to find scheduler.onSchedule with return statements that return objects
  // We need to find the return statement inside the async handler and convert it to logger.info + return;
  
  // Find all scheduler.onSchedule blocks
  const schedulerPattern = /scheduler\.onSchedule\s*\(\s*(?:'[^']*'|"[^"]*"|{[^}]*})\s*,\s*async\s*\([^)]*\)\s*=>\s*{/g;
  
  let match;
  const matches = [];
  while ((match = schedulerPattern.exec(content)) !== null) {
    matches.push({
      index: match.index,
      text: match[0]
    });
  }
  
  if (matches.length === 0) {
    console.log(`No scheduler.onSchedule found in ${path.basename(filePath)}`);
    return false;
  }
  
  // For each scheduler block, find the return statement and fix it
  let modified = false;
  
  // Process from end to start to preserve indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const startIdx = matches[i].index;
    
    // Find the matching closing brace for this function
    let braceCount = 0;
    let inFunction = false;
    let functionStart = -1;
    let functionEnd = -1;
    
    for (let j = startIdx; j < content.length; j++) {
      if (content[j] === '{') {
        if (!inFunction) {
          inFunction = true;
          functionStart = j;
        }
        braceCount++;
      } else if (content[j] === '}') {
        braceCount--;
        if (braceCount === 0 && inFunction) {
          functionEnd = j;
          break;
        }
      }
    }
    
    if (functionStart === -1 || functionEnd === -1) {
      continue;
    }
    
    // Extract the function body
    const functionBody = content.substring(functionStart, functionEnd + 1);
    
    // Find return statements that return objects
    // Pattern: return { ... };
    const returnPattern = /(\s+)(return\s+)({[\s\S]*?});(\s*}?\s*$|\s*}\s*\))/g;
    
    let newFunctionBody = functionBody;
    let returnMatch;
    
    // Reset lastIndex
    returnPattern.lastIndex = 0;
    
    while ((returnMatch = returnPattern.exec(functionBody)) !== null) {
      const indent = returnMatch[1];
      const returnObj = returnMatch[3];
      const suffix = returnMatch[4];
      
      // Check if this is actually returning an object (not a variable)
      if (returnObj.startsWith('{')) {
        // Convert to logger.info and remove return
        const replacement = `${indent}logger.info('Scheduler completed', ${returnObj});${indent}return;${suffix}`;
        newFunctionBody = newFunctionBody.replace(returnMatch[0], replacement);
        modified = true;
      }
    }
    
    if (newFunctionBody !== functionBody) {
      content = content.substring(0, functionStart) + newFunctionBody + content.substring(functionEnd + 1);
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed scheduler returns in ${path.basename(filePath)}`);
    return true;
  }
  
  return false;
}

// Alternative approach: simpler regex replacement
function fixSchedulerReturnsSimple(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Pattern to find return statements with object literals at the end of scheduler handlers
  // This is a simpler approach that looks for return { ... }; patterns
  
  // Replace return { key: value, ... }; with logger.info('Completed', { key: value, ... }); return;
  // But only when it's clearly a scheduler return (ends with }); or similar)
  
  const patterns = [
    // return { success: true, count: 5 };
    {
      find: /return\s+(\{\s*(?:success|processed|count|deleted|expired|triggered|remindersSent|deletedCount|status|messagesStep\d+|segmentTransitions|winBackTriggered|timestamp|skipped|date|metrics|failed|errors|succeeded)\s*:[^}]+\});/g,
      replace: (match, obj) => `logger.info('Scheduler completed', ${obj}); return;`
    }
  ];
  
  let modified = false;
  
  for (const pattern of patterns) {
    const newContent = content.replace(pattern.find, pattern.replace);
    if (newContent !== content) {
      content = newContent;
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed scheduler returns in ${path.basename(filePath)}`);
    return true;
  }
  
  console.log(`No changes needed in ${path.basename(filePath)}`);
  return false;
}

// Run fixes
console.log('Fixing scheduler return types (TS2769)...\n');

let fixedCount = 0;
for (const file of schedulerFiles) {
  const filePath = path.join(srcDir, file);
  if (fixSchedulerReturnsSimple(filePath)) {
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} files`);
