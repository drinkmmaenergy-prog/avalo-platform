import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

// Pack 414 - Integration Registry
export interface IntegrationConfig {
  id?: string;
  name?: string;
  type?: IntegrationType;
  enabled?: boolean;
  credentials?: Record<string, any>;
  settings?: Record<string, any>;
  [key: string]: any;
}

export type IntegrationType = 
  | 'PAYMENT'
  | 'ANALYTICS'
  | 'NOTIFICATION'
  | 'STORAGE'
  | 'AI'
  | 'MODERATION';

export interface IntegrationRequest {
  integrationId?: string;
  action?: string;
  payload?: any;
  auth?: any;
  [key: string]: any;
}

export interface IntegrationResponse {
  success?: boolean;
  data?: any;
  error?: string;
  [key: string]: any;
}

export interface IntegrationHealth {
  integrationId?: string;
  status?: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  lastChecked?: any;
  latencyMs?: number;
  [key: string]: any;
}

export const INTEGRATION_REGISTRY: Record<string, IntegrationConfig> = {};

export function getIntegration(id: string): IntegrationConfig | undefined {
  return INTEGRATION_REGISTRY[id];
}


// Additional exports for pack414-integration-audit.ts
export type IntegrationStatusType = 'ACTIVE' | 'INACTIVE' | 'DEGRADED' | 'FAILED';

// IntegrationStatus as interface for pack414-integration-audit.ts
export interface IntegrationStatus {
  packId?: string;
  category?: string;
  ready?: boolean;
  lastVerifiedAt?: any;
  missingDependencies?: string[];
  comments?: string;
  module?: string;
  status?: IntegrationStatusType;
  [key: string]: any;
}

export interface GreenlightStatus {
  overall?: boolean | string;
  status?: 'GREEN' | 'YELLOW' | 'RED';
  [key: string]: any;
}

export function getGreenlightStatus(integrationId: string): GreenlightStatus {
  return { status: 'GREEN', overall: true };
}

export const CRITICAL_LAUNCH_REQUIREMENTS: string[] = [
  'PAYMENT_GATEWAY',
  'AUTH_SERVICE',
  'DATABASE',
  'STORAGE',
  'MODERATION',
];

export const AvaloIntegrationRegistry = INTEGRATION_REGISTRY;


























