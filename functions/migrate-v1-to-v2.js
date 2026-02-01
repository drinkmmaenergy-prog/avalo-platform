/**
 * Migration Script: Firebase Functions v1 onCall → v2 onCall
 * 
 * This script automatically migrates Firebase callable functions from v1 API to v2:
 * 1. Replaces (data, context) => ... with (request) => ... 
 * 2. Replaces context.auth with request.auth
 * 3. Replaces data.property with request.data.property
 * 4. Replaces CallableContext with CallableRequest
 * 5. Updates imports to use centralized runtime
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files to process
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

  // Skip runtime.ts itself
  if (filePath.endsWith('runtime.ts') || filePath.endsWith('init.ts')) {
    continue;
  }

  // 1. Replace functions.https.CallableContext with CallableRequest
  const callableContextRegex = /functions\.https\.CallableContext/g;
  if (callableContextRegex.test(content)) {
    content = content.replace(callableContextRegex, 'CallableRequest<any>');
    fileChanges++;
  }

  // 2. Replace CallableContext (standalone) that's not already CallableRequest
  const standaloneCallableContext = /\bCallableContext\b(?!\s*<)/g;
  if (standaloneCallableContext.test(content)) {
    content = content.replace(standaloneCallableContext, 'CallableRequest<any>');
    fileChanges++;
  }

  // 3. For onCall functions with (data, context) signature, migrate to (request) signature
  // This is a complex transformation - we need to:
  // a) Change the function signature
  // b) Add `const data = request.data;` at the start if data is used
  // c) Replace context.auth with request.auth
  // d) Replace context.* with request.*

  // Pattern to match onCall(async (data, context) => {
  // Also handles various data types and named parameters
  const onCallPattern = /\.onCall\(\s*async\s*\(\s*(\w+)\s*(?::\s*[^,)]+)?\s*,\s*(\w+)\s*(?::\s*[^)]+)?\s*\)\s*(?::\s*[^=]+)?\s*=>\s*\{/g;
  
  let match;
  const replacements = [];
  
  // Reset regex lastIndex
  onCallPattern.lastIndex = 0;
  
  while ((match = onCallPattern.exec(content)) !== null) {
    const dataParam = match[1]; // e.g., 'data' or typed like 'data: SomeType'
    const contextParam = match[2]; // e.g., 'context'
    
    replacements.push({
      fullMatch: match[0],
      dataParam,
      contextParam,
      index: match.index
    });
  }

  // Apply replacements in reverse order to maintain indices
  for (const repl of replacements.reverse()) {
    // Replace the function signature
    const newSignature = '.onCall(async (request) => {';
    content = content.substring(0, repl.index) + newSignature + content.substring(repl.index + repl.fullMatch.length);
    
    // Find the position right after the opening brace to insert data extraction
    const insertPos = repl.index + newSignature.length;
    
    // Check if data parameter is used in the function body
    const dataParamRegex = new RegExp(`\\b${repl.dataParam}\\b`, 'g');
    const restOfContent = content.substring(insertPos);
    
    // Find the end of the function (matching braces)
    let braceCount = 1;
    let endIndex = 0;
    for (let i = 0; i < restOfContent.length && braceCount > 0; i++) {
      if (restOfContent[i] === '{') braceCount++;
      if (restOfContent[i] === '}') braceCount--;
      endIndex = i;
    }
    
    const functionBody = restOfContent.substring(0, endIndex);
    
    // If data param is used, add extraction at the start
    if (dataParamRegex.test(functionBody)) {
      const dataExtraction = `\n  const ${repl.dataParam} = request.data;`;
      content = content.substring(0, insertPos) + dataExtraction + content.substring(insertPos);
    }
    
    fileChanges++;
  }

  // 4. Replace remaining context.auth with request.auth (for helper functions that take context)
  const contextAuthRegex = /\bcontext\.auth\b/g;
  if (contextAuthRegex.test(content)) {
    content = content.replace(contextAuthRegex, 'request.auth');
    fileChanges++;
  }

  // 5. Replace context.rawRequest with request.rawRequest
  const contextRawRequestRegex = /\bcontext\.rawRequest\b/g;
  if (contextRawRequestRegex.test(content)) {
    content = content.replace(contextRawRequestRegex, 'request.rawRequest');
    fileChanges++;
  }

  // 6. Fix any remaining usages of 'context' as a parameter name in helper functions
  // These need their parameter renamed to 'request'
  
  // Helper function signature pattern: function name(... context: CallableRequest...)
  const helperFunctionContextParam = /(\(\s*(?:[^)]*,\s*)?)context(\s*:\s*(?:functions\.https\.)?CallableRequest)/g;
  if (helperFunctionContextParam.test(content)) {
    content = content.replace(helperFunctionContextParam, '$1request$2');
    fileChanges++;
  }

  // 7. Add CallableRequest import if needed and not present
  if (content.includes('CallableRequest') && !content.includes("import { CallableRequest") && !content.includes("CallableRequest,") && !content.includes("type { CallableRequest")) {
    // Check if already importing from runtime
    if (content.includes('from "./runtime"') || content.includes("from './runtime'")) {
      // Add CallableRequest to existing runtime import
      const runtimeImportRegex = /(import\s*\{)([^}]*)(}\s*from\s*["']\.\/runtime["'])/;
      const runtimeMatch = content.match(runtimeImportRegex);
      if (runtimeMatch && !runtimeMatch[2].includes('CallableRequest')) {
        content = content.replace(runtimeImportRegex, `$1$2, CallableRequest$3`);
        fileChanges++;
      }
    }
  }

  if (fileChanges > 0 && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalChanges += fileChanges;
    filesModified.push(path.relative(__dirname, filePath));
    console.log(`Modified: ${path.relative(__dirname, filePath)} (${fileChanges} changes)`);
  }
}

console.log(`\n=== Migration Complete ===`);
console.log(`Total files modified: ${filesModified.length}`);
console.log(`Total changes: ${totalChanges}`);
console.log(`\nModified files:`);
filesModified.forEach(f => console.log(`  - ${f}`));
