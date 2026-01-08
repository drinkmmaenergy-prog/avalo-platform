/**
 * PACK 400 - Retention Engine Consolidation
 * Type Exports for unified retention engine (PACK 301 + 301A + 301B)
 * 
 * This file re-exports all core types from the retention engine subsystems
 * to provide a single, canonical import point for other packs.
 */

// ============================================================================
// CORE TYPES (PACK 301)
// ============================================================================

export {
  OnboardingStage,
  UserSegment,
  NudgeTrigger,
  UserRetentionProfile,
  RetentionNotificationType,
  NudgeTemplate,
  RetentionEvent,
  RetentionMetrics,
  ChurnRiskFactors,
  WinBackMessage,
  RetentionAuditEvent,
  RETENTION_CONSTANTS,
  NUDGE_TEMPLATES,
  WIN_BACK_MESSAGES,
} from '../pack301-retention-types';

// ============================================================================
// SERVICE TYPES (PACK 301A)
// ============================================================================

export type {
  ActivityType,
  ActivityMetadata,
} from '../pack301-retention-service';

export {
  RETENTION_THRESHOLDS,
} from '../pack301-retention-service';
