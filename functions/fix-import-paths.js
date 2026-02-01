/**
 * Fix incorrect import paths for stubs
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const filesToFix = [
  'chats.ts',
  'creatorStore.ts',
  'deviceTrust.ts',
  'globalFeed.ts',
  'live.ts',
  'loyalty.ts',
  'media.ts',
  'notifications.ts',
  'payments.ts',
  'paymentsComplete.ts',
  'presence.ts',
  'realtimeEngine.ts',
  'recommender.ts',
  'middleware/teamPermissions.ts',
];

for (const file of filesToFix) {
  const fullPath = path.join(srcDir, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Fix incorrect paths
  content = content.replace(/from ['"]\.\/src\/lib\/stubs['"]/g, "from './lib/stubs'");
  content = content.replace(/from ['"]\.\.\/src\/lib\/stubs['"]/g, "from '../lib/stubs'");
  
  fs.writeFileSync(fullPath, content);
  console.log(`✅ Fixed import paths in ${file}`);
}

console.log('\n✅ Import path fix complete!');
