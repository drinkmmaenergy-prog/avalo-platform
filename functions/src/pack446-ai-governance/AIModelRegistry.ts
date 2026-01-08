/**
 * PACK 446: AI Governance, Explainability & Model Risk Control
 * Module: AI Model Registry & Lifecycle Control
 * 
 * Central registry for all AI/ML models with lifecycle management,
 * ownership tracking, and risk assessment.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';

export enum ModelType {
  ML = 'ML',
  LLM = 'LLM',
  HYBRID = 'HYBRID',
  RULE_BASED = 'RULE_BASED'
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export enum ModelStatus {
  DEVELOPMENT = 'DEVELOPMENT',
  TESTING = 'TESTING',
  STAGING = 'STAGING',
  PRODUCTION = 'PRODUCTION',
  DEPRECATED = 'DEPRECATED',
  DISABLED = 'DISABLED',
  ROLLED_BACK = 'ROLLED_BACK'
}

export interface DecisionScope {
  domain: string;              // e.g., 'pricing', 'content_moderation', 'recommendations'
  impactLevel: 'USER' | 'FINANCIAL' | 'SAFETY' | 'CONTENT';
  automatedDecision: boolean;  // GDPR Article 22 flag
  humanInLoop: boolean;
}

export interface ModelMetadata {
  modelId: string;
  name: string;
  type: ModelType;
  version: string;
  previousVersion?: string;
  
  // Ownership & Accountability
  owner: string;                // userId or team
  ownerEmail: string;
  technicalContact: string;
  
  // Decision Context
  decisionScope: DecisionScope;
  riskLevel: RiskLevel;
  
  // Lifecycle
  status: ModelStatus;
  deployedAt?: Date;
  lastTestedAt?: Date;
  nextReviewDue?: Date;
  
  // Documentation
  description: string;
  trainingDataSummary?: string;
  performanceMetrics?: Record<string, number>;
  limitations?: string[];
  
  // Compliance
  gdprCompliant: boolean;
  euAiActCategory?: 'PROHIBITED' | 'HIGH_RISK' | 'LIMITED_RISK' | 'MINIMAL_RISK';
  regulatoryApprovals?: string[];
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
  deploymentHistory: DeploymentRecord[];
}

export interface DeploymentRecord {
  version: string;
  deployedAt: Date;
  deployedBy: string;
  rollbackAt?: Date;
  rollbackReason?: string;
  performanceSnapshot?: Record<string, number>;
}

export class AIModelRegistry {
  private db: FirebaseFirestore.Firestore;
  private readonly COLLECTION = 'ai_model_registry';

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  /**
   * Register a new AI model in the registry
   */
  async registerModel(model: Omit<ModelMetadata, 'createdAt' | 'updatedAt' | 'deploymentHistory'>): Promise<string> {
    try {
      const docRef = this.db.collection(this.COLLECTION).doc(model.modelId);
      
      // Check if model already exists
      const existing = await docRef.get();
      if (existing.exists) {
        throw new Error(`Model ${model.modelId} already registered`);
      }

      const now = new Date();
      const fullModel: ModelMetadata = {
        ...model,
        createdAt: now,
        updatedAt: now,
        deploymentHistory: []
      };

      await docRef.set(fullModel);
      
      logger.info(`[AIModelRegistry] Model registered: ${model.modelId} v${model.version}`);
      
      // Log to audit trail (PACK 296)
      await this.logAuditEvent('MODEL_REGISTERED', model.modelId, {
        version: model.version,
        owner: model.owner,
        riskLevel: model.riskLevel
      });

      return model.modelId;
    } catch (error) {
      logger.error('[AIModelRegistry] Registration failed:', error);
      throw error;
    }
  }

  /**
   * Update model metadata
   */
  async updateModel(modelId: string, updates: Partial<ModelMetadata>): Promise<void> {
    try {
      const docRef = this.db.collection(this.COLLECTION).doc(modelId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error(`Model ${modelId} not found`);
      }

      await docRef.update({
        ...updates,
        updatedAt: new Date()
      });

      logger.info(`[AIModelRegistry] Model updated: ${modelId}`);
      
      await this.logAuditEvent('MODEL_UPDATED', modelId, updates);
    } catch (error) {
      logger.error('[AIModelRegistry] Update failed:', error);
      throw error;
    }
  }

  /**
   * Deploy a new version of a model
   */
  async deployVersion(
    modelId: string,
    version: string,
    deployedBy: string,
    performanceMetrics?: Record<string, number>
  ): Promise<void> {
    try {
      const docRef = this.db.collection(this.COLLECTION).doc(modelId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error(`Model ${modelId} not found`);
      }

      const currentData = doc.data() as ModelMetadata;
      const now = new Date();

      const deploymentRecord: DeploymentRecord = {
        version,
        deployedAt: now,
        deployedBy,
        performanceSnapshot: performanceMetrics
      };

      await docRef.update({
        version,
        previousVersion: currentData.version,
        status: ModelStatus.PRODUCTION,
        deployedAt: now,
        updatedAt: now,
        deploymentHistory: admin.firestore.FieldValue.arrayUnion(deploymentRecord)
      });

      logger.info(`[AIModelRegistry] Model deployed: ${modelId} v${version}`);
      
      await this.logAuditEvent('MODEL_DEPLOYED', modelId, {
        version,
        previousVersion: currentData.version,
        deployedBy
      });
    } catch (error) {
      logger.error('[AIModelRegistry] Deployment failed:', error);
      throw error;
    }
  }

  /**
   * Rollback to previous version
   */
  async rollbackModel(modelId: string, reason: string, rolledBackBy: string): Promise<void> {
    try {
      const docRef = this.db.collection(this.COLLECTION).doc(modelId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        throw new Error(`Model ${modelId} not found`);
      }

      const currentData = doc.data() as ModelMetadata;
      
      if (!currentData.previousVersion) {
        throw new Error('No previous version available for rollback');
      }

      const now = new Date();

      // Update the last deployment record with rollback info
      const updatedHistory = [...currentData.deploymentHistory];
      if (updatedHistory.length > 0) {
        updatedHistory[updatedHistory.length - 1].rollbackAt = now;
        updatedHistory[updatedHistory.length - 1].rollbackReason = reason;
      }

      await docRef.update({
        version: currentData.previousVersion,
        previousVersion: currentData.version,
        status: ModelStatus.ROLLED_BACK,
        updatedAt: now,
        deploymentHistory: updatedHistory
      });

      logger.warn(`[AIModelRegistry] Model rolled back: ${modelId} to v${currentData.previousVersion}`);
      
      await this.logAuditEvent('MODEL_ROLLBACK', modelId, {
        fromVersion: currentData.version,
        toVersion: currentData.previousVersion,
        reason,
        rolledBackBy
      });
    } catch (error) {
      logger.error('[AIModelRegistry] Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Get model by ID
   */
  async getModel(modelId: string): Promise<ModelMetadata | null> {
    try {
      const doc = await this.db.collection(this.COLLECTION).doc(modelId).get();
      return doc.exists ? doc.data() as ModelMetadata : null;
    } catch (error) {
      logger.error('[AIModelRegistry] Get model failed:', error);
      throw error;
    }
  }

  /**
   * List all models with optional filters
   */
  async listModels(filters?: {
    type?: ModelType;
    status?: ModelStatus;
    riskLevel?: RiskLevel;
    owner?: string;
  }): Promise<ModelMetadata[]> {
    try {
      let query: FirebaseFirestore.Query = this.db.collection(this.COLLECTION);

      if (filters?.type) {
        query = query.where('type', '==', filters.type);
      }
      if (filters?.status) {
        query = query.where('status', '==', filters.status);
      }
      if (filters?.riskLevel) {
        query = query.where('riskLevel', '==', filters.riskLevel);
      }
      if (filters?.owner) {
        query = query.where('owner', '==', filters.owner);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => doc.data() as ModelMetadata);
    } catch (error) {
      logger.error('[AIModelRegistry] List models failed:', error);
      throw error;
    }
  }

  /**
   * Get models requiring review
   */
  async getModelsRequiringReview(): Promise<ModelMetadata[]> {
    try {
      const now = new Date();
      const snapshot = await this.db.collection(this.COLLECTION)
        .where('nextReviewDue', '<=', now)
        .where('status', '==', ModelStatus.PRODUCTION)
        .get();

      return snapshot.docs.map(doc => doc.data() as ModelMetadata);
    } catch (error) {
      logger.error('[AIModelRegistry] Get review models failed:', error);
      throw error;
    }
  }

  /**
   * Disable a model (emergency shutdown)
   */
  async disableModel(modelId: string, reason: string, disabledBy: string): Promise<void> {
    try {
      await this.updateModel(modelId, {
        status: ModelStatus.DISABLED
      });

      logger.warn(`[AIModelRegistry] Model disabled: ${modelId} - ${reason}`);
      
      await this.logAuditEvent('MODEL_DISABLED', modelId, {
        reason,
        disabledBy
      });
    } catch (error) {
      logger.error('[AIModelRegistry] Disable model failed:', error);
      throw error;
    }
  }

  /**
   * Get deployment history for a model
   */
  async getDeploymentHistory(modelId: string): Promise<DeploymentRecord[]> {
    try {
      const model = await this.getModel(modelId);
      return model?.deploymentHistory || [];
    } catch (error) {
      logger.error('[AIModelRegistry] Get deployment history failed:', error);
      throw error;
    }
  }

  /**
   * Log audit event (integration with PACK 296)
   */
  private async logAuditEvent(
    eventType: string,
    modelId: string,
    details: Record<string, any>
  ): Promise<void> {
    try {
      await this.db.collection('audit_logs').add({
        pack: 'PACK_446',
        module: 'AIModelRegistry',
        eventType,
        modelId,
        details,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('[AIModelRegistry] Audit log failed:', error);
      // Don't throw - audit logging shouldn't block main operations
    }
  }
}
