# PACK 188 v2 — QUICK REFERENCE GUIDE

## 🚀 TL;DR

Avalo's messaging tone is now **sexy, bold, romantic, luxury** — not soft, sterile, or PG-friendly.

---

## ✅ DO THIS (Good Tone)

```typescript
// Profile view
"Someone can't look away from your profile."

// Match notification
"This is chemistry. Take it further."

// Call to action
"Make the move before someone else does."

// Premium upsell
"See who's obsessed with you."

// Re-engagement
"Someone's still thinking about you."
```

---

## ❌ NEVER DO THIS (Bad Tone)

```typescript
// Too generic
"Someone viewed your profile."

// Too corporate
"You have a new match!"

// Too desperate
"We miss you! Come back!"

// PACK 207: Anti-romance language permanently removed

// Too sterile
"Check your matches today."
```

---

## 📦 Import & Use

```typescript
import { AVALO_MESSAGES, getRandomMessage } from './PACK_188_MESSAGE_TEMPLATES';

// Get a random message
const msg = getRandomMessage(AVALO_MESSAGES.match.newMatch);

// Returns one of:
// "Someone incredible just liked you back."
// "This is chemistry. Take it further."
// "They're into you. What's next?"
// etc.
```

---

## 🎯 Available Categories

```typescript
AVALO_MESSAGES.profile.viewNotifications     // Someone viewed you
AVALO_MESSAGES.activity.onlineNow           // Real-time presence
AVALO_MESSAGES.cta.makeTheMove              // Action prompts
AVALO_MESSAGES.match.newMatch               // Match notifications
AVALO_MESSAGES.premium.upsellSeduction      // Premium features
AVALO_MESSAGES.reengagement.pullBack        // Bring users back
AVALO_MESSAGES.conversation.iceBreakers     // Chat starters
AVALO_MESSAGES.safety.guidancePositive      // Moderation (tone kept!)
AVALO_MESSAGES.onboarding.welcome           // New user flow
AVALO_MESSAGES.daily.eveningPrime           // Daily engagement
AVALO_MESSAGES.system.loading               // System states
```

---

## 🔍 Validate Custom Messages

```typescript
import { validateTone } from './PACK_188_MESSAGE_TEMPLATES';

const result = validateTone("Your custom message");

if (!result.valid) {
  console.error('Violations:', result.violations);
  // Example violations:
  // - Contains corporate term: "platform"
  // - Contains desperate language: "please"
  // - Contains forbidden phrase: "No flirting"
}
```

---

## 🎨 Tone Principles

1. **Sexy but Classy** — Alluring, not explicit
2. **Confident, Not Needy** — Bold, not desperate
3. **Playful & Teasing** — Fun with edge
4. **Luxury Experience** — Premium, not cheap
5. **Emotionally Stimulating** — Creates desire
6. **Romance-Friendly** — Embraces attraction

---

## 🚫 Forbidden Words

Never use in user-facing copy:
- "platform"
- "service"
- "app"
- "please"
- "we miss you"
- "come back"

---

## 📊 Before → After Examples

### Profile View
```diff
- "Someone viewed your profile."
+ "Your profile stopped them mid-scroll."
```

### Match
```diff
- "You have a new match!"
+ "This is chemistry. Take it further."
```

### Premium
```diff
- "Upgrade to see who liked you."
+ "See who's obsessed with you."
```

### CTA
```diff
- "Say hello to your match!"
+ "Make the move before someone else does."
```

---

## 🌍 Translations

Preserve these elements:
- **Confidence level** — Don't dilute boldness
- **Playful edge** — Keep the tease
- **Romantic undertone** — Maintain tension
- **Premium feel** — Luxury transcends language

Example:
```
EN: "Make the move before someone else does."
ES: "Haz el movimiento antes que alguien más."
FR: "Agis avant qu'un autre ne le fasse."
PL: "Rusz się, zanim ktoś inny to zrobi."
```

---

## ✏️ Writing New Copy Checklist

Before submitting new user-facing copy, ask:

- [ ] Is it confident (not needy)?
- [ ] Is it playful (not corporate)?
- [ ] Does it stimulate emotion?
- [ ] Would it feel premium/luxury?
- [ ] Does it avoid prohibited terms?
- [ ] Would users feel attracted to the platform?
- [ ] Does it pass `validateTone()`?

---

## 🎭 Category-Specific Guidelines

### Onboarding
**Goal:** Create excitement about possibilities
```typescript
✅ "Welcome to where chemistry happens."
❌ "Welcome! Set up your profile to get started."
```

### Engagement
**Goal:** Drive action with subtle urgency
```typescript
✅ "Tonight's lineup looks promising."
❌ "You have 5 new matches to review."
```

### Premium
**Goal:** Luxury appeal, not scarcity
```typescript
✅ "Unlock the VIP experience."
❌ "Upgrade now! Limited time offer!"
```

### Safety
**Goal:** Maintain tone even when moderating
```typescript
✅ "Keep it classy. They'll appreciate it."
❌ "Your behavior violates our guidelines."
```

---

## 🔧 Implementation Tips

### Random Selection
```typescript
const messages = AVALO_MESSAGES.match.newMatch;
const random = messages[Math.floor(Math.random() * messages.length)];
```

### With Context
```typescript
import { getPersonalizedMessage } from './PACK_188_MESSAGE_TEMPLATES';

const message = getPersonalizedMessage(
  "Make the move before someone else does.",
  { timeOfDay: 'night' }
);
// Automatically adjusts for time context
```

### Validation in CI/CD
```typescript
// Add to your linting/testing pipeline
test('all copy must pass tone validation', () => {
  const result = validateTone(yourMessage);
  expect(result.valid).toBe(true);
});
```

---

## 📚 Full Documentation

For comprehensive guidelines:
- [`PACK_188_TONE_GUIDELINES_V2.md`](PACK_188_TONE_GUIDELINES_V2.md) — Full tone manual
- [`PACK_188_MESSAGE_TEMPLATES.ts`](PACK_188_MESSAGE_TEMPLATES.ts) — All templates
- [`PACK_188_IMPLEMENTATION_COMPLETE.md`](PACK_188_IMPLEMENTATION_COMPLETE.md) — Complete implementation

---

## 🆘 Common Mistakes

**Mistake:** Using "platform" in messaging
```diff
- "Welcome to our platform!"
+ "Welcome to where chemistry happens."
```

**Mistake:** Being too corporate
```diff
- "Your account has been updated."
+ "All set. Time to shine."
```

**Mistake:** Sounding desperate
```diff
- "Please come back! We miss you!"
+ "Someone's still thinking about you."
```

**Mistake:** Anti-romance language
```diff
- "Keep interactions professional."
+ "Keep it classy. They'll appreciate it."
```

---

## 💡 Pro Tips

1. **Use emotional triggers** — Anticipation, desire, exclusivity
2. **Create urgency subtly** — "before someone else does"
3. **Imply desirability** — "obsessed with you," "can't look away"
4. **Stay confident** — Never ask or beg
5. **Keep it short** — Punch, don't ramble

---

## 🎯 Success Metrics

Track these to measure tone impact:
- Notification CTR
- Premium conversion rate
- Re-engagement rate
- User sentiment feedback
- Brand perception surveys

---

## 🔄 Updates & Maintenance

- **Version:** v2 (Complete Overwrite)
- **Last Updated:** December 1, 2025
- **Review Cycle:** Monthly
- **Owner:** Product/Marketing Teams

---

## ⚡ One-Line Summary

**Old Tone:** Soft, sterile, PG-friendly, forgettable  
**New Tone:** Sexy, bold, romantic, luxury, memorable

---

*"If you feel the spark — say something."*

**PACK 188 v2 — Your messaging is your product.**