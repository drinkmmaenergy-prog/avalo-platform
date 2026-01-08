# PACK 206c — REVISED v2 — OVERWRITE

**Status:** ✅ ACTIVE — OVERWRITES ALL PREVIOUS PACK 206c LOGIC  
**Effective Date:** 2025-12-01  
**Version:** REVISED v2 (FINAL OVERWRITE)

---

## 🎯 GOAL

Allow adult romantic & sexual conversation (sexting, erotic tension, flirty dirty talk) between consenting adults, in a way that is safe, App-Store-compliant and aligned with Avalo as a dating app.

---

## ✅ ALLOWED WITH MUTUAL CONSENT

Between two verified 18+ users, if **both opt in**:

### Conversation Types Allowed:

- **Sexting and erotic storytelling**
- **Flirty dirty talk**
- **Romantic fantasies**
- **Sexual compliments**
- **Teasing and erotic tension**
- **Sharing sensual / sexy (but non-pornographic) photos**
- **Sexually charged conversations as part of romantic/sexual chemistry**

### Consent Requirement:

**Consent must be mutual** → both sides enable an **"Adult / 18+ conversation mode"** inside the chat.

---

## 🎛️ USER CONTROLS

### Disable at Any Time:

- **Either user can disable Adult mode at any time**
- When disabled, conversation must return to non-sexual
- Toggle is immediate and respected

### Reporting:

- **Users can report abusive or non-consensual behavior**
- Reports are reviewed by human moderators
- Violations result in warnings or bans

### Logging:

- **All toggles (ON/OFF adult mode) are logged for trust & safety**
- Timestamps recorded for both users
- Audit trail for safety investigations

---

## ❌ BLOCKED / DISALLOWED

Even in Adult mode, Avalo does **NOT** allow:

- **Sexual content involving minors**
- **Coercion or pressure** ("you must do X")
- **Threats or blackmail**
- **Escorting / "pay for sex" offers**
- **Explicit pornography media** (genitals, penetration, masturbation on camera)
- **Illegal or extreme content** (incest, bestiality, etc.)

---

## 📱 POSITIONING

### Core Principle:

> **Avalo does not censor attraction.**  
> **Avalo protects consent, legality, store policy and safety.**

### The Rule:

> **"Sexuality between consenting adults is welcome. Abuse, coercion and illegal content are not."**

---

## 🔐 IMPLEMENTATION REQUIREMENTS

### 1. Adult Mode Toggle (Chat Feature)

**Location:** Inside each chat conversation

**UI Elements:**
- Toggle switch for "Adult / 18+ Conversation Mode"
- Must be enabled by BOTH users
- Visual indicator when mode is active
- Easy to disable at any time

**Logic:**
```typescript
interface AdultModeSettings {
  chatId: string;
  user1Id: string;
  user1Enabled: boolean;
  user1Timestamp: Date;
  user2Id: string;
  user2Enabled: boolean;
  user2Timestamp: Date;
  bothEnabled: boolean; // true only when both are true
}
```

### 2. Consent Flow

**First-Time Activation:**

1. User clicks "Enable Adult Mode"
2. System shows consent dialog:
   - "Enable adult conversations in this chat?"
   - "This allows sexual and romantic content between consenting adults."
   - "You can disable this at any time."
   - "Report abuse immediately if you feel uncomfortable."
3. User confirms: "I Understand & Enable"
4. System logs enabled status for this user
5. Other user sees notification: "[Name] enabled Adult Mode. Enable yours to unlock?"
6. Both users must enable for mode to be active

**Disabling:**

1. Either user clicks "Disable Adult Mode"
2. Mode immediately deactivates for both users
3. Chat shows notice: "Adult Mode disabled. Please keep conversations appropriate."
4. System logs disabled status

### 3. Visual Indicators

**When Adult Mode is Active:**
- Small indicator icon (e.g., 🔞 or "18+") in chat header
- Subtle color change (e.g., slightly darker background)
- Both users see the indicator

**When Adult Mode is Disabled:**
- No indicator shown
- Standard chat appearance

### 4. Content Filtering

**When Adult Mode is OFF:**
- AI content filter active
- Sexual language flagged
- Warnings displayed
- Repeated violations result in temporary restrictions

**When Adult Mode is ON:**
- AI content filter relaxed for sexual language
- Still block: coercion, threats, minors, illegal content
- Focus on consent violations, not sexual content itself

### 5. Reporting and Moderation

**User Reporting:**
- "Report Abuse" button always available
- Report includes: conversation context, adult mode status, timestamps
- High-priority for abuse in adult mode

**Moderator Review:**
- Human review for all reports
- Check: Was consent mutual? Was mode properly enabled?
- Check: Any coercion, threats, or illegal content?
- Enforcement: Warnings → Suspension → Permanent ban

### 6. Logging and Audit

**What Gets Logged:**
- Timestamp when each user enables/disables adult mode
- Both users' consent status
- Any reports filed
- Moderator actions taken

**NOT Logged:**
- Actual message content (privacy)
- Photos shared (unless reported)

---

## 🛡️ SAFETY MEASURES

### Age Verification

✅ **18+ strict enforcement**  
✅ **Identity verification required before enabling adult mode**  
✅ **No exceptions for minors**

### Consent Enforcement

✅ **Both users must opt-in**  
✅ **Easy to disable at any time**  
✅ **Clear visual indicators**  
✅ **Logged for accountability**

### Content Boundaries

✅ **Text conversation allowed** (sexual language, fantasies, etc.)  
✅ **Sensual photos allowed** (lingerie, bikini, sexy but not explicit)  
❌ **Explicit pornography blocked** (genitals, sexual acts on camera)  
❌ **Escorting offers blocked** ("pay for sex")  
❌ **Illegal content blocked** (minors, extreme content)

### Moderation

✅ **User reporting always available**  
✅ **Human moderator review**  
✅ **Swift enforcement**  
✅ **Transparent policies**

---

## 📊 USE CASES

### ✅ Allowed Scenarios:

**Scenario 1: Mutual Flirting**
- Two adults match on Avalo
- Chemistry develops through conversation
- Both enable Adult Mode
- Exchange flirty, sexy messages
- Both feel comfortable and consensual
- ✅ **ALLOWED**

**Scenario 2: Romantic Tension**
- Couple planning a date
- Want to build sexual tension beforehand
- Both enable Adult Mode
- Share fantasies about what they want to do together
- ✅ **ALLOWED**

**Scenario 3: Long-Distance Romance**
- Dating long-distance
- Use sexting to maintain intimacy
- Both consented to Adult Mode
- Exchange erotic messages and sensual photos
- ✅ **ALLOWED**

### ❌ Blocked Scenarios:

**Scenario 1: One-Sided Pressure**
- User A enables Adult Mode
- User B doesn't enable it
- User A keeps sending sexual messages anyway
- ❌ **BLOCKED** - Non-consensual, violation of terms

**Scenario 2: Explicit Media**
- Both users in Adult Mode
- User A sends photo of genitals
- ❌ **BLOCKED** - Explicit pornography not allowed

**Scenario 3: Escorting Offer**
- Both users in Adult Mode
- One user says "Pay me $500 and I'll have sex with you"
- ❌ **BLOCKED** - Escorting/sexual services prohibited

**Scenario 4: Coercion**
- Both users in Adult Mode
- User A says "If you don't send me nudes, I'll block you"
- ❌ **BLOCKED** - Coercion and threats prohibited

---

## 🎨 USER EXPERIENCE

### For Users:

**Enabling Adult Mode:**
1. Open chat with another user
2. Click "Settings" in chat
3. See "Adult Mode" toggle
4. Read consent notice
5. Confirm "Enable"
6. Wait for other user to also enable
7. Both see indicator when mode is active

**During Adult Mode:**
1. Chat feels natural and free
2. Can discuss sexual topics without fear of censorship
3. Can share sensual photos (non-explicit)
4. Visual indicator reminds both users mode is on
5. "Disable" button always visible

**Disabling Adult Mode:**
1. Click "Disable Adult Mode" anytime
2. Mode immediately turns off for both users
3. Chat returns to standard moderation
4. Can re-enable later if both agree

### For Moderators:

**Report Review:**
1. User reports abuse in Adult Mode
2. Moderator sees: conversation ID, adult mode status, reporter statement
3. Moderator checks: Was mode mutually enabled? Any coercion? Any illegal content?
4. Moderator takes action: Warning, suspension, or ban
5. Both users notified of decision

---

## ⚖️ LEGAL & COMPLIANCE

### App Store Compliance

✅ **No explicit visual pornography**  
✅ **Consent-based system**  
✅ **Strong age verification**  
✅ **User reporting available**  
✅ **Human moderation in place**

### Legal Framework

✅ **Free speech for adults** (consenting sexual conversation is legal)  
✅ **No minors** (strict 18+ enforcement)  
✅ **No illegal content** (coercion, threats, extreme content blocked)  
✅ **Platform protection** (terms of service, moderation, logging)

### Dating App Standards

✅ **Aligns with dating app norms** (adult conversation expected)  
✅ **Better than competitors** (consent-focused, not censorship-focused)  
✅ **Safe and respectful** (clear boundaries, strong moderation)

---

## 📋 IMPLEMENTATION CHECKLIST

### Backend (Firebase/Cloud Functions)

- [ ] Create `adult_mode_settings` collection
- [ ] Implement toggle enable/disable logic
- [ ] Log all consent changes with timestamps
- [ ] Enforce mutual consent (both must enable)
- [ ] Content filtering rules (relaxed in adult mode)
- [ ] Report handling for adult mode violations

### Frontend (Mobile App)

- [ ] Add "Adult Mode" toggle to chat settings
- [ ] Consent dialog on first enable
- [ ] Visual indicator in chat header
- [ ] "Disable" button prominent and accessible
- [ ] Notification when other user enables
- [ ] Status check: Is mode active for both?

### Moderation (Admin Dashboard)

- [ ] Adult mode report queue
- [ ] View consent logs for both users
- [ ] Enforcement actions (warning, ban)
- [ ] Analytics: % of chats using adult mode

### Legal (Terms & Policies)

- [ ] Update Terms of Service with adult mode policy
- [ ] Update Community Guidelines
- [ ] Create Adult Mode FAQ
- [ ] Creator guidelines for adult content

---

## 📊 SUCCESS METRICS

### Adoption:

- % of chats with adult mode enabled
- Average time before users enable
- Retention rate of users who use adult mode

### Safety:

- Report rate in adult mode vs. standard mode
- % of reports that are valid violations
- Moderator response time
- User satisfaction with consent system

### Compliance:

- Zero App Store violations
- Zero legal issues
- Low abuse rate (<1%)

---

## 🚨 ENFORCEMENT

### Violations and Consequences:

| Violation | First Offense | Second Offense | Third Offense |
|-----------|---------------|----------------|---------------|
| Sending sexual messages without mutual consent | Warning + 24h chat restriction | 7-day suspension | Permanent ban |
| Explicit pornography (genitals visible) | Warning + content removal | 7-day suspension | Permanent ban |
| Coercion or threats | Immediate 7-day suspension | Permanent ban | - |
| Escorting offers ("pay for sex") | Immediate permanent ban | - | - |
| Minor-related content | Immediate permanent ban + report to authorities | - | - |

---

## 🎉 CONCLUSION

PACK 206c establishes that:

✅ **Adult romantic & sexual conversation is allowed with mutual consent**  
✅ **Consent is mandatory, explicit, and easily revocable**  
✅ **Clear boundaries protect users and maintain legality**  
✅ **App Store compliance is maintained**  
✅ **Avalo doesn't censor attraction between consenting adults**

### Core Message:

> **"Sexuality between consenting adults is welcome. Abuse, coercion and illegal content are not."**

---

## 📋 DOCUMENT STATUS

- **Status:** ✅ ACTIVE POLICY
- **Version:** REVISED v2 (FINAL OVERWRITE)
- **Authority:** Replaces ALL previous PACK 206c implementations
- **Date:** 2025-12-01
- **Scope:** All Avalo chat systems

---

**PACK 206c COMPLETE — REVISED v2 (OVERWRITE APPLIED)**

*Adult conversations are allowed, protected by consent, and moderated for safety.*