#!/bin/bash
# PACK 335 - User Support System Deployment Script

set -e

echo "🎫 Deploying PACK 335 - User Support System..."
echo "================================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Deploy Firestore Rules
echo -e "${BLUE}📋 Step 1: Deploying Firestore Security Rules...${NC}"
firebase deploy --only firestore:rules
echo -e "${GREEN}✓ Firestore rules deployed${NC}\n"

# Step 2: Deploy Firestore Indexes
echo -e "${BLUE}📊 Step 2: Deploying Firestore Indexes...${NC}"
firebase deploy --only firestore:indexes
echo -e "${GREEN}✓ Firestore indexes deployed${NC}\n"

# Step 3: Deploy Cloud Functions
echo -e "${BLUE}⚡ Step 3: Deploying Cloud Functions...${NC}"
firebase deploy --only functions:pack335_createSupportTicket,functions:pack335_addTicketMessage,functions:pack335_updateTicketStatus,functions:pack335_handleRefundDispute,functions:pack335_closeTicket,functions:pack335_autoCloseOldTickets,functions:pack335_notifyPendingTickets,functions:pack335_generateTicketAnalytics,functions:pack335_aiSupportAssistant,functions:pack335_searchFaqArticles,functions:pack335_getFaqArticle,functions:pack335_manageFaqArticle,functions:pack335_deleteFaqArticle

echo -e "${GREEN}✓ Cloud Functions deployed${NC}\n"

# Step 4: Initialize System Settings
echo -e "${BLUE}⚙️  Step 4: Initializing System Settings...${NC}"
echo "Please run the following command in Firebase Console or your app:"
echo ""
echo -e "${YELLOW}db.collection('supportSystemSettings').doc('GLOBAL').set({${NC}"
echo -e "${YELLOW}  id: 'GLOBAL',${NC}"
echo -e "${YELLOW}  maxOpenTicketsPerUser: 3,${NC}"
echo -e "${YELLOW}  autoCloseAfterDays: 14,${NC}"
echo -e "${YELLOW}  refundDisputeWindowDays: 7,${NC}"
echo -e "${YELLOW}  aiAssistantEnabled: false${NC}"
echo -e "${YELLOW}});${NC}"
echo ""
echo -e "${GREEN}✓ System settings template provided${NC}\n"

# Summary
echo "================================================"
echo -e "${GREEN}🎉 PACK 335 Deployment Complete!${NC}"
echo ""
echo "📱 User-Facing Features:"
echo "   • Support ticket creation (7 types)"
echo "   • Real-time ticket messaging"
echo "   • FAQ search and AI assistant"
echo "   • Refund dispute system"
echo ""
echo "👨‍💼 Admin Features:"
echo "   • Support dashboard with filters"
echo "   • Full ticket context access"
echo "   • Refund processing workflow"
echo "   • FAQ article management"
echo ""
echo "🤖 Automated Features:"
echo "   • Auto-close old tickets (daily)"
echo "   • Pending ticket reminders (daily)"
echo "   • Analytics generation (daily)"
echo ""
echo "📚 Next Steps:"
echo "   1. Initialize system settings (see above)"
echo "   2. Create initial FAQ articles"
echo "   3. Test ticket creation and workflow"
echo "   4. Configure AI assistant (optional)"
echo "   5. Add navigation links in mobile app"
echo ""
echo "📖 Full Documentation: PACK_335_IMPLEMENTATION_COMPLETE.md"
echo ""
echo -e "${GREEN}✅ All systems ready for production!${NC}"