export interface ModerationLabels {
    adult?: boolean;
    violence?: boolean;
    racy?: boolean;
    spoof?: boolean;
    medical?: boolean;
}
export interface ModerationResult {
    safe: boolean;
    labels: ModerationLabels;
    confidence: number;
    action: 'ALLOW' | 'FLAG' | 'BLOCK';
}
export interface ModerationContext {
    userId: string;
    contentType: string;
    source: string;
}
export interface ModerationDecision {
    action: 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW';
    reason?: string;
    confidence: number;
}
export interface ContentModerationRecord {
    id: string;
    contentId: string;
    userId: string;
    result: ModerationResult;
    decision: ModerationDecision;
    createdAt: any;
}
export type ModerationAction = 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW';
