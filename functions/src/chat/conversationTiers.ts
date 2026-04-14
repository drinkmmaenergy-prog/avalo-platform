import { MONETIZATION_SPLITS, SPLITS } from "../config/monetizationSplits";

export type ConversationTier=
 | "STANDARD"
 | "VIP"
 | "ROYAL"
 | "PRIVATE"

export interface TierConfig{
 tier:ConversationTier
 multiplier:number
}


















