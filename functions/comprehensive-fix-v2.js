/**
 * COMPREHENSIVE FIX V2 - Final stabilization script
 * Addresses all TypeScript compilation errors systematically
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
let totalFixes = 0;
let filesModified = 0;

function getAllTsFiles(dir) {
  const files = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files.push(...getAllTsFiles(fullPath));
      } else if (item.name.endsWith('.ts') && !item.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory doesn't exist
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const fixes = [];
  const relativePath = path.relative(srcDir, filePath);
  const fileName = path.basename(filePath);

  // Skip init.ts and runtime.ts - they are the source of truth
  if (fileName === 'init.ts' || fileName === 'runtime.ts') {
    return false;
  }

  // ============================================
  // FIX 1: Remove duplicate imports of same identifier from different sources
  // ============================================
  
  // Track what's imported from where
  const importedIdentifiers = new Map(); // identifier -> first source
  
  // Find all import statements
  const importRegex = /import\s*{([^}]+)}\s*from\s*(['"][^'"]+['"])/g;
  let match;
  const importsToRemove = [];
  
  while ((match = importRegex.exec(content)) !== null) {
    const identifiers = match[1].split(',').map(i => i.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const source = match[2];
    
    for (const id of identifiers) {
      if (importedIdentifiers.has(id)) {
        // This identifier is already imported from another source
        importsToRemove.push({ identifier: id, source, fullMatch: match[0] });
      } else {
        importedIdentifiers.set(id, source);
      }
    }
  }
  
  // Remove duplicate identifiers from imports
  for (const dup of importsToRemove) {
    const regex = new RegExp(
      `import\\s*{([^}]*\\b${dup.identifier}\\b[^}]*)}\\s*from\\s*${dup.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
      'g'
    );
    content = content.replace(regex, (match, imports) => {
      const importList = imports.split(',')
        .map(i => i.trim())
        .filter(i => {
          const name = i.split(/\s+as\s+/)[0].trim();
          return name && name !== dup.identifier;
        });
      if (importList.length > 0) {
        return `import { ${importList.join(', ')} } from ${dup.source}`;
      }
      return '';
    });
    fixes.push(`Removed duplicate import of ${dup.identifier}`);
  }

  // ============================================
  // FIX 2: Fix Timestamp imports from './init' -> './runtime'
  // ============================================
  if (/import\s*{[^}]*\bTimestamp\b[^}]*}\s*from\s*['"]\.\.?\/init['"]/.test(content)) {
    // Change Timestamp import from init to runtime
    content = content.replace(
      /import\s*{([^}]*)}\s*from\s*(['"])(\.\.?\/init)\2/g,
      (match, imports, quote, initPath) => {
        const importList = imports.split(',').map(i => i.trim());
        const hasTimestamp = importList.some(i => i === 'Timestamp' || i.startsWith('Timestamp '));
        
        if (hasTimestamp) {
          const withoutTimestamp = importList.filter(i => i !== 'Timestamp' && !i.startsWith('Timestamp '));
          const runtimePath = initPath.replace('/init', '/runtime');
          
          let result = '';
          if (withoutTimestamp.length > 0) {
            result = `import { ${withoutTimestamp.join(', ')} } from ${quote}${initPath}${quote}`;
          }
          
          // Check if Timestamp is already imported from runtime
          if (!content.includes(`Timestamp } from ${quote}${runtimePath}${quote}`) &&
              !content.includes(`Timestamp, `) && 
              !content.includes(`, Timestamp`)) {
            if (result) result += '\n';
            result += `import { Timestamp } from ${quote}${runtimePath}${quote}`;
          }
          
          return result;
        }
        return match;
      }
    );
    fixes.push('Fixed Timestamp import to use runtime');
  }

  // ============================================
  // FIX 3: Add missing Timestamp import where used but not imported
  // ============================================
  const usesTimestamp = /\bTimestamp\b/.test(content);
  const hasTimestampImport = /import\s*{[^}]*\bTimestamp\b[^}]*}\s*from/.test(content);
  const hasTimestampDeclaration = /(?:const|let|var|type|interface|class)\s+Timestamp\b/.test(content);
  
  if (usesTimestamp && !hasTimestampImport && !hasTimestampDeclaration) {
    // Add Timestamp import from runtime
    const runtimeImportMatch = content.match(/import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/runtime)\2/);
    if (runtimeImportMatch) {
      // Add to existing runtime import
      const existingImports = runtimeImportMatch[1];
      if (!existingImports.includes('Timestamp')) {
        content = content.replace(
          runtimeImportMatch[0],
          `import { ${existingImports.trim()}, Timestamp } from ${runtimeImportMatch[2]}${runtimeImportMatch[3]}${runtimeImportMatch[2]}`
        );
        fixes.push('Added Timestamp to runtime import');
      }
    } else {
      // Check for init import
      const initImportMatch = content.match(/import\s*{([^}]+)}\s*from\s*(['"])(\.\.?\/init)\2/);
      if (initImportMatch) {
        // Add runtime import after init import
        const runtimePath = initImportMatch[3].replace('/init', '/runtime');
        content = content.replace(
          initImportMatch[0],
          `${initImportMatch[0]}\nimport { Timestamp } from ${initImportMatch[2]}${runtimePath}${initImportMatch[2]}`
        );
        fixes.push('Added Timestamp import from runtime');
      } else {
        // Add new import at top
        const firstImport = content.match(/^import\s/m);
        if (firstImport) {
          content = content.slice(0, firstImport.index) + 
            `import { Timestamp } from './runtime';\n` + 
            content.slice(firstImport.index);
          fixes.push('Added Timestamp import from runtime');
        }
      }
    }
  }

  // ============================================
  // FIX 4: Fix Zod .error pattern -> .success pattern
  // ============================================
  // Pattern: validationResult.error -> !validationResult.success
  content = content.replace(
    /if\s*\(\s*(\w+)\.error\s*\)\s*\{([^}]*throw\s+new\s+HttpsError\s*\([^)]*)[^}]*\}/g,
    (match, varName, throwPart) => {
      // Extract the error message part
      const errorMsgMatch = throwPart.match(/HttpsError\s*\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/);
      if (errorMsgMatch) {
        const errorCode = errorMsgMatch[1];
        let errorMsg = errorMsgMatch[2].trim();
        // Replace .error.message with .error?.message
        if (errorMsg.includes('.error.message')) {
          errorMsg = errorMsg.replace(/(\w+)\.error\.message/g, '$1.error?.message');
        }
        return `if (!${varName}.success) {\n    throw new HttpsError('${errorCode}', ${errorMsg});\n  }`;
      }
      return match;
    }
  );

  // Also fix standalone .error access
  content = content.replace(
    /(\w+)\.error\.message/g,
    '$1.error?.message'
  );
  
  // Fix pattern: throw new HttpsError(..., validationResult.error.message)
  content = content.replace(
    /throw\s+new\s+HttpsError\s*\(\s*(['"][^'"]+['"]),\s*(\w+)\.error\.message\s*\)/g,
    (match, code, varName) => {
      return `throw new HttpsError(${code}, ${varName}.error?.message || 'Validation failed')`;
    }
  );

  // ============================================
  // FIX 5: Fix missing module imports (../../shared/...)
  // ============================================
  // Replace with inline type definitions or stubs
  if (content.includes("from '../../shared/src/types/calendar'")) {
    content = content.replace(
      /import\s*{[^}]+}\s*from\s*['"]\.\.\/\.\.\/shared\/src\/types\/calendar['"];?\n?/g,
      `// Calendar types (inline stub)\ninterface CalendarEvent { id: string; title: string; startTime: Date; endTime: Date; }\ninterface CalendarSlot { start: Date; end: Date; available: boolean; }\n`
    );
    fixes.push('Replaced shared/calendar import with inline types');
  }

  // Fix ./firebase import
  if (content.includes("from './firebase'")) {
    content = content.replace(
      /import\s*{[^}]+}\s*from\s*['"]\.\/firebase['"];?\n?/g,
      ''
    );
    fixes.push('Removed ./firebase import');
  }

  // ============================================
  // FIX 6: Clean up empty imports and multiple newlines
  // ============================================
  content = content.replace(/import\s*{\s*}\s*from\s*['"][^'"]+['"];\s*\n?/g, '');
  content = content.replace(/\n{3,}/g, '\n\n');

  // ============================================
  // FIX 7: Fix duplicate type declarations
  // ============================================
  // Remove duplicate interface/type declarations
  const typeDeclarations = new Set();
  content = content.replace(
    /^(export\s+)?(interface|type)\s+(\w+)\s*[{=]/gm,
    (match, exportKw, keyword, name) => {
      if (typeDeclarations.has(name)) {
        // Comment out duplicate
        return `// DUPLICATE: ${match}`;
      }
      typeDeclarations.add(name);
      return match;
    }
  );

  // Write back if changed
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    filesModified++;
    totalFixes += fixes.length;
    if (fixes.length > 0) {
      console.log(`✅ ${relativePath}: ${fixes.join(', ')}`);
    }
    return true;
  }
  return false;
}

// ============================================
// FIX SPECIFIC PROBLEMATIC FILES
// ============================================

function fixSpecificFiles() {
  console.log('\n🔧 Fixing specific problematic files...\n');
  
  // Fix pack441/types.ts - make it a proper module
  const pack441TypesPath = path.join(srcDir, 'pack441', 'types.ts');
  if (fs.existsSync(pack441TypesPath)) {
    let content = fs.readFileSync(pack441TypesPath, 'utf8');
    if (!content.includes('export ')) {
      // Add export to make it a module
      content = content.replace(/^(interface|type|const|enum)\s+/gm, 'export $1 ');
      fs.writeFileSync(pack441TypesPath, content, 'utf8');
      console.log('✅ pack441/types.ts: Added exports to make it a module');
      filesModified++;
    }
  }

  // Fix pack441/ViralLoopRiskScorer.ts
  const viralLoopPath = path.join(srcDir, 'pack441', 'ViralLoopRiskScorer.ts');
  if (fs.existsSync(viralLoopPath)) {
    let content = fs.readFileSync(viralLoopPath, 'utf8');
    if (!content.includes('export ')) {
      content = content.replace(/^(class|function|const|interface|type)\s+/gm, 'export $1 ');
      fs.writeFileSync(viralLoopPath, content, 'utf8');
      console.log('✅ pack441/ViralLoopRiskScorer.ts: Added exports');
      filesModified++;
    }
  }

  // Fix pack442/pricingElasticityModel.ts
  const pricingPath = path.join(srcDir, 'pack442', 'pricingElasticityModel.ts');
  if (fs.existsSync(pricingPath)) {
    let content = fs.readFileSync(pricingPath, 'utf8');
    if (!content.includes('export ')) {
      content = content.replace(/^(class|function|const|interface|type)\s+/gm, 'export $1 ');
      fs.writeFileSync(pricingPath, content, 'utf8');
      console.log('✅ pack442/pricingElasticityModel.ts: Added exports');
      filesModified++;
    }
  }

  // Fix pack435-event-types.ts
  const eventTypesPath = path.join(srcDir, 'pack435-event-types.ts');
  if (fs.existsSync(eventTypesPath)) {
    let content = fs.readFileSync(eventTypesPath, 'utf8');
    if (!content.includes('export ')) {
      content = content.replace(/^(interface|type|const|enum)\s+/gm, 'export $1 ');
      fs.writeFileSync(eventTypesPath, content, 'utf8');
      console.log('✅ pack435-event-types.ts: Added exports');
      filesModified++;
    }
  }

  // Fix leaderboardScheduled.ts - add missing onSchedule import
  const leaderboardScheduledPath = path.join(srcDir, 'leaderboardScheduled.ts');
  if (fs.existsSync(leaderboardScheduledPath)) {
    let content = fs.readFileSync(leaderboardScheduledPath, 'utf8');
    if (!content.includes("import { onSchedule }") && !content.includes("onSchedule }")) {
      // Add onSchedule import
      const firstImport = content.match(/^import\s/m);
      if (firstImport) {
        content = content.slice(0, firstImport.index) + 
          `import { onSchedule } from 'firebase-functions/v2/scheduler';\n` + 
          content.slice(firstImport.index);
        fs.writeFileSync(leaderboardScheduledPath, content, 'utf8');
        console.log('✅ leaderboardScheduled.ts: Added onSchedule import');
        filesModified++;
      }
    }
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

console.log('🔧 Starting COMPREHENSIVE FIX V2...\n');

const files = getAllTsFiles(srcDir);
console.log(`Found ${files.length} TypeScript files\n`);

// First pass: fix all files
for (const file of files) {
  fixFile(file);
}

// Second pass: fix specific problematic files
fixSpecificFiles();

console.log(`\n✅ Complete: ${filesModified} files modified, ${totalFixes} total fixes applied`);
