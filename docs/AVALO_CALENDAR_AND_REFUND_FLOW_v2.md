# AVALO — Calendar & Refund Flow (v2)
Version: 2.0 • Scope: Booking UX, Legal Notices, Verification, Refund Rules

## 0. Purpose
Enable **social, legitimate** meetings planning. Calendar is an **organizational tool only**. No facilitation of sexual services. Strong safeguards and clear user acknowledgments.

## 1. Legal Notice (In‑App Banner & Modal)
> **Calendar is ONLY for arranging social dates** (coffee, dinner, public activities, cultural events).  
> **Strictly prohibited**: prostitution, escorting, sexual services, or meetings where sexual activity is expected in exchange for any compensation.  
> Avalo **does not** facilitate or take responsibility for offline activities. Violations lead to permanent ban, token forfeiture, and possible law enforcement notice.

Buttons: `[I Understand]` `[Terms of Service]`

## 2. Booking Flow (User → Creator)
1. Select slot from creator availability.  
2. Meeting type: predefined list (Coffee/Lunch/Dinner/Walk/Activity/Other‑public).  
3. Location type: Public Venue (recommended), warnings for hotel/private.  
4. Mandatory acknowledgment checklist (see §1).  
5. Pay in tokens → **20% Avalo (non‑refundable), 80% escrow**.  
6. Creator confirms.  
7. Day‑of: verification options → GPS 30 min / QR scan / Selfie together.  
8. After verification: escrow releases to creator.

## 3. Pricing
- Creator sets token price (min 100 tokens).  
- Dynamic hints based on region/time.  
- Taxes handled in payout stage.

## 4. Verification Methods
- **GPS**: both present at location for ≥30 minutes.  
- **QR**: booker scans creator QR to confirm presence.  
- **Selfie**: joint selfie with on‑device face match to profile photos.  
If any method succeeds → meeting marked **completed**.

## 5. Refund Rules
### 5.1 Earner no‑show / cancels
- **Full refund to booker**. Avalo fee **kept** (20% non‑refundable).  
- Trigger: moderator approval or earner self‑refund button after slot time.

### 5.2 Booker cancels
- ≥24h before: **50% refund to booker**, 30% to creator, 20% Avalo fee kept.  
- <24h / after start: **0% refund** to booker, 80% creator, 20% Avalo fee kept.

### 5.3 Mutual cancel / force majeure
- Manual review; moderator may split escrow case‑by‑case. Avalo fee kept.

### 5.4 Earner voluntary refund
- Post‑meeting, earner can press **Refund tokens** → 80% back to booker. Avalo fee remains non‑refundable. Confirmation modal required.

## 6. Dispute Process
- Create ticket with evidence (chat excerpts, GPS records).  
- SLA: initial response ≤24h, resolution ≤72h.  
- Outcomes logged to `disputes/{id}` with audit trail.

## 7. Admin & Audit
- Admin panel: Calendar tab shows bookings, statuses, verification artifacts, and refunds.  
- Exportable CSV for legal.  
- Fraud heuristics: abnormal cancel spikes, location mismatch, repeated no‑shows.

## 8. UX Copy (Neutral)
- “Payment covers platform, verification and scheduling services. Not payment for sexual services.”  
- “Choose public places for your safety.”  
- “Violations result in account actions.”

## 9. Tech
- Collections:
  - `calendarSlots/{slotId}` availability.
  - `calendarBookings/{bookingId}` with `payment: { total, avaloFee, escrow }`, `verification`, `status`.
- Functions:
  - `bookSlot`, `confirmSlot`, `verifyMeeting`, `requestRefund`, `voluntaryRefund`.
- Webhooks:
  - Token ledger entries under `transactions` with `type="calendar_booking"` and splits recorded at booking time.

---
## 🇵🇱 DODATEK (PL skrót)
- 20% Avalo zawsze bezzwrotne.  
- Brak przyjścia osoby zarabiającej → pełny zwrot dla zamawiającego (poza 20%).  
- Wspólne selfie/QR/GPS jako weryfikacja spotkania.  
- Jasne komunikaty prawne przy każdym kroku.