/**
 * PACK 419 — Enforcement Engine
 * Shared enforcement domain types
 */

export enum EnforcementDecision {
  ALLOW = 'ALLOW',
  REVIEW = 'REVIEW',
  BLOCK = 'BLOCK',
}

export enum EnforcementScope {
  USER = 'USER',
  CREATOR = 'CREATOR',
  CONTENT = 'CONTENT',
  MESSAGE = 'MESSAGE',
  TRANSACTION = 'TRANSACTION',
}

export enum EnforcementActionType {
  WARNING = 'WARNING',
  TEMP_SUSPENSION = 'TEMP_SUSPENSION',
  PERMANENT_BAN = 'PERMANENT_BAN',
  CONTENT_REMOVAL = 'CONTENT_REMOVAL',
  SHADOW_BAN = 'SHADOW_BAN',
}

export interface EnforcementAction {
  id: string;
  scope: EnforcementScope;
  actionType: EnforcementActionType;
  decision: EnforcementDecision;
  reason: string;
  createdAt: number;
  expiresAt?: number;
  actorId?: string;
}

export interface EnforcementRule {
  id: string;
  scope: EnforcementScope;
  threshold: number;
  actionType: EnforcementActionType;
  enabled: boolean;
}

export interface EnforcementEvent {
  id: string;
  scope: EnforcementScope;
  targetId: string;
  decision: EnforcementDecision;
  triggeredBy: string;
  createdAt: number;
}
