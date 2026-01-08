# Phase 22: CSAM Shield Implementation

## Child Sexual Abuse Material Protection System

**Status**: ✅ IMPLEMENTED  
**Date**: 2025-11-21  
**Version**: 1.0  

---

## Executive Summary

Phase 22 implements a comprehensive CSAM (Child Sexual Abuse Material) Shield for the Avalo platform using a **human-in-the-loop moderation model**. The system automatically detects potential CSAM content and freezes accounts/hides content immediately, but external reporting to law enforcement or hotlines is triggered only after human moderator confirmation.

### Key Principles

1. **Child Safety First**: Immediate protective actions for HIGH/CRITICAL risk
2. **Human Verification**: External reports require moderator confirmation
3. **100% Additive**: No changes to existing monetization or business logic
4. **Privacy Focused**: Never store actual CSAM content, only references
5. **Legal Compliance**: Clear extension points for jurisdiction-specific reporting

---

## Architecture Overview

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    CSAM Shield System                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐      ┌──────────────────┐             │
│  │  Detection      │      │  Incident        │             │
│  │  Engine         │─────▶│  Management      │             │
│  │  (Text/Image)   │      │  (Firestore)     │             │
│  └─────────────────┘      └──────────────────┘             │
│           │                        │                         │
│           ▼                        ▼                         │
│  ┌─────────────────┐      ┌──────────────────┐             │
│  │  Protective     │      │  Moderator       │             │
│  │  Actions        │      │  Review Queue    │             │
│  │  (Auto-freeze)  │      │  (Human Loop)    │             │
│  └─────────────────┘      └──────────────────┘             │
│                                    │                         │
│                                    ▼                         │
│                           ┌──────────────────┐              │
│                           │  Authority       │              │
│                           │  Reporting       │              │
│                           │  (After Review)  │              │
│                           └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Detection**: User action (message, upload, etc.) → CSAM check
2. **Auto-Protection**: HIGH/CRITICAL → Freeze account + Hide content
3. **Incident Creation**: Create `csamIncidents/{incidentId}` with status `OPEN_REVIEW`
4. **Human Review**: Moderator reviews → Confirms or clears
5. **Escalation**: If confirmed → Update to `ESCALATED_TO_AUTHORITIES` → Report

---

## Implementation Details

### 1. Backend Modules

#### [`functions/src/types/csam.ts`](functions/src/types/csam.ts:1)
Complete TypeScript type definitions for CSAM Shield:
- `CsamRiskSource`: Sources where CSAM can be detected
- `CsamRiskLevel`: LOW | MEDIUM | HIGH | CRITICAL
- `CsamDetectionChannel`: auto_text | auto_image | user_report | manual_flag
- `CsamIncidentStatus`: OPEN_REVIEW | CONFIRMED_CSAM | CLEARED_FALSE_POSITIVE | ESCALATED_TO_AUTHORITIES
- `CsamIncident`: Main incident record structure

#### [`functions/src/csamShield.ts`](functions/src/csamShield.ts:1)
Core CSAM Shield engine with:
- [`evaluateTextForCsamRisk()`](functions/src/csamShield.ts:87): Rule-based text analysis
- [`createCsamIncident()`](functions/src/csamShield.ts:222): Incident creation
- [`applyImmediateProtectiveActions()`](functions/src/csamShield.ts:256): Account freeze + visibility blocking
- [`updateCsamIncidentStatus()`](functions/src/csamShield.ts:318): Moderator status updates
- [`reportCsamToAuthorities()`](functions/src/csamShield.ts:379): External reporting (placeholder)

#### [`functions/src/mediaUpload.ts`](functions/src/mediaUpload.ts:1)
Media upload validation with CSAM check placeholder:
- [`validateMediaUpload()`](functions/src/mediaUpload.ts:24): Pre-upload validation
- [`evaluateImageForCsamRisk()`](functions/src/mediaUpload.ts:35): Placeholder for image scanning

### 2. Cloud Functions (Moderator APIs)

Added to [`functions/src/index.ts`](functions/src/index.ts:1197):

#### [`csam_adminListIncidents`](functions/src/index.ts:1201)
- **Auth**: Moderator role required
- **Purpose**: List incidents with filters
- **Filters**: status, riskLevel, pagination
- **Returns**: List of incidents with metadata

#### [`csam_adminGetIncident`](functions/src/index.ts:1247)
- **Auth**: Moderator role required
- **Purpose**: Get full incident details
- **Returns**: Incident + denormalized user info

#### [`csam_adminUpdateIncidentStatus`](functions/src/index.ts:1296)
- **Auth**: Moderator role required
- **Purpose**: Update incident status
- **Allowed Transitions**:
  - `OPEN_REVIEW` → `CONFIRMED_CSAM` or `CLEARED_FALSE_POSITIVE`
  - `CONFIRMED_CSAM` → `ESCALATED_TO_AUTHORITIES`
- **Actions**:
  - `CONFIRMED_CSAM`: Ensures account frozen, visibility blocked
  - `CLEARED_FALSE_POSITIVE`: Unfreeze account, restore visibility
  - `ESCALATED_TO_AUTHORITIES`: Creates report, calls [`reportCsamToAuthorities()`](functions/src/csamShield.ts:379)

### 3. Integration Points

All integrations are **surgical and additive** - they do not modify existing business logic.

#### Chat Module ([`chatMonetization.ts`](functions/src/chatMonetization.ts:463))
- **Hook**: [`processMessageBilling()`](functions/src/chatMonetization.ts:463) - before message send
- **Action**: Evaluate text → Block if HIGH/CRITICAL → Create incident
- **User Experience**: "Message rejected for safety reasons. Your account is under review."

#### AI Chat Module ([`aiChatEngine.ts`](functions/src/aiChatEngine.ts:165))
- **Hook**: [`processAiMessage()`](functions/src/aiChatEngine.ts:165) - before AI response
- **Action**: Evaluate user message → Block if HIGH/CRITICAL
- **Prevents**: Users exploiting AI bots for CSAM fantasies

#### Questions Module ([`questionsEngine.ts`](functions/src/questionsEngine.ts:96))
- **Hooks**: 
  - [`createQuestion()`](functions/src/questionsEngine.ts:96) - before question creation
  - [`createAnswer()`](functions/src/questionsEngine.ts:278) - before answer creation
- **Action**: Evaluate text → Reject if HIGH/CRITICAL

#### AI Bot Prompts ([`aiBotEngine.ts`](functions/src/aiBotEngine.ts:346))
- **Hook**: [`generateAiResponse()`](functions/src/aiBotEngine.ts:346) - before generating response
- **Action**: Check user prompt → Return safe rejection if HIGH/CRITICAL

#### LIVE Module
- **Note**: LIVE comments are typically client-side real-time
- **Integration**: Client must check `safety.csamUnderReview` before allowing LIVE session start
- **Server-side**: All content creation blocked when `csamUnderReview === true`

#### Media Uploads ([`mediaUpload.ts`](functions/src/mediaUpload.ts:24))
- **Hook**: [`validateMediaUpload()`](functions/src/mediaUpload.ts:24) - before storage upload
- **Status**: Placeholder for future image scanning integration
- **Extension Point**: [`evaluateImageForCsamRisk()`](functions/src/csamShield.ts:421)

---

## Risk Levels & Examples

### LOW Risk
**Characteristics**: Isolated terms without clear combination  
**Action**: No blocking, no incident  
**Examples**:
- "My child loves this app" (contextually appropriate)
- "Young professionals networking" (business context)
- "Kids' movie recommendations" (family content)

### MEDIUM Risk
**Characteristics**: Some concerning patterns but not definitive  
**Action**: Flag for moderator notification, no auto-block  
**Examples**:
- Multiple child terms + one sexual term without clear connection
- Ambiguous age references + mild adult content

### HIGH Risk
**Characteristics**: Clear combination of child + sexual terms  
**Action**: ⚠️ AUTO-BLOCK + Create incident + Freeze account  
**Examples**:
- "15 year old" + "sexual" or "naked"
- "schoolgirl" + multiple sexual terms
- Age pattern (0-17) + explicit sexual content

**Moderator Actions Required**:
- Review context and user history
- Confirm or clear false positive
- If confirmed → escalate to authorities

### CRITICAL Risk
**Characteristics**: Strong, unmistakable CSAM indicators  
**Action**: 🚨 IMMEDIATE AUTO-BLOCK + High-priority incident  
**Examples**:
- Multiple child terms + multiple sexual terms
- Age-specific patterns + explicit solicitation
- Clear grooming language patterns

**Moderator Actions Required**:
- **URGENT**: Immediate review (within 1 hour)
- Confirm CSAM
- Escalate to authorities
- Preserve evidence for law enforcement

---

## Detection Patterns

### Multi-Language Support

Currently supports **English (EN)** and **Polish (PL)**:

**English Child Terms**:
- child, kid, minor, underage, teen, teenager
- boy, girl, young, youth, juvenile, adolescent
- schoolgirl, schoolboy, student, pupil, preteen

**Polish Child Terms**:
- dziecko, nieletni, nieletnią, nastolatek, nastolatka
- chłopiec, dziewczyna, młody, młoda
- uczeń, uczennica, małoletni, małoletnia

**Sexual Terms**: Maintained in config, not listed here for safety

### Pattern Matching Logic

```typescript
// Critical: 2+ child terms + 2+ sexual terms
if (childTermCount >= 2 && sexualTermCount >= 2) → CRITICAL

// High: 1+ child term + 2+ sexual terms
if (childTermCount >= 1 && sexualTermCount >= 2) → HIGH

// High: Age pattern (0-17) + sexual term
if (agePattern && sexualTermCount >= 1) → HIGH

// Medium: Borderline combinations
if (childTermCount >= 2 && sexualTermCount >= 1) → MEDIUM
```

---

## Moderator Workflow

### Step 1: Incident Discovery

Moderators access incidents via Firebase Console or (future) admin dashboard:

```typescript
// Call csam_adminListIncidents
{
  status: "OPEN_REVIEW",
  riskLevel: "HIGH",
  limit: 50
}
```

### Step 2: Investigation

View full incident details:

```typescript
// Call csam_adminGetIncident
{
  incidentId: "incident_xyz123"
}

// Returns:
{
  incident: {
    userId: "user_abc",
    source: "chat",
    riskLevel: "HIGH",
    contentSnippet: "...",
    detectedAt: "2025-11-21T10:30:00Z"
  },
  userInfo: {
    displayName: "...",
    email: "...",
    createdAt: "..."
  }
}
```

### Step 3: Decision Making

**If Confirmed CSAM**:
```typescript
// Update to CONFIRMED_CSAM
csam_adminUpdateIncidentStatus({
  incidentId: "incident_xyz123",
  newStatus: "CONFIRMED_CSAM",
  moderatorNote: "Verified CSAM indicators. Escalating."
})
```

**Actions Taken**:
- Account remains frozen
- Visibility remains blocked
- Withdrawals blocked
- Ready for authority reporting

**If False Positive**:
```typescript
// Clear as false positive
csam_adminUpdateIncidentStatus({
  incidentId: "incident_xyz123",
  newStatus: "CLEARED_FALSE_POSITIVE",
  moderatorNote: "False positive - innocent context confirmed."
})
```

**Actions Taken**:
- `csamUnderReview` set to false
- Account unfrozen
- Visibility restored
- User can resume normal activity

### Step 4: External Reporting

**Only after confirmation**:
```typescript
// Escalate to authorities
csam_adminUpdateIncidentStatus({
  incidentId: "incident_xyz123",
  newStatus: "ESCALATED_TO_AUTHORITIES",
  moderatorNote: "Reported to NCMEC CyberTipline"
})
```

This triggers [`reportCsamToAuthorities()`](functions/src/csamShield.ts:379) which creates a `csamReports/{reportId}` record.

---

## User Safety Flags

Users under CSAM review have these flags set in their profile:

```typescript
user.safety {
  csamUnderReview: boolean;           // Account frozen flag
  safetyVisibilityBlocked: boolean;   // Hidden from discovery/feed
  contentCreationBlocked: boolean;    // Cannot create new content
  csamIncidentIds: string[];          // List of associated incidents
  lastCsamCheckAt: Timestamp;         // Last check timestamp
}
```

### Gating Points

All these features check `safety.csamUnderReview`:
- ❌ New chats/calls
- ❌ LIVE sessions
- ❌ Media uploads
- ❌ Question/answer creation
- ❌ Token withdrawals
- ❌ AI bot creation
- ❌ Discovery/feed visibility

---

## Firestore Collections

### `csamIncidents/{incidentId}`

```typescript
{
  incidentId: string;
  userId: string;                    // User who triggered detection
  suspectUserId?: string;            // Optional second party
  source: CsamRiskSource;            // "chat" | "ai_chat" | "questions" | etc.
  detectionChannel: CsamDetectionChannel;
  riskLevel: CsamRiskLevel;
  detectedAt: Timestamp;
  
  // Content references (NEVER raw CSAM)
  contentSnippet?: string;           // Max 200 chars, redacted
  messageIds?: string[];
  mediaIds?: string[];
  
  // Status
  status: CsamIncidentStatus;        // "OPEN_REVIEW" | "CONFIRMED_CSAM" | etc.
  moderatorUserId?: string;
  moderatorNote?: string;
  reportedToAuthoritiesAt?: Timestamp;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `csamReports/{reportId}`

```typescript
{
  reportId: string;
  incidentId: string;
  reportedAt: Timestamp;
  reportedBy: string;                // Moderator userId
  incidentSummary: string;
  userIds: string[];
  externalReferenceId?: string;      // NCMEC ID, etc.
  createdAt: Timestamp;
}
```

### `mediaReviewQueue/{reviewId}`

```typescript
{
  userId: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  reason: string;
  status: "pending_review" | "approved" | "rejected";
  createdAt: Timestamp;
}
```

---

## API Reference

### Moderator Functions

#### List Incidents
```typescript
// Cloud Function: csam_adminListIncidents
firebase.functions().httpsCallable('csam_adminListIncidents')({
  status?: "OPEN_REVIEW" | "CONFIRMED_CSAM" | "CLEARED_FALSE_POSITIVE" | "ESCALATED_TO_AUTHORITIES",
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  limit?: number,  // Default: 50
  offset?: number  // Default: 0
})

// Returns
{
  incidents: CsamIncident[];
  total: number;
  hasMore: boolean;
}
```

#### Get Incident Details
```typescript
// Cloud Function: csam_adminGetIncident
firebase.functions().httpsCallable('csam_adminGetIncident')({
  incidentId: string
})

// Returns
{
  incident: CsamIncident;
  userInfo: {
    userId: string;
    displayName: string;
    email: string;
    createdAt: Timestamp;
  };
}
```

#### Update Incident Status
```typescript
// Cloud Function: csam_adminUpdateIncidentStatus
firebase.functions().httpsCallable('csam_adminUpdateIncidentStatus')({
  incidentId: string;
  newStatus: CsamIncidentStatus;
  moderatorNote?: string;
})

// Returns
{
  success: boolean;
}
```

---

## Frontend Integration

### Mobile App ([`app-mobile/lib/csamCheck.ts`](app-mobile/lib/csamCheck.ts:1))

```typescript
import { checkCsamStatus, getCsamBlockingMessage } from '@/lib/csamCheck';

// Check user status
const status = await checkCsamStatus(userId);

if (status.isBlocked) {
  // Show blocking UI
  Alert.alert(
    'Konto zablokowane',
    status.message,
    [{ text: 'OK' }]
  );
  
  // Hide all action buttons
  // Disable chat, live, uploads
}
```

**Blocking Messages**:
- **PL**: "Twoje konto zostało tymczasowo zablokowane ze względów bezpieczeństwa. Sprawdzamy, czy nie naruszono zasad ochrony nieletnich."
- **EN**: "Your account has been temporarily suspended for safety review. We are checking for possible violations related to the protection of minors."

### Web App ([`web/lib/csamCheck.ts`](web/lib/csamCheck.ts:1))

```typescript
import { checkCsamStatus, getCsamBlockingMessage } from '@/lib/csamCheck';

// React hook (optional)
function ProfilePage() {
  const csamStatus = useCsamStatus(userId);
  
  if (csamStatus.isBlocked) {
    return <BlockedAccountBanner message={csamStatus.message} />;
  }
  
  // Normal UI
}

// Manual check
const canPost = await canPerformAction(userId);
if (!canPost) {
  // Show blocking message
}
```

---

## Legal & Compliance Notes

### IMPORTANT DISCLAIMERS

⚠️ **This is a technical implementation, not legal advice**

1. **No Legal Advice**: This documentation describes technical systems only
2. **Jurisdiction Specific**: CSAM reporting requirements vary by country
3. **Consult Legal Counsel**: Always consult qualified attorneys for compliance
4. **Regular Updates**: Laws change - review requirements regularly

### Regulatory Frameworks

#### United States
- **NCMEC CyberTipline**: Required reporting for US-based platforms
- **18 U.S.C. § 2258A**: Mandates CSAM reporting
- **Integration Point**: [`reportCsamToAuthorities()`](functions/src/csamShield.ts:379) should call NCMEC API

#### European Union
- **eIDAS Regulation**: Identity verification requirements
- **GDPR Compliance**: Data handling for minors
- **Integration**: National INHOPE hotlines

#### Poland (Specific)
- **Fundacja Dajemy Dzieciom Siłę**: Polish hotline
- **Reporting**: Should integrate with local authorities

### Best Practices

1. **Never Store CSAM**: Only references and redacted snippets
2. **Immediate Preservation**: Freeze evidence for law enforcement
3. **Chain of Custody**: Track all moderator actions
4. **Privacy Balance**: Protect victims while complying with law
5. **Regular Audits**: Review detection patterns and false positive rates

---

## Future Enhancements

### 1. Image CSAM Detection

**Priority**: HIGH  
**Effort**: Medium

**Implementation**:
- Integrate Microsoft PhotoDNA for image hashing
- Add perceptual hashing (pHash) for similarity detection
- Use Google Content Safety API as secondary validation

**Integration Point**: [`evaluateImageForCsamRisk()`](functions/src/csamShield.ts:421)

```typescript
export async function evaluateImageForCsamRisk(
  imageUrl: string
): Promise<CsamCheckResult> {
  // 1. Download image securely
  // 2. Compute PhotoDNA hash
  // 3. Compare against known CSAM hash database
  // 4. Return risk assessment
}
```

### 2. ML-Based Text Detection

**Priority**: MEDIUM  
**Effort**: High

**Implementation**:
- Train custom NLP model for grooming language detection
- Use contextual analysis (conversation history)
- Detect coded language and euphemisms

### 3. Automated External Reporting

**Priority**: HIGH (Legal Compliance)  
**Effort**: Medium

**Integrations Needed**:
```typescript
// NCMEC CyberTipline (US)
async function reportToNCMEC(incident: CsamIncident) {
  // SOAP/REST API integration
  // Requires NCMEC partnership
}

// INHOPE (EU)
async function reportToINHOPE(incident: CsamIncident) {
  // Integration with national hotlines
}

// National hotlines
const hotlines = {
  PL: 'Fundacja Dajemy Dzieciom Siłę',
  UK: 'Internet Watch Foundation',
  DE: 'eco - Beschwerdestelle',
  // etc.
};
```

### 4. Moderator Dashboard

**Priority**: HIGH  
**Effort**: Medium

**Features**:
- Real-time incident queue
- One-click status updates
- Evidence viewer (redacted)
- Bulk actions
- Analytics dashboard

**Tech Stack**: Next.js admin panel + Firebase Admin SDK

### 5. False Positive Reduction

**Priority**: MEDIUM  
**Effort**: Low

**Improvements**:
- Context-aware detection (thread history)
- User reputation scoring
- Language-specific tuning
- Industry-specific vocabulary (education, healthcare)

---

## Testing Guidelines

### ⚠️ CRITICAL SAFETY RULES

1. **NEVER use real CSAM for testing**
2. **NEVER create realistic test content that could be mistaken for CSAM**
3. **Only use obviously fake, non-sexual test strings**

### Safe Test Examples

#### Test Case 1: False Positive (Should NOT trigger)
```typescript
const text = "Looking for a babysitter for my 8 year old child";
const result = evaluateTextForCsamRisk(text, 'en');
// Expected: isFlagged = false, riskLevel = LOW
```

#### Test Case 2: Clear CSAM Risk (Should trigger HIGH)
```typescript
const text = "child adult content explicit minor sexual";
const result = evaluateTextForCsamRisk(text, 'en');
// Expected: isFlagged = true, riskLevel = HIGH or CRITICAL
```

#### Test Case 3: Age Pattern Detection
```typescript
const text = "14 year old explicit content";
const result = evaluateTextForCsamRisk(text, 'en');
// Expected: isFlagged = true, riskLevel = HIGH
```

#### Test Case 4: Polish Language
```typescript
const text = "nieletni dziecko seksualny treści";
const result = evaluateTextForCsamRisk(text, 'pl');
// Expected: isFlagged = true, riskLevel = HIGH
```

### Integration Testing

```bash
# 1. Test incident creation
# Use Firebase Console to verify csamIncidents collection

# 2. Test protective actions
# Verify user.safety flags are set correctly

# 3. Test moderator functions
# Use Firebase Functions shell:
firebase functions:shell
> csam_adminListIncidents({ status: "OPEN_REVIEW" })

# 4. Test account blocking
# Verify blocked users cannot:
# - Send messages
# - Upload media
# - Start LIVE sessions
# - Create questions/answers
```

---

## Monitoring & Alerting

### Key Metrics

1. **Incident Rate**: `csamIncidents` created per day
2. **False Positive Rate**: `CLEARED_FALSE_POSITIVE` / total incidents
3. **Response Time**: Time from detection to moderator review
4. **Escalation Rate**: `ESCALATED_TO_AUTHORITIES` / confirmed incidents

### Recommended Alerts

```yaml
# High-priority incidents (CRITICAL risk)
- alert: CriticalCsamIncident
  condition: New incident with riskLevel=CRITICAL
  notification: Immediate moderator alert
  SLA: 1 hour response time

# Pending review backlog
- alert: CsamReviewBacklog
  condition: >10 OPEN_REVIEW incidents > 24 hours old
  notification: Moderator team alert
  SLA: 4 hours

# False positive threshold
- alert: HighFalsePositiveRate
  condition: False positive rate > 30% over 7 days
  notification: Engineering team - tune detection patterns
```

---

## Security Considerations

### Access Control

**Moderator Privileges**:
```typescript
// Check in user document
user.roles.moderator === true
// OR custom claim
user.customClaims.isModerator === true
```

**Setting Moderator Role** (Firebase Console):
```javascript
admin.auth().setCustomUserClaims(uid, { 
  isModerator: true 
});
```

### Data Privacy

1. **Never Log Full Content**: Only redacted snippets (max 200 chars)
2. **Access Logs**: Track all moderator accesses to incidents
3. **Retention**: Keep incidents for legal minimum (consult counsel)
4. **Encryption**: All PII encrypted at rest

### Audit Trail

Every moderator action is logged:
```typescript
{
  moderatorUserId: string;
  action: "view" | "update_status" | "escalate";
  incidentId: string;
  timestamp: Timestamp;
  ipAddress?: string;
}
```

---

## Performance Considerations

### Text Evaluation

- **Latency**: < 10ms per check (pure JavaScript, no API calls)
- **Throughput**: Can handle 1000s of messages/second
- **No External Dependencies**: Works offline, no rate limits

### Scalability

Current implementation scales linearly with user base:
- Text checks: O(n) where n = message length
- No database reads during detection
- Incident creation: Single write per incident

### Optimization Opportunities

1. **Caching**: Cache user safety flags for 5 minutes
2. **Batch Processing**: Process multiple messages in parallel
3. **Pre-compilation**: Compile regex patterns at module load

---

## Migration & Rollout

### Phase 1: Backend Deployment (✅ Complete)

```bash
# Deploy Cloud Functions
cd functions
npm run build
firebase deploy --only functions
```

### Phase 2: Firestore Rule Updates

Add to `firestore.rules`:
```javascript
// CSAM incidents - moderators only
match /csamIncidents/{incidentId} {
  allow read, write: if request.auth != null && 
                       (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.moderator == true ||
                        request.auth.token.isModerator == true);
}

// User safety flags - readonly
match /users/{userId}/safety {
  allow read: if request.auth != null && request.auth.uid == userId;
  allow write: if false; // Server-side only
}
```

### Phase 3: Mobile App Updates

No immediate changes required. Mobile app will:
1. Check `user.safety.csamUnderReview` on app launch
2. Show blocking message if true
3. Disable action buttons

### Phase 4: Web App Updates

Similar to mobile:
1. Add `useCsamStatus()` hook to layouts
2. Show blocking banner if under review
3. Redirect blocked users from creator/wallet pages

### Phase 5: Moderator Training

1. Create moderator documentation
2. Train team on workflow
3. Establish SLAs (1 hour for CRITICAL, 24 hours for HIGH)
4. Set up on-call rotation

---

## Compliance Checklist

### Pre-Launch

- [ ] Legal review of detection patterns
- [ ] Privacy policy updated to mention CSAM detection
- [ ] Terms of service include CSAM prohibition
- [ ] Moderator team trained
- [ ] External reporting contacts established
- [ ] Incident response plan documented

### Post-Launch

- [ ] Monitor false positive rate weekly
- [ ] Review detection patterns monthly
- [ ] Audit moderator actions quarterly
- [ ] Update legal compliance annually
- [ ] Test escalation procedures semi-annually

---

## Error Handling

All CSAM checks use **graceful degradation**:

```typescript
try {
  const csamCheck = evaluateTextForCsamRisk(text);
  if (csamCheck.isFlagged && csamCheck.riskLevel === 'HIGH') {
    // Block content
  }
} catch (error) {
  // Non-blocking - if CSAM check fails, allow action
  // Log error for investigation
  // Alert engineering team if repeated failures
}
```

**Rationale**: Better to allow one message through than to block all messages if CSAM system fails.

---

## Incident Response Procedures

### For CRITICAL Incidents

1. **T+0 min**: System auto-freezes account
2. **T+15 min**: Moderator receives high-priority alert
3. **T+60 min**: Moderator reviews incident
4. **T+90 min**: If confirmed, escalate to authorities
5. **T+120 min**: Notify legal team

### For HIGH Incidents

1. **T+0 min**: System auto-freezes account
2. **T+4 hours**: Moderator reviews incident
3. **T+24 hours**: Decision made (confirm or clear)

### For MEDIUM Incidents

1. **T+0 min**: No auto-freeze
2. **T+48 hours**: Moderator reviews when capacity available
3. **Decision**: Escalate to HIGH if needed, or clear

---

## Configuration Tuning

### Adjusting Detection Sensitivity

Edit [`CSAM_CONFIG`](functions/src/csamShield.ts:42) in `csamShield.ts`:

```typescript
// More sensitive (more false positives)
if (childTermCount >= 1 && sexualTermCount >= 1) → HIGH

// Less sensitive (fewer false positives, more false negatives)
if (childTermCount >= 3 && sexualTermCount >= 3) → HIGH
```

### Adding Languages

```typescript
supportedLanguages: {
  de: {
    childTerms: ['kind', 'jugendlich', 'minderjährig', ...],
    sexualTerms: ['sex', 'sexuell', 'nackt', ...],
  },
  es: {
    childTerms: ['niño', 'menor', 'adolescente', ...],
    sexualTerms: ['sexual', 'desnudo', 'explícito', ...],
  },
}
```

---

## Reporting Statistics

### Recommended Dashboard Metrics

**Daily**:
- New incidents created (by risk level)
- Incidents reviewed (by status)
- Average review time
- False positive rate

**Weekly**:
- Total active incidents
- Moderator workload distribution
- Pattern effectiveness analysis
- User appeals (if implemented)

**Monthly**:
- Reports sent to authorities
- Detection pattern accuracy
- System performance metrics
- Compliance audit results

---

## Known Limitations

### Current Version (1.0)

1. **Text-Only Detection**: Image scanning is placeholder
2. **Rule-Based Only**: No ML/AI for pattern detection
3. **English + Polish**: Limited language support
4. **No Context Analysis**: Doesn't consider conversation history
5. **Manual Reporting**: No automated external API integration

### Planned Improvements (See Future Enhancements)

---

## Support & Escalation

### For Moderators

**Technical Issues**:
- Contact: Engineering team
- SLA: 2 hours for CRITICAL incidents

**Legal Questions**:
- Contact: Legal counsel
- SLA: 4 hours for urgent matters

### For Engineering

**False Positive Surge**:
1. Review recent pattern changes
2. Check detection logs
3. Temporarily increase threshold if needed
4. Document and tune patterns

**System Downtime**:
1. Check Cloud Functions logs
2. Verify Firestore access
3. Test moderator API calls
4. Roll back if needed

---

## Change Log

### Version 1.0 (2025-11-21)
- ✅ Initial CSAM Shield implementation
- ✅ Text-based detection (EN + PL)
- ✅ Human-in-the-loop moderation workflow
- ✅ Auto-freeze for HIGH/CRITICAL risks
- ✅ Moderator Cloud Functions
- ✅ Integration points in chat/AI/questions/live
- ✅ Mobile and web blocking utilities
- ✅ Placeholder for image detection
- ✅ Placeholder for external reporting

---

## Quick Reference

### Files Created

**Backend**:
- [`functions/src/types/csam.ts`](functions/src/types/csam.ts:1) - Type definitions
- [`functions/src/csamShield.ts`](functions/src/csamShield.ts:1) - Core engine
- [`functions/src/mediaUpload.ts`](functions/src/mediaUpload.ts:1) - Media validation

**Frontend**:
- [`app-mobile/lib/csamCheck.ts`](app-mobile/lib/csamCheck.ts:1) - Mobile utility
- [`web/lib/csamCheck.ts`](web/lib/csamCheck.ts:1) - Web utility

**Documentation**:
- [`PHASE_22_CSAM_SHIELD_IMPLEMENTATION.md`](PHASE_22_CSAM_SHIELD_IMPLEMENTATION.md:1) - This file

### Files Modified

**Backend Integrations**:
- [`functions/src/chatMonetization.ts`](functions/src/chatMonetization.ts:463) - Chat message checks
- [`functions/src/aiChatEngine.ts`](functions/src/aiChatEngine.ts:165) - AI chat checks
- [`functions/src/questionsEngine.ts`](functions/src/questionsEngine.ts:96) - Question/answer checks
- [`functions/src/aiBotEngine.ts`](functions/src/aiBotEngine.ts:346) - AI prompt checks
- [`functions/src/index.ts`](functions/src/index.ts:1197) - Cloud Functions exports

### Key Functions

**Detection**:
- [`evaluateTextForCsamRisk(text, locale)`](functions/src/csamShield.ts:87)

**Incident Management**:
- [`createCsamIncident(params)`](functions/src/csamShield.ts:222)
- [`updateCsamIncidentStatus(id, status, moderator, note)`](functions/src/csamShield.ts:318)

**Protective Actions**:
- [`applyImmediateProtectiveActions(userId, level, incidentId)`](functions/src/csamShield.ts:256)
- [`hidePublicContentForUser(userId)`](functions/src/csamShield.ts:303)

**Reporting**:
- [`reportCsamToAuthorities(incident)`](functions/src/csamShield.ts:379)

---

## Contact & Resources

### External Resources

- **NCMEC CyberTipline**: https://www.missingkids.org/gethelpnow/cybertipline
- **INHOPE Network**: https://www.inhope.org/
- **IWF (UK)**: https://www.iwf.org.uk/
- **Polish Hotline**: https://fdds.pl/

### Internal Documentation

- Trust Engine: [`docs/TRUST_ENGINE.md`](docs/TRUST_ENGINE.md:1)
- Security Model: [`docs/AVALO_SECURITY_MODEL_V2.md`](docs/AVALO_SECURITY_MODEL_V2.md:1)
- Chat Monetization: [`CHAT_MONETIZATION_IMPLEMENTATION.md`](CHAT_MONETIZATION_IMPLEMENTATION.md:1)

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-21  
**Next Review**: 2025-12-21  
**Owner**: Security & Trust Team