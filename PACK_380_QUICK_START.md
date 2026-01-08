# 🚀 PACK 380 — Quick Start Guide

**Global PR, Influencer, Media & Brand Expansion Engine**

This guide will get PACK 380 up and running in under 30 minutes.

---

## 📋 Prerequisites

- ✅ Firebase project configured
- ✅ Firebase CLI installed (`npm install -g firebase-tools`)
- ✅ Admin access to Firebase Console
- ✅ PACK 277, 280, 293, 296, 300, 301, 302, 378, 379 deployed

---

## ⚡ Quick Deployment

### Step 1: Deploy Backend Functions (5 min)

```bash
# Deploy all PACK 380 functions
firebase deploy --only functions:createPressRelease
firefox deploy --only functions:distributePressRelease
firebase deploy --only functions:pressMonitoringDaemon
firebase deploy --only functions:addPressMention
firebase deploy --only functions:addPressContact

firebase deploy --only functions:submitInfluencerApplication
firebase deploy --only functions:reviewInfluencerApplication
firebase deploy --only functions:trackInfluencerEvent
firebase deploy --only functions:getInfluencerDashboard
firebase deploy --only functions:processInfluencerPayouts
firebase deploy --only functions:updateInfluencerTier

firebase deploy --only functions:uploadBrandAsset
firebase deploy --only functions:getBrandAssets
firebase deploy --only functions:scanBrandCompliance
firebase deploy --only functions:createBrandGuideline
firebase deploy --only functions:getBrandStyleGuide
firebase deploy --only functions:initializeDefaultGuidelines

firebase deploy --only functions:createLocalizedPressPack
firebase deploy --only functions:getLocalizedCreatorMaterials
firebase deploy --only functions:createLocalizedPitchDeck
firebase deploy --only functions:initializeRegionConfig
firebase deploy --only functions:getMarketExpansionAnalysis
firebase deploy --only functions:addTranslationGlossaryTerm
firebase deploy --only functions:getAvailableRegions
firebase deploy --only functions:getBrandAuditHistory
```

Or deploy all at once:
```bash
firebase deploy --only functions
```

### Step 2: Deploy Security Rules (2 min)

```bash
firebase deploy --only firestore:rules
```

This deploys [`firestore-pack380-pr.rules`](./firestore-pack380-pr.rules)

### Step 3: Deploy Indexes (2 min)

```bash
firebase deploy --only firestore:indexes
```

This deploys [`firestore-pack380-pr.indexes.json`](./firestore-pack380-pr.indexes.json)

### Step 4: Enable Feature Flags (1 min)

Open Firebase Console and create these documents in the `featureFlags` collection:

```javascript
// Document ID: pr.engine.enabled
{ enabled: true }

// Document ID: influencer.engine.enabled
{ enabled: true }

// Document ID: brand.audit.enabled
{ enabled: true }

// Document ID: crisis.pr.enabled
{ enabled: true }

// Document ID: localization.pr.enabled
{ enabled: true }
```

Or via CLI:
```bash
# Create a script to set flags
node -e "
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const flags = [
  'pr.engine.enabled',
  'influencer.engine.enabled',
  'brand.audit.enabled',
  'crisis.pr.enabled',
  'localization.pr.enabled'
];

Promise.all(flags.map(flag => 
  db.collection('featureFlags').doc(flag).set({ enabled: true })
)).then(() => console.log('Feature flags enabled'));
"
```

---

## 🎬 Initialize System (10 min)

### 1. Initialize Brand Guidelines

Call the initialization function:

```bash
curl -X POST https://your-region-your-project.cloudfunctions.net/initializeDefaultGuidelines \
  -H "Authorization: Bearer $(firebase auth:token)" \
  -H "Content-Type: application/json"
```

This creates default guidelines for:
- Logo usage
- Safety-first language
- Required disclaimers

### 2. Configure Regions

Add your launch regions:

```bash
# Configure US region
curl -X POST https://your-region-your-project.cloudfunctions.net/initializeRegionConfig \
  -H "Authorization: Bearer $(firebase auth:token)" \
  -H "Content-Type: application/json" \
  -d '{
    "region": "US",
    "languages": ["en", "es"],
    "primaryLanguage": "en",
    "legalRequirements": ["18+ disclaimer", "Terms of Service"],
    "launchStatus": "launched"
  }'

# Configure EU region
curl -X POST https://your-region-your-project.cloudfunctions.net/initializeRegionConfig \
  -H "Authorization: Bearer $(firebase auth:token)" \
  -H "Content-Type: application/json" \
  -d '{
    "region": "EU",
    "languages": ["en", "de", "fr", "es", "it"],
    "primaryLanguage": "en",
    "legalRequirements": ["GDPR compliance", "18+ disclaimer"],
    "launchStatus": "launched"
  }'
```

### 3. Add First Press Contact

```bash
curl -X POST https://your-region-your-project.cloudfunctions.net/addPressContact \
  -H "Authorization: Bearer $(firebase auth:token)" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Tech Reporter",
    "email": "reporter@techpub.com",
    "organization": "Tech Publication",
    "role": "Senior Editor",
    "regions": ["global"],
    "topics": ["tech", "dating", "creator-economy"],
    "tier": "tier2"
  }'
```

### 4. Upload Brand Assets

```bash
# Upload logo (example - adjust URL)
curl -X POST https://your-region-your-project.cloudfunctions.net/uploadBrandAsset \
  -H "Authorization: Bearer $(firebase auth:token)" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Avalo Primary Logo",
    "type": "logo",
    "category": "brand-identity",
    "fileUrl": "https://your-storage.com/logo-primary.svg",
    "fileSize": 12345,
    "mimeType": "image/svg+xml",
    "usage": ["press", "web", "app"],
    "regions": ["global"],
    "languages": ["all"],
    "tags": ["logo", "primary", "official"],
    "version": "1.0"
  }'
```

---

## ✅ Verify Installation

### Test 1: Create Press Release

```javascript
const functions = firebase.functions();

// Test creating a press release
const result = await functions.httpsCallable('createPressRelease')({
  title: 'Avalo Launches Revolutionary Dating Feature',
  type: 'feature',
  tone: 'premium',
  autoGenerate: true,
  targetRegions: ['global'],
  languages: ['en'],
  context: {
    featureName: 'AI Matchmaking 2.0',
    featureDescription: 'Advanced AI algorithms for better connections',
    spokesperson: 'CEO Name',
    spokespersonTitle: 'CEO & Founder'
  }
});

console.log('Press Release Created:', result.data.pressReleaseId);
```

### Test 2: Submit Influencer Application

```javascript
const result = await functions.httpsCallable('submitInfluencerApplication')({
  applicantName: 'Test Influencer',
  email: 'test@example.com',
  followerCount: 50000,
  niche: ['lifestyle', 'dating'],
  regions: ['US'],
  motivation: 'I love Avalo and want to share it with my audience',
  socialHandles: {
    instagram: '@testinfluencer',
    tiktok: '@testinfluencer'
  }
});

console.log('Application ID:', result.data.applicationId);
```

### Test 3: Check Brand Style Guide

```javascript
const result = await functions.httpsCallable('getBrandStyleGuide')();
console.log('Style Guide:', result.data.styleGuide);
```

### Test 4: Get Market Analysis

```javascript
const result = await functions.httpsCallable('getMarketExpansionAnalysis')();
console.log('Market Opportunities:', result.data.analysis);
```

---

## 🎯 Next Steps

### For PR Team

1. **Add Media Contacts**
   - Import your media database
   - Categorize by tier (1, 2, 3)
   - Tag by topic and region

2. **Create PR Campaigns**
   - Plan quarterly campaigns
   - Prepare press release templates
   - Schedule distribution

3. **Set Up Monitoring**
   - Configure monitoring sources
   - Set alert thresholds
   - Define crisis triggers

### For Influencer Team

1. **Review Applications**
   - Check pending applications
   - Conduct background checks
   - Approve/reject applicants

2. **Onboard Influencers**
   - Send welcome materials
   - Assign tier levels
   - Generate referral codes

3. **Track Performance**
   - Monitor daily metrics
   - Identify top performers
   - Adjust tier levels

### For Brand Team

1. **Upload Assets**
   - Logo variations
   - Color palettes
   - Typography files
   - Templates

2. **Define Guidelines**
   - Visual standards
   - Messaging rules
   - Legal requirements
   - Regional adaptations

3. **Enable Compliance Scanning**
   - Configure auto-scan
   - Set violation alerts
   - Train content teams

### For Localization Team

1. **Add Glossary Terms**
   - Brand terminology
   - Legal phrases
   - Technical terms
   - Marketing slogans

2. **Configure Regions**
   - Add new markets
   - Set cultural notes
   - Define taboo topics
   - List local partners

3. **Create Localized Materials**
   - Press packs
   - Pitch decks
   - Training guides
   - Success stories

---

## 📊 Monitoring

### Check System Health

```bash
# View Cloud Function logs
firebase functions:log --only pack380-pr-engine
firebase functions:log --only pack380-influencer-engine
firebase functions:log --only pack380-brand-engine
firebase functions:log --only pack380-localization-engine

# Check scheduled functions
firebase functions:log --only pressMonitoringDaemon
firebase functions:log --only processInfluencerPayouts
```

### Key Metrics to Watch

**PR Metrics:**
- Daily press mentions
- Sentiment scores
- Coverage in top-tier media
- Response rates

**Influencer Metrics:**
- Active influencer count
- Weekly signups via referrals
- Average LTV per referral
- Monthly payout totals

**Brand Metrics:**
- Compliance scan pass rate
- Asset download counts
- Guideline violations

**Localization Metrics:**
- Active regions
- Translation coverage
- Regional performance

---

## 🆘 Troubleshooting

### Functions Not Deploying

```bash
# Check Node version (should be 18+)
node --version

# Reinstall dependencies
cd functions
npm install
cd ..

# Try deploying one function at a time
firebase deploy --only functions:createPressRelease
```

### Rules Not Working

```bash
# Validate rules syntax
firebase firestore:rules:validate firestore-pack380-pr.rules

# Check for conflicts
firebase firestore:rules:get
```

### Indexes Not Creating

```bash
# Check index status in console
firebase firestore:indexes

# Create indexes manually via console if needed
# Firebase Console > Firestore > Indexes
```

### Feature Flags Not Enabled

```javascript
// Check flag in Firestore console
// Collection: featureFlags
// Document: pr.engine.enabled
// Field: enabled = true

// Or query via code
const flagDoc = await db.collection('featureFlags')
  .doc('pr.engine.enabled')
  .get();
console.log('Flag status:', flagDoc.data());
```

---

## 🔗 Related Documentation

- [Full Documentation](./PACK_380_GLOBAL_PR_AND_INFLUENCER_ENGINE.md) - Complete system reference
- [Admin Dashboard](./admin-web/pr/README.md) - Web interface guide
- [PACK 379](./PACK_379_QUICK_START.md) - Crisis management integration
- [PACK 277](./docs/PACK_277.md) - Payment integration
- [PACK 302](./docs/PACK_302.md) - Fraud detection integration

---

## 📞 Support

- **Documentation**: Full docs in [`PACK_380_GLOBAL_PR_AND_INFLUENCER_ENGINE.md`](./PACK_380_GLOBAL_PR_AND_INFLUENCER_ENGINE.md)
- **Code**: Function implementations in [`functions/src/pack380-*.ts`](./functions/src/)
- **Rules**: Security rules in [`firestore-pack380-pr.rules`](./firestore-pack380-pr.rules)
- **Indexes**: Composite indexes in [`firestore-pack380-pr.indexes.json`](./firestore-pack380-pr.indexes.json)

---

## ✨ Success!

You're now ready to scale Avalo globally with:

✅ **Automated PR Distribution** - Reach media worldwide  
✅ **Influencer Partnerships** - Organic growth engine  
✅ **Brand Consistency** - Professional standards  
✅ **Global Localization** - 42+ languages  
✅ **Crisis Management** - Reputation protection  

**PACK 379** protects reputation **inside** stores.  
**PACK 380** builds reputation **outside** stores.

Together, they form Avalo's complete growth and defense system.

---

**Version:** 1.0  
**Last Updated:** 2025-12-23  
**Status:** ✅ Ready for Production
