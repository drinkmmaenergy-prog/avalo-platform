/**
 * Comprehensive fix for context -> request migration
 * In Firebase Functions v2, 'context' is replaced with 'request'
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function getAllTsFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (item.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let modified = false;
  const changes = [];

  // Pattern 1: Replace standalone 'context' with 'request' in onCall handlers
  // Look for: requireXXX(context) -> requireXXX(request)
  const contextPatterns = [
    /requireFinanceAdmin\(context\)/g,
    /requireAdmin\(context\)/g,
    /requireAuth\(context\)/g,
    /requireCreator\(context\)/g,
    /requireUser\(context\)/g,
    /requireTrustTeam\(context\)/g,
    /requireModerator\(context\)/g,
    /requireSupport\(context\)/g,
    /requireCompliance\(context\)/g,
  ];
  
  for (const pattern of contextPatterns) {
    if (pattern.test(content)) {
      const replacement = pattern.source.replace('context', 'request').replace(/\\/g, '');
      content = content.replace(pattern, replacement);
      modified = true;
      changes.push(`Fixed ${pattern.source}`);
    }
  }
  
  // Pattern 2: context.auth -> request.auth
  if (/\bcontext\.auth\b/.test(content) && !/const context\s*=/.test(content)) {
    content = content.replace(/\bcontext\.auth\b/g, 'request.auth');
    modified = true;
    changes.push('context.auth -> request.auth');
  }
  
  // Pattern 3: context.rawRequest -> request.rawRequest
  if (/\bcontext\.rawRequest\b/.test(content) && !/const context\s*=/.test(content)) {
    content = content.replace(/\bcontext\.rawRequest\b/g, 'request.rawRequest');
    modified = true;
    changes.push('context.rawRequest -> request.rawRequest');
  }

  if (modified && content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Fixed ${path.relative(srcDir, filePath)}: ${changes.join(', ')}`);
    return true;
  }
  
  return false;
}

const files = getAllTsFiles(srcDir);
let totalFixed = 0;

for (const file of files) {
  if (fixFile(file)) {
    totalFixed++;
  }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
