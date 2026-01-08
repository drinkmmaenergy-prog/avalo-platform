# PACK 96 Integration Checklist

## Required Integrations for Existing Screens

### ✅ Already Integrated (Backend)

- [x] **Payout Method Creation** - [`functions/src/payoutRequests.ts`](functions/src/payoutRequests.ts:21)
- [x] **Payout Method Update** - [`functions/src/payoutRequests.ts`](functions/src/payoutRequests.ts:21)
- [x] **Payout Request Creation** - [`functions/src/payoutRequests.ts`](functions/src/payoutRequests.ts:300)
- [x] **KYC Submission** - [`functions/src/kyc.ts`](functions/src/kyc.ts:18)
- [x] **Logout All Sessions** - [`functions/src/pack95-session-security.ts`](functions/src/pack95-session-security.ts:31)

### 📱 Mobile Integrations Needed

#### 1. Payout Request Screen
**File**: `app-mobile/app/wallet/create-payout-request.tsx`

```typescript
// Add imports
import { StepUpVerificationModal } from '@/app/components/StepUpVerificationModal';
import { useStepUpVerification } from '@/app/hooks/useStepUpVerification';

// Add hook
const stepUp = useStepUpVerification();

// Wrap create request function
const handleCreateRequest = async () => {
  await stepUp.executeWithStepUp('PAYOUT_REQUEST_CREATE', async () => {
    await payoutService.createPayoutRequest(userId, methodId, tokens);
    // ... success handling
  });
};

// Add modal to JSX
<StepUpVerificationModal
  visible={stepUp.showVerificationModal}
  action={stepUp.verificationAction!}
  reasonCodes={stepUp.verificationReasonCodes}
  onSuccess={stepUp.handleVerificationSuccess}
  onCancel={stepUp.handleVerificationCancel}
/>
```

**Status**: ⚠️ Needs integration

---

#### 2. Payout Methods Screen
**File**: `app-mobile/app/wallet/payout-methods.tsx`

```typescript
// Add hook
const stepUp = useStepUpVerification();

// Wrap save method function
const handleSaveMethod = async () => {
  const action = editingMethod ? 'PAYOUT_METHOD_UPDATE' : 'PAYOUT_METHOD_CREATE';
  
  await stepUp.executeWithStepUp(action, async () => {
    if (editingMethod) {
      await updatePayoutMethod(methodId, data);
    } else {
      await createPayoutMethod(data);
    }
    // ... success handling
  });
};

// Add modal to JSX
<StepUpVerificationModal {...stepUp} />
```

**Status**: ⚠️ Needs integration

---

#### 3. KYC Submission Screen
**File**: `app-mobile/app/kyc/submit.tsx` (or wherever KYC submission happens)

```typescript
// Add hook
const stepUp = useStepUpVerification();

// Wrap submit function
const handleSubmitKYC = async () => {
  await stepUp.executeWithStepUp('KYC_SUBMIT', async () => {
    await kycService.submitApplication(documents);
    // ... success handling
  });
};

// Add modal
<StepUpVerificationModal {...stepUp} />
```

**Status**: ⚠️ Needs integration

---

#### 4. Sessions Screen (Logout All)
**File**: `app-mobile/app/security/sessions.tsx`

```typescript
// Add hook
const stepUp = useStepUpVerification();

// Wrap logout all function
const handleLogoutAll = async () => {
  await stepUp.executeWithStepUp('LOGOUT_ALL_SESSIONS', async () => {
    await sessionSecurityService.logoutAllSessions(true, currentSessionId);
    refresh();
  });
};

// Add modal
<StepUpVerificationModal {...stepUp} />
```

**Status**: ⚠️ Needs integration

---

#### 5. Security Settings Menu
**File**: Main security/settings screen

```typescript
// Add navigation item
<TouchableOpacity onPress={() => router.push('/security/two-factor')}>
  <View style={styles.menuItem}>
    <Text style={styles.menuLabel}>Two-Factor Authentication</Text>
    <Text style={styles.menuValue}>
      {twoFactorEnabled ? 'Enabled' : 'Not Set Up'}
    </Text>
  </View>
</TouchableOpacity>
```

**Status**: ⚠️ Needs navigation link

---

## Optional Integrations (Future)

### Account Deletion
**Action**: `ACCOUNT_DELETION`

If you have an account deletion flow, add step-up:

```typescript
await stepUp.executeWithStepUp('ACCOUNT_DELETION', async () => {
  await accountService.requestDeletion(userId);
});
```

### Password Change
**Action**: `PASSWORD_CHANGE`

If you have a password change screen:

```typescript
await stepUp.executeWithStepUp('PASSWORD_CHANGE', async () => {
  await authService.updatePassword(newPassword);
});
```

### Email Change
**Action**: `EMAIL_CHANGE`

If you allow email changes:

```typescript
await stepUp.executeWithStepUp('EMAIL_CHANGE', async () => {
  await authService.updateEmail(newEmail);
});
```

### Enable "Earn from Chat"
**Action**: `EARN_ENABLE`

For high-risk users enabling monetization:

```typescript
// Only enforced for high-risk users
await stepUp.executeWithStepUp('EARN_ENABLE', async () => {
  await creatorService.enableEarnings();
});
```

---

## Common Integration Pattern

### Standard Flow

```typescript
import { useStepUpVerification } from '@/app/hooks/useStepUpVerification';
import { StepUpVerificationModal } from '@/app/components/StepUpVerificationModal';
import { Alert } from 'react-native';

export default function MyScreen() {
  const stepUp = useStepUpVerification();
  const [loading, setLoading] = useState(false);
  
  const handleSensitiveAction = async () => {
    try {
      setLoading(true);
      
      await stepUp.executeWithStepUp('ACTION_NAME', async () => {
        // Your sensitive operation
        await myService.doSomething();
        
        // Success handling
        Alert.alert('Success', 'Action completed');
        navigation.goBack();
      });
    } catch (error: any) {
      // If error is STEP_UP_REQUIRED, modal is already showing
      if (error.message === 'STEP_UP_REQUIRED') {
        return;
      }
      
      // Handle other errors
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <View>
      {/* Your UI */}
      
      <TouchableOpacity 
        onPress={handleSensitiveAction}
        disabled={loading}
      >
        <Text>Perform Action</Text>
      </TouchableOpacity>
      
      {/* Step-Up Modal */}
      <StepUpVerificationModal
        visible={stepUp.showVerificationModal}
        action={stepUp.verificationAction!}
        reasonCodes={stepUp.verificationReasonCodes}
        onSuccess={stepUp.handleVerificationSuccess}
        onCancel={stepUp.handleVerificationCancel}
      />
    </View>
  );
}
```

---

## Error Handling Pattern

### Detecting Step-Up Errors

```typescript
import * as twoFactorService from '@/app/services/twoFactorService';

try {
  await sensitiveAction();
} catch (error: any) {
  if (twoFactorService.isStepUpRequiredError(error)) {
    // Step-up is required
    const action = twoFactorService.getActionFromStepUpError(error);
    const reasons = twoFactorService.getReasonCodesFromStepUpError(error);
    
    // Show verification modal or use useStepUpVerification hook
    // ...
  } else {
    // Other error
    Alert.alert('Error', twoFactorService.getTwoFactorErrorMessage(error));
  }
}
```

---

## Firebase Console Setup

### 1. Enable Required Services

- ✅ Cloud Functions (already enabled)
- ✅ Firestore (already enabled)
- ⚠️ Email service (SendGrid/AWS SES/etc.)

### 2. Create Firestore Indexes

Navigate to: Firebase Console → Firestore → Indexes

Create indexes from [`pack96-firestore-indexes.json`](firestore-rules/pack96-firestore-indexes.json:1)

### 3. Deploy Security Rules

Navigate to: Firebase Console → Firestore → Rules

Add rules from [`pack96-two-factor.rules`](firestore-rules/pack96-two-factor.rules:1)

### 4. Configure Functions

```bash
# If using SendGrid
firebase functions:config:set sendgrid.api_key="SG.xxx..."

# View current config
firebase functions:config:get
```

---

## Testing Scenarios

### Scenario 1: New User, No 2FA

```
Action: Create payout request
Expected: 
- Policy evaluates to RECOMMENDED (base policy)
- Since no 2FA enabled, no enforcement
- Payout request proceeds without step-up
```

### Scenario 2: User with 2FA Enabled

```
Action: Create payout request
Expected:
- Policy evaluates to REQUIRED (2FA enabled + requireFor2FAUsers)
- STEP_UP_REQUIRED error thrown
- Modal shows, OTP sent
- User verifies, request proceeds
```

### Scenario 3: High-Risk User, No 2FA

```
Setup: User has risk score 60
Action: Create payout request
Expected:
- Policy evaluates to REQUIRED (high risk + HIGH_VALUE_ACTION)
- STEP_UP_REQUIRED error thrown
- OTP sent to user's email on file
- User must verify before payout proceeds
```

### Scenario 4: Recent Strong Auth

```
Setup: User verified 5 minutes ago
Action: Create another payout request
Expected:
- Policy checks recent strong auth
- Within 10-minute window
- Requirement downgraded to RECOMMENDED
- Payout proceeds without re-verification
```

### Scenario 5: Suspended Account

```
Setup: User is SUSPENDED (PACK 87)
Action: Attempt any action
Expected:
- Policy evaluation notes ACCOUNT_RESTRICTED
- Step-up verification alone cannot unblock
- Enforcement restriction takes precedence
- Action blocked regardless of verification
```

---

## Rollback Plan

### If Issues Arise

1. **Remove Backend Enforcement**
   ```typescript
   // Comment out in each integrated file
   // await enforceStepUpForAction(userId, action);
   ```

2. **Redeploy Functions**
   ```bash
   firebase deploy --only functions
   ```

3. **Mobile Graceful Degradation**
   - Modal already handles errors gracefully
   - If backend doesn't enforce, modal won't show
   - App continues to function normally

4. **Disable for Specific Actions**
   ```typescript
   // In twoFactor.types.ts, change policy:
   'PAYOUT_REQUEST_CREATE': {
     baseRequirement: 'NONE',  // Temporarily disable
     requireFor2FAUsers: false,
   }
   ```

---

## Success Criteria

### Launch Metrics (Week 1)

- 2FA adoption rate > 5% of active creators
- Step-up challenge success rate > 90%
- Average verification time < 2 minutes
- User complaints < 1% of attempts
- Zero security incidents bypassing 2FA

### Growth Metrics (Month 1)

- 2FA adoption rate > 20% of creators
- High-risk users successfully completing step-up
- Reduction in unauthorized payout attempts
- Positive user feedback on security

### Health Metrics (Ongoing)

- Challenge success rate > 85%
- Failed attempts per user < 2
- Email delivery rate > 99%
- Support tickets < 0.1% of challenges

---

## Priority Order for Integration

1. **Critical** (Integrate First)
   - ✅ Payout request creation (highest risk)
   - ✅ Payout method creation/update (high risk)
   - ⚠️ Add 2FA settings to Security menu

2. **High Priority** (Week 1)
   - ⚠️ KYC submission integration
   - ⚠️ Logout all sessions integration
   - ⚠️ Mobile UI integration for payout flows

3. **Medium Priority** (Week 2)
   - Account deletion (if feature exists)
   - Email/password change (if features exist)
   - Production email service setup

4. **Low Priority** (Future)
   - TOTP app support
   - SMS OTP support
   - Backup codes
   - Enhanced analytics

---

## Final Verification Steps

Before marking as complete:

- [x] All backend files created
- [x] All mobile files created
- [x] Security rules defined
- [x] Firestore indexes defined
- [x] Integration points identified
- [x] Documentation complete
- [x] Quick start guide created
- [x] Testing checklist provided
- [ ] Email service configured (production requirement)
- [ ] Mobile screens integrated into navigation
- [ ] End-to-end test performed

---

**Next Action**: Integrate mobile components into existing screens and configure production email service.

See:
- Full documentation: [PACK_96_IMPLEMENTATION.md](PACK_96_IMPLEMENTATION.md:1)
- Quick start: [PACK_96_QUICK_START.md](PACK_96_QUICK_START.md:1)
- Integration examples: [`app-mobile/app/utils/stepUpIntegration.tsx`](app-mobile/app/utils/stepUpIntegration.tsx:1)