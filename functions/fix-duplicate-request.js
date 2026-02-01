/**
 * Fix duplicate 'request' identifier in onCall functions
 * Pattern: onCall(async (request) => { ... const request = { ... })
 * Fix: Rename inner const to requestPayload or similar
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

let totalFilesModified = 0;
let totalFixes = 0;

function getAllTsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const relativePath = path.relative(srcDir, filePath);
  let fixes = 0;

  // Find all onCall functions with (request) parameter
  // Then check if there's a const request = { inside
  
  // Pattern 1: functions.https.onCall(async (request) => {
  // Pattern 2: onCall(async (request) => {
  // Pattern 3: onCall(async (request: any) => {
  
  // We need to find the function body and rename inner 'const request ='
  
  const lines = content.split('\n');
  let inOnCallFunction = false;
  let braceDepth = 0;
  let parameterName = null;
  let functionStartLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for onCall with request parameter
    const onCallMatch = line.match(/\.onCall\s*\(\s*async\s*\(\s*(request|req)\s*(?::\s*\w+)?\s*\)\s*=>\s*\{?/);
    if (onCallMatch) {
      inOnCallFunction = true;
      parameterName = onCallMatch[1];
      functionStartLine = i;
      braceDepth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      continue;
    }
    
    if (inOnCallFunction) {
      braceDepth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      
      // Check for const request = { or const req = {
      const constMatch = line.match(/^(\s*)(const|let|var)\s+(request|req)\s*=\s*\{/);
      if (constMatch && constMatch[3] === parameterName) {
        // Found duplicate! Rename it
        const indent = constMatch[1];
        const keyword = constMatch[2];
        const newName = parameterName === 'request' ? 'requestPayload' : 'reqPayload';
        
        lines[i] = line.replace(
          new RegExp(`(const|let|var)\\s+${parameterName}\\s*=\\s*\\{`),
          `${keyword} ${newName} = {`
        );
        
        // Now we need to rename all usages of this variable within the same scope
        // This is complex - for now, let's just rename the declaration and hope
        // the usages are close by
        
        // Actually, let's find the closing brace of this object literal and then
        // rename usages until the end of the function
        
        let objectBraceDepth = 1;
        let objectEndLine = i;
        
        for (let j = i; j < lines.length && objectBraceDepth > 0; j++) {
          if (j === i) {
            // Count braces after the opening one
            const afterOpening = lines[j].substring(lines[j].indexOf('{') + 1);
            objectBraceDepth += (afterOpening.match(/\{/g) || []).length;
            objectBraceDepth -= (afterOpening.match(/\}/g) || []).length;
          } else {
            objectBraceDepth += (lines[j].match(/\{/g) || []).length;
            objectBraceDepth -= (lines[j].match(/\}/g) || []).length;
          }
          objectEndLine = j;
        }
        
        // Now rename usages from objectEndLine+1 to end of function
        // But we need to be careful not to rename the parameter usage
        // Actually, let's just rename usages that are clearly the local variable
        
        // For simplicity, let's rename usages that look like:
        // - request.property (but not request.data, request.auth which are parameter)
        // - await someFunction(request)
        // - if (!request.something)
        
        // Actually, the safest approach is to rename the parameter instead
        // Let's change the approach: rename the parameter to callableRequest
        // and keep the inner const as request
        
        // Revert the line change
        lines[i] = line;
        
        // Instead, rename the parameter
        lines[functionStartLine] = lines[functionStartLine].replace(
          new RegExp(`\\.onCall\\s*\\(\\s*async\\s*\\(\\s*${parameterName}\\s*(:\\s*\\w+)?\\s*\\)\\s*=>\\s*\\{?`),
          (match, typeAnnotation) => {
            const newParamName = parameterName === 'request' ? 'callableRequest' : 'callableReq';
            return match.replace(parameterName, newParamName);
          }
        );
        
        // Now rename all usages of the parameter (request.data, request.auth, etc.)
        // from functionStartLine to i (before the const declaration)
        const newParamName = parameterName === 'request' ? 'callableRequest' : 'callableReq';
        
        for (let j = functionStartLine; j < i; j++) {
          // Replace request.data, request.auth, etc.
          lines[j] = lines[j].replace(
            new RegExp(`\\b${parameterName}\\.(data|auth|rawRequest)\\b`, 'g'),
            `${newParamName}.$1`
          );
          // Replace !request.auth
          lines[j] = lines[j].replace(
            new RegExp(`!${parameterName}\\.`, 'g'),
            `!${newParamName}.`
          );
        }
        
        fixes++;
        console.log(`  Line ${i + 1}: Renamed parameter to ${newParamName}`);
      }
      
      // Check if we've exited the function
      if (braceDepth <= 0) {
        inOnCallFunction = false;
        parameterName = null;
        functionStartLine = -1;
      }
    }
  }
  
  const newContent = lines.join('\n');
  
  if (newContent !== originalContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    totalFilesModified++;
    totalFixes += fixes;
    console.log(`✅ Fixed ${relativePath} (${fixes} fixes)`);
  }
}

// Main execution
console.log('🔧 Fixing duplicate request identifiers...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  try {
    fixFile(file);
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

console.log(`\n✅ Complete! Modified ${totalFilesModified} files with ${totalFixes} total fixes.`);
