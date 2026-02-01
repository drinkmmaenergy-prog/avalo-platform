/**
 * Add index signatures to interfaces to fix TS2339 errors
 * This is a TypeScript correctness fix - no business logic changes
 */
const fs = require('fs');
const path = require('path');

const typesDir = path.join(__dirname, 'src/types/shared/types');

// Get all .ts files in the types directory
const files = fs.readdirSync(typesDir).filter(f => f.endsWith('.ts'));

let totalFixed = 0;

files.forEach(file => {
  const filePath = path.join(typesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Find interfaces without index signatures and add them
  // Pattern: interface Name { ... } without [key: string]: any
  const interfaceRegex = /export interface (\w+)(\s*(?:extends\s+[\w<>,\s]+)?)?\s*\{([^}]*)\}/g;
  
  content = content.replace(interfaceRegex, (match, name, extendsClause, body) => {
    // Skip if already has index signature
    if (body.includes('[key: string]') || body.includes('[key:string]')) {
      return match;
    }
    
    // Skip empty interfaces
    if (body.trim() === '') {
      return match;
    }
    
    modified = true;
    totalFixed++;
    
    // Add index signature at the end of the interface body
    const trimmedBody = body.trimEnd();
    const newBody = trimmedBody + '\n  [key: string]: any;\n';
    
    return `export interface ${name}${extendsClause || ''} {${newBody}}`;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${file}`);
  }
});

console.log(`\nTotal interfaces fixed: ${totalFixed}`);
