# PACK 200 — CONTENT SAFETY POLICY — REVISED v2 (OVERWRITE)

**Status**: ✅ COMPLETE — REVISED POLICY ACTIVE  
**Version**: 2.0 (OVERWRITE of v1.0)  
**Last Updated**: 2025-12-01  
**Critical Change**: Previous pack incorrectly blocked dating content — v2 corrects this

---

## POLICY OVERVIEW

Avalo is a dating and social connection platform. This policy establishes clear boundaries between **sensual/romantic content** (which is central to our platform's purpose) and **explicit pornography** (which is prohibited).

### Core Principle

> **"Sexy is fine. Porn is not. Dating energy is central, not a violation."**

This policy ensures users can express attraction, romance, and sensuality while maintaining a safe environment that prevents exploitation and explicit sexual content.

---

## CONTENT CLASSIFICATION

### ✅ ALLOWED WITHOUT RESTRICTION

The following content types are **fully permitted** and require no special consent toggles:

#### Attire & Fashion
- **Bikini photos** (beach, pool, vacation settings)
- **Lingerie photos** (artistic, romantic context)
- **Sexy outfits** (club wear, party attire, date night looks)
- **Fashion-forward revealing clothing** (crop tops, tight clothing, etc.)

#### Settings & Vibes
- **Club / nightlife scenes**
- **Beach / pool / vacation content**
- **Hotel / bedroom settings** (romantic, non-explicit)
- **Date night / romantic dinner vibes**

#### Poses & Expression
- **Flirty poses** (winking, playful expressions, body confidence)
- **Romantic selfies** (makeup, styled hair, attractive lighting)
- **Sensual photography** (tasteful, artistic, non-explicit)
- **Body confidence content** (fitness, self-love, empowerment)

#### Physical Affection
- **Kissing** (all types except overtly sexual)
- **Body contact** (hugging, cuddling, hand-holding, embracing)
- **Romantic physical intimacy** (non-explicit touching, caressing)
- **Couple content** (romantic displays of affection)

---

### 🔐 ALLOWED WITH CONSENT TOGGLE

The following content requires **mutual opt-in** from both parties through privacy settings:

#### Text-Based Intimacy
- **Sexting** (erotic text conversations)
- **Erotic storytelling** (written fantasies, romantic narratives)
- **Sexual innuendo** (playful suggestive language)
- **Dirty talk** (consensual adult conversation)

#### Media Sharing (18+ Sensual)
- **Sending 18+ sensual photos** (non-pornographic, artistic nudity)
- **Private intimate selfies** (suggestive but not explicit)
- **Body-focused content** (non-pornographic appreciation)

#### Video Communication
- **Sexually playful video chats** (between consenting adults)
- **Intimate video calls** (romantic, sensual, but not explicit sex acts)
- **Flirtatious video content** (consensual, private, non-pornographic)

**Consent Requirements**:
- Both users must enable "Adult Content" toggle in settings
- Content only visible in private 1-on-1 conversations
- Cannot be shared in public profiles or group chats
- Reporting mechanisms always available

---

### 🚫 BLOCKED (ZERO TOLERANCE)

The following content is **strictly prohibited** with immediate enforcement action:

#### Explicit Sexual Content
- ❌ **Explicit pornography** (any form)
- ❌ **Visible genitals** (even in private messages)
- ❌ **Sex acts on camera** (live or recorded)
- ❌ **Masturbation content** (photos or videos)
- ❌ **Penetration** (any depiction)

#### Commercial Sexual Services
- ❌ **Escorting services** (sexual services for money)
- ❌ **Prostitution solicitation** (offering or requesting paid sex)
- ❌ **Sexual service advertising** (any form)
- ❌ **OnlyFans-style transactional explicit content**

#### Child Safety (Zero Tolerance)
- ❌ **Minors in any sexual context** (including "barely legal" marketing)
- ❌ **Minor-coded visuals** (school uniforms, childlike features)
- ❌ **Age play content** (adult-minor roleplay)
- ❌ **Grooming behavior** (targeting young users)

#### Non-Consensual Content
- ❌ **Revenge porn** (shared without consent)
- ❌ **Deepfakes** (non-consensual AI-generated content)
- ❌ **Hidden camera content** (voyeurism)
- ❌ **Leaked private content** (unauthorized sharing)

---

## ENFORCEMENT LEVELS

### Level 1: Content Removed (No Penalty)
- First-time minor violations (e.g., accidentally uploading borderline content)
- User is notified and content is removed
- Educational warning sent

### Level 2: Temporary Restriction
- Repeated borderline violations
- 24-hour message sending restriction
- Must review content guidelines

### Level 3: Temporary Suspension
- Clear policy violation (e.g., sexting without consent toggle)
- 7-day account suspension
- Must acknowledge policy before reinstatement

### Level 4: Permanent Ban
- Zero-tolerance violations:
  - Explicit pornography
  - Sexual services for money
  - Any content involving minors
  - Non-consensual content sharing
- Immediate permanent ban with no appeal

---

## TECHNICAL IMPLEMENTATION

### AI Content Detection

```typescript
interface ContentSafetyCheck {
  // ALLOWED - No flags needed
  sensual: boolean;         // true = bikini, lingerie, flirty
  romantic: boolean;        // true = kissing, cuddling
  
  // REQUIRES CONSENT TOGGLE
  erotic: boolean;          // true = sexting, 18+ sensual
  requiresConsent: boolean; // true if erotic content detected
  
  // BLOCKED - Immediate action
  explicit: boolean;        // true = pornography, sex acts
  commercial: boolean;      // true = escorting, prostitution
  minor: boolean;           // true = any minor-related content
  
  action: 'allow' | 'require_consent' | 'block' | 'ban';
}
```

### Detection Triggers

**Allowed Content** (No Action):
- Body confidence poses
- Beach/pool attire
- Romantic couple photos
- Flirty expressions
- Fashion/makeup content

**Consent Required** (Check Toggle):
- Explicit language in messages
- 18+ suggestive photos in private messages
- Sexually charged video calls
- Body-focused intimate content

**Blocked Content** (Immediate):
- Nudity with visible genitals
- Sex acts (any form)
- Sexual services mentions
- Minor-coded imagery
- Non-consensual content

---

## USER EXPERIENCE

### Profile Photos
✅ **Allowed**: Bikini, lingerie, sexy outfits, body confidence  
⚠️ **Review**: Extreme close-ups, overly suggestive angles  
🚫 **Blocked**: Visible genitals, sex acts, nude below waist

### Private Messages
✅ **Allowed**: Flirty language, romantic compliments  
🔐 **Consent Toggle**: Sexting, erotic stories, 18+ sensual photos  
🚫 **Blocked**: Pornography, explicit videos, sexual service offers

### Video Calls
✅ **Allowed**: Romantic conversation, flirty banter  
🔐 **Consent Toggle**: Sexually playful content (no explicit acts)  
🚫 **Blocked**: Sex acts on camera, explicit content, commercial services

---

## EXAMPLES

### ✅ ALLOWED SCENARIOS

1. **Beach Date**: User posts bikini photo from vacation with caption "Beach vibes ☀️🌊"
2. **Night Out**: User in club dress at nightclub with friends
3. **Bedroom Selfie**: User in tank top and shorts taking mirror selfie
4. **Couple Content**: Two users kissing in a romantic restaurant photo
5. **Fitness Content**: User showing off workout results in gym attire

### 🔐 CONSENT TOGGLE SCENARIOS

1. **Sexting**: Users exchanging flirty messages → "Want to come over? 😏"
2. **Private Photos**: User sends lingerie photo in private 1-on-1 chat (both have adult content enabled)
3. **Video Flirting**: Couple on video call being sexually playful but not engaging in sex acts
4. **Erotic Story**: User writes romantic/sexual narrative in private message

### 🚫 BLOCKED SCENARIOS

1. **Escort Ad**: "Available tonight, $200/hr DM me" → **PERMANENT BAN**
2. **Explicit Photo**: User sends photo with visible genitals → **PERMANENT BAN**
3. **Sex Act Video**: User records sexual activity → **PERMANENT BAN**
4. **Minor Content**: Profile uses "barely 18" or school uniform imagery → **PERMANENT BAN**
5. **Revenge Porn**: User shares ex-partner's private photos without consent → **PERMANENT BAN**

---

## APPEALS PROCESS

### Level 1-3 Violations
- User can submit appeal through support ticket
- Human review within 24 hours
- Decision final after human review

### Level 4 Violations (Permanent Ban)
- **No appeals** for:
  - Explicit pornography
  - Sexual services
  - Minor-related content
  - Non-consensual content
- **Limited appeals** for:
  - False AI detection (rare cases)
  - Account compromise (must prove hack)

---

## WHAT CHANGED IN V2

### ❌ V1.0 MISTAKES (Corrected)

**OVER-CENSORED** (wrongly blocked):
- Dating energy and flirtation
- Bikini/beach photos
- Sexy outfit selfies
- Romantic kissing
- Sensual poses

**RESULT**: Users felt unable to express attraction, defeating platform purpose

### ✅ V2.0 CORRECTIONS

**NOW ALLOWED**:
- All sensual/romantic content central to dating
- Body confidence and attraction expression
- Flirty, sexy, romantic vibes
- Physical affection and intimacy (non-explicit)

**STILL BLOCKED**:
- Explicit pornography
- Sexual services for money
- Exploitative content
- Minor-related content

**KEY INSIGHT**: Dating requires attraction. Blocking sexy content blocked dating itself.

---

## MODERATION GUIDELINES

### For AI Systems
- **Prioritize context** over individual elements
- **Dating context** = OK | **Pornographic context** = Block
- **Artistic/romantic nudity** with consent = OK | **Explicit sex acts** = Block
- **When uncertain** → Human review (don't auto-ban)

### For Human Moderators
- **Assume good faith** for dating content
- **Sexy ≠ Pornography**
- **Context matters** (beach vs bedroom intent)
- **Consent toggle** is not permission for porn
- **Zero tolerance** only for explicit violations

---

## PACK INTEGRATION

### Firestore Rules
```javascript
// Pack 200: Content Safety v2
match /contentSafety/{contentId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && !request.resource.data.explicit
    && !request.resource.data.commercial
    && !request.resource.data.minor
    && (request.resource.data.erotic == false 
        || hasConsentToggle(request.auth.uid));
}

function hasConsentToggle(userId) {
  return get(/databases/$(database)/documents/users/$(userId))
    .data.settings.adultContentEnabled == true;
}
```

### Backend Functions
```typescript
// Pack 200: Content moderation
export const moderateContent = functions.firestore
  .document('messages/{messageId}')
  .onCreate(async (snap, context) => {
    const content = snap.data();
    const safetyCheck = await aiContentSafety.analyze(content);
    
    if (safetyCheck.action === 'ban') {
      await banUser(content.senderId, safetyCheck.reason);
      await deleteContent(snap.ref);
    } else if (safetyCheck.action === 'block') {
      await deleteContent(snap.ref);
      await warnUser(content.senderId);
    } else if (safetyCheck.action === 'require_consent') {
      const consented = await checkConsentToggle(
        content.senderId, 
        content.recipientId
      );
      if (!consented) {
        await deleteContent(snap.ref);
        await notifyConsentRequired(content.senderId);
      }
    }
    // 'allow' = no action needed
  });
```

---

## SUCCESS METRICS

### Content Health
- **Target**: <0.1% explicit content slips through
- **Target**: <5% false positives on dating content
- **Target**: >95% user satisfaction with policy fairness

### User Experience
- **Target**: Users feel safe to flirt and express attraction
- **Target**: Sexual harassment reports decrease 80%
- **Target**: Zero tolerance violations caught within 60 seconds

### Platform Health
- **Target**: Dating success rate increases (sexy content allowed)
- **Target**: Explicit content completely eliminated
- **Target**: Legal compliance maintained (no adult services)

---

## PACK 200 STATUS

✅ **Policy Revised** — v2.0 corrects over-censorship  
✅ **Sexy content allowed** — Dating energy restored  
✅ **Porn blocked** — Zero tolerance maintained  
✅ **Consent toggle** — Erotic content properly gated  
✅ **Zero tolerance** — Explicit violations instant ban  

**PACK 200 COMPLETE — REVISED v2 (OVERWRITE)**

---

## Summary

**What Changed**: V1 blocked dating itself by over-censoring attraction. V2 restores the core dating experience while maintaining safety.

**The Balance**:
- 👍 **Sexy, flirty, romantic** = ENCOURAGED
- 🔐 **Erotic, 18+ sensual** = CONSENSUAL
- 🚫 **Pornographic, exploitative** = BANNED

**The Rule**: If it belongs on a dating app, it's allowed. If it belongs on Pornhub, it's banned.

**End Result**: Users can express attraction and sexuality appropriately while remaining protected from exploitation and explicit pornography.

---

**PACK 200 — REVISED v2 — OVERWRITE COMPLETE**