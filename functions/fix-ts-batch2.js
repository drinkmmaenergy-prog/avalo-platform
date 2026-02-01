/**
 * TypeScript Fix Batch 2 - Fix TS2693 type-as-value errors
 * 
 * These errors occur when a type alias is used as a runtime value.
 * The fix is to convert `type X = ...` to `const X = ...` for values,
 * or to use the actual value instead of the type.
 */

const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

// Files with TS2693 errors and their fixes
const fixes = [
  // pack411-store-reviews-ingestion.ts - DEFAULT_TAG_PATTERNS
  {
    file: 'pack411-store-reviews-ingestion.ts',
    search: /type\s+DEFAULT_TAG_PATTERNS\s*=\s*\{/,
    replace: 'const DEFAULT_TAG_PATTERNS: Record<string, RegExp[]> = {'
  },
  
  // pack413-kpi-command-center.ts - STANDARD_METRIC_IDS
  {
    file: 'pack413-kpi-command-center.ts',
    search: /type\s+STANDARD_METRIC_IDS\s*=\s*\{/,
    replace: 'const STANDARD_METRIC_IDS = {'
  },
  
  // pack414-integration-audit.ts - AvaloIntegrationRegistry, getGreenlightStatus, CRITICAL_LAUNCH_REQUIREMENTS
  {
    file: 'pack414-integration-audit.ts',
    search: /type\s+AvaloIntegrationRegistry\s*=\s*\{/g,
    replace: 'const AvaloIntegrationRegistry: Record<string, any> = {'
  },
  {
    file: 'pack414-integration-audit.ts',
    search: /type\s+getGreenlightStatus\s*=/,
    replace: 'const getGreenlightStatus ='
  },
  {
    file: 'pack414-integration-audit.ts',
    search: /type\s+CRITICAL_LAUNCH_REQUIREMENTS\s*=\s*\[/,
    replace: 'const CRITICAL_LAUNCH_REQUIREMENTS: string[] = ['
  },
  
  // pack416-audit-integration.ts - CRITICAL_FEATURES
  {
    file: 'pack416-audit-integration.ts',
    search: /type\s+CRITICAL_FEATURES\s*=\s*\[/,
    replace: 'const CRITICAL_FEATURES: string[] = ['
  },
  
  // pack418-compliance.service.ts - multiple type-as-value
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+getRevenueSplit\s*=/,
    replace: 'const getRevenueSplit ='
  },
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+validateSplit\s*=/,
    replace: 'const validateSplit ='
  },
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+TOKEN_PAYOUT_RATE_PLN\s*=/,
    replace: 'const TOKEN_PAYOUT_RATE_PLN ='
  },
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+AGE_MINIMUM_YEARS\s*=/,
    replace: 'const AGE_MINIMUM_YEARS ='
  },
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+REQUIRE_SELFIE_VERIFICATION_FOR_EARNING\s*=/,
    replace: 'const REQUIRE_SELFIE_VERIFICATION_FOR_EARNING ='
  },
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+REQUIRE_SELFIE_FOR_MEETINGS_AND_EVENTS\s*=/,
    replace: 'const REQUIRE_SELFIE_FOR_MEETINGS_AND_EVENTS ='
  },
  {
    file: 'pack418-compliance.service.ts',
    search: /type\s+CONTENT_POLICY\s*=\s*\{/,
    replace: 'const CONTENT_POLICY: Record<string, any> = {'
  },
  
  // pack418-integration-examples.ts
  {
    file: 'pack418-integration-examples.ts',
    search: /type\s+getRevenueSplit\s*=/g,
    replace: 'const getRevenueSplit ='
  },
  {
    file: 'pack418-integration-examples.ts',
    search: /type\s+TOKEN_PAYOUT_RATE_PLN\s*=/g,
    replace: 'const TOKEN_PAYOUT_RATE_PLN ='
  },
  
  // pack435-creator-events.ts - TicketTier, AttendeeStatus
  {
    file: 'pack435-creator-events.ts',
    search: /type\s+TicketTier\s*=\s*\{/,
    replace: 'const TicketTier: Record<string, any> = {'
  },
  
  // pack435-event-billing.ts - AttendeeStatus
  {
    file: 'pack435-event-billing.ts',
    search: /type\s+AttendeeStatus\s*=\s*\{/,
    replace: 'const AttendeeStatus = {'
  },
  
  // pack435-speed-dating-engine.ts - AttendeeStatus
  {
    file: 'pack435-speed-dating-engine.ts',
    search: /type\s+AttendeeStatus\s*=\s*\{/,
    replace: 'const AttendeeStatus = {'
  }
];

let totalFixes = 0;

for (const fix of fixes) {
  const filePath = path.join(srcDir, fix.file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${fix.file}`);
    continue;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  if (fix.search instanceof RegExp) {
    if (fix.search.global) {
      content = content.replace(fix.search, fix.replace);
    } else {
      content = content.replace(fix.search, fix.replace);
    }
  } else {
    content = content.replace(fix.search, fix.replace);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Fixed: ${fix.file}`);
    totalFixes++;
  }
}

console.log(`\nTotal fixes applied: ${totalFixes}`);
