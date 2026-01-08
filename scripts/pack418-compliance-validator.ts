/**
 * PACK 418 — Safety & Compliance Regression Guardrails
 * 
 * BUILD-TIME VALIDATOR
 * Scans codebase for compliance violations before deployment.
 * 
 * Usage:
 *   npx ts-node scripts/pack418-compliance-validator.ts
 *   
 * Exit codes:
 *   0 = All checks passed
 *   1 = Compliance violations detected
 * 
 * This script is meant to run in CI/CD pipelines to prevent deployment
 * of code that violates platform compliance rules.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TOKEN_PAYOUT_RATE_PLN,
  SPLIT_CHAT_STANDARD,
  SPLIT_CHAT_ROYAL,
  SPLIT_MEETING_CALENDAR,
  SPLIT_EVENTS,
  SPLIT_TIPS,
  AGE_MINIMUM_YEARS,
} from '../shared/compliance/pack418-compliance-constants';

// =============================================================================
// CONFIGURATION
// =============================================================================

const SCAN_DIRECTORIES = [
  'functions/src',
  'app-mobile',
  'app-web',
  'admin-web',
  'shared',
];

const EXCLUDED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.expo',
  'android',
  'ios',
  '.next',
  'coverage',
  '__tests__',
];

const FILE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
];

// =============================================================================
// ERROR TYPES
// =============================================================================

interface ComplianceError {
  type: 'TOKENOMICS_OVERRIDE' | 'AGE_OVERRIDE' | 'MISSING_COMPLIANCE_IMPORT' | 'HARDCODED_SPLIT';
  file: string;
  line: number;
  message: string;
  snippet?: string;
}

interface ValidationResult {
  status: 'PASS' | 'FAIL';
  errors: ComplianceError[];
  warnings: string[];
  filesScanned: number;
  timestamp: string;
}

// =============================================================================
// FILE SCANNING UTILITIES
// =============================================================================

/**
 * Recursively get all files in a directory
 */
function getFilesRecursively(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const relativePath = path.relative(baseDir, fullPath);
    
    // Skip excluded directories
    if (EXCLUDED_DIRECTORIES.some(excluded => relativePath.includes(excluded))) {
      continue;
    }
    
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getFilesRecursively(fullPath, baseDir));
    } else if (FILE_EXTENSIONS.some(ext => item.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

/**
 * Get all files to scan from configured directories
 */
function getAllFiles(): string[] {
  const baseDir = path.resolve(__dirname, '..');
  const allFiles: string[] = [];
  
  for (const dir of SCAN_DIRECTORIES) {
    const fullPath = path.join(baseDir, dir);
    allFiles.push(...getFilesRecursively(fullPath, baseDir));
  }
  
  return allFiles;
}

// =============================================================================
// VALIDATION RULES
// =============================================================================

/**
 * Check for hardcoded tokenomics values (splits, rates)
 */
function checkTokenomicsOverrides(filePath: string, content: string): ComplianceError[] {
  const errors: ComplianceError[] = [];
  const lines = content.split('\n');
  
  // Skip if this is the compliance constants file itself
  if (filePath.includes('pack418-compliance-constants')) {
    return errors;
  }
  
  // Check for hardcoded revenue splits
  const suspiciousPatterns = [
    // Look for percentage assignments like: creator: 0.65, avalo: 0.35
    /creator\s*:\s*0\.65/i,
    /avalo\s*:\s*0\.35/i,
    /creator\s*:\s*0\.80/i,
    /avalo\s*:\s*0\.20/i,
    /creator\s*:\s*0\.90/i,
    /avalo\s*:\s*0\.10/i,
    // Look for percentage calculations: * 0.65, * 0.35, etc.
    /\*\s*0\.65(?!\d)/,
    /\*\s*0\.35(?!\d)/,
    /\*\s*0\.80(?!\d)/,
    /\*\s*0\.20(?!\d)/,
    /\*\s*0\.90(?!\d)/,
    /\*\s*0\.10(?!\d)/,
    // Look for hardcoded payout rate
    /0\.20\s*(?:PLN|pln)/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comments and imports
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('import')) {
      continue;
    }
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(line)) {
        // Check if this file imports from compliance constants
        const importsCompliance = content.includes('pack418-compliance-constants');
        
        if (!importsCompliance) {
          errors.push({
            type: 'TOKENOMICS_OVERRIDE',
            file: path.relative(path.resolve(__dirname, '..'), filePath),
            line: i + 1,
            message: 'Found hardcoded tokenomics value without importing from compliance constants',
            snippet: line.trim(),
          });
        }
      }
    }
  }
  
  return errors;
}

/**
 * Check for hardcoded age restrictions
 */
function checkAgeOverrides(filePath: string, content: string): ComplianceError[] {
  const errors: ComplianceError[] = [];
  const lines = content.split('\n');
  
  // Skip if this is the compliance constants file itself
  if (filePath.includes('pack418-compliance-constants')) {
    return errors;
  }
  
  // Look for age checks with values other than 18
  const agePatterns = [
    /age\s*[<>=!]+\s*(?:17|19|20|21)/i,
    /minAge\s*=\s*(?:17|19|20|21)/i,
    /minimumAge\s*=\s*(?:17|19|20|21)/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      continue;
    }
    
    for (const pattern of agePatterns) {
      if (pattern.test(line)) {
        errors.push({
          type: 'AGE_OVERRIDE',
          file: path.relative(path.resolve(__dirname, '..'), filePath),
          line: i + 1,
          message: `Found age check with non-standard value (should use AGE_MINIMUM_YEARS = ${AGE_MINIMUM_YEARS})`,
          snippet: line.trim(),
        });
      }
    }
  }
  
  return errors;
}

/**
 * Check for @requiresCompliance tags without proper imports
 */
function checkComplianceImports(filePath: string, content: string): ComplianceError[] {
  const errors: ComplianceError[] = [];
  const lines = content.split('\n');
  
  // Look for @requiresCompliance tags
  const requiresComplianceTags: Array<{ line: number, keys: string[] }> = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/@requiresCompliance\s*:\s*(.+)/i);
    
    if (match) {
      const keys = match[1].split(',').map(k => k.trim());
      requiresComplianceTags.push({ line: i + 1, keys });
    }
  }
  
  // If file has @requiresCompliance tags, verify imports
  if (requiresComplianceTags.length > 0) {
    const importsCompliance = content.includes('pack418-compliance-constants');
    
    if (!importsCompliance) {
      for (const tag of requiresComplianceTags) {
        errors.push({
          type: 'MISSING_COMPLIANCE_IMPORT',
          file: path.relative(path.resolve(__dirname, '..'), filePath),
          line: tag.line,
          message: `File has @requiresCompliance tag but does not import from pack418-compliance-constants`,
          snippet: `Required keys: ${tag.keys.join(', ')}`,
        });
      }
    }
  }
  
  return errors;
}

/**
 * Check for hardcoded split assignments
 */
function checkHardcodedSplits(filePath: string, content: string): ComplianceError[] {
  const errors: ComplianceError[] = [];
  const lines = content.split('\n');
  
  // Skip if this is the compliance constants file itself
  if (filePath.includes('pack418-compliance-constants')) {
    return errors;
  }
  
  // Look for split object definitions
  const splitPatterns = [
    /\{\s*creator\s*:\s*\d+\.?\d*\s*,\s*avalo\s*:\s*\d+\.?\d*\s*\}/i,
    /\{\s*avalo\s*:\s*\d+\.?\d*\s*,\s*creator\s*:\s*\d+\.?\d*\s*\}/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comments and imports
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('import')) {
      continue;
    }
    
    for (const pattern of splitPatterns) {
      if (pattern.test(line)) {
        // Check if this file imports from compliance constants
        const importsCompliance = content.includes('pack418-compliance-constants');
        
        if (!importsCompliance) {
          errors.push({
            type: 'HARDCODED_SPLIT',
            file: path.relative(path.resolve(__dirname, '..'), filePath),
            line: i + 1,
            message: 'Found hardcoded split object. Use SPLIT_* constants from pack418-compliance-constants',
            snippet: line.trim(),
          });
        }
      }
    }
  }
  
  return errors;
}

// =============================================================================
// MAIN VALIDATION
// =============================================================================

/**
 * Run all validation checks on a single file
 */
function validateFile(filePath: string): ComplianceError[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: ComplianceError[] = [];
  
  errors.push(...checkTokenomicsOverrides(filePath, content));
  errors.push(...checkAgeOverrides(filePath, content));
  errors.push(...checkComplianceImports(filePath, content));
  errors.push(...checkHardcodedSplits(filePath, content));
  
  return errors;
}

/**
 * Run validation on all files
 */
function runValidation(): ValidationResult {
  console.log('🔍 PACK 418 Compliance Validator');
  console.log('================================\n');
  
  const files = getAllFiles();
  console.log(`Scanning ${files.length} files...\n`);
  
  const allErrors: ComplianceError[] = [];
  const warnings: string[] = [];
  
  for (const file of files) {
    try {
      const errors = validateFile(file);
      allErrors.push(...errors);
    } catch (err) {
      warnings.push(`Failed to scan ${file}: ${err}`);
    }
  }
  
  const result: ValidationResult = {
    status: allErrors.length === 0 ? 'PASS' : 'FAIL',
    errors: allErrors,
    warnings,
    filesScanned: files.length,
    timestamp: new Date().toISOString(),
  };
  
  return result;
}

/**
 * Format and print validation results
 */
function printResults(result: ValidationResult): void {
  if (result.status === 'PASS') {
    console.log('✅ COMPLIANCE CHECK PASSED');
    console.log(`Scanned ${result.filesScanned} files - no violations detected.\n`);
    return;
  }
  
  console.log('❌ COMPLIANCE CHECK FAILED');
  console.log(`Detected ${result.errors.length} violation(s) in ${result.filesScanned} files.\n`);
  
  // Group errors by type
  const errorsByType: Record<string, ComplianceError[]> = {};
  
  for (const error of result.errors) {
    if (!errorsByType[error.type]) {
      errorsByType[error.type] = [];
    }
    errorsByType[error.type].push(error);
  }
  
  // Print errors by type
  for (const [type, errors] of Object.entries(errorsByType)) {
    console.log(`\n=== ${type} (${errors.length}) ===\n`);
    
    for (const error of errors) {
      console.log(`  File: ${error.file}:${error.line}`);
      console.log(`  Message: ${error.message}`);
      if (error.snippet) {
        console.log(`  Snippet: ${error.snippet}`);
      }
      console.log();
    }
  }
  
  // Print warnings
  if (result.warnings.length > 0) {
    console.log('\n=== WARNINGS ===\n');
    for (const warning of result.warnings) {
      console.log(`  ${warning}`);
    }
  }
  
  // Print JSON output for CI/CD
  console.log('\n=== JSON OUTPUT (for CI/CD) ===\n');
  console.log(JSON.stringify(result, null, 2));
}

// =============================================================================
// ENTRY POINT
// =============================================================================

if (require.main === module) {
  try {
    const result = runValidation();
    printResults(result);
    
    // Exit with appropriate code for CI/CD
    process.exit(result.status === 'PASS' ? 0 : 1);
  } catch (err) {
    console.error('Fatal error running compliance validator:', err);
    process.exit(2);
  }
}

// Export for testing
export { runValidation, ValidationResult, ComplianceError };
