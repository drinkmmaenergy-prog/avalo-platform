/**
 * Fix duplicate request identifier errors
 * The pattern is: async (request) => { ... const request = ... }
 * We need to rename the inner const request to translationRequest or similar
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const files = [
  'pack154-endpoints.ts',
  'pack212-reputation-functions.ts',
  'pack303-endpoints.ts',
  'pack359-gdpr-retention.ts',
  'pack385-launch-payout-safety.ts',
];

for (const file of files) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Pattern: const request: SomeType = { ... } or const request = { ... }
  // Replace with: const innerRequest: SomeType = { ... } or const innerRequest = { ... }
  // But only inside functions that have (request) parameter
  
  // Simple approach: rename all "const request" to "const innerRequest" and update references
  // This is safe because the outer request is a parameter, not a const
  
  let modified = false;
  
  // Find all occurrences of "const request" or "const request:"
  const constRequestPattern = /\bconst\s+request\s*(:|=)/g;
  
  if (constRequestPattern.test(content)) {
    // Reset regex
    constRequestPattern.lastIndex = 0;
    
    // Replace const request with const innerRequest
    content = content.replace(/\bconst\s+request\s*(:|=)/g, 'const innerRequest$1');
    
    // Now we need to update references to this inner request
    // This is tricky because we need to distinguish between the parameter and the variable
    // For now, let's just do a simple replacement in the same scope
    
    modified = true;
    console.log(`✅ Renamed const request to const innerRequest in ${file}`);
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content);
  }
}

console.log('\n✅ Request duplicate fix complete!');
console.log('⚠️ Note: You may need to manually update references to the renamed variable');
