# Matchmaking Operations Runbook

## Overview

Matchmaking algorithm issues, spam detection, and free message system problems.

## Common Issues

### 1. Anti-Spam System False Positives

**Diagnosis:**
```bash
# Check spam flags
firebase firestore:query users \
  --where spamFlagged==true \
  --limit=50

# Review user activity
node scripts/check-user-activity.js --userId={userId}
```

**Resolution:**
```bash
# Remove spam flag
firebase firestore:update users/{userId} \
  --data '{"spamFlagged":false,"spamScore":0}'

# Whitelist user
node scripts/whitelist-user.js --userId={userId}

# Reset rate limits
node scripts/reset-rate-limit.js --userId={userId}
```

### 2. Free Messages Not Working

**Diagnosis:**
```bash
# Check match status
firebase firestore:get matches/{matchId}

# Verify free message eligibility
node scripts/check-free-msg-eligibility.js --matchId={matchId}
```

**Resolution:**
```bash
# Reset free message counter
firebase firestore:update matches/{matchId} \
  --data '{"freeMessagesUsed":0}'

# Extend free message period
node scripts/extend-free-period.js --matchId={matchId} --days=7
```

### 3. Poor Match Quality

**Diagnosis:**
```bash
# Check matching algorithm performance
./scripts/analyze-match-quality.sh

# Review user preferences
firebase firestore:get users/{userId}/preferences
```

**Resolution:**
```bash
# Recalculate match scores
node scripts/recalculate-matches.js --userId={userId}

# Update algorithm weights
firebase functions:config:set matching.weights='{"interests":0.3,"location":0.2,"age":0.2,"activity":0.3}'
```

## Monitoring
- Match rate: >60%
- Spam detection accuracy: >95%
- Free message usage: >70%