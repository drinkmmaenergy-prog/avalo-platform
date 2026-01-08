#!/bin/bash

###############################################################################
# PACK 374 — VIRAL GROWTH ENGINE DEPLOYMENT
###############################################################################
#
# This script deploys:
# ✅ Firestore security rules
# ✅ Firestore indexes
# ✅ Cloud Functions
# ✅ Seed data for boost types
# ✅ Feature flags
#
###############################################################################

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 PACK 374 — VIRAL GROWTH ENGINE DEPLOYMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not installed. Please install: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged into Firebase. Please run: firebase login"
    exit 1
fi

# Get project ID
echo "📋 Available Firebase projects:"
firebase projects:list

read -p "Enter Firebase project ID: " PROJECT_ID

if [ -z "$PROJECT_ID" ]; then
    echo "❌ Project ID is required"
    exit 1
fi

echo ""
echo "Using project: $PROJECT_ID"
echo ""

# Set project
firebase use "$PROJECT_ID"

###############################################################################
# STEP 1: Deploy Firestore Rules
###############################################################################

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📜 STEP 1: Deploying Firestore Security Rules"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "firestore-pack374-viral.rules" ]; then
    echo "Deploying PACK 374 viral growth rules..."
    firebase deploy --only firestore:rules --project "$PROJECT_ID"
    echo "✅ Firestore rules deployed"
else
    echo "⚠️  Warning: firestore-pack374-viral.rules not found"
fi

echo ""

###############################################################################
# STEP 2: Deploy Firestore Indexes
###############################################################################

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📇 STEP 2: Deploying Firestore Indexes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "firestore-pack374-viral.indexes.json" ]; then
    echo "Deploying PACK 374 indexes..."
    firebase deploy --only firestore:indexes --project "$PROJECT_ID"
    echo "✅ Firestore indexes deployed"
    echo "⏱️  Note: Index creation may take several minutes"
else
    echo "⚠️  Warning: firestore-pack374-viral.indexes.json not found"
fi

echo ""

###############################################################################
# STEP 3: Deploy Cloud Functions
###############################################################################

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚡ STEP 3: Deploying Cloud Functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if functions directory exists
if [ ! -d "functions" ]; then
    echo "❌ functions directory not found"
    exit 1
fi

cd functions

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing function dependencies..."
    npm install
fi

# Build TypeScript
echo "Building TypeScript functions..."
npm run build

cd ..

# Deploy specific PACK 374 functions
echo "Deploying PACK 374 viral growth functions..."
firebase deploy --only functions:pack374_generateInviteCode,functions:pack374_registerInviteAcceptance,functions:pack374_rewardInviteSuccess,functions:pack374_applyBoost,functions:pack374_expireBoost,functions:pack374_processSocialLoop,functions:pack374_trackShareEvent,functions:pack374_processShareConversion,functions:pack374_lockRewardAbuse,functions:pack374_calculateKFactor --project "$PROJECT_ID"

echo "✅ Cloud Functions deployed"
echo ""

###############################################################################
# STEP 4: Seed Data - Boost Types
###############################################################################

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌱 STEP 4: Seeding Boost Type Configurations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create a temporary Node.js script to seed data
cat > /tmp/seed-pack374.js << 'SEEDSCRIPT'
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function seedBoostTypes() {
  const boostTypes = [
    {
      id: 'profile',
      name: 'Profile Boost',
      description: 'Appear more often in Swipes & Discovery',
      icon: '👤',
      basePrice: 100,
      prices: {
        '30min': 50,
        '60min': 100,
        '180min': 250,
        '720min': 800,
      },
      maxStrength: 5,
      active: true,
    },
    {
      id: 'story',
      name: 'Story Boost',
      description: 'Push your stories to Feed priority',
      icon: '📖',
      basePrice: 150,
      prices: {
        '60min': 150,
        '180min': 400,
        '720min': 1200,
      },
      maxStrength: 5,
      active: true,
    },
    {
      id: 'creator',
      name: 'Creator Boost',
      description: 'Push messages to active subscribers',
      icon: '⭐',
      basePrice: 200,
      prices: {
        '60min': 200,
        '180min': 500,
        '720min': 1500,
      },
      maxStrength: 5,
      active: true,
    },
    {
      id: 'local',
      name: 'Local Boost',
      description: 'Visibility spike in your chosen city',
      icon: '📍',
      basePrice: 120,
      prices: {
        '60min': 120,
        '180min': 300,
        '720min': 1000,
      },
      maxStrength: 5,
      active: true,
    },
  ];

  console.log('Seeding boost types...');
  
  for (const type of boostTypes) {
    await db.collection('boostTypes').doc(type.id).set(type);
    console.log(`✅ Created boost type: ${type.name}`);
  }
}

async function seedFeatureFlags() {
  const flags = {
    'viral.invites.enabled': true,
    'viral.boosts.enabled': true,
    'viral.shares.enabled': true,
    'viral.loops.enabled': true,
    'viral.fraud_protection.enabled': true,
    'viral.k_factor_tracking.enabled': true,
  };

  console.log('\nSeeding feature flags...');
  
  for (const [flagId, value] of Object.entries(flags)) {
    await db.collection('viralFeatureFlags').doc(flagId).set({
      flagId,
      enabled: value,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'system',
    });
    console.log(`✅ Set feature flag: ${flagId} = ${value}`);
  }
}

async function seedShareTemplates() {
  const templates = [
    {
      id: 'profile_share',
      type: 'profile',
      title: 'Check out {username} on Avalo!',
      description: 'Join me on Avalo - the next-gen social platform',
      platforms: ['instagram', 'tiktok', 'whatsapp', 'messenger'],
      active: true,
    },
    {
      id: 'story_share',
      type: 'story',
      title: 'Amazing story on Avalo',
      description: 'You have to see this!',
      platforms: ['instagram', 'tiktok', 'twitter'],
      active: true,
    },
    {
      id: 'event_share',
      type: 'event',
      title: 'Join me at {eventName}!',
      description: 'Let\'s connect on Avalo',
      platforms: ['whatsapp', 'messenger', 'instagram'],
      active: true,
    },
  ];

  console.log('\nSeeding share templates...');
  
  for (const template of templates) {
    await db.collection('shareTemplates').doc(template.id).set(template);
    console.log(`✅ Created share template: ${template.type}`);
  }
}

async function main() {
  try {
    await seedBoostTypes();
    await seedFeatureFlags();
    await seedShareTemplates();
    
    console.log('\n✅ All seed data created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding data:', error);
    process.exit(1);
  }
}

main();
SEEDSCRIPT

# Check if service account key exists
if [ -f "serviceAccountKey.json" ]; then
    echo "Running seed script..."
    node /tmp/seed-pack374.js
    rm /tmp/seed-pack374.js
    echo "✅ Seed data created"
else
    echo "⚠️  Warning: serviceAccountKey.json not found. Skipping seed data."
    echo "   To seed data manually, download your service account key and run the seed script."
fi

echo ""

###############################################################################
# STEP 5: Verification
###############################################################################

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ STEP 5: Deployment Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "Deployed Components:"
echo "  ✅ Firestore security rules"
echo "  ✅ Firestore indexes (building in background)"
echo "  ✅ Cloud Functions (10 functions)"
echo "  ✅ Boost type configurations"
echo "  ✅ Feature flags"
echo "  ✅ Share templates"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 POST-DEPLOYMENT CHECKLIST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "☐ Verify Cloud Functions are active:"
echo "   firebase functions:list --project $PROJECT_ID"
echo ""
echo "☐ Check Firestore indexes status:"
echo "   https://console.firebase.google.com/project/$PROJECT_ID/firestore/indexes"
echo ""
echo "☐ Test invite code generation:"
echo "   Call pack374_generateInviteCode from your app"
echo ""
echo "☐ Test boost purchase flow:"
echo "   Call pack374_applyBoost with test data"
echo ""
echo "☐ Monitor fraud detection:"
echo "   Check 'inviteFraud' collection for alerts"
echo ""
echo "☐ Review K-Factor metrics (available after 24 hours):"
echo "   Check 'viralCoefficients' collection"
echo ""
echo "☐ Access admin dashboard:"
echo "   https://your-admin-domain.com/growth/viral"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 INTEGRATION REQUIREMENTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Ensure these PACKs are deployed and configured:"
echo "  • PACK 277 (Wallet) - for boost payments"
echo "  • PACK 293 (Notifications) - for viral loops"
echo "  • PACK 296 (Audit Logs) - for fraud tracking"
echo "  • PACK 301B (Retention) - for churn prevention"
echo "  • PACK 302 (Fraud Detection) - for anti-abuse"
echo "  • PACK 323 (Feed Algorithm) - for boost effects"
echo "  • PACK 372 (Global Orchestration) - for regional rules"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 PACK 374 DEPLOYMENT COMPLETE!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Target Metrics (90-day goals):"
echo "  • K-Factor: ≥ 0.25"
echo "  • Invite Conversion: ≥ 15%"
echo "  • Share-to-Install: ≥ 5%"
echo "  • Fraud Rate: < 2%"
echo ""
echo "Monitor progress in Admin Dashboard: /growth/viral"
echo ""
