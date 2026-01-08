#!/bin/bash
# PACK 350 - Unified Subscriptions v2 Deployment Script

set -e

echo "🚀 PACK 350 - Unified Subscriptions v2 Deployment"
echo "================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "firebase.json" ]; then
    echo -e "${RED}Error: firebase.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# 1. Deploy Cloud Functions
echo -e "${YELLOW}Step 1: Deploying Cloud Functions...${NC}"
cd functions

# Deploy subscription functions
firebase deploy --only functions:pack350_getMySubscription,functions:pack350_getSubscriptionProducts,functions:pack350_syncStripeSubscription,functions:pack350_syncAppleSubscription,functions:pack350_syncGoogleSubscription,functions:pack350_cancelSubscription,functions:pack350_stripeWebhook,functions:pack350_appleWebhook,functions:pack350_googleWebhook

echo -e "${GREEN}✓ Cloud Functions deployed${NC}"
cd ..

# 2. Create Firestore indexes
echo -e "${YELLOW}Step 2: Creating Firestore indexes...${NC}"

# Create index for userSubscriptions (userId + isActive)
cat > firestore-pack350-indexes.json <<EOF
{
  "indexes": [
    {
      "collectionGroup": "userSubscriptions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "renewsAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "userSubscriptions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tier", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

firebase deploy --only firestore:indexes
echo -e "${GREEN}✓ Firestore indexes created${NC}"

# 3. Create Firestore security rules
echo -e "${YELLOW}Step 3: Creating Firestore security rules...${NC}"

cat > firestore-pack350.rules <<EOF
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // User Subscriptions - Read own, write only via Cloud Functions
    match /userSubscriptions/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false; // Only Cloud Functions can write
    }
    
    // Subscription Products Config - Read only for all authenticated users
    match /system/subscriptionProducts {
      allow read: if request.auth != null;
      allow write: if false; // Only admins via console
    }
  }
}
EOF

firebase deploy --only firestore:rules
echo -e "${GREEN}✓ Firestore rules deployed${NC}"

# 4. Initialize subscription products config
echo -e "${YELLOW}Step 4: Initializing subscription products config...${NC}"

# Note: This should be done manually in Firebase Console or via admin SDK
# Here's the structure to add to /system/subscriptionProducts:

cat > subscription-products-config.json <<EOF
{
  "products": [
    {
      "tier": "FREE",
      "name": "Free",
      "description": "Standard features with no subscription",
      "isVisibleOnWeb": true,
      "isVisibleOnMobile": true
    },
    {
      "tier": "VIP",
      "name": "VIP",
      "description": "30% off voice and video calls",
      "monthlyPriceDisplay": "$9.99/month",
      "stripePriceId": "price_vip_monthly",
      "appleProductId": "com.avalo.vip.monthly",
      "googleProductId": "vip_monthly",
      "isVisibleOnWeb": true,
      "isVisibleOnMobile": true
    },
    {
      "tier": "ROYAL",
      "name": "Royal",
      "description": "50% off calls + better chat earnings (7-word buckets)",
      "monthlyPriceDisplay": "$19.99/month",
      "stripePriceId": "price_royal_monthly",
      "appleProductId": "com.avalo.royal.monthly",
      "googleProductId": "royal_monthly",
      "isVisibleOnWeb": true,
      "isVisibleOnMobile": true
    },
    {
      "tier": "CREATOR_PRO",
      "name": "Creator Pro",
      "description": "Advanced analytics and creator tools",
      "monthlyPriceDisplay": "$29.99/month",
      "stripePriceId": "price_creator_pro_monthly",
      "isVisibleOnWeb": true,
      "isVisibleOnMobile": false
    },
    {
      "tier": "BUSINESS",
      "name": "Business",
      "description": "Ads dashboard, campaigns, and analytics",
      "monthlyPriceDisplay": "$99.99/month",
      "stripePriceId": "price_business_monthly",
      "isVisibleOnWeb": true,
      "isVisibleOnMobile": false
    }
  ]
}
EOF

echo -e "${GREEN}✓ Subscription products config template created${NC}"
echo -e "${YELLOW}  → Please upload subscription-products-config.json to Firestore at /system/subscriptionProducts${NC}"

# 5. Summary
echo ""
echo -e "${GREEN}=================================================${NC}"
echo -e "${GREEN}✓ PACK 350 Deployment Complete!${NC}"
echo -e "${GREEN}=================================================${NC}"
echo ""
echo "Next steps:"
echo "1. Upload subscription-products-config.json to Firestore"
echo "2. Configure Stripe product IDs in Stripe Dashboard"
echo "3. Configure Apple/Google product IDs in App Store Connect / Play Console"
echo "4. Set up webhook endpoints for payment providers:"
echo "   - Stripe: https://YOUR_PROJECT.cloudfunctions.net/pack350_stripeWebhook"
echo "   - Apple: https://YOUR_PROJECT.cloudfunctions.net/pack350_appleWebhook"
echo "   - Google: https://YOUR_PROJECT.cloudfunctions.net/pack350_googleWebhook"
echo "5. Test subscription flows on all platforms"
echo ""
