import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

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
export declare const INTEGRATION_REGISTRY: Record<string, IntegrationEntry>;




























