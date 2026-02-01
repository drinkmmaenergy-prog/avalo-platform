/**
 * Fix onSchedule return values for v2 compatibility
 * v2 onSchedule requires handlers to return void | Promise<void>
 * This script converts return statements to logger.info calls
 */

const fs = require('fs');
const path = require('path');

// Files with TS2769 errors related to onSchedule return values
const filesToFix = [
  'src/amlMonitoring.ts',
  'src/fraudScheduled.ts',
  'src/moderation.ts',
  'src/pack-227-desire-loop-triggers.ts',
  'src/pack104-scheduled.ts',
  'src/pack115-reputation-endpoints.ts',
  'src/pack183-dynamic-scaler.ts',
  'src/pack183-traffic-monitor.ts',
  'src/pack186-ai-evolution-schedulers.ts',
  'src/pack193-sexuality-consent-functions.ts',
  'src/pack210-safety-tracking-functions.ts',
  'src/pack234-anniversary.ts',
  'src/pack237-breakup-recovery-scheduled.ts',
  'src/pack243-creator-dashboard.ts',
  'src/pack261-payout-service.ts',
  'src/pack262-creator-levels.ts',
  'src/pack301-daily-churn.ts',
  'src/pack301-retention-functions.ts',
  'src/pack301-winback.ts',
  'src/pack306-verification.ts',
  'src/pack328a-identity-verification.ts',
  'src/pack335-support-scheduled.ts',
  'src/pack336-aggregation-cron.ts',
  'src/pack346-abuse-detection.ts',
  'src/pack346-alert-routing.ts',
  'src/pack346-churn-engine.ts',
  'src/pack346-creator-kpi.ts',
  'src/pack346-kpi-aggregation.ts',
  'src/pack352-daily-aggregator.ts',
  'src/pack356-kpi-extensions.ts',
  'src/pack356-retargeting.ts',
  'src/pack356-roas-engine.ts',
  'src/pack360-currency-engine.ts',
  'src/pack373-marketing-automation.ts',
  'src/pack379-aso-reputation.ts',
  'src/pack388-retention.ts',
  'src/pack399-influencer-engine.ts',
  'src/pack413-kpi-command-center.ts',
  'src/pack424-aso.service.ts',
  'src/pack424-store-reviews.scheduler.ts',
  'src/pack424-trust-score.service.ts',
  'src/pack432-ua-orchestrator.ts',
  'src/pack436-reputation-engine.ts',
  'src/pack436-review-boost.ts',
  'src/pack436-review-defense.ts',
  'src/paidMedia.ts',
  'src/rankingScheduler.ts',
  'src/referrals.ts',
  'src/trustRiskEndpoints.ts',
];

let totalFixed = 0;

filesToFix.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  let fixCount = 0;
  
  // Pattern 1: return { key: value, ... };
  // Replace with: logger.info('Scheduled job result', { key: value, ... });
  
  // Find return statements that return objects (not throw, not return;, not return variable)
  // Pattern: return { ... };
  const returnObjPattern = /(\s+)return\s+(\{[\s\S]*?\});(\s*\n)/g;
  
  content = content.replace(returnObjPattern, (match, indent, obj, trailing) => {
    // Check if this looks like an object literal (has : in it)
    if (obj.includes(':')) {
      fixCount++;
      return `${indent}logger.info('Scheduled job result', ${obj});${trailing}`;
    }
    return match;
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${fixCount} return statements in ${file}`);
    totalFixed += fixCount;
  }
});

console.log(`\nTotal fixed: ${totalFixed} return statements`);
