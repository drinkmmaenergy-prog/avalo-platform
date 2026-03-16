import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface MetricDefinition  {
    name: string;
    type: 'COUNTER' | 'GAUGE' | 'HISTOGRAM';
    description: string;
    labels: string[];
  [key: string]: any;
}
export interface AlertRule  {
    id: string;
    metric: string;
    condition: string;
    threshold: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  [key: string]: any;
}
export interface HealthCheck  {
    name: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
    lastCheck: any;
    details?: Record<string, any>;
  [key: string]: any;
}
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';


























