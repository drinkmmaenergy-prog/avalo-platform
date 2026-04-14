import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export declare const COMPLIANCE_REGIONS: readonly ["EU", "US", "UK", "APAC"];
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
export declare const GDPR_REQUIREMENTS: ComplianceRule[];
export declare const CCPA_REQUIREMENTS: ComplianceRule[];




























