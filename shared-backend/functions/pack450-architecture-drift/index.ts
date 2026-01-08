/**
 * PACK 450 — Architecture Drift Detector
 * 
 * Automatic detection of:
 * - Architecture bypasses
 * - Unauthorized dependencies
 * - Logic duplication
 * - Referential rule violations
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Types
export enum ViolationType {
  ARCHITECTURE_BYPASS = 'ARCHITECTURE_BYPASS',
  UNAUTHORIZED_DEPENDENCY = 'UNAUTHORIZED_DEPENDENCY',
  LOGIC_DUPLICATION = 'LOGIC_DUPLICATION',
  REFERENTIAL_RULE_VIOLATION = 'REFERENTIAL_RULE_VIOLATION',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',
  LAYERING_VIOLATION = 'LAYERING_VIOLATION'
}

export enum ViolationSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

export interface ArchitectureRule {
  id: string;
  name: string;
  description: string;
  ruleType: string;
  enabled: boolean;
  severity: ViolationSeverity;
  configuration: Record<string, any>;
}

export interface ArchitectureViolation {
  id: string;
  violationType: ViolationType;
  severity: ViolationSeverity;
  module: string;
  component: string;
  description: string;
  details: {
    sourceFile?: string;
    targetFile?: string;
    dependency?: string;
    duplicatedWith?: string;
    ruleViolated?: string;
  };
  detectedAt: Date;
  resolvedAt: Date | null;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  technicalDebtId?: string; // link to technical debt entry
}

export interface ArchitectureSnapshot {
  timestamp: Date;
  modules: string[];
  dependencies: Record<string, string[]>;
  complexityMetrics: {
    cyclomaticComplexity: number;
    couplingScore: number;
    cohesionScore: number;
  };
  violations: number;
}

/**
 * Detect architecture drift violations
 */
export const pack450ArchitectureDriftDetect = functions
  .region('us-central1')
  .pubsub.schedule('every 6 hours')
  .onRun(async (context) => {
    console.log('Starting architecture drift detection...');

    // Get active architecture rules
    const rulesSnapshot = await db
      .collection('architecture_rules')
      .where('enabled', '==', true)
      .get();

    const rules = rulesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as ArchitectureRule[];

    // Get current architecture snapshot
    const currentSnapshot = await captureArchitectureSnapshot();

    // Get previous snapshot for comparison
    const previousSnapshot = await getLatestArchitectureSnapshot();

    // Detect violations
    const violations: Partial<ArchitectureViolation>[] = [];

    // 1. Check for architecture bypasses
    violations.push(...await detectArchitectureBypasses(rules, currentSnapshot));

    // 2. Check for unauthorized dependencies
    violations.push(...await detectUnauthorizedDependencies(rules, currentSnapshot));

    // 3. Check for logic duplication
    violations.push(...await detectLogicDuplication(currentSnapshot));

    // 4. Check for referential rule violations
    violations.push(...await detectReferentialRuleViolations(rules, currentSnapshot));

    // 5. Check for circular dependencies
    violations.push(...await detectCircularDependencies(currentSnapshot));

    // 6. Check for layering violations
    violations.push(...await detectLayeringViolations(rules, currentSnapshot));

    // Save violations
    const batch = db.batch();
    const violationTimestamp = new Date();

    violations.forEach(violation => {
      const violationRef = db.collection('architecture_violations').doc();
      batch.set(violationRef, {
        ...violation,
        detectedAt: violationTimestamp,
        resolvedAt: null,
        acknowledged: false
      });
    });

    await batch.commit();

    // Save architecture snapshot
    await db.collection('architecture_snapshots').add(currentSnapshot);

    // Send alerts for critical violations
    const criticalViolations = violations.filter(
      v => v.severity === ViolationSeverity.CRITICAL
    );

    if (criticalViolations.length > 0) {
      await sendDriftAlerts(criticalViolations);
    }

    console.log(`Detected ${violations.length} architecture violations (${criticalViolations.length} critical)`);

    return {
      success: true,
      violationsDetected: violations.length,
      criticalViolations: criticalViolations.length
    };
  });

/**
 * Send alerts for architecture drift
 */
export const pack450ArchitectureDriftAlert = functions
  .region('us-central1')
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'Must be authenticated'
      );
    }

    const { violationId, action } = data;

    if (!violationId || !action) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing required fields'
      );
    }

    const violationRef = db.collection('architecture_violations').doc(violationId);
    const violationDoc = await violationRef.get();

    if (!violationDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Violation not found'
      );
    }

    const userId = context.auth.uid;

    if (action === 'acknowledge') {
      await violationRef.update({
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      });
    } else if (action === 'resolve') {
      await violationRef.update({
        resolvedAt: new Date(),
        resolvedBy: userId
      });
    } else if (action === 'create_debt') {
      // Create technical debt entry for this violation
      const violation = violationDoc.data() as ArchitectureViolation;

      const debtRef = await db.collection('technical_debt').add({
        module: violation.module,
        component: violation.component,
        debtType: 'CODE',
        severity: violation.severity,
        status: 'OPEN',
        title: `Architecture Violation: ${violation.violationType}`,
        description: violation.description,
        impact: {
          revenueRisk: 0,
          velocityImpact: 10,
          securityRisk: 0,
          scalabilityRisk: 20
        },
        owner: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: ['architecture', 'drift'],
        technicalDetails: violation.details
      });

      await violationRef.update({
        technicalDebtId: debtRef.id
      });
    }

    return {
      success: true,
      message: `Violation ${action} successfully`
    };
  });

/**
 * Capture current architecture snapshot
 */
async function captureArchitectureSnapshot(): Promise<ArchitectureSnapshot> {
  // This would typically scan the codebase
  // For now, return placeholder data
  const modulesSnapshot = await db.collection('modules').get();
  const modules = modulesSnapshot.docs.map(doc => doc.id);

  // Get dependency graph
  const dependencies: Record<string, string[]> = {};
  for (const module of modules) {
    const depsSnapshot = await db
      .collection('module_dependencies')
      .where('sourceModule', '==', module)
      .get();

    dependencies[module] = depsSnapshot.docs.map(
      doc => doc.data().targetModule as string
    );
  }

  return {
    timestamp: new Date(),
    modules,
    dependencies,
    complexityMetrics: {
      cyclomaticComplexity: 0,
      couplingScore: 0,
      cohesionScore: 0
    },
    violations: 0
  };
}

/**
 * Get latest architecture snapshot
 */
async function getLatestArchitectureSnapshot(): Promise<ArchitectureSnapshot | null> {
  const snapshot = await db
    .collection('architecture_snapshots')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].data() as ArchitectureSnapshot;
}

/**
 * Detect architecture bypasses
 */
async function detectArchitectureBypasses(
  rules: ArchitectureRule[],
  snapshot: ArchitectureSnapshot
): Promise<Partial<ArchitectureViolation>[]> {
  const violations: Partial<ArchitectureViolation>[] = [];

  // Check for direct database access from UI layer
  const bypassRules = rules.filter(r => r.ruleType === 'no_bypass');

  for (const rule of bypassRules) {
    // Implementation would scan for actual bypasses
    // Placeholder logic
  }

  return violations;
}

/**
 * Detect unauthorized dependencies
 */
async function detectUnauthorizedDependencies(
  rules: ArchitectureRule[],
  snapshot: ArchitectureSnapshot
): Promise<Partial<ArchitectureViolation>[]> {
  const violations: Partial<ArchitectureViolation>[] = [];

  const dependencyRules = rules.filter(r => r.ruleType === 'dependency_whitelist');

  for (const rule of dependencyRules) {
    const allowedDeps = rule.configuration.allowed || [];

    for (const [module, deps] of Object.entries(snapshot.dependencies)) {
      for (const dep of deps) {
        if (!allowedDeps.includes(dep)) {
          violations.push({
            violationType: ViolationType.UNAUTHORIZED_DEPENDENCY,
            severity: rule.severity,
            module,
            component: 'dependencies',
            description: `Unauthorized dependency: ${module} -> ${dep}`,
            details: {
              sourceFile: module,
              dependency: dep,
              ruleViolated: rule.id
            }
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Detect logic duplication
 */
async function detectLogicDuplication(
  snapshot: ArchitectureSnapshot
): Promise<Partial<ArchitectureViolation>[]> {
  const violations: Partial<ArchitectureViolation>[] = [];

  // Implementation would use code analysis tools
  // Placeholder logic

  return violations;
}

/**
 * Detect referential rule violations
 */
async function detectReferentialRuleViolations(
  rules: ArchitectureRule[],
  snapshot: ArchitectureSnapshot
): Promise<Partial<ArchitectureViolation>[]> {
  const violations: Partial<ArchitectureViolation>[] = [];

  // Check referential integrity rules
  const refRules = rules.filter(r => r.ruleType === 'referential_integrity');

  // Implementation would check for violations
  // Placeholder logic

  return violations;
}

/**
 * Detect circular dependencies
 */
async function detectCircularDependencies(
  snapshot: ArchitectureSnapshot
): Promise<Partial<ArchitectureViolation>[]> {
  const violations: Partial<ArchitectureViolation>[] = [];

  // Use DFS to detect cycles in dependency graph
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(module: string, path: string[]): boolean {
    if (!visited.has(module)) {
      visited.add(module);
      recursionStack.add(module);

      const deps = snapshot.dependencies[module] || [];
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycle(dep, [...path, module])) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          // Found cycle
          violations.push({
            violationType: ViolationType.CIRCULAR_DEPENDENCY,
            severity: ViolationSeverity.HIGH,
            module,
            component: 'dependencies',
            description: `Circular dependency detected: ${[...path, module, dep].join(' -> ')}`,
            details: {
              sourceFile: module,
              targetFile: dep
            }
          });
          return true;
        }
      }
    }

    recursionStack.delete(module);
    return false;
  }

  for (const module of snapshot.modules) {
    if (!visited.has(module)) {
      hasCycle(module, []);
    }
  }

  return violations;
}

/**
 * Detect layering violations
 */
async function detectLayeringViolations(
  rules: ArchitectureRule[],
  snapshot: ArchitectureSnapshot
): Promise<Partial<ArchitectureViolation>[]> {
  const violations: Partial<ArchitectureViolation>[] = [];

  const layerRules = rules.filter(r => r.ruleType === 'layering');

  for (const rule of layerRules) {
    const layerHierarchy = rule.configuration.layers || [];

    // Check if dependencies respect layer hierarchy
    // Lower layers should not depend on higher layers
    for (const [module, deps] of Object.entries(snapshot.dependencies)) {
      const moduleLayer = getModuleLayer(module, layerHierarchy);

      for (const dep of deps) {
        const depLayer = getModuleLayer(dep, layerHierarchy);

        if (moduleLayer !== -1 && depLayer !== -1 && moduleLayer < depLayer) {
          violations.push({
            violationType: ViolationType.LAYERING_VIOLATION,
            severity: rule.severity,
            module,
            component: 'layering',
            description: `Layer violation: ${module} (layer ${moduleLayer}) depends on ${dep} (layer ${depLayer})`,
            details: {
              sourceFile: module,
              targetFile: dep,
              ruleViolated: rule.id
            }
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Get module layer index
 */
function getModuleLayer(module: string, layers: string[][]): number {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].some(pattern => module.includes(pattern))) {
      return i;
    }
  }
  return -1;
}

/**
 * Send drift alerts
 */
async function sendDriftAlerts(violations: Partial<ArchitectureViolation>[]): Promise<void> {
  // Send alerts to relevant stakeholders
  await db.collection('notifications').add({
    type: 'ARCHITECTURE_DRIFT',
    severity: 'CRITICAL',
    title: 'Critical Architecture Violations Detected',
    message: `${violations.length} critical architecture violations detected`,
    data: {
      violations: violations.map(v => ({
        type: v.violationType,
        module: v.module,
        description: v.description
      }))
    },
    createdAt: new Date()
  });
}
