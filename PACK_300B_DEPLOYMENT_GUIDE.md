# PACK 300B — Deployment Guide

**Version:** 1.0.0  
**Last Updated:** December 9, 2025  
**Status:** Production Ready

---

## 📋 PRE-DEPLOYMENT CHECKLIST

### Prerequisites
- ✅ PACK 300 & 300A fully deployed
- ✅ Firebase project configured
- ✅ Node.js 18+ installed
- ✅ Firebase CLI installed (`npm install -g firebase-tools`)
- ✅ Admin access to Firebase project
- ✅ Production environment variables set

### Files to Deploy
```
✅ shared/types/support-300b.ts         (Extended types)
✅ functions/src/pack300-support-functions.ts (Cloud Functions)
✅ web/admin/src/pages/support/*        (Admin console)
✅ web/app/help/*                       (Public help center)
✅ scripts/seed-pack300b-data.ts        (Seed script)
✅ functions/src/__tests__/pack300-support.test.ts (Tests)
```

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Deploy Backend Functions

```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy Cloud Functions
firebase deploy --only functions:createTicket,functions:addMessage,functions:updateTicket,functions:executeAccountAction,functions:getSupportMetrics

# Verify deployment
firebase functions:log --only createTicket
```

**Expected Functions:**
- `createTicket` - Ticket creation with safety classification
- `addMessage` - Add messages to tickets
- `updateTicket` - Update ticket status/priority/assignment
- `executeAccountAction` - Admin account actions (warn/freeze/ban)
- `getSupportMetrics` - Dashboard metrics

### Step 2: Deploy Firestore Rules & Indexes

```bash
# Deploy security rules (if not already deployed from PACK 300)
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# Verify rules
firebase firestore:rules
```

### Step 3: Seed Initial Data

```bash
# Run seed script
cd scripts
npx ts-node seed-pack300b-data.ts

# Verify seeded data in Firebase Console:
# - Check adminUsers collection (5 users)
# - Check helpArticles collection (6+ articles)
# - Check educationCards collection (7+ cards)
```

**Seeded Data:**
- 5 admin users (super_admin, support_agent x2, safety_admin, support_manager)
- 6 help articles (EN versions, add PL manually or via script)
- 7 education cards (EN versions)

### Step 4: Deploy Admin Console

```bash
# Navigate to admin web directory
cd web/admin

# Install dependencies
npm install

# Build for production
npm run build

# Deploy to hosting
firebase deploy --only hosting:admin

# Verify deployment
# Visit: https://admin.avalo.app/support
```

**Admin Console URLs:**
- Dashboard: `/admin/support`
- Tickets: `/admin/support/tickets`
- Ticket Detail: `/admin/support/[ticketId]`
- Analytics: `/admin/support/analytics`

### Step 5: Deploy Public Help Center

```bash
# Navigate to web directory
cd web

# Install dependencies
npm install

# Build for production
npm run build

# Deploy to hosting
firebase deploy --only hosting:web

# Verify deployment
# Visit: https://avalo.app/help
```

**Help Center URLs:**
- Home: `/help`
- Categories: `/help/categories/[category]`
- Articles: `/help/[articleSlug]`
- Search: `/help/search?q=query`

### Step 6: Run Tests

```bash
# Unit tests
cd functions
npm test -- pack300-support.test.ts

# Expected: All tests pass
# - Safety classification tests
# - Severity calculation tests
# - SLA breach detection tests
# - Integration scenarios
# - Edge cases
```

### Step 7: Smoke Tests

```bash
# Test 1: Create ticket via mobile app
# - Open support screen
# - Create test ticket
# - Verify appears in admin console

# Test 2: Admin reply
# - Admin opens ticket
# - Adds reply
# - Verify user receives notification

# Test 3: Safety escalation
# - Create CRITICAL safety ticket
# - Verify account freeze
# - Verify safety queue

# Test 4: Help center
# - Visit /help
# - Search for article
# - Verify SEO tags
# - Test article feedback

# Test 5: Education cards
# - Navigate to token wallet
# - Verify education card appears
# - Dismiss card
# - Verify persisted
```

---

## 🔒 SECURITY CONFIGURATION

### Admin User Setup

```bash
# Add first admin user via Firebase Console
# 1. Go to Firestore
# 2. Create document in adminUsers collection
# 3. Document ID = user's Firebase Auth UID
# 4. Set fields:
{
  "adminId": "<Firebase Auth UID>",
  "email": "admin@avalo.app",
  "displayName": "Your Name",
  "role": "super_admin",
  "active": true,
  "createdAt": "<ISO timestamp>"
}
```

### Role Permissions

```typescript
super_admin      → Full access to everything
support_manager  → Full ticket access, can assign
support_agent    → Non-safety tickets only
safety_admin     → Safety tickets only
```

### Environment Variables

```env
# functions/.env
FIREBASE_PROJECT_ID=your-project-id
NOTIFICATION_WEBHOOK_URL=https://...
AUDIT_LOG_RETENTION_DAYS=365
RISK_PROFILE_ENABLED=true
```

---

## 📊 MONITORING SETUP

### Key Metrics to Monitor

1. **Response Times**
   - Average first response time by priority
   - SLA compliance rate
   - Response time by admin

2. **Ticket Volume**
   - Tickets created per day
   - Open ticket count
   - Safety ticket rate

3. **Safety Incidents**
   - CRITICAL tickets per day
   - Account freezes executed
   - Panic button activations

4. **System Health**
   - Function error rates
   - Function execution times
   - Database read/write quotas

### Firebase Console Monitoring

```bash
# Enable Cloud Functions monitoring
firebase functions:config:set monitoring.enabled=true

# Set up alerts
firebase alerts:create \
  --type functions \
  --threshold 0.05 \
  --comparison greater-than \
  --metric error-rate

# Monitor logs
firebase functions:log --lines 100
```

### Custom Dashboards

Create dashboards in Firebase Console for:
- Support KPIs
- Safety metrics
- Admin performance
- Help center usage

---

## 🧪 POST-DEPLOYMENT TESTING

### Critical Path Tests

**Test 1: User Creates Ticket**
```
1. User opens support in mobile app
2. Selects "Technical Issue"
3. Fills subject and description
4. Submits ticket
✓ Verify: Ticket created in Firestore
✓ Verify: User receives notification
✓ Verify: Ticket appears in admin console
```

**Test 2: Panic Button Escalation**
```
1. User triggers panic button
2. Ticket auto-created with severity=CRITICAL
✓ Verify: Reported user account frozen
✓ Verify: Safety team notified
✓ Verify: Risk profile updated
✓ Verify: Audit log created
✓ Verify: Ticket in safety queue
```

**Test 3: Admin Operations**
```
1. Admin logs into admin console
2. Views dashboard metrics
3. Opens ticket and replies
4. Changes ticket status
5. Assigns ticket to another admin
✓ Verify: All operations succeed
✓ Verify: Notifications sent
✓ Verify: Audit logs created
```

**Test 4: Account Actions**
```
1. Admin opens safety ticket
2. Executes account action (freeze)
3. Sets 24-hour duration
✓ Verify: User account frozen
✓ Verify: Action recorded
✓ Verify: Expiration set correctly
✓ Verify: Audit log created
```

**Test 5: Help Center**
```
1. User visits /help
2. Searches for "paid chat"
3. Clicks article
4. Reads article
5. Marks as helpful
✓ Verify: Search works
✓ Verify: Article renders
✓ Verify: Feedback recorded
✓ Verify: SEO tags present
```

---

## 🔄 ROLLBACK PROCEDURE

### If Issues Arise

**Step 1: Identify Issue**
```bash
# Check function logs
firebase functions:log --only createTicket --lines 100

# Check error rates
firebase functions:status
```

**Step 2: Rollback Functions**
```bash
# Rollback to previous version
firebase functions:rollback createTicket

# Or redeploy previous working version
firebase deploy --only functions --force
```

**Step 3: Rollback Frontend**
```bash
# Admin console
cd web/admin
git checkout <previous-working-commit>
npm run build
firebase deploy --only hosting:admin

# Public help center
cd web
git checkout <previous-working-commit>
npm run build
firebase deploy --only hosting:web
```

**Step 4: Verify Rollback**
- Test critical paths
- Check error rates
- Monitor metrics
- Communicate status to team

---

## 📞 SUPPORT TEAM TRAINING

### Admin Console Training (2 hours)

**Session 1: Dashboard & Navigation**
- Overview of support dashboard
- Understanding KPIs and metrics
- Navigating ticket lists
- Filtering and searching

**Session 2: Ticket Handling**
- Opening and reading tickets
- Replying to users
- Using internal notes
- Changing status and priority
- Assigning tickets

**Session 3: Safety Operations**
- Identifying safety tickets
- Safety ticket procedures
- Account actions (warn/freeze/ban)
- Escalation protocols
- Documentation requirements

### Help Center Management (1 hour)

- Adding new articles
- Updating existing content
- Managing translations (EN/PL)
- Monitoring article performance
- Responding to feedback

### Education Card Management (30 minutes)

- Creating new cards
- Deploying cards to contexts
- Monitoring engagement
- A/B testing cards
- User feedback

---

## 📈 SUCCESS CRITERIA

### Week 1 Targets
- [ ] All functions deployed and operational
- [ ] Admin team trained and ready
- [ ] 0 critical bugs reported
- [ ] 5+ help articles published
- [ ] Support tickets being handled

### Month 1 Targets
- [ ] Average first response < 4 hours
- [ ] SLA compliance > 90%
- [ ] User satisfaction > 3.5/5.0
- [ ] Help article deflection > 20%
- [ ] Safety escalation < 1% of tickets

### Quarter 1 Targets
- [ ] Average first response < 2 hours
- [ ] SLA compliance > 95%
- [ ] User satisfaction > 4.0/5.0
- [ ] Help article deflection > 30%
- [ ] 95% tickets resolved within SLA

---

## 🚨 EMERGENCY CONTACTS

### On-Call Rotation
- **Primary:** Support Manager (manager@avalo.app)
- **Secondary:** Safety Admin (safety@avalo.app)
- **Escalation:** Super Admin (super@avalo.app)

### Critical Issues
- **P0 (System Down):** Immediate response required
- **P1 (Safety Critical):** Response within 15 minutes
- **P2 (High Impact):** Response within 1 hour
- **P3 (Normal):** Response within 4 hours

### Escalation Path
```
User Ticket → Support Agent → Support Manager → Safety Admin → Super Admin → CTO
```

---

## ✅ DEPLOYMENT VERIFICATION

After completing all steps, verify:

- ✅ All Cloud Functions deployed
- ✅ Firestore rules active
- ✅ Indexes created
- ✅ Admin console accessible
- ✅ Help center live
- ✅ Seed data loaded
- ✅ Tests passing
- ✅ Monitoring configured
- ✅ Team trained
- ✅ Documentation complete

---

## 📝 NEXT STEPS

1. **Week 1:** Monitor closely, fix any issues
2. **Week 2:** Optimize based on metrics
3. **Week 3:** Expand help articles
4. **Week 4:** Deploy education cards
5. **Month 2:** Add advanced features

---

**Deployment Lead:** DevOps Team  
**Support Contact:** support@avalo.app  
**Emergency:** safety@avalo.app  
**Documentation:** https://docs.avalo.app/pack300b