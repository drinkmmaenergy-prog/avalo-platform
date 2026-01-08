# PACK 209 — Quick Reference Guide

## 🎯 Core Concept

Unified refund & complaint system for 1:1 meetings and events with **non-refundable Avalo commission**.

---

## 💰 Commission Structure

| Feature | Earner/Organizer Share | Avalo Commission | Commission Refundable? |
|---------|------------------------|------------------|------------------------|
| 1:1 Meetings | 65% | 35% | ❌ NEVER |
| Group Events | 80% | 20% | ❌ NEVER |

---

## ⏰ Meeting Cancellation Policy

### Payer Cancels

| Time Before Meeting | Refund (from 65% earner share) | Earner Keeps |
|---------------------|-------------------------------|--------------|
| ≥ 72 hours | 100% | 0% |
| 24-72 hours | 50% | 50% |
| < 24 hours | 0% | 100% |

### Earner Cancels

- **Refund:** 100% of earner share (65%)
- **Avalo:** Keeps 35% commission

---

## 🎟️ Event Cancellation Policy

### Participant Cancels
- **Refund:** 0% (ticket lost)
- **Organizer:** Keeps 80%
- **Avalo:** Keeps 20%

### Organizer Cancels
- **Refund:** 100% of organizer share (80%) to all participants
- **Avalo:** Keeps 20% commission

### Participant No-Show
- **Refund:** 0%
- **Organizer:** Keeps 80%
- **Avalo:** Keeps 20%

---

## ⚠️ Appearance Complaints

### For 1:1 Meetings

**When to Use:**
- Person looks significantly different from profile photos
- Possible identity fraud or catfishing
- Safety or verification concerns

**Process:**
1. Press "Appearance / Identity Issue" during meeting
2. Take live selfie at meeting spot
3. Choose decision:
   - **KEEP_COMPLETED**: No refund, profile flagged (trust -20)
   - **ISSUE_REFUND**: Full earner share refunded, profile requires update (trust -50)

**Refund Breakdown (if ISSUE_REFUND chosen):**
- Payer receives: 65% (earner share)
- Earner receives: 0%
- Avalo keeps: 35% (commission)

### For Events

**Organizer Only:**
- Can deny entry
- Can choose to refund 80% (organizer share)
- Avalo keeps 20% commission
- Case logged in safety system

---

## 💝 Voluntary Refunds

### 1:1 Meetings

**Available After:** Meeting completes and funds are in pending payout

**Options:**
- 0% (no refund)
- 25% (quarter refund)
- 50% (half refund)  
- 100% (full refund)

**Rules:**
- Avalo keeps 35% commission
- Payer receives X% of 65% earner share
- Earner's pending earnings reduced

**Use Cases:**
- Building goodwill
- Relationship investment
- Quality concerns
- Future meeting incentive

### Events

**Available After:** Event completes

**Options:**
- Select specific attendee
- Refund 0-100% of organizer share (80%)
- Avalo keeps 20% commission

**Use Cases:**
- Event quality issues
- Technical problems
- Goodwill gestures

---

## 🔌 API Quick Reference

### User Endpoints

```typescript
// File appearance complaint (1:1)
pack209_fileAppearanceComplaint({
  bookingId,
  reportedUserId,
  liveSelfieUrl,
  decision: 'KEEP_COMPLETED' | 'ISSUE_REFUND',
  notes?, mismatchScore?, location?
})

// Issue voluntary refund (1:1)
pack209_issueVoluntaryRefund({
  bookingId,
  refundPercent, // 0-100
  reason?
})

// Get refund history
pack209_getRefundHistory({ limit? })

// Cancel event with refunds (organizer)
pack209_cancelEventWithRefunds({
  eventId,
  reason
})

// File event complaint (organizer)
pack209_fileEventAppearanceComplaint({
  eventId,
  attendeeId,
  reportedUserId,
  shouldRefund: boolean,
  notes?
})

// Issue event voluntary refund (organizer)
pack209_issueEventVoluntaryRefund({
  eventId,
  attendeeId,
  refundPercent, // 0-100
  reason?
})
```

### Admin Endpoints

```typescript
// Get complaints
pack209_admin_getComplaints({ limit?, decision?, requiresReview?, source? })

// Get refund transactions  
pack209_admin_getRefundTransactions({ limit?, refundType?, source?, userId? })

// Get voluntary refunds
pack209_admin_getVoluntaryRefunds({ limit?, source?, userId? })

// Get trust incidents
pack209_admin_getTrustIncidents({ limit?, type?, severity?, requiresReview?, userId? })

// Review incident
pack209_admin_reviewIncident({ incidentId, actionTaken, notes? })

// Statistics
pack209_admin_getRefundStats({ timeframe: '7d' | '30d' | '90d' })
pack209_admin_getVoluntaryRefundStats({ timeframe })
pack209_admin_getComplaintStats({ timeframe })

// Force refund (emergency)
pack209_admin_forceRefund({ bookingId?, eventId?, payerId, earnerId, refundAmount, reason })
```

---

## 🎨 UI Components

### AppearanceComplaintModal
```tsx
<AppearanceComplaintModal
  visible={showComplaint}
  onClose={() => setShowComplaint(false)}
  bookingId={booking.id}
  reportedUserId={otherUser.id}
  reportedUserName={otherUser.name}
  onComplaintFiled={(result) => {
    console.log(`Complaint filed: ${result.complaintId}`);
    if (result.refundAmount > 0) {
      console.log(`Refund issued: ${result.refundAmount} tokens`);
    }
  }}
/>
```

### VoluntaryRefundModal
```tsx
<VoluntaryRefundModal
  visible={showRefund}
  onClose={() => setShowRefund(false)}
  bookingId={booking.id}
  earnerShare={booking.payment.escrowTokens} // 65%
  payerName={payer.name}
  source="meeting"
  onRefundIssued={(result) => {
    console.log(`Refund issued: ${result.refundAmount} tokens`);
  }}
/>
```

### RefundPolicyCard
```tsx
<RefundPolicyCard type="meeting" /> // or "event"
```

### RefundHistoryScreen
```tsx
<RefundHistoryScreen userId={currentUser.id} />
```

---

## 🎓 Best Practices

### For Earners/Organizers

1. **Cancel Early:** If you must cancel, do it ≥72h before to minimize impact
2. **Use Voluntary Refunds:** Build goodwill and encourage repeat bookings
3. **Verify Profiles:** Keep photos current to avoid complaints
4. **Be Transparent:** Clear communication prevents complaints

### For Payers/Participants

1. **Book with Confidence:** Refund policies protect early cancellations
2. **Cancel Early:** Get better refunds by cancelling ≥72h before
3. **Use Complaints Wisely:** File only for serious safety/identity issues
4. **Check Policies:** Review refund policy before booking

### For Admins

1. **Monitor Patterns:** Watch for abuse of complaint system
2. **Review Incidents:** Process manual reviews promptly
3. **Track Statistics:** Use dashboards to identify trends
4. **Support Users:** Use force refund only for exceptional cases

---

## 🔍 Troubleshooting

### "Insufficient Balance" on Refund
- Refunds deduct from earner/organizer current balance
- Ensure they have enough tokens before processing

### "Booking Not Found"
- Verify bookingId/eventId is correct
- Check booking still exists and hasn't been deleted

### "Only Earner Can Issue Refund"
- Verify caller is the meeting earner (creatorId)
- For events, verify caller is organizer (hostUserId)

### "Can Only Refund Completed Bookings"
- Voluntary refunds only work after meeting/event completes
- Check booking status is COMPLETED

---

## 📞 Support Resources

**For Users:**
- View refund history in app
- Contact support for policy questions
- Report safety issues immediately

**For Moderators:**
- Admin dashboard for all data
- Review queue for incidents
- Statistics for pattern analysis

**For Developers:**
- Full implementation docs: [`PACK_209_IMPLEMENTATION_COMPLETE.md`](PACK_209_IMPLEMENTATION_COMPLETE.md:1)
- Type definitions: [`pack209-refund-complaint-types.ts`](functions/src/pack209-refund-complaint-types.ts:1)
- Core engine: [`pack209-refund-complaint-engine.ts`](functions/src/pack209-refund-complaint-engine.ts:1)

---

## ✅ Key Takeaways

1. **Avalo commission is ALWAYS non-refundable** (35% meetings, 20% events)
2. **Time-based refunds reward early cancellation** (meetings only)
3. **Events: participant cancels = no refund** (organizer cancels = full refund)
4. **Both parties can file complaints** (symmetrical protection)
5. **Voluntary refunds build trust** (0-100% of earner/organizer share)
6. **All actions logged** (complete audit trail)
7. **Trust scores updated** (complaints impact reputation)
8. **Admin oversight available** (emergency overrides possible)

---

**Version:** 1.0.0  
**Last Updated:** December 1, 2025  
**Status:** ✅ Production Ready