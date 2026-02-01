export interface EnforcementAction {
    id: string;
    type: 'WARNING' | 'SUSPENSION' | 'BAN' | 'RESTRICTION';
    userId: string;
    reason: string;
    duration?: number;
    createdAt: any;
}
export interface EnforcementPolicy {
    id: string;
    name: string;
    triggers: string[];
    actions: string[];
}
export type EnforcementSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
