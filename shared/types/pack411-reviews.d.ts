export interface StoreReview {
    id: string;
    platform: 'IOS' | 'ANDROID';
    rating: number;
    title?: string;
    content: string;
    authorName?: string;
    createdAt: any;
    version?: string;
}
export interface ReviewAnalysis {
    sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
    topics: string[];
    actionRequired: boolean;
}
export interface ReputationScore {
    overall: number;
    ios: number;
    android: number;
    trend: 'UP' | 'DOWN' | 'STABLE';
}
