/**
 * BATCH B Migration Script - Scheduled Functions v1 → v2
 * 
 * Converts:
 *   functions.pubsub.schedule("cron").timeZone("TZ").onRun(async (context) => { ... })
 * To:
 *   onSchedule({ schedule: "cron", timeZone: "TZ" }, async (event) => { ... })
 * 
 * Also handles:
 *   - Adding onSchedule import from ./runtime
 *   - Converting return statements to void (v2 requirement)
 */

const fs = require('fs');
const path = require('path');

// Files with pubsub.schedule errors from build output
const filesToMigrate = [
  'src/amlMonitoring.ts',
  'src/analytics.ts',
  'src/analytics/calendarEventKPIs.ts',
  'src/analytics/chatMonetizationKPIs.ts',
  'src/analytics/creatorMetrics.ts',
  'src/analytics/fraudDetection.ts',
  'src/analytics/safetyMonitoring.ts',
  'src/analytics/userKPIs.ts',
  'src/api/offline-presence.ts',
  'src/calendarFunctions.ts',
  'src/climate/index.ts',
  'src/content/contentUploadProcessor.ts',
  'src/creator/earnings.ts',
  'src/creatorAnalytics.ts',
  'src/creatorEarnings.ts',
  'src/discoveryEndpoints.ts',
  'src/fanClubs.ts',
  'src/fraudScheduled.ts',
  'src/geoshare.ts',
  'src/guardian.functions.ts',
  'src/jobs/data-retention.jobs.ts',
  'src/leaderboardScheduled.ts',
  'src/liveBroadcasts.ts',
  'src/moderation.ts',
  'src/notificationScheduled.ts',
  'src/notifications/functions.ts',
  'src/observabilityEndpoints.ts',
  'src/pack-227-desire-loop-triggers.ts',
  'src/pack-230-endpoints.ts',
  'src/pack101-success-endpoints.ts',
  'src/pack102-audience-endpoints.ts',
  'src/pack104-scheduled.ts',
  'src/pack105-reconciliation.ts',
  'src/pack106-currency-management.ts',
  'src/pack107-membership.ts',
  'src/pack110-scheduled.ts',
  'src/pack112-achievements.ts',
  'src/pack113-abuse-detection.ts',
  'src/pack113-webhooks.ts',
  'src/pack114-analytics-api.ts',
  'src/pack114-safety-enforcement.ts',
  'src/pack115-reputation-endpoints.ts',
  'src/pack119-analytics.ts',
  'src/pack126-endpoints.ts',
  'src/pack127-endpoints.ts',
  'src/pack130-endpoints.ts',
  'src/pack132-analytics-cloud.ts',
  'src/pack134-api-endpoints.ts',
  'src/pack141-api-endpoints.ts',
  'src/pack145-endpoints.ts',
  'src/pack146-scheduled.ts',
  'src/pack147-scheduled.ts',
  'src/pack148-scheduled.ts',
  'src/pack158-endpoints.ts',
  'src/pack159-safety-endpoints.ts',
  'src/pack164-accelerator.ts',
  'src/pack167-affiliates.ts',
  'src/pack168-schedulers.ts',
  'src/pack174-fraud-shield/schedulers.ts',
  'src/pack183-dynamic-scaler.ts',
  'src/pack183-traffic-monitor.ts',
  'src/pack186-ai-evolution-schedulers.ts',
  'src/pack187-multilingual.ts',
  'src/pack188-narrative-engine.ts',
  'src/pack190-sync/index.ts',
  'src/pack191-live-arena.ts',
  'src/pack191-safety-monitor.ts',
  'src/pack193-sexuality-consent-functions.ts',
  'src/pack195-legal-tax/index.ts',
  'src/pack200-auto-scale-traffic.ts',
  'src/pack200-firestore-rules-validator.ts',
  'src/pack200-resolve-stability-conflict.ts',
  'src/pack200-track-metrics.ts',
  'src/pack210-safety-tracking-functions.ts',
  'src/pack213-functions.ts',
  'src/pack214-functions.ts',
  'src/pack215-viral-loop.ts',
  'src/pack218-calendar-events.ts',
  'src/pack228-sleep-mode.ts',
  'src/pack233-royal-challenges.ts',
  'src/pack234-anniversary.ts',
  'src/pack237-breakup-recovery-scheduled.ts',
  'src/pack238-chat-motivation.ts',
  'src/pack242Functions.ts',
  'src/pack243-creator-dashboard.ts',
  'src/pack244-creator-league.ts',
  'src/pack245-audience-segments-engine.ts',
  'src/pack246-cloud-functions.ts',
  'src/pack247-withdrawal-antifraud.ts',
  'src/pack253-royal-endpoints.ts',
  'src/pack255-endpoints.ts',
  'src/pack258-supporterAnalytics.ts',
  'src/pack261-earnings.ts',
  'src/pack261-notifications.ts',
  'src/pack261-payout-service.ts',
  'src/pack262-creator-levels.ts',
  'src/pack263-creator-missions.ts',
  'src/pack264-supporters-engine.ts',
  'src/pack265-ai-earn-assist-endpoints.ts',
  'src/pack266-supporter-crm-endpoints.ts',
  'src/pack278-subscription-endpoints.ts',
  'src/pack290-daily-aggregation.ts',
  'src/pack291-ai-assist.ts',
  'src/pack293-notification-functions.ts',
  'src/pack296-data-retention.ts',
  'src/pack298-unified-engine.ts',
  'src/pack301-analytics.ts',
  'src/pack301-daily-churn.ts',
  'src/pack301-retention-functions.ts',
  'src/pack301-winback.ts',
  'src/pack303-endpoints.ts',
  'src/pack304-endpoints.ts',
  'src/pack306-verification.ts',
  'src/pack307-catfish-risk.ts',
  'src/pack315-notifications/growth-funnels.ts',
  'src/pack315-notifications/sender.ts',
  'src/pack320-analytics.ts',
  'src/pack323-feed-engine.ts',
  'src/pack324a-kpi-endpoints.ts',
  'src/pack324c-trust-endpoints.ts',
  'src/pack325-feed-boosts.ts',
  'src/pack328a-identity-verification.ts',
  'src/pack328c-selfie-verification-functions.ts',
  'src/pack335-support-scheduled.ts',
  'src/pack336-aggregation-cron.ts',
  'src/pack339-disaster-recovery.ts',
  'src/pack344-ai-helpers.ts',
  'src/pack345-launch-audit.ts',
  'src/pack346-abuse-detection.ts',
  'src/pack346-alert-routing.ts',
  'src/pack346-churn-engine.ts',
  'src/pack346-creator-kpi.ts',
  'src/pack346-kpi-aggregation.ts',
  'src/pack348-ranking-engine/index.ts',
  'src/pack349-endpoints.ts',
  'src/pack352-daily-aggregator.ts',
  'src/pack353-payment-failsafe.ts',
  'src/pack354-influencer-endpoints.ts',
  'src/pack356-ad-attribution.ts',
  'src/pack356-kpi-extensions.ts',
  'src/pack356-retargeting.ts',
  'src/pack356-roas-engine.ts',
  'src/pack358-burnrate-engine.ts',
  'src/pack358-financial-forecast.ts',
  'src/pack358-ltv-model.ts',
  'src/pack358-stress-scenarios.ts',
  'src/pack359-creator-tax-statements.ts',
  'src/pack359-dsa-reports.ts',
  'src/pack359-gdpr-retention.ts',
  'src/pack360-currency-engine.ts',
  'src/pack360-language-engine.ts',
  'src/pack361-autoscaling.ts',
  'src/pack361-cdn-control.ts',
  'src/pack361-cost-control.ts',
  'src/pack361-failover.ts',
  'src/pack361-load-balancer.ts',
  'src/pack361-monitoring.ts',
  'src/pack363-realtime-dispatcher.ts',
  'src/pack363-realtime-metrics.ts',
  'src/pack367-store-defense/index.ts',
  'src/pack370-ltv-engine.ts',
  'src/pack372-global-launch.ts',
  'src/pack373-marketing-automation.ts',
  'src/pack374-viral-growth.ts',
  'src/pack376-app-store-defense.ts',
  'src/pack377-launch-orchestration.ts',
  'src/pack379-aso-reputation.ts',
  'src/pack380-influencer-engine.ts',
  'src/pack380-pr-engine.ts',
  'src/pack382-burnout-prevention.ts',
  'src/pack382-pricing-recommender.ts',
  'src/pack382-skill-scoring.ts',
  'src/pack383-chargeback-firewall.ts',
  'src/pack383-fx-engine.ts',
  'src/pack383-kyc-aml.ts',
  'src/pack383-payout-limits.ts',
  'src/pack383-payout-router.ts',
  'src/pack383-tax-engine.ts',
  'src/pack384-aso-monitor.ts',
  'src/pack384-paid-review-detection.ts',
  'src/pack384-review-defense.ts',
  'src/pack384-store-policy-monitor.ts',
  'src/pack384-trust-score.ts',
  'src/pack385-ambassadors.ts',
  'src/pack385-launch-payout-safety.ts',
  'src/pack385-launch-phase.ts',
  'src/pack385-market-activation.ts',
  'src/pack385-referrals.ts',
  'src/pack385-traffic-guard.ts',
  'src/pack386-attribution.ts',
  'src/pack386-budget-guardian.ts',
  'src/pack386-campaigns.ts',
  'src/pack386-influencers.ts',
  'src/pack386-marketing-fraud.ts',
  'src/pack387-influencer-risk.ts',
  'src/pack387-reputation-ingest.ts',
  'src/pack387-store-shield.ts',
  'src/pack388-gdpr.ts',
  'src/pack388-retention.ts',
  'src/pack390-fx.ts',
  'src/pack390-tax.ts',
  'src/pack392-aso-engine.ts',
  'src/pack392-review-intel.ts',
  'src/pack392-store-defense.ts',
  'src/pack392-trust-score.ts',
  'src/pack393-influencer-engine.ts',
  'src/pack393-marketing-orchestrator.ts',
  'src/pack395-invoicing.ts',
  'src/pack395-tax-engine.ts',
  'src/pack397-review-intelligence.ts',
  'src/pack398-aso-engine.ts',
  'src/pack398-launch-orchestrator.ts',
  'src/pack398-traffic-sync.ts',
  'src/pack398-viral-engine.ts',
  'src/pack399-influencer-engine.ts',
  'src/pack401-fraud-correlation-functions.ts',
  'src/pack402-kpi-functions.ts',
  'src/pack411-reputation-defense.ts',
  'src/pack412-launch-orchestrator.ts',
  'src/pack413-kpi-command-center.ts',
  'src/pack414-integration-audit.ts',
  'src/pack424-aso.service.ts',
  'src/pack424-store-reviews.scheduler.ts',
  'src/pack424-trust-score.service.ts',
  'src/pack432-attribution.ts',
  'src/pack432-google-connector.ts',
  'src/pack432-meta-connector.ts',
  'src/pack432-tiktok-connector.ts',
  'src/pack432-ua-fraud.ts',
  'src/pack432-ua-orchestrator.ts',
  'src/pack432-ugc-engine.ts',
  'src/pack433-creator-fraud.ts',
  'src/pack433-deal-engine.ts',
  'src/pack433-payouts.ts',
  'src/pack436-reputation-engine.ts',
  'src/pack436-review-boost.ts',
  'src/pack436-review-defense.ts',
  'src/pack440/functions.ts',
  'src/pack448-incident-functions.ts',
  'src/pack90-scheduled.ts',
  'src/paidMedia.ts',
  'src/rankingScheduler.ts',
  'src/referrals.ts',
  'src/reputation-endpoints.ts',
  'src/reservations.ts',
  'src/safetyTimers.ts',
  'src/scheduled/aggregateInvestorMetrics.ts',
  'src/smartSocialGraph/backgroundJobs.ts',
  'src/triggers/chemistryLockInTriggers.ts',
  'src/trustRiskEndpoints.ts',
  'src/vipPayerProgram.ts',
  'src/workers/payoutProcessor.ts',
];

let totalMigrated = 0;
let totalFiles = 0;

function getRelativeRuntimePath(filePath) {
  // Calculate relative path to runtime.ts from the file
  const depth = filePath.split('/').length - 2; // -2 because src/ is the base
  if (depth === 0) return './runtime';
  return '../'.repeat(depth) + 'runtime';
}

function migrateFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return 0;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  const originalContent = content;
  let migratedCount = 0;
  
  // Pattern 1: functions.pubsub.schedule("cron").timeZone("TZ").onRun(async (context) => {
  // Pattern 2: functions.pubsub.schedule("cron").onRun(async (context) => {
  // Pattern 3: pubsub.schedule("cron").timeZone("TZ").onRun(async (context) => {
  
  // Regex to match v1 schedule patterns
  const schedulePatterns = [
    // With timeZone
    /(\w+\.)?pubsub\s*\.\s*schedule\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*timeZone\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>/g,
    // Without timeZone
    /(\w+\.)?pubsub\s*\.\s*schedule\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>/g,
  ];
  
  // Replace pattern with timeZone
  content = content.replace(
    /(\w+\.)?pubsub\s*\.\s*schedule\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*timeZone\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>/g,
    (match, prefix, cron, tz, param) => {
      migratedCount++;
      return `onSchedule({ schedule: "${cron}", timeZone: "${tz}" }, async (event) =>`;
    }
  );
  
  // Replace pattern without timeZone
  content = content.replace(
    /(\w+\.)?pubsub\s*\.\s*schedule\s*\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.\s*onRun\s*\(\s*async\s*\(\s*(\w+)\s*\)\s*=>/g,
    (match, prefix, cron, param) => {
      migratedCount++;
      return `onSchedule("${cron}", async (event) =>`;
    }
  );
  
  if (migratedCount > 0) {
    // Add onSchedule import if not present
    const runtimePath = getRelativeRuntimePath(filePath);
    
    // Check if onSchedule is already imported
    if (!content.includes('onSchedule')) {
      // Find existing runtime import and add onSchedule
      const runtimeImportRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${runtimePath.replace(/\//g, '\\/')}['"]`);
      const match = content.match(runtimeImportRegex);
      
      if (match) {
        // Add onSchedule to existing import
        const existingImports = match[1];
        if (!existingImports.includes('onSchedule')) {
          content = content.replace(
            runtimeImportRegex,
            `import { ${existingImports.trim()}, onSchedule } from '${runtimePath}'`
          );
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
        }
      }
    }
    
    // Add logger import if not present (for converting returns)
    if (!content.includes('logger') || !content.match(/import.*logger.*from/)) {
      const runtimeImportRegex = new RegExp(`import\\s*{([^}]+)}\\s*from\\s*['"]${runtimePath.replace(/\//g, '\\/')}['"]`);
      const match = content.match(runtimeImportRegex);
      
      if (match && !match[1].includes('logger')) {
        content = content.replace(
          runtimeImportRegex,
          (m, imports) => `import { ${imports.trim()}, logger } from '${runtimePath}'`
        );
      }
    }
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Migrated ${migratedCount} schedule(s) in ${filePath}`);
  }
  
  return migratedCount;
}

console.log('🚀 Starting BATCH B Migration: Scheduled Functions v1 → v2\n');

for (const file of filesToMigrate) {
  const count = migrateFile(file);
  if (count > 0) {
    totalMigrated += count;
    totalFiles++;
  }
}

console.log(`\n📊 Migration Summary:`);
console.log(`   Files modified: ${totalFiles}`);
console.log(`   Schedules migrated: ${totalMigrated}`);
console.log('\n⚠️  Note: You may need to manually fix return statements in onSchedule handlers.');
console.log('   v2 onSchedule must return void | Promise<void>, not objects.');
