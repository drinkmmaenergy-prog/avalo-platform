# PACK 300 — Help Center, Support Tickets & In-App Education

**Status:** ✅ IN PROGRESS  
**Target:** Mobile + Web · Support backbone · No tokenomics changes  
**Dependencies:** PACK 267-268, 281, 293, 296

## Overview

This pack implements Avalo's comprehensive support and education layer:

- **In-app Help Center**: FAQ, guides, safety information
- **Support Ticket System**: Bidirectional user ↔ support communication
- **Admin Console**: Moderation tools for resolving tickets
- **Education Cards**: Contextual help explaining key features
- **Multi-language Support**: PL and EN (minimum), extensible to other locales

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    HELP & SUPPORT LAYER                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Help Center  │  │   Tickets    │  │  Education   │      │
│  │   Articles   │  │   System     │  │    Cards     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│                    ┌───────▼────────┐                        │
│                    │   Firestore    │                        │
│                    │  Collections   │                        │
│                    └───────┬────────┘                        │
│                            │                                 │
│         ┌──────────────────┼──────────────────┐             │
│         │                  │                  │             │
│    ┌────▼─────┐    ┌──────▼──────┐    ┌─────▼─────┐       │
│    │ Mobile   │    │     Web     │    │   Admin   │       │
│    │    UI    │    │     UI      │    │  Console  │       │
│    └──────────┘    └─────────────┘    └───────────┘       │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 1. Data Models

### 1.1 Help Articles

**Collection:** `helpArticles/{articleId}`

```typescript
interface HelpArticle {
  articleId: string;
  category: ArticleCategory;
  slug: string;                    // URL-friendly identifier
  locale: string;                  // "pl-PL" | "en-US" | etc.
  title: string;
  shortSummary: string;
  bodyMarkdown: string;            // Full content in markdown
  isFeatured: boolean;
  isSearchable: boolean;
  tags: string[];
  createdAt: string;               // ISO datetime
  updatedAt: string;               // ISO datetime
}

type ArticleCategory = 
  | "GETTING_STARTED"
  | "PROFILE"
  | "DISCOVERY_AND_SWIPE"
  | "PAID_CHAT"
  | "CALLS"
  | "CALENDAR_AND_MEETINGS"
  | "EVENTS"
  | "TOKENS_AND_WALLET"
  | "PAYOUTS"
  | "SAFETY_AND_REPORTING"
  | "ACCOUNT_AND_PRIVACY"
  | "TECHNICAL_ISSUES";
```

**Multi-language Strategy:**
- Each locale version is a separate document with same `articleId` but different `locale`
- Critical topics MUST exist in both PL and EN:
  - Paid chat mechanics and refunds
  - Calendar booking and refund logic
  - Events system and QR verification
  - Safety features and panic button
  - Token system and payouts

### 1.2 Support Tickets

**Collection:** `supportTickets/{ticketId}`

```typescript
interface SupportTicket {
  ticketId: string;                // UUID
  userId: string;                  // UID of ticket creator
  
  status: TicketStatus;
  priority: TicketPriority;
  type: TicketType;
  
  subject: string;
  description: string;
  
  related: {
    chatId?: string;
    bookingId?: string;
    eventId?: string;
    transactionId?: string;
    reportedUserId?: string;
  };
  
  userLocale: string;              // "pl-PL" | "en-US" | etc.
  userCountry: string;             // "PL" | "US" | etc.
  
  createdAt: string;               // ISO datetime
  updatedAt: string;               // ISO datetime
  resolvedAt?: string;             // ISO datetime (when resolved)
  lastMessageAt: string;           // ISO datetime
  
  adminAssignedId?: string;        // Admin user ID
  adminNotes?: string;             // Internal notes (not visible to user)
}

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

type TicketType =
  | "GENERAL_QUESTION"
  | "TECHNICAL_ISSUE"
  | "PAYMENT_ISSUE"
  | "PAYOUT_ISSUE"
  | "ACCOUNT_ACCESS"
  | "SAFETY_REPORT_FOLLOWUP"
  | "CONTENT_TAKEDOWN"
  | "CALENDAR_BOOKING_ISSUE"
  | "EVENT_ISSUE"
  | "OTHER";
```

**Collection:** `supportTicketMessages/{messageId}`

```typescript
interface SupportTicketMessage {
  messageId: string;               // UUID
  ticketId: string;                // Reference to parent ticket
  
  authorType: "USER" | "SUPPORT";
  authorId: string;                // UID or admin ID
  
  body: string;                    // Message content
  createdAt: string;               // ISO datetime
  
  internal: boolean;               // If true, only visible to admins
}
```

### 1.3 Education Cards

**Collection:** `educationCards/{cardId}`

```typescript
interface EducationCard {
  cardId: string;
  
  context: EducationContext;
  locale: string;                  // "pl-PL" | "en-US" | etc.
  
  title: string;
  body: string;
  ctaLabel?: string;               // Call-to-action button text
  ctaType: CTAType;
  ctaPayload: {
    articleSlug?: string;
    settingsSection?: string;
  };
  
  enabled: boolean;
  order: number;                   // Display order in context
}

type EducationContext =
  | "PAID_CHAT"
  | "CALLS"
  | "CALENDAR"
  | "EVENTS"
  | "TOKENS"
  | "PAYOUTS"
  | "SAFETY"
  | "PANIC_BUTTON";

type CTAType = "OPEN_HELP_ARTICLE" | "OPEN_SETTINGS" | "NONE";
```

## 2. Help Center UI

### 2.1 Mobile Entry Points

**Primary Access:**
- Profile → Settings → "Help & Support"

**Contextual Access:**
- Chat paywall info: "How paid chat works?"
- Calendar booking: "How refunds work?"
- Safety center: "How to stay safe?"

### 2.2 Help Center Screens

#### Home Screen
```
┌─────────────────────────────┐
│  🔍 Search help articles... │
├─────────────────────────────┤
│                             │
│  📚 Getting Started         │
│  💬 Paid Chat & Tokens      │
│  🛡️  Safety & Reporting      │
│  📅 Meetings & Events       │
│                             │
│  Top Articles:              │
│  • How paid chat works      │
│  • Understanding refunds    │
│  • Booking calendar dates   │
│  • Using panic button       │
│                             │
└─────────────────────────────┘
```

**Features:**
- Search bar with live results (searches title, summary, body, tags)
- Featured categories with icons
- Top/recent articles per locale
- Quick access to "Contact Support"

#### Article View
```
┌─────────────────────────────┐
│  ← How Paid Chat Works      │
├─────────────────────────────┤
│                             │
│  [Markdown content]         │
│                             │
│  • What is paid chat?       │
│  • How pricing works        │
│  • Refund policy            │
│  • Payment methods          │
│                             │
│  Last updated: Dec 9, 2025  │
│                             │
├─────────────────────────────┤
│  Was this helpful?          │
│  [👍 Yes]  [👎 No]         │
│                             │
│  Need more help?            │
│  [📧 Contact Support]       │
└─────────────────────────────┘
```

**Features:**
- Markdown rendering with proper styling
- Last updated timestamp
- Simple feedback mechanism (yes/no)
- Direct link to create support ticket

### 2.3 Web Help Center

Located at `/help` or accessible from top navigation and footer.

**Similar structure to mobile:**
- Responsive design
- Search functionality
- Category browsing
- Article reading with TOC for long articles
- Breadcrumb navigation

## 3. Support Ticket System

### 3.1 User Flow (Creating Ticket)

```
Help Center → "Need More Help?" → Create Ticket

┌─────────────────────────────┐
│  Create Support Ticket      │
├─────────────────────────────┤
│  Category:                  │
│  [▼ Payment Issue      ]    │
│                             │
│  Subject:                   │
│  [___________________]      │
│                             │
│  Description:               │
│  [                     ]    │
│  [                     ]    │
│  [                     ]    │
│                             │
│  Related to:                │
│  [ ] Chat                   │
│  [ ] Calendar booking       │
│  [ ] Event                  │
│  [ ] Transaction            │
│                             │
│  [Submit Ticket]            │
└─────────────────────────────┘
```

**Auto-priority Rules:**
- PAYMENT_ISSUE, PAYOUT_ISSUE: HIGH
- SAFETY_REPORT_FOLLOWUP: CRITICAL
- CONTENT_TAKEDOWN: HIGH
- ACCOUNT_ACCESS: HIGH
- Others: NORMAL

### 3.2 My Tickets List

```
┌─────────────────────────────┐
│  My Support Tickets         │
├─────────────────────────────┤
│                             │
│  🟢 OPEN                    │
│  Payment not received       │
│  Last updated: 2h ago       │
│  ─────────────────────      │
│                             │
│  🟡 IN_PROGRESS             │
│  Calendar booking issue     │
│  Last updated: 1 day ago    │
│  ─────────────────────      │
│                             │
│  ✅ RESOLVED                │
│  How to verify profile?     │
│  Resolved: 3 days ago       │
│                             │
└─────────────────────────────┘
```

### 3.3 Ticket Detail & Conversation

```
┌─────────────────────────────┐
│  ← Payment not received     │
│  🟢 OPEN • HIGH PRIORITY    │
├─────────────────────────────┤
│                             │
│  You • Dec 9, 10:30         │
│  I sent payment but tokens  │
│  didn't arrive...           │
│                             │
│  ─────────────────────      │
│                             │
│  Support • Dec 9, 11:15     │
│  Hi! I see your transaction.│
│  Tokens were delivered at   │
│  10:32. Please check your   │
│  wallet again.              │
│                             │
│  ─────────────────────      │
│                             │
│  [Type your message...]     │
│  [Send]                     │
│                             │
└─────────────────────────────┘
```

**Features:**
- Chronological message thread
- User can reply anytime
- Push notifications for support replies
- User can close ticket when satisfied

## 4. Admin Console (Web Only)

### 4.1 Ticket Dashboard

**URL:** `/admin/support/tickets`

**Filters:**
- Status (Open, In Progress, Resolved, Closed)
- Type (General, Technical, Payment, etc.)
- Priority (Low, Normal, High, Critical)
- Date range
- Assigned to me / Unassigned / All

**Table View:**
```
| ID | User | Type | Subject | Priority | Status | Last Updated | Assigned To |
|----|------|------|---------|----------|--------|--------------|-------------|
| #1234 | user@ex.com | Payment | Tokens missing | HIGH | OPEN | 2h ago | - |
| #1235 | user2@ex.com | Safety | Report abuse | CRITICAL | IN_PROGRESS | 1d ago | Admin1 |
```

### 4.2 Ticket Detail (Admin View)

```
┌─────────────────────────────────────────────────────────┐
│  Ticket #1234 • Payment Issue                           │
│  Created: Dec 9, 10:30 • User: user@example.com        │
├─────────────────────────────────────────────────────────┤
│  Status: [▼ OPEN        ]  Priority: [▼ HIGH      ]    │
│  Assign to: [▼ Select Admin...]                        │
│                                                         │
│  Related Resources:                                     │
│  • Transaction ID: tx_abc123                           │
│  • User Country: PL                                    │
│  • User Locale: pl-PL                                  │
│                                                         │
│  ─────────────────────────────────────────────────     │
│                                                         │
│  Conversation:                                          │
│  [USER] I sent payment but tokens didn't arrive...     │
│                                                         │
│  [SUPPORT - Admin1] Hi! I see your transaction...      │
│                                                         │
│  ─────────────────────────────────────────────────     │
│                                                         │
│  Reply as Support:                                      │
│  [________________________________]                     │
│  [ ] Mark as internal note                             │
│  [Send Reply]                                          │
│                                                         │
│  Admin Notes (Internal Only):                          │
│  [________________________________]                     │
│  [Save Notes]                                          │
│                                                         │
│  Actions:                                              │
│  [Mark as Resolved]  [Close Ticket]  [Escalate]       │
└─────────────────────────────────────────────────────────┘
```

**Admin Actions:**
1. **Reply to user** - Creates message with authorType: "SUPPORT"
2. **Add internal note** - Creates message with internal: true
3. **Change status/priority** - Updates ticket fields
4. **Assign ticket** - Sets adminAssignedId
5. **Resolve ticket** - Sets status to RESOLVED, sets resolvedAt
6. **Close ticket** - Sets status to CLOSED

**All actions logged via PACK 296 audit system:**
- `SUPPORT_TICKET_CREATED`
- `SUPPORT_TICKET_UPDATED`
- `SUPPORT_TICKET_MESSAGE_ADDED`
- `SUPPORT_TICKET_ASSIGNED`
- `SUPPORT_TICKET_RESOLVED`

## 5. Notification Integration

Uses PACK 293 notification system.

### 5.1 User Notifications

**On ticket created:**
- Confirmation notification sent to user
- Type: `SYSTEM_ALERT`
- Message: "Your support ticket #{id} has been created"

**On support reply:**
- User receives notification
- Type: `SUPPORT_REPLY`
- Message: "Support replied to your ticket #{id}"
- Priority: NORMAL (unless ticket is CRITICAL)
- Respects user quiet hours (but can override for CRITICAL)

**On ticket resolved:**
- User receives notification
- Type: `SYSTEM_ALERT`
- Message: "Your ticket #{id} has been resolved"

### 5.2 Admin Notifications (Optional)

**On new ticket created:**
- Notify available support admins
- Type: Internal channel (Slack, email, etc.)
- Include priority and type for routing

**On ticket escalated:**
- Notify senior admins
- Include ticket details and escalation reason

## 6. Education Cards

### 6.1 Contextual Placement

Education cards appear inline in critical flows to educate users before actions:

**Paid Chat Screen:**
```
┌─────────────────────────────┐
│  💬 Start Paid Chat         │
├─────────────────────────────┤
│                             │
│  ℹ️  How Paid Chat Works    │
│  ─────────────────────      │
│  Messages cost tokens. You  │
│  can get refunds within 24h │
│  if no reply. Learn more.   │
│  [Learn More] [Dismiss]     │
│                             │
│  ─────────────────────      │
│  [Confirm & Start Chat]     │
└─────────────────────────────┘
```

**Calendar Booking:**
```
┌─────────────────────────────┐
│  📅 Book Meeting            │
├─────────────────────────────┤
│                             │
│  ℹ️  Meeting Rules & Refunds │
│  ─────────────────────      │
│  Meetings require advance   │
│  payment. Refunds available │
│  if cancelled 24h+ before.  │
│  [View Policy] [Dismiss]    │
│                             │
│  ─────────────────────      │
│  [Proceed to Payment]       │
└─────────────────────────────┘
```

**Events Screen:**
```
┌─────────────────────────────┐
│  🎉 Event Ticket            │
├─────────────────────────────┤
│                             │
│  ℹ️  Event Safety & QR Code  │
│  ─────────────────────      │
│  Show QR at entrance. Keep  │
│  safe. Report issues via    │
│  panic button if needed.    │
│  [Safety Guide] [Dismiss]   │
│                             │
│  ─────────────────────      │
│  [Purchase Ticket]          │
└─────────────────────────────┘
```

**Panic Button:**
```
┌─────────────────────────────┐
│  🚨 Safety Center           │
├─────────────────────────────┤
│                             │
│  ℹ️  How Panic Button Works  │
│  ─────────────────────      │
│  Emergency feature shares   │
│  your location with trusted │
│  contacts. Use responsibly. │
│  [Learn More] [Dismiss]     │
│                             │
└─────────────────────────────┘
```

### 6.2 Dismissal Strategy

**User dismissal:**
- Stored locally in AsyncStorage (mobile) or localStorage (web)
- Key: `dismissedCards_{cardId}_{userId}`
- Cards can reappear after 30 days or if context changes

**Reset triggers:**
- Major policy changes
- Safety updates
- User explicitly requests to see all tips again (in settings)

## 7. Security & Privacy

### 7.1 Data Protection

**Ticket content:**
- Do NOT store full card numbers, passwords, or secrets
- If user accidentally includes sensitive data:
  - Admin can mark message as "redacted"
  - Display [REDACTED] instead of content
  - Original stored in secure audit log only

**Safety-related tickets:**
- Priority automatically set to CRITICAL
- Auto-link to Risk Engine user entry (PACK 267-268)
- Only visible to safety admins (role-based access)
- Extra audit logging for compliance

### 7.2 Role-Based Access

**Support Admin roles:**
- `support_agent`: Basic ticket access, can reply and update
- `support_manager`: Full access, can assign and escalate
- `safety_admin`: Access to safety/abuse tickets only
- `super_admin`: Full access to all tickets and admin features

**Permissions enforced via:**
- Firestore security rules
- Admin console UI checks
- Backend Cloud Functions

## 8. No Tokenomics Changes

**This pack MUST NOT:**
- ❌ Change token prices or packages
- ❌ Modify payout rate (0.20 PLN/token)
- ❌ Change revenue splits (65/35, 80/20)
- ❌ Alter paid chat or refund logic
- ❌ Introduce free tokens, discounts, or promotions
- ❌ Modify calendar or events pricing

**This pack ONLY:**
- ✅ Adds help content and FAQs
- ✅ Enables support communication
- ✅ Provides education UI elements
- ✅ Improves user understanding of existing features

## 9. Implementation Checklist

### Phase 1: Data Models & Backend
- [ ] Create TypeScript interfaces for all models
- [ ] Set up Firestore collections with proper structure
- [ ] Implement security rules for all collections
- [ ] Create composite indexes for queries
- [ ] Add audit logging hooks

### Phase 2: Help Center
- [ ] Mobile Help Center UI (home, search, article view)
- [ ] Web Help Center UI (responsive design)
- [ ] Article search functionality
- [ ] Markdown rendering
- [ ] Feedback mechanism
- [ ] Multi-language support

### Phase 3: Support Tickets (User-side)
- [ ] Mobile ticket creation flow
- [ ] Web ticket creation flow
- [ ] My Tickets list view
- [ ] Ticket detail & conversation
- [ ] Reply functionality
- [ ] Close ticket action

### Phase 4: Admin Console
- [ ] Admin dashboard with filters
- [ ] Ticket list with sorting
- [ ] Ticket detail view
- [ ] Reply as support
- [ ] Internal notes
- [ ] Status/priority changes
- [ ] Assignment system
- [ ] Role-based access control

### Phase 5: Notifications
- [ ] Integrate with PACK 293 notifications
- [ ] User notifications (ticket created, reply, resolved)
- [ ] Admin notifications (new ticket, escalation)
- [ ] Respect quiet hours and preferences

### Phase 6: Education Cards
- [ ] Education card component
- [ ] Contextual placement in flows
- [ ] Dismissal logic
- [ ] Local storage persistence
- [ ] Multi-language support

### Phase 7: Content & Testing
- [ ] Create sample help articles (PL & EN)
- [ ] Write education card content
- [ ] Test ticket creation and resolution
- [ ] Test admin console features
- [ ] Test notifications
- [ ] Test multi-language switching

### Phase 8: Integration & Launch
- [ ] Add entry points to existing screens
- [ ] Update navigation menus
- [ ] Add contextual help links
- [ ] Performance testing
- [ ] Security audit
- [ ] User acceptance testing

## 10. Success Metrics

**Help Center Usage:**
- Article views per user
- Search queries and results
- Helpfulness feedback rate
- Time spent reading articles

**Support Tickets:**
- Tickets created per day
- Average resolution time
- First response time
- User satisfaction rating
- Ticket reopen rate

**Education Cards:**
- Cards shown vs dismissed
- CTA click-through rate
- Impact on user errors (fewer support tickets for explained topics)

**Admin Efficiency:**
- Tickets per admin per day
- Average handle time
- Escalation rate
- SLA compliance (first response within X hours)

## 11. Related Packs

- **PACK 267-268**: Risk & Safety Engine (for safety ticket integration)
- **PACK 281**: Legal docs (Terms, Privacy, Guidelines referenced in help)
- **PACK 293**: Notifications (for ticket alerts)
- **PACK 296**: Audit logs (for admin action tracking)

## 12. File Structure

```
shared/
  types/
    support.ts              # All TypeScript interfaces
    
functions/
  src/
    support/
      createTicket.ts       # Cloud Function: create ticket
      updateTicket.ts       # Update ticket status/priority
      addMessage.ts         # Add message to ticket
      notifySupport.ts      # Notify admins of new tickets
      
app-mobile/
  app/
    help/
      index.tsx             # Help Center home
      [articleId].tsx       # Article detail view
      search.tsx            # Search results
    support/
      tickets/
        index.tsx           # My tickets list
        [ticketId].tsx      # Ticket detail & conversation
        create.tsx          # Create ticket flow
    components/
      EducationCard.tsx     # Reusable education card
      
app-web/
  pages/
    help/
      index.tsx             # Help Center home
      [articleSlug].tsx     # Article detail
    admin/
      support/
        tickets/
          index.tsx         # Admin ticket dashboard
          [ticketId].tsx    # Admin ticket detail
          
firestore/
  rules/
    pack300-support.rules   # Security rules
  indexes/
    pack300-support.json    # Composite indexes
```

---

**Implementation Status:** Ready for development  
**Estimated Effort:** 3-4 weeks (full-stack team)  
**Priority:** High (foundational support infrastructure)
