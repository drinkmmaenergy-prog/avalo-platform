# PACK 428 — Global Feature Flags, Kill-Switch & Experimentation Layer
## Test Plan & Acceptance Criteria

---

## Test Environment Setup

### Prerequisites
- Firebase project with Firestore enabled
- Admin user account
- Test user accounts (NEW, ACTIVE, VIP, ROYAL, CREATOR segments)
- Mobile app (iOS/Android) installed
- Web app accessible
- Backend functions deployed

### Initial Data Seeding
```bash
# Initialize kill switches
npm run init-kill-switches

# Create test feature flags
npm run seed-test-flags

# Create test experiments
npm run seed-test-experiments
```

---

## Test Scenarios

### 1. Feature Flag Basic Functionality

#### Test 1.1: Feature Flag ON/OFF
**Objective:** Verify feature can be enabled/disabled globally

**Steps:**
1. Admin creates a feature flag `TEST_FEATURE_A` with `enabled: true`
2. User A logs in and checks if feature is enabled
3. Admin sets `enabled: false`
4. User A refreshes flags
5. Verify feature is now disabled

**Expected Result:**
- ✅ User A sees feature when enabled
- ✅ User A doesn't see feature when disabled
- ✅ Change takes effect within cache TTL (15 minutes) or on refresh

**Acceptance Criteria:**
- Flag state is correctly reflected on client
- No server errors
- Audit log created for flag changes

---

#### Test 1.2: Region-Based Rollout
**Objective:** Enable feature for specific regions only

**Steps:**
1. Create flag `TEST_FEATURE_B` with `regions: ['EU']`
2. User in EU region checks flag → should be enabled
3. User in NA region checks flag → should be disabled

**Expected Result:**
- ✅ EU users see feature
- ✅ Non-EU users don't see feature
- ✅ Region detection is accurate

---

#### Test 1.3: Platform-Based Rollout
**Objective:** Enable feature for specific platforms

**Steps:**
1. Create flag `TEST_FEATURE_C` with `platforms: ['IOS']`
2. iOS user checks flag → should be enabled
3. Android user checks flag → should be disabled
4. Web user checks flag → should be disabled

**Expected Result:**
- ✅ Only iOS users see feature
- ✅ Platform detection is accurate

---

#### Test 1.4: User Segment Targeting
**Objective:** Enable feature for specific user segments

**Steps:**
1. Create flag `TEST_FEATURE_D` with `userSegments: ['VIP', 'ROYAL']`
2. VIP user checks flag → enabled
3. FREE user checks flag → disabled
4. ROYAL user checks flag → enabled

**Expected Result:**
- ✅ Only VIP and ROYAL users see feature
- ✅ Segment detection is accurate

---

#### Test 1.5: Percentage Rollout
**Objective:** Enable feature for 10% of users only

**Steps:**
1. Create flag `TEST_FEATURE_E` with `rolloutPercentage: 10`
2. 100 test users check the flag
3. Count how many see it enabled

**Expected Result:**
- ✅ Approximately 10% of users see feature (8-12% acceptable variance)
- ✅ Same user always gets same result (sticky)

---

### 2. Kill Switch Functionality

#### Test 2.1: Turn Off CHAT_GLOBAL
**Objective:** Verify chat can be disabled instantly

**Steps:**
1. Admin activates `CHAT_GLOBAL` kill switch
2. User A tries to send a message
3. Verify message sending is blocked
4. Verify chat UI entry points are disabled
5. Admin deactivates kill switch
6. User A can now send messages

**Expected Result:**
- ✅ All chat functionality immediately blocked when active
- ✅ UI reflects kill switch state
- ✅ Backend denies chat operations
- ✅ Ops team receives notification
- ✅ Audit log created

---

#### Test 2.2: Kill Switch Overrides Feature Flags
**Objective:** Verify kill switch takes precedence

**Steps:**
1. Enable feature flag `CHAT_REACTIONS` with `enabled: true`
2. User A can use chat reactions
3. Activate `CHAT_GLOBAL` kill switch
4. User A can no longer use chat reactions (even though flag is enabled)

**Expected Result:**
- ✅ Kill switch overrides feature flag
- ✅ Feature immediately disabled

---

#### Test 2.3: PAYMENTS_GLOBAL Kill Switch
**Objective:** Disable all payment processing

**Steps:**
1. Activate `PAYMENTS_GLOBAL` kill switch
2. User tries to purchase tokens → blocked
3. User tries to start paid chat → blocked
4. Verify payment UI is disabled

**Expected Result:**
- ✅ All payment operations blocked
- ✅ Clear error message to user
- ✅ No partial payments processed

---

### 3. A/B Experiment Functionality

#### Test 3.1: Assign A/B Variant and Keep Sticky
**Objective:** Users are consistently assigned to same variant

**Steps:**
1. Create experiment `TEST_DISCOVERY_LAYOUT` with variants A (50%) and B (50%)
2. User A logs in → assigned to variant B
3. User A logs out and logs in again → still variant B
4. User A clears cache and logs in → still variant B

**Expected Result:**
- ✅ User consistently gets same variant
- ✅ Assignment stored in retention profile
- ✅ Exposure logged for analytics

---

#### Test 3.2: Experiment Metrics Tracking
**Objective:** Track conversion metrics per variant

**Steps:**
1. Create experiment with metric tracking for `CHAT_START`
2. Variant A users: Track chat start events
3. Variant B users: Track chat start events
4. Admin views experiment metrics
5. Verify conversion rates calculated correctly

**Expected Result:**
- ✅ Metrics tracked per variant
- ✅ Conversion rates calculated
- ✅ Sample sizes accurate

---

### 4. Auto-Disable on Fraud Spike

#### Test 4.1: Experiment Auto-Disabled After Fraud Spike
**Objective:** System detects fraud and disables variant

**Setup:**
- Create experiment with `autoDisableOnFraud: true`
- Simulate fraud signals for variant A users

**Steps:**
1. Generate 15+ fraud signals for variant A users in 1 hour
2. Run `monitorExperiments()` cron job
3. Verify variant A is auto-disabled
4. Verify ops team notified
5. Verify auto-disable event created

**Expected Result:**
- ✅ Variant A automatically disabled
- ✅ Variant B still active
- ✅ Ops notification sent
- ✅ Audit log created
- ✅ Reason documented

---

### 5. Kill Switch During Live Traffic

#### Test 5.1: Emergency Kill Switch Activation
**Objective:** Verify kill switch works under load

**Setup:**
- Generate simulated live traffic (100 req/sec)

**Steps:**
1. Traffic is flowing normally
2. Admin activates `CHAT_GLOBAL` kill switch
3. Monitor traffic for next 30 seconds
4. Verify all chat operations blocked
5. No errors or partial failures

**Expected Result:**
- ✅ Kill switch takes effect immediately
- ✅ No partial messages sent
- ✅ Graceful error handling
- ✅ No data corruption

---

### 6. App Restart Respects Kill Switch

#### Test 6.1: Kill Switch Enforced Without Relogin
**Objective:** Kill switch enforced even offline

**Steps:**
1. User A has app open with cached flags
2. Admin activates `DISCOVERY_GLOBAL` kill switch
3. User A's device is offline (airplane mode)
4. User A restarts app
5. App loads from cache
6. Verify discovery is still disabled (from cache)

**Expected Result:**
- ✅ Kill switch enforced from cache
- ✅ No access to disabled features offline

---

### 7. Client Integration Tests

#### Test 7.1: Mobile Flag Refresh on Foreground
**Objective:** Flags auto-refresh when app returns to foreground

**Steps:**
1. User A has app open
2. Admin changes flag state
3. User A backgrounds the app
4. User A foregrounds the app
5. Flags should auto-refresh

**Expected Result:**
- ✅ Flags refreshed on foreground
- ✅ New state reflected within seconds

---

#### Test 7.2: Web Flag Refresh on Tab Active
**Objective:** Flags auto-refresh when tab becomes visible

**Steps:**
1. User A has web app open in tab
2. Admin changes flag state
3. User A switches to different tab
4. User A returns to Avalo tab
5. Flags should auto-refresh

**Expected Result:**
- ✅ Flags refreshed on visibility change
- ✅ New state reflected

---

### 8. Security & Permissions

#### Test 8.1: Non-Admin Cannot Modify Flags
**Objective:** Verify write permissions

**Steps:**
1. Regular user tries to modify feature flag
2. Should be denied by Firestore rules

**Expected Result:**
- ✅ Write operation rejected
- ✅ Error message clear

---

#### Test 8.2: Non-Admin Cannot Activate Kill Switch
**Objective:** Verify kill switch permissions

**Steps:**
1. Regular user tries to activate kill switch
2. Should be denied

**Expected Result:**
- ✅ Operation rejected
- ✅ Only ops/admin can activate

---

### 9. Performance Tests

#### Test 9.1: Flag Evaluation Performance
**Objective:** Ensure flag checks are fast

**Steps:**
1. Measure time to evaluate 50 feature flags
2. Should complete in < 100ms

**Expected Result:**
- ✅ Evaluation is fast
- ✅ No noticeable lag

---

#### Test 9.2: Cache Hit Rate
**Objective:** Verify caching is effective

**Steps:**
1. User checks same flag 10 times
2. Monitor cache hits
3. Should hit cache 9/10 times

**Expected Result:**
- ✅ Cache working
- ✅ Reduced Firestore reads

---

### 10. Edge Cases

#### Test 10.1: Flag Doesn't Exist
**Objective:** Handle missing flags gracefully

**Steps:**
1. Client checks non-existent flag `FAKE_FEATURE`
2. Should return `false` (fail safe)

**Expected Result:**
- ✅ No errors
- ✅ Returns false

---

#### Test 10.2: Experiment Assignment with No Active Variants
**Objective:** Handle edge case

**Steps:**
1. Create experiment with all variants disabled
2. User tries to get assignment
3. Should return null gracefully

**Expected Result:**
- ✅ No errors
- ✅ Null assignment

---

## Acceptance Criteria Summary

### Must Pass (Blocking)
- ✅ Turn off CHAT_GLOBAL → all chat entry blocked
- ✅ Enable new feature for 10% EU only → correct targeting
- ✅ Assign A/B variant and keep sticky → consistency
- ✅ Kill switch during live traffic → immediate effect
- ✅ Experiment auto-disabled after fraud spike → safety
- ✅ App restart respects kill switch → enforcement

### Should Pass (Non-Blocking)
- ✅ Performance under load
- ✅ Cache efficiency
- ✅ Edge case handling
- ✅ Permission enforcement

---

## Test Execution Checklist

### Pre-Launch
- [ ] All scenario tests passing
- [ ] Security rules validated
- [ ] Indexes deployed
- [ ] Kill switches initialized
- [ ] Admin panel functional
- [ ] Monitoring alerts configured

### Post-Launch Monitoring
- [ ] Flag evaluation latency < 100ms
- [ ] Cache hit rate > 80%
- [ ] Zero unauthorized writes
- [ ] Kill switch activation < 5 seconds
- [ ] Experiment metrics accurate

---

## Rollback Plan

If critical issues found:

1. **Immediate:** Activate relevant kill switch
2. **Within 5 min:** Notify ops team
3. **Within 15 min:** Assess impact and create incident
4. **Within 1 hour:** Deploy fix or rollback code
5. **Within 24 hours:** Post-mortem and prevention plan

---

## Sign-Off

**Test Lead:** _________________  
**Date:** _________________

**Product Owner:** _________________  
**Date:** _________________

**Engineering Lead:** _________________  
**Date:** _________________

---

## Notes

- All tests should be automated where possible
- Manual testing required for UI/UX verification
- Performance testing should be done with realistic load
- Security testing should include penetration attempts

---

**PACK 428 Implementation Complete ✅**
