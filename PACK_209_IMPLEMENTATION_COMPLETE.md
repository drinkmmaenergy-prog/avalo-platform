# PACK 209 — Unified Meeting & Event Refund & Complaint Extensions

## ✅ IMPLEMENTATION COMPLETE

This pack extends existing meeting and event modules with unified refund policies, appearance complaint flows, and voluntary refund systems while preserving Avalo's non-refundable commission structure.

---

## 📋 OVERVIEW

PACK 209 unifies and extends:
- **1:1 paid time bookings** (calendar meetings)
- **Paid group events** (offline events with tickets)
- **Refund and complaint logic**
- **"Not as described / looks different than profile" flows**
- **Voluntary refund button** for earner/organizer

**Core Principle**: Avalo commission remains non-refundable everywhere.

---

## 🏗️ ARCHITECTURE

### New Collections

1. **`refund_transactions`** - Detailed refund transaction logs
2. **`voluntary_refunds`** - Voluntary refund records
3. **`appearance_complaints`** - Appearance/identity mismatch complaints
4. **`trust_safety_incidents`** - Trust & safety incident tracking

### Enhanced Collections

1. **`calendarBookings`** - Added complaint and refund fields
2. **`event_attendees`** - Added voluntary refund tracking
3. **`user_trust_profile`** - Trust score updates from complaints

---

## 💰 REFUND POLICIES

### 1:1 Meetings (65% Earner / 35% Avalo)

| Cancellation By | Time Before Meeting | Refund to Payer | Earner Share | Avalo 35% |
|-----------------|---------------------|-----------------|--------------|-----------|
| **Payer** | ≥ 72 hours | 100% of earner share | 0% kept | Always kept |
| **Payer** | 24-72 hours | 50% of earner share | 50% kept | Always kept |
| **Payer** | < 24 hours | 0% refund | 100% kept | Always kept |
| **Earner** | Any time | 100% of earner share | 0% kept | Always kept |

### Events (80% Organizer / 20% Avalo)

| Scenario | Refund Policy | Organizer Share | Avalo 20% |
|----------|---------------|----------------|-----------|
| **Participant cancels** | No refund (ticket lost) | Keeps 80% | Always kept |
| **Organizer cancels** | 100% of organizer share refunded | Returns 80% | Always kept |
| **Participant no-show** | No refund | Keeps 80% | Always kept |

---

## 🚨 APPEARANCE COMPLAINT FLOWS

### 1:1 Meetings

Either party can file a complaint during an active meeting if the other person looks significantly different from their profile photos.

**Process:**
1. User presses "Appearance / Identity Issue" button in meeting screen
2. Takes live selfie at meeting spot
3. System compares live selfie to profile photos and KYC verification
4. User chooses outcome:
   - **Keep Meeting as Completed**: No refund, normal split (65/35), profile flagged
   - **Issue Full Refund**: Payer receives 100% of earner share, earner gets 0, Avalo keeps 35%

**Implementation:**
- Function: [`processAppearanceComplaint()`](functions/src/pack209-refund-complaint-engine.ts:165)
- Endpoint: [`pack209_fileAppearanceComplaint`](functions/src/index.ts:4527)
- UI Component: [`AppearanceComplaintModal`](app-mobile/app/components/pack209/AppearanceComplaintModal.tsx:1)

### Events

Organizer has discretion over participant appearance issues:
- Can deny entry
- Can choose to refund 80% (organizer share) or not
- Avalo keeps 20% commission regardless
- All cases logged in trust/safety system

**Implementation:**
- Function: [`processEventAppearanceComplaint()`](functions/src/pack209-refund-complaint-engine.ts:303)
- Endpoint: [`pack209_fileEventAppearanceComplaint`](functions/src/index.ts:4547)

---

## 💝 VOLUNTARY REFUND SYSTEM

### 1:1 Meetings

After meeting completes and funds are in "pending payout", earner sees voluntary refund option:

**Refund Slider:**
- 0% (no refund)
- 25% (quarter refund)
- 50% (half refund)
- 100% (full refund)

**Rules:**
- Avalo keeps 35% commission (non-refundable)
- Payer receives X% of earner share (65%)
- Earner's pending earnings reduced accordingly

**Use Cases:**
- "I really liked them, I want to give back the money"
- "It didn't feel right to charge full price"
- "We will see each other again, building goodwill"

**Implementation:**
- Function: [`processVoluntaryMeetingRefund()`](functions/src/pack209-refund-complaint-engine.ts:408)
- Endpoint: [`pack209_issueVoluntaryRefund`](functions/src/index.ts:4535)
- UI Component: [`VoluntaryRefundModal`](app-mobile/app/components/pack209/VoluntaryRefundModal.tsx:1)

### Events

Organizer can:
- Select specific attendee
- Choose voluntary refund 0-100% of organizer share (80%)
- Avalo keeps 20% commission unaffected

**Use Cases:**
- Event quality problems
- Technical issues (music, venue)
- Organizer's goodwill gestures

**Implementation:**
- Function: [`processVoluntaryEventRefund()`](functions/src/pack209-refund-complaint-engine.ts:512)
- Endpoint: [`pack209_issueEventVoluntaryRefund`](functions/src/index.ts:4556)

---

## 📊 DATA STRUCTURES

### RefundTransaction
```typescript
{
  transactionId: string;
  refundType: RefundTrigger; // CANCELLATION_EARLY/MID/LATE, ORGANIZER_CANCEL, APPEARANCE_MISMATCH, VOLUNTARY_REFUND
  bookingId?: string;
  eventId?: string;
  payerId: string;
  earnerId: string | null;
  originalAmount: number;
  earnerShare: number;
  avaloCommission: number;
  refundToPayerAmount: number;
  earnerKeptAmount: number;
  avaloKeptAmount: number; // Always equals avaloCommission
  triggeredBy: string;
  automaticRefund: boolean;
  hoursBeforeMeeting?: number;
  notes?: string;
  createdAt: Timestamp;
  processedAt?: Timestamp;
  metadata?: {
    source: 'meeting' | 'event';
    cancellationReason?: string;
  };
}
```

### AppearanceComplaint
```typescript
{
  complaintId: string;
  bookingId?: string; // For 1:1 meetings
  eventId?: string; // For events
  type: ComplaintType; // APPEARANCE_MISMATCH, IDENTITY_ISSUE, SAFETY_CONCERN
  complainantId: string;
  reportedUserId: string;
  decision: ComplaintDecision; // KEEP_COMPLETED or ISSUE_REFUND
  liveSelfieUrl?: string;
  profilePhotosUrls?: string[];
  mismatchScore?: number; // AI comparison score 0-100
  manualReview?: boolean;
  refundAmount?: number;
  tokensKept?: number; // Avalo commission
  trustScoreImpact?: number;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}
```

### VoluntaryRefund
```typescript
{
  refundId: string;
  bookingId?: string;
  eventId?: string;
  attendeeId?: string;
  issuedBy: string;
  recipientId: string;
  originalAmount: number;
  earnerShareAmount: number; // 65% for meetings, 80% for events
  avaloCommission: number; // 35% for meetings, 20% for events
  refundPercent: number; // 0-100
  refundAmount: number;
  reason?: string;
  createdAt: Timestamp;
  processedAt?: Timestamp;
  metadata: { source: 'meeting' | 'event' };
}
```

### TrustSafetyIncident
```typescript
{
  incidentId: string;
  type: 'APPEARANCE_COMPLAINT' | 'VOLUNTARY_REFUND' | 'CANCELLATION_PATTERN' | 'NO_SHOW';
  userId: string; // User being flagged
  relatedUserId?: string;
  complaintId?: string;
  bookingId?: string;
  eventId?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  actionTaken?: 'FLAGGED' | 'PHOTO_UPDATE_REQUIRED' | 'RESTRICTED' | 'BANNED' | 'CLEARED';
  trustScoreImpact: number;
  requiresManualReview: boolean;
  createdAt: Timestamp;
}
```

---

## 🔧 IMPLEMENTATION FILES

### Backend (Cloud Functions)

| File | Purpose |
|------|---------|
| [`pack209-refund-complaint-types.ts`](functions/src/pack209-refund-complaint-types.ts:1) | Type definitions and constants |
| [`pack209-refund-complaint-engine.ts`](functions/src/pack209-refund-complaint-engine.ts:1) | Core refund calculation and processing logic |
| [`pack209-events-refund.ts`](functions/src/pack209-events-refund.ts:1) | Event-specific refund implementations |
| [`pack209-admin-endpoints.ts`](functions/src/pack209-admin-endpoints.ts:1) | Admin dashboard endpoints |
| [`calendar.ts`](functions/src/calendar.ts:1) | Enhanced with PACK 209 integration |
| [`index.ts`](functions/src/index.ts:4503) | Function exports |

### Frontend (Mobile UI)

| File | Purpose |
|------|---------|
| [`AppearanceComplaintModal.tsx`](app-mobile/app/components/pack209/AppearanceComplaintModal.tsx:1) | UI for filing appearance complaints |
| [`VoluntaryRefundModal.tsx`](app-mobile/app/components/pack209/VoluntaryRefundModal.tsx:1) | UI for issuing voluntary refunds |
| [`RefundPolicyCard.tsx`](app-mobile/app/components/pack209/RefundPolicyCard.tsx:1) | Display refund policy information |
| [`RefundHistoryScreen.tsx`](app-mobile/app/components/pack209/RefundHistoryScreen.tsx:1) | View refund and complaint history |

### Database

| File | Purpose |
|------|---------|
| [`firestore-pack209-refund-complaint.rules`](firestore-pack209-refund-complaint.rules:1) | Security rules for new collections |
| [`firestore-pack209-refund-complaint.indexes.json`](firestore-pack209-refund-complaint.indexes.json:1) | Composite indexes for queries |

---

## 🔌 API ENDPOINTS

### User Endpoints

#### 1:1 Meetings
- `pack209_fileAppearanceComplaint` - File appearance complaint with decision
- `pack209_issueVoluntaryRefund` - Issue voluntary refund (earner only)
- `pack209_getRefundHistory` - Get user's refund/complaint history

#### Events
- `pack209_cancelEventWithRefunds` - Cancel event with automatic refunds
- `pack209_fileEventAppearanceComplaint` - File complaint (organizer only)
- `pack209_issueEventVoluntaryRefund` - Issue voluntary refund to attendee
- `pack209_leaveEventWithLogging` - Leave event with enhanced logging

### Admin Endpoints

- `pack209_admin_getComplaints` - Get all appearance complaints
- `pack209_admin_getRefundTransactions` - Get all refund transactions
- `pack209_admin_getVoluntaryRefunds` - Get all voluntary refunds
- `pack209_admin_getTrustIncidents` - Get trust & safety incidents
- `pack209_admin_reviewIncident` - Review and resolve incidents
- `pack209_admin_getRefundStats` - Refund statistics dashboard
- `pack209_admin_getVoluntaryRefundStats` - Voluntary refund statistics
- `pack209_admin_getComplaintStats` - Complaint statistics
- `pack209_admin_forceRefund` - Emergency admin refund override

---

## 🔐 SECURITY RULES

### Access Control

**Refund Transactions:**
- Read: Only payer, earner, or admins
- Write: Server-side only (Cloud Functions)

**Voluntary Refunds:**
- Read: Only issuer, recipient, or admins
- Write: Server-side only

**Appearance Complaints:**
- Read: Only complainant, reported user, admins, or moderators
- Write: Server-side only

**Trust Safety Incidents:**
- Read: Flagged user (limited), admins, moderators
- Update: Only admins/moderators (review actions only)
- Delete: Only admins

---

## 📱 MOBILE UI COMPONENTS

### AppearanceComplaintModal

Visual flow for filing complaints during active meetings:

**Steps:**
1. **Warning** - Explains feature is for serious safety concerns only
2. **Camera** - Take live selfie at meeting spot
3. **Decision** - Choose KEEP_COMPLETED or ISSUE_REFUND
4. **Processing** - Submit complaint to backend

**Features:**
- Live selfie capture with expo-camera
- Location capture for verification
- Clear explanation of consequences
- Visual comparison preview

### VoluntaryRefundModal

Earner/organizer goodwill refund interface:

**Features:**
- Slider control (0%, 25%, 50%, 100%)
- Quick-select buttons
- Real-time refund calculation
- Earnings breakdown display
- Optional reason field
- Clear summary of who keeps what

**Visual Feedback:**
- Shows refund amount in tokens
- Shows remaining earnings
- Reminds about non-refundable Avalo commission

### RefundPolicyCard

Information card displaying refund policies:

**For Meetings:**
- 65/35 split visualization
- Time-based refund table
- Earner cancellation policy
- Tips for maximizing refunds

**For Events:**
- 80/20 split visualization
- No-refund policy for participants
- Organizer cancellation policy
- Goodwill refund explanation

### RefundHistoryScreen

Tabbed history viewer:

**Tabs:**
1. **Refunds** - Standard cancellation refunds
2. **Voluntary** - Voluntary refunds issued/received
3. **Complaints** - Appearance complaints filed/received

**Features:**
- Pull-to-refresh
- Color-coded amounts (+ green, - red)
- Source tags (meeting/event)
- Decision indicators
- Detailed breakdowns

---

## 🔄 INTEGRATION POINTS

### Calendar Bookings

Enhanced [`calendar.ts`](functions/src/calendar.ts:1) with:
- PACK 209 refund calculation engine
- Complaint filing endpoint
- Voluntary refund endpoint
- Refund history endpoint
- Enhanced cancellation with detailed logging

### Events System

New file [`pack209-events-refund.ts`](functions/src/pack209-events-refund.ts:1) with:
- Enhanced event cancellation with refunds
- Event appearance complaint handling
- Voluntary event refunds
- Participant leave with logging

---

## 📈 TRUST & SAFETY INTEGRATION

### Complaint Impacts

**ISSUE_REFUND Decision:**
- Trust score: -50 points
- Action: PHOTO_UPDATE_REQUIRED
- Severity: HIGH
- Manual review: Required

**KEEP_COMPLETED Decision:**
- Trust score: -20 points
- Action: FLAGGED
- Severity: MEDIUM
- Manual review: Required

### Incident Logging

All refunds and complaints create trust incidents:
- Type classification
- Severity assessment
- Action taken tracking
- Manual review flagging
- Audit trail maintenance

---

## 🎯 KEY FEATURES

### 1. Non-Refundable Commission Enforcement

**Meetings:**
- 35% Avalo commission ALWAYS kept
- Only 65% earner share can be refunded
- Enforced in all refund calculations

**Events:**
- 20% Avalo commission ALWAYS kept
- Only 80% organizer share can be refunded
- Enforced in all refund calculations

### 2. Time-Based Refund Logic

Automatic calculation based on hours until meeting:
- ≥72h: Full refund
- 24-72h: Partial refund (50%)
- <24h: No refund

### 3. Symmetrical Complaint System

Both parties in 1:1 meetings can file complaints:
- Man books woman who looks different → can file complaint
- Woman earns from man who looks different → can file complaint
- Protection for both sides without losing commission

### 4. Voluntary Refund Flexibility

Earners/organizers control goodwill:
- Slider-based percentage selection
- Optional reason field
- Instant processing
- Builds trust and relationships

### 5. Comprehensive Audit Trail

All actions logged with:
- Transaction IDs
- Timestamps
- User IDs
- Amounts
- Reasons
- Metadata

---

## 📊 ADMIN DASHBOARD CAPABILITIES

### Statistics & Analytics

**Refund Statistics:**
- Total refunds processed
- Total amount refunded
- Avalo commission retained
- Breakdown by trigger type
- Source distribution (meeting/event)
- Average refund amounts

**Voluntary Refund Statistics:**
- Total voluntary refunds
- Amount distribution
- Percentage patterns
- Source breakdown
- Sentiment analysis

**Complaint Statistics:**
- Total complaints filed
- Decision breakdown
- Refund amounts from complaints
- Manual review queue
- Average mismatch scores

### Case Management

**Appearance Complaints:**
- Filter by decision, review status, source
- View live selfies and profile comparisons
- Review mismatch scores
- Update resolution status

**Trust Incidents:**
- Filter by type, severity, review status
- Apply actions (FLAG, RESTRICT, BAN, CLEAR)
- Track trust score impacts
- Review history and patterns

### Emergency Tools

**Force Refund:**
- Admin override for special cases
- Direct token transfer
- Bypass normal policies
- Audit trail maintained

---

## 🔒 SECURITY FEATURES

### Fraud Prevention

1. **Refund Limits:**
   - Only from earner/organizer share
   - Never from Avalo commission
   - Atomic transactions

2. **Complaint Verification:**
   - Live selfie required
   - Location capture
   - Timestamp validation
   - Device ID tracking

3. **Trust Score Integration:**
   - Automatic penalties for complaints
   - Pattern detection
   - Manual review triggers
   - Photo verification requirements

### Privacy Protection

1. **Data Access:**
   - Users see only their own transactions
   - Admins/moderators have elevated access
   - Sensitive fields protected

2. **Complaint Privacy:**
   - Live selfies stored securely
   - Limited visibility
   - GDPR-compliant retention

---

## 🎨 UI/UX DESIGN PRINCIPLES

### Clear Communication

- Visual split breakdowns (65/35, 80/20)
- Color-coded amounts
- Emoji indicators for quick scanning
- Plain language explanations

### Decision Support

- Real-time calculations
- Visual previews
- Consequence explanations
- Reversibility information

### Trust Building

- Transparent policies
- Fair for both sides
- Voluntary options
- Safety-first design

---

## 🚀 DEPLOYMENT CHECKLIST

- [x] Type definitions created
- [x] Core engine implemented
- [x] Meeting integration complete
- [x] Event integration complete  
- [x] Firestore rules created
- [x] Composite indexes defined
- [x] Admin endpoints implemented
- [x] Mobile UI components created
- [x] API exports added to index.ts
- [x] Trust & safety logging integrated
- [x] Documentation completed

---

## 📝 USAGE EXAMPLES

### File Appearance Complaint (1:1 Meeting)

```typescript
// During active meeting, user presses complaint button
const result = await pack209_fileAppearanceComplaint({
  bookingId: 'booking_123',
  reportedUserId: 'user_456',
  liveSelfieUrl: 'https://...',
  decision: 'ISSUE_REFUND', // or 'KEEP_COMPLETED'
  notes: 'Person looks completely different from photos',
  mismatchScore: 85,
  location: { latitude: 52.2297, longitude: 21.0122 },
});

// Returns: { complaintId, refundAmount, decision }
```

### Issue Voluntary Refund (Meeting)

```typescript
// After meeting completes, earner offers goodwill refund
const result = await pack209_issueVoluntaryRefund({
  bookingId: 'booking_123',
  refundPercent: 50, // 50% of earner share (65%)
  reason: 'Really enjoyed our time, want to give back',
});

// Returns: { refundId, refundAmount }
```

### Cancel Event with Refunds (Organizer)

```typescript
// Organizer cancels event
const result = await pack209_cancelEventWithRefunds({
  eventId: 'event_789',
  reason: 'Venue cancelled unexpectedly',
});

// Returns: { refundedCount, totalRefunded }
// All participants automatically refunded 80% (organizer share)
```

### Voluntary Event Refund (Organizer)

```typescript
// Organizer refunds specific attendee
const result = await pack209_issueEventVoluntaryRefund({
  eventId: 'event_789',
  attendeeId: 'attendee_123',
  refundPercent: 100, // Full organizer share
  reason: 'Technical issues with sound system',
});

// Returns: { refundId, refundAmount }
```

---

## 🔍 ADMIN QUERIES

### Get Refund Statistics

```typescript
const stats = await pack209_admin_getRefundStats({
  timeframe: '30d', // 7d, 30d, 90d
});

// Returns:
// {
//   totalRefunds: 152,
//   totalRefundedAmount: 45600,
//   totalAvaloKept: 15900,
//   byTrigger: { CANCELLATION_EARLY: 80, CANCELLATION_MID: 45, ... },
//   bySource: { meeting: 120, event: 32 },
//   averageRefundAmount: 300
// }
```

### Get Appearance Complaints

```typescript
const complaints = await pack209_admin_getComplaints({
  limit: 50,
  decision: 'ISSUE_REFUND', // Filter by decision
  requiresReview: true, // Only unreviewed
  source: 'meeting', // meetings or events
});

// Returns filtered complaint list with metadata
```

### Review Trust Incident

```typescript
await pack209_admin_reviewIncident({
  incidentId: 'incident_123',
  actionTaken: 'PHOTO_UPDATE_REQUIRED',
  notes: 'User must update profile photos within 7 days',
});

// Updates incident status and removes from review queue
```

---

## 🎯 BUSINESS RULES SUMMARY

### Immutable Rules

1. **Avalo commission is NEVER refunded**
   - 35% for meetings
   - 20% for events
   - Enforced in all scenarios

2. **Refunds always come from earner/organizer share**
   - Meetings: 65% pool
   - Events: 80% pool

3. **Participant event cancellations: No refunds**
   - Tickets are non-refundable
   - Enforced regardless of timing

4. **Organizer event cancellations: Full refunds**
   - 100% of organizer share returned
   - All participants refunded automatically

### Flexible Rules

1. **Voluntary refunds**
   - 0-100% of earner/organizer share
   - Discretionary
   - Builds goodwill

2. **Appearance complaints**
   - Both parties can file
   - Choice between keep/refund
   - Symmetrical protection

---

## 🌍 IMPACT ON EXISTING SYSTEMS

### No Changes To:
- ✅ Chat tokenomics (100 tokens base, 65/35 split)
- ✅ Paid messages (word-based logic)
- ✅ Dynamic chat pricing (100-500 tokens)
- ✅ Free chats with low-popularity profiles
- ✅ Call monetization
- ✅ Gift system
- ✅ Story unlocks

### Enhanced Systems:
- ✅ Calendar bookings - now with PACK 209 refund policies
- ✅ Events - now with unified refund and complaint handling
- ✅ Trust & safety - now tracks appearance issues
- ✅ Transaction logging - now includes refund details

---

## 📞 SUPPORT & MODERATION

### User Support

Users can:
- View complete refund history
- File appearance complaints
- Issue voluntary refunds
- Understanding policies through UI cards

### Moderator Tools

Moderators can:
- Review appearance complaints
- Approve/reject photo update requirements
- Track refund patterns
- Monitor trust incidents
- Force admin refunds (emergency)

### Safety Features

1. **Appearance Verification:**
   - Live selfie comparison
   - AI mismatch scoring
   - Manual review flags
   - Photo update enforcement

2. **Fraud Detection:**
   - Pattern analysis
   - Trust score impacts
   - Restriction automation
   - Ban capabilities

3. **Audit Trail:**
   - Complete transaction logs
   - Timestamp tracking
   - Admin action logging
   - GDPR-compliant storage

---

## ✨ UNIQUE FEATURES

### 1. Symmetrical Protection
Both parties in 1:1 meetings have equal complaint rights - no gender bias.

### 2. Non-Refundable Commission
Avalo always keeps its share, ensuring platform sustainability.

### 3. Voluntary Refund Culture
Encourages goodwill and relationship building through optional refunds.

### 4. Time-Based Fairness
Early cancellations get better refunds - rewards planning and respect.

### 5. Zero Participant Refunds (Events)
Clear policy prevents last-minute dropouts and ensures organizer revenue.

---

## 🧪 TESTING RECOMMENDATIONS

### Test Scenarios

**1:1 Meetings:**
- [ ] Cancel 72+ hours before → Full refund
- [ ] Cancel 48 hours before → 50% refund
- [ ] Cancel 12 hours before → No refund
- [ ] Earner cancels → Full refund
- [ ] File complaint with KEEP_COMPLETED
- [ ] File complaint with ISSUE_REFUND
- [ ] Issue 25% voluntary refund
- [ ] Issue 100% voluntary refund

**Events:**
- [ ] Participant cancels → No refund
- [ ] Organizer cancels → All participants refunded
- [ ] Participant no-show → No refund
- [ ] Organizer issues voluntary refund
- [ ] Organizer files appearance complaint with refund
- [ ] Organizer files appearance complaint without refund

**Admin:**
- [ ] View refund statistics
- [ ] View complaint dashboard
- [ ] Review trust incidents
- [ ] Force emergency refund
- [ ] Export refund reports

---

## 📚 RELATED PACKS

- **PACK 69** - Calendar booking system (base)
- **PACK 117** - Events system (base)
- **PACK 85** - Trust & Risk Engine (integration)
- **PACK 88** - Moderator Console (integration)
- **PACK 128** - Treasury system (integration)

---

## 🎓 DEVELOPER NOTES

### Refund Calculation Logic

The core refund calculation uses time-based policies:

```typescript
const refundCalc = await calculateMeetingRefund({
  bookingId,
  meetingStartTime: booking.slot.start,
  priceTokens: booking.priceTokens,
  earnerShareTokens: booking.payment.escrowTokens, // 65%
  avaloCommission: booking.payment.platformFeeTokens, // 35%
  cancelledBy: 'payer' | 'earner',
});

// Returns:
// {
//   canRefund: boolean,
//   refundToPayerAmount: number,
//   earnerKeeptAmount: number,
//   avaloKeepsAmount: number, // Always equals avaloCommission
//   policy: MeetingRefundPolicy,
//   reason: string
// }
```

### Transaction Atomicity

All refund operations use Firestore transactions to ensure:
- Atomic balance updates
- Consistent state
- No double refunds
- Audit trail integrity

### Trust Score Updates

Appearance complaints trigger trust score adjustments:
- ISSUE_REFUND: -50 points
- KEEP_COMPLETED: -20 points
- Updated asynchronously
- Non-blocking

---

## 🚨 IMPORTANT NOTES

1. **Avalo Commission Protection:**
   - Commission is ALWAYS non-refundable
   - Hardcoded in all refund calculations
   - Enforced at transaction level

2. **No Retroactive Refunds:**
   - Refunds only for future bookings
   - Cannot refund completed meetings (except via voluntary)
   - Cannot refund past events

3. **Voluntary Refunds are Final:**
   - Cannot be reversed
   - Immediate token transfer
   - No undo mechanism

4. **Complaints are Permanent:**
   - Create permanent records
   - Impact trust scores
   - Cannot be deleted (only by admin)

---

## 🎉 COMPLETION STATUS

**PACK 209 COMPLETE** — Unified Meeting & Event Refund & Complaint Extensions implemented

### ✅ All Features Delivered:

- ✅ Standard cancellation policy for 1:1 meetings
- ✅ Standard cancellation policy for events
- ✅ "Not as described" complaint flow for meetings
- ✅ "Not as described" flow for events
- ✅ Voluntary refund system for meetings
- ✅ Voluntary refund system for events
- ✅ Trust & safety logging system
- ✅ Firestore rules and indexes
- ✅ Cloud Functions exports
- ✅ Mobile UI components
- ✅ Admin dashboard endpoints
- ✅ Comprehensive documentation

### 📦 Files Created:

**Backend (6 files):**
1. `functions/src/pack209-refund-complaint-types.ts`
2. `functions/src/pack209-refund-complaint-engine.ts`
3. `functions/src/pack209-events-refund.ts`
4. `functions/src/pack209-admin-endpoints.ts`
5. `firestore-pack209-refund-complaint.rules`
6. `firestore-pack209-refund-complaint.indexes.json`

**Frontend (4 files):**
1. `app-mobile/app/components/pack209/AppearanceComplaintModal.tsx`
2. `app-mobile/app/components/pack209/VoluntaryRefundModal.tsx`
3. `app-mobile/app/components/pack209/RefundPolicyCard.tsx`
4. `app-mobile/app/components/pack209/RefundHistoryScreen.tsx`

**Enhanced Files:**
1. `functions/src/calendar.ts` - Integrated PACK 209 logic
2. `functions/src/index.ts` - Added exports

---

## 🚀 NEXT STEPS FOR DEPLOYMENT

1. Deploy Firestore indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

2. Deploy Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

3. Deploy Cloud Functions:
   ```bash
   firebase deploy --only functions:pack209_*
   ```

4. Test in staging environment
5. Monitor refund patterns
6. Train support team
7. Deploy to production

---

**Implementation Date:** December 1, 2025  
**Status:** ✅ COMPLETE  
**Version:** 1.0.0