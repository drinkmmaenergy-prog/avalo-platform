# PACK 179 — Quick Reference Guide

**Reputation & Risk Transparency Center** — TL;DR for Developers

---

## 🎯 Core Concept

**Public = Positive Achievements Only**  
**Private = Safety, Risk, Money, Moderation**

Never mix the two systems.

---

## 📦 Key Files

### Backend
- [`functions/src/pack179-reputation.ts`](functions/src/pack179-reputation.ts) — Cloud Functions
- [`functions/src/types/reputation.types.ts`](functions/src/types/reputation.types.ts) — Backend types
- [`firestore-pack179-reputation.rules`](firestore-pack179-reputation.rules) — Security rules
- [`firestore-pack179-reputation.indexes.json`](firestore-pack179-reputation.indexes.json) — Indexes

### Frontend
- [`app-mobile/app/reputation/index.tsx`](app-mobile/app/reputation/index.tsx) — Main screen
- [`app-mobile/app/reputation/settings.tsx`](app-mobile/app/reputation/settings.tsx) — Settings screen
- [`app-mobile/types/reputation.ts`](app-mobile/types/reputation.ts) — Client types

---

## 🔧 Common Tasks

### Award a Badge

```typescript
const assignBadgeFn = httpsCallable(functions, 'assignReputationBadge');
await assignBadgeFn({
  userId: 'user123',
  badgeType: 'verified_identity',
  metadata: { /* optional */ }
});
```

### Track Achievement

```typescript
const trackMilestoneFn = httpsCallable(functions, 'trackAchievementMilestone');
await trackMilestoneFn({
  userId: 'user123',
  category: 'education',
  title: 'Completed Course',
  description: 'Advanced TypeScript',
  isPublic: true
});
```

### Get Public Reputation

```typescript
const getReputationFn = httpsCallable(functions, 'getPublicReputation');
const result = await getReputationFn({ userId: 'user123' });
```

---

## 🏅 Badge Types

| Type | When to Award |
|------|---------------|
| `verified_identity` | ID + face verification complete |
| `verified_skills` | Skills assessment passed |
| `completed_project` | Learning path finished |
| `event_participation` | Workshop attended/hosted |
| `digital_product_milestone` | Product delivered |
| `collaboration_pass` | Brand collab approved |
| `accelerator_graduate` | PACK 164 completed |
| `course_creator` | Course published |
| `workshop_host` | Workshop hosted |
| `community_contributor` | Active participation |

---

## 🚫 NEVER Expose

- Safety scores
- Risk levels
- Moderation history
- Suspension records
- Financial transactions
- Abuse cases
- Fraud disputes
- Vulnerability profiles
- Spending/earning amounts

**⚠️ Violation = Security breach**

---

## 🔒 Security Rules

```
reputation_badges/          ✅ User can read own
achievement_milestones/     ✅ User can read own + public verified
reputation_display_settings/ ✅ User can read/write own
public_reputation/          ✅ Anyone can read
product_reviews/            ✅ Anyone can read, user can create own

safety_scores/              ❌ PRIVATE (user only)
safety_events/              ❌ PRIVATE (user + moderator)
```

---

## 🎨 UI Components

**Reputation Center:**
- Overview tab (stats + recent)
- Badges tab (collection view)
- Achievements tab (timeline)

**Settings:**
- Display toggles
- Privacy levels
- Privacy education

---

## 🧪 Quick Test

```typescript
// 1. Assign badge
await assignReputationBadge({
  userId: 'test123',
  badgeType: 'verified_identity'
});

// 2. Verify no forbidden fields
await validateReputationSeparation({ userId: 'test123' });

// 3. Check public view
const rep = await getPublicReputation({ userId: 'test123' });
console.assert(!rep.safetyScore); // Should be undefined
```

---

## 📋 Deployment Checklist

- [ ] Deploy Firestore rules
- [ ] Deploy Cloud Functions
- [ ] Deploy indexes
- [ ] Test badge assignment
- [ ] Test separation validation
- [ ] Verify UI screens work
- [ ] Check privacy controls

---

## 🐛 Common Issues

**Badge not showing?**
- Check `displayBadges` setting
- Verify badge was assigned successfully
- Check privacy level

**Separation violation?**
- Run `validateReputationSeparation()`
- Check audit logs
- Review recent code changes

**UI not loading?**
- Check user authentication
- Verify Firestore rules deployed
- Check console for errors

---

## 📞 Need Help?

**Security Issue:** Immediately contact security team  
**Technical Question:** Review [`PACK_179_REPUTATION_RISK_TRANSPARENCY_IMPLEMENTATION.md`](PACK_179_REPUTATION_RISK_TRANSPARENCY_IMPLEMENTATION.md)  
**Feature Request:** Submit to product team

---

## ⚡ Remember

1. **Reputation = Positive Only**
2. **Safety = Private Always**
3. **Never Mix The Two**
4. **Validate Before Deploy**
5. **Audit Regularly**

---

*Keep it simple. Keep it safe. Keep it positive.*