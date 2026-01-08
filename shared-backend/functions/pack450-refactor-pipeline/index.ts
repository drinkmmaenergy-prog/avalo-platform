/**
 * PACK 450 — Refactor & Decommission Pipeline
 * 
 * Controlled process for refactor, consolidation, and deprecation
 * Kill switch for modules with negative ROI
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
export enum PipelineStage {
  PROPOSED = 'PROPOSED',
  APPROVED = 'APPROVED',
  IN_PROGRESS = 'IN_PROGRESS',
  TESTING = 'TESTING',
  DEPLOYED = 'DEPLOYED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum PipelineType {
  REFACTOR = 'REFACTOR',
  CONSOLIDATION = 'CONSOLIDATION',
  DEPRECATION = 'DEPRECATION',
  DECOMMISSION = 'DECOMMISSION'
}

export interface RefactorPipeline {
  id: string;
  type: PipelineType;
  stage: PipelineStage;
  module: string;
  title: string;
  description: string;
  justification: string;
  impact: {
    costSavings: number; // USD per month
    performanceImprovement: number; // %
    complexityReduction: number; // %
    riskReduction: number; // 0-100
  };
  effort: {
    estimatedHours: number;
    estimatedCost: number; // USD
    requiredResources: string[];
  };
  timeline: {
    proposedAt: Date;
    approvedAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    targetCompletionDate: Date;
  };
  approvals: {
    technical: boolean;
    security: boolean;
    business: boolean;
    legal?: boolean;
  };
  approvers: {
    userId: string;
    role: string;
    approvedAt: Date;
  }[];
  rollbackPlan: string;
  dependentModules: string[];
  migrationSteps: string[];
  testingChecklist: string[];
  status: 'active' | 'paused' | 'cancelled' | 'completed';
}

/**
 * Initiate refactor/decommission pipeline
 */
export const pack450RefactorInitiate = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userId = context.auth.uid;

    // Validate input
    const {
      type,
      module,
      title,
      description,
      justification,
      impact,
      effort,
      targetCompletionDate,
      rollbackPlan,
      dependentModules,
      migrationSteps,
      testingChecklist
    } = data;

    if (!type || !module || !title) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Create pipeline entry
    const pipeline: Partial<RefactorPipeline> = {
      type,
      stage: PipelineStage.PROPOSED,
      module,
      title,
      description: description || '',
      justification: justification || '',
      impact: impact || {
        costSavings: 0,
        performanceImprovement: 0,
        complexityReduction: 0,
        riskReduction: 0
      },
      effort: effort || {
        estimatedHours: 0,
        estimatedCost: 0,
        requiredResources: []
      },
      timeline: {
        proposedAt: new Date(),
        approvedAt: null,
        startedAt: null,
        completedAt: null,
        targetCompletionDate: new Date(targetCompletionDate)
      },
      approvals: {
        technical: false,
        security: false,
        business: false,
        legal: type === PipelineType.DECOMMISSION ? false : undefined
      },
      approvers: [],
      rollbackPlan: rollbackPlan || '',
      dependentModules: dependentModules || [],
      migrationSteps: migrationSteps || [],
      testingChecklist: testingChecklist || [],
      status: 'active'
    };

    const pipelineRef = await db.collection('refactor_pipeline').add(pipeline);

    // Log to audit trail
    await db.collection('refactor_pipeline_audit').add({
      pipelineId: pipelineRef.id,
      action: 'INITIATED',
      userId,
      timestamp: new Date(),
      data: pipeline
    });

    // Send notification for approval
    await sendApprovalRequest(pipelineRef.id, type, module, title);

    return {
      success: true,
      pipelineId: pipelineRef.id,
      message: 'Refactor pipeline initiated - awaiting approvals'
    };
  });

/**
 * Execute decommission
 */
export const pack450DecommissionExecute = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const userId = context.auth.uid;
    const { pipelineId, action } = data;

    if (!pipelineId || !action) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    // Get pipeline
    const pipelineRef = db.collection('refactor_pipeline').doc(pipelineId);
    const pipelineDoc = await pipelineRef.get();

    if (!pipelineDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Pipeline not found'
      );
    }

    const pipeline = pipelineDoc.data() as RefactorPipeline;

    // Handle different actions
    if (action === 'approve') {
      const { approvalType } = data; // technical, security, business, legal

      if (!approvalType) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Approval type required'
        );
      }

      // Update approval
      await pipelineRef.update({
        [`approvals.${approvalType}`]: true,
        approvers: admin.firestore.FieldValue.arrayUnion({
          userId,
          role: approvalType,
          approvedAt: new Date()
        })
      });

      // Check if all approvals received
      const updatedDoc = await pipelineRef.get();
      const updatedPipeline = updatedDoc.data() as RefactorPipeline;

      const allApproved = Object.values(updatedPipeline.approvals).every(
        (approved) => approved !== false
      );

      if (allApproved) {
        await pipelineRef.update({
          stage: PipelineStage.APPROVED,
          'timeline.approvedAt': new Date()
        });

        await sendPipelineNotification(pipelineId, 'APPROVED', 'All approvals received');
      }

      return {
        success: true,
        message: `${approvalType} approval recorded`,
        allApproved
      };

    } else if (action === 'start') {
      // Start execution
      if (pipeline.stage !== PipelineStage.APPROVED) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'Pipeline must be approved before starting'
        );
      }

      await pipelineRef.update({
        stage: PipelineStage.IN_PROGRESS,
        'timeline.startedAt': new Date()
      });

      // Log start
      await db.collection('refactor_pipeline_audit').add({
        pipelineId,
        action: 'STARTED',
        userId,
        timestamp: new Date()
      });

      return {
        success: true,
        message: 'Pipeline execution started'
      };

    } else if (action === 'complete') {
      // Complete pipeline
      await pipelineRef.update({
        stage: PipelineStage.COMPLETED,
        status: 'completed',
        'timeline.completedAt': new Date()
      });

      // If decommission, mark module as decommissioned
      if (pipeline.type === PipelineType.DECOMMISSION) {
        await db.collection('modules').doc(pipeline.module).update({
          status: 'decommissioned',
          decommissionedAt: new Date(),
          decommissionedBy: userId
        });
      }

      // Log completion
      await db.collection('refactor_pipeline_audit').add({
        pipelineId,
        action: 'COMPLETED',
        userId,
        timestamp: new Date()
      });

      await sendPipelineNotification(pipelineId, 'COMPLETED', 'Pipeline completed successfully');

      return {
        success: true,
        message: 'Pipeline completed successfully'
      };

    } else if (action === 'cancel') {
      const { reason } = data;

      await pipelineRef.update({
        stage: PipelineStage.CANCELLED,
        status: 'cancelled',
        cancellationReason: reason,
        cancelledBy: userId,
        cancelledAt: new Date()
      });

      await db.collection('refactor_pipeline_audit').add({
        pipelineId,
        action: 'CANCELLED',
        userId,
        timestamp: new Date(),
        reason
      });

      return {
        success: true,
        message: 'Pipeline cancelled'
      };

    } else if (action === 'rollback') {
      // Execute rollback plan
      await pipelineRef.update({
        stage: PipelineStage.IN_PROGRESS,
        status: 'active',
        rollbackInitiated: true,
        rollbackBy: userId,
        rollbackAt: new Date()
      });

      await db.collection('refactor_pipeline_audit').add({
        pipelineId,
        action: 'ROLLBACK',
        userId,
        timestamp: new Date()
      });

      await sendPipelineNotification(pipelineId, 'ROLLBACK', 'Rollback initiated');

      return {
        success: true,
        message: 'Rollback initiated'
      };
    }

    throw new functions.https.HttpsError(
      'invalid-argument',
      'Invalid action'
    );
  });

/**
 * Auto-detect decommission candidates
 */
export const pack450DetectDecommissionCandidates = functions
  .region('us-central1')
  .pubsub.schedule('every monday 09:00')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    console.log('Detecting decommission candidates...');

    // Get cost-value analyses
    const analysesSnapshot = await db
      .collection('cost_value_analysis')
      .where('priority', '==', 'decommission')
      .get();

    const candidates = analysesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Check if already in pipeline
    const existingPipelines = await db
      .collection('refactor_pipeline')
      .where('type', '==', PipelineType.DECOMMISSION)
      .where('status', 'in', ['active', 'paused'])
      .get();

    const existingModules = new Set(
      existingPipelines.docs.map(doc => doc.data().module)
    );

    // Filter out modules already in pipeline
    const newCandidates = candidates.filter(
      c => !existingModules.has(c.module)
    );

    // Create alerts for new candidates
    for (const candidate of newCandidates) {
      await db.collection('decommission_alerts').add({
        module: candidate.module,
        roi: candidate.roi,
        cost: candidate.cost.totalCost,
        value: candidate.value.totalValue,
        recommendation: candidate.recommendation,
        detectedAt: new Date(),
        reviewed: false
      });
    }

    if (newCandidates.length > 0) {
      await db.collection('notifications').add({
        type: 'DECOMMISSION_CANDIDATES',
        severity: 'MEDIUM',
        title: 'New Decommission Candidates Detected',
        message: `${newCandidates.length} modules identified for potential decommission`,
        data: {
          candidates: newCandidates.map(c => ({
            module: c.module,
            cost: c.cost.totalCost,
            roi: c.roi
          }))
        },
        createdAt: new Date()
      });
    }

    console.log(`Detected ${newCandidates.length} new decommission candidates`);

    return {
      success: true,
      newCandidates: newCandidates.length
    };
  });

/**
 * Send approval request
 */
async function sendApprovalRequest(
  pipelineId: string,
  type: PipelineType,
  module: string,
  title: string
): Promise<void> {
  await db.collection('notifications').add({
    type: 'PIPELINE_APPROVAL_REQUEST',
    severity: type === PipelineType.DECOMMISSION ? 'HIGH' : 'MEDIUM',
    title: 'Approval Required: Refactor Pipeline',
    message: `${type} pipeline proposed for module ${module}: ${title}`,
    data: {
      pipelineId,
      type,
      module,
      title
    },
    createdAt: new Date(),
    requiresAction: true
  });
}

/**
 * Send pipeline notification
 */
async function sendPipelineNotification(
  pipelineId: string,
  event: string,
  message: string
): Promise<void> {
  await db.collection('notifications').add({
    type: 'PIPELINE_UPDATE',
    severity: 'MEDIUM',
    title: `Pipeline ${event}`,
    message,
    data: {
      pipelineId,
      event
    },
    createdAt: new Date()
  });
}
