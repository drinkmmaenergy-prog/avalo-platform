/**
 * PACK 55 — Compliance Integration Examples
 * Shows how to integrate compliance checks into existing packs
 */

import { db, admin } from './init';
import { updateAMLProfile } from './compliancePack55';
import { onMediaUploaded } from './mediaComplianceIntegration';

// ============================================================================
// EXAMPLE 1: Age Gate Check in Discovery Feed (PACK 51)
// ============================================================================

/**
 * Before showing discovery feed content, verify age
 * 
 * Usage in discoveryFeed.ts:
 * 
 * export const getDiscoveryFeed = functions.https.onCall(async (data, context) => {
 *   if (!context.auth) {
 *     throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 *   }
 * 
 *   const userId = context.auth.uid;
 * 
 *   // Check age verification
 *   const ageVerificationRef = db.collection('age_verification').doc(userId);
 *   const ageDoc = await ageVerificationRef.get();
 *   const ageData = ageDoc.data();
 * 
 *   if (!ageData?.ageVerified) {
 *     throw new functions.https.HttpsError(
 *       'failed-precondition',
 *       'Age verification required to access discovery feed'
 *     );
 *   }
 * 
 *   // Continue with normal discovery feed logic...
 *   // Filter out profiles with HIGH/CRITICAL risk media
 * });
 */

// ============================================================================
// EXAMPLE 2: Filter Flagged Media in Discovery Feed
// ============================================================================

/**
 * When building discovery feed, exclude profiles with flagged media
 * 
 * async function buildFeedProfiles(userId: string) {
 *   // Get candidate profiles...
 *   const profiles = await getCandidateProfiles();
 * 
 *   // Filter out profiles with flagged media
 *   const safeProfiles = await Promise.all(profiles.map(async (profile) => {
 *     // Check if any of their profile media is flagged
 *     const mediaScans = await db.collection('media_safety_scans')
 *       .where('ownerUserId', '==', profile.userId)
 *       .where('source', '==', 'PROFILE_MEDIA')
 *       .where('scanStatus', '==', 'FLAGGED')
 *       .limit(1)
 *       .get();
 * 
 *     if (!mediaScans.empty) {
 *       return null; // Exclude this profile
 *     }
 * 
 *     return profile;
 *   }));
 * 
 *   return safeProfiles.filter(p => p !== null);
 * }
 */

// ============================================================================
// EXAMPLE 3: Age Gate Check in Creator Marketplace (PACK 52)
// ============================================================================

/**
 * Before showing creator marketplace, verify age
 * 
 * export const creator_getMarketplace = functions.https.onCall(async (data, context) => {
 *   if (!context.auth) {
 *     throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
 *   }
 * 
 *   const userId = context.auth.uid;
 * 
 *   // Check age verification
 *   const ageVerificationRef = db.collection('age_verification').doc(userId);
 *   const ageDoc = await ageVerificationRef.get();
 * 
 *   if (!ageDoc.exists || !ageDoc.data()?.ageVerified) {
 *     throw new functions.https.HttpsError(
 *       'failed-precondition',
 *       'Age verification required to access creator marketplace'
 *     );
 *   }
 * 
 *   // Continue with marketplace logic...
 * });
 */

// ============================================================================
// EXAMPLE 4: Update AML Profile on Token Earnings (PACK 52)
// ============================================================================

/**
 * When creator earns tokens, update their AML profile
 * 
 * In creator earning flow:
 * 
 * async function recordCreatorEarning(userId: string, tokensEarned: number, channel: string) {
 *   // Record the earning event
 *   await db.collection('token_earn_events').add({
 *     userId,
 *     tokensEarned,
 *     channel,
 *     createdAt: admin.firestore.FieldValue.serverTimestamp(),
 *   });
 * 
 *   // Update AML profile
 *   await updateAMLProfile(userId, tokensEarned);
 * 
 *   // Continue with wallet credit...
 * }
 */

// ============================================================================
// EXAMPLE 5: Trigger CSAM Scan on PPM Media Upload (PACK 42)
// ============================================================================

/**
 * When user uploads PPM media, trigger safety scan
 * 
 * In PPM media upload handler:
 * 
 * export const uploadPPMMedia = functions.https.onCall(async (data, context) => {
 *   // ... upload media to storage ...
 *   
 *   const mediaId = `${conversationId}_${messageId}`;
 *   const storagePath = `ppm_media/${userId}/${mediaId}`;
 * 
 *   // Trigger safety scan
 *   await onMediaUploaded(
 *     mediaId,
 *     userId,
 *     'CHAT_PPM',
 *     storagePath
 *   );
 * 
 *   // Media is now pending scan, but visible
 *   // If flagged later, it will be hidden and moderation case created
 * });
 */

// ============================================================================
// EXAMPLE 6: Check Media Safety Before Display
// ============================================================================

/**
 * Before displaying media in chat/feed, check if it's flagged
 * 
 * Mobile app side (in chat view or feed):
 * 
 * import { isMediaSafe } from '../services/contentSafetyService';
 * 
 * const MediaMessage = ({ messageId }) => {
 *   const [isSafe, setIsSafe] = useState(true);
 * 
 *   useEffect(() => {
 *     checkMediaSafety();
 *   }, [messageId]);
 * 
 *   const checkMediaSafety = async () => {
 *     const safe = await isMediaSafe(messageId);
 *     setIsSafe(safe);
 *   };
 * 
 *   if (!isSafe) {
 *     return <Text>Content unavailable</Text>;
 *   }
 * 
 *   return <Image source={{ uri: mediaUrl }} />;
 * };
 */

// ============================================================================
// EXAMPLE 7: Policy Gate on App Startup
// ============================================================================

/**
 * In main app navigation/auth flow:
 * 
 * import { canAccessApp } from '../utils/complianceGuard';
 * import { hasAcceptedCriticalPolicies } from '../services/policyService';
 * 
 * const MainNavigator = () => {
 *   const { user } = useAuth();
 *   const { locale } = useLocaleContext();
 *   const [policyCheckComplete, setPolicyCheckComplete] = useState(false);
 *   const [needsPolicyAcceptance, setNeedsPolicyAcceptance] = useState(false);
 * 
 *   useEffect(() => {
 *     if (user) {
 *       checkPolicies();
 *     }
 *   }, [user]);
 * 
 *   const checkPolicies = async () => {
 *     if (!user) return;
 *     
 *     const accepted = await hasAcceptedCriticalPolicies(user.uid, locale);
 *     setNeedsPolicyAcceptance(!accepted);
 *     setPolicyCheckComplete(true);
 *   };
 * 
 *   if (!policyCheckComplete) {
 *     return <LoadingScreen />;
 *   }
 * 
 *   if (needsPolicyAcceptance) {
 *     return <PolicyAcceptanceScreen onAccepted={() => setNeedsPolicyAcceptance(false)} />;
 *   }
 * 
 *   return <MainTabs />;
 * };
 */

// ============================================================================
// EXAMPLE 8: Age Gate on Feature Access
// ============================================================================

/**
 * In chat/swipe screen:
 * 
 * import { canAccessAgeRestrictedFeatures } from '../utils/complianceGuard';
 * import { isAgeVerified } from '../services/ageGateService';
 * 
 * const SwipeScreen = () => {
 *   const { user } = useAuth();
 *   const [ageVerified, setAgeVerified] = useState(false);
 *   const [checkingAge, setCheckingAge] = useState(true);
 * 
 *   useEffect(() => {
 *     checkAge();
 *   }, [user]);
 * 
 *   const checkAge = async () => {
 *     if (!user) return;
 *     
 *     const verified = await isAgeVerified(user.uid);
 *     setAgeVerified(verified);
 *     setCheckingAge(false);
 *   };
 * 
 *   if (checkingAge) {
 *     return <LoadingScreen />;
 *   }
 * 
 *   if (!ageVerified) {
 *     return <AgeGateScreen onVerified={() => setAgeVerified(true)} />;
 *   }
 * 
 *   return <ActualSwipeContent />;
 * };
 */

// ============================================================================
// EXAMPLE 9: AML Check Before Showing Earnings (Future Pack)
// ============================================================================

/**
 * Before allowing payout, check KYC requirements
 * 
 * export const payout_request = functions.https.onCall(async (data, context) => {
 *   const userId = context.auth.uid;
 *   const { amount } = data;
 * 
 *   // Check AML state
 *   const amlRef = db.collection('aml_profiles').doc(userId);
 *   const amlDoc = await amlRef.get();
 *   const amlData = amlDoc.data();
 * 
 *   if (amlData?.kycRequired && !amlData?.kycVerified) {
 *     throw new functions.https.HttpsError(
 *       'failed-precondition',
 *       'KYC verification required before requesting payout. Please complete KYC verification.',
 *       { code: 'kyc_required' }
 *     );
 *   }
 * 
 *   // Process payout...
 * });
 */

// ============================================================================
// EXAMPLE 10: GDPR Data Export (Future Implementation)
// ============================================================================

/**
 * Scheduled function to process GDPR export requests
 * 
 * export const gdpr_processExportQueue = functions.pubsub
 *   .schedule('every 6 hours')
 *   .onRun(async () => {
 *     const pendingRequests = await db.collection('gdpr_export_requests')
 *       .where('status', '==', 'PENDING')
 *       .limit(10)
 *       .get();
 * 
 *     for (const doc of pendingRequests.docs) {
 *       const request = doc.data();
 *       
 *       // Update to IN_PROGRESS
 *       await doc.ref.update({ status: 'IN_PROGRESS' });
 * 
 *       try {
 *         // Collect all user data from various collections
 *         const userData = await collectUserData(request.userId);
 *         
 *         // Create JSON export
 *         const exportData = JSON.stringify(userData, null, 2);
 *         
 *         // Upload to Cloud Storage
 *         const bucket = admin.storage().bucket();
 *         const fileName = `gdpr_exports/${request.userId}/${request.requestId}.json`;
 *         const file = bucket.file(fileName);
 *         
 *         await file.save(exportData, {
 *           metadata: { contentType: 'application/json' }
 *         });
 *         
 *         // Generate signed URL (valid for 7 days)
 *         const [url] = await file.getSignedUrl({
 *           action: 'read',
 *           expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
 *         });
 *         
 *         // Update request with download URL
 *         await doc.ref.update({
 *           status: 'COMPLETED',
 *           downloadUrl: url,
 *           updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 *         });
 *         
 *         console.log(`GDPR export completed for user ${request.userId}`);
 *       } catch (error) {
 *         console.error(`Error processing export for ${request.userId}:`, error);
 *         await doc.ref.update({
 *           status: 'ERROR',
 *           updatedAt: admin.firestore.FieldValue.serverTimestamp(),
 *         });
 *       }
 *     }
 *   });
 */

export const INTEGRATION_NOTES = `
PACK 55 Integration Notes:

1. AGE VERIFICATION
   - Check before: swipe, chat, AI companions, creator features, marketplace
   - See Example 1, 3, 8

2. CSAM SCANNING
   - Trigger on all media uploads (PACK 47)
   - Filter flagged media from feeds (PACK 51)
   - See Example 5, 6

3. AML/KYC
   - Update on all token earnings (PACK 52)
   - Check before payouts (future packs)
   - See Example 4, 9

4. POLICIES
   - Gate app access until accepted
   - Re-check on policy version updates
   - See Example 7

5. GDPR
   - Provide self-service data export/erasure requests
   - Implement processing queue (future)
   - See Example 10

All integrations are non-breaking and backward compatible.
`;