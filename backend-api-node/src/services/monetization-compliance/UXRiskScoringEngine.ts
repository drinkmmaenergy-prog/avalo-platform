/**
 * PACK 444: Monetization UX Integrity & Dark Pattern Defense
 * UXRiskScoringEngine - Risk scoring with threshold-based blocking
 * 
 * Each paywall/offer/upsell receives a risk score
 * Blocks activation if score exceeds compliance-approved threshold
 */

import DarkPatternDetectionService, { DarkPatternType, RiskLevel, FlowAnalysis } from './DarkPatternDetectionService';
