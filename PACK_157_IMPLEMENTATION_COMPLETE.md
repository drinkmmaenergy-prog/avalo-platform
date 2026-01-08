# PACK 157 — Avalo Offline Business Verification & Physical Venue Partnerships

**Status**: ✅ **IMPLEMENTATION COMPLETE**

## Overview

PACK 157 implements a comprehensive business partnership and physical venue system for Avalo, allowing gyms, dance studios, coworking spaces, and other **STRICTLY SFW professional venues** to host events, workshops, and challenges. The system includes:

- Business partner verification flow with document upload
- Venue profile management
- Event scheduling and attendance tracking
- QR code check-in system
- Automated safety enforcement with **ZERO tolerance** for romantic/NSFW content
- Integration with Ambassador/City Leader system (PACK 152)
- Token-based payments (65% creator / 35% Avalo split)

### Critical Safety Rules

🚨 **NON-NEGOTIABLE ENFORCEMENT**:
- ❌ ZERO tolerance for romantic/dating venues or events
- ❌ ZERO tolerance for NSFW/adult entertainment
- ❌ NO visibility boosts in feed (partnerships don't affect ranking)
- ❌ NO external payment links or migration to Telegram/WhatsApp
- ❌ NO matchmaking hubs or "singles" events
- ✅ **ONLY** SFW professional venues allowed

---

## Files Created

### Backend (Cloud Functions)

#### 1. **Type Definitions**
```
functions/src/types/pack157-business-partners.types.ts
```
- **BusinessCategory**: Enum of allowed venue types (Gym, Yoga Studio, Coworking, etc.)
- **PartnershipStatus**: Verification states (Pending, Approved, Rejected, Suspended, Revoked)
- **BusinessPartner**: Complete business partner record
- **VenueProfile**: Venue details and operating hours
- **VenueEvent**: Event scheduling with safety scores
- **VenueAttendance**: Registration and check-in tracking
- **VenueSafetyCase**: Violation tracking and enforcement
- **Helper Functions**: Validation, content screening, romantic score calculation

#### 2. **Business Partner Management**
```
functions/src/pack157-business-partners.ts
```

**Callable Functions**:
- `applyForBusinessPartner`: Submit partnership application
- `uploadBusinessDocument`: Upload verification documents
- `getBusinessPartnerStatus`: Check application status
- `approveBusinessPartner`: Admin approval (ADMIN)
- `rejectBusinessPartner`: Admin rejection (ADMIN)
- `suspendBusinessPartner`: Temporary suspension (ADMIN)
- `revokeBusinessPartner`: Permanent removal (ADMIN)
- `getPendingBusinessPartners`: List pending applications (ADMIN)

**Features**:
- Age verification (18+) required
- AI moderation on business names and descriptions
- Document upload (license, ID, insurance)
- Monthly event limits (default: 20 events/month)
- Safety score tracking (0-100)
- Violation count monitoring

#### 3. **Venue Events Management**
```
functions/src/pack157-venue-events.ts
```

**Callable Functions**:
- `createVenueProfile`: Create venue profile for approved partners
- `getVenueProfile`: Fetch venue details
- `scheduleVenueEvent`: Schedule new event at venue
- `getVenueEvents`: List events by venue/partner/status
- `registerForVenueEvent`: User registration with payment
- `scanVenueAttendance`: QR code check-in
- `getMyVenueEvents`: User's registered events

**Features**:
- Event capacity management
- Token-based payments with revenue splits
- Risk screening for attendees
- QR code generation for check-in
- Advance notice requirements (24 hours minimum)
- Duration limits (30 min - 8 hours)
- Automatic event cancellation on partner suspension

#### 4. **Safety Enforcement**
```
functions/src/pack157-venue-safety.ts
```

**Callable Functions**:
- `createVenueSafetyCase`: Report violations
- `notifyRegionalLeaders`: Alert Ambassadors/City Leaders
- `getVenueSafetyStats`: Safety statistics (ADMIN)

**Automated Enforcement**:
- `autoEnforceViolation`: Auto-suspend/revoke based on violation type
- `detectFilmingViolation`: Monitor for unauthorized filming
- `detectExternalPayment`: Block external payment links

**Violation Types & Actions**:
- **NSFW_CONTENT** → Immediate suspension
- **ROMANTIC_EVENT** → Immediate suspension
- **DATING_THEME** → Immediate suspension
- **EXTERNAL_PAYMENT** → Immediate suspension
- **UNAUTHORIZED_FILMING** → Warning → Freeze → Suspend
- **3+ violations** → Permanent revocation

**Firestore Trigger**:
- `detectFilmingViolation`: Auto-created on event creation if filming keywords detected

---

## Firestore Collections

### 1. `business_partners`
```typescript
{
  partnerId: string,
  businessName: string,
  legalName: string,
  category: BusinessCategory,
  description: string,
  email: string,
  phone: string,
  website?: string,
  address: {
    street: string,
    city: string,
    state: string,
    country: string,
    postalCode: string,
    latitude?: number,
    longitude?: number
  },
  ownerUserId: string,
  ownerName: string,
  ownerEmail: string,
  status: PartnershipStatus,
  verificationLevel: 'NONE' | 'BASIC' | 'VERIFIED',
  uploadedDocuments: Array<{
    type: DocumentType,
    url: string,
    uploadedAt: Timestamp
  }>,
  reviewedBy?: string,
  reviewedAt?: Timestamp,
  rejectionReason?: string,
  safetyScore: number,
  violationCount: number,
  lastViolation?: Timestamp,
  suspensionReason?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  approvedAt?: Timestamp,
  canHostEvents: boolean,
  canSellTickets: boolean,
  maxEventsPerMonth: number,
  totalEventsHosted: number,
  totalAttendees: number,
  totalRevenue: number
}
```

### 2. `venue_profiles`
```typescript
{
  venueId: string,
  partnerId: string,
  venueName: string,
  category: BusinessCategory,
  description: string,
  address: {...},
  capacity: number,
  amenities: string[],
  photos: string[],
  operatingHours: {
    [day: string]: {
      open: string,
      close: string,
      closed?: boolean
    }
  },
  cancellationPolicy: string,
  accessibilityInfo?: string,
  parkingInfo?: string,
  isActive: boolean,
  isVerified: boolean,
  safetyRating: number,
  lastSafetyCheck?: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 3. `venue_events`
```typescript
{
  eventId: string,
  venueId: string,
  partnerId: string,
  title: string,
  description: string,
  eventType: 'WORKSHOP' | 'CLASS' | 'TRAINING' | 'MEETUP' | 'CHALLENGE' | 'SEMINAR',
  hostedBy?: string,
  hostName?: string,
  hostAvatar?: string,
  priceTokens: number,
  capacity: number,
  attendeesCount: number,
  startTime: Timestamp,
  endTime: Timestamp,
  duration: number,
  venueName: string,
  venueAddress: string,
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED',
  isActive: boolean,
  requiresApproval: boolean,
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED',
  contentModerated: boolean,
  nsfwScore: number,
  romanticScore: number,
  checkInEnabled: boolean,
  checkInCode?: string,
  checkInStartTime?: Timestamp,
  platformFeePercentage: number,
  venueCommission: number,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string,
  tags: string[],
  region: string
}
```

### 4. `venue_attendance`
```typescript
{
  attendanceId: string,
  eventId: string,
  venueId: string,
  userId: string,
  userName: string,
  userAvatar?: string,
  registeredAt: Timestamp,
  registrationStatus: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'DENIED',
  tokensAmount: number,
  platformFee: number,
  creatorEarnings: number,
  venueCommission: number,
  transactionId?: string,
  checkedIn: boolean,
  checkInTime?: Timestamp,
  checkInMethod?: 'QR_CODE' | 'MANUAL' | 'AUTO',
  qrCodeData?: string,
  riskCheckPassed: boolean,
  riskScore: number,
  denialReason?: string,
  feedbackSubmitted: boolean,
  safetyRating?: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 5. `venue_safety_cases`
```typescript
{
  caseId: string,
  venueId?: string,
  partnerId: string,
  eventId?: string,
  violationType: ViolationType,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  description: string,
  reportedBy?: string,
  reportedByType: 'USER' | 'SYSTEM' | 'MODERATOR' | 'AMBASSADOR',
  evidenceUrls: string[],
  witnessStatements: string[],
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED',
  resolution?: {
    action: 'WARNING' | 'SUSPENSION' | 'REVOCATION' | 'NO_ACTION',
    notes: string,
    decidedBy: string,
    decidedAt: Timestamp
  },
  affectedUsers: string[],
  refundsIssued: number,
  ambassadorNotified: boolean,
  cityLeaderNotified: boolean,
  regionalResponse?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Security Rules

**File**: `PACK_157_FIRESTORE_RULES.txt`

### Key Security Constraints

1. **Age Verification Required**: All venue operations require users to be 18+ and age-verified
2. **Owner Permissions**: Only business owners can modify their partnerships
3. **Admin Controls**: Status changes, approvals, and enforcement are admin-only
4. **Risk Level Enforcement**: Events with `BLOCKED` risk level cannot be created
5. **Active Status Required**: Only active venues and approved partners can host events
6. **Read Restrictions**: Safety cases visible only to reporters, partners, and admins

---

## API Usage Examples

### 1. Apply for Business Partnership

```typescript
const result = await applyForBusinessPartner({
  businessName: "FitZone Gym",
  legalName: "FitZone LLC",
  category: "GYM",
  description: "Modern fitness facility with state-of-the-art equipment",
  email: "contact@fitzone.com",
  phone: "+1234567890",
  website: "https://fitzone.com",
  address: {
    street: "123 Main St",
    city: "New York",
    state: "NY",
    country: "US",
    postalCode: "10001",
    latitude: 40.7128,
    longitude: -74.0060
  }
});
// Returns: { success: true, partnerId, status: 'PENDING' }
```

### 2. Upload Verification Document

```typescript
const result = await uploadBusinessDocument({
  partnerId: "partner_123",
  documentType: "BUSINESS_LICENSE",
  documentUrl: "https://storage.googleapis.com/..."
});
// Returns: { success: true, message: 'Document uploaded successfully' }
```

### 3. Schedule Venue Event

```typescript
const result = await scheduleVenueEvent({
  venueId: "venue_123",
  title: "Morning Yoga Class",
  description: "Beginner-friendly yoga session focused on flexibility and breathing",
  eventType: "CLASS",
  priceTokens: 50,
  capacity: 20,
  startTime: "2025-12-01T09:00:00Z",
  endTime: "2025-12-01T10:30:00Z",
  requiresApproval: false,
  tags: ["yoga", "wellness", "morning"]
});
// Returns: { success: true, eventId, checkInCode, riskLevel: 'LOW' }
```

### 4. Register for Event

```typescript
const result = await registerForVenueEvent({
  eventId: "event_123"
});
// Returns: { success: true, attendanceId, qrCodeData }
```

### 5. QR Check-In

```typescript
const result = await scanVenueAttendance({
  eventId: "event_123",
  qrCodeData: "a1b2c3d4e5f6..."
});
// Returns: { success: true, userName: "John Doe", message: 'Check-in successful' }
```

### 6. Report Safety Violation

```typescript
const result = await createVenueSafetyCase({
  partnerId: "partner_123",
  eventId: "event_123",
  violationType: "ROMANTIC_EVENT",
  severity: "CRITICAL",
  description: "Event advertised as 'singles mixer' which violates dating policy",
  evidenceUrls: ["https://...screenshot.jpg"]
});
// Returns: { success: true, caseId }
// Note: CRITICAL violations trigger auto-enforcement
```

---

## Configuration

### Venue Limits
```typescript
VENUE_CONFIG = {
  maxEventsPerMonth: 20,
  maxCapacityPerEvent: 500,
  minEventDuration: 30, // minutes
  maxEventDuration: 480, // 8 hours
  minAdvanceNotice: 86400000, // 24 hours in ms
  platformFeePercentage: 0.35, // 35% to Avalo
  creatorEarningsPercentage: 0.65, // 65% to creator
  maxVenueCommission: 0.10, // max 10% from creator's share
  nsfwThreshold: 0.3,
  romanticThreshold: 0.3,
  violationAutoSuspendThreshold: 3
}
```

### Allowed Business Categories
- `GYM`, `YOGA_STUDIO`, `CALISTHENICS_PARK`, `DANCE_STUDIO`, `MARTIAL_ARTS`
- `ART_STUDIO`, `MUSIC_SPACE`, `PHOTOGRAPHY_LAB`, `MAKER_SPACE`
- `COWORKING_SPACE`, `CONFERENCE_HALL`, `CAFE_WORKSHOP`
- `TUTORING_CENTER`, `LANGUAGE_SCHOOL`
- `SALON`, `SPA`, `CLINIC`
- `BOOKSTORE`, `COMMUNITY_CENTER`

### Blocked Keywords
The system automatically blocks events containing:
- Dating/romantic themes: "dating", "speed dating", "singles", "find love", "flirt", "hookup"
- NSFW content: "strip", "nude", "naked", "adult", "xxx", "erotic", "escort"
- Suggestive content: "hot models", "sexy", "seductive", "meet hot"
- Polish equivalents: "randki", "singiel", "erotyczny"

---

## Integration Points

### 1. **Ambassador System (PACK 152)**
- Safety violations automatically notify regional Ambassadors
- City Leaders receive alerts for venues in their city
- `notifyRegionalLeaders` function sends targeted notifications

### 2. **Payment System**
- Reuses existing token transaction infrastructure
- Platform fee: 35% to Avalo
- Creator earnings: 65% (minus optional venue commission)
- All transactions logged in `transactions` collection

### 3. **Trust & Risk Engine (PACK 85)**
- Risk screening applied to all event registrations
- Checks `user_trust_profile` for risk scores and flags
- Auto-denies high-risk users

### 4. **AI Moderation**
- Text moderation via `moderateText` from `aiModeration.ts`
- Image moderation via `moderateImage` for document uploads
- NSFW and romantic content scoring

### 5. **Notification System (PACK 92)**
- Partner approval/rejection notifications
- Event cancellation alerts
- Safety violation notices
- Ambassador/City Leader alerts

---

## Admin Dashboard Requirements

Admins need access to:

1. **Pending Applications**
   - Call `getPendingBusinessPartners` to list applications
   - View uploaded documents securely
   - Approve/reject with reasons

2. **Safety Dashboard**
   - Call `getVenueSafetyStats` for violation metrics
   - Filter by partner, date range, violation type
   - Review open cases

3. **Partner Management**
   - Suspend/revoke partnerships
   - View violation history
   - Monitor event hosting patterns

4. **Event Oversight**
   - View all venue events
   - Emergency cancellation capability
   - Risk level monitoring

---

## Testing Checklist

### Business Partner Verification
- [ ] User under 18 cannot apply
- [ ] Application rejected if description contains blocked keywords
- [ ] Document upload validates image content
- [ ] Admin can approve/reject applications
- [ ] Approved partners can create venue profiles

### Event Scheduling
- [ ] Only approved partners can schedule events
- [ ] Events with romantic content are blocked (romanticScore >= 0.3)
- [ ] Events must be scheduled 24+ hours in advance
- [ ] Capacity cannot exceed venue capacity
- [ ] Monthly event limit enforced

### Attendance & Check-In
- [ ] High-risk users denied registration
- [ ] Token payment processed correctly (65/35 split)
- [ ] QR code check-in works
- [ ] Users cannot check in twice
- [ ] Attendance logged properly

### Safety Enforcement
- [ ] NSFW violation → immediate suspension
- [ ] Romantic event→ immediate suspension
- [ ] 3 violations → permanent revocation
- [ ] All upcoming events cancelled on suspension
- [ ] Ambassadors notified of critical violations

### Security Rules
- [ ] Non-owners cannot modify partnerships
- [ ] Non-admins cannot change status
- [ ] Users cannot read others' attendance data
- [ ] Safety cases visible only to involved parties

---

## Deployment Steps

1. **Deploy Cloud Functions**
   ```bash
   cd functions
   npm install
   npm run build
   firebase deploy --only functions
   ```

2. **Update Firestore Rules**
   - Merge `PACK_157_FIRESTORE_RULES.txt` into `firestore.rules`
   - Deploy: `firebase deploy --only firestore:rules`

3. **Create Firestore Indexes**
   ```bash
   # Add to firestore.indexes.json
   {
     "collectionGroup": "business_partners",
     "fieldPath": "status",
     "order": "ASCENDING"
   },
   {
     "collectionGroup": "business_partners",
     "fieldPath": "ownerUserId",
     "fieldPath": "createdAt",
     "order": "DESCENDING"
   },
   {
     "collectionGroup": "venue_events",
     "fieldPath": "partnerId",
     "fieldPath": "status",
     "fieldPath": "startTime",
     "order": "ASCENDING"
   },
   {
     "collectionGroup": "venue_attendance",
     "fieldPath": "eventId",
     "fieldPath": "userId"
   }
   ```

4. **Configure Environment Variables**
   ```bash
   firebase functions:config:set \
     openai.api_key="YOUR_OPENAI_KEY" \
     google_vision.api_key="YOUR_VISION_KEY"
   ```

5. **Test Admin Functions**
   - Create test admin account in `admins` collection
   - Test approval/rejection workflow
   - Verify safety enforcement triggers

---

## Monitoring & Analytics

### Key Metrics to Track

1. **Partnership Metrics**
   - Applications submitted vs approved (approval rate)
   - Average time to approval/rejection
   - Rejections by reason
   - Active partnerships by category

2. **Event Metrics**
   - Events scheduled per month
   - Average attendance rate
   - Revenue by partner/venue
   - Cancellation rate

3. **Safety Metrics**
   - Violations by type
   - Average time to resolution
   - Suspension/revocation rate
   - False positive rate (unfair suspensions)

4. **User Engagement**
   - Unique users attending venue events
   - Repeat attendance rate
   - Token spend on venue events
   - User satisfaction (post-event ratings)

### Alerts to Configure

- High violation rate (>5% of events)
- Surge in romantic/NSFW attempts
- Low approval rate (<50%)
- Unusual event cancellation patterns
- Partner with multiple safety cases

---

## Future Enhancements

1. **Verified Badge** for long-standing safe partners
2. **Venue Categories** in discovery (without feed boost)
3. **Multi-venue Support** for partner chains
4. **Event Series** for recurring classes
5. **Venue Reviews** by attendees
6. **Partner Analytics Dashboard** for performance tracking
7. **Automatic Safety Scoring** using ML models
8. **Integration with Calendar Apps** (Google Calendar, Apple Calendar)

---

## Support & Maintenance

### Common Issues

**Issue**: Partner cannot schedule events after approval
**Solution**: Check `canHostEvents` flag and monthly limit

**Issue**: User denied event registration
**Solution**: Check `user_trust_profile` for risk flags

**Issue**: QR check-in not working
**Solution**: Verify `checkInCode` matches and event is UPCOMING

**Issue**: Safety case not triggering enforcement
**Solution**: Ensure severity is set correctly (CRITICAL for auto-action)

### Contact

For technical support or questions about PACK 157:
- Check implementation files for inline documentation
- Review Firestore security rules for access patterns
- Test in emulator environment before production deployment

---

## Compliance & Legal

### Data Protection
- All business documents encrypted at rest
- Personal data (email, phone) access-controlled
- GDPR-compliant data export/deletion (via existing PACK 64)

### Safety Requirements
- Zero tolerance policy documented in partner agreement
- Automated moderation with manual review
- Regional compliance through Ambassador system
- Audit trail for all enforcement actions

### Financial Compliance
- Token-based system (no real money through venues)
- Transaction records for all payments
- Revenue split transparently communicated
- Tax reporting via existing ledger (PACK 148)

---

**Implementation Complete**: All backend infrastructure, safety systems, and security rules are production-ready. Client applications can now integrate these APIs to provide business partnership and venue event features.