# AI Operations Runbook

## Overview

This runbook covers AI companion issues, moderation failures, token management, and NSFW content handling.

## Common Issues

### 1. AI Moderation Failures

**Symptoms:**
- Inappropriate content not being flagged
- False positives blocking legitimate content
- Moderation API timeouts

**Diagnosis:**
```bash
# Check AI moderation metrics
gcloud logging read "resource.type=cloud_function AND textPayload=~'ai.*moderation.*failed'" --limit=50

# Check OpenAI API status
curl https://status.openai.com/api/v2/status.json

# Review recent moderation results
firebase firestore:query moderationResults \
  --where createdAt>="{timestamp}" \
  --order-by createdAt desc \
  --limit=100
```

**Resolution:**

1. **API Failures:**
   ```bash
   # Check API key validity
   node scripts/test-openai-connection.js
   
   # Rotate API keys if needed
   firebase functions:config:set openai.api_key="{new_key}"
   firebase deploy --only functions:aiModeration
   
   # Use fallback moderation
   firebase functions:config:set ai.fallback_enabled=true
   ```

2. **False Positives:**
   ```bash
   # Review flagged content
   firebase firestore:get moderationResults/{resultId}
   
   # Adjust sensitivity threshold
   firebase functions:config:set ai.moderation_threshold=0.8
   
   # Whitelist user if repeatedly flagged incorrectly
   node scripts/whitelist-user.js --userId={userId}
   ```

3. **Performance Issues:**
   ```bash
   # Check moderation queue
   node scripts/check-moderation-queue.js
   
   # Scale moderation workers
   gcloud run services update avalo-ai-moderation \
     --min-instances=5 --max-instances=20
   ```

**Prevention:**
- Monitor moderation accuracy (target: >95%)
- Regular model evaluation
- Human review sample
- A/B test threshold changes

### 2. AI Companion Response Issues

**Symptoms:**
- Slow AI responses
- Inconsistent personalities
- Context loss in conversations

**Diagnosis:**
```bash
# Check AI response latency
./scripts/check-ai-latency.sh

# Review conversation context
firebase firestore:get aiChats/{chatId}

# Check token usage
node scripts/check-token-usage.js --period=today
```

**Resolution:**

1. **Slow Responses:**
   ```bash
   # Check OpenAI API latency
   curl -w "@curl-format.txt" -o /dev/null -s \
     https://api.openai.com/v1/chat/completions
   
   # Switch to faster model temporarily
   firebase functions:config:set ai.model="gpt-3.5-turbo"
   
   # Increase timeout
   firebase functions:config:set ai.timeout=30000
   ```

2. **Context Loss:**
   ```bash
   # Check context window size
   firebase firestore:get aiChats/{chatId}/context
   
   # Rebuild conversation context
   node scripts/rebuild-ai-context.js --chatId={chatId}
   
   # Increase context retention
   firebase functions:config:set ai.max_context_messages=50
   ```

3. **Personality Drift:**
   ```bash
   # Reset companion personality
   node scripts/reset-companion.js \
     --companionId={companionId} \
     --resetPersonality=true
   
   # Update system prompt
   firebase firestore:update aiCompanions/{companionId} \
     --data '{"systemPrompt":"{new_prompt}"}'
   ```

**Prevention:**
- Cache common responses
- Optimize context management
- Regular personality consistency checks
- Load testing with realistic scenarios

### 3. Token Limit Exceeded

**Symptoms:**
- Users hitting daily token limits
- Unexpected token consumption
- High AI costs

**Diagnosis:**
```bash
# Check token usage by user
node scripts/token-usage-report.js --userId={userId}

# Check total daily usage
./scripts/check-daily-tokens.sh

# Identify high-usage users
firebase firestore:query aiTokenUsage \
  --where date=="{today}" \
  --order-by tokensUsed desc \
  --limit=20
```

**Resolution:**

1. **Adjust User Limits:**
   ```bash
   # Increase user limit
   firebase firestore:update users/{userId} \
     --data '{"aiTokenLimit":10000}'
   
   # Grant bonus tokens
   node scripts/grant-bonus-tokens.js \
     --userId={userId} \
     --tokens=5000
   ```

2. **Optimize Token Usage:**
   ```bash
   # Enable response caching
   firebase functions:config:set ai.cache_enabled=true
   
   # Reduce max response length
   firebase functions:config:set ai.max_tokens=500
   
   # Use cheaper model for simple queries
   firebase functions:config:set ai.simple_model="gpt-3.5-turbo"
   ```

3. **Cost Management:**
   ```bash
   # Check spending by feature
   node scripts/ai-cost-breakdown.js --period=month
   
   # Set budget alerts
   gcloud billing budgets create \
     --budget-amount=1000 \
     --threshold-rule=percent=90
   ```

**Prevention:**
- Implement token budgeting
- Cache frequent queries
- Use appropriate model tiers
- Monitor cost per interaction

### 4. NSFW Content Handling

**Symptoms:**
- NSFW content in SFW contexts
- Age verification bypass
- Inappropriate AI responses

**Diagnosis:**
```bash
# Check NSFW filters
node scripts/check-nsfw-filters.js

# Review flagged content
firebase firestore:query content \
  --where nsfw==true \
  --where reported==true \
  --limit=50

# Check age verification status
firebase firestore:get users/{userId}/verification
```

**Resolution:**

1. **Enable NSFW Filters:**
   ```bash
   # Force NSFW moderation
   firebase functions:config:set ai.nsfw_strict=true
   
   # Update content filters
   node scripts/update-nsfw-filters.js --strict=true
   
   # Recategorize content
   node scripts/recategorize-content.js \
     --type=ai_companions \
     --checkNSFW=true
   ```

2. **Age Verification:**
   ```bash
   # Verify user age
   firebase firestore:get users/{userId}/kyc
   
   # Force re-verification
   node scripts/require-reverification.js --userId={userId}
   
   # Disable NSFW access
   firebase firestore:update users/{userId} \
     --data '{"nsfwAccess":false}'
   ```

3. **Content Removal:**
   ```bash
   # Remove inappropriate content
   firebase firestore:delete aiChats/{chatId}
   
   # Ban companion
   firebase firestore:update aiCompanions/{companionId} \
     --data '{"status":"banned","reason":"NSFW violation"}'
   
   # Notify user
   node scripts/send-violation-notice.js --userId={userId}
   ```

**Prevention:**
- Strict age verification
- Double-layer NSFW detection
- Regular content audits
- User reporting system

## Emergency Procedures

### Complete AI Outage

```bash
# 1. Enable fallback system
firebase functions:config:set ai.fallback_enabled=true
firebase deploy --only functions

# 2. Show maintenance message
firebase functions:config:set ai.maintenance_mode=true

# 3. Check OpenAI status
curl https://status.openai.com/api/v2/status.json

# 4. Switch to backup provider
firebase functions:config:set ai.provider="anthropic"
firebase functions:config:set ai.api_key="{anthropic_key}"
firebase deploy --only functions:aiChat

# 5. Monitor recovery
./scripts/monitor-ai-recovery.sh
```

## Escalation

### Level 1: On-Call Engineer
- Moderation failures
- Performance issues
- Token limit issues

### Level 2: AI/ML Team
- Model problems
- Context issues
- Complex moderation cases

### Level 3: CTO + Legal
- Major NSFW incidents
- Compliance violations
- Security breaches

## Monitoring

### Key Metrics
- Moderation accuracy: >95%
- AI response time: <3s
- Token cost per interaction: <$0.05
- NSFW detection rate: >99%

### Alerts
- Moderation failures >5/min
- AI latency >5s for 3min
- Token budget at 90%
- NSFW violations >10/hour

## Contact Information

- **OpenAI Support**: https://platform.openai.com/docs/support
- **AI/ML Team**: ai-team@avalo.app
- **On-Call**: PagerDuty
- **Trust & Safety**: safety@avalo.app