#!/bin/bash

##############################################################################
# PACK 313 - Monitoring, Logging & Health Checks Deployment Script
#
# Deploys all observability infrastructure to Firebase
# - Health check endpoints
# - Metrics aggregation jobs
# - Alerting system
# - Error tracking endpoints
# - Firestore indexes
##############################################################################

set -e

echo "🚀 PACK 313 - Monitoring, Logging & Health Checks Deployment"
echo "=============================================================="
echo ""

# Function to check if Firebase CLI is installed
check_firebase_cli() {
  if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it first:"
    echo "   npm install -g firebase-tools"
    exit 1
  fi
  echo "✅ Firebase CLI found"
}

# Function to check if user is logged in
check_firebase_auth() {
  if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run:"
    echo "   firebase login"
    exit 1
  fi
  echo "✅ Firebase authentication verified"
}

# Function to deploy Firestore indexes
deploy_indexes() {
  echo ""
  echo "📊 Deploying Firestore indexes for PACK 313..."
  firebase deploy --only firestore:indexes --force
  
  if [ $? -eq 0 ]; then
    echo "✅ Firestore indexes deployed successfully"
  else
    echo "⚠️ Warning: Index deployment may have issues (check Firebase Console)"
  fi
}

# Function to deploy Cloud Functions
deploy_functions() {
  echo ""
  echo "☁️ Deploying Cloud Functions for PACK 313..."
  echo ""
  
  # Deploy health check endpoints
  echo "  🏥 Deploying health check endpoints..."
  firebase deploy --only functions:pack313_health,functions:pack313_healthDeep
  
  # Deploy metrics aggregation
  echo "  📈 Deploying metrics aggregation jobs..."
  firebase deploy --only functions:pack313_aggregateDailyMetrics,functions:pack313_aggregateHourlyMetrics
  
  # Deploy alerting system
  echo "  🔔 Deploying alerting system..."
  firebase deploy --only functions:pack313_monitorAlerts,functions:pack313_monitorFinancialAnomalies
  
  # Deploy alert management endpoints
  echo "  🎯 Deploying alert management..."
  firebase deploy --only functions:pack313_triggerAlert,functions:pack313_acknowledgeAlert,functions:pack313_getRecentAlerts
  
  echo ""
  if [ $? -eq 0 ]; then
    echo "✅ All Cloud Functions deployed successfully"
  else
    echo "❌ Error deploying Cloud Functions"
    exit 1
  fi
}

# Function to set environment variables
set_env_variables() {
  echo ""
  echo "🔧 Environment Variables Configuration"
  echo "======================================"
  echo ""
  echo "Please ensure the following environment variables are set in Firebase:"
  echo ""
  echo "  Required:"
  echo "    • AVALO_ENV (dev|staging|prod)"
  echo "    • APP_RELEASE_VERSION (e.g., 1.0.0)"
  echo ""
  echo "  Optional (Error Tracking):"
  echo "    • ERROR_TRACKING_DSN (Sentry, DataDog, etc.)"
  echo "    • LOG_PROVIDER (console|datadog|custom)"
  echo ""
  echo "  Optional (Alerting):"
  echo "    • ALERT_EMAIL_TO (comma-separated list)"
  echo "    • ALERT_EMAIL_FROM (sender address)"
  echo "    • ALERT_SLACK_WEBHOOK (Slack webhook URL)"
  echo "    • ALERT_WEBHOOK_URL (generic webhook)"
  echo ""
  echo "To set environment variables:"
  echo "  firebase functions:config:set avalo.env=prod"
  echo "  firebase functions:config:set app.release_version=1.0.0"
  echo "  firebase functions:config:set alert.email_to=ops@avalo.app"
  echo ""
  
  read -p "Have you configured the environment variables? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "⚠️ Please configure environment variables before continuing"
    echo "   See functions/.env.monitoring.example for reference"
    exit 1
  fi
}

# Function to verify deployment
verify_deployment() {
  echo ""
  echo "🔍 Verifying Deployment..."
  echo "=========================="
  echo ""
  
  # Get project ID
  PROJECT_ID=$(firebase use | grep -o "avalo-[^ ]*" | head -1)
  
  if [ -z "$PROJECT_ID" ]; then
    echo "⚠️ Could not determine project ID"
    echo "   Please verify manually in Firebase Console"
    return
  fi
  
  echo "  Project: $PROJECT_ID"
  echo ""
  echo "  Health Check Endpoints:"
  echo "    • https://europe-west3-${PROJECT_ID}.cloudfunctions.net/pack313_health"
  echo "    • https://europe-west3-${PROJECT_ID}.cloudfunctions.net/pack313_healthDeep"
  echo ""
  echo "  Scheduled Jobs:"
  echo "    • pack313_aggregateDailyMetrics (daily at 1 AM UTC)"
  echo "    • pack313_aggregateHourlyMetrics (every hour)"
  echo "    • pack313_monitorAlerts (every 5 minutes)"
  echo "    • pack313_monitorFinancialAnomalies (every hour)"
  echo ""
  echo "  Firestore Collections:"
  echo "    • system_logs (structured logs)"
  echo "    • metrics_daily (daily aggregations)"
  echo "    • metrics_hourly (hourly aggregations)"
  echo "    • alerts (alert notifications)"
  echo ""
}

# Function to show next steps
show_next_steps() {
  echo ""
  echo "📋 Next Steps"
  echo "============="
  echo ""
  echo "1. Test health check endpoint:"
  echo "   curl https://europe-west3-avalo-app.cloudfunctions.net/pack313_health"
  echo ""
  echo "2. Monitor Cloud Functions logs:"
  echo "   firebase functions:log"
  echo ""
  echo "3. View Firestore indexes status:"
  echo "   firebase firestore:indexes"
  echo ""
  echo "4. Configure alerting channels (if not done):"
  echo "   • Email: Set ALERT_EMAIL_TO and ALERT_EMAIL_FROM"
  echo "   • Slack: Set ALERT_SLACK_WEBHOOK"
  echo "   • Webhook: Set ALERT_WEBHOOK_URL"
  echo ""
  echo "5. Integrate error tracking in mobile/web apps:"
  echo "   • Mobile: Initialize ErrorTracking in app/_layout.tsx"
  echo "   • Web: Initialize ErrorTracking in app/layout.tsx"
  echo ""
  echo "6. Monitor system health in Firebase Console:"
  echo "   • Firestore > system_logs collection"
  echo "   • Firestore > metrics_daily collection"
  echo "   • Firestore > alerts collection"
  echo ""
  echo "📚 Full documentation: PACK_313_MONITORING_LOGGING_IMPLEMENTATION.md"
  echo ""
}

##############################################################################
# MAIN EXECUTION
##############################################################################

main() {
  echo "Starting PACK 313 deployment..."
  echo ""
  
  # Pre-flight checks
  check_firebase_cli
  check_firebase_auth
  
  # Configuration
  set_env_variables
  
  # Deploy indexes first
  deploy_indexes
  
  # Deploy functions
  deploy_functions
  
  # Verify deployment
  verify_deployment
  
  # Show next steps
  show_next_steps
  
  echo "✅ PACK 313 deployment complete!"
  echo ""
}

# Run main function
main