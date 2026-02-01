/**
 * BATCH B Migration Script - Pass 2
 * 
 * Fixes:
 * 1. Files where onSchedule was used but not imported
 * 2. Remaining v1 pubsub.schedule patterns
 */

const fs = require('fs');
const path = require('path');

// Files with remaining schedule errors
const filesToFix = [
  // Files with "Cannot find name 'onSchedule'" - need import fix
  'src/pack104-scheduled.ts',
  'src/pack186-ai-evolution-schedulers.ts',
  'src/pack237-breakup-recovery-scheduled.ts',
  'src/pack335-support-scheduled.ts',
  'src/pack424-store-reviews.scheduler.ts',
  'src/pack90-scheduled.ts',
  
  // Files with remaining v1 patterns
  'src/climate/index.ts',
  'src/compliancePack55.ts',
  'src/pack115-reputation-endpoints.ts',
  'src/pack130-endpoints.ts',
  'src/pack148-scheduled.ts',
  'src/pack164-accelerator.ts',
  'src/pack167-affiliates.ts',
  'src/pack187-multilingual.ts',
  'src/pack193-sexuality-consent-functions.ts',
  'src/pack200-auto-heal-runtime.ts',
  'src/pack215-viral-loop.ts',
  'src/pack238-chat-motivation.ts',
  'src/pack245-audience-segments-engine.ts',
  'src/pack261-notifications.ts',
  'src/pack262-creator-levels.ts',
  'src/pack296-data-retention.ts',
  'src/pack301-analytics.ts',
  'src/pack301-daily-churn.ts',
  'src/pack301-winback.ts',
  'src/pack306-verification.ts',
  'src/pack336-aggregation-cron.ts',
  'src/pack344-ai-helpers.ts',
  'src/pack346-churn-engine.ts',
  'src/pack346-creator-kpi.ts',
  'src/pack348-ranking-engine/index.ts',
  'src/pack349-endpoints.ts',
  'src/pack352-daily-aggregator.ts',
  'src/pack356-ad-attribution.ts',
  'src/pack356-kpi-extensions.ts',
  'src/pack356-roas-engine.ts',
  'src/pack359-creator-tax-statements.ts',
  'src/pack359-dsa-reports.ts',
  'src/pack359-gdpr-retention.ts',
  'src/pack361-cost-control.ts',
  'src/pack361-failover.ts',
  'src/pack361-monitoring.ts',
  'src/pack374-viral-growth.ts',
  'src/pack376-app-store-defense.ts',
  'src/pack380-influencer-engine.ts',
  'src/pack382-burnout-prevention.ts',
  'src/pack382-pricing-recommender.ts',
  'src/pack382-skill-scoring.ts',
  'src/pack383-payout-limits.ts',
  'src/pack383-tax-engine.ts',
  'src/pack384-aso-monitor.ts',
  'src/pack384-paid-review-detection.ts',
  'src/pack384-review-defense.ts',
  'src/pack384-store-policy-monitor.ts',
  'src/pack384-trust-score.ts',
  'src/pack386-attribution.ts',
  'src/pack386-budget-guardian.ts',
  'src/pack386-campaigns.ts',
  'src/pack386-influencers.ts',
  'src/pack386-marketing-fraud.ts',
  'src/pack387-influencer-risk.ts',
  'src/pack387-store-shield.ts',
  'src/pack395-invoicing.ts',
  'src/pack397-review-intelligence.ts',
  'src/pack411-reputation-defense.ts',
  'src/pack414-integration-audit.ts',
  'src/pack424-aso.service.ts',
  'src/pack424-trust-score.service.ts',
  'src/pack436-reputation-engine.ts',
  'src/pack436-review-boost.ts',
  'src/pack436-review-defense.ts',
  'src/pack448-incident-functions.ts',
  'src/scheduled/aggregateInvestorMetrics.ts',
  'src/scheduled/secondChanceScan.ts',
  'src/triggers/chemistryLockInTriggers.ts',
];

let totalFixed = 0;

function getRelativeRuntimePath(filePath) {
  const depth = filePath.split('/').length - 2;
  if (depth === 0) return './runtime';
  return '../'.repeat(depth) + 'runtime';
}

function fixFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return false;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const originalContent = content;
  let fixed = false;
  
  const runtimePath = getRelativeRuntimePath(filePath);
  
  // Step 1: Convert any remaining v1 patterns
  // Pattern with timeZone
  content = content.replace(
    /(\w+\.)?pubsub\s*\.\s*schedule\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*timeZone\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>/g,
    (match, prefix, cron, tz, param) => {
      fixed = true;
      return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) =>`;
    }
  );
  
  // Pattern without timeZone
  content = content.replace(
    /(\w+\.)?pubsub\s*\.\s*schedule\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>/g,
    (match, prefix, cron, param) => {
      fixed = true;
      return `onSchedule("${cron}", async (event) =>`;
    }
  );
  
  // Also handle functions.onSchedule pattern (incorrect v2 usage)
  content = content.replace(
    /functions\s*\.\s*onSchedule\s*\(/g,
    (match) => {
      fixed = true;
      return 'onSchedule(';
    }
  );
  
  // Step 2: Add onSchedule import if it's used but not imported
  if (content.includes('onSchedule(') && !content.match(/import\s*{[^}]*onSchedule[^}]*}\s*from/)) {
    // Check if there's a runtime import we can extend
    const runtimeImportRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${runtimePath.replace(/[./]/g, '\\$&')}['"]`);
    const match = content.match(runtimeImportRegex);
    
    if (match) {
      // Add onSchedule to existing import
      const existingImports = match[1];
      if (!existingImports.includes('onSchedule')) {
        content = content.replace(
          runtimeImportRegex,
          `import { ${existingImports.trim()}, onSchedule } from '${runtimePath}'`
        );
        fixed = true;
      }
    } else {
      // Add new import after existing imports
      const lastImportMatch = content.match(/^import .+$/gm);
      if (lastImportMatch) {
        const lastImport = lastImportMatch[lastImportMatch.length - 1];
        content = content.replace(
          lastImport,
          `${lastImport}\nimport { onSchedule } from '${runtimePath}';`
        );
        fixed = true;
      }
    }
  }
  
  if (fixed && content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  }
  
  return false;
}

console.log('🚀 Starting BATCH B Migration - Pass 2\n');

for (const file of filesToFix) {
  if (fixFile(file)) {
    totalFixed++;
  }
}

console.log(`\n📊 Pass 2 Summary: Fixed ${totalFixed} files`);
