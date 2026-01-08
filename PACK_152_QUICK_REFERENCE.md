# PACK 152 - Quick Reference Guide
## Avalo Global Ambassadors & City Leaders Program

**Zero Romance/NSFW/Attention-for-Payment Dynamics**

---

## Quick Links

### Backend
- Types: [`functions/src/pack152-ambassadors/types.ts`](functions/src/pack152-ambassadors/types.ts:1)
- Safety Middleware: [`functions/src/pack152-ambassadors/safety-middleware.ts`](functions/src/pack152-ambassadors/safety-middleware.ts:1)
- Functions: [`functions/src/pack152-ambassadors/functions.ts`](functions/src/pack152-ambassadors/functions.ts:1)
- Security Rules: [`firestore-pack152-ambassadors.rules`](firestore-pack152-ambassadors.rules:1)

### Mobile
- Apply: [`app-mobile/app/ambassador/apply.tsx`](app-mobile/app/ambassador/apply.tsx:1)
- Dashboard: [`app-mobile/app/ambassador/dashboard.tsx`](app-mobile/app/ambassador/dashboard.tsx:1)
- Create Event: [`app-mobile/app/ambassador/create-event.tsx`](app-mobile/app/ambassador/create-event.tsx:1)
- Check-In: [`app-mobile/app/ambassador/event-checkin/[eventId].tsx`](app-mobile/app/ambassador/event-checkin/[eventId].tsx:1)

---

## 5-Minute Integration

### 1. Deploy Backend (2 minutes)
```bash
# Update functions index
# Add to functions/src/index.ts:
export * from './pack152-ambassadors/functions';

# Deploy
firebase deploy --only firestore:rules,functions
```

### 2. Add Indexes (1 minute)
```json
// Add to firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "ambassador_events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ambassadorId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "startTime", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "event_attendance",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "ambassadorId", "order": "ASCENDING" },
        { "fieldPath": "newUserOnboarded", "order": "ASCENDING" },
        { "fieldPath": "registeredAt", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### 3. Install Dependencies (1 minute)
```bash
cd app-mobile
npm install @react-native-community/datetimepicker
```

### 4. Test (1 minute)
```bash
# Test ambassador application
firebase emulators:start --only functions,firestore
```

---

## Key Functions

### For Users
```typescript
// Apply to be ambassador
const result = await httpsCallable(functions, 'applyForAmbassador')({
  city: 'San Francisco',
  country: 'United States',
  countryCode: 'US',
  timezone: 'America/Los_Angeles',
  motivation: '...',
  experienceDescription: '...'
});
```

### For Ambassadors
```typescript
// Create event (automatically validated)
const result = await httpsCallable(functions, 'scheduleAmbassadorEvent')({
  title: 'Photography Workshop',
  description: 'Learn professional photography...',
  eventType: 'photography_walk',
  venue: 'City Park',
  address: '123 Park Ave',
  city: 'San Francisco',
  country: 'United States',
  countryCode: 'US',
  startTime: '2025-12-01T10:00:00Z',
  endTime: '2025-12-01T12:00:00Z',
  timezone: 'America/Los_Angeles',
  maxAttendees: 20
});
```

### For Event Attendees
```typescript
// Register for event
const result = await httpsCallable(functions, 'registerAttendance')({
  eventId: 'evt_123',
  safetyRulesAccepted: true,
  photographyConsentGiven: true
});

// Check in at event
const result = await httpsCallable(functions, 'checkInToEvent')({
  eventId: 'evt_123',
  qrCode: 'avalo://event-checkin/evt_123'
});
```

### For Admins
```typescript
// Approve ambassador
const result = await httpsCallable(functions, 'approveAmbassador')({
  applicationId: 'app_123'
});

// Revoke access
const result = await httpsCallable(functions, 'revokeAmbassadorAccess')({
  ambassadorId: 'user_123',
  reason: 'Violation of safety guidelines'
});
```

---

## Safety Middleware Examples

### Automatic Validation

**✅ APPROVED**:
```typescript
{
  title: "Photography Skills Workshop",
  description: "Learn professional photography techniques...",
  eventType: "photography_walk"
}
// Score: 95/100 - Professional, skill-based
```

**❌ REJECTED**:
```typescript
{
  title: "Meet Beautiful Singles Photography Night",
  description: "Mingle and find love while taking photos...",
  eventType: "photography_walk"
}
// Violations: ["Forbidden content: singles", "Romantic pattern detected"]
```

**❌ REJECTED**:
```typescript
{
  venue: "Downtown Nightclub",
  address: "123 Club St"
}
// Violations: ["Inappropriate venue type: nightclub"]
```

**❌ REJECTED**:
```typescript
{
  startTime: "2025-12-01T22:00:00Z" // 10 PM
}
// Violations: ["Events cannot start after 9 PM"]
```

---

## Event Types (Pre-Approved)

1. **wellness_workshop** - Yoga, meditation, nutrition
2. **fitness_meetup** - Running, cycling, sports
3. **photography_walk** - Photography skills
4. **creator_collaboration** - Content partnerships
5. **business_networking** - Professional connections
6. **beauty_masterclass** - Makeup, skincare skills
7. **creator_growth_seminar** - Platform growth
8. **outdoor_challenge** - Hiking, activities
9. **tech_gaming_night** - Technology, gaming
10. **skill_workshop** - General skills
11. **professional_networking** - Career networking

---

## Forbidden Content (Auto-Blocked)

### Romantic/Dating
- "speed dating", "singles", "meet beautiful people"
- "romantic", "flirt", "hookup", "dating"
- "mingle", "escort", "sugar daddy/mommy"

### NSFW
- "strip", "pole dance", "kink", "fetish"
- "nsfw", "18+", "adult content"

### Venues
- Nightclubs, bars, private residences
- Strip clubs, adult venues

### Timing
- Start before 6 AM or after 9 PM
- End after midnight

---

## Performance Metrics

### Tracked (Business Only)
- Events hosted
- Total attendees
- Users onboarded
- Creators onboarded
- Satisfaction scores
- Token earnings

### NOT Tracked
- Attractiveness
- Romantic interactions
- "Popularity" rankings

---

## Earnings Model

### Allowed Sources
```typescript
'event_hosted'        // Successfully hosting event
'user_onboarded'      // New user acquisition
'creator_onboarded'   // New creator acquisition
'ticket_revenue'      // Event ticket sales
```

### Forbidden Sources
```typescript
'personal_attention'  // ❌ Blocked
'romantic_interaction' // ❌ Blocked
'private_meeting'     // ❌ Blocked
'exclusive_access'    // ❌ Blocked
```

---

## Security Rules Summary

### Ambassador Profiles
```
✅ Create: Admin only
✅ Update: Admin or self (no visibility boosts)
❌ Delete: Never (only status changes)
```

### Events
```
✅ Create: Active ambassadors (auto-validated)
✅ Read: Public
✅ Update: Creator or admin
❌ Delete: Never (only cancellation)
```

### Attendance
```
✅ Create: Registered users (consent required)
✅ Read: Self, ambassador, admin
✅ Update: Limited (feedback or check-in only)
❌ Delete: Never
```

### Compliance Incidents
```
✅ Create: Any authenticated user
✅ Read: Reporter, subject, admin
✅ Update: Admin only
❌ Delete: Never (permanent records)
```

---

## Compliance Workflow

### Report Incident
```typescript
await httpsCallable(functions, 'reportComplianceIncident')({
  ambassadorId: 'user_123',
  eventId: 'evt_456',
  incidentType: 'romantic_theme',
  severity: 'high',
  description: 'Event promoted as singles meetup',
  evidenceUrls: ['https://...'],
  witnessStatements: ['I witnessed...']
});
```

### Auto-Actions by Severity
- **Low**: Warning email
- **Medium**: Review required
- **High**: Event cancellation
- **Critical**: Immediate suspension

---

## Mobile Navigation

```typescript
// Apply to be ambassador
router.push('/ambassador/apply');

// View dashboard
router.push('/ambassador/dashboard');

// Create event
router.push('/ambassador/create-event');

// Check in to event
router.push(`/ambassador/event-checkin/${eventId}`);
```

---

## Admin Dashboard (Recommended)

**Suggested Routes**:
```
/admin/ambassadors/applications  - Review applications
/admin/ambassadors/active        - Manage active ambassadors
/admin/ambassadors/events        - Review/approve events
/admin/ambassadors/compliance    - Handle incidents
/admin/ambassadors/analytics     - View performance
```

---

## Testing Checklist

### ✅ Safety Validation
```bash
# Test romantic theme (should fail)
{
  title: "Singles Mixer",
  description: "Meet other singles..."
}

# Test NSFW (should fail)
{
  title: "Adult Entertainment Night"
}

# Test late night (should fail)
{
  startTime: "22:00" // 10 PM
}

# Test professional (should pass)
{
  title: "Business Networking",
  description: "Professional connections...",
  startTime: "18:00" // 6 PM
}
```

### ✅ Complete Flow
1. Apply as ambassador
2. Admin approves
3. Create wellness workshop event
4. User registers with consent
5. User checks in with QR
6. User provides feedback
7. Ambassador earns tokens
8. Performance calculated

---

## Environment Variables (If Needed)

```env
# None required - uses existing Firebase config
```

---

## Support & Issues

### Common Issues

**Q: Event rejected for unknown reason?**
A: Check validation score. Must be ≥60. Review warnings.

**Q: Cannot create event?**
A: Ensure training is completed and status is 'active'.

**Q: Earnings not showing?**
A: Events must be completed and verified by admin.

**Q: Check-in not working?**
A: Verify event is 'active' and check-in is enabled.

---

## Production Deployment

### Prerequisites
- [ ] Firebase project configured
- [ ] Functions deployed
- [ ] Firestore rules updated
- [ ] Indexes created
- [ ] Mobile app dependencies installed

### Launch Checklist
- [ ] Test in emulator
- [ ] Deploy to staging
- [ ] Run integration tests
- [ ] Deploy to production
- [ ] Monitor first 24 hours
- [ ] Review first event submissions
- [ ] Gather ambassador feedback

---

## Success Metrics to Track

### Week 1
- Ambassador applications submitted
- Approval rate
- First events created
- Validation pass rate

### Month 1
- Active ambassadors
- Events per ambassador
- Attendance rate
- User satisfaction
- Compliance incidents

### Quarter 1
- Cities covered
- Total users onboarded
- Total creators onboarded
- Ambassador retention
- Event diversity

---

## Non-Negotiable Reminders

⚠️ **NEVER ALLOW**:
- Romantic/dating event themes
- NSFW content
- Visibility boosts for ambassadors
- Attention-for-payment dynamics
- Late-night events (after 9 PM)
- Inappropriate venues
- Events without safety rules

✅ **ALWAYS ENFORCE**:
- Professional, skill-based focus
- Safety rules acceptance
- Photography consent
- Time restrictions (6 AM - 9 PM)
- Public, appropriate venues
- Business metrics only

---

## Contact & Escalation

**For Technical Issues**:
- Check Firebase Functions logs
- Review Firestore security rules
- Verify middleware validation logic

**For Policy Questions**:
- Refer to PACK 152 Implementation Complete
- Review safety middleware patterns
- Consult compliance incident history

---

**Quick Reference Version**: 1.0
**Last Updated**: 2025-11-29
**Status**: Production Ready ✅