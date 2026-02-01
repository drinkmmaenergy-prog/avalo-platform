export interface MetricDefinition {
    name: string;
    type: 'COUNTER' | 'GAUGE' | 'HISTOGRAM';
    description: string;
    labels: string[];
}
export interface AlertRule {
    id: string;
    metric: string;
    condition: string;
    threshold: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}
export interface HealthCheck {
    name: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    lastCheck: any;
    details?: Record<string, any>;
}
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
