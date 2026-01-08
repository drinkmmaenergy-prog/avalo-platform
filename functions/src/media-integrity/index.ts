import * as admin from 'firebase-admin';
import { mediaIntegrityDetection } from './detection';
import { consentVerification } from './consent';
import { enforcement } from '../extortion/enforcement';
import {
  MediaIntegrityCase,
  MediaIntegrityAppeal,
  VictimIdentityShield,
  MediaIntegrityCaseStatus
} from './types';

export async function scanMediaForIntegrity(
  uploaderId: string,
  mediaUrl: string,
  mediaType: 'image' | 'video' | 'audio',
  metadata: any
): Promise<{
  allowed: boolean;
  violations: string[];
  caseId?: string;
  blockReason?: string;
}> {
  return await mediaIntegrityDetection.scanMediaForIntegrity(
    uploaderId,
    mediaUrl,
    mediaType,
    metadata
  );
}

export async function detectDeepfake(
  mediaUrl: string,
  mediaType: 'image' | 'video'
): Promise<{
  isDeepfake: boolean;
  confidence: number;
  artifacts: string[];
}> {
  const result = await mediaIntegrityDetection.detectDeepfake(mediaUrl, mediaType);
  return {
    isDeepfake: result.isDeepfake,
    confidence: result.confidence,
    artifacts: result.artifacts
  };
}

export async function detectVoiceClone(
  audioUrl: string
): Promise<{
  isCloned: boolean;
  confidence: number;
  artifacts: string[];
}> {
  const result = await mediaIntegrityDetection.detectVoiceClone(audioUrl);
  return {
    isCloned: result.isCloned,
    confidence: result.confidence,
    artifacts: result.artifacts
  };
}

export async function blockSyntheticMedia(
  uploaderId: string,
  mediaHash: string,
  violationType: string,
  caseId: string
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('synthetic_media_flags').add({
    uploaderId,
    mediaHash,
    violationType,
    caseId,
    blocked: true,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });

  await enforcement.applyUploadBlock(uploaderId, 'synthetic_media_detected');
}

export async function logMediaIntegrityCase(
  caseData: Partial<MediaIntegrityCase>
): Promise<string> {
  const db = admin.firestore();
  
  const caseRef = await db.collection('media_integrity_cases').add({
    ...caseData,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return caseRef.id;
}

export async function resolveMediaIntegrityCase(
  caseId: string,
  resolution: 'confirmed' | 'false_positive' | 'appeal_approved',
  resolvedBy: string,
  notes?: string
): Promise<void> {
  const db = admin.firestore();
  
  const status = resolution === 'confirmed' 
    ? MediaIntegrityCaseStatus.CONFIRMED
    : resolution === 'false_positive'
    ? MediaIntegrityCaseStatus.FALSE_POSITIVE
    : MediaIntegrityCaseStatus.APPEAL_APPROVED;

  await db.collection('media_integrity_cases').doc(caseId).update({
    status,
    resolvedBy,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolutionNotes: notes
  });

  if (resolution === 'false_positive' || resolution === 'appeal_approved') {
    const caseDoc = await db.collection('media_integrity_cases').doc(caseId).get();
    const caseData = caseDoc.data();
    
    if (caseData?.uploaderId) {
      await db.collection('users').doc(caseData.uploaderId).update({
        uploadRestricted: false,
        uploadRestrictionReason: admin.firestore.FieldValue.delete(),
        uploadRestrictedAt: admin.firestore.FieldValue.delete()
      });
    }
  }
}

export async function createMediaIntegrityAppeal(
  caseId: string,
  uploaderId: string,
  appealReason: string,
  evidence?: string[]
): Promise<string> {
  const db = admin.firestore();
  
  const appealData: Partial<MediaIntegrityAppeal> = {
    caseId,
    uploaderId,
    appealReason,
    evidence,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const appealRef = await db.collection('media_integrity_appeals').add(appealData);

  await db.collection('media_integrity_cases').doc(caseId).update({
    appealed: true,
    appealId: appealRef.id,
    status: MediaIntegrityCaseStatus.APPEALED,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return appealRef.id;
}

export async function processMediaIntegrityAppeal(
  appealId: string,
  decision: 'approved' | 'rejected',
  reviewedBy: string,
  reviewNotes: string
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection('media_integrity_appeals').doc(appealId).update({
    status: decision === 'approved' ? 'approved' : 'rejected',
    reviewedBy,
    reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewNotes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const appealDoc = await db.collection('media_integrity_appeals').doc(appealId).get();
  const appealData = appealDoc.data();

  if (appealData?.caseId) {
    if (decision === 'approved') {
      await resolveMediaIntegrityCase(
        appealData.caseId,
        'appeal_approved',
        reviewedBy,
        reviewNotes
      );
    } else {
      await db.collection('media_integrity_cases').doc(appealData.caseId).update({
        status: MediaIntegrityCaseStatus.APPEAL_REJECTED,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
}

export async function createVictimIdentityShield(
  victimId: string,
  protectionLevel: 'standard' | 'enhanced' | 'maximum'
): Promise<string> {
  const db = admin.firestore();
  
  const shieldData: Partial<VictimIdentityShield> = {
    victimId,
    protectionLevel,
    syntheticMediaBlocked: 0,
    attackersBlocked: [],
    casesOpened: [],
    notificationsEnabled: true,
    legalSupportEnabled: protectionLevel === 'maximum',
    mediaMonitoring: protectionLevel !== 'standard',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const shieldRef = await db.collection('victim_identity_shields').add(shieldData);

  await db.collection('users').doc(victimId).update({
    identityShieldActive: true,
    identityShieldLevel: protectionLevel,
    identityShieldId: shieldRef.id
  });

  return shieldRef.id;
}

export async function updateVictimIdentityShield(
  victimId: string,
  updates: {
    syntheticMediaBlocked?: number;
    attackersBlocked?: string[];
    casesOpened?: string[];
  }
): Promise<void> {
  const db = admin.firestore();
  
  const shields = await db
    .collection('victim_identity_shields')
    .where('victimId', '==', victimId)
    .get();

  if (!shields.empty) {
    const shieldDoc = shields.docs[0];
    await shieldDoc.ref.update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

export async function verifyMediaConsent(
  uploaderId: string,
  mediaHash: string,
  mediaType: 'image' | 'video' | 'audio',
  detectedFaces: string[],
  consentType: 'self' | 'explicit_consent' | 'none',
  consentProof?: string
): Promise<{
  verified: boolean;
  requiresConsent: boolean;
  reason?: string;
}> {
  return await consentVerification.verifyConsentForUpload(
    uploaderId,
    mediaHash,
    mediaType,
    detectedFaces,
    consentType,
    consentProof
  );
}

export * from './types';
export { mediaIntegrityDetection } from './detection';
export { consentVerification } from './consent';