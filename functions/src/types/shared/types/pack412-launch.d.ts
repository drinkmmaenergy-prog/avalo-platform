import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface LaunchConfig  {
    id: string;
    name: string;
    targetDate: any;
    regions: string[];
    features: string[];
  [key: string]: any;
}
export interface LaunchMetrics  {
    downloads: number;
    activeUsers: number;
    retention: number;
    revenue: number;
  [key: string]: any;
}
export interface GrowthTarget  {
    metric: string;
    target: number;
    current: number;
    deadline: any;
  [key: string]: any;
}




























