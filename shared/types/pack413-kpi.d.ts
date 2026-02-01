export interface KPICommandConfig {
    id: string;
    name: string;
    thresholds: Record<string, number>;
    alerts: AlertConfig[];
}
export interface AlertConfig {
    metric: string;
    condition: 'ABOVE' | 'BELOW';
    threshold: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
export interface PanicMode {
    id: string;
    name: string;
    trigger: string;
    actions: string[];
    active: boolean;
}
