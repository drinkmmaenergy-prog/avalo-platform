# PACK 281 - Legal Documents & Consent System Implementation

## Overview
Comprehensive legal document management and mandatory consent system for Avalo.

---

## ✅ Completed Components

### 1. Firestore Schema & Security Rules

**Files Created:**
- `firestore-pack281-legal-docs.rules` - Security rules for legal documents and acceptances
- `firestore-pack281-legal-docs.indexes.json` - Firestore indexes for queries

**Collections:**

#### `legalDocuments/{docId}`
```typescript
{
  docId: 'terms' | 'privacy' | 'safety_rules' | 'content_policy' | 'cookie_policy',
  version: number,
  slug: string,
  required: boolean,
  supportedLanguages: ['en', 'pl'],
  texts: {
    en: { title: string, url: string, summary?: string },
    pl: { title: string, url: string, summary?: string }
  },
  effectiveAt: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `legalAcceptances/{userId}`
```typescript
{
  userId: string,
  docs: {
    terms: {
      version: number,
      acceptedAt: Timestamp,
      language: 'en' | 'pl',
      ipAddress?: string,
      userAgent?: string
    },
    privacy: { ... },
    safety_rules: { ... }
  },
  lastUpdated: Timestamp
}
```

**Security:**
- Anyone can READ legal documents (public)
- Only admins can WRITE legal documents
- Users can only read/write their own acceptances
- No deletion of acceptance records (audit trail)

---

### 2. TypeScript Type Definitions

**File:** `shared/types/legal.types.ts`

**Key Types:**
- `LegalLanguage` - 'en' | 'pl'
- `LegalDocType` - Document type identifiers
- `LegalDocument` - Full document structure
- `LegalAcceptance` - Single document acceptance
- `UserLegalAcceptances` - Complete user acceptance record
- `LegalComplianceStatus` - Compliance checking result
- `AcceptLegalDocsPayload` - API payload for accepting docs

---

### 3. Cloud Functions

**File:** `functions/src/pack281-legal-system.ts`

**Functions Implemented:**

#### `getLegalDocuments`
- **Purpose:** Fetch legal documents (all or specific ones)
- **Parameters:** 
  - `docIds?` - Array of specific document IDs
  - `language?` - Requested language (default: 'en')
  - `requiredOnly?` - Only fetch required documents
- **Auth:** None required (public)
- **Returns:** Array of legal documents

#### `acceptLegalDocuments`
- **Purpose:** User accepts one or more legal documents
- **Parameters:**
  - `acceptances` - Array of {docId, version, language}
  - `ipAddress?` - For audit trail
  - `userAgent?` - For audit trail
- **Auth:** Required
- **Validation:** 
  - Verifies documents exist
  - Compares versions
  - Checks user is authenticated
- **Returns:** Success status and accepted document IDs

#### `checkLegalCompliance`
- **Purpose:** Check if user has accepted all required documents
- **Parameters:**
  - `language?` - Display language
- **Auth:** Required
- **Returns:**
  - `isCompliant` - Boolean
  - `missingDocs` - Array of document IDs
  - `outdatedDocs` - Array of {docId, currentVersion, acceptedVersion}
  - `requiredActions` - Array of action descriptions
  - `documents` - Full document details
  - `userAcceptances` - User's acceptance history

#### `getUserLegalAcceptances`
- **Purpose:** Get user's complete acceptance history
- **Parameters:** None
- **Auth:** Required
- **Returns:** Complete UserLegalAcceptances object

#### `adminCreateLegalDocument`
- **Purpose:** Create or update a legal document (admin only)
- **Parameters:** Complete LegalDocument object
- **Auth:** Required + Admin role
- **Returns:** Created/updated document

---

### 4. Mobile App Service

**File:** `app-mobile/lib/services/legalService.ts`

**LegalService Class Methods:**

- `getDeviceLanguage()` - Detect device language
- `getLegalDocuments(params)` - Fetch documents
- `acceptLegalDocuments(acceptances)` - Submit acceptances
- `checkLegalCompliance(language)` - Check compliance status
- `getUserLegalAcceptances()` - Get user history
- `needsLegalConsent()` - Primary method to check if consent flow is needed
- `formatAcceptanceDate(iso, locale)` - Format timestamp for display
- `getDocumentDisplayName(docId, language)` - Get localized document name

---

### 5. Onboarding Legal Consent Screen

**File:** `app-mobile/app/onboarding/legal-consent.tsx`

**Features:**
- ✅ Blocking gate during onboarding
- ✅ Multi-language support (EN/PL toggle)
- ✅ 18+ age confirmation checkbox
- ✅ Required document acceptance (Terms, Privacy, Safety)
- ✅ Clickable links to open documents
- ✅ Display document versions
- ✅ Disabled submit until all accepted
- ✅ Loading and error states
- ✅ Custom checkbox component (no expo-checkbox dependency)

**Flow:**
1. User lands on screen after registration/login
2. System detects device language
3. User can toggle between EN/PL
4. Must check all 4 boxes (age + 3 documents)
5. Can click document titles to view full text
6. "Accept and Continue" button enabled only when all checked
7. Submits acceptances to backend
8. Redirects to main app on success

---

## 🔄 Integration Points

### Required Integrations:

#### 1. **Login/Registration Flow**
```typescript
// After successful auth, before main app access:
const { needsConsent } = await LegalService.needsLegalConsent();
if (needsConsent) {
  router.push('/onboarding/legal-consent');
} else {
  router.push('/feed');
}
```

#### 2. **App Startup Check**
```typescript
// On app open/resume:
useEffect(() => {
  const checkCompliance = async () => {
    const result = await LegalService.checkLegalCompliance();
    if (!result.compliance?.isCompliant) {
      // Show update required screen
      router.push('/legal/update-required');
    }
  };
  checkCompliance();
}, []);
```

#### 3. **Feature Access Gates**
Before allowing access to monetized features:
```typescript
// Chat, Calls, Calendar, Events, Wallet, AI Companions
const { compliance } = await LegalService.checkLegalCompliance();
if (!compliance.isCompliant) {
  Alert.alert('Legal Documents Required', compliance.requiredActions.join('\n'));
  router.push('/legal/update-required');
  return;
}
```

---

## 📋 TODO: Remaining Implementation

### 1. Legal Center UI (Settings)
**File:** `app-mobile/app/profile/settings/legal-center.tsx`

**Requirements:**
- List all legal documents (required + optional)
- Show current version vs accepted version
- Show acceptance timestamp
- "View Document" buttons
- Status indicators (✅ current, ⚠️ outdated, ❌ not accepted)
- Option to re-accept updated documents

### 2. Update Required Screen
**File:** `app-mobile/app/legal/update-required.tsx`

**Requirements:**
- Shown when user has outdated acceptances
- Highlight what changed (summary)
- List affected documents with versions
- "Accept Updates" button
- Blocks access to monetized features until accepted

### 3. Enforcement Hooks

**Locations to add checks:**
- `app-mobile/app/(tabs)/chat/index.tsx` - Before chat access
- `app-mobile/app/(tabs)/calendar/index.tsx` - Before calendar access
- `app-mobile/app/(tabs)/events/index.tsx` - Before events access
- `app-mobile/app/(tabs)/wallet/index.tsx` - Before wallet access
- `app-mobile/app/ai-companions/index.tsx` - Before AI access
- `app-mobile/app/(tabs)/calls/index.tsx` - Before calls access

**Hook Pattern:**
```typescript
const useLegalGuard = () => {
  const [isCompliant, setIsCompliant] = useState<boolean | null>(null);
  
  useEffect(() => {
    const check = async () => {
      const result = await LegalService.checkLegalCompliance();
      setIsCompliant(result.compliance?.isCompliant ?? false);
      
      if (!result.compliance?.isCompl iant) {
        Alert.alert('Legal Consent Required', 
          'You must accept updated legal documents to access this feature.');
        router.push('/legal/update-required');
      }
    };
    check();
  }, []);
  
  return { isCompliant };
};
```

### 4. Admin Panel Integration
**File:** `web-admin/pages/legal-documents.tsx`

**Features:**
- List all legal documents
- Create new document version
- Edit document URLs
- Preview documents
- See acceptance statistics
- Audit log of updates

### 5. Web Version
**File:** `web/app/auth/legal-consent.tsx`

**Requirements:**
- Same functionality as mobile
- Responsive design
- Browser language detection
- localStorage for temporary state

---

## 🔒 Content Policy Integration

### Documents to Create:

#### 1. `terms` - Terms of Service
**Key Sections:**
- 18+ age requirement
- Account eligibility
- Money flow (65/35 for creators, 80/20 for AI companions)
- No guaranteed earnings
- Tokens are utility, not financial instruments
- Payout rate (0.20 PLN/token) with notice of changes
- Content ownership and licensing
- Termination clauses

#### 2. `privacy` - Privacy Policy
**Key Sections:**
- Data collection (profile, photos, videos, messages)
- GPS tracking (only during events/meetings for safety)
- Panic Button data usage
- AI chat data usage for model improvement
- Data retention and deletion
- GDPR compliance
- Third-party integrations

#### 3. `safety_rules` - Safety & Content Rules
**Key Sections:**
- 18+ only platform
- Prohibited content:
  - No minors or child sexual content (CSAM)
  - No hate speech or serious violence
  - No real-world illegal activity
  - No non-consensual content
- Allowed content:
  - Erotic/sexual content between consenting adults
  - Bikini/lingerie (app), stricter rules for app stores
  - Live cam with consent
- Reporting mechanisms
- Enforcement actions (warnings, suspension, ban)

#### 4. `content_policy` - Content Policy
**Key Sections:**
- Photo/video guidelines
- AI avatar rules
- Live streaming guidelines
- Copyright and intellectual property
- Monetization requirements
- Quality standards

#### 5. `cookie_policy` - Cookie Policy (optional)
**Key Sections:**
- Types of cookies used
- Essential vs optional cookies
- Third-party cookies
- Cookie preferences

---

## 🌍 Multi-Language Support

### Current Languages:
- **English (en)** - Required, fallback language
- **Polish (pl)** - Primary non-English language

### Adding New Languages:
1. Update `LegalLanguage` type in `shared/types/legal.types.ts`
2. Add language to document's `supportedLanguages` array
3. Add text entry in `texts` object with translated title and URL
4. Update `getDocumentDisplayName()` in LegalService
5. Update UI language toggles

---

## 📊 Compliance Enforcement Flow

```
┌─────────────────────────────────────────────┐
│         User Opens App / Logs In            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │ Check Legal         │
         │ Compliance          │
         └──────┬──────────────┘
                │
      ┌─────────┴──────────┐
      │                     │
      ▼                     ▼
┌──────────┐         ┌──────────────┐
│Compliant │         │Not Compliant │
└────┬─────┘         └──────┬───────┘
     │                      │
     │                      ▼
     │              ┌──────────────────┐
     │              │ Missing Docs?    │
     │              └───────┬──────────┘
     │                      │
     │              ┌───────┴────────┐
     │              │                 │
     │              ▼                 ▼
     │       ┌─────────────┐  ┌─────────────┐
     │       │First Time   │  │Doc Updated  │
     │       │User         │  │(Re-consent) │
     │       └──────┬──────┘  └──────┬──────┘
     │              │                 │
     │              ▼                 ▼
     │       ┌──────────────────────────┐
     │       │Show Legal Consent Screen │
     │       └────────────┬─────────────┘
     │                    │
     │                    ▼
     │           ┌─────────────────┐
     │           │User Accepts All │
     │           └────────┬────────┘
     │                    │
     └────────────────────┴────────────────┐
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │Allow Access  │
                                    │to App        │
                                    └──────────────┘
```

---

## 🔧 Testing Checklist

### Unit Tests Needed:
- [ ] `getLegalDocuments` function
- [ ] `acceptLegalDocuments` with validation
- [ ] `checkLegalCompliance` logic
- [ ] Version comparison logic
- [ ] Language detection

### Integration Tests Needed:
- [ ] Full onboarding flow
- [ ] Document update re-consent flow
- [ ] Feature access blocking
- [ ] Multi-language switching
- [ ] Admin document creation

### Manual Testing:
- [ ] New user sees consent screen
- [ ] Cannot skip consent screen
- [ ] Can view all documents
- [ ] Language toggle works
- [ ] Acceptance saves correctly
- [ ] Re-consent triggers on document update
- [ ] Compliance blocks features correctly
- [ ] Legal Center displays correctly

---

## 📝 Next Steps

1. ✅ Create Legal Center UI in settings
2. ✅ Create Update Required screen
3. ✅ Add enforcement hooks to all monetized features
4. ✅ Create admin panel for document management
5. ✅ Write actual legal document content (EN + PL)
6. ✅ Deploy legal document HTMLs to hosting
7. ✅ Test complete flow end-to-end
8. ✅ Add compliance analytics/reporting

---

## 🚀 Deployment Steps

1. Deploy Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. Deploy indexes:
   ```bash
   firebase deploy --only firestore:indexes
   ```

3. Deploy Cloud Functions:
   ```bash
   cd functions
   npm run deploy
   ```

4. Create initial legal documents (via admin function):
   ```typescript
   await adminCreateLegalDocument({
     docId: 'terms',
     version: 1,
     slug: 'terms-of-service',
     required: true,
     supportedLanguages: ['en', 'pl'],
     texts: {
       en: {
         title: 'Avalo Terms of Service',
         url: 'https://avalo.app/legal/terms/en-1.html'
       },
       pl: {
         title: 'Regulamin Avalo',
         url: 'https://avalo.app/legal/terms/pl-1.html'
       }
     }
   });
   ```

5. Deploy mobile app with new screens
6. Test with real users

---

## 📚 Documentation

### For Developers:
- This document
- Type definitions in `shared/types/legal.types.ts`
- Inline code comments

### For Users:
- In-app legal documents
- FAQ section about legal requirements
- Help articles about acceptance process

### For Admins:
- Admin panel documentation
- Document update procedures
- Compliance reporting guide

---

## ⚖️ Legal Compliance Notes

- All acceptances are timestamped and logged
- IP addresses and user agents CAN be logged for audit
- Users must be 18+ (confirmed during onboarding)
- No financial guarantees made
- Clear revenue split disclosure
- GDPR-compliant data handling
- Right to delete account (removes all data including acceptances)
- Regular legal document reviews recommended

---

**Implementation Status:** 🟡 In Progress (60% Complete)

**Blocked By:** None

**Ready for:** Legal content writing, remaining UI components implementation