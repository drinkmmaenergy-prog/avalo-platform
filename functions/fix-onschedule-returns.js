const fs = require('fs');
const path = require('path');

// Files with onSchedule return value errors from build output
const filesToFix = [
  'src/pack424-aso.service.ts',
  'src/pack424-trust-score.service.ts',
  'src/pack427-message-workers.ts',
  'src/pack432-ua-orchestrator.ts',
  'src/pack436-reputation-engine.ts',
  'src/pack436-review-boost.ts',
  'src/pack436-review-defense.ts'
];

function fixOnScheduleReturns(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return 0;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;
  let fixes = 0;

  // Pattern 1: return { ... } at end of onSchedule handler
  // Match return statements with object literals inside async functions that are onSchedule handlers
  
  // Find all onSchedule blocks and fix returns inside them
  const onSchedulePattern = /export\s+const\s+\w+\s*=\s*onSchedule\([^)]+\),\s*async\s*\([^)]*\)\s*=>\s*\{/g;
  
  let match;
  const positions = [];
  while ((match = onSchedulePattern.exec(content)) !== null) {
    positions.push(match.index);
  }

  // For each onSchedule, find its closing brace and look for return statements
  for (const pos of positions.reverse()) {
    // Find the function body
    let braceCount = 0;
    let inFunction = false;
    let functionStart = -1;
    let functionEnd = -1;
    
    for (let i = pos; i < content.length; i++) {
      if (content[i] === '{') {
        if (!inFunction) {
          inFunction = true;
          functionStart = i;
        }
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0 && inFunction) {
          functionEnd = i;
          break;
        }
      }
    }

    if (functionStart !== -1 && functionEnd !== -1) {
      let functionBody = content.substring(functionStart, functionEnd + 1);
      
      // Fix return { ... } patterns - replace with return;
      // But be careful not to replace returns inside nested functions
      const returnPattern = /return\s+\{[^}]+\}\s*;/g;
      let newBody = functionBody;
      let returnMatch;
      
      while ((returnMatch = returnPattern.exec(functionBody)) !== null) {
        // Check if this return is at the top level of the function (not nested)
        const beforeReturn = functionBody.substring(0, returnMatch.index);
        let nestedBraces = 0;
        for (const char of beforeReturn) {
          if (char === '{') nestedBraces++;
          if (char === '}') nestedBraces--;
        }
        
        // If nestedBraces is 0, we're at the top level of the function body
        if (nestedBraces === 0) {
          const oldReturn = returnMatch[0];
          newBody = newBody.replace(oldReturn, 'return;');
          fixes++;
        }
      }
      
      if (newBody !== functionBody) {
        content = content.substring(0, functionStart) + newBody + content.substring(functionEnd + 1);
      }
    }
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    console.log(`Fixed ${fixes} return statements in ${filePath}`);
  } else {
    console.log(`No changes needed in ${filePath}`);
  }

  return fixes;
}

// Also search for any remaining return { ... } in onSchedule handlers
function findAndFixAllOnScheduleReturns(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  let totalFixes = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      totalFixes += findAndFixAllOnScheduleReturns(fullPath);
    } else if (file.name.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Check if file has onSchedule
      if (!content.includes('onSchedule(')) continue;
      
      const original = content;
      
      // Find all onSchedule handlers and fix their returns
      // Pattern: onSchedule(..., async (event) => { ... return { ... }; ... });
      
      // Simple approach: find return { ... }; that comes after onSchedule and before });
      const lines = content.split('\n');
      let inOnSchedule = false;
      let braceDepth = 0;
      let onScheduleStart = -1;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this line starts an onSchedule
        if (line.includes('onSchedule(') && line.includes('async')) {
          inOnSchedule = true;
          onScheduleStart = i;
          braceDepth = 0;
        }
        
        if (inOnSchedule) {
          // Count braces
          for (const char of line) {
            if (char === '{') braceDepth++;
            if (char === '}') braceDepth--;
          }
          
          // Check for return { ... } at depth 1 (inside the main function body)
          if (braceDepth === 1 && line.match(/^\s*return\s+\{/)) {
            // This is a return statement at the top level of onSchedule
            // Replace with return;
            const match = line.match(/^(\s*)return\s+\{[^}]*\}\s*;/);
            if (match) {
              lines[i] = match[1] + 'return;';
              totalFixes++;
              console.log(`Fixed return in ${fullPath}:${i + 1}`);
            }
          }
          
          // Check if onSchedule ended
          if (braceDepth === 0 && line.includes('});')) {
            inOnSchedule = false;
          }
        }
      }
      
      const newContent = lines.join('\n');
      if (newContent !== original) {
        fs.writeFileSync(fullPath, newContent);
      }
    }
  }

  return totalFixes;
}

console.log('Fixing onSchedule return values...\n');

// First fix known files
let totalFixes = 0;
for (const file of filesToFix) {
  totalFixes += fixOnScheduleReturns(file);
}

// Then scan all files
console.log('\nScanning all files for remaining issues...');
totalFixes += findAndFixAllOnScheduleReturns(path.join(__dirname, 'src'));

console.log(`\nTotal fixes: ${totalFixes}`);
