/**
 * Fix index.ts duplicate export conflicts
 * 
 * Strategy: For each conflicting export, we'll comment out the later
 * export * statements that cause the conflict.
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'src', 'index.ts');
let content = fs.readFileSync(indexPath, 'utf8');

// Map of conflicting exports and which module should "win"
// Based on the error messages, we'll keep the first occurrence
const conflictingModules = {
  // Module that exports the conflicting name -> should be commented out
  // We'll comment out the LATER modules that conflict
  
  // ModerationAction: adminPanel wins, aiModeration loses
  './aiModeration': ['ModerationAction'],
  
  // detectToxicity: aiModeration wins (first), later module loses
  // RiskLevel: aiOversight wins
  // ContentType: aiOversight wins
  // getModerationQueue: adminPanel wins
  // resolveReport: brands/brandModeration wins
  
  // These modules have conflicts and should be handled
};

// List of modules that have duplicate exports - we'll convert them to explicit imports
const modulesWithConflicts = [
  // These are the modules that appear in TS2308 errors
  // We need to identify which exports conflict and handle them
];

// For now, let's take a simpler approach:
// Add a comment at the top explaining the issue and use a different strategy

// The cleanest fix is to NOT use export * for modules that have type exports
// that conflict with other modules. Instead, we'll create a wrapper that
// explicitly exports only the functions (not types).

// Let's identify all the export * statements and their line numbers
const exportStarRegex = /^export \* from ['"]([^'"]+)['"];?$/gm;
const exports = [];
let match;
while ((match = exportStarRegex.exec(content)) !== null) {
  exports.push({
    line: content.substring(0, match.index).split('\n').length,
    module: match[1],
    fullMatch: match[0]
  });
}

console.log(`Found ${exports.length} export * statements`);

// Now let's identify which modules export conflicting names
// Based on the build errors, these are the problematic modules:
const problematicExports = [
  { module: './aiModeration', conflicts: ['ModerationAction', 'detectToxicity', 'getModerationStats'] },
  { module: './aiOversight', conflicts: ['RiskLevel', 'ContentType'] },
  { module: './brands/brandModeration', conflicts: ['resolveReport'] },
  { module: './chatSystemNextGen', conflicts: ['MessageTemplate'] },
  { module: './creatorHub', conflicts: ['CreatorWithdrawal', 'requestWithdrawal', 'getCreatorDashboard', 'CreatorLevel'] },
  { module: './creatorMode', conflicts: ['CreatorStats'] },
  { module: './creatorShop', conflicts: ['ProductStatus', 'ProductType'] },
  { module: './accelerator', conflicts: ['completeMentorshipSession', 'applyToAccelerator', 'reviewAcceleratorApplication'] },
  { module: './feed', conflicts: ['getGlobalFeedV1'] },
  { module: './api/health', conflicts: ['health'] },
  { module: './live', conflicts: ['LiveSession', 'LiveSessionStatus', 'LiveTip'] },
  { module: './enforcementEndpoints', conflicts: ['enforcement_getState'] },
  { module: './leaderboardApi', conflicts: ['markNotificationRead'] },
  { module: './notificationApi', conflicts: ['getNotificationSettings', 'updateNotificationSettings'] },
  { module: './events', conflicts: ['createEvent', 'joinEvent', 'updateEvent', 'checkInToEvent'] },
  { module: './api/featureFlags', conflicts: ['healthCheck'] },
  { module: './callable/team/inviteTeamMember', conflicts: ['inviteTeamMember'] },
  { module: './callable/team/updateTeamMemberRole', conflicts: ['updateTeamMemberRole'] },
  { module: './pack114-analytics-api', conflicts: ['getAgencyDashboard'] },
  { module: './ambassador/ambassador.functions', conflicts: ['applyForAmbassador'] },
  { module: './education/education.functions', conflicts: ['issueCertificate', 'purchaseCourse'] },
  { module: './liveBroadcasts', conflicts: ['createLiveStream', 'endLiveStream', 'startLiveStream'] },
  { module: './pack214-functions', conflicts: ['onUserCreated', 'onWishlistAdd'] },
  { module: './pack-230-endpoints', conflicts: ['submitMeetingFeedback', 'dismissSuggestion'] },
  { module: './creatorEarnings', conflicts: ['recordEarning'] },
  { module: './pack258-supporterAnalytics', conflicts: ['onTokenSpending'] },
  { module: './pack257-creatorDashboard', conflicts: ['actOnSuggestion'] },
  { module: './legalAcceptance', conflicts: ['acceptLegalDocuments'] },
  { module: './feedDiscovery', conflicts: ['getFeed'] },
  { module: './pack113-api-endpoints', conflicts: ['deletePost'] },
  { module: './content/engagementEngine', conflicts: ['createComment', 'deleteComment'] },
  { module: './content/safetyReporting', conflicts: ['reportContent'] },
  { module: './notifications/functions', conflicts: ['cleanupOldNotifications', 'markAllNotificationsRead'] },
  { module: './globalFeed', conflicts: ['FeedPost'] },
  { module: './lib/alerting', conflicts: ['acknowledgeAlert', 'getRecentAlerts'] },
];

// Strategy: Comment out the export * statements for modules that have conflicts
// and add explicit named exports for just the functions (not types)

// For now, let's just comment out the problematic export * statements
// and add a note that they need manual resolution

let fixCount = 0;

// Find and comment out duplicate export * statements
// We'll keep track of which modules we've seen
const seenModules = new Set();
const lines = content.split('\n');
const newLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const exportMatch = line.match(/^export \* from ['"]([^'"]+)['"];?$/);
  
  if (exportMatch) {
    const moduleName = exportMatch[1];
    
    // Check if this module has conflicts
    const hasConflict = problematicExports.some(p => p.module === moduleName);
    
    if (hasConflict && seenModules.has(moduleName)) {
      // This is a duplicate - comment it out
      newLines.push(`// DUPLICATE: ${line}`);
      fixCount++;
    } else {
      seenModules.add(moduleName);
      newLines.push(line);
    }
  } else {
    newLines.push(line);
  }
}

content = newLines.join('\n');

// Write the fixed content
fs.writeFileSync(indexPath, content);

console.log(`Fixed ${fixCount} duplicate export statements`);
console.log('Note: Some TS2308 errors may remain due to type conflicts.');
console.log('These require manual resolution by using explicit named exports.');
