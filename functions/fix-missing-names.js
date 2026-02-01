/**
 * Fix TS2304 errors by adding missing imports
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Map of missing names to their import sources
const importMap = {
  'getFeatureFlag': { from: './lib/stubs', named: true },
  'getCached': { from: './lib/stubs', named: true },
  'invalidateCacheByTags': { from: './lib/stubs', named: true },
  'containsBannedTerms': { from: './lib/stubs', named: true },
  'moderateImage': { from: './lib/stubs', named: true },
  'moderateVideo': { from: './lib/stubs', named: true },
  'logServerEvent': { from: './lib/stubs', named: true },
  'broadcastToUsers': { from: './lib/stubs', named: true },
  'broadcastToUser': { from: './lib/stubs', named: true },
  'getStripeSecretKey': { from: './lib/stubs', named: true },
  'getStripeWebhookSecret': { from: './lib/stubs', named: true },
  'sgMail': { from: './lib/stubs', named: true },
  'CallableRequest': { from: './lib/stubs', named: true },
};

// Files and their missing imports
const fileFixes = {
  'chats.ts': ['containsBannedTerms'],
  'creatorStore.ts': ['getFeatureFlag'],
  'deviceTrust.ts': ['getFeatureFlag'],
  'globalFeed.ts': ['getCached', 'invalidateCacheByTags'],
  'live.ts': ['logServerEvent'],
  'loyalty.ts': ['logServerEvent'],
  'media.ts': ['moderateImage', 'moderateVideo'],
  'notifications.ts': ['sgMail'],
  'payments.ts': ['getStripeSecretKey', 'getStripeWebhookSecret'],
  'paymentsComplete.ts': ['logServerEvent'],
  'presence.ts': ['getFeatureFlag', 'broadcastToUsers', 'broadcastToUser'],
  'realtimeEngine.ts': ['getFeatureFlag'],
  'recommender.ts': ['getFeatureFlag'],
  'middleware/teamPermissions.ts': ['CallableRequest'],
};

function getRelativePath(fromFile, toModule) {
  const fromDir = path.dirname(fromFile);
  let relativePath = path.relative(fromDir, path.join(srcDir, toModule.replace('./', '')));
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  return relativePath.replace(/\\/g, '/');
}

function addImports(filePath, imports) {
  const fullPath = path.join(srcDir, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️ File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Group imports by source
  const importsBySource = {};
  for (const imp of imports) {
    const info = importMap[imp];
    if (!info) {
      console.log(`⚠️ No import info for: ${imp}`);
      continue;
    }
    const source = getRelativePath(filePath, info.from);
    if (!importsBySource[source]) {
      importsBySource[source] = [];
    }
    importsBySource[source].push(imp);
  }

  // Check if imports already exist
  for (const [source, names] of Object.entries(importsBySource)) {
    const importRegex = new RegExp(`from ['"]${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (importRegex.test(content)) {
      // Import from this source exists, check if names are included
      const existingImportMatch = content.match(new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
      if (existingImportMatch) {
        const existingNames = existingImportMatch[1].split(',').map(n => n.trim());
        const newNames = names.filter(n => !existingNames.includes(n));
        if (newNames.length > 0) {
          const allNames = [...existingNames, ...newNames].join(', ');
          content = content.replace(existingImportMatch[0], `import { ${allNames} } from '${source}'`);
          console.log(`✅ Added ${newNames.join(', ')} to existing import in ${filePath}`);
        }
      }
    } else {
      // Add new import statement after existing imports
      const importStatement = `import { ${names.join(', ')} } from '${source}';\n`;
      
      // Find the last import statement
      const lastImportMatch = content.match(/^import .+;?\s*$/gm);
      if (lastImportMatch) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        const lastImportIndex = content.lastIndexOf(lastImport) + lastImport.length;
        content = content.slice(0, lastImportIndex) + '\n' + importStatement + content.slice(lastImportIndex);
      } else {
        // No imports, add at the beginning
        content = importStatement + content;
      }
      console.log(`✅ Added import for ${names.join(', ')} in ${filePath}`);
    }
  }

  fs.writeFileSync(fullPath, content);
}

// Process all files
for (const [file, imports] of Object.entries(fileFixes)) {
  addImports(file, imports);
}

console.log('\n✅ Missing imports fix complete!');
