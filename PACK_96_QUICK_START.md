# PACK 96 Quick Start Guide

## Step-by-Step Integration

### Backend Setup (5 minutes)

1. **Deploy Cloud Functions**
   ```bash
   cd functions
   firebase deploy --only functions:twoFactor_getSettings,functions:twoFactor_enable,functions:twoFactor_disable,functions:twoFactor_initiateChallenge,functions:twoFactor_verifyChallenge
   ```

2. **Update Firestore Rules**
   ```bash
   # Add PACK 96 rules to firestore.rules (see pack96-two-factor.rules)
   firebase deploy --only firestore:rules
   ```

3. **Create Firestore Indexes**
   ```bash
   firebase deploy --only firestore:indexes
   ```

### Mobile Integration (Per Flow)

#### Integrate into Payout Request Screen

Add to [`app-mobile/app/wallet/create-payout-request.tsx`](app-mobile/app/wallet/create-payout-request.tsx:1):

```typescript
import { StepUpVerificationModal } from '@/app/components/StepUpVerificationModal';
import { useStepUpVerification } from '@/app/hooks/useStepUpVerification';

export default function CreatePayoutRequestScreen() {
  const stepUp = useStepUpVerification();
  
  const handleCreateRequest = async () => {
    try {
      setLoading(true);
      
      // Wrap sensitive action with step-up
      await stepUp.executeWithStepUp('PAYOUT_REQUEST_CREATE', async () => {
        const requestId = await payoutService.createPayoutRequest(
          user.uid,
          selectedMethodId,
          tokenAmount
        );
        
        // Success handling...
        Alert.alert('Success', 'Payout request created');
        router.back();
      });
    } catch (error: any) {
      if (error.message === 'STEP_UP_REQUIRED') {
        // Modal is already showing, do nothing
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
      {/* ... existing UI ... */}
      
      {/* Add verification modal */}
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

#### Integrate into Payout Method Creation

Add to [`app-mobile/app/wallet/payout-methods.tsx`](app-mobile/app/wallet/payout-methods.tsx:1):

```typescript
import { useStepUpVerification } from '@/app/hooks/useStepUpVerification';

const stepUp = useStepUpVerification();

const handleSaveMethod = async () => {
  try {
    const action = editingMethod 
      ? 'PAYOUT_METHOD_UPDATE' 
      : 'PAYOUT_METHOD_CREATE';
    
    await stepUp.executeWithStepUp(action, async () => {
      if (editingMethod) {
        await updateMethod(editingMethod.id, formData);
      } else {
        await createMethod(formData);
      }
      
      setShowModal(false);
      refresh();
    });
  } catch (error: any) {
    if (error.message !== 'STEP_UP_REQUIRED') {
      Alert.alert('Error', error.message);
    }
  }
};

// Add modal to JSX
<StepUpVerificationModal {...stepUp} />
```

#### Integrate into KYC Submission

Similar pattern for KYC:

```typescript
const handleSubmitKYC = async () => {
  await stepUp.executeWithStepUp('KYC_SUBMIT', async () => {
    await kycService.submitApplication(documents);
  });
};
```

#### Integrate into Logout All Sessions

Add to [`app-mobile/app/security/sessions.tsx`](app-mobile/app/security/sessions.tsx:1):

```typescript
const stepUp = useStepUpVerification();

const handleLogoutAll = async () => {
  await stepUp.executeWithStepUp('LOGOUT_ALL_SESSIONS', async () => {
    await sessionService.logoutAllSessions(true, currentSessionId);
    refresh();
  });
};
```

### Add 2FA Settings to Security Menu

In your security/profile settings screen:

```typescript
<TouchableOpacity onPress={() => router.push('/security/two-factor')}>
  <Text>Two-Factor Authentication</Text>
</TouchableOpacity>
```

---

## Testing

### 1. Test 2FA Enable

```typescript
// Mobile
1. Navigate to Security → Two-Factor Authentication
2. Tap "Enable 2FA"
3. Enter email address
4. Tap "Enable"
5. Verify success message
6. Verify settings show "Enabled"
```

### 2. Test Step-Up Flow

```typescript
// Mobile
1. Enable 2FA (as above)
2. Navigate to Wallet → Create Payout Request
3. Enter amount and select method
4. Tap "Request Payout"
5. Step-Up modal should appear automatically
6. Check email for 6-digit code
7. Enter code in modal
8. Tap "Verify"
9. Payout request should be created
```

### 3. Test Disable 2FA

```typescript
// Mobile
1. Navigate to Security → Two-Factor Authentication
2. Tap "Disable 2FA"
3. Confirm in alert
4. Step-Up modal should appear
5. Check email for code
6. Enter code
7. Verify 2FA is disabled
```

### 4. Test High-Risk User

```typescript
// Backend (simulate high risk)
1. Set user risk score to 60 in Trust Engine
2. User attempts payout (even without 2FA)
3. Step-up should be REQUIRED
4. Verification modal appears
5. Code sent to user's email on file
```

### 5. Test Strong-Auth Window

```typescript
// Mobile
1. Complete one step-up verification
2. Immediately attempt another sensitive action (same category)
3. Should NOT prompt again (within 10-minute window)
4. Wait 11 minutes
5. Attempt action again
6. Should prompt for verification again
```

---

## Quick Reference

### Sensitive Actions

```typescript
'PAYOUT_METHOD_CREATE'    // Recommended → Required if 2FA on
'PAYOUT_METHOD_UPDATE'    // Recommended → Required if 2FA on
'PAYOUT_REQUEST_CREATE'   // ALWAYS Required
'KYC_SUBMIT'              // Recommended → Required if 2FA on
'LOGOUT_ALL_SESSIONS'     // Recommended → Required if 2FA on
'ACCOUNT_DELETION'        // ALWAYS Required
'2FA_DISABLE'             // ALWAYS Required
'EMAIL_CHANGE'            // ALWAYS Required
'PASSWORD_CHANGE'         // Recommended → Required if 2FA on
'EARN_ENABLE'             // None (not protected by default)
```

### Error Codes

```typescript
'STEP_UP_REQUIRED'        // Step-up verification required
'2FA_ENABLED'             // Reason: User has 2FA enabled
'HIGH_RISK_USER'          // Reason: Risk score ≥ 50
'HIGH_VALUE_ACTION'       // Reason: Action is sensitive
'PAYMENT_FRAUD_RISK'      // Reason: User flagged for fraud
'ACCOUNT_RESTRICTED'      // User is suspended/restricted
```

### Backend Functions

```typescript
// For integrating into existing Cloud Functions
import { enforceStepUpForAction } from './pack96-twoFactorIntegrations';

export const myFunction = onCall(async (request) => {
  const userId = request.auth?.uid;
  
  // Add step-up enforcement
  await enforceStepUpForAction(userId, 'MY_SENSITIVE_ACTION');
  
  // ... rest of function
});
```

### Mobile Pattern

```typescript
// Standard integration pattern
import { useStepUpVerification } from '@/app/hooks/useStepUpVerification';
import { StepUpVerificationModal } from '@/app/components/StepUpVerificationModal';

const stepUp = useStepUpVerification();

const handleAction = async () => {
  await stepUp.executeWithStepUp('ACTION_NAME', async () => {
    // Your sensitive action here
  });
};

// In JSX:
<StepUpVerificationModal
  visible={stepUp.showVerificationModal}
  action={stepUp.verificationAction!}
  reasonCodes={stepUp.verificationReasonCodes}
  onSuccess={stepUp.handleVerificationSuccess}
  onCancel={stepUp.handleVerificationCancel}
/>
```

---

## Production Checklist

### Before Launch

- [ ] Configure email service (SendGrid/AWS SES/etc.)
- [ ] Update `sendOTPCode()` in [`pack96-twoFactorEngine.ts`](functions/src/pack96-twoFactorEngine.ts:509)
- [ ] Test email delivery in staging
- [ ] Remove dev console.log statements
- [ ] Set up monitoring/alerts for failed verifications
- [ ] Create user documentation/FAQs
- [ ] Train support team on 2FA troubleshooting
- [ ] Deploy backend functions
- [ ] Deploy Firestore rules
- [ ] Deploy Firestore indexes
- [ ] Deploy mobile app
- [ ] Monitor adoption rate
- [ ] Monitor failure/abandonment rates
- [ ] Set up alerts for brute-force patterns

### Email Service Setup

**SendGrid Example**:

```bash
# Install
npm install @sendgrid/mail

# Configure
firebase functions:config:set sendgrid.api_key="YOUR_API_KEY"

# Deploy
firebase deploy --only functions
```

**AWS SES Example**:

```bash
# Install AWS SDK
npm install @aws-sdk/client-ses

# Configure with IAM credentials
# Update sendOTPCode() function accordingly
```

---

## Monitoring Queries

### Check 2FA Adoption

```javascript
// Firebase Console → Firestore
SELECT COUNT(*) FROM user_2fa_settings WHERE enabled = true
```

### Check Active Challenges

```javascript
SELECT * FROM user_2fa_challenges 
WHERE resolved = false 
ORDER BY createdAt DESC 
LIMIT 50
```

### Check Failed Attempts

```javascript
SELECT * FROM user_2fa_events 
WHERE type = 'CHALLENGE_FAILED' 
AND createdAt > NOW() - INTERVAL 24 HOUR
```

### Check High-Risk Step-Ups

```javascript
SELECT COUNT(*) FROM user_2fa_challenges 
WHERE resolved = true 
  AND result = 'SUCCESS'
  AND context.reasonCodes ARRAY_CONTAINS 'HIGH_RISK_USER'
```

---

## Support Scenarios

### User: "I didn't receive the code"

1. Check spam folder
2. Verify email in 2FA settings is correct
3. Check email service logs (SendGrid, etc.)
4. Allow resend (user can tap "Resend")
5. If repeated issues, verify email service health

### User: "Code expired before I could enter it"

1. Normal - 15-minute expiry is intentional
2. User can request new code (initiate new challenge)
3. Consider increasing expiry to 20 minutes if common complaint

### User: "Too many failed attempts"

1. Check `user_2fa_challenges` for attempt history
2. Challenge expires in 15 minutes
3. User can create new challenge after expiry
4. If suspicious, check Trust Engine for abuse patterns

### User: "Locked out of account"

1. Check if account is SUSPENDED (PACK 87)
2. If only 2FA issue:
   - Wait for challenge expiry
   - Create new challenge
3. If enforcement issue:
   - Review with moderation team
   - Step-up cannot override enforcement

---

## Quick Wins

### Immediate Value

- ✅ Protect high-value payouts
- ✅ Prevent unauthorized KYC resubmission
- ✅ Secure payout method changes
- ✅ Add layer to logout-all security

### Low-Hanging Fruit

- Add 2FA prompt in onboarding for creators
- Email campaigns encouraging 2FA for users with earnings
- Show 2FA status in profile badge
- Add "2FA enabled" indicator in creator profiles

### Future Optimizations

- TOTP app support (Google Authenticator)
- Backup codes for recovery
- SMS as alternative delivery method
- Biometric step-up for mobile
- Per-device trust levels

---

**PACK 96 is ready for deployment!** 🚀

For detailed documentation, see [PACK_96_IMPLEMENTATION.md](PACK_96_IMPLEMENTATION.md:1)