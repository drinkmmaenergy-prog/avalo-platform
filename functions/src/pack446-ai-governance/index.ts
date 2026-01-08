/**
 * PACK 446: AI Governance, Explainability & Model Risk Control
 * Main export file
 */

export * from './AIModelRegistry';
export * from './DecisionExplainabilityService';
export * from './ModelRiskScoringEngine';
export * from './AIKillSwitchController';
export * from './AIRegulatoryReadinessModule';

import * as admin from 'firebase-admin';
import { AIModelRegistry } from './AIModelRegistry';
import { DecisionExplainabilityService } from './DecisionExplainabilityService';
import { ModelRiskScoringEngine } from './ModelRiskScoringEngine';
import { AIKillSwitchController } from './AIKillSwitchController';
import { AIRegulatoryReadinessModule } from './AIRegulatoryReadinessModule';

/**
 * Initialize all PACK 446 services
 */
export function initializePack446(db: FirebaseFirestore.Firestore) {
  return {
    modelRegistry: new AIModelRegistry(db),
    explainability: new DecisionExplainabilityService(db),
    riskScoring: new ModelRiskScoringEngine(db),
    killSwitch: new AIKillSwitchController(db),
    regulatory: new AIRegulatoryReadinessModule(db)
  };
}

// Convenience export for Firebase Functions
export const pack446Services = initializePack446(admin.firestore());
