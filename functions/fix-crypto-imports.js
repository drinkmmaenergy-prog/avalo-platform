/**
 * Fix crypto imports - add Node.js crypto import to files using crypto functions
 */
const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/payments.providers.ts',
  'src/paymentsComplete.ts',
  'src/scalingInfrastructure.ts',
  'src/securityLayer.ts',
  'src/securityMiddleware.ts'
];

let totalFixed = 0;

filesToFix.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if crypto is already imported
  if (content.includes("import * as crypto from 'crypto'") || 
      content.includes('import * as crypto from "crypto"') ||
      content.includes("import crypto from 'crypto'") ||
      content.includes('import crypto from "crypto"')) {
    console.log(`${file}: crypto already imported`);
    return;
  }
  
  // Check if file uses crypto
  if (!content.includes('crypto.createHash') && 
      !content.includes('crypto.randomBytes') &&
      !content.includes('crypto.createHmac') &&
      !content.includes('crypto.timingSafeEqual')) {
    console.log(`${file}: no crypto usage found`);
    return;
  }
  
  // Find the first import statement and add crypto import after it
  const importMatch = content.match(/^(import .+;?\n)/m);
  if (importMatch) {
    const insertPos = content.indexOf(importMatch[0]) + importMatch[0].length;
    content = content.slice(0, insertPos) + "import * as crypto from 'crypto';\n" + content.slice(insertPos);
    fs.writeFileSync(filePath, content);
    console.log(`${file}: added crypto import`);
    totalFixed++;
  } else {
    // No imports found, add at the beginning after any comments
    const commentEnd = content.match(/^(\/\*[\s\S]*?\*\/\s*\n?|\/\/.*\n)*/);
    const insertPos = commentEnd ? commentEnd[0].length : 0;
    content = content.slice(0, insertPos) + "import * as crypto from 'crypto';\n\n" + content.slice(insertPos);
    fs.writeFileSync(filePath, content);
    console.log(`${file}: added crypto import at beginning`);
    totalFixed++;
  }
});

console.log(`\nTotal files fixed: ${totalFixed}`);
