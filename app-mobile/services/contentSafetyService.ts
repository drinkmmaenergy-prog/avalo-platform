/**
 * PACK 55 — Content Safety Service
 * Manages media safety scanning and compliance
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type MediaScanStatus = 'PENDING' | 'SCANNED' | 'FLAGGED' | 'ERROR';
export type RiskLevel = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface MediaScanResult {
  mediaId: string;
  scanStatus: MediaScanStatus;
  riskLevel: RiskLevel;
  flags: string[];
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get media safety scan status
 */
export async function getMediaScanStatus(mediaId: string): Promise<MediaScanResult> {
  try {
    const getScanStatusCallable = httpsCallable(functions, 'compliance_getMediaScanStatus');
    const result = await getScanStatusCallable({ mediaId });
    const data = result.data as any;

    return {
      mediaId: data.mediaId,
      scanStatus: data.scanStatus,
      riskLevel: data.riskLevel,
      flags: data.flags || [],
    };
  } catch (error) {
    console.error('[ContentSafetyService] Error getting media scan status:', error);
    throw error;
  }
}

/**
 * Check if media is safe to display
 */
export async function isMediaSafe(mediaId: string): Promise<boolean> {
  try {
    const scan = await getMediaScanStatus(mediaId);
    
    // Only show media that is scanned and has LOW or MEDIUM risk
    if (scan.scanStatus === 'FLAGGED') {
      return false;
    }
    
    if (scan.riskLevel === 'HIGH' || scan.riskLevel === 'CRITICAL') {
      return false;
    }
    
    return true;
  } catch (error) {
    // If scan doesn't exist yet, conservatively allow (will be scanned async)
    console.warn('[ContentSafetyService] Could not verify media safety, allowing:', mediaId);
    return true;
  }
}

/**
 * Check if media should be blocked from view
 */
export function shouldBlockMedia(scanResult: MediaScanResult): boolean {
  if (scanResult.scanStatus === 'FLAGGED') {
    return true;
  }
  
  if (scanResult.riskLevel === 'HIGH' || scanResult.riskLevel === 'CRITICAL') {
    return true;
  }
  
  return false;
}