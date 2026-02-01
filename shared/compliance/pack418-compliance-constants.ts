// Stub types for pack418 compliance
export const COMPLIANCE_REGIONS = ['EU', 'US', 'UK', 'APAC'] as const;
export type ComplianceRegion = typeof COMPLIANCE_REGIONS[number];

export interface ComplianceRule {
  id: string;
  region: ComplianceRegion;
  requirement: string;
  mandatory: boolean;
}

export interface ComplianceStatus {
  region: ComplianceRegion;
  compliant: boolean;
  issues: string[];
}

export const GDPR_REQUIREMENTS: ComplianceRule[] = [];
export const CCPA_REQUIREMENTS: ComplianceRule[] = [];
