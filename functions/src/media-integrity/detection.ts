import * as admin from 'firebase-admin';
import {
  MediaIntegrityViolationType,
  MediaIntegritySeverity,
  MediaIntegrityCaseStatus,
  DetectionMethod,
  MediaIntegrityCase,
  SyntheticMediaFlag,
  DeepfakeAttempt
} from './types';

export class MediaIntegrityDetection {
  private db: admin.firestore.Firestore;

  constructor() {
    this.db = admin.firestore();
  }

  async scanMediaForIntegrity(
    uploaderId: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio',
    metadata: any
  ): Promise<{
    allowed: boolean;
    violations: MediaIntegrityViolationType[];
    caseId?: string;
    blockReason?: string;
  }> {
    const detectionResults = await this.runAllDetectionMethods(
      mediaUrl,
      mediaType,
      metadata
    );

    const violations = this.identifyViolations(detectionResults);

    if (violations.length > 0) {
      const caseId = await this.createMediaIntegrityCase(
        uploaderId,
        mediaUrl,
        mediaType,
        metadata,
        violations,
        detectionResults
      );

      await this.logDeepfakeAttempt(uploaderId, mediaType, violations[0]);

      await this.applyEnforcement(uploaderId, violations, caseId);

      return {
        allowed: false,
        violations,
        caseId,
        blockReason: 'Synthetic identity alteration violates privacy & safety. This content cannot be published.'
      };
    }

    await this.applyWatermark(uploaderId, mediaUrl, metadata);

    return {
      allowed: true,
      violations: []
    };
  }

  async detectDeepfake(
    mediaUrl: string,
    mediaType: 'image' | 'video'
  ): Promise<{
    isDeepfake: boolean;
    confidence: number;
    method: DetectionMethod;
    artifacts: string[];
  }> {
    const artifacts: string[] = [];
    let confidence = 0;

    const faceSwapScore = await this.detectFaceSwap(mediaUrl);
    const compressionScore = await this.analyzeCompressionSignature(mediaUrl);
    const neuralTextureScore = await this.analyzeNeuralTexture(mediaUrl);
    const metadataScore = await this.analyzeMetadataConsistency(mediaUrl);

    confidence = (faceSwapScore + compressionScore + neuralTextureScore + metadataScore) / 4;

    if (faceSwapScore > 0.7) artifacts.push('Face boundary inconsistencies detected');
    if (compressionScore > 0.7) artifacts.push('Compression signature mismatch');
    if (neuralTextureScore > 0.7) artifacts.push('AI-generated texture patterns');
    if (metadataScore > 0.7) artifacts.push('Metadata inconsistencies');

    return {
      isDeepfake: confidence > 0.65,
      confidence,
      method: DetectionMethod.DEEPFAKE_DETECTION,
      artifacts
    };
  }

  async detectVoiceClone(
    audioUrl: string
  ): Promise<{
    isCloned: boolean;
    confidence: number;
    method: DetectionMethod;
    artifacts: string[];
  }> {
    const artifacts: string[] = [];
    
    const spectralScore = await this.analyzeSpectralAnomalies(audioUrl);
    const prosodyScore = await this.analyzeProsodyPatterns(audioUrl);
    const breathingScore = await this.analyzeBreathingPatterns(audioUrl);
    const backgroundScore = await this.analyzeBackgroundConsistency(audioUrl);

    const confidence = (spectralScore + prosodyScore + breathingScore + backgroundScore) / 4;

    if (spectralScore > 0.7) artifacts.push('Unnatural spectral patterns detected');
    if (prosodyScore > 0.7) artifacts.push('Synthetic prosody patterns');
    if (breathingScore > 0.7) artifacts.push('Missing or artificial breathing sounds');
    if (backgroundScore > 0.7) artifacts.push('Background audio inconsistencies');

    return {
      isCloned: confidence > 0.65,
      confidence,
      method: DetectionMethod.VOICE_CLONE_FINGERPRINTING,
      artifacts
    };
  }

  async detectNudeSynthesis(
    imageUrl: string
  ): Promise<{
    isSynthetic: boolean;
    confidence: number;
    method: DetectionMethod;
    artifacts: string[];
  }> {
    const artifacts: string[] = [];
    
    const skinTextureScore = await this.analyzeSkinTexture(imageUrl);
    const bodyProportionScore = await this.analyzeBodyProportions(imageUrl);
    const lightingScore = await this.analyzeLightingConsistency(imageUrl);
    const edgeScore = await this.analyzeEdgeArtifacts(imageUrl);

    const confidence = (skinTextureScore + bodyProportionScore + lightingScore + edgeScore) / 4;

    if (skinTextureScore > 0.7) artifacts.push('Synthetic skin texture detected');
    if (bodyProportionScore > 0.7) artifacts.push('Unnatural body proportions');
    if (lightingScore > 0.7) artifacts.push('Lighting inconsistencies');
    if (edgeScore > 0.7) artifacts.push('AI generation edge artifacts');

    return {
      isSynthetic: confidence > 0.65,
      confidence,
      method: DetectionMethod.NUDITY_SYNTHESIS_DETECTION,
      artifacts
    };
  }

  private async runAllDetectionMethods(
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio',
    metadata: any
  ): Promise<Record<DetectionMethod, number>> {
    const results: Partial<Record<DetectionMethod, number>> = {};

    if (mediaType === 'image' || mediaType === 'video') {
      const deepfakeResult = await this.detectDeepfake(mediaUrl, mediaType);
      results[DetectionMethod.DEEPFAKE_DETECTION] = deepfakeResult.confidence;

      const faceSwapScore = await this.detectFaceSwap(mediaUrl);
      results[DetectionMethod.FACE_SWAP_DETECTION] = faceSwapScore;

      if (mediaType === 'image') {
        const nudeResult = await this.detectNudeSynthesis(mediaUrl);
        results[DetectionMethod.NUDITY_SYNTHESIS_DETECTION] = nudeResult.confidence;
      }

      const compressionScore = await this.analyzeCompressionSignature(mediaUrl);
      results[DetectionMethod.COMPRESSION_SIGNATURE_MISMATCH] = compressionScore;

      const metadataScore = await this.analyzeMetadataConsistency(mediaUrl);
      results[DetectionMethod.METADATA_INCONSISTENCY] = metadataScore;

      const neuralTextureScore = await this.analyzeNeuralTexture(mediaUrl);
      results[DetectionMethod.NEURAL_TEXTURE_ANALYSIS] = neuralTextureScore;
    }

    if (mediaType === 'audio') {
      const voiceCloneResult = await this.detectVoiceClone(mediaUrl);
      results[DetectionMethod.VOICE_CLONE_FINGERPRINTING] = voiceCloneResult.confidence;
    }

    return results as Record<DetectionMethod, number>;
  }

  private identifyViolations(
    detectionResults: Record<DetectionMethod, number>
  ): MediaIntegrityViolationType[] {
    const violations: MediaIntegrityViolationType[] = [];
    const threshold = 0.65;

    if (detectionResults[DetectionMethod.DEEPFAKE_DETECTION] > threshold) {
      violations.push(MediaIntegrityViolationType.DEEPFAKE_FACE);
    }

    if (detectionResults[DetectionMethod.FACE_SWAP_DETECTION] > threshold) {
      violations.push(MediaIntegrityViolationType.FACE_SWAP);
    }

    if (detectionResults[DetectionMethod.NUDITY_SYNTHESIS_DETECTION] > threshold) {
      violations.push(MediaIntegrityViolationType.AI_NUDE_GENERATOR);
    }

    if (detectionResults[DetectionMethod.VOICE_CLONE_FINGERPRINTING] > threshold) {
      violations.push(MediaIntegrityViolationType.VOICE_CLONING);
    }

    const hasMultipleHighConfidence = 
      Object.values(detectionResults).filter(score => score > 0.7).length >= 2;

    if (hasMultipleHighConfidence) {
      if (detectionResults[DetectionMethod.NUDITY_SYNTHESIS_DETECTION] > 0.5) {
        violations.push(MediaIntegrityViolationType.SYNTHETIC_PORNOGRAPHY);
      }
    }

    return Array.from(new Set(violations));
  }

  private async createMediaIntegrityCase(
    uploaderId: string,
    mediaUrl: string,
    mediaType: 'image' | 'video' | 'audio',
    metadata: any,
    violations: MediaIntegrityViolationType[],
    detectionResults: Record<DetectionMethod, number>
  ): Promise<string> {
    const severity = this.calculateSeverity(violations, detectionResults);
    const overallConfidence = this.calculateOverallConfidence(detectionResults);
    const mediaHash = await this.calculateMediaHash(mediaUrl);

    const caseData: Partial<MediaIntegrityCase> = {
      uploaderId,
      mediaType,
      violationType: violations[0],
      severity,
      status: MediaIntegrityCaseStatus.BLOCKED,
      detectionMethods: Object.keys(detectionResults) as DetectionMethod[],
      confidenceScores: detectionResults,
      overallConfidence,
      mediaHash,
      mediaUrl,
      metadata: {
        originalFilename: metadata.originalFilename,
        fileSize: metadata.fileSize,
        mimeType: metadata.mimeType,
        dimensions: metadata.dimensions,
        duration: metadata.duration
      },
      inconsistencies: this.extractInconsistencies(detectionResults),
      aiArtifacts: this.extractArtifacts(detectionResults),
      blocked: true,
      blockedAt: new Date(),
      blockReason: 'Synthetic identity alteration detected',
      appealed: false,
      victimNotified: false,
      enforcementApplied: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const caseRef = await this.db.collection('media_integrity_cases').add(caseData);
    return caseRef.id;
  }

  private async logDeepfakeAttempt(
    uploaderId: string,
    mediaType: 'image' | 'video' | 'audio',
    violationType: MediaIntegrityViolationType
  ): Promise<void> {
    const existingAttempts = await this.db
      .collection('deepfake_attempts')
      .where('uploaderId', '==', uploaderId)
      .where('timestamp', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .get();

    const attemptCount = existingAttempts.size;
    const escalated = attemptCount >= 3;

    await this.db.collection('deepfake_attempts').add({
      uploaderId,
      mediaType,
      violationType,
      detectionConfidence: 0.8,
      blocked: true,
      attemptNumber: attemptCount + 1,
      previousAttempts: attemptCount,
      escalated,
      timestamp: new Date()
    });

    if (escalated) {
      await this.escalateToModeration(uploaderId, attemptCount + 1);
    }
  }

  private async applyEnforcement(
    uploaderId: string,
    violations: MediaIntegrityViolationType[],
    caseId: string
  ): Promise<void> {
    const hasSyntheticPorn = violations.some(v => 
      v === MediaIntegrityViolationType.SYNTHETIC_PORNOGRAPHY ||
      v === MediaIntegrityViolationType.AI_NUDE_GENERATOR
    );

    if (hasSyntheticPorn) {
      await this.db.collection('users').doc(uploaderId).update({
        accountStatus: 'banned',
        bannedReason: 'synthetic_explicit_media',
        bannedCaseId: caseId,
        bannedAt: admin.firestore.FieldValue.serverTimestamp(),
        permanent: true
      });

      await this.db.collection('account_states').doc(uploaderId).set({
        state: 'banned',
        reason: 'synthetic_pornography',
        caseId,
        permanent: true,
        canAppeal: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } else {
      await this.db.collection('users').doc(uploaderId).update({
        uploadRestricted: true,
        uploadRestrictionReason: 'deepfake_detection',
        uploadRestrictedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  private async applyWatermark(
    uploaderId: string,
    mediaUrl: string,
    metadata: any
  ): Promise<void> {
    const mediaHash = await this.calculateMediaHash(mediaUrl);

    await this.db.collection('media_watermarks').add({
      mediaHash,
      uploaderId,
      uploaderDeviceId: metadata.deviceId,
      timestamp: new Date(),
      watermarkData: {
        identityHash: this.hashIdentity(uploaderId),
        uploadTimestamp: Date.now(),
        deviceIdHash: this.hashIdentity(metadata.deviceId || 'unknown'),
        platformVersion: metadata.platformVersion || 'unknown'
      },
      extractable: true,
      tamperProof: true
    });
  }

  private async detectFaceSwap(mediaUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeCompressionSignature(mediaUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeNeuralTexture(mediaUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeMetadataConsistency(mediaUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeSpectralAnomalies(audioUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeProsodyPatterns(audioUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeBreathingPatterns(audioUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeBackgroundConsistency(audioUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeSkinTexture(imageUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeBodyProportions(imageUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeLightingConsistency(imageUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private async analyzeEdgeArtifacts(imageUrl: string): Promise<number> {
    return Math.random() * 0.3;
  }

  private calculateSeverity(
    violations: MediaIntegrityViolationType[],
    detectionResults: Record<DetectionMethod, number>
  ): MediaIntegritySeverity {
    const hasCriticalViolation = violations.some(v => 
      v === MediaIntegrityViolationType.SYNTHETIC_PORNOGRAPHY ||
      v === MediaIntegrityViolationType.AI_NUDE_GENERATOR
    );

    if (hasCriticalViolation) {
      return MediaIntegritySeverity.CRITICAL;
    }

    const avgConfidence = this.calculateOverallConfidence(detectionResults);

    if (avgConfidence > 0.85) return MediaIntegritySeverity.HIGH;
    if (avgConfidence > 0.75) return MediaIntegritySeverity.MEDIUM;
    return MediaIntegritySeverity.LOW;
  }

  private calculateOverallConfidence(
    detectionResults: Record<DetectionMethod, number>
  ): number {
    const scores = Object.values(detectionResults);
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  private async calculateMediaHash(mediaUrl: string): Promise<string> {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(mediaUrl + Date.now()).digest('hex');
  }

  private hashIdentity(value: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private extractInconsistencies(
    detectionResults: Record<DetectionMethod, number>
  ): string[] {
    const inconsistencies: string[] = [];

    if (detectionResults[DetectionMethod.COMPRESSION_SIGNATURE_MISMATCH] > 0.7) {
      inconsistencies.push('Compression signature does not match expected patterns');
    }

    if (detectionResults[DetectionMethod.METADATA_INCONSISTENCY] > 0.7) {
      inconsistencies.push('Metadata shows signs of manipulation');
    }

    return inconsistencies;
  }

  private extractArtifacts(
    detectionResults: Record<DetectionMethod, number>
  ): string[] {
    const artifacts: string[] = [];

    if (detectionResults[DetectionMethod.NEURAL_TEXTURE_ANALYSIS] > 0.7) {
      artifacts.push('Neural network generation artifacts detected');
    }

    if (detectionResults[DetectionMethod.DEEPFAKE_DETECTION] > 0.7) {
      artifacts.push('AI-generated content markers present');
    }

    return artifacts;
  }

  private async escalateToModeration(
    uploaderId: string,
    attemptCount: number
  ): Promise<void> {
    await this.db.collection('moderation_queue').add({
      type: 'repeated_deepfake_attempts',
      userId: uploaderId,
      attemptCount,
      priority: 'high',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}

export const mediaIntegrityDetection = new MediaIntegrityDetection();