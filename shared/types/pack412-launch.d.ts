export interface LaunchConfig {
    id: string;
    name: string;
    targetDate: any;
    regions: string[];
    features: string[];
}
export interface LaunchMetrics {
    downloads: number;
    activeUsers: number;
    retention: number;
    revenue: number;
}
export interface GrowthTarget {
    metric: string;
    target: number;
    current: number;
    deadline: any;
}
