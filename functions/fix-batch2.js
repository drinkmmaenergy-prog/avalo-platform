/**
 * Batch 2 - Fix duplicate imports and type-as-value errors
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
let totalChanges = 0;
const changedFiles = new Set();

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  changedFiles.add(filePath);
}

function processFile(filePath) {
  let content = readFile(filePath);
  if (!content) return;
  
  const originalContent = content;
  const fileName = path.basename(filePath);
  
  // Fix 1: Remove duplicate 'import * as functions' lines
  const functionsImportCount = (content.match(/import \* as functions from ['"]firebase-functions['"]/g) || []).length;
  if (functionsImportCount > 1) {
    // Keep only the first one
    let found = false;
    content = content.replace(/import \* as functions from ['"]firebase-functions['"];?\n?/g, (match) => {
      if (!found) {
        found = true;
        return match;
      }
      return '';
    });
    console.log(`  Removed duplicate functions import in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 2: Remove duplicate routeRegion definitions
  const routeRegionCount = (content.match(/function routeRegion/g) || []).length;
  if (routeRegionCount > 1) {
    let found = false;
    content = content.replace(/\n\/\/ Helper function for region routing\nfunction routeRegion\(userId: string\): string \{\n  \/\/ Default to us-central1, can be extended for geo-routing\n  return 'us-central1';\n\}\n/g, (match) => {
      if (!found) {
        found = true;
        return match;
      }
      return '';
    });
    console.log(`  Removed duplicate routeRegion in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 3: Fix routeRegion import conflict - remove import if we have local definition
  if (content.includes('function routeRegion') && content.includes("import { routeRegion }")) {
    content = content.replace(/import \{ routeRegion \} from ['"][^'"]+['"];?\n?/g, '');
    console.log(`  Removed conflicting routeRegion import in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 4: Convert KpiEventType type to const object where used as value
  if (content.includes('KpiEventType.') && content.includes('type KpiEventType =')) {
    content = content.replace(
      /type KpiEventType = [^;]+;/g,
      `const KpiEventType = {
  REVENUE: 'REVENUE',
  ENGAGEMENT: 'ENGAGEMENT', 
  CONVERSION: 'CONVERSION',
  RETENTION: 'RETENTION',
  GROWTH: 'GROWTH',
  SAFETY: 'SAFETY',
  QUALITY: 'QUALITY',
  FRAUD: 'FRAUD',
  PERFORMANCE: 'PERFORMANCE',
  USER_ACQUISITION: 'USER_ACQUISITION',
  MONETIZATION: 'MONETIZATION',
  CONTENT: 'CONTENT',
  SOCIAL: 'SOCIAL',
  SUPPORT: 'SUPPORT'
} as const;
type KpiEventTypeValue = typeof KpiEventType[keyof typeof KpiEventType];`
    );
    console.log(`  Fixed KpiEventType type-as-value in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 5: Convert DEFAULT_REVENUE_BY_VERTICAL type to const
  if (content.includes('DEFAULT_REVENUE_BY_VERTICAL') && content.match(/type DEFAULT_REVENUE_BY_VERTICAL/)) {
    content = content.replace(
      /type DEFAULT_REVENUE_BY_VERTICAL = [^;]+;/g,
      `const DEFAULT_REVENUE_BY_VERTICAL = {
  dating: 0,
  creator: 0,
  ai: 0,
  social: 0
} as const;`
    );
    console.log(`  Fixed DEFAULT_REVENUE_BY_VERTICAL in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 6: Convert DEFAULT_FRAUD_BY_SEVERITY type to const
  if (content.includes('DEFAULT_FRAUD_BY_SEVERITY') && content.match(/type DEFAULT_FRAUD_BY_SEVERITY/)) {
    content = content.replace(
      /type DEFAULT_FRAUD_BY_SEVERITY = [^;]+;/g,
      `const DEFAULT_FRAUD_BY_SEVERITY = {
  low: 0,
  medium: 0,
  high: 0,
  critical: 0
} as const;`
    );
    console.log(`  Fixed DEFAULT_FRAUD_BY_SEVERITY in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 7: Fix SubscriptionTier/UserSubscription/SubscriptionSource type-as-value
  if (content.includes('SubscriptionTier.') && content.includes('type SubscriptionTier =')) {
    content = content.replace(
      /type SubscriptionTier = [^;]+;/g,
      `const SubscriptionTier = {
  FREE: 'FREE',
  BASIC: 'BASIC',
  PREMIUM: 'PREMIUM',
  VIP: 'VIP',
  CREATOR: 'CREATOR',
  ENTERPRISE: 'ENTERPRISE'
} as const;
type SubscriptionTierValue = typeof SubscriptionTier[keyof typeof SubscriptionTier];`
    );
    console.log(`  Fixed SubscriptionTier in ${fileName}`);
    totalChanges++;
  }
  
  if (content.includes('SubscriptionSource.') && content.includes('type SubscriptionSource =')) {
    content = content.replace(
      /type SubscriptionSource = [^;]+;/g,
      `const SubscriptionSource = {
  STRIPE: 'STRIPE',
  APPLE: 'APPLE',
  GOOGLE: 'GOOGLE',
  MANUAL: 'MANUAL'
} as const;
type SubscriptionSourceValue = typeof SubscriptionSource[keyof typeof SubscriptionSource];`
    );
    console.log(`  Fixed SubscriptionSource in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 8: Remove conflicting db import when db is already imported from init
  if (content.includes("from './init'") && content.match(/import \{ db \} from ['"][^'"]*runtime['"]/)) {
    content = content.replace(/import \{ db \} from ['"][^'"]*runtime['"];?\n?/g, '');
    console.log(`  Removed conflicting db import in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 9: Remove conflicting logger import
  if (content.includes("const logger =") && content.includes("import { logger }")) {
    content = content.replace(/import \{ logger \} from ['"][^'"]+['"];?\n?/g, '');
    console.log(`  Removed conflicting logger import in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 10: Remove conflicting storage import
  if (content.includes("const storage =") && content.includes("import { storage }")) {
    content = content.replace(/import \{ storage \} from ['"][^'"]+['"];?\n?/g, '');
    console.log(`  Removed conflicting storage import in ${fileName}`);
    totalChanges++;
  }
  
  // Fix 11: Remove conflicting auth import
  if (content.includes("const auth =") && content.includes("import { auth }")) {
    content = content.replace(/import \{ auth \} from ['"][^'"]+['"];?\n?/g, '');
    console.log(`  Removed conflicting auth import in ${fileName}`);
    totalChanges++;
  }
  
  // Write if changed
  if (content !== originalContent) {
    writeFile(filePath, content);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      processFile(filePath);
    }
  }
}

console.log('Starting batch 2 fixes...\n');
walkDir(srcDir);

console.log(`\n=== Summary ===`);
console.log(`Total changes: ${totalChanges}`);
console.log(`Files modified: ${changedFiles.size}`);
changedFiles.forEach(f => console.log(`  - ${path.relative(srcDir, f)}`));
