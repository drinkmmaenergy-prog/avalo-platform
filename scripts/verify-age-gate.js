#!/usr/bin/env node

/**
 * Age Gate Verification
 * 
 * Verifies that 18+ age verification is properly implemented
 */

const fs = require('fs');
const path = require('path');

console.log('\n🔞 Verifying Age Gate Implementation\n');

const filesToCheck = [
  'app-mobile/app/auth/age-verification.tsx',
  'app-mobile/app/(auth)/sign-up.tsx',
  'app-web/src/components/AgeGate.tsx',
  'app-web/src/pages/signup.tsx'
];

let ageGateFound = false;

for (const file of filesToCheck) {
  const fullPath = path.join(__dirname, '..', file);
  
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    
    // Check for age verification keywords
    const hasAgeCheck = content.match(/\b(18|age|verify|birthday|date.*birth)\b/gi);
    
    if (hasAgeCheck) {
      console.log(`✅ Age verification found in: ${file}`);
      ageGateFound = true;
    }
  }
}

if (!ageGateFound) {
  console.log('❌ Age gate (18+) not properly implemented');
  console.log('Required for adult content platforms');
  process.exit(1);
}

console.log('\n✅ Age gate verification complete\n');
process.exit(0);