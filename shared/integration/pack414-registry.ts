// Stub types for pack414 registry
export interface IntegrationEntry {
  id: string;
  name: string;
  type: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  version: string;
}

export interface AuditResult {
  integrationId: string;
  passed: boolean;
  issues: string[];
  timestamp: any;
}

export const INTEGRATION_REGISTRY: Record<string, IntegrationEntry> = {};
