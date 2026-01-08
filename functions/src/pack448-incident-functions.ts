/**
 * PACK 448: Incident Response, Crisis Management & Regulatory Playbooks
 * Firebase Functions Implementation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  Incident,
  IncidentCategory,
  IncidentSeverity,
  IncidentStatus,
  CrisisPlaybook,
  PlaybookExecution,
  RegulatorInteraction,
  CommunicationFreeze,
  PostIncidentReview,
  CrisisModeState,
  IncidentAuditEntry,
  IncidentMetrics,
  IncidentTimelineEntry,
  IncidentCreatedEvent,
  PlaybookTriggeredEvent,
  CrisisActivatedEvent,
} from './pack448-incident-types';

const db = admin.firestore();

// ═══════════════════════════════════════════════════════════════════════════
// Incident Creation and Classification
// ═══════════════════════════════════════════════════════════════════════════

export const createIncident = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const user = await db.collection('users').doc(context.auth.uid).get();
  if (!['admin', 'incident_manager', 'cto', 'ciso'].includes(user.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    category,
    title,
    description,
    affectedSystems,
    detectMethod = 'manual',
  } = data;

  // Auto-classify severity based on matrix
  const severity = await classifyIncidentSeverity(
    category,
    data.affectedUsers,
    data.financialImpact
  );

  const sla = await getSLAForIncident(category, severity);

  const incident: Incident = {
    id: '', // Will be set by Firestore
    category,
    severity,
    status: 'open',
    title,
    description,
    owner: await assignIncidentOwner(category, severity),
    affectedSystems: affectedSystems || [],
    affectedUsers: data.affectedUsers,
    financialImpact: data.financialImpact,
    detectMethod,
    tags: data.tags || [],
    createdAt: admin.firestore.Timestamp.now(),
    updatedAt: admin.firestore.Timestamp.now(),
    detectedAt: data.detectedAt || admin.firestore.Timestamp.now(),
    slaResponseTime: sla.response,
    slaResolutionTime: sla.resolution,
    slaBreach: false,
    regulatorNotified: false,
    publicDisclosure: false,
    metadata: data.metadata || {},
  };

  const incidentRef = await db.collection('incidents').add(incident);
  incident.id = incidentRef.id;

  // Log audit trail
  await logAuditEntry({
    incidentId: incident.id,
    actor: context.auth.uid,
    actorRole: user.data()?.role || 'unknown',
    action: 'incident_created',
    resource: 'incident',
    resourceId: incident.id,
    after: incident,
    ipAddress: context.rawRequest?.ip || 'unknown',
    userAgent: context.rawRequest?.headers['user-agent'] || 'unknown',
    success: true,
    metadata: {},
  });

  // Create initial timeline entry
  await addTimelineEntry(incident.id, {
    action: 'Incident created',
    actor: context.auth.uid,
    actorRole: user.data()?.role || 'unknown',
    details: `Incident created: ${title}`,
    automated: false,
  });

  // Check if playbook should be triggered
  await evaluatePlaybookTriggers(incident);

  // Send notifications
  await notifyIncidentStakeholders(incident);

  // Check if crisis mode should be activated
  if (severity === 'critical') {
    await evaluateCrisisMode([incident.id]);
  }

  return { incidentId: incident.id, incident };
});

// ═══════════════════════════════════════════════════════════════════════════
// Severity Classification
// ═══════════════════════════════════════════════════════════════════════════

async function classifyIncidentSeverity(
  category: IncidentCategory,
  affectedUsers?: number,
  financialImpact?: number
): Promise<IncidentSeverity> {
  const matrixSnapshot = await db
    .collection('incident_severity_matrix')
    .where('active', '==', true)
    .orderBy('version', 'desc')
    .limit(1)
    .get();

  if (matrixSnapshot.empty) {
    return 'medium'; // Default
  }

  const matrix = matrixSnapshot.docs[0].data();
  const rules = matrix.rules || [];

  for (const rule of rules) {
    if (rule.category !== category) continue;

    const conditions = rule.conditions;
    let matches = true;

    if (conditions.affectedUsers) {
      if (affectedUsers !== undefined) {
        if (conditions.affectedUsers.min && affectedUsers < conditions.affectedUsers.min)
          matches = false;
        if (conditions.affectedUsers.max && affectedUsers > conditions.affectedUsers.max)
          matches = false;
      }
    }

    if (conditions.financialImpact) {
      if (financialImpact !== undefined) {
        if (conditions.financialImpact.min && financialImpact < conditions.financialImpact.min)
          matches = false;
        if (conditions.financialImpact.max && financialImpact > conditions.financialImpact.max)
          matches = false;
      }
    }

    if (matches) {
      return rule.severity;
    }
  }

  return matrix.defaultSeverity || 'medium';
}

async function getSLAForIncident(category: IncidentCategory, severity: IncidentSeverity) {
  const matrixSnapshot = await db
    .collection('incident_severity_matrix')
    .where('active', '==', true)
    .limit(1)
    .get();

  if (!matrixSnapshot.empty) {
    const matrix = matrixSnapshot.docs[0].data();
    const rule = matrix.rules?.find(
      (r: any) => r.category === category && r.severity === severity
    );
    if (rule) {
      return {
        response: rule.slaResponseMinutes,
        resolution: rule.slaResolutionMinutes,
      };
    }
  }

  // Default SLAs based on severity
  const defaultSLAs: Record<IncidentSeverity, { response: number; resolution: number }> = {
    critical: { response: 15, resolution: 240 }, // 15min, 4hrs
    high: { response: 60, resolution: 480 }, // 1hr, 8hrs
    medium: { response: 240, resolution: 1440 }, // 4hrs, 24hrs
    low: { response: 1440, resolution: 10080 }, // 24hrs, 7days
  };

  return defaultSLAs[severity];
}

async function assignIncidentOwner(
  category: IncidentCategory,
  severity: IncidentSeverity
): Promise<string> {
  // Look up owner from severity matrix
  const matrixSnapshot = await db
    .collection('incident_severity_matrix')
    .where('active', '==', true)
    .limit(1)
    .get();

  if (!matrixSnapshot.empty) {
    const matrix = matrixSnapshot.docs[0].data();
    const rule = matrix.rules?.find(
      (r: any) => r.category === category && r.severity === severity
    );
    if (rule?.owner) {
      // Find user with this role
      const ownerSnapshot = await db
        .collection('users')
        .where('role', '==', rule.owner)
        .where('active', '==', true)
        .limit(1)
        .get();
      if (!ownerSnapshot.empty) {
        return ownerSnapshot.docs[0].id;
      }
    }
  }

  // Default: Find any incident manager
  const managerSnapshot = await db
    .collection('users')
    .where('role', '==', 'incident_manager')
    .where('active', '==', true)
    .limit(1)
    .get();

  if (!managerSnapshot.empty) {
    return managerSnapshot.docs[0].id;
  }

  return 'system'; // Fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// Crisis Playbook Orchestration
// ═══════════════════════════════════════════════════════════════════════════

async function evaluatePlaybookTriggers(incident: Incident) {
  const playbooksSnapshot = await db
    .collection('crisis_playbooks')
    .where('active', '==', true)
    .get();

  for (const doc of playbooksSnapshot.docs) {
    const playbook = doc.data() as CrisisPlaybook;
    playbook.id = doc.id;

    const conditions = playbook.triggerConditions;
    if (
      conditions.categories.includes(incident.category) &&
      conditions.severities.includes(incident.severity)
    ) {
      // Trigger playbook
      await triggerPlaybook(playbook, incident, 'system', true);
    }
  }
}

export const triggerPlaybook = async (
  playbook: CrisisPlaybook,
  incident: Incident,
  triggeredBy: string,
  automated: boolean
) => {
  const execution: PlaybookExecution = {
    id: '',
    playbookId: playbook.id,
    playbookVersion: playbook.version,
    incidentId: incident.id,
    status: 'pending',
    startedAt: admin.firestore.Timestamp.now(),
    currentStep: 0,
    completedSteps: [],
    failedSteps: [],
    skipedSteps: [],
    executionLog: [],
    automated,
    triggeredBy,
    approvals: {},
  };

  const executionRef = await db
    .collection(`crisis_playbooks/${playbook.id}/executions`)
    .add(execution);
  execution.id = executionRef.id;

  await addTimelineEntry(incident.id, {
    action: 'Playbook triggered',
    actor: triggeredBy,
    actorRole: 'system',
    details: `Playbook ${playbook.name} (v${playbook.version}) triggered`,
    automated,
  });

  // Activate communication freeze if required
  if (playbook.communicationFreeze) {
    await activateCommunicationFreeze(incident.id, 'complete_freeze', triggeredBy);
  }

  // Start execution
  await executePlaybookStep(playbook, execution, 1);

  return execution.id;
};

async function executePlaybookStep(
  playbook: CrisisPlaybook,
  execution: PlaybookExecution,
  stepOrder: number
) {
  const step = playbook.steps.find((s) => s.order === stepOrder);
  if (!step) {
    // All steps complete
    await db
      .collection(`crisis_playbooks/${playbook.id}/executions`)
      .doc(execution.id)
      .update({
        status: 'completed',
        completedAt: admin.firestore.Timestamp.now(),
      });
    return;
  }

  // Check dependencies
  if (step.dependencies) {
    for (const depOrder of step.dependencies) {
      if (!execution.completedSteps.includes(depOrder)) {
        // Dependency not met, wait
        return;
      }
    }
  }

  // Execute step based on action type
  if (step.action === 'automated' && step.handler) {
    try {
      // Call handler function
      await executeAutomatedHandler(step.handler, playbook, execution);
      execution.completedSteps.push(stepOrder);
    } catch (error) {
      execution.failedSteps.push(stepOrder);
      execution.executionLog.push({
        step: stepOrder,
        error: (error as Error).message,
        timestamp: admin.firestore.Timestamp.now(),
      });
    }
  } else if (step.action === 'approval_required') {
    // Wait for manual approval
    execution.status = 'paused';
    await db
      .collection(`crisis_playbooks/${playbook.id}/executions`)
      .doc(execution.id)
      .update({ status: 'paused', currentStep: stepOrder });
    return;
  }

  // Move to next step
  await executePlaybookStep(playbook, execution, stepOrder + 1);
}

async function executeAutomatedHandler(
  handler: string,
  playbook: CrisisPlaybook,
  execution: PlaybookExecution
) {
  // Handler implementations
  const handlers: Record<string, () => Promise<void>> = {
    isolate_affected_systems: async () => {
      // Implementation
    },
    snapshot_evidence: async () => {
      // Implementation
    },
    notify_legal_team: async () => {
      // Implementation
    },
    activate_kill_switch: async () => {
      // Implementation
    },
    freeze_deployments: async () => {
      // Implementation
    },
  };

  if (handlers[handler]) {
    await handlers[handler]();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Regulator Interaction Mode
// ═══════════════════════════════════════════════════════════════════════════

export const activateRegulatorMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const user = await db.collection('users').doc(context.auth.uid).get();
  if (!['admin', 'legal', 'compliance', 'cto'].includes(user.data()?.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  const {
    regulatorName,
    jurisdiction,
    type,
    referenceNumber,
    relatedIncidents,
    lockMode,
  } = data;

  const interaction: RegulatorInteraction = {
    id: '',
    regulatorName,
    regulatorContact: data.regulatorContact || '',
    jurisdiction,
    type,
    referenceNumber,
    relatedIncidents: relatedIncidents || [],
    startedAt: admin.firestore.Timestamp.now(),
    status: 'active',
    lockMode,
    lockActivatedAt: admin.firestore.Timestamp.now(),
    lockActivatedBy: context.auth.uid,
    scope: data.scope || [],
    responsibleTeam: data.responsibleTeam || [],
    internalCaseId: `REG-${Date.now()}`,
    metadata: data.metadata || {},
  };

  const interactionRef = await db.collection('regulator_interactions').add(interaction);
  interaction.id = interactionRef.id;

  // Take evidence snapshot
  if (lockMode === 'evidence_snapshot' || lockMode === 'full_freeze') {
    await createEvidenceSnapshot(interaction);
  }

  // Apply lock
  await applyRegulatorLock(lockMode, interaction.id);

  return { interactionId: interaction.id };
});

async function createEvidenceSnapshot(interaction: RegulatorInteraction) {
  // Create snapshot of all relevant data
  const snapshot = {
    timestamp: admin.firestore.Timestamp.now(),
    snapshotType: 'full',
    scope: interaction.scope,
    // Implementation would include actual data collection
  };

  await db
    .collection(`regulator_interactions/${interaction.id}/snapshots`)
    .add(snapshot);
}

async function applyRegulatorLock(lockMode: string, interactionId: string) {
  // Apply appropriate locks based on mode
  switch (lockMode) {
    case 'log_lock':
      // Prevent log modifications
      break;
    case 'evidence_snapshot':
      // Lock evidence collection
      break;
    case 'decision_freeze':
      // Freeze automated decisions
      break;
    case 'full_freeze':
      // Full operational freeze
      break;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Communication Freeze Management
// ═══════════════════════════════════════════════════════════════════════════

async function activateCommunicationFreeze(
  incidentId: string,
  scope: string,
  activatedBy: string
) {
  const freeze: CommunicationFreeze = {
    id: '',
    incidentId,
    scope: [scope as any],
    reason: 'Crisis playbook triggered',
    active: true,
    startedAt: admin.firestore.Timestamp.now(),
    activatedBy,
    approvedBy: [activatedBy],
    exceptionRoles: ['admin', 'cto', 'legal'],
    metadata: {},
  };

  const freezeRef = await db.collection('communication_freezes').add(freeze);
  await addTimelineEntry(incidentId, {
    action: 'Communication freeze activated',
    actor: activatedBy,
    actorRole: 'system',
    details: `Scope: ${scope}`,
    automated: true,
  });

  return freezeRef.id;
}

export const deactivateCommunicationFreeze = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { freezeId } = data;
    await db.collection('communication_freezes').doc(freezeId).update({
      active: false,
      endedAt: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Crisis Mode Management
// ═══════════════════════════════════════════════════════════════════════════

async function evaluateCrisisMode(incidentIds: string[]) {
  // Check if crisis mode should be activated
  const criticalIncidents = await db
    .collection('incidents')
    .where('severity', '==', 'critical')
    .where('status', 'in', ['open', 'investigating'])
    .get();

  if (criticalIncidents.size >= 2) {
    // Multiple critical incidents = crisis
    await activateCrisisMode('critical', 'Multiple critical incidents', incidentIds);
  }
}

export const activateCrisisMode = async (
  level: string,
  reason: string,
  relatedIncidents: string[]
) => {
  const state: CrisisModeState = {
    id: 'global',
    active: true,
    level: level as any,
    reason,
    activatedAt: admin.firestore.Timestamp.now(),
    activatedBy: 'system',
    relatedIncidents,
    restrictions: {
      deploymentsFrozen: level === 'critical' || level === 'emergency',
      configChangesFrozen: level === 'critical' || level === 'emergency',
      nonEssentialServicesPaused: level === 'emergency',
      enhancedMonitoring: true,
      allHandsRequired: level === 'emergency',
    },
    communicationPlan: {
      internalFrequency: level === 'emergency' ? 15 : 30,
      externalRequired: level === 'critical' || level === 'emergency',
      stakeholdersList: [],
    },
    metadata: {},
  };

  await db.collection('crisis_mode_state').doc('global').set(state);

  // Notify all stakeholders
  await notifyCrisisActivation(state);
};

async function notifyCrisisActivation(state: CrisisModeState) {
  // Send notifications to all relevant parties
  // Implementation would include actual notification logic
}

// ═══════════════════════════════════════════════════════════════════════════
// Post-Incident Review Automation
// ═══════════════════════════════════════════════════════════════════════════

export const generatePostIncidentReview = functions.https.onCall(
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { incidentId } = data;
    const incident = await db.collection('incidents').doc(incidentId).get();

    if (!incident.exists) {
      throw new functions.https.HttpsError('not-found', 'Incident not found');
    }

    const incidentData = incident.data() as Incident;

    // Generate PIR
    const pir: PostIncidentReview = {
      id: '',
      incidentId,
      conductedBy: [context.auth.uid],
      reviewTeam: [],
      startedAt: admin.firestore.Timestamp.now(),
      status: 'in_progress',
      executiveSummary: '',
      timeline: [],
      impactAnalysis: {
        users: incidentData.affectedUsers || 0,
        financial: incidentData.financialImpact || 0,
        reputation: incidentData.reputationImpact || 'none',
        technical: '',
      },
      responseEffectiveness: {
        detectionTime: 0,
        responseTime: incidentData.actualResponseTime || 0,
        containmentTime: 0,
        resolutionTime: incidentData.actualResolutionTime || 0,
        slaCompliance: !incidentData.slaBreach,
      },
      metadata: {},
    };

    const pirRef = await db.collection('post_incident_reviews').add(pir);
    return { pirId: pirRef.id };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

async function addTimelineEntry(
  incidentId: string,
  entry: Omit<IncidentTimelineEntry, 'id' | 'incidentId' | 'timestamp'>
) {
  await db
    .collection(`incidents/${incidentId}/timeline`)
    .add({
      ...entry,
      incidentId,
      timestamp: admin.firestore.Timestamp.now(),
    });
}

async function logAuditEntry(entry: Omit<IncidentAuditEntry, 'id' | 'timestamp'>) {
  await db.collection('incident_audit_trail').add({
    ...entry,
    timestamp: admin.firestore.Timestamp.now(),
  });
}

async function notifyIncidentStakeholders(incident: Incident) {
  // Send notifications to relevant stakeholders
  // Implementation would include actual notification logic
}

// ═══════════════════════════════════════════════════════════════════════════
// Scheduled Jobs
// ═══════════════════════════════════════════════════════════════════════════

// Monitor SLA breaches
export const monitorSLABreaches = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const incidents = await db
      .collection('incidents')
      .where('status', 'in', ['open', 'investigating'])
      .where('slaBreach', '==', false)
      .get();

    for (const doc of incidents.docs) {
      const incident = doc.data() as Incident;
      const now = admin.firestore.Timestamp.now();
      const elapsed = (now.seconds - incident.createdAt.seconds) / 60; // minutes

      if (elapsed > incident.slaResponseTime && !incident.actualResponseTime) {
        await db.collection('incidents').doc(doc.id).update({ slaBreach: true });
        await notifySLABreach(doc.id, 'response');
      }
    }
  });

async function notifySLABreach(incidentId: string, type: string) {
  // Send notifications about SLA breach
}

// Calculate metrics
export const calculateIncidentMetrics = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Calculate various metrics
    // Implementation would include actual calculation logic

    const metrics: IncidentMetrics = {
      id: period,
      period,
      totalIncidents: 0,
      byCategory: {} as any,
      bySeverity: {} as any,
      byStatus: {} as any,
      avgResponseTime: 0,
      avgResolutionTime: 0,
      slaCompliance: 0,
      slaBreaches: 0,
      criticalIncidents: 0,
      autoDetected: 0,
      playbooksExecuted: 0,
      playbookSuccessRate: 0,
      regulatorInteractions: 0,
      communicationFreezes: 0,
      completedPIRs: 0,
      openCorrectiveActions: 0,
      completedCorrectiveActions: 0,
      mttr: 0,
      mttd: 0,
      mtta: 0,
      calculatedAt: admin.firestore.Timestamp.now(),
    };

    await db.collection('incident_metrics').doc(period).set(metrics);
  });
