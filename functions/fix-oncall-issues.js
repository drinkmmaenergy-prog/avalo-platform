/**
 * Fix Script: Fix remaining issues from onCall migration
 * 
 * Issues to fix:
 * 1. Replace 'context' with 'request' in helper function calls
 * 2. Remove duplicate 'const data = request.data' when 'const request' already exists
 * 3. Fix cases where data was named 'data' but now we have 'const data = request.data'
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const filesToProcess = [];

function findTsFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findTsFiles(fullPath);
    } else if (file.endsWith('.ts')) {
      filesToProcess.push(fullPath);
    }
  }
}

findTsFiles(srcDir);

let totalChanges = 0;
let filesModified = [];

for (const filePath of filesToProcess) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fileChanges = 0;

  // Skip runtime.ts and init.ts
  if (filePath.endsWith('runtime.ts') || filePath.endsWith('init.ts')) {
    continue;
  }

  // Issue 1: Fix requireAdmin(context) -> requireAdmin(request) and similar helper calls
  // Common patterns: requireAdmin(context), requireAuth(context), verifyAdmin(context)
  const contextInCallsPattern = /\b(requireAdmin|requireAuth|verifyAdmin|verifyAdminRole|checkFinanceAdminAccess|requireMinimumRole|requireSuperAdmin|isAdmin|isAdminOrService)\(\s*context\s*\)/g;
  if (contextInCallsPattern.test(content)) {
    content = content.replace(contextInCallsPattern, '$1(request)');
    fileChanges++;
  }
  
  // Issue 2: Remove "const data = request.data;" when there's a duplicate "const request" on the next line
  // Pattern: async (request) => {\n  const data = request.data;\n  const request = data;
  const duplicateRequestPattern = /const data = request\.data;\s*\n(\s*)const request = data;/g;
  if (duplicateRequestPattern.test(content)) {
    content = content.replace(duplicateRequestPattern, 'const data = request.data;');
    fileChanges++;
  }

  // Issue 3: Fix cases where request shadowing occurs with typed data
  // Pattern: async (request) => {\n  const request = data;
  const shadowingRequestPattern = /onCall\(async \(request\) => \{\s*\n(\s*)const request = request\.data;/g;
  if (shadowingRequestPattern.test(content)) {
    content = content.replace(shadowingRequestPattern, 'onCall(async (request) => {\n$1const data = request.data;');
    fileChanges++;
  }

  // Issue 4: Fix "const request = data" that appears inside onCall functions
  // This happens when original param was 'data' and script added 'const request = data.data'
  const badRequestAssignment = /const (\w+) = request\.data;\s*\n(\s*)const request = \1;/g;
  if (badRequestAssignment.test(content)) {
    content = content.replace(badRequestAssignment, 'const $1 = request.data;');
    fileChanges++;
  }

  // Issue 5: Fix any line that has "const request = data;" standalone inside onCall
  // This is an invalid pattern
  const standaloneRequestData = /^(\s*)const request = data;$/gm;
  if (standaloneRequestData.test(content)) {
    content = content.replace(standaloneRequestData, '// removed invalid assignment');
    fileChanges++;
  }

  if (fileChanges > 0 && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalChanges += fileChanges;
    filesModified.push(path.relative(__dirname, filePath));
    console.log(`Fixed: ${path.relative(__dirname, filePath)} (${fileChanges} fixes)`);
  }
}

console.log(`\n=== Fix Complete ===`);
console.log(`Total files modified: ${filesModified.length}`);
console.log(`Total changes: ${totalChanges}`);
