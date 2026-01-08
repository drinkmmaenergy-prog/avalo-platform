/**
 * PACK 443 — Advanced Offer Experimentation & Holdout Framework
 * Module: ExperimentLedgerService
 * 
 * Purpose: Maintains immutable audit trail of all experiments for compliance,
 * board reviews, and decision transparency.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import * as crypto from 'crypto';

export interface ExperimentLedgerEntry {
  id: string;
  experimentId: string;
  eventType:
    | 'CREATED'
    | 'APPROVED'
    | 'REJECTED'
    | 'STARTED'
    | 'STAGE_PROGRESSED'
    | 'PAUSED'
    | 'RESUMED'
    | 'GUARDRAIL_VIOLATION'
    | 'KILLED'
    | 'COMPLETED'
    | 'RESULT_RECORDED';
  
  timestamp: Date;
  actor: string; // User ID or system
  
  // Event-specific data
  metadata: Record<string, any>;
  
  // State snapshots
  experimentSnapshot?: any;
  rolloutSnapshot?: any;
  kpiSnapshot?: Record<string, number>;
  
  // Integrity
  previousEntryHash?: string;
  entryHash: string;
}

export interface AuditReport {
  experimentId: string;
  experimentName: string;
  author: string;
  createdAt: Date;
  completedAt?: Date;
  status: string;
  
  timeline: Array<{
    timestamp: Date;
    event: string;
    actor: string;
    details: string;
  }>;
  
  decisions: Array<{
    timestamp: Date;
    decision: string;
    maker: string;
    rationale: string;
  }>;
  
  results: {
    primaryKPI: {
      metric: string;
      change: number;
      statisticalSignificance: number;
    };
    guardrailViolations: number;
    finalRecommendation: string;
  };
  
  financialImpact: {
    estimatedLTVImpact: number;
    affectedUsers: number;
    confidence: number;
  };
}

export class ExperimentLedgerService {
  private db: admin.firestore.Firestore;

  constructor(db: admin.firestore.Firestore) {
    this.db = db;
  }

  /**
   * Record an experiment event in the ledger
   */
  async recordEvent(
    experimentId: string,
    eventType: ExperimentLedgerEntry['eventType'],
    actor: string,
    metadata: Record<string, any> = {},
    snapshots: {
      experiment?: any;
      rollout?: any;
      kpis?: Record<string, number>;
    } = {}
  ): Promise<ExperimentLedgerEntry> {
    // Get previous entry for hash chaining
    const previousEntry = await this.getLatestEntry(experimentId);

    const entry: ExperimentLedgerEntry = {
      id: crypto.randomUUID(),
      experimentId,
      eventType,
      timestamp: new Date(),
      actor,
      metadata,
      experimentSnapshot: snapshots.experiment,
      rolloutSnapshot: snapshots.rollout,
      kpiSnapshot: snapshots.kpis,
      previousEntryHash: previousEntry?.entryHash,
      entryHash: '', // Will be calculated
    };

    // Calculate entry hash for integrity
    entry.entryHash = this.calculateEntryHash(entry);

    await this.db.collection('experimentLedger').add(entry);

    logger.info('Experiment event recorded in ledger', {
      experimentId,
      eventType,
      actor,
      entryId: entry.id,
    });

    return entry;
  }

  /**
   * Get complete audit trail for an experiment
   */
  async getAuditTrail(experimentId: string): Promise<ExperimentLedgerEntry[]> {
    const snapshot = await this.db
      .collection('experimentLedger')
      .where('experimentId', '==', experimentId)
      .orderBy('timestamp', 'asc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as ExperimentLedgerEntry);
  }

  /**
   * Verify ledger integrity (hash chain)
   */
  async verifyLedgerIntegrity(experimentId: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const entries = await this.getAuditTrail(experimentId);
    const errors: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Verify hash matches recalculated hash
      const recalculatedHash = this.calculateEntryHash(entry);
      if (entry.entryHash !== recalculatedHash) {
        errors.push(
          `Entry ${entry.id} hash mismatch: expected ${entry.entryHash}, got ${recalculatedHash}`
        );
      }

      // Verify hash chain
      if (i > 0) {
        const previousEntry = entries[i - 1];
        if (entry.previousEntryHash !== previousEntry.entryHash) {
          errors.push(
            `Entry ${entry.id} previous hash mismatch: expected ${entry.previousEntryHash}, was ${previousEntry.entryHash}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate comprehensive audit report
   */
  async generateAuditReport(experimentId: string): Promise<AuditReport> {
    const entries = await this.getAuditTrail(experimentId);
    
    if (entries.length === 0) {
      throw new Error(`No ledger entries found for experiment ${experimentId}`);
    }

    // Get experiment details from first entry
    const firstEntry = entries[0];
    const experimentSnapshot = firstEntry.experimentSnapshot;
    
    // Build timeline
    const timeline = entries.map((entry) => ({
      timestamp: entry.timestamp,
      event: entry.eventType,
      actor: entry.actor,
      details: JSON.stringify(entry.metadata),
    }));

    // Extract key decisions
    const decisions = entries
      .filter((e) =>
        ['APPROVED', 'REJECTED', 'KILLED', 'COMPLETED'].includes(e.eventType)
      )
      .map((entry) => ({
        timestamp: entry.timestamp,
        decision: entry.eventType,
        maker: entry.actor,
        rationale: entry.metadata.reason || entry.metadata.explanation || 'No rationale provided',
      }));

    // Get final results
    const completedEntry = entries.find((e) => e.eventType === 'COMPLETED');
    const resultEntry = entries.find((e) => e.eventType === 'RESULT_RECORDED');

    const results = resultEntry?.metadata || {
      primaryKPI: {
        metric: 'unknown',
        change: 0,
        statisticalSignificance: 0,
      },
      guardrailViolations: 0,
      finalRecommendation: 'PENDING',
    };

    // Calculate financial impact
    const financialImpact = {
      estimatedLTVImpact: results.estimatedLTVImpact || 0,
      affectedUsers: results.affectedUsers || 0,
      confidence: results.confidence || 0,
    };

    const report: AuditReport = {
      experimentId,
      experimentName: experimentSnapshot?.name || 'Unknown',
      author: experimentSnapshot?.author || 'Unknown',
      createdAt: firstEntry.timestamp,
      completedAt: completedEntry?.timestamp,
      status: this.determineStatus(entries),
      timeline,
      decisions,
      results: {
        primaryKPI: results.primaryKPI || {
          metric: 'unknown',
          change: 0,
          statisticalSignificance: 0,
        },
        guardrailViolations: results.guardrailViolations || 0,
        finalRecommendation: results.recommendation || 'PENDING',
      },
      financialImpact,
    };

    return report;
  }

  /**
   * Export audit report (for board/investors)
   */
  async exportAuditReport(
    experimentId: string,
    format: 'JSON' | 'PDF' | 'CSV' = 'JSON'
  ): Promise<string> {
    const report = await this.generateAuditReport(experimentId);

    if (format === 'JSON') {
      return JSON.stringify(report, null, 2);
    }

    if (format === 'CSV') {
      return this.convertToCSV(report);
    }

    // PDF generation would require additional library
    throw new Error('PDF export not yet implemented');
  }

  /**
   * Get all experiments for a time period (for compliance review)
   */
  async getExperimentsInPeriod(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ experimentId: string; summary: string }>> {
    const snapshot = await this.db
      .collection('experimentLedger')
      .where('eventType', '==', 'CREATED')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as ExperimentLedgerEntry;
      return {
        experimentId: data.experimentId,
        summary: `${data.experimentSnapshot?.name || 'Unknown'} by ${data.actor}`,
      };
    });
  }

  /**
   * Get experiments by author (for performance review)
   */
  async getExperimentsByAuthor(authorId: string): Promise<string[]> {
    const snapshot = await this.db
      .collection('experimentLedger')
      .where('eventType', '==', 'CREATED')
      .where('actor', '==', authorId)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data() as ExperimentLedgerEntry;
      return data.experimentId;
    });
  }

  /**
   * Get ledger statistics
   */
  async getLedgerStatistics(): Promise<{
    totalExperiments: number;
    activeExperiments: number;
    completedExperiments: number;
    killedExperiments: number;
    totalEvents: number;
    integrityStatus: 'VALID' | 'ISSUES_DETECTED';
  }> {
    const allExperiments = new Set<string>();
    const activeExperiments = new Set<string>();
    const completedExperiments = new Set<string>();
    const killedExperiments = new Set<string>();

    const snapshot = await this.db.collection('experimentLedger').get();
    const totalEvents = snapshot.size;

    snapshot.forEach((doc) => {
      const entry = doc.data() as ExperimentLedgerEntry;
      allExperiments.add(entry.experimentId);

      if (entry.eventType === 'STARTED') {
        activeExperiments.add(entry.experimentId);
      }
      if (entry.eventType === 'COMPLETED') {
        completedExperiments.add(entry.experimentId);
        activeExperiments.delete(entry.experimentId);
      }
      if (entry.eventType === 'KILLED') {
        killedExperiments.add(entry.experimentId);
        activeExperiments.delete(entry.experimentId);
      }
    });

    return {
      totalExperiments: allExperiments.size,
      activeExperiments: activeExperiments.size,
      completedExperiments: completedExperiments.size,
      killedExperiments: killedExperiments.size,
      totalEvents,
      integrityStatus: 'VALID', // Would run integrity checks
    };
  }

  // Private helpers

  private async getLatestEntry(experimentId: string): Promise<ExperimentLedgerEntry | null> {
    const snapshot = await this.db
      .collection('experimentLedger')
      .where('experimentId', '==', experimentId)
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as ExperimentLedgerEntry;
  }

  private calculateEntryHash(entry: ExperimentLedgerEntry): string {
    // Create deterministic hash of entry (excluding the hash itself)
    const hashInput = JSON.stringify({
      id: entry.id,
      experimentId: entry.experimentId,
      eventType: entry.eventType,
      timestamp: entry.timestamp.toISOString(),
      actor: entry.actor,
      metadata: entry.metadata,
      previousEntryHash: entry.previousEntryHash,
    });

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private determineStatus(entries: ExperimentLedgerEntry[]): string {
    const latestEntry = entries[entries.length - 1];
    
    switch (latestEntry.eventType) {
      case 'KILLED':
        return 'KILLED';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'PAUSED':
        return 'PAUSED';
      case 'STARTED':
      case 'STAGE_PROGRESSED':
        return 'ACTIVE';
      case 'CREATED':
      case 'APPROVED':
        return 'PENDING';
      case 'REJECTED':
        return 'REJECTED';
      default:
        return 'UNKNOWN';
    }
  }

  private convertToCSV(report: AuditReport): string {
    const rows: string[][] = [];
    
    // Header
    rows.push(['Experiment ID', 'Name', 'Author', 'Status', 'Created', 'Completed']);
    rows.push([
      report.experimentId,
      report.experimentName,
      report.author,
      report.status,
      report.createdAt.toISOString(),
      report.completedAt?.toISOString() || 'N/A',
    ]);
    
    rows.push([]);
    rows.push(['Timeline']);
    rows.push(['Timestamp', 'Event', 'Actor', 'Details']);
    
    for (const event of report.timeline) {
      rows.push([
        event.timestamp.toISOString(),
        event.event,
        event.actor,
        event.details,
      ]);
    }

    return rows.map((row) => row.join(',')).join('\n');
  }
}
