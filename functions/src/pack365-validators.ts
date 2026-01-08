/**
 * PACK 365 — Automated Misconfiguration Guards
 * 
 * Purpose: Daily validation of launch state and feature flag configurations
 * Phase: ETAP B — Pre-Launch Hardening
 */

import * as admin from "firebase-admin";
import { FeatureFlagService, CRITICAL_KILL_SWITCHES } from "./pack365-feature-flags.service";
import { LaunchChecklistService } from "./pack365-launch-checklist.service";
import {
  FeatureFlagValidationResult,
  FeatureFlagViolation,
  FeatureEnvironment,
} from "./pack365-feature-flags.types";

const db = admin.firestore();

/**
 * Validator Service
 * Detects dangerous misconfigurations and contradictory flags
 */
export class ValidatorService {
  /**
   * Run all validation checks
   */
  static async validateLaunchState(
    environment: FeatureEnvironment = "prod"
  ): Promise<FeatureFlagValidationResult> {
    const violations: FeatureFlagViolation[] = [];

    try {
      // Check for contradictory flags
      const contradictoryViolations = await this.checkContradictoryFlags(environment);
      violations.push(...contradictoryViolations);

      // Check panic system
      const panicViolations = await this.checkPanicSystem(environment);
      violations.push(...panicViolations);

      // Check withdrawal/KYC dependency
      const kycViolations = await this.checkWithdrawalKYCDependency(environment);
      violations.push(...kycViolations);

      // Check test flags in production
      const testFlagViolations = await this.checkTestFlagsInProduction(environment);
      violations.push(...testFlagViolations);

      // Check critical kill-switches exist
      const killSwitchViolations = await this.checkCriticalKillSwitches(environment);
      violations.push(...killSwitchViolations);

      // Check production launch prerequisites
      if (environment === "prod") {
        const launchViolations = await this.checkProductionLaunchPrerequisites();
        violations.push(...launchViolations);
      }

      // If violations found, take action
      if (violations.length > 0) {
        await this.handleViolations(violations, environment);
      }

      return {
        valid: violations.length === 0,
        violations,
      };
    } catch (error) {
      console.error("[Validators] Error in validateLaunchState:", error);
      
      // Return error as CRITICAL violation
      return {
        valid: false,
        violations: [
          {
            severity: "CRITICAL",
            flagKey: "system.validation",
            message: "Validation system error: " + String(error),
            recommendation: "Check validator service logs immediately",
          },
        ],
      };
    }
  }

  /**
   * Check for contradictory feature flags
   */
  private static async checkContradictoryFlags(
    environment: FeatureEnvironment
  ): Promise<FeatureFlagViolation[]> {
    const violations: FeatureFlagViolation[] = [];

    try {
      // Get all flags
      const allFlags = await FeatureFlagService.getAllFlags(environment);
      const flagMap = new Map(allFlags.map((f) => [f.key, f]));

      // Rule: Chat enabled + wallet disabled = contradiction
      const chatEnabled = await FeatureFlagService.isFeatureEnabled("chat.enabled", {
        environment,
        isAdmin: true,
      });
      const walletDisabled = flagMap.get(CRITICAL_KILL_SWITCHES.WALLET_SPEND)?.enabled;

      if (chatEnabled && walletDisabled) {
        violations.push({
          severity: "ERROR",
          flagKey: "chat.enabled",
          message: "Chat is enabled but wallet spending is disabled",
          recommendation: "Either disable chat or enable wallet spending",
        });
      }

      // Rule: Calendar/Events enabled + wallet disabled = contradiction
      const calendarEnabled = await FeatureFlagService.isFeatureEnabled("calendar.enabled", {
        environment,
        isAdmin: true,
      });
      const calendarBookingDisabled = flagMap.get(
        CRITICAL_KILL_SWITCHES.CALENDAR_BOOKING
      )?.enabled;

      if (calendarEnabled && calendarBookingDisabled) {
        violations.push({
          severity: "ERROR",
          flagKey: "calendar.enabled",
          message: "Calendar is enabled but bookings are disabled",
          recommendation: "Either disable calendar or enable bookings",
        });
      }

      // Rule: AI enabled + AI voice disabled = contradiction
      const aiEnabled = await FeatureFlagService.isFeatureEnabled("ai.enabled", {
        environment,
        isAdmin: true,
      });
      const aiVoiceDisabled = flagMap.get(CRITICAL_KILL_SWITCHES.AI_VOICE)?.enabled;

      if (aiEnabled && aiVoiceDisabled) {
        violations.push({
          severity: "WARNING",
          flagKey: "ai.enabled",
          message: "AI is enabled but voice calls are disabled",
          recommendation: "Consider enabling AI voice or clarify feature scope",
        });
      }

      // Rule: Production launch + global freeze = contradiction
      const productionLaunch = flagMap.get(CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH)?.enabled;
      const globalFreeze = flagMap.get(CRITICAL_KILL_SWITCHES.GLOBAL_FREEZE)?.enabled;

      if (productionLaunch && globalFreeze) {
        violations.push({
          severity: "CRITICAL",
          flagKey: CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH,
          message: "Production is launched but global freeze is active",
          recommendation: "Disable global freeze or disable production launch",
        });
      }
    } catch (error) {
      console.error("[Validators] Error checking contradictory flags:", error);
    }

    return violations;
  }

  /**
   * Check panic system configuration
   */
  private static async checkPanicSystem(
    environment: FeatureEnvironment
  ): Promise<FeatureFlagViolation[]> {
    const violations: FeatureFlagViolation[] = [];

    try {
      const panicFlag = await FeatureFlagService.getFeatureFlag(
        CRITICAL_KILL_SWITCHES.PANIC_SYSTEM,
        environment
      );

      // Panic system must NEVER be disabled in production
      if (environment === "prod" && panicFlag?.enabled) {
        violations.push({
          severity: "CRITICAL",
          flagKey: CRITICAL_KILL_SWITCHES.PANIC_SYSTEM,
          message: "CRITICAL: Panic system is DISABLED in production",
          recommendation: "Enable panic system immediately - this is a safety violation",
        });
      }

      // If panic system doesn't exist at all
      if (!panicFlag && environment === "prod") {
        violations.push({
          severity: "CRITICAL",
          flagKey: CRITICAL_KILL_SWITCHES.PANIC_SYSTEM,
          message: "CRITICAL: Panic system flag does not exist",
          recommendation: "Initialize panic system flag immediately",
        });
      }
    } catch (error) {
      console.error("[Validators] Error checking panic system:", error);
    }

    return violations;
  }

  /**
   * Check withdrawal/KYC dependency
   */
  private static async checkWithdrawalKYCDependency(
    environment: FeatureEnvironment
  ): Promise<FeatureFlagViolation[]> {
    const violations: FeatureFlagViolation[] = [];

    try {
      const withdrawalsDisabled = await FeatureFlagService.getFeatureFlag(
        CRITICAL_KILL_SWITCHES.WITHDRAWALS,
        environment
      );

      // If withdrawals are enabled, ensure KYC system is operational
      if (withdrawalsDisabled && !withdrawalsDisabled.enabled) {
        // Check if verification system checklist item passes
        const checklist = await LaunchChecklistService.getChecklist();
        const kycItem = checklist?.items["auth.verification.working"];

        if (!kycItem?.passed) {
          violations.push({
            severity: "ERROR",
            flagKey: CRITICAL_KILL_SWITCHES.WITHDRAWALS,
            message: "Withdrawals enabled but KYC system not verified",
            recommendation: "Verify KYC system or disable withdrawals",
          });
        }
      }
    } catch (error) {
      console.error("[Validators] Error checking withdrawal/KYC dependency:", error);
    }

    return violations;
  }

  /**
   * Check for test flags active in production
   */
  private static async checkTestFlagsInProduction(
    environment: FeatureEnvironment
  ): Promise<FeatureFlagViolation[]> {
    const violations: FeatureFlagViolation[] = [];

    if (environment !== "prod") {
      return violations; // Only check in production
    }

    try {
      const allFlags = await FeatureFlagService.getAllFlags(environment);

      for (const flag of allFlags) {
        // Check for test/debug patterns in flag keys
        if (
          flag.enabled &&
          (flag.key.includes("test") ||
            flag.key.includes("debug") ||
            flag.key.includes("dev") ||
            flag.key.includes("mock"))
        ) {
          violations.push({
            severity: "WARNING",
            flagKey: flag.key,
            message: `Test flag "${flag.key}" is active in production`,
            recommendation: "Disable test flags in production environment",
          });
        }
      }
    } catch (error) {
      console.error("[Validators] Error checking test flags:", error);
    }

    return violations;
  }

  /**
   * Check that all critical kill-switches exist
   */
  private static async checkCriticalKillSwitches(
    environment: FeatureEnvironment
  ): Promise<FeatureFlagViolation[]> {
    const violations: FeatureFlagViolation[] = [];

    try {
      const requiredSwitches = Object.values(CRITICAL_KILL_SWITCHES);
      const allFlags = await FeatureFlagService.getAllFlags(environment);
      const existingKeys = new Set(allFlags.map((f) => f.key));

      for (const switchKey of requiredSwitches) {
        if (!existingKeys.has(switchKey)) {
          violations.push({
            severity: "CRITICAL",
            flagKey: switchKey,
            message: `Critical kill-switch "${switchKey}" does not exist`,
            recommendation: "Initialize all critical kill-switches immediately",
          });
        }
      }
    } catch (error) {
      console.error("[Validators] Error checking critical kill-switches:", error);
    }

    return violations;
  }

  /**
   * Check production launch prerequisites
   */
  private static async checkProductionLaunchPrerequisites(): Promise<
    FeatureFlagViolation[]
  > {
    const violations: FeatureFlagViolation[] = [];

    try {
      const productionLaunch = await FeatureFlagService.getFeatureFlag(
        CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH,
        "prod"
      );

      // If production launch is enabled, check prerequisites
      if (productionLaunch?.enabled) {
        const validation = await LaunchChecklistService.validateProductionLaunch("prod");

        if (!validation.valid) {
          violations.push({
            severity: "CRITICAL",
            flagKey: CRITICAL_KILL_SWITCHES.PRODUCTION_LAUNCH,
            message: "Production launch enabled but prerequisites not met",
            recommendation: validation.reasons.join("; "),
          });
        }
      }
    } catch (error) {
      console.error("[Validators] Error checking production launch:", error);
    }

    return violations;
  }

  /**
   * Handle discovered violations
   */
  private static async handleViolations(
    violations: FeatureFlagViolation[],
    environment: FeatureEnvironment
  ): Promise<void> {
    try {
      // Emit telemetry for all violations
      for (const violation of violations) {
        await this.emitTelemetry(violation, environment);
      }

      // Create support ticket for CRITICAL issues
      const criticalViolations = violations.filter((v) => v.severity === "CRITICAL");
      if (criticalViolations.length > 0) {
        await this.createSafetyTicket(criticalViolations, environment);
      }

      // Notify administrators
      await this.notifyAdministrators(violations, environment);
    } catch (error) {
      console.error("[Validators] Error handling violations:", error);
    }
  }

  /**
   * Emit telemetry event for violation
   */
  private static async emitTelemetry(
    violation: FeatureFlagViolation,
    environment: FeatureEnvironment
  ): Promise<void> {
    try {
      await db.collection("telemetry").add({
        type: "feature_flag_violation",
        severity: violation.severity,
        environment,
        flagKey: violation.flagKey,
        message: violation.message,
        recommendation: violation.recommendation,
        timestamp: Date.now(),
      });

      console.log(
        `[Validators] Telemetry emitted: ${violation.severity} - ${violation.message}`
      );
    } catch (error) {
      console.error("[Validators] Error emitting telemetry:", error);
    }
  }

  /**
   * Create automatic safety support ticket
   */
  private static async createSafetyTicket(
    violations: FeatureFlagViolation[],
    environment: FeatureEnvironment
  ): Promise<void> {
    try {
      const ticketContent = violations
        .map(
          (v) =>
            `[${v.severity}] ${v.flagKey}: ${v.message}\nRecommendation: ${v.recommendation}`
        )
        .join("\n\n");

      await db.collection("support_tickets").add({
        type: "safety_violation",
        priority: "CRITICAL",
        environment,
        title: `Critical Feature Flag Violations Detected - ${environment}`,
        description: ticketContent,
        status: "open",
        createdAt: Date.now(),
        createdBy: "system_validator",
        tags: ["safety", "feature_flags", "automated"],
        violationCount: violations.length,
      });

      console.log(
        `[Validators] Safety ticket created for ${violations.length} violations`
      );
    } catch (error) {
      console.error("[Validators] Error creating safety ticket:", error);
    }
  }

  /**
   * Notify administrators about violations
   */
  private static async notifyAdministrators(
    violations: FeatureFlagViolation[],
    environment: FeatureEnvironment
  ): Promise<void> {
    try {
      // Get all admin users
      const admins = await db
        .collection("users")
        .where("role", "==", "admin")
        .get();

      const notification = {
        type: "feature_flag_violation",
        priority: violations.some((v) => v.severity === "CRITICAL")
          ? "urgent"
          : "high",
        title: `Feature Flag Violations - ${environment}`,
        message: `${violations.length} violations detected. Check admin panel for details.`,
        timestamp: Date.now(),
        data: {
          environment,
          violationCount: violations.length,
          criticalCount: violations.filter((v) => v.severity === "CRITICAL").length,
        },
      };

      // Send notification to each admin
      const batch = db.batch();
      for (const admin of admins.docs) {
        const notificationRef = db
          .collection("users")
          .doc(admin.id)
          .collection("notifications")
          .doc();
        batch.set(notificationRef, notification);
      }
      await batch.commit();

      console.log(`[Validators] Notified ${admins.size} administrators`);
    } catch (error) {
      console.error("[Validators] Error notifying administrators:", error);
    }
  }

  /**
   * Generate validation report
   */
  static async generateReport(
    environment: FeatureEnvironment = "prod"
  ): Promise<string> {
    try {
      const result = await this.validateLaunchState(environment);

      let report = `# Feature Flag Validation Report\n`;
      report += `Environment: ${environment}\n`;
      report += `Timestamp: ${new Date().toISOString()}\n`;
      report += `Status: ${result.valid ? "✓ VALID" : "✗ VIOLATIONS DETECTED"}\n\n`;

      if (result.violations.length === 0) {
        report += `All checks passed. No violations detected.\n`;
      } else {
        report += `## Violations (${result.violations.length})\n\n`;

        const critical = result.violations.filter((v) => v.severity === "CRITICAL");
        const errors = result.violations.filter((v) => v.severity === "ERROR");
        const warnings = result.violations.filter((v) => v.severity === "WARNING");

        if (critical.length > 0) {
          report += `### CRITICAL (${critical.length})\n`;
          for (const v of critical) {
            report += `- **${v.flagKey}**: ${v.message}\n`;
            report += `  Recommendation: ${v.recommendation}\n\n`;
          }
        }

        if (errors.length > 0) {
          report += `### ERRORS (${errors.length})\n`;
          for (const v of errors) {
            report += `- **${v.flagKey}**: ${v.message}\n`;
            report += `  Recommendation: ${v.recommendation}\n\n`;
          }
        }

        if (warnings.length > 0) {
          report += `### WARNINGS (${warnings.length})\n`;
          for (const v of warnings) {
            report += `- **${v.flagKey}**: ${v.message}\n`;
            report += `  Recommendation: ${v.recommendation}\n\n`;
          }
        }
      }

      return report;
    } catch (error) {
      return `Error generating report: ${error}`;
    }
  }
}

/**
 * Convenience helper for daily validation
 */
export async function validateLaunchState(
  environment: FeatureEnvironment = "prod"
): Promise<FeatureFlagValidationResult> {
  return ValidatorService.validateLaunchState(environment);
}

/**
 * Convenience helper for generating reports
 */
export async function generateValidationReport(
  environment: FeatureEnvironment = "prod"
): Promise<string> {
  return ValidatorService.generateReport(environment);
}
