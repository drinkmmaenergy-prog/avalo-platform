const fs = require('fs');
const path = require('path');

// Files with request/context issues
const filesToFix = [
  'src/integrations/dataAccess.ts',
  'src/lib/errorTracking.ts',
  'src/pack296-admin-management.ts',
  'src/pack356-ad-tracking.ts',
  'src/pack359-gdpr-retention.ts',
  'src/pack384-store-policy-monitor.ts',
  'src/pack386-influencers.ts',
  'src/pack387-incidents.ts',
  'src/pack392-trust-score.ts',
];

let totalFixed = 0;

for (const file of filesToFix) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${file}`);
    continue;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;
  
  // Check if file has undefined 'request' or 'context' usage
  // These are typically bugs where the variable should be defined in the function scope
  
  // For now, let's just report which files have issues
  const requestMatches = content.match(/\brequest\./g);
  const contextMatches = content.match(/\bcontext\./g);
  
  console.log(`${file}: request=${requestMatches?.length || 0}, context=${contextMatches?.length || 0}`);
}

console.log(`\nTotal files checked: ${filesToFix.length}`);
