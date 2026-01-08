#!/bin/bash
# PACK 344 — In-App AI Helpers Deployment Script

set -e

echo "=================================================="
echo "PACK 344 — In-App AI Helpers Deployment"
echo "=================================================="

# Load environment variables if .env exists
if [ -f functions/.env ]; then
  export $(cat functions/.env | xargs)
fi

echo ""
echo "Step 1: Configure OpenAI API Key"
echo "--------------------------------------------------"
if [ -z "$AI_API_KEY" ]; then
  echo "❌ ERROR: AI_API_KEY environment variable not set"
  echo "Please set your OpenAI API key:"
  echo "  export AI_API_KEY='sk-...'"
  echo "  Or add to functions/.env: AI_API_KEY=sk-..."
  exit 1
fi

echo "✅ AI_API_KEY configured"

# Configure Firebase Functions config
echo "Configuring Firebase Functions with OpenAI key..."
firebase functions:config:set openai.key="$AI_API_KEY"

echo ""
echo "Step 2: Deploy Firestore Security Rules"
echo "--------------------------------------------------"
echo "Deploying Pack 344 security rules..."
# Note: You may need to merge these rules with existing firestore.rules
cat firestore-pack344-ai-helpers.rules
echo ""
echo "⚠️ Note: These rules should be merged into your main firestore.rules file"

echo ""
echo "Step 3: Deploy Firebase Functions"
echo "--------------------------------------------------"
cd functions

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo "Deploying Pack 344 functions..."
firebase deploy --only functions:pack344_getMessageSuggestions,functions:pack344_flagRepeatedMessagePattern,functions:pack344_getProfileAndDiscoveryTips,functions:pack344_cleanupOldPatterns

cd ..

echo ""
echo "Step 4: Test Deployment"
echo "--------------------------------------------------"
echo "Testing pack344_getMessageSuggestions..."
firebase functions:shell <<EOF
pack344_getMessageSuggestions({
  sessionId: "test_session",
  receiverProfileSummary: {
    nickname: "TestUser",
    age: 25,
    interests: ["travel", "music"],
    locationCountry: "US"
  },
  contextType: "FIRST_MESSAGE",
  locale: "en"
})
EOF

echo ""
echo "=================================================="
echo "✅ PACK 344 Deployment Complete!"
echo "=================================================="
echo ""
echo "Next Steps:"
echo "1. Update mobile app to integrate AI Suggestions component"
echo "2. Test with staging users"
echo "3. Monitor usage via Firebase Console > Firestore > pack344_analytics"
echo "4. Check rate limiting via pack344_suggestion_usage collection"
echo ""
echo "Configuration:"
echo "- Daily limit: 50 suggestions per user"
echo "- Spam threshold: 5 recipients in 15 minutes"
echo "- AI Provider: OpenAI GPT-4o-mini"
echo "- Fallback: Hardcoded suggestions if AI fails"
echo ""
echo "Monitoring:"
echo "- Analytics: pack344_analytics collection"
echo "- Usage: pack344_suggestion_usage collection"
echo "- Patterns: pack344_message_patterns collection"
echo ""
