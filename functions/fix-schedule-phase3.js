/**
 * BATCH B Migration Phase 3: Fix broken schedule patterns
 * The phase 2 script replaced pubsub.schedule but left timeZone/onRun chains
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const filesToFix = [
  'compliancePack55.ts',
  'pack115-reputation-endpoints.ts',
  'pack215-viral-loop.ts',
  'pack245-audience-segments-engine.ts',
  'pack261-notifications.ts',
  'pack262-creator-levels.ts',
  'pack296-data-retention.ts',
  'pack301-analytics.ts',
  'pack301-daily-churn.ts',
  'pack301-winback.ts',
  'pack303-endpoints.ts',
  'pack336-aggregation-cron.ts',
  'pack344-ai-helpers.ts',
  'pack346-churn-engine.ts',
  'pack346-creator-kpi.ts',
  'pack352-daily-aggregator.ts',
  'pack356-ad-attribution.ts',
  'pack356-kpi-extensions.ts',
  'pack356-roas-engine.ts',
  'pack359-creator-tax-statements.ts',
  'pack359-dsa-reports.ts',
  'pack359-gdpr-retention.ts',
  'pack361-cost-control.ts',
  'pack361-failover.ts',
  'pack361-monitoring.ts',
  'pack374-viral-growth.ts',
  'pack380-influencer-engine.ts',
  'pack382-burnout-prevention.ts',
  'pack382-pricing-recommender.ts',
  'pack382-skill-scoring.ts',
  'pack383-payout-limits.ts',
  'pack383-tax-engine.ts',
  'pack387-influencer-risk.ts',
  'pack387-store-shield.ts',
  'pack393-influencer-engine.ts',
  'pack395-invoicing.ts',
  'pack397-review-intelligence.ts',
  'pack411-reputation-defense.ts',
  'pack424-aso.service.ts',
  'pack424-trust-score.service.ts',
  'triggers/chemistryLockInTriggers.ts',
];

function fixFile(relativePath) {
  const filePath = path.join(srcDir, relativePath);
  if (!fs.existsSync(filePath)) {
    console.log(`  Skip (not found): ${relativePath}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  
  // Calculate import path for runtime
  const depth = relativePath.split('/').length - 1;
  const runtimePath = depth > 0 ? '../'.repeat(depth) + 'runtime' : './runtime';
  
  // Pattern: onSchedule('...', followed by .timeZone('...').onRun(...)
  // This indicates the replacement didn't fully work
  // Need to find: onSchedule('schedule',\n.timeZone('tz')\n.onRun(async (ctx) => {
  // and replace with: onSchedule({ schedule: 'schedule', timeZone: 'tz' }, async (ctx) => {
  
  // Match multiline pattern
  const multilinePattern = /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*,?\s*\n?\s*\)\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  
  content = content.replace(multilinePattern, (match, q1, schedule, q2, timezone, params) => {
    const eventParam = params.trim() || 'event';
    return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async (${eventParam}) => {`;
  });
  
  // Also try another pattern: onSchedule('schedule' without closing paren
  const pattern2 = /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*\n?\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  
  content = content.replace(pattern2, (match, q1, schedule, q2, timezone, params) => {
    const eventParam = params.trim() || 'event';
    return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async (${eventParam}) => {`;
  });
  
  // Pattern where just schedule might have a typo 
  // onSchedule('...'\n  .timeZone
  const pattern3 = /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*\n\s*\.timeZone\s*\(\s*(['"`])([^'"`]+)\3\s*\)\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  
  content = content.replace(pattern3, (match, q1, schedule, q2, timezone, params) => {
    const eventParam = params.trim() || 'event';
    return `onSchedule({ schedule: '${schedule}', timeZone: '${timezone}' }, async (${eventParam}) => {`;
  });
  
  // Also fix pattern where timeZone is missing - just .onRun
  const pattern4 = /onSchedule\s*\(\s*(['"`])([^'"`]+)\1\s*,?\s*\)?\s*\n?\s*\.onRun\s*\(\s*async\s*\(([^)]*)\)\s*=>\s*\{/g;
  
  content = content.replace(pattern4, (match, q1, schedule, params) => {
    const eventParam = params.trim() || 'event';
    return `onSchedule('${schedule}', async (${eventParam}) => {`;
  });
  
  // Ensure onSchedule is imported from runtime
  if (content.includes('onSchedule(') && !content.includes("from './runtime'") && !content.includes("from '../runtime'") && !content.includes("from '../../runtime'")) {
    // Add import
    const importLine = `import { onSchedule, logger } from '${runtimePath}';\n`;
    // Find first import or add at top
    const firstImportIndex = content.indexOf('import ');
    if (firstImportIndex >= 0) {
      const nextLineEnd = content.indexOf('\n', firstImportIndex);
      content = content.slice(0, nextLineEnd + 1) + importLine + content.slice(nextLineEnd + 1);
    } else {
      content = importLine + content;
    }
  }
  
  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  Fixed: ${relativePath}`);
    return true;
  }
  
  console.log(`  No changes: ${relativePath}`);
  return false;
}

console.log('Phase 3: Fixing broken schedule patterns');
console.log('='.repeat(60));

let fixed = 0;
filesToFix.forEach(f => {
  if (fixFile(f)) fixed++;
});

console.log(`\nFixed ${fixed} files`);
