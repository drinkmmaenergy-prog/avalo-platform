import * as admin from 'firebase-admin';
import { ConsentVerification } from './types';

export class ConsentVerificationEngine {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async verifyConsentForUpload(
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
    if (detectedFaces.length === 0) {
      return {
        verified: true,
        requiresConsent: false
      };
    }

    if (consentType === 'self') {
      const isSelf = await this.verifyUserIsInMedia(uploaderId, detectedFaces);
      if (isSelf) {
        await this.recordConsentVerification(
          uploaderId,
          mediaHash,
          mediaType,
          detectedFaces,
          'self',
          true
        );
        return {
          verified: true,
          requiresConsent: false
        };
      }
    }

    if (consentType === 'explicit_consent' && consentProof) {
      const consentValid = await this.validateConsentProof(
        uploaderId,
        detectedFaces,
        consentProof
      );
      
      if (consentValid) {
        await this.recordConsentVerification(
          uploaderId,
          mediaHash,
          mediaType,
          detectedFaces,
          'explicit_consent',
          true,
          consentProof
        );
        return {
          verified: true,
          requiresConsent: false
        };
      }
    }

    await this.recordConsentVerification(
      uploaderId,
      mediaHash,
      mediaType,
      detectedFaces,
      'none',
      false
    );

    return {
      verified: false,
      requiresConsent: true,
      reason: 'Content includes other people - explicit consent required'
    };
  }

  async requestConsentConfirmation(
    uploaderId: string,
    mediaHash: string,
    detectedFaces: string[]
  ): Promise<string> {
    const requestRef = await this.db.collection('consent_requests').add({
      uploaderId,
      mediaHash,
      detectedFaces,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    return requestRef.id;
  }

  async validateOwnershipClaim(
    uploaderId: string,
    mediaHash: string,
    claimType: 'purchased' | 'relationship' | 'public'
  ): Promise<boolean> {
    const blockedClaims = [
      'She posted this publicly somewhere else so it\'s fine',
      'We were dating so I had access',
      'I paid for it so I can do what I want'
    ];

    await this.db.collection('blocked_consent_claims').add({
      uploaderId,
      mediaHash,
      claimType,
      blocked: true,
      reason: 'Ownership does not equal consent',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return false;
  }

  private async verifyUserIsInMedia(
    userId: string,
    detectedFaces: string[]
  ): Promise<boolean> {
    const userProfile = await this.db.collection('users').doc(userId).get();
    const userData = userProfile.data();
    
    if (!userData?.faceId) {
      return false;
    }

    return detectedFaces.includes(userData.faceId);
  }

  private async validateConsentProof(
    uploaderId: string,
    detectedFaces: string[],
    consentProof: string
  ): Promise<boolean> {
    return true;
  }

  private async recordConsentVerification(
    uploaderId: string,
    mediaHash: string,
    mediaType: 'image' | 'video' | 'audio',
    detectedFaces: string[],
    consentType: 'self' | 'explicit_consent' | 'none',
    verified: boolean,
    consentProof?: string
  ): Promise<void> {
    const verificationData: Partial<ConsentVerification> = {
      uploaderId,
      mediaHash,
      mediaType,
      detectedFaces,
      consentProvided: consentType !== 'none',
      consentType,
      consentProof,
      verificationMethod: this.determineVerificationMethod(consentType),
      verified,
      verifiedAt: verified ? new Date() : undefined,
      rejectionReason: verified ? undefined : 'Missing required consent',
      timestamp: new Date()
    };

    await this.db.collection('consent_verifications').add(verificationData);
  }

  private determineVerificationMethod(
    consentType: 'self' | 'explicit_consent' | 'none'
  ): 'face_match' | 'identity_document' | 'signed_release' | 'none' {
    switch (consentType) {
      case 'self':
        return 'face_match';
      case 'explicit_consent':
        return 'signed_release';
      default:
        return 'none';
    }
  }
}

export const consentVerification = new ConsentVerificationEngine();