// Stub types for KPI
export interface KPIMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  period: string;
}

export interface KPIReport {
  metrics: KPIMetric[];
  period: string;
  generatedAt: any;
}

export interface KPIEvent {
  eventType: string;
  value: number;
  userId?: string;
  timestamp: any;
}

export type KPIPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
