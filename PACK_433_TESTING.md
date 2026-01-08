# PACK 433 — Testing Guide
## Influencer Marketplace & Creator Deal Automation Engine

This document outlines comprehensive testing scenarios for all PACK 433 components.

---

## 1. CREATOR REGISTRATION & ONBOARDING

### Test Case 1.1: Valid Creator Registration
**Scenario:** Creator registers with all required fields
```
1. Call registerCreator with:
   - displayName: "TestCreator"
   - email: "test@example.com"
   - categories: ["DATING", "LIFESTYLE"]
   - country: "US"
   - language: "en"
   - platforms: [{ platform: "TIKTOK", handle: "@test", url: "..." }]

Expected: 
   - Creator profile created with status "PENDING"
   - Returns creatorId
   - Creator profile stored in Firestore
```

### Test Case 1.2: Invalid Registration - Missing Required Fields
**Scenario:** Try to register without required fields
```
1. Call registerCreator with missing email

Expected:
   - HttpsError: "invalid-argument" 
   - Error message: "Missing required fields"
```

### Test Case 1.3: Duplicate Registration
**Scenario:** Same user tries to register twice
```
1. Register creator successfully
2. Attempt to register again with same userId

Expected:
   - HttpsError: "already-exists"
   - Error message: "User is already registered as a creator"
```

###  Test Case 1.4: Platform Connection
**Scenario:** Add additional platform to creator profile
```
1. Register creator
2. Call addPlatformConnection with new platform

Expected:
   - Platform added to creator's platforms array
   - verified: false (needs admin approval)
```

---

## 2. DEAL CREATION & MANAGEMENT

### Test Case 2.1: Create CPI Deal
**Scenario:** Admin creates Cost Per Install deal
```
1. Call createDeal with:
   - creatorId: "<valid-creator-id>"
   - dealType: "CPI"
   - terms: { cpiAmount: 10, targetCountries: ["US", "UK"] }

Expected:
   - Deal created with status "DRAFT"
   - Contract text auto-generated
   - Returns dealId and contractId
```

### Test Case 2.2: Create RevShare Deal
**Scenario:** Admin creates revenue share deal
```
1. Call createDeal with:
   - dealType: "REVSHARE"
   - terms: { revSharePercentage: 15, revShareDurationDays: 90 }

Expected:
   - RevShare percentage validated (0-100)
   - Contract includes revenue share terms
```

### Test Case 2.3: Create Hybrid Deal
**Scenario:** Admin creates hybrid CPI + RevShare deal
```
1. Call createDeal with:
   - dealType: "HYBRID"
   - terms: { cpiAmount: 5, revSharePercentage: 10 }

Expected:
   - Both CPI and RevShare terms present in contract
   - Validation for both term types
```

### Test Case 2.4: Deal Validation - Invalid Terms
**Scenario:** Try to create deal with invalid terms
```
1. Create CPI deal with cpiAmount: 0
2. Create RevShare deal with revSharePercentage: 150

Expected:
   - HttpsError: "invalid-argument"
   - Specific validation error message
```

### Test Case 2.5: Creator Accept Deal
**Scenario:** Creator accepts auto-generated contract
```
1. Creator calls acceptDealContract with contractId
2. Check deal status changes to "ACTIVE"
3. Check creator stats.activeDeals incremented

Expected:
   - Contract marked as accepted
   - Deal activated
   - IP address and timestamp recorded
```

### Test Case 2.6: Deal Expiry
**Scenario:** Deal automatically expires after end date
```
1. Create deal with endDate: (yesterday)
2. Run expireDealsDaily scheduled function

Expected:
   - Deal status changed to "EXPIRED"
   - Creator activeDeals count decremented
```

---

## 3. ATTRIBUTION & TRACKING

### Test Case 3.1: First Attribution (Success)
**Scenario:** User installs app from creator link
```
1. Call registerTrafficSource for creator
2. Call createAttribution with fingerprint
3. Check attribution created with verified: false

Expected:
   - Attribution created and locked to creator
   - User attribution lock created (permanent)
   - Deal stats.totalInstalls incremented
   - Fraud check triggered automatically
```

### Test Case 3.2: Re-Attribution Prevention (One Creator Per User)
**Scenario:** User already has attribution, tries another creator link
```
1. Create attribution for creator A
2. Try to create attribution for creator B with same userId

Expected:
   - Returns existing attributionId from creator A
   - locked: true
   - No new attribution created
```

### Test Case 3.3: Geo-Targeting Validation
**Scenario:** User from excluded country tries to install
```
1. Create deal with targetCountries: ["US"]
2. Attempt attribution from country: "FR"

Expected:
   - HttpsError: "failed-precondition"
   - Error: "User country not in deal target countries"
```

### Test Case 3.4: Daily Cap Enforcement
**Scenario:** Deal reaches daily install cap
```
1. Create deal with dailyCap: 100
2. Create 100 attributions
3. Try to create 101st attribution

Expected:
   - HttpsError: "resource-exhausted"
   - Error: "Daily installation cap reached"
```

### Test Case 3.5: Track First Chat  
**Scenario:** User sends first message after install
```
1. Create attribution
2. User sends first chat message
3. Call trackFirstChat

Expected:
   - attribution.firstChatAt timestamp set
   - Attribution event recorded with type: "FIRST_CHAT"
```

### Test Case 3.6: Track First Purchase
**Scenario:** User makes first token purchase
```
1. Create attribution
2. User purchases tokens (amount: 1000)
3. Call trackFirstPurchase

Expected:
   - attribution.isPaidUser: true
   - attribution.firstPurchaseAt timestamp set
   - attribution.lifetimeRevenue: 1000
   - Deal paidUsers count incremented
```

### Test Case 3.7: Wallet Transaction Auto-Tracking
**Scenario:** Wallet purchase automatically tracked via trigger
```
1. Create attribution for user
2. Create wallet_transaction document (type: "PURCHASE", amount: 500)

Expected:
   - onWalletTransactionCreated trigger fires
   - Attribution updated automatically
   - lifetimeRevenue incremented
```

---

## 4. FRAUD DETECTION

### Test Case 4.1: Self-Referral Detection
**Scenario:** Creator tries to refer themselves
```
1. Creator user creates attribution
2. Attribution userId === Creator userId

Expected:
   - Fraud signal: SELF_REFERRAL
   - Severity: CRITICAL
   - Confidence: 100
   - Attribution verified: false
```

### Test Case 4.2: Click Farm Detection
**Scenario:** Multiple installs from same IP
```
1. Create 6+ attributions from same IP in 24 hours
2. Check fraud signals

Expected:
   - Fraud signal: CLICK_FARM
   - Severity: HIGH
   - Evidence includes IP and duplicate count
```

### Test Case 4.3: Duplicate Device Detection
**Scenario:** Same device used for multiple attributions
```
1. Create attribution with deviceId: "ABC123"
2. Create another attribution with same deviceId

Expected:
   - Fraud signal: DUPLICATE_DEVICE
   - Severity: MEDIUM
   - Confidence: 70
```

### Test Case 4.4: Rapid Install Bot Pattern
**Scenario:** Abnormal install velocity
```
1. Create 100+ attributions for same creator in 1 hour
2. Check fraud signals

Expected:
   - Fraud signal: RAPID_INSTALLS
   - Severity: HIGH
   - Description includes install count per hour
```

### Test Case 4.5: VPN/Proxy Detection
**Scenario:** Install from known VPN IP
```
1. Create attribution from VPN IP address
2. Check fraud signals

Expected:
   - Fraud signal: VPN_SPOOFING
   - Severity: MEDIUM
   - Confidence: 60
```

### Test Case 4.6: Creator Risk Score Calculation
**Scenario:** Risk score updated after fraud signals
```
1. Create multiple fraud signals for creator
2. Verify signals accumulate
3. Check creator risk score

Expected:
   - Risk score increases with confirmed fraud
   - accountStatus changes: CLEAN → WATCH_LIST → SUSPENDED → BANNED
   - Risk thresholds enforced (30, 60, 80)
```

### Test Case 4.7: Admin Fraud Review
**Scenario:** Admin reviews and confirms fraud
```
1. Admin calls reviewFraudSignal
2. Set status: "CONFIRMED"
3. Add reviewer notes

Expected:
   - Signal status updated
   - Creator risk score recalculated
   - Possible status change to SUSPENDED/BANNED
```

---

## 5. PAYOUT CALCULATIONS & REQUESTS

### Test Case 5.1: Calculate CPI Earnings
**Scenario:** Calculate payout for CPI deal
```
1. Creator has 100 verified attributions
2. Deal: CPI = 10 tokens per install
3. Call calculatePayoutAmount

Expected:
   - totalTokens: 1000
   - cpiEarnings: 1000
   - fiatAmount: $100 (assuming $0.10 per token)
   - processingFee: $2.50 (2.5%)
   - netAmount: $97.50
   - eligible: false (below 1000 token minimum)
```

### Test Case 5 .2: Calculate RevShare Earnings
**Scenario:** Calculate revenue share payout
```
1. Creator has 10 attributions
2. Each user spent 5000 tokens lifetime
3. Deal: RevShare = 20%
4. Total revenue: 50,000 tokens

Expected:
   - revShareEarnings: 10,000 tokens (20% of 50,000)
   - fiatAmount: $1,000
   - eligible: true
```

### Test Case 5.3: Minimum Payout Threshold
**Scenario:** Earnings below minimum threshold
```
1. Creator earnings: 500 tokens
2. Minimum: 1000 tokens
3. Calculate payout

Expected:
   - eligible: false
   - reason: "Minimum payout is 1000 tokens"
```

### Test Case 5.4: Request Payout (Success)
**Scenario:** Creator requests payout above threshold
```
1. Creator has 2000 eligible tokens
2. Call requestPayout with payoutAccountId
3. Check payout created

Expected:
   - Payout status: "PENDING"
   - Breakdown includes CPI/CPS/RevShare
   - Tax year set to current year
   - fraudChecked: false (needs review)
```

### Test Case 5.5: Prevent Duplicate Payout Requests
**Scenario:** Creator has pending payout, tries to request another
```
1. Submit payout request (status: PENDING)
2. Try to submit another request

Expected:
   - HttpsError: "failed-precondition"
   - Error: "You already have a pending payout request"
```

### Test Case 5.6: Payout Account Verification Required
**Scenario:** Try to request payout with unverified account
```
1. Add payout account (verified: false)
2. Request payout with that account

Expected:
   - HttpsError: "failed-precondition"
   - Error: "Payout account not verified"
```

### Test Case 5.7: Suspended Creator Cannot Request Payout
**Scenario:** Banned creator tries to request payout
```
1. Creator status: "BANNED"
2. Call calculatePayoutAmount

Expected:
   - eligible: false
   - reason: "Account suspended or banned"
   - totalTokens: 0
```

---

## 6. ADMIN PAYOUT PROCESSING

### Test Case 6.1: Process Payout (Admin)
**Scenario:** Admin approves and processes payout
```
1. Creator has pending payout (fraudChecked: true, status: PENDING)
2. Admin calls processPayout
3. Check payout completed

Expected:
   - Status: PROCESSING → COMPLETED
   - transactionId generated
   - processedAt and completedAt timestamps set
```

### Test Case 6.2: Fraud Hold on Payout
**Scenario:** Admin places fraud hold on suspicious payout
```
1. Payout has high risk creator
2. Admin calls holdPayoutForFraud with reason
3. Check payout frozen

Expected:
   - Status: "FRAUD_HOLD"
   - fraudCheckResult: "REVIEW"
   - fraudNotes contains admin reason
```

### Test Case 6.3: Weekly Automated Payouts
**Scenario:** Scheduled function processes all verified payouts
```
1. Multiple payouts with status: PENDING, fraudChecked: true, fraudCheckResult: PASS
2. Run processWeeklyPayouts scheduled function

Expected:
   - All eligible payouts processed
   - Status changed to COMPLETED
   - Counts logged (processed vs failed)
```

---

## 7. INTEGRATION & END-TO-END SCENARIOS

### Test Case 7.1: Complete Creator Journey - CPI
**Scenario:** Full lifecycle from registration to payout
```
1. Creator registers → status: PENDING
2. Admin approves creator → status: ACTIVE
3. Admin creates CPI deal (10 tokens per install)
4. Creator accepts deal
5. 150 users install via creator link
6. Fraud check runs → 5 flagged, 145 verified
7. Creator requests payout
8. Admin processes payout
9. Verify:
   - Earnings: 145 * 10 = 1450 tokens
   - Payout status: COMPLETED
   - Creator can see payout in history
```

### Test Case 7.2: Complete Creator Journey - RevShare
**Scenario:** Revenue share lifecycle
```
1. Creator approved with RevShare deal (15%)
2. 20 users attributed to creator
3. 10 users make purchases (avg 2000 tokens each)
4. Total revenue: 20,000 tokens
5. Creator earnings: 3,000 tokens (15%)
6. Request and process payout
7. Verify payout includes revShareEarnings: 3000
```

### Test Case 7.3: Fraud Campaign Rollback
**Scenario:** Creator caught running fraud campaign
```
1. Creator has 200 attributions
2. Fraud system detects:
   - 50 self-referrals
   - 100 click farm installs
   - 30 VPN spoofing
3. Risk score > 80 → status: BANNED
4. Pending payout automatically held
5. Verify:
   - Creator status: BANNED
   - Active deals terminated
   - Payouts frozen
   - Admin notified
```

### Test Case 7.4: Deal Performance Analysis
**Scenario:** Analyze deal effectiveness over time
```
1. Deal runs for 30 days
2. Track metrics:
   - Total installs
   - Conversion rate to paid users
   - Revenue per install
   - Creator compliance
3. Admin reviews dashboard
4. Adjust deal terms if needed
```

---

## 8. PERFORMANCE & SCALE TESTING

### Test Case 8.1: High Attribution Volume
**Scenario:** Handle 10,000 simultaneous attributions
```
1. Simulate 10,000 users installing in 1 hour
2. Monitor:
   - Attribution creation latency
   - Fraud check processing time
   - Deal stats update delay

Expected:
   - All attributions processed successfully
   - No attribution locks violated
   - Fraud checks complete within 5 minutes
```

### Test Case 8.2: Payout Calculation Performance
**Scenario:** Calculate payout for creator with 100,000 attributions
```
1. Creator has 100k+ verified attributions
2. Call calculatePayoutAmount
3. Measure execution time

Expected:
   - Calculation completes < 30 seconds
   - Accurate earnings breakdown
   - No timeout errors
```

### Test Case 8.3: Daily Fraud Scan at Scale
**Scenario:** Scan 1000+ active creators
```
1. 1000 active creators in system
2. Run dailyFraudScan scheduled function
3. Monitor execution

Expected:
   - All creators scanned
   - Risk scores updated
   - Completes within 10 minutes
   - No memory exhaustion
```

---

## 9. ERROR HANDLING & EDGE CASES

### Test Case 9.1: Network Retry Logic
**Scenario:** Handle Firebase connection errors
```
1. Simulate network interruption during attribution creation
2. Verify retry attempts
3. Check data consistency

Expected:
   - Retry up to 3 times
   - No duplicate attributions created
   - Error logged appropriately
```

### Test Case 9.2: Concurrent Deal Updates
**Scenario:** Multiple admins update same deal simultaneously
```
1. Admin A updates deal terms
2. Admin B updates deal status (same time)
3. Check for conflicts

Expected:
   - Firebase transaction prevents conflicts
   - Last write wins or error thrown
   - Data integrity maintained
```

### Test Case 9.3: Missing Deal Reference
**Scenario:** Attribution references deleted deal
```
1. Create attribution with dealId
2. Admin deletes deal
3. Try to calculate payout

Expected:
   - Gracefully skip missing deal
   - Log warning
   - Don't crash calculation
```

---

## TEST EXECUTION CHECKLIST

### Setup
- [ ] Deploy all PACK 433 Cloud Functions
- [ ] Configure Firebase indexes
- [ ] Set up test users (creators, admins)
- [ ] Prepare test data sets

### Unit Tests
- [ ] Creator registration flows
- [ ] Deal creation & validation
- [ ] Attribution logic
- [ ] Fraud detection rules
- [ ] Payout calculations

### Integration Tests
- [ ] End-to-end creator journey
- [ ] Multi-deal scenarios
- [ ] Cross-component interactions

### Performance Tests
- [ ] High volume attribution
- [ ] Large-scale fraud scans
- [ ] Complex payout calculations

### Security Tests
- [ ] Permission enforcement
- [ ] Attribution tampering prevention
- [ ] Payout fraud prevention

### Monitoring
- [ ] Set up Cloud Monitoring alerts
- [ ] Configure error reporting
- [ ] Enable Cloud Logging

---

## ACCEPTANCE CRITERIA

✅ **All test cases pass** without errors  
✅ **Fraud detection** catches 95%+ of known fraud patterns  
✅ **Attribution locks** are never violated (0 re-attributions)  
✅ **Payout calculations** are 100% accurate  
✅ **System handles** 10,000+ attributions/hour  
✅ **Fraud scans complete** within SLA (10 min for 1000 creators)  
✅ **Zero manual contract** negotiations needed  
✅ **Admin dashboard** displays real-time data  

---

## POST-DEPLOYMENT VERIFICATION

After deploying to production:

1. **Smoke Test**: Create test creator, deal, and attribution
2. **Monitor Logs**: Check for errors in first 24 hours
3. **Performance Metrics**: Validate latency < 500ms for attributions
4. **Fraud System**: Verify daily scans running on schedule
5. **Payout Flow**: Test end-to-end with small real payout
6. **Dashboard**: Ensure all metrics loading correctly

---

**Testing Complete? The Creator Marketplace is Ready for Global Scale! 🚀**
