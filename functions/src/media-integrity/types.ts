export enum MediaIntegrityViolationType {
  DEEPFAKE_FACE = 'deepfake_face',
  AI_NUDE_GENERATOR = 'ai_nude_generator',
  SYNTHETIC_PORNOGRAPHY = 'synthetic_pornography',
  VOICE_CLONING = 'voice_cloning',
  IDENTITY_MORPHING = 'identity_morphing',
  EVIDENCE_FABRICATION = 'evidence_fabrication',
  FAKE_CONFESSION_AUDIO = 'fake_confession_audio',
  FACE_SWAP = 'face_swap',
  DEEPFAKE_VIDEO = 'deepfake_video'
}

export enum MediaIntegritySeverity {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3
}

export enum MediaIntegrityCaseStatus {
  DETECTED = 'detected',
  BLOCKED = 'blocked',
  UNDER_REVIEW = 'under_review',
  CONFIRMED = 'confirmed',
  FALSE_POSITIVE = 'false_positive',
  APPEALED = 'appealed',
  APPEAL_APPROVED = 'appeal_approved',
  APPEAL_REJECTED = 'appeal_rejected'
}

export enum DetectionMethod {
  DEEPFAKE_DETECTION = 'deepfake_detection',
  FACE_SWAP_DETECTION = 'face_swap_detection',
  NUDITY_SYNTHESIS_DETECTION = 'nudity_synthesis_detection',
  VOICE_CLONE_FINGERPRINTING = 'voice_clone_fingerprinting',
  COMPRESSION_SIGNATURE_MISMATCH = 'compression_signature_mismatch',
  METADATA_INCONSISTENCY = 'metadata_inconsistency',
  AI_ARTIFACT_DETECTION = 'ai_artifact_detection',
  NEURAL_TEXTURE_ANALYSIS = 'neural_texture_analysis'
}

export interface MediaIntegrityCase {
  caseId: string;
  uploaderId: string;
  uploaderDeviceId?: string;
  uploaderIP?: string;
  mediaType: 'image' | 'video' | 'audio';
  violationType: MediaIntegrityViolationType;
  severity: MediaIntegritySeverity;
  status: MediaIntegrityCaseStatus;
  detectionMethods: DetectionMethod[];
  confidenceScores: Record<DetectionMethod, number>;
  overallConfidence: number;
  mediaHash: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  detectedFaces?: string[];
  potentialVictimIds?: string[];
  metadata: {
    originalFilename?: string;
    fileSize: number;
    mimeType: string;
    dimensions?: { width: number; height: number };
    duration?: number;
    creationDate?: Date;
    modificationDate?: Date;
    cameraModel?: string;
    softwareUsed?: string;
  };
  inconsistencies: string[];
  aiArtifacts: string[];
  blocked: boolean;
  blockedAt?: Date;
  blockReason: string;
  appealId?: string;
  appealed: boolean;
  victimNotified: boolean;
  victimIds?: string[];
  enforcementApplied: boolean;
  enforcementActions?: string[];
  reportedBy?: string;
  reportReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyntheticMediaFlag {
  flagId: string;
  uploaderId: string;
  mediaHash: string;
  mediaType: 'image' | 'video' | 'audio';
  violationType: MediaIntegrityViolationType;
  detectionMethod: DetectionMethod;
  confidence: number;
  flagged: boolean;
  caseCreated: boolean;
  caseId?: string;
  timestamp: Date;
}

export interface DeepfakeAttempt {
  attemptId: string;
  uploaderId: string;
  uploaderDeviceId?: string;
  uploaderIP?: string;
  mediaType: 'image' | 'video' | 'audio';
  violationType: MediaIntegrityViolationType;
  detectionConfidence: number;
  blocked: boolean;
  attemptNumber: number;
  previousAttempts: number;
  escalated: boolean;
  timestamp: Date;
}

export interface MediaWatermark {
  watermarkId: string;
  mediaHash: string;
  uploaderId: string;
  uploaderDeviceId?: string;
  timestamp: Date;
  watermarkData: {
    identityHash: string;
    uploadTimestamp: number;
    deviceIdHash: string;
    platformVersion: string;
  };
  extractable: boolean;
  tamperProof: boolean;
}

export interface ConsentVerification {
  verificationId: string;
  uploaderId: string;
  mediaHash: string;
  mediaType: 'image' | 'video' | 'audio';
  detectedFaces: string[];
  consentProvided: boolean;
  consentType: 'self' | 'explicit_consent' | 'none';
  consentProof?: string;
  verificationMethod: 'face_match' | 'identity_document' | 'signed_release' | 'none';
  verified: boolean;
  verifiedAt?: Date;
  rejectionReason?: string;
  timestamp: Date;
}

export interface MediaIntegrityAppeal {
  appealId: string;
  caseId: string;
  uploaderId: string;
  appealReason: string;
  evidence?: string[];
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  resolution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VictimIdentityShield {
  shieldId: string;
  victimId: string;
  protectionLevel: 'standard' | 'enhanced' | 'maximum';
  syntheticMediaBlocked: number;
  attackersBlocked: string[];
  casesOpened: string[];
  notificationsEnabled: boolean;
  legalSupportEnabled: boolean;
  mediaMonitoring: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaIntegrityStatistics {
  date: string;
  totalScans: number;
  detections: number;
  blocked: number;
  byViolationType: Record<MediaIntegrityViolationType, number>;
  byMediaType: Record<'image' | 'video' | 'audio', number>;
  appeals: number;
  appealsApproved: number;
  appealsRejected: number;
  falsePositives: number;
  averageConfidence: number;
  victimProtections: number;
}