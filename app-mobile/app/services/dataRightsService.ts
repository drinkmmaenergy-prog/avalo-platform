/**
 * Data Rights Service
 * Handles GDPR data export and account deletion requests
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from "@/lib/firebase";

export type DataExportStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'READY' 
  | 'FAILED' 
  | 'EXPIRED';

export type DeletionRequestStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'REJECTED' 
  | 'FAILED';

export interface DataExportRequest {
  id: string;
  status: DataExportStatus;
  createdAt: number;
  completedAt?: number;
  downloadUrl?: string;
  expiresAt?: number;
  errorMessage?: string;
  fileSize?: number;
}

export interface DeletionRequest {
  id: string;
  status: DeletionRequestStatus;
  createdAt: number;
  completedAt?: number;
  rejectionReason?: string;
}

export interface RequestDataExportResponse {
  success: boolean;
  requestId?: string;
  message: string;
  estimatedTime?: string;
  error?: string;
}

export interface GetDataExportsResponse {
  success: boolean;
  exports: DataExportRequest[];
}

export interface RequestAccountDeletionResponse {
  success: boolean;
  requestId?: string;
  message: string;
  warning?: string;
  error?: string;
}

export interface GetDeletionStatusResponse {
  success: boolean;
  hasPendingDeletion: boolean;
  request?: DeletionRequest;
}

/**
 * Request a data export
 * Creates a new export job for the authenticated user
 */
export async function requestDataExport(): Promise<RequestDataExportResponse> {
  try {
    const callable = httpsCallable<void, RequestDataExportResponse>(
      functions,
      'requestDataExport'
    );
    const result = await callable();
    return result.data;
  } catch (error: any) {
    console.error('[DataRights] Failed to request data export:', error);
    return {
      success: false,
      message: 'Failed to request data export. Please try again.',
      error: error.message,
    };
  }
}

/**
 * Get all data export requests for the authenticated user
 */
export async function getMyDataExports(): Promise<GetDataExportsResponse> {
  try {
    const callable = httpsCallable<void, GetDataExportsResponse>(
      functions,
      'getMyDataExports'
    );
    const result = await callable();
    return result.data;
  } catch (error: any) {
    console.error('[DataRights] Failed to get data exports:', error);
    return {
      success: false,
      exports: [],
    };
  }
}

/**
 * Request account deletion
 * Requires explicit confirmation text "DELETE"
 */
export async function requestAccountDeletion(
  confirmationText: string,
  reason?: string
): Promise<RequestAccountDeletionResponse> {
  try {
    const callable = httpsCallable<
      { confirmationText: string; reason?: string },
      RequestAccountDeletionResponse
    >(functions, 'requestAccountDeletion');
    
    const result = await callable({ confirmationText, reason });
    return result.data;
  } catch (error: any) {
    console.error('[DataRights] Failed to request account deletion:', error);
    return {
      success: false,
      message: error.message || 'Failed to request account deletion. Please try again.',
      error: error.message,
    };
  }
}

/**
 * Get deletion request status for the authenticated user
 */
export async function getMyDeletionStatus(): Promise<GetDeletionStatusResponse> {
  try {
    const callable = httpsCallable<void, GetDeletionStatusResponse>(
      functions,
      'getMyDeletionStatus'
    );
    const result = await callable();
    return result.data;
  } catch (error: any) {
    console.error('[DataRights] Failed to get deletion status:', error);
    return {
      success: false,
      hasPendingDeletion: false,
    };
  }
}

/**
 * Download data export file
 * Opens the signed URL in a browser
 */
export function downloadDataExport(downloadUrl: string): void {
  if (typeof window !== 'undefined' && window.open) {
    window.open(downloadUrl, '_blank');
  }
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return 'Unknown';
  
  const kb = bytes / 1024;
  const mb = kb / 1024;
  
  if (mb >= 1) {
    return `${mb.toFixed(2)} MB`;
  } else if (kb >= 1) {
    return `${kb.toFixed(2)} KB`;
  } else {
    return `${bytes} bytes`;
  }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return 'N/A';
  
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Check if export is expired
 */
export function isExportExpired(expiresAt?: number): boolean {
  if (!expiresAt) return false;
  return Date.now() > expiresAt;
}

/**
 * Get status badge color
 */
export function getStatusColor(status: DataExportStatus | DeletionRequestStatus): string {
  switch (status) {
    case 'PENDING':
      return '#FFA500'; // Orange
    case 'PROCESSING':
      return '#2196F3'; // Blue
    case 'READY':
    case 'COMPLETED':
      return '#4CAF50'; // Green
    case 'FAILED':
    case 'REJECTED':
      return '#F44336'; // Red
    case 'EXPIRED':
      return '#9E9E9E'; // Gray
    default:
      return '#757575';
  }
}

/**
 * Get user-friendly status text
 */
export function getStatusText(status: DataExportStatus | DeletionRequestStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'PROCESSING':
      return 'Processing';
    case 'READY':
      return 'Ready';
    case 'COMPLETED':
      return 'Completed';
    case 'FAILED':
      return 'Failed';
    case 'REJECTED':
      return 'Rejected';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'Unknown';
  }
}
