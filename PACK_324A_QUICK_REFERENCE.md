# PACK 324A — Quick Reference Guide

## 🎯 Summary

Post-launch KPI monitoring system with read-only analytics for platform health, revenue, user activity, fraud signals, and AI/chat/call/event performance.

**Key Points**:
- ✅ Admin-only access
- ✅ Read-only from business logic
- ✅ Zero tokenomics changes
- ✅ Scheduled daily/hourly aggregation
- ✅ Mobile + Web dashboards ready

---

## 📦 Collections

| Collection | Document ID | Purpose |
|-----------|-------------|---------|
| `platformKpiDaily` | `YYYY-MM-DD` | Daily platform metrics |
| `platformKpiHourly` | `YYYY-MM-DD_HH` | Hourly activity tracking |
| `creatorKpiDaily` | `{userId}_YYYY-MM-DD` | Creator earnings by day |
| `safetyKpiDaily` | `YYYY-MM-DD` | Safety & moderation metrics |

---

## 🔧 Cloud Functions

### Scheduled Jobs

```typescript
kpi_aggregateDailyScheduled    // Daily at 00:10 UTC
kpi_aggregateHourlyScheduled   // Every hour at :10
kpi_cleanupHourlyScheduled     // Daily at 01:00 UTC (cleanup)
```

### Callable Functions (Admin-Only)

```typescript
// Get platform KPI
kpi_getPlatformDaily({ date: 'YYYY-MM-DD' })

// Get creator KPI
kpi_getCreatorDaily({ userId: 'xxx', date: 'YYYY-MM-DD' })

// Get safety KPI
kpi_getSafetyDaily({ date: 'YYYY-MM-DD' })

// Get summary for date range
kpi_admin_getSummary({ startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' })

// Get top creators
kpi_admin_getTopCreators({ startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', limit: 50 })

// Manual trigger
kpi_admin_triggerAggregation({ date: 'YYYY-MM-DD' })
```

---

## 📱 Mobile Routes

```typescript
/admin/kpi-dashboard           // Main KPI dashboard
```

---

## 💰 Revenue Calculation

```typescript
PLN Revenue = Token Amount × 0.20

Examples:
  1,000 tokens = 200.00 PLN
  5,000 tokens = 1,000.00 PLN
  45,230 tokens = 9,046.00 PLN
```

---

## 📊 Data Sources

| Metric | Source Collection |
|--------|------------------|
| New Users | `users` (createdAt) |
| Active Users | `users` (lastActiveAt) |
| Token Spend | `walletTransactions` (type = SPEND) |
| Chats | `aiChatSessions` |
| Voice Minutes | `aiVoiceCallSessions` (durationMinutes) |
| Video Minutes | `aiVideoCallSessions` (durationMinutes) |
| Calendar | `calendarBookings` |
| Events | `eventTickets` |
| Reports | `moderationQueue` |
| Bans | `enforcement_logs` (action = BAN) |
| Panic Events | `safetyAlerts` (type = PANIC) |

---

## 🚀 Quick Deploy

```bash
# Deploy everything
firebase deploy --only firestore:rules,firestore:indexes,functions

# Deploy specific functions only
firebase deploy --only functions:kpi_aggregateDailyScheduled,functions:kpi_getPlatformDaily
```

---

## ✅ Zero-Drift Checklist

- [x] No wallet writes
- [x] No pricing changes
- [x] No split changes (65/35, 80/20)
- [x] No refund logic changes
- [x] No chat monetization impact
- [x] No AI billing impact
- [x] Pure read-only aggregation

---

## 🐛 Troubleshooting

**"Permission denied"**
→ User is not admin (check `user.role` or `user.roles.admin`)

**"No data found"**
→ Run `kpi_admin_triggerAggregation({ date })` for backfill

**"Function timeout"**
→ Reduce batch size in aggregation code (default: 100)

**"Missing indexes"**
→ Deploy `firestore-pack324a-kpi.indexes.json`

---

## 📞 Contact

**Implementation**: PACK 324A  
**Version**: 1.0.0  
**Date**: 2025-12-11  
**Status**: Production-Ready ✅