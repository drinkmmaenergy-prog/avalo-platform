export interface EnforcementAction  {
    id: string;
    type: 'WARNING' | 'SUSPENSION' | 'BAN' | 'RESTRICTION';
    userId: string;
    reason: string;
    duration?: number;
    createdAt: any;
  [key: string]: any;
}
export interface EnforcementPolicy  {
    id: string;
    name: string;
    triggers: string[];
    actions: string[];
  [key: string]: any;
}
export type EnforcementSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';









