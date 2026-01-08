/**
 * PACK 55 — GDPR Service
 * Manages GDPR data requests (erasure and export)
 */

import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

// ============================================================================
// TYPES
// ============================================================================

export type GDPRRequestStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED';

export interface GDPRErasureRequest {
  requestId: string;
  userId: string;
  status: GDPRRequestStatus;
  reason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GDPRExportRequest {
  requestId: string;
  userId: string;
  status: GDPRRequestStatus;
  downloadUrl?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Request data erasure (Right to be forgotten)
 */
export async function requestDataErasure(
  userId: string,
  reason?: string
): Promise<{ requestId: string; status: GDPRRequestStatus }> {
  try {
    const requestErasureCallable = httpsCallable(functions, 'gdpr_requestErasure');
    const result = await requestErasureCallable({ userId, reason });
    const data = result.data as any;

    return {
      requestId: data.requestId,
      status: data.status,
    };
  } catch (error) {
    console.error('[GDPRService] Error requesting data erasure:', error);
    throw error;
  }
}

/**
 * Request data export (Right to data portability)
 */
export async function requestDataExport(
  userId: string
): Promise<{ requestId: string; status: GDPRRequestStatus }> {
  try {
    const requestExportCallable = httpsCallable(functions, 'gdpr_requestExport');
    const result = await requestExportCallable({ userId });
    const data = result.data as any;

    return {
      requestId: data.requestId,
      status: data.status,
    };
  } catch (error) {
    console.error('[GDPRService] Error requesting data export:', error);
    throw error;
  }
}