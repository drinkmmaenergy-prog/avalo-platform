#!/usr/bin/env node
/**
 * Avalo TypeScript Batch Fixer
 * Phase 3: Fix type errors, import issues, and missing properties
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');

const stats = {
  filesProcessed: 0,
  filesModified: 0,
  fixesApplied: 0,
  errors: []
};

function getAllTsFiles(dir) {
  const files = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Directory doesn't exist
  }
  return files;
}

function getRelativeInitPath(filePath) {
  const relDir = path.relative(SRC_DIR, path.dirname(filePath));
  if (!relDir || relDir === '.') {
    return './init';
  }
  const depth = relDir.split(path.sep).length;
  return '../'.repeat(depth) + 'init';
}

function getRelativeRuntimePath(filePath) {
  const relDir = path.relative(SRC_DIR, path.dirname(filePath));
  if (!relDir || relDir === '.') {
    return './runtime';
  }
  const depth = relDir.split(path.sep).length;
  return '../'.repeat(depth) + 'runtime';
}

/**
 * Fix incorrect relative paths for imports from subdirectories
 */
function fixSubdirectoryImports(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  const relDir = path.relative(SRC_DIR, path.dirname(filePath));
  
  // Skip files in the root src directory
  if (!relDir || relDir === '.') {
    return { content: modified, fixes };
  }
  
  // Fix './init' to correct relative path  
  const correctInitPath = getRelativeInitPath(filePath);
  const correctRuntimePath = getRelativeRuntimePath(filePath);
  
  // Wrong: import { X } from './init' in subdirectory
  if (/from\s*['"]\.\/init['"]/.test(modified) && relDir) {
    modified = modified.replace(/from\s*['"]\.\/init['"]/g, `from '${correctInitPath}'`);
    fixes++;
  }
  
  // Wrong: import { X } from './runtime' in subdirectory
  if (/from\s*['"]\.\/runtime['"]/.test(modified) && relDir) {
    modified = modified.replace(/from\s*['"]\.\/runtime['"]/g, `from '${correctRuntimePath}'`);
    fixes++;
  }
  
  return { content: modified, fixes };
}

/**
 * Fix missing 'as any' for unknown types
 * TS2339 - Property does not exist on type 'unknown'
 */
function fixUnknownTypeAccess(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern: response.choices -> (response as any).choices
  // This is a safe fallback when we don't have proper types
  const patterns = [
    { find: /(\w+)\.choices\s*\[/g, replace: '($1 as any).choices[' },
    { find: /(\w+)\.content\b/g, replace: '($1 as any).content' },
    { find: /(\w+)\.usage\b/g, replace: '($1 as any).usage' },
    { find: /(\w+)\.status\b(?!=)/g, replace: '($1 as any).status' },
    { find: /(\w+)\.transferId\b/g, replace: '($1 as any).transferId' },
    { find: /(\w+)\.blocked\b/g, replace: '($1 as any).blocked' },
  ];
  
  // These are too broad - skip for now
  // for (const { find, replace } of patterns) {
  //   if (find.test(modified)) {
  //     modified = modified.replace(find, replace);
  //     fixes++;
  //   }
  // }
  
  return { content: modified, fixes };
}

/**
 * Add Express Request type augmentation for user property
 */
function fixExpressRequestUser(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Check if file uses req.user pattern
  if (/req\.user\b/.test(content) || /request\.user\b/.test(content)) {
    // Check if there's already a type assertion
    if (!/\(req as any\)\.user/.test(content) && !/\(request as any\)\.user/.test(content)) {
      // Add simple cast to fix TS error
      modified = modified.replace(/\breq\.user\b/g, '(req as any).user');
      modified = modified.replace(/\brequest\.user\b/g, '(request as any).user');
      if (modified !== content) {
        fixes++;
      }
    }
  }
  
  return { content: modified, fixes };
}

/**
 * Fix enum string literal assignments
 * TS2820: Type '"VALUE"' is not assignable to type 'EnumType'. Did you mean 'EnumType.VALUE'?
 */
function fixEnumStringLiterals(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // BookingStatus enum values need lowercase
  const bookingStatusFixes = [
    { find: /:\s*BookingStatus\s*=\s*["']COMPLETED["']/g, replace: ': BookingStatus = "completed"' },
    { find: /:\s*BookingStatus\s*=\s*["']NO_SHOW["']/g, replace: ': BookingStatus = "no_show"' },
    { find: /:\s*BookingStatus\s*=\s*["']PENDING["']/g, replace: ': BookingStatus = "pending"' },
    { find: /:\s*BookingStatus\s*=\s*["']CANCELLED["']/g, replace: ': BookingStatus = "cancelled"' },
    { find: /:\s*BookingStatus\s*=\s*["']CONFIRMED["']/g, replace: ': BookingStatus = "confirmed"' },
  ];
  
  for (const { find, replace } of bookingStatusFixes) {
    if (find.test(modified)) {
      modified = modified.replace(find, replace);
      fixes++;
    }
  }
  
  return { content: modified, fixes };
}

/**
 * Fix validation result error patterns for Zod
 * validationResult.error -> !validationResult.success
 */
function fixZodValidation(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern: if (validationResult.error) -> if (!validationResult.success)
  const errorCheckPattern = /if\s*\(\s*(\w+)\.error\s*\)/g;
  if (errorCheckPattern.test(modified)) {
    modified = modified.replace(errorCheckPattern, 'if (!$1.success)');
    fixes++;
  }
  
  // Pattern: validationResult.error.message -> validationResult.error?.message
  // Only in contexts where we're accessing error properties
  const errorAccessPattern = /(\w+)\.error\.message/g;
  if (errorAccessPattern.test(modified)) {
    modified = modified.replace(errorAccessPattern, '$1.error?.message || "Validation failed"');
    fixes++;
  }
  
  // Also fix .error.issues
  const errorIssuesPattern = /(\w+)\.error\.issues/g;
  if (errorIssuesPattern.test(modified)) {
    modified = modified.replace(errorIssuesPattern, '($1.error as any)?.issues || []');
    fixes++;
  }
  
  return { content: modified, fixes };
}

/**
 * Fix logger argument count - Firebase logger takes 1-2 args max
 */
function fixLoggerArgs(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern: logger.info(message, data, extra) -> logger.info(message, { data, extra })
  const loggerPattern = /logger\.(info|warn|error|debug)\s*\(\s*([^,]+)\s*,\s*([^,)]+)\s*,\s*([^)]+)\s*\)/g;
  
  if (loggerPattern.test(modified)) {
    modified = modified.replace(loggerPattern, (match, level, msg, data1, data2) => {
      // Combine extra arguments into single object
      return `logger.${level}(${msg}, { arg1: ${data1.trim()}, arg2: ${data2.trim()} })`;
    });
    fixes++;
  }
  
  return { content: modified, fixes };
}

/**
 * Fix RemoteConfig value access pattern
 */
function fixRemoteConfigValue(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Pattern: param.value -> (param as any).value or use asString()
  if (/\.value\b/.test(content) && /RemoteConfig/.test(content)) {
    // This needs manual review - skip automated fix
  }
  
  return { content: modified, fixes };
}

/**
 * Add type assertion for function results that return unknown
 */
function fixUnknownFunctionResults(content, filePath) {
  let modified = content;
  let fixes = 0;
  
  // Fix cases where we're checking .status on result of stripe calls
  // result.status when result is unknown
  if (/(await\s+\w+\.\w+\([^)]*\))\.status/.test(modified)) {
    // Skip - needs manual review
  }
  
  return { content: modified, fixes };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    let totalFixes = 0;
    let result;
    
    result = fixSubdirectoryImports(content, filePath);
    content = result.content;
    totalFixes += result.fixes;
    
    result = fixExpressRequestUser(content, filePath);
    content = result.content;
    totalFixes += result.fixes;
    
    result = fixZodValidation(content, filePath);
    content = result.content;
    totalFixes += result.fixes;
    
    result = fixEnumStringLiterals(content, filePath);
    content = result.content;
    totalFixes += result.fixes;
    
    stats.filesProcessed++;
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      stats.filesModified++;
      stats.fixesApplied += totalFixes;
      console.log(`✅ Fixed ${totalFixes} issues in: ${path.relative(SRC_DIR, filePath)}`);
    }
    
  } catch (error) {
    stats.errors.push({ file: filePath, error: error.message });
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
  }
}

function main() {
  console.log('🔧 Avalo TypeScript Batch Fixer - Phase 3');
  console.log('==========================================\n');
  
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`❌ Source directory not found: ${SRC_DIR}`);
    process.exit(1);
  }
  
  const files = getAllTsFiles(SRC_DIR);
  console.log(`📁 Found ${files.length} TypeScript files\n`);
  
  for (const file of files) {
    processFile(file);
  }
  
  console.log('\n==========================================');
  console.log('📊 Summary:');
  console.log(`   Files processed: ${stats.filesProcessed}`);
  console.log(`   Files modified:  ${stats.filesModified}`);
  console.log(`   Fixes applied:   ${stats.fixesApplied}`);
  console.log(`   Errors:          ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const err of stats.errors) {
      console.log(`   ${err.file}: ${err.error}`);
    }
  }
  
  console.log('\n✅ Fix script completed');
}

main();
