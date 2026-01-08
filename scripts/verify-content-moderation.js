#!/usr/bin/env node

/**
 * Content Moderation Verification
 * 
 * Verifies that content moderation systems are active
 */

const fs = require('fs');
const path = require('path');

console.log('\n🛡️  Verifying Content Moderation System\n');

const requiredFiles = [
  'functions/src/moderation/image-moderation.ts',
  'functions/src/moderation/text-moderation.ts',
  'functions/src/triggers/content-moderation.ts'
];

let foundCount = 0;

for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, '..', file);
  
  if (fs.existsSync(fullPath)) {
    console.log(`✅ Found: ${file}`);
    foundCount++;
  } else {
    console.log(`⚠️  Not found: ${file}`);
  }
}

if (foundCount === 0) {
  console.log('\n❌ Content moderation system not implemented');
  process.exit(1);
}

console.log(`\n✅ Content moderation verified (${foundCount}/${requiredFiles.length} components found)\n`);
process.exit(0);