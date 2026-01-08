#!/usr/bin/env node

/**
 * Feature Flags Checker
 * 
 * Verifies feature flag configuration
 * Usage: node scripts/check-feature-flags.js --env=production
 */

const admin = require('firebase-admin');

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const ENVIRONMENT = args.env || 'staging';

const projectMap = {
  dev: 'avalo-dev',
  staging: 'avalo-staging',
  production: 'avalo-c8c46'
};

const PROJECT_ID = projectMap[ENVIRONMENT];

/**
 * Initialize Firebase
 */
const initFirebase = () => {
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: PROJECT_ID,
      credential: admin.credential.applicationDefault()
    });
  }
  return admin.firestore();
};

/**
 * Get feature flags from Firestore
 */
const getFeatureFlags = async (db) => {
  const doc = await db.collection('config').doc('feature_flags').get();
  
  if (!doc.exists) {
    console.log('⚠️  No feature flags document found');
    return null;
  }
  
  return doc.data();
};

/**
 * Validate feature flags
 */
const validateFlags = (flags) => {
  const issues = [];
  
  if (!flags || !flags.flags) {
    issues.push('Feature flags document is missing or malformed');
    return issues;
  }
  
  const requiredFlags = [
    'aiCompanions',
    'videoCalls',
    'calendarPayments',
    'events',
    'refundButtons',
    'panicTracking'
  ];
  
  for (const flag of requiredFlags) {
    if (!(flag in flags.flags)) {
      issues.push(`Missing required flag: ${flag}`);
    }
  }
  
  // Check safety features are enabled
  if (ENVIRONMENT === 'production') {
    if (!flags.flags.refundButtons?.enabled) {
      issues.push('CRITICAL: Refund buttons must be enabled in production');
    }
    if (!flags.flags.panicTracking?.enabled) {
      issues.push('CRITICAL: Panic tracking must be enabled in production');
    }
  }
  
  return issues;
};

/**
 * Main execution
 */
const main = async () => {
  console.log('\n🚩 Feature Flags Check');
  console.log('═'.repeat(50));
  console.log(`Environment: ${ENVIRONMENT}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log('═'.repeat(50) + '\n');

  try {
    const db = initFirebase();
    const flags = await getFeatureFlags(db);
    
    if (!flags) {
      console.log('❌ Feature flags not configured');
      process.exit(1);
    }
    
    console.log('📋 Current Feature Flags:\n');
    console.log(JSON.stringify(flags.flags, null, 2));
    console.log();
    
    // Validate flags
    const issues = validateFlags(flags);
    
    if (issues.length > 0) {
      console.log('❌ Validation Issues:\n');
      issues.forEach(issue => console.log(`  • ${issue}`));
      console.log();
      process.exit(1);
    }
    
    console.log('✅ All feature flags validated successfully');
    
  } catch (error) {
    console.error('\n❌ Check failed:', error.message);
    process.exit(1);
  }
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };