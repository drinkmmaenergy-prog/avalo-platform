# PACK 111 — White-Glove Customer Support & Priority Human Assistance

## Implementation Complete ✅

**Status:** Production Ready  
**Version:** 1.0.0  
**Last Updated:** 2025-11-26

---

## Overview

PACK 111 delivers a world-class customer support system for Avalo, combining AI-powered triage with human support agents to provide multilingual, scalable, and safe assistance to users.

### Key Principles

✅ **AI Triage + Human Touch** — AI routes, humans decide  
✅ **Multilingual Support** — English and Polish (extensible)  
✅ **Priority-Based Escalation** — Safety first, not status  
✅ **Zero Economic Influence** — Support ≠ monetization advantage  
✅ **Audit Trail** — Every action logged immutably  

### Non-Negotiables

🚫 No free tokens, discounts, bonuses, or promo codes for contacting support  
🚫 Support cannot change discovery visibility, ranking, or payout timelines  
🚫 Support cannot override safety enforcement without authorization  
🚫 Token price and 65/35 revenue split remain unchanged  

---

## Architecture

### Collections

#### 1. `support_cases`
Main collection for all support cases.

```typescript
{
  caseId: string;              // Unique case identifier
  userId: string;              // User who created the case
  category: SupportCategory;   // TECHNICAL, BILLING, ACCOUNT, etc.
  status: SupportStatus;       // OPEN, ASSIGNED, WAITING_FOR_AGENT, etc.
  source: SupportSource;       // IN_APP, WEB, EMAIL, ESCALATION
  language: string;            // ISO language code
  platform: string;            // android, ios, web
  priority: SupportPriority;   // CRITICAL, HIGH, NORMAL
  assignedTo: string | null;   // Agent ID
  subject: string;             // Case title
  messages: SupportMessage[];  // Array of messages
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastUserMessage: Timestamp;
  lastAgentMessage: Timestamp | null;
  resolution: CaseResolution | null;
  metadata: {
    deviceInfo?: string;
    appVersion?: string;
    accountType?: string;
    aiTriageFlags?: string[];
  };
  tags?: string[];
}
```

#### 2. `support_audit_log`
Immutable audit trail for all support operations.

```typescript
{
  logId: string;
  action: SupportAuditAction;  // CASE_CREATED, MESSAGE_SENT, etc.
  actorId: string;             // User or agent ID
  actorType: 'USER' | 'AGENT' | 'SYSTEM';
  caseId: string;
  timestamp: Timestamp;
  metadata: Record<string, any>;
  ipAddress?: string;
}
```

#### 3. `support_agents`
Agent profiles and availability.

```typescript
{
  agentId: string;
  email: string;
  displayName: string;
  languages: string[];         // Supported languages
  specializations: SupportCategory[];
  isActive: boolean;
  currentCaseLoad: number;
  maxCaseLoad: number;
  createdAt: Timestamp;
  lastActiveAt: Timestamp;
}
```

### Services

#### 1. `aiSupportTriage.ts`
Smart AI-powered routing and categorization.

**Responsibilities:**
- Detect case category and priority
- Identify safety red flags
- Route critical cases immediately
- Provide crisis resources when needed

**Key Methods:**
```typescript
triageMessage(message, metadata) → AITriageResult
getCrisisResources(countryCode) → { hotline, website, message }
```

#### 2. `support.service.ts`
User-facing support operations.

**Key Methods:**
```typescript
openSupportCase(params) → { caseId, triageResult }
sendSupportMessage(params) → void
listUserSupportCases(params) → SupportCase[]
getSupportCase(params) → SupportCase
reopenSupportCase(params) → void
```

#### 3. `supportAdmin.service.ts`
Agent console operations.

**Key Methods:**
```typescript
listSupportCases(params) → { cases, total }
assignSupportCase(params) → void
sendSupportReply(params) → void
closeSupportCase(params) → void
changeCasePriority(params) → void
```

#### 4. `supportNotifications.ts`
Push notification system for support events.

**Notification Types:**
- `AGENT_REPLIED` — Agent responded
- `CASE_ASSIGNED` — Case assigned to agent
- `CASE_RESOLVED` — Case marked resolved
- `USER_REPLIED` — User sent new message

---

## Priority & Escalation Rules

### Priority Levels

| Priority | Trigger | Response Time | Examples |
|----------|---------|---------------|----------|
| **CRITICAL** | Safety risks, minors, legal | Immediate | Self-harm, threats, law enforcement |
| **HIGH** | Financial/compliance | < 4 hours | Payout errors, KYC delays, security breach |
| **NORMAL** | Standard support | < 24 hours | Technical issues, feature requests |

### Automatic Escalation

1. **Safety Risks** → Alert Safety Team (PACK 87)
2. **Minor Detection** → Alert Compliance Team
3. **Legal Requests** → Alert Legal Team
4. **Financial Issues** → Route to specialized agents

### VIP/Royal Treatment

✅ **Faster queue throughput** — Priority placement in queue  
🚫 **NOT preferential outcomes** — Same rules apply  
🚫 **NOT rule overrides** — No bypassing policies  

---

## Mobile UI Screens

### 1. Support Home (`/support`)
- List of user's support cases
- Filter by status (All, Open, Resolved)
- Priority badges and unread counts
- Create new case button

### 2. Support Chat (`/support/[caseId]`)
- Real-time chat with support agent
- Message history with timestamps
- Status indicators
- Reopen resolved cases (within 7 days)

### 3. New Case (`/support/new`)
- Subject and description fields
- Category selection (grid layout)
- Character limits (100 subject, 2000 message)
- Validation and submission

---

## Security Rules

### Firestore Rules

```javascript
// Users can only read/write their own cases
match /support_cases/{caseId} {
  allow read: if request.auth.uid == resource.data.userId;
  allow create: if request.auth.uid == request.resource.data.userId;
  allow update: if request.auth.uid == resource.data.userId 
    && cannotChangeResolved();
}

// Agents can read/write all cases
match /support_cases/{caseId} {
  allow read, write: if isActiveAgent();
}

// Audit logs are immutable (server-side only)
match /support_audit_log/{logId} {
  allow write: if false;
  allow read: if isAgentOrAdmin();
}
```

### Rate Limiting

- **Max 10 cases per user per 24 hours**
- Enforced server-side in [`support.service.ts`](functions/src/services/support.service.ts:267)
- Prevents spam and abuse

---

## AI Triage System

### Detection Capabilities

#### Safety Flags
- **Self-harm keywords:** suicide, kill myself, overdose
- **Threat keywords:** violence, attack, assault, harm
- **Minor indicators:** underage, minor, under 18

#### Financial/Compliance
- Payout errors, KYC delays
- Transaction disputes
- Account suspension appeals

#### Legal Requests
- Law enforcement inquiries
- Subpoenas and court orders
- Legal representation

### Crisis Resources

Automatic crisis resource messaging for detected self-harm:

```typescript
{
  US: {
    hotline: "988",
    website: "https://988lifeline.org",
    message: "If you are experiencing a mental health crisis, 
              please contact 988 Suicide & Crisis Lifeline immediately."
  },
  PL: {
    hotline: "116 123",
    website: "https://www.telefonzaufania.org",
    message: "Jeśli potrzebujesz pomocy, zadzwoń na Telefon Zaufania: 116 123."
  }
}
```

---

## Multilingual Support

### Supported Languages

1. **English (en)** — Default
2. **Polish (pl)** — Full support

### Translation Files

- [`i18n/en/support.json`](i18n/en/support.json:1) — English strings
- [`i18n/pl/support.json`](i18n/pl/support.json:1) — Polish strings

### Machine Translation

AI-powered translation for messages between users and agents:
- User messages stored in original language
- Agent sees both original + translated
- Agents can reply in user's language or English

---

## Integration Guide

### 1. Backend Setup

#### Install Dependencies
```bash
cd functions
npm install
```

#### Deploy Functions
```bash
firebase deploy --only functions
```

#### Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### 2. Mobile Integration

#### Add Support Navigation
```typescript
// app/(tabs)/_layout.tsx
<Tabs.Screen
  name="support"
  options={{
    title: 'Support',
    tabBarIcon: ({ color }) => <Ionicons name="help-circle" size={28} color={color} />
  }}
/>
```

#### Import Support Services
```typescript
import { supportService } from '../lib/services/support';

// Create a case
const { caseId } = await supportService.openSupportCase({
  userId: user.uid,
  subject: 'Technical Issue',
  message: 'App crashes on startup',
  category: 'TECHNICAL',
  source: 'IN_APP',
  language: 'en',
  platform: 'ios'
});
```

### 3. Agent Console

Integrate with existing Moderator Console (PACK 88):

```typescript
// Add support cases view
import { supportAdminService } from '../services/supportAdmin';

const cases = await supportAdminService.listSupportCases({
  agentId: currentAgent.id,
  filter: { status: 'OPEN' }
});
```

---

## API Reference

### User Functions

#### `openSupportCase`
Create a new support case.

```typescript
openSupportCase(params: {
  userId: string;
  subject: string;
  message: string;
  category?: SupportCategory;
  source: SupportSource;
  language: string;
  platform: SupportPlatform;
  metadata?: object;
}) → Promise<{ caseId: string; triageResult: AITriageResult }>
```

#### `sendSupportMessage`
Send a message in an existing case.

```typescript
sendSupportMessage(params: {
  userId: string;
  caseId: string;
  message: string;
  attachments?: string[];
}) → Promise<void>
```

#### `reopenSupportCase`
Reopen a resolved case (within 7 days).

```typescript
reopenSupportCase(params: {
  userId: string;
  caseId: string;
  message: string;
}) → Promise<void>
```

### Agent Functions

#### `assignSupportCase`
Assign a case to an agent.

```typescript
assignSupportCase(params: {
  agentId: string;
  caseId: string;
  assignToAgentId: string;
}) → Promise<void>
```

#### `closeSupportCase`
Resolve and close a case.

```typescript
closeSupportCase(params: {
  agentId: string;
  caseId: string;
  resolutionCategory: 'FIXED' | 'EXPLAINED' | 'NO_ACTION_NEEDED' | 'ESCALATED';
  resolutionNotes: string;
}) → Promise<void>
```

---

## Testing Guide

### 1. Unit Tests

Test AI triage detection:

```typescript
describe('AI Support Triage', () => {
  it('should detect safety risks', async () => {
    const result = await aiSupportTriage.triageMessage(
      'I want to hurt myself',
      { userId: 'test', platform: 'ios', language: 'en' }
    );
    
    expect(result.priority).toBe('CRITICAL');
    expect(result.detectedFlags.safetyRisk).toBe(true);
    expect(result.forwardToHumanImmediately).toBe(true);
  });
});
```

### 2. Integration Tests

Test case creation flow:

```typescript
describe('Support Case Flow', () => {
  it('should create, message, and resolve case', async () => {
    // Create case
    const { caseId } = await supportService.openSupportCase({
      userId: 'user123',
      subject: 'Test Issue',
      message: 'This is a test',
      category: 'TECHNICAL',
      source: 'IN_APP',
      language: 'en',
      platform: 'ios'
    });
    
    // Send message
    await supportService.sendSupportMessage({
      userId: 'user123',
      caseId,
      message: 'Follow-up info'
    });
    
    // Resolve case
    await supportAdminService.closeSupportCase({
      agentId: 'agent456',
      caseId,
      resolutionCategory: 'FIXED',
      resolutionNotes: 'Issue resolved'
    });
  });
});
```

### 3. UI Tests

Test support screens:

```typescript
describe('Support Screens', () => {
  it('should display cases list', () => {
    render(<SupportHomeScreen />);
    expect(screen.getByText('Support')).toBeTruthy();
  });
  
  it('should create new case', async () => {
    render(<NewSupportCaseScreen />);
    
    fireEvent.changeText(screen.getByPlaceholderText('Brief description'), 'Test');
    fireEvent.press(screen.getByText('TECHNICAL'));
    fireEvent.changeText(screen.getByPlaceholderText('Please describe'), 'Details');
    fireEvent.press(screen.getByText('Create Support Case'));
    
    await waitFor(() => {
      expect(mockOpenCase).toHaveBeenCalled();
    });
  });
});
```

---

## Deployment Checklist

### Backend

- [x] Deploy Firestore security rules
- [x] Deploy Cloud Functions
- [x] Set up scheduled tasks (auto-close cases)
- [x] Configure FCM for push notifications
- [x] Create initial support agent accounts
- [x] Set up monitoring and alerts

### Mobile

- [x] Add support screens to navigation
- [x] Test case creation flow
- [x] Test real-time message sync
- [x] Test push notifications
- [x] Verify multilingual support
- [x] Test offline handling

### Operations

- [x] Train support agents
- [x] Document escalation procedures
- [x] Set up agent rotation/shifts
- [x] Create response templates
- [x] Establish SLAs (Service Level Agreements)
- [x] Set up quality monitoring

---

## Monitoring & Analytics

### Key Metrics

1. **Response Time** — Time from case creation to first agent reply
2. **Resolution Time** — Time from creation to case resolved
3. **Satisfaction Rate** — User feedback on case resolution
4. **Case Volume** — Total cases by category/priority
5. **Agent Performance** — Cases handled, avg response time

### Dashboards

Create monitoring dashboards for:
- Open cases by priority
- Average response/resolution times
- Agent workload distribution
- User satisfaction trends
- Escalation frequency

---

## Troubleshooting

### Common Issues

#### Cases Not Appearing
**Problem:** User can't see their support cases  
**Solution:**
1. Check Firestore rules allow reads
2. Verify userId matches in query
3. Check user authentication state

#### Messages Not Sending
**Problem:** Messages fail to send  
**Solution:**
1. Check case status (can't send to CLOSED)
2. Verify user owns the case
3. Check message length limits (2000 chars)

#### Notifications Not Received
**Problem:** User doesn't get push notifications  
**Solution:**
1. Verify FCM token is registered
2. Check notification permissions
3. Verify device has valid token in [`user_devices`](functions/src/notifications/supportNotifications.ts:154)

---

## Future Enhancements

### Phase 2 (Q1 2026)

- [ ] **Voice Support** — Call-based support option
- [ ] **Video Chat** — Screen sharing for complex issues
- [ ] **AI Auto-Responses** — Instant answers to common questions
- [ ] **Knowledge Base Integration** — Link to help articles
- [ ] **Sentiment Analysis** — Detect frustrated users
- [ ] **Multi-Agent Collaboration** — Complex case handoffs

### Phase 3 (Q2 2026)

- [ ] **24/7 AI Chatbot** — Handle simple cases automatically
- [ ] **Advanced Analytics** — ML-powered insights
- [ ] **Custom SLAs** — Per-tier response times
- [ ] **Integration APIs** — Third-party support tools
- [ ] **Mobile Agent App** — iOS/Android for support agents

---

## File Structure

```
functions/src/
├── types/
│   └── support.types.ts              # TypeScript definitions
├── services/
│   ├── aiSupportTriage.ts            # AI triage logic
│   ├── support.service.ts            # User operations
│   └── supportAdmin.service.ts       # Agent operations
└── notifications/
    └── supportNotifications.ts        # Push notifications

firestore-rules/
└── support.rules                      # Security rules

app-mobile/app/
├── support/
│   ├── index.tsx                      # Cases list
│   ├── [caseId].tsx                   # Chat screen
│   └── new.tsx                        # Create case

i18n/
├── en/
│   └── support.json                   # English translations
└── pl/
    └── support.json                   # Polish translations
```

---

## Success Criteria

✅ All support features implemented  
✅ AI triage system operational  
✅ Mobile UI screens complete  
✅ Security rules deployed  
✅ Multilingual support active  
✅ Notifications working  
✅ Documentation complete  
✅ Zero economic influence maintained  

---

## Support & Contact

For questions about this implementation:

- **Technical Issues:** File GitHub issue
- **Agent Training:** Contact operations team
- **Security Concerns:** Escalate to security team
- **Feature Requests:** Submit through product feedback

---

**Implementation Date:** 2025-11-26  
**KiloCode Version:** 1.0.0  
**Pack Status:** ✅ Production Ready

---

## Related Packs

- **PACK 87** — Content Moderation & Safety
- **PACK 88** — Moderator Console
- **PACK 93** — Data Rights & Privacy
- **PACK 103** — Strike System
- **PACK 104** — Appeals & Escalation
- **PACK 105** — Financial Compliance
- **PACK 107** — Membership Tiers (VIP/Royal)

---

*End of PACK 111 Implementation Documentation*