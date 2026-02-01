/**
 * Comprehensive Batch Fix Script for avalo/functions
 * Addresses: Zod .error, TS2440 import conflicts, missing imports, enum usage
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Track changes
let totalFilesModified = 0;
let totalChanges = 0;

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
  let fileChanges = 0;
  const relativePath = path.relative(srcDir, filePath);

  // ==========================================================================
  // FIX 1: Zod .error access - add optional chaining
  // Pattern: validationResult.error.message -> validationResult.error?.message
  // ==========================================================================
  
  // Fix: .error.message without optional chaining
  const zodErrorPattern1 = /(\w+)\.error\.message/g;
  content = content.replace(zodErrorPattern1, (match, varName) => {
    // Only fix if it looks like a validation result
    if (varName.includes('validation') || varName.includes('result') || varName.includes('parsed') || varName.includes('Result')) {
      fileChanges++;
      return `${varName}.error?.message`;
    }
    return match;
  });

  // Fix: .error.issues without optional chaining
  const zodErrorPattern2 = /(\w+)\.error\.issues/g;
  content = content.replace(zodErrorPattern2, (match, varName) => {
    if (varName.includes('validation') || varName.includes('result') || varName.includes('parsed') || varName.includes('Result')) {
      fileChanges++;
      return `${varName}.error?.issues`;
    }
    return match;
  });

  // Fix: .error.format without optional chaining
  const zodErrorPattern3 = /(\w+)\.error\.format/g;
  content = content.replace(zodErrorPattern3, (match, varName) => {
    if (varName.includes('validation') || varName.includes('result') || varName.includes('parsed') || varName.includes('Result')) {
      fileChanges++;
      return `${varName}.error?.format`;
    }
    return match;
  });

  // ==========================================================================
  // FIX 2: TS2440 - Import conflicts with local declarations
  // Remove local declarations that conflict with imports
  // ==========================================================================

  // Check if file imports HttpsError from runtime
  const importsHttpsError = /import\s*{[^}]*HttpsError[^}]*}\s*from\s*['"]\.\/runtime['"]/.test(content) ||
                            /import\s*{[^}]*HttpsError[^}]*}\s*from\s*['"]\.\.\/runtime['"]/.test(content);
  
  if (importsHttpsError) {
    // Remove local HttpsError declarations
    const localHttpsErrorPattern = /^(const|let|var)\s+HttpsError\s*=\s*functions\.https\.HttpsError;?\s*$/gm;
    if (localHttpsErrorPattern.test(content)) {
      content = content.replace(localHttpsErrorPattern, '// HttpsError imported from runtime');
      fileChanges++;
    }
    
    // Also remove: const { HttpsError } = functions.https;
    const destructureHttpsError = /^const\s*{\s*HttpsError\s*}\s*=\s*functions\.https;?\s*$/gm;
    if (destructureHttpsError.test(content)) {
      content = content.replace(destructureHttpsError, '// HttpsError imported from runtime');
      fileChanges++;
    }
  }

  // Check if file imports Timestamp from runtime
  const importsTimestamp = /import\s*{[^}]*Timestamp[^}]*}\s*from\s*['"]\.\/runtime['"]/.test(content) ||
                           /import\s*{[^}]*Timestamp[^}]*}\s*from\s*['"]\.\.\/runtime['"]/.test(content);
  
  if (importsTimestamp) {
    // Remove local Timestamp declarations
    const localTimestampPattern = /^(const|let|var)\s+Timestamp\s*=\s*admin\.firestore\.Timestamp;?\s*$/gm;
    if (localTimestampPattern.test(content)) {
      content = content.replace(localTimestampPattern, '// Timestamp imported from runtime');
      fileChanges++;
    }
    
    // Also remove import from firebase-admin/firestore if we have runtime import
    const firestoreTimestampImport = /^import\s*{\s*Timestamp\s*}\s*from\s*['"]firebase-admin\/firestore['"];?\s*$/gm;
    if (firestoreTimestampImport.test(content)) {
      content = content.replace(firestoreTimestampImport, '// Timestamp imported from runtime');
      fileChanges++;
    }
  }

  // Check if file imports FieldValue from init or runtime
  const importsFieldValue = /import\s*{[^}]*FieldValue[^}]*}\s*from\s*['"]\.\/init['"]/.test(content) ||
                            /import\s*{[^}]*FieldValue[^}]*}\s*from\s*['"]\.\/runtime['"]/.test(content) ||
                            /import\s*{[^}]*FieldValue[^}]*}\s*from\s*['"]\.\.\/init['"]/.test(content);
  
  if (importsFieldValue) {
    // Remove local FieldValue declarations
    const localFieldValuePattern = /^(const|let|var)\s+FieldValue\s*=\s*admin\.firestore\.FieldValue;?\s*$/gm;
    if (localFieldValuePattern.test(content)) {
      content = content.replace(localFieldValuePattern, '// FieldValue imported from init');
      fileChanges++;
    }
  }

  // ==========================================================================
  // FIX 3: Add missing imports for common symbols
  // ==========================================================================

  // Check for missing FieldValue usage without import
  const usesFieldValue = /FieldValue\.(increment|serverTimestamp|arrayUnion|arrayRemove|delete)/.test(content);
  const hasFieldValueImport = /import\s*{[^}]*FieldValue[^}]*}/.test(content);
  
  if (usesFieldValue && !hasFieldValueImport) {
    // Add FieldValue to existing init import or create new one
    const initImportMatch = content.match(/^(import\s*{)([^}]*)(}\s*from\s*['"]\.\/init['"];?)$/m);
    if (initImportMatch) {
      const imports = initImportMatch[2];
      if (!imports.includes('FieldValue')) {
        content = content.replace(
          initImportMatch[0],
          `${initImportMatch[1]}${imports.trim()}, FieldValue${initImportMatch[3]}`
        );
        fileChanges++;
      }
    } else {
      // Check if there's any import from ./init
      const hasInitImport = /from\s*['"]\.\/init['"]/.test(content);
      if (!hasInitImport) {
        // Add new import after other imports
        const lastImportMatch = content.match(/^import\s+.+$/gm);
        if (lastImportMatch) {
          const lastImport = lastImportMatch[lastImportMatch.length - 1];
          content = content.replace(
            lastImport,
            `${lastImport}\nimport { FieldValue } from './init';`
          );
          fileChanges++;
        }
      }
    }
  }

  // Check for missing db usage without import
  const usesDb = /\bdb\.(collection|doc|batch|runTransaction|bulkWriter)/.test(content);
  const hasDbImport = /import\s*{[^}]*\bdb\b[^}]*}/.test(content);
  
  if (usesDb && !hasDbImport) {
    const initImportMatch = content.match(/^(import\s*{)([^}]*)(}\s*from\s*['"]\.\/init['"];?)$/m);
    if (initImportMatch) {
      const imports = initImportMatch[2];
      if (!imports.includes('db')) {
        content = content.replace(
          initImportMatch[0],
          `${initImportMatch[1]}${imports.trim()}, db${initImportMatch[3]}`
        );
        fileChanges++;
      }
    }
  }

  // Check for missing auth usage without import
  const usesAuth = /\bauth\.(getUser|createUser|updateUser|deleteUser|verifyIdToken)/.test(content);
  const hasAuthImport = /import\s*{[^}]*\bauth\b[^}]*}/.test(content);
  
  if (usesAuth && !hasAuthImport) {
    const initImportMatch = content.match(/^(import\s*{)([^}]*)(}\s*from\s*['"]\.\/init['"];?)$/m);
    if (initImportMatch) {
      const imports = initImportMatch[2];
      if (!imports.includes('auth')) {
        content = content.replace(
          initImportMatch[0],
          `${initImportMatch[1]}${imports.trim()}, auth${initImportMatch[3]}`
        );
        fileChanges++;
      }
    }
  }

  // ==========================================================================
  // FIX 4: Fix duplicate identifier issues (const request = { inside onCall(async (request) =>)
  // ==========================================================================
  
  // Pattern: onCall(async (request) => { ... const request = {
  // Fix: rename inner const to something else
  const duplicateRequestPattern = /onCall\(async\s*\(\s*request\s*\)\s*=>\s*\{([^}]*?)const\s+request\s*=\s*\{/gs;
  content = content.replace(duplicateRequestPattern, (match, between) => {
    fileChanges++;
    return match.replace(/const\s+request\s*=\s*\{/, 'const requestData = {');
  });

  // ==========================================================================
  // FIX 5: Fix enum usage as values (TS2693)
  // ==========================================================================
  
  // Fix: ReputationVisibilityContext.PUBLIC -> 'PUBLIC' (if it's a type being used as value)
  // This is tricky - we need to be careful not to break valid enum usage
  // For now, skip this as it requires more context

  // ==========================================================================
  // FIX 6: Fix logger import conflicts
  // ==========================================================================
  
  const importsLogger = /import\s*{[^}]*logger[^}]*}\s*from\s*['"]firebase-functions['"]/.test(content);
  if (importsLogger) {
    // Remove local logger declarations
    const localLoggerPattern = /^(const|let|var)\s+logger\s*=\s*functions\.logger;?\s*$/gm;
    if (localLoggerPattern.test(content)) {
      content = content.replace(localLoggerPattern, '// logger imported from firebase-functions');
      fileChanges++;
    }
  }

  // ==========================================================================
  // FIX 7: Fix admin.firestore.FieldValue usage when FieldValue is imported
  // ==========================================================================
  
  if (hasFieldValueImport || importsFieldValue) {
    // Replace admin.firestore.FieldValue with just FieldValue
    const adminFieldValuePattern = /admin\.firestore\.FieldValue/g;
    if (adminFieldValuePattern.test(content)) {
      content = content.replace(adminFieldValuePattern, 'FieldValue');
      fileChanges++;
    }
  }

  // ==========================================================================
  // FIX 8: Fix functions.https.HttpsError when HttpsError is imported
  // ==========================================================================
  
  if (importsHttpsError) {
    // Replace functions.https.HttpsError with just HttpsError
    const functionsHttpsErrorPattern = /functions\.https\.HttpsError/g;
    if (functionsHttpsErrorPattern.test(content)) {
      content = content.replace(functionsHttpsErrorPattern, 'HttpsError');
      fileChanges++;
    }
    
    // Also replace new functions.https.HttpsError
    const newFunctionsHttpsErrorPattern = /new\s+functions\.https\.HttpsError/g;
    if (newFunctionsHttpsErrorPattern.test(content)) {
      content = content.replace(newFunctionsHttpsErrorPattern, 'new HttpsError');
      fileChanges++;
    }
  }

  // Write back if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalFilesModified++;
    totalChanges += fileChanges;
    console.log(`✅ Fixed ${relativePath} (${fileChanges} changes)`);
  }
}

// Main execution
console.log('🔧 Starting comprehensive batch fix...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

for (const file of files) {
  try {
    fixFile(file);
  } catch (err) {
    console.error(`❌ Error processing ${file}: ${err.message}`);
  }
}

console.log(`\n✅ Complete! Modified ${totalFilesModified} files with ${totalChanges} total changes.`);
