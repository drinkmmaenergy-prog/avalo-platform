import { MONETIZATION_SPLITS, SPLITS } from "../../../config/monetizationSplits";

export interface ModerationLabels  {
    adult?: boolean;
    violence?: boolean;
    racy?: boolean;
    spoof?: boolean;
    medical?: boolean;
  [key: string]: any;
}
export interface ModerationResult  {
    safe: boolean;
    labels: ModerationLabels;
    confidence: number;
    action: 'ALLOW' | 'FLAG' | 'BLOCK';
  [key: string]: any;
}
export interface ModerationContext  {
    userId: string;
    contentType: string;
    source: string;
  [key: string]: any;
}
export interface ModerationDecision  {
    action: 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW';
    reason?: string;
    confidence: number;
  [key: string]: any;
}
export interface ContentModerationRecord  {
    id: string;
    contentId: string;
    userId: string;
    result: ModerationResult;
    decision: ModerationDecision;
    createdAt: any;
  [key: string]: any;
}
export type ModerationAction = 'ALLOW' | 'FLAG' | 'BLOCK' | 'REVIEW';




























