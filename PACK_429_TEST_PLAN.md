# PACK 429 — Test Plan
## App Store Defense, Reviews, Reputation & Trust Engine

### Overview
This document outlines the testing strategy for PACK 429's store defense, review recovery, and trust scoring systems.

---

## 1. REVIEW INGESTION TESTS

### 1.1 Manual Import
**Objective**: Verify reviews can be imported from CSV/API dumps

**Test Cases**:
- ✅ Import 10 positive reviews (4-5 stars)
- ✅ Import 10 negative reviews (1-2 stars)
- ✅ Import mixed iOS and Android reviews
- ✅ Verify language detection works correctly
- ✅ Verify sentiment analysis matches ratings
- ✅ Import reviews with special characters
- ✅ Import reviews in different languages (EN, ES, FR, DE, ZH)

**Success Criteria**:
- All reviews stored in `storeReviewsMirror` collection
- Language correctly detected
- Sentiment correctly classified
- No data loss or corruption

### 1.2 Attack Pattern Detection
**Objective**: Verify system detects coordinated review attacks

**Test Cases**:
- ✅ Import 20 reviews with identical phrases
- ✅ Import 15 negative reviews from same region within 1 hour
- ✅ Import sudden spike of 1-star reviews (10+ in 24h after baseline of 1-2/day)
- ✅ Verify `isAttackPattern` flag is set correctly
- ✅ Verify defense event is created for attack patterns

**Success Criteria**:
- Attack patterns detected with >70% confidence
- Defense events created for significant attacks
- Admin notifications sent
- Audit logs created

---

## 2. DEFENSE ENGINE TESTS

### 2.1 Rating Spike Detection
**Objective**: Verify system detects sudden rating drops

**Setup**:
- Create baseline: 50 reviews averaging 4.5 stars over 7 days
- Create spike: 20 reviews averaging 1.5 stars in last 24 hours

**Test Cases**:
- ✅ Run `detectRatingSpike(Platform.IOS)`
- ✅ Verify defense event created with correct severity
- ✅ Verify event metadata contains accurate metrics
- ✅ Test for both iOS and Android platforms

**Success Criteria**:
- Defense event created with severity: CRITICAL (drop ≥1.5) or HIGH (drop ≥1.0)
- Event contains rating drop metrics
- Notification sent to ops team

### 2.2 Bot Attack Detection
**Objective**: Verify system detects repetitive phrase patterns

**Setup**:
- Import 15 reviews within 48 hours
- 10 reviews contain phrase "total scam don't download"
- 5 reviews are unique

**Test Cases**:
- ✅ Run `detectBotAttack(Platform.ANDROID)`
- ✅ Verify attack detected when >30% contain same phrase
- ✅ Verify event contains detected patterns

**Success Criteria**:
- Bot attack detected with HIGH or CRITICAL severity
- Detected patterns listed in event metadata
- Sample review IDs included

### 2.3 Region Concentration Detection
**Objective**: Verify system detects region-specific attacks

**Setup**:
- Import 20 negative reviews (≤2 stars) in last 72 hours
- 12 reviews from region "RU"
- 8 reviews from various other regions

**Test Cases**:
- ✅ Run `detectRegionConcentration(Platform.IOS)`
- ✅ Verify sabotage event created for RU (60% concentration)
- ✅ Verify severity matches concentration level

**Success Criteria**:
- Event created with correct region
- Concentration ratio calculated correctly
- Severity: HIGH if >70%, MEDIUM if >50%

### 2.4 Fraud Correlation
**Objective**: Verify negative reviews from banned/fraud users are detected

**Setup**:
- Create 5 users
- Ban 3 users or create fraud events for them
- Link negative reviews to these users

**Test Cases**:
- ✅ Run `correlateFraudSpike()`
- ✅ Verify sabotage event created
- ✅ Verify correlated user IDs included

**Success Criteria**:
- ≥3 correlated reviews triggers event
- Event includes user IDs
- Severity: HIGH

---

## 3. TRUST SCORE TESTS

### 3.1 Score Calculation
**Objective**: Verify trust score accurately reflects platform health

**Test Scenarios**:

**Scenario A: Excellent Platform**
- Inputs:
  - avgRatingIOS: 4.8
  - avgRatingAndroid: 4.7
  - totalReviews: 5000
  - verificationRate: 0.8
  - fraudRate: 0.001
  - disputeRate: 0.02
  - noShowRate: 0.05
- Expected Score: 88-95

**Scenario B: Poor Platform**
- Inputs:
  - avgRatingIOS: 2.5
  - avgRatingAndroid: 2.3
  - totalReviews: 100
  - verificationRate: 0.3
  - fraudRate: 0.15
  - disputeRate: 0.25
  - noShowRate: 0.30
- Expected Score: 25-40

**Test Cases**:
- ✅ Calculate score for Scenario A
- ✅ Calculate score for Scenario B
- ✅ Verify tier classification (EXCELLENT, GOOD, FAIR, NEEDS_IMPROVEMENT)
- ✅ Verify badge text generation

**Success Criteria**:
- Scores within expected ranges
- Tier accurately reflects score
- Badge text appropriate

### 3.2 Trust Score Update
**Objective**: Verify scheduled trust score recalculation

**Test Cases**:
- ✅ Run `updateTrustScore()`
- ✅ Verify data collected from all sources
- ✅ Verify trustSignals/global document updated
- ✅ Verify weekly trend calculated
- ✅ Verify platform-specific data included

**Success Criteria**:
- Trust score updated successfully
- All metrics populated
- Timestamp updated
- No errors during collection

### 3.3 Public API
**Objective**: Verify public trust score endpoint works without auth

**Test Cases**:
- ✅ GET `/pack429/trust/score` without authentication
- ✅ Verify response includes score, tier, badge, lastUpdated
- ✅ Verify sensitive data not exposed

**Success Criteria**:
- Public endpoint accessible
- Response format correct
- No internal metrics exposed

---

## 4. REVIEW RECOVERY TESTS

### 4.1 Eligibility Checks
**Objective**: Verify users are correctly filtered for review prompts

**Test Scenarios**:

**Eligible User**:
- Active account
- Not banned
- No active disputes
- No recent refunds
- No abuse flags
- Not prompted in last 30 days

**Ineligible Users**:
- Banned user
- User with active dispute
- User with recent refund (last 30 days)
- User already prompted this month

**Test Cases**:
- ✅ Create eligible user, verify `eligible: true`
- ✅ Create banned user, verify `eligible: false` with reason
- ✅ Create user with dispute, verify ineligibility
- ✅ Create user recently prompted, verify ineligibility

**Success Criteria**:
- Eligibility correctly determined
- Ineligibility reasons logged
- Prompts not created for ineligible users

### 4.2 Trigger Events
**Objective**: Verify recovery prompts created after positive events

**Test Cases**:
- ✅ Complete successful chat → verify prompt created
- ✅ Complete calendar meeting → verify prompt created
- ✅ Complete payout → verify prompt created
- ✅ Resolve safety ticket positively → verify prompt created
- ✅ Verify prompts respect 30-day limit

**Success Criteria**:
- Prompt created for each trigger type
- User eligibility checked
- Only eligible users receive prompts
- Rate limiting enforced

### 4.3 Crisis Mode Recovery Boost
**Objective**: Verify increased recovery prompts during crisis

**Setup**:
- User prompted 15 days ago (normally ineligible)
- Activate crisis mode

**Test Cases**:
- ✅ Verify user becomes eligible again after 7 days in crisis mode
- ✅ Verify maxRecoveryPromptsPerDay increased to 50
- ✅ Verify normal users (not recently prompted) still eligible

**Success Criteria**:
- Crisis mode relaxes 30-day rule to 7-day rule
- Prompts increase during crisis
- Deactivation restores normal rules

### 4.4 Analytics
**Objective**: Verify recovery statistics tracking

**Test Cases**:
- ✅ Create 50 prompts over 7 days
- ✅ Mark 30 as delivered
- ✅ Mark 15 as responded
- ✅ Mark 10 as reviews left
- ✅ Call `getRecoveryStats(7)`
- ✅ Verify conversion rate: 10/30 = 33.3%

**Success Criteria**:
- Stats accurately reflect data
- Conversion rate calculated correctly
- Breakdown by trigger type included

---

## 5. CRISIS MODE TESTS

### 5.1 Automatic Activation
**Objective**: Verify crisis mode activates on multiple CRITICAL events

**Setup**:
- Create 2 CRITICAL defense events within 24 hours

**Test Cases**:
- ✅ Create first CRITICAL event → verify crisis mode NOT activated
- ✅ Create second CRITICAL event → verify crisis mode activated
- ✅ Verify feature flags updated
- ✅ Verify notification sent to admins

**Success Criteria**:
- Crisis mode activated after 2nd CRITICAL event
- Feature flags: STORE_CRISIS_MODE=true, AGGRESSIVE_GROWTH_PROMPTS=false
- Audit log created
- Admin notifications delivered

### 5.2 Manual Activation
**Objective**: Verify admin can manually activate crisis mode

**Test Cases**:
- ✅ Call `activateCrisisMode({ activatedBy: 'admin123', manual: true })`
- ✅ Verify crisis mode active
- ✅ Verify activationType: MANUAL

**Success Criteria**:
- Crisis mode activated
- Type marked as MANUAL
- Feature flags updated

### 5.3 Auto-Deactivation
**Objective**: Verify automatic crisis deactivation when conditions improve

**Setup**:
- Activate crisis mode (automatic)
- Wait 12+ hours (simulate)
- Resolve all CRITICAL events
- Ensure rating trend is positive/neutral

**Test Cases**:
- ✅ Run `evaluateCrisisAutoDeactivation()` too early (<12h) → no deactivation
- ✅ Run with unresolved CRITICAL events → no deactivation
- ✅ Run with negative trend → no deactivation
- ✅ Run meeting all conditions → verify deactivation

**Success Criteria**:
- Auto-deactivation only when safe
- Manual crisis modes NOT auto-deactivated
- Impact analysis calculated
- Feature flags restored

### 5.4 Feature Flag Integration
**Objective**: Verify crisis mode affects app behavior

**Test Cases**:
- ✅ Check `shouldDisableAction('AGGRESSIVE_GROWTH_PROMPT')` during crisis → true
- ✅ Check `shouldDisableAction('RISKY_EXPERIMENT')` during crisis → true
- ✅ Check `shouldEnhanceSafety()` during crisis → true
- ✅ Check `getMaxRecoveryPromptsPerDay()` during crisis → 50
- ✅ After deactivation, verify values revert to normal

**Success Criteria**:
- Crisis mode disables risky features
- Enhanced safety enabled
- Recovery limits increased
- Normal operation restored after deactivation

---

## 6. ADMIN API TESTS

### 6.1 Dashboard
**Objective**: Verify admin dashboard API

**Test Cases**:
- ✅ GET `/pack429/dashboard` with admin auth
- ✅ Verify response includes: currentScore, trend, ratings, events, alerts, crisis mode
- ✅ GET without auth → 403 error

**Success Criteria**:
- Authenticated admins can access
- Non-admins blocked
- All dashboard data included

### 6.2 Review Import
**Objective**: Verify review import endpoint

**Test Cases**:
- ✅ POST `/pack429/reviews/import` with valid data and admin auth
- ✅ Verify reviews imported
- ✅ POST with invalid data → error response
- ✅ POST without auth → 403

**Success Criteria**:
- Valid imports succeed
- Invalid data rejected with error message
- Auth required

### 6.3 Crisis Management
**Objective**: Verify crisis mode endpoints

**Test Cases**:
- ✅ POST `/pack429/crisis/activate` → crisis mode activated
- ✅ GET `/pack429/crisis` → current status returned
- ✅ POST `/pack429/crisis/deactivate` → crisis mode deactivated
- ✅ All endpoints require admin auth

**Success Criteria**:
- Admins can control crisis mode
- Status queryable
- Auth enforced

---

## 7. INTEGRATION TESTS

### 7.1 Full Attack Response Flow
**End-to-end test of coordinated attack handling**

**Scenario**:
1. Import 30 negative reviews with similar phrases in 2 hours
2. System detects bot attack
3. Defense event created
4. 2nd CRITICAL event occurs
5. Crisis mode auto-activates
6. Recovery prompts boosted
7. Attack subsides
8. Crisis mode auto-deactivates after 12+ hours

**Test Steps**:
- ✅ Execute scenario
- ✅ Verify each step triggers correctly
- ✅ Verify end-to-end flow completes successfully

### 7.2 Review Recovery Flow
**End-to-end test of review recovery**

**Scenario**:
1. User completes successful payout
2. System checks eligibility → eligible
3. Recovery prompt created
4. App displays prompt to user
5. User clicks "Leave Review"
6. System marks prompt as responded + review left

**Test Steps**:
- ✅ Execute scenario
- ✅ Verify prompt created and delivered
- ✅ Verify user can respond
- ✅ Verify analytics updated

---

## 8. PERFORMANCE TESTS

### 8.1 Large Review Import
**Objective**: Verify system handles large imports

**Test Cases**:
- ✅ Import 1,000 reviews
- ✅ Import 5,000 reviews
- ✅ Verify batch operations work correctly
- ✅ Verify no timeout errors
- ✅ Verify attack detection still accurate

**Success Criteria**:
- Large imports complete without errors
- Performance acceptable (<5 seconds per 500 reviews)
- Attack detection accuracy maintained

### 8.2 Monitoring Performance
**Objective**: Verify scheduled monitoring runs efficiently

**Test Cases**:
- ✅ Run `runDefenseMonitoring()` with 10,000+ reviews in database
- ✅ Verify completion time <30 seconds
- ✅ Verify accurate results

**Success Criteria**:
- Monitoring completes within time limit
- No errors
- Results accurate

---

## 9. SECURITY TESTS

### 9.1 Firestore Rules
**Objective**: Verify security rules enforce access control

**Test Cases**:
- ✅ Non-admin user reads `storeReviewsMirror` → DENIED
- ✅ Non-admin user writes `storeDefenseEvents` → DENIED
- ✅ Any user reads `trustSignals/global` → ALLOWED
- ✅ User reads own `reviewRecoveryPrompts` → ALLOWED
- ✅ User reads other user's prompts → DENIED
- ✅ Admin reads all collections → ALLOWED

**Success Criteria**:
- All access controls enforced
- Public data accessible
- Private data protected

### 9.2 API Authentication
**Objective**: Verify API endpoints require proper auth

**Test Cases**:
- ✅ Call admin endpoints without auth → 403
- ✅ Call admin endpoints with user token → 403
- ✅ Call admin endpoints with admin token → 200
- ✅ Call public endpoints without auth → 200

**Success Criteria**:
- Auth required where specified
- Role-based access enforced
- Public endpoints accessible

---

## 10. MONITORING & ALERTS

### 10.1 Operational Monitoring
**What to Monitor**:
- Trust score changes (alert if drops >5 points)
- Active defense events (alert on CRITICAL)
- Crisis mode activations
- Review recovery conversion rate (alert if <10%)
- Failed imports
- API error rates

### 10.2 Scheduled Tasks
**Cloud Scheduler Jobs**:
- `runDefenseMonitoring()` - Every hour
- `updateTrustScore()` - Daily at 2 AM UTC
- `evaluateCrisisAutoDeactivation()` - Every 6 hours

**Verification**:
- ✅ Scheduler jobs configured
- ✅ Jobs run successfully
- ✅ Logs confirm execution
- ✅ Errors caught and alerted

---

## Test Execution Checklist

- [ ] 1. Review Ingestion Tests (1.1, 1.2)
- [ ] 2. Defense Engine Tests (2.1, 2.2, 2.3, 2.4)
- [ ] 3. Trust Score Tests (3.1, 3.2, 3.3)
- [ ] 4. Review Recovery Tests (4.1, 4.2, 4.3, 4.4)
- [ ] 5. Crisis Mode Tests (5.1, 5.2, 5.3, 5.4)
- [ ] 6. Admin API Tests (6.1, 6.2, 6.3)
- [ ] 7. Integration Tests (7.1, 7.2)
- [ ] 8. Performance Tests (8.1, 8.2)
- [ ] 9. Security Tests (9.1, 9.2)
- [ ] 10. Monitoring Setup (10.1, 10.2)

---

## Notes
- All tests should be run in a staging environment first
- Production tests should use synthetic data only
- Monitor Cloud Functions logs during testing
- Document any failures or edge cases discovered
- Update test plan as new scenarios are identified
