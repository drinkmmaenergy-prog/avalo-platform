/**
 * PACK 365 — Launch Checklist Service
 * 
 * Purpose: Pre-launch validation and readiness verification
 * Phase: ETAP B — Pre-Launch Hardening
 */

import * as admin from "firebase-admin";
import {
  LaunchChecklistItem,
  LaunchChecklist,
  LaunchReadinessReport,
  DomainReadiness,
  LaunchDomain,
  MANDATORY_CHECKLIST_ITEMS,
} from "./pack365-launch-checklist.types";
import { FeatureFlagService, CRITICAL_KILL_SWITCHES } from "./pack365-feature-flags.service";
import { FeatureEnvironment } from "./pack365-feature-flags.types";

const db = admin.firestore();

/**
 * Launch Checklist Service
 * Manages pre-launch validation and readiness checks
 */
export class LaunchChecklistService {
  /**
   * Initialize launch checklist with mandatory items
   */
  static async initializeChecklist(version = "1.0.0"): Promise<void> {
    try {
      const checklistRef = db.collection("ops").doc("launchChecklist");
      const doc = await checklistRef.get();

      if (doc.exists) {
        console.log("[LaunchChecklist] Checklist already exists");
        return;
      }

      const items: Record<string, LaunchChecklistItem> = {};
      
      for (const [key, config] of Object.entries(MANDATORY_CHECKLIST_ITEMS)) {
        items[key] = {
          key,
          domain: config.domain!,
          description: config.description!,
          passed: false,
          priority: config.priority!,
          blocking: config.blocking!,
          docLinks: config.docLinks,
        };
      }

      const checklist: LaunchChecklist = {
        version,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        items,
      };

      await checklistRef.set(checklist);
      console.log("[LaunchChecklist] Initialized with", Object.keys(items).length, "items");
    } catch (error) {
      console.error("[LaunchChecklist] Error initializing:", error);
      throw error;
    }
  }

  /**
   * Verify a checklist item
   */
  static async verifyItem(
    key: string,
    adminId: string,
    notes?: string
  ): Promise<void> {
    try {
      const checklistRef = db.collection("ops").doc("launchChecklist");
      const doc = await checklistRef.get();

      if (!doc.exists) {
        throw new Error("Launch checklist not initialized");
      }

      const checklist = doc.data() as LaunchChecklist;
      
      if (!checklist.items[key]) {
        throw new Error(`Checklist item "${key}" not found`);
      }

      checklist.items[key] = {
        ...checklist.items[key],
        passed: true,
        verifiedBy: adminId,
        verifiedAt: Date.now(),
        notes,
      };

      checklist.updatedAt = Date.now();

      await checklistRef.set(checklist);
      
      console.log(`[LaunchChecklist] Item "${key}" verified by ${adminId}`);

      // Log the verification
      await this.logChecklistChange(key, "verified", adminId, notes);
    } catch (error) {
      console.error(`[LaunchChecklist] Error verifying item "${key}":`, error);
      throw error;
    }
  }

  /**
   * Reset a checklist item (mark as not passed)
   */
  static async resetItem(
    key: string,
    adminId: string,
    reason?: string
  ): Promise<void> {
    try {
      const checklistRef = db.collection("ops").doc("launchChecklist");
      const doc = await checklistRef.get();

      if (!doc.exists) {
        throw new Error("Launch checklist not initialized");
      }

      const checklist = doc.data() as LaunchChecklist;
      
      if (!checklist.items[key]) {
        throw new Error(`Checklist item "${key}" not found`);
      }

      checklist.items[key] = {
        ...checklist.items[key],
        passed: false,
        verifiedBy: undefined,
        verifiedAt: undefined,
        notes: reason,
      };

      checklist.updatedAt = Date.now();

      await checklistRef.set(checklist);
      
      console.log(`[LaunchChecklist] Item "${key}" reset by ${adminId}`);

      // Log the reset
      await this.logChecklistChange(key, "reset", adminId, reason);
    } catch (error) {
      console.error(`[LaunchChecklist] Error resetting item "${key}":`, error);
      throw error;
    }
  }

  /**
   * Get all checklist items
   */
  static async getChecklist(): Promise<LaunchChecklist | null> {
    try {
      const doc = await db.collection("ops").doc("launchChecklist").get();
      
      if (!doc.exists) {
        return null;
      }

      return doc.data() as LaunchChecklist;
    } catch (error) {
      console.error("[LaunchChecklist] Error fetching checklist:", error);
      return null;
    }
  }

  /**
   * Generate launch readiness report
   */
  static async generateReadinessReport(): Promise<LaunchReadinessReport> {
    try {
      const checklist = await this.getChecklist();
      
      if (!checklist) {
        throw new Error("Launch checklist not initialized");
      }

      const items = Object.values(checklist.items);
      const totalItems = items.length;
      const passedItems = items.filter((item) => item.passed).length;
      
      const blockingIssues: string[] = [];
      const criticalIssues: string[] = [];
      const warnings: string[] = [];
      
      // Analyze items by priority and blocking status
      for (const item of items) {
        if (!item.passed) {
          const message = `${item.domain}: ${item.description}`;
          
          if (item.blocking) {
            blockingIssues.push(message);
          }
          
          if (item.priority === "CRITICAL") {
            criticalIssues.push(message);
          } else if (item.priority === "HIGH") {
            warnings.push(message);
          }
        }
      }

      // Analyze by domain
      const domainReadiness: Record<LaunchDomain, DomainReadiness> = {} as any;
      const domains = new Set(items.map((item) => item.domain));
      
      for (const domain of Array.from(domains)) {
        const domainItems = items.filter((item) => item.domain === domain);
        const domainPassed = domainItems.filter((item) => item.passed);
        const domainFailed = domainItems.filter((item) => !item.passed);
        
        // Domain is ready if all blocking items pass
        const blockingItems = domainItems.filter((item) => item.blocking);
        const blockingPassed = blockingItems.filter((item) => item.passed);
        
        domainReadiness[domain] = {
          domain,
          total: domainItems.length,
          passed: domainPassed.length,
          failed: domainFailed.length,
          readyForLaunch: blockingPassed.length === blockingItems.length,
        };
      }

      // System is ready if no blocking issues
      const ready = blockingIssues.length === 0;

      return {
        timestamp: Date.now(),
        ready,
        totalItems,
        passedItems,
        blockingIssues,
        criticalIssues,
        warnings,
        domains: domainReadiness,
      };
    } catch (error) {
      console.error("[LaunchChecklist] Error generating report:", error);
      throw error;
    }
  }

  /**
   * Check if system is ready for production launch
   */
  static async isReadyForLaunch(): Promise<boolean> {
    try {
      const report = await this.generateReadinessReport();
      return report.ready;
    } catch (error) {
      console.error("[LaunchChecklist] Error checking launch readiness:", error);
      return false;
    }
  }

  /**
   * Validate production launch flag against checklist
   */
  static async validateProductionLaunch(
    environment: FeatureEnvironment = "prod"
  ): Promise<{ valid: boolean; reasons: string[] }> {
    try {
      const reasons: string[] = [];
      
      // Check if checklist exists
      const checklist = await this.getChecklist();
      if (!checklist) {
        reasons.push("Launch checklist not initialized");
        return { valid: false, reasons };
      }

      // Check if all blocking items pass
      const report = await this.generateReadinessReport();
      if (!report.ready) {
        reasons.push(`${report.blockingIssues.length} blocking issues remaining`);
        reasons.push(...report.blockingIssues);
        return { valid: false, reasons };
      }

      // Check if all critical items pass
      if (report.criticalIssues.length > 0) {
        reasons.push(`${report.criticalIssues.length} critical issues remaining`);
        reasons.push(...report.criticalIssues);
        return { valid: false, reasons };
      }

      // Check if feature flags are initialized
      const flags = await FeatureFlagService.getAllFlags(environment);
      if (flags.length === 0) {
        reasons.push("Feature flags not initialized");
        return { valid: false, reasons };
      }

      // Check if panic system is enabled
      const panicFlag = await FeatureFlagService.getFeatureFlag(
        CRITICAL_KILL_SWITCHES.PANIC_SYSTEM,
        environment
      );
      if (!panicFlag || panicFlag.enabled) {
        reasons.push("Panic system is disabled or misconfigured");
        return { valid: false, reasons };
      }

      return { valid: true, reasons: [] };
    } catch (error) {
      console.error("[LaunchChecklist] Error validating production launch:", error);
      return {
        valid: false,
        reasons: ["Error validating production launch: " + String(error)],
      };
    }
  }

  /**
   * Log checklist changes
   */
  private static async logChecklistChange(
    itemKey: string,
    action: "verified" | "reset",
    adminId: string,
    notes?: string
  ): Promise<void> {
    try {
      await db.collection("ops").doc("launchChecklist").collection("history").add({
        itemKey,
        action,
        adminId,
        notes,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("[LaunchChecklist] Error logging change:", error);
      // Don't throw - logging shouldn't block operations
    }
  }

  /**
   * Get checklist change history
   */
  static async getHistory(limit = 100): Promise<any[]> {
    try {
      const snapshot = await db
        .collection("ops")
        .doc("launchChecklist")
        .collection("history")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get();

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (error) {
      console.error("[LaunchChecklist] Error fetching history:", error);
      return [];
    }
  }

  /**
   * Bulk verify items (for testing/demo)
   */
  static async bulkVerify(
    itemKeys: string[],
    adminId: string,
    notes?: string
  ): Promise<void> {
    try {
      for (const key of itemKeys) {
        await this.verifyItem(key, adminId, notes);
      }
      console.log(`[LaunchChecklist] Bulk verified ${itemKeys.length} items`);
    } catch (error) {
      console.error("[LaunchChecklist] Error in bulk verify:", error);
      throw error;
    }
  }
}

/**
 * Convenience helpers
 */
export async function isReadyForLaunch(): Promise<boolean> {
  return LaunchChecklistService.isReadyForLaunch();
}

export async function getLaunchReadinessReport(): Promise<LaunchReadinessReport> {
  return LaunchChecklistService.generateReadinessReport();
}

export async function verifyChecklistItem(
  key: string,
  adminId: string,
  notes?: string
): Promise<void> {
  return LaunchChecklistService.verifyItem(key, adminId, notes);
}
