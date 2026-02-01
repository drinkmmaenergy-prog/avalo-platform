const fs = require('fs');
const path = require('path');

// Find all .ts files in src directory
function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Add index signature to interfaces that don't have one
function addIndexSignatures(content) {
  let modified = false;
  
  // Match interface declarations and add index signature if missing
  const interfaceRegex = /export\s+interface\s+(\w+)(?:\s+extends\s+[^{]+)?\s*\{([^}]*)\}/g;
  
  content = content.replace(interfaceRegex, (match, name, body) => {
    // Skip if already has index signature
    if (body.includes('[key: string]') || body.includes('[key:string]')) {
      return match;
    }
    
    // Skip empty interfaces
    if (body.trim() === '') {
      return match;
    }
    
    // Add index signature before closing brace
    modified = true;
    const trimmedBody = body.trimEnd();
    const lastChar = trimmedBody.slice(-1);
    const needsSemicolon = lastChar !== ';' && lastChar !== ',' && trimmedBody.length > 0;
    
    return match.replace(body + '}', body + (needsSemicolon ? ';' : '') + '\n  [key: string]: any;\n}');
  });
  
  return { content, modified };
}

// Process all files
const srcDir = path.join(__dirname, 'src');
const files = findTsFiles(srcDir);

let totalFixed = 0;
const fixedFiles = [];

for (const file of files) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const result = addIndexSignatures(content);
    
    if (result.modified) {
      fs.writeFileSync(file, result.content);
      fixedFiles.push(path.relative(srcDir, file));
      totalFixed++;
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
}

console.log(`Fixed ${totalFixed} files:`);
fixedFiles.forEach(f => console.log(`  ${f}`));
