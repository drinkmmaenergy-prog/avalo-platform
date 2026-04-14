import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface KPIMetric  {
    name: string;
    value: number;
    target: number;
    unit: string;
    period: string;
  [key: string]: any;
}
export interface KPIReport  {
    metrics: KPIMetric[];
    period: string;
    generatedAt: any;
  [key: string]: any;
}
export interface KPIEvent  {
    eventType: string;
    value: number;
    userId?: string;
    timestamp: any;
  [key: string]: any;
}
export type KPIPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';




























