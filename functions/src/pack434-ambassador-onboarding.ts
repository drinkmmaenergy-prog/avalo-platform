/**
 * PACK 434 — Global Ambassador Program & Offline Partner Expansion Engine
 * Ambassador Onboarding Engine
 * 
 * Handles application, approval, contracts, and training
 */

import { firestore } from 'firebase-admin';
import {
  AmbassadorProfile,
  AmbassadorRole,
  AmbassadorTier,
  AmbassadorStatus,
  ambassadorTypeService,
  REGIONAL_CONFIGS,
} from './pack434-ambassador-types';

// ============================================================================
// APPLICATION TYPES
// ============================================================================

export interface AmbassadorApplication {
  id: string;
  userId: string;
  role: AmbassadorRole;
  status: 'pending' | 'approved' | 'rejected';
  
  // Applicant information
  personalInfo: {
    fullName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    address: {
      street: string;
      city: string;
      state?: string;
      country: string;
      postalCode: string;
    };
  };
  
  // Regional preference
  targetRegion: {
    country: string;
    city: string;
    state?: string;
  };
  
  // Experience
  experience: {
    hasEventExperience: boolean;
    eventTypes?: string[];
    hasSalesExperience: boolean;
    hasMarketingExperience: boolean;
    previousAmbassadorRoles?: string[];
    socialMediaFollowing?: {
      platform: string;
      handle: string;
      followers: number;
    }[];
  };
  
  // Motivation
  motivation: string;
  availability: 'full-time' | 'part-time' | 'weekends' | 'flexible';
  
  // Background checks
  backgroundCheck?: {
    status: 'pending' | 'passed' | 'failed';
    provider: string;
    completedAt?: firestore.Timestamp;
    reportUrl?: string;
  };
  
  // ID verification
  idVerification?: {
    status: 'pending' | 'verified' | 'failed';
    provider: string;
    documentType: string;
    completedAt?: firestore.Timestamp;
  };
  
  // Review
  reviewedBy?: string;
  reviewNotes?: string;
  rejectionReason?: string;
  
  // Timestamps
  submittedAt: firestore.Timestamp;
  reviewedAt?: firestore.Timestamp;
}

export interface OnboardingContract {
  id: string;
  ambassadorId: string;
  templateId: string;
  
  // Contract details
  terms: {
    duration: number; // months
    exclusivity: boolean;
    territory: string;
    compensation: any; // From AmbassadorProfile
    termination: {
      noticePeriod: number; // days
      conditions: string[];
    };
  };
  
  // Legal
  legalEntity: string;
  jurisdiction: string;
  documentUrl: string;
  
  // Signatures
  ambassadorSignature?: {
    signedAt: firestore.Timestamp;
    ipAddress: string;
    userAgent: string;
  };
  
  companySignature?: {
    signedBy: string;
    signedAt: firestore.Timestamp;
  };
  
  status: 'draft' | 'sent' | 'signed' | 'countersigned' | 'active' | 'terminated';
  
  createdAt: firestore.Timestamp;
  expiresAt?: firestore.Timestamp;
}

export interface TrainingModule {
  id: string;
  title: string;
  description: string;
  type: 'video' | 'document' | 'quiz' | 'interactive';
  duration: number; // minutes
  required: boolean;
  requiredForTier?: AmbassadorTier[];
  content: {
    url: string;
    metadata?: any;
  };
  quiz?: {
    questions: QuizQuestion[];
    passingScore: number;
  };
  order: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer';
  options?: string[];
  correctAnswer: string | number;
  explanation?: string;
}

export interface TrainingProgress {
  ambassadorId: string;
  moduleId: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'failed';
  startedAt?: firestore.Timestamp;
  completedAt?: firestore.Timestamp;
  quizScore?: number;
  attempts: number;
  certificateUrl?: string;
}

// ============================================================================
// ONBOARDING SERVICE
// ============================================================================

export class AmbassadorOnboardingService {
  private db: firestore.Firestore;

  constructor(db: firestore.Firestore) {
    this.db = db;
  }

  /**
   * Submit ambassador application
   */
  async submitApplication(
    userId: string,
    data: Omit<AmbassadorApplication, 'id' | 'userId' | 'status' | 'submittedAt'>
  ): Promise<AmbassadorApplication> {
    const application: AmbassadorApplication = {
      ...data,
      id: this.db.collection('ambassador_applications').doc().id,
      userId,
      status: 'pending',
      submittedAt: firestore.Timestamp.now(),
    };

    // Check if already an ambassador
    const existingAmbassador = await this.db
      .collection('ambassadors')
      .where('userId', '==', userId)
      .where('status', 'in', ['active', 'approved'])
      .get();

    if (!existingAmbassador.empty) {
      throw new Error('User is already an active ambassador');
    }

    // Check if already applied
    const existingApplication = await this.db
      .collection('ambassador_applications')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .get();

    if (!existingApplication.empty) {
      throw new Error('Application already pending');
    }

    // Validate regional capacity
    await this.validateRegionalCapacity(data.targetRegion, data.role);

    // Save application
    await this.db.collection('ambassador_applications').doc(application.id).set(application);

    // Auto-initiate background check if required
    const regionalConfig = ambassadorTypeService.getRegionalConfig(data.targetRegion.country);
    if (regionalConfig.requiresBackgroundCheck) {
      await this.initiateBackgroundCheck(application.id);
    }

    // Auto-initiate ID verification
    if (regionalConfig.requiresIdVerification) {
      await this.initiateIdVerification(application.id);
    }

    // Check for auto-approval
    await this.checkAutoApproval(application.id);

    return application;
  }

  /**
   * Validate regional capacity
   */
  private async validateRegionalCapacity(
    region: { country: string; city: string; state?: string },
    role: AmbassadorRole
  ): Promise<void> {
    const regionalConfig = ambassadorTypeService.getRegionalConfig(region.country);

    const existingAmbassadors = await this.db
      .collection('ambassadors')
      .where('region.country', '==', region.country)
      .where('region.city', '==', region.city)
      .where('role', '==', role)
      .where('status', 'in', ['active', 'approved'])
      .get();

    if (existingAmbassadors.size >= regionalConfig.maxAmbassadorsPerCity) {
      throw new Error(`Maximum ambassadors reached for ${region.city}, ${region.country}`);
    }
  }

  /**
   * Initiate background check
   */
  private async initiateBackgroundCheck(applicationId: string): Promise<void> {
    // Integration with background check provider (e.g., Checkr, Sterling)
    // This is a placeholder - implement actual provider integration
    
    await this.db
      .collection('ambassador_applications')
      .doc(applicationId)
      .update({
        'backgroundCheck.status': 'pending',
        'backgroundCheck.provider': 'checkr',
      });

    // In production, this would trigger external API call
    console.log(`Background check initiated for application ${applicationId}`);
  }

  /**
   * Initiate ID verification
   */
  private async initiateIdVerification(applicationId: string): Promise<void> {
    // Integration with ID verification provider (e.g., Onfido, Jumio)
    // This is a placeholder - implement actual provider integration
    
    await this.db
      .collection('ambassador_applications')
      .doc(applicationId)
      .update({
        'idVerification.status': 'pending',
        'idVerification.provider': 'onfido',
      });

    console.log(`ID verification initiated for application ${applicationId}`);
  }

  /**
   * Check auto-approval criteria
   */
  private async checkAutoApproval(applicationId: string): Promise<void> {
    const appDoc = await this.db.collection('ambassador_applications').doc(applicationId).get();
    const application = appDoc.data() as AmbassadorApplication;

    // Auto-approval rules for small tiers
    const autoApproveRoles = [
      AmbassadorRole.CAMPUS_AMBASSADOR,
      AmbassadorRole.COMMUNITY_AMBASSADOR,
    ];

    if (!autoApproveRoles.includes(application.role)) {
      return; // Manual approval required
    }

    // Check if background check passed (if required)
    const regionalConfig = ambassadorTypeService.getRegionalConfig(
      application.targetRegion.country
    );

    if (regionalConfig.requiresBackgroundCheck) {
      if (application.backgroundCheck?.status !== 'passed') {
        return; // Wait for background check
      }
    }

    // Check if ID verification passed
    if (regionalConfig.requiresIdVerification) {
      if (application.idVerification?.status !== 'verified') {
        return; // Wait for ID verification
      }
    }

    // Auto-approve
    await this.approveApplication(applicationId, 'system', 'Auto-approved based on criteria');
  }

  /**
   * Approve application
   */
  async approveApplication(
    applicationId: string,
    reviewerId: string,
    notes?: string
  ): Promise<AmbassadorProfile> {
    const appDoc = await this.db.collection('ambassador_applications').doc(applicationId).get();
    
    if (!appDoc.exists) {
      throw new Error('Application not found');
    }

    const application = appDoc.data() as AmbassadorApplication;

    if (application.status !== 'pending') {
      throw new Error('Application already processed');
    }

    // Create ambassador profile
    const ambassadorProfile = await this.createAmbassadorProfile(application);

    // Update application
    await this.db.collection('ambassador_applications').doc(applicationId).update({
      status: 'approved',
      reviewedBy: reviewerId,
      reviewNotes: notes,
      reviewedAt: firestore.Timestamp.now(),
    });

    // Generate contract
    await this.generateContract(ambassadorProfile.id);

    // Assign initial training modules
    await this.assignTrainingModules(ambassadorProfile.id);

    // Send welcome notification
    await this.sendWelcomeNotification(ambassadorProfile.userId);

    return ambassadorProfile;
  }

  /**
   * Reject application
   */
  async rejectApplication(
    applicationId: string,
    reviewerId: string,
    reason: string
  ): Promise<void> {
    await this.db.collection('ambassador_applications').doc(applicationId).update({
      status: 'rejected',
      reviewedBy: reviewerId,
      rejectionReason: reason,
      reviewedAt: firestore.Timestamp.now(),
    });

    // Send rejection notification
    const appDoc = await this.db.collection('ambassador_applications').doc(applicationId).get();
    const application = appDoc.data() as AmbassadorApplication;
    await this.sendRejectionNotification(application.userId, reason);
  }

  /**
   * Create ambassador profile
   */
  private async createAmbassadorProfile(
    application: AmbassadorApplication
  ): Promise<AmbassadorProfile> {
    const referralCode = ambassadorTypeService.generateReferralCode(
      application.userId,
      application.role
    );

    const regionalConfig = ambassadorTypeService.getRegionalConfig(
      application.targetRegion.country
    );

    const profile: AmbassadorProfile = {
      id: this.db.collection('ambassadors').doc().id,
      userId: application.userId,
      role: application.role,
      tier: AmbassadorTier.BRONZE,
      status: AmbassadorStatus.APPROVED,
      region: {
        country: application.targetRegion.country,
        city: application.targetRegion.city,
        state: application.targetRegion.state,
      },
      referralCode,
      qrCode: `https://avalo.app/r/${referralCode}`,
      digitalIdCard: `https://avalo.app/id/${profile.id}`,
      kpis: ambassadorTypeService.getDefaultKPIs(application.role),
      compensation: {
        cpi: 2.0 * regionalConfig.multiplier,
        cpa: 10.0 * regionalConfig.multiplier,
        cps: 50.0 * regionalConfig.multiplier,
        revShare: 0.02, // 2%
        revShareDuration: 12, // months
        tierMultiplier: 1.0,
        regionalMultiplier: regionalConfig.multiplier,
      },
      createdAt: firestore.Timestamp.now(),
      approvedAt: firestore.Timestamp.now(),
      certifications: [],
      performance: {
        totalReferrals: 0,
        verifiedReferrals: 0,
        creatorsRecruited: 0,
        eventsHosted: 0,
        revenue: 0,
        rating: 0,
      },
    };

    await this.db.collection('ambassadors').doc(profile.id).set(profile);

    return profile;
  }

  /**
   * Generate contract
   */
  private async generateContract(ambassadorId: string): Promise<OnboardingContract> {
    const ambassadorDoc = await this.db.collection('ambassadors').doc(ambassadorId).get();
    const ambassador = ambassadorDoc.data() as AmbassadorProfile;

    const contract: OnboardingContract = {
      id: this.db.collection('ambassador_contracts').doc().id,
      ambassadorId,
      templateId: `template_${ambassador.role}`,
      terms: {
        duration: 12, // 12 months
        exclusivity: false,
        territory: `${ambassador.region.city}, ${ambassador.region.country}`,
        compensation: ambassador.compensation,
        termination: {
          noticePeriod: 30,
          conditions: [
            'Breach of terms',
            'Fraudulent activity',
            'Performance below minimum KPIs for 3 consecutive months',
            'Voluntary resignation with notice',
          ],
        },
      },
      legalEntity: 'Avalo Inc.',
      jurisdiction: ambassador.region.country,
      documentUrl: '', // Generated by document service
      status: 'draft',
      createdAt: firestore.Timestamp.now(),
    };

    await this.db.collection('ambassador_contracts').doc(contract.id).set(contract);

    // Update ambassador with contract reference
    await this.db.collection('ambassadors').doc(ambassadorId).update({
      contractUrl: contract.documentUrl,
    });

    return contract;
  }

  /**
   * Sign contract
   */
  async signContract(
    contractId: string,
    ambassadorId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    const contractDoc = await this.db.collection('ambassador_contracts').doc(contractId).get();
    
    if (!contractDoc.exists) {
      throw new Error('Contract not found');
    }

    const contract = contractDoc.data() as OnboardingContract;

    if (contract.ambassadorId !== ambassadorId) {
      throw new Error('Unauthorized');
    }

    if (contract.status !== 'draft' && contract.status !== 'sent') {
      throw new Error('Contract already signed');
    }

    await this.db.collection('ambassador_contracts').doc(contractId).update({
      ambassadorSignature: {
        signedAt: firestore.Timestamp.now(),
        ipAddress,
        userAgent,
      },
      status: 'signed',
    });

    // Update ambassador status
    await this.db.collection('ambassadors').doc(ambassadorId).update({
      contractSigned: true,
      contractSignedAt: firestore.Timestamp.now(),
      status: AmbassadorStatus.ACTIVE,
    });
  }

  /**
   * Assign training modules
   */
  private async assignTrainingModules(ambassadorId: string): Promise<void> {
    const ambassadorDoc = await this.db.collection('ambassadors').doc(ambassadorId).get();
    const ambassador = ambassadorDoc.data() as AmbassadorProfile;

    // Get required training modules for role
    const modules = await this.db
      .collection('training_modules')
      .where('required', '==', true)
      .get();

    const batch = this.db.batch();

    for (const moduleDoc of modules.docs) {
      const module = moduleDoc.data() as TrainingModule;
      
      // Check if module is required for this tier
      if (module.requiredForTier && !module.requiredForTier.includes(ambassador.tier)) {
        continue;
      }

      const progressId = `${ambassadorId}_${module.id}`;
      const progress: TrainingProgress = {
        ambassadorId,
        moduleId: module.id,
        status: 'not-started',
        attempts: 0,
      };

      batch.set(this.db.collection('training_progress').doc(progressId), progress);
    }

    await batch.commit();
  }

  /**
   * Complete training module
   */
  async completeTrainingModule(
    ambassadorId: string,
    moduleId: string,
    quizAnswers?: any
  ): Promise<void> {
    const progressId = `${ambassadorId}_${moduleId}`;
    const progressDoc = await this.db.collection('training_progress').doc(progressId).get();

    if (!progressDoc.exists) {
      throw new Error('Training progress not found');
    }

    const progress = progressDoc.data() as TrainingProgress;
    const moduleDoc = await this.db.collection('training_modules').doc(moduleId).get();
    const module = moduleDoc.data() as TrainingModule;

    let passed = true;
    let score = 100;

    // Grade quiz if present
    if (module.quiz && quizAnswers) {
      const result = this.gradeQuiz(module.quiz, quizAnswers);
      score = result.score;
      passed = result.score >= module.quiz.passingScore;
    }

    const updateData: Partial<TrainingProgress> = {
      attempts: progress.attempts + 1,
      quizScore: score,
    };

    if (passed) {
      updateData.status = 'completed';
      updateData.completedAt = firestore.Timestamp.now();

      // Add certification to ambassador
      await this.db.collection('ambassadors').doc(ambassadorId).update({
        certifications: firestore.FieldValue.arrayUnion(moduleId),
      });
    } else {
      updateData.status = 'failed';
    }

    await this.db.collection('training_progress').doc(progressId).update(updateData);
  }

  /**
   * Grade quiz
   */
  private gradeQuiz(
    quiz: { questions: QuizQuestion[]; passingScore: number },
    answers: Record<string, any>
  ): { score: number; results: any[] } {
    let correct = 0;
    const results = [];

    for (const question of quiz.questions) {
      const userAnswer = answers[question.id];
      const isCorrect = userAnswer === question.correctAnswer;
      
      if (isCorrect) {
        correct++;
      }

      results.push({
        questionId: question.id,
        correct: isCorrect,
        userAnswer,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      });
    }

    const score = (correct / quiz.questions.length) * 100;

    return { score, results };
  }

  /**
   * Send welcome notification
   */
  private async sendWelcomeNotification(userId: string): Promise<void> {
    await this.db.collection('notifications').add({
      userId,
      type: 'ambassador_welcome',
      title: 'Welcome to Avalo Ambassador Program!',
      body: 'Your application has been approved. Complete your contract and training to get started.',
      data: {
        action: 'open_ambassador_dashboard',
      },
      createdAt: firestore.Timestamp.now(),
      read: false,
    });
  }

  /**
   * Send rejection notification
   */
  private async sendRejectionNotification(userId: string, reason: string): Promise<void> {
    await this.db.collection('notifications').add({
      userId,
      type: 'ambassador_rejection',
      title: 'Ambassador Application Update',
      body: `Unfortunately, your application was not approved. Reason: ${reason}`,
      createdAt: firestore.Timestamp.now(),
      read: false,
    });
  }
}

// ============================================================================
// EXPORT FACTORY
// ============================================================================

export function createAmbassadorOnboardingService(
  db: firestore.Firestore
): AmbassadorOnboardingService {
  return new AmbassadorOnboardingService(db);
}
