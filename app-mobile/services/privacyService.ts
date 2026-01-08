/**
 * PACK 64 — Privacy Center Service
 * 
 * Handles GDPR data export and deletion requests
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../lib/firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

export type ExportJobStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "READY"
  | "FAILED"
  | "CANCELLED";

export interface ExportJob {
  jobId: string;
  status: ExportJobStatus;
  requestedAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  failedAt?: number | null;
  expiresAt?: number | null;
  fileSizeBytes?: number | null;
  errorMessage?: string | null;
}

export type DeletionJobStatus =
  | "REQUESTED"
  | "IN_REVIEW"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export interface DeletionJob {
  jobId: string;
  status: DeletionJobStatus;
  requestedAt: number;
  reviewedAt?: number | null;
  scheduledFor?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
  rejectedAt?: number | null;
  userReason?: string | null;
  rejectionReason?: string | null;
}

// ============================================================================
// STORAGE KEYS
// ============================================================================

const getExportJobKey = (userId: string) => `privacy_export_job_v1_${userId}`;
const getDeletionJobKey = (userId: string) => `privacy_deletion_job_v1_${userId}`;

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Request a new data export
 */
export async function requestExport(userId: string): Promise<ExportJob> {
  try {
    const requestExportFn = httpsCallable(functions, "requestExport");
    const result = await requestExportFn({ userId });
    const data = result.data as any;

    const job: ExportJob = {
      jobId: data.jobId,
      status: data.status,
      requestedAt: data.requestedAt,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      expiresAt: data.expiresAt || null,
      fileSizeBytes: null,
      errorMessage: null,
    };

    // Cache locally
    await AsyncStorage.setItem(getExportJobKey(userId), JSON.stringify(job));

    return job;
  } catch (error: any) {
    console.error("Error requesting export:", error);
    throw new Error(error.message || "Failed to request export");
  }
}

/**
 * Fetch export job status from backend
 */
export async function fetchExportStatus(userId: string): Promise<ExportJob | null> {
  try {
    const getExportStatusFn = httpsCallable(functions, "getExportStatus");
    const result = await getExportStatusFn({ userId });
    const data = result.data as any;

    if (!data) {
      // Clear cache if no job exists
      await AsyncStorage.removeItem(getExportJobKey(userId));
      return null;
    }

    const job: ExportJob = {
      jobId: data.jobId,
      status: data.status,
      requestedAt: data.requestedAt,
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
      failedAt: data.failedAt || null,
      expiresAt: data.expiresAt || null,
      fileSizeBytes: data.fileSizeBytes || null,
      errorMessage: data.errorMessage || null,
    };

    // Update cache
    await AsyncStorage.setItem(getExportJobKey(userId), JSON.stringify(job));

    return job;
  } catch (error: any) {
    console.error("Error fetching export status:", error);
    
    // Try to return cached version on error
    const cached = await AsyncStorage.getItem(getExportJobKey(userId));
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }
}

/**
 * Get cached export job (for immediate display)
 */
export async function getCachedExportJob(userId: string): Promise<ExportJob | null> {
  try {
    const cached = await AsyncStorage.getItem(getExportJobKey(userId));
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error("Error getting cached export job:", error);
    return null;
  }
}

/**
 * Download export file
 * Returns the download URL from the backend
 */
export async function downloadExport(
  userId: string,
  jobId: string
): Promise<string> {
  try {
    // First get the job to retrieve the download token
    const job = await fetchExportStatus(userId);
    
    if (!job || job.status !== "READY") {
      throw new Error("Export not ready for download");
    }

    // Get the cached job which should have the token
    const cached = await AsyncStorage.getItem(getExportJobKey(userId));
    if (!cached) {
      throw new Error("Export job not found in cache");
    }

    const cachedJob = JSON.parse(cached);
    
    // Call backend to get signed download URL
    // Note: The downloadToken is stored in the backend job, not exposed to client
    // We'll need to modify this to work with the backend's security model
    const downloadExportFn = httpsCallable(functions, "downloadExport");
    const result = await downloadExportFn({ 
      userId, 
      jobId,
      token: "REQUEST_FROM_BACKEND" // Backend will validate user ownership
    });
    
    const data = result.data as any;
    return data.downloadUrl;
  } catch (error: any) {
    console.error("Error downloading export:", error);
    throw new Error(error.message || "Failed to download export");
  }
}

// ============================================================================
// DELETION FUNCTIONS
// ============================================================================

/**
 * Request account deletion
 */
export async function requestDeletion(
  userId: string,
  userReason?: string
): Promise<DeletionJob> {
  try {
    const requestDeletionFn = httpsCallable(functions, "requestDeletion");
    const result = await requestDeletionFn({ userId, userReason });
    const data = result.data as any;

    const job: DeletionJob = {
      jobId: data.jobId,
      status: data.status,
      requestedAt: data.requestedAt,
      reviewedAt: null,
      scheduledFor: data.scheduledFor || null,
      startedAt: null,
      completedAt: null,
      rejectedAt: null,
      userReason: userReason || null,
      rejectionReason: null,
    };

    // Cache locally
    await AsyncStorage.setItem(getDeletionJobKey(userId), JSON.stringify(job));

    return job;
  } catch (error: any) {
    console.error("Error requesting deletion:", error);
    throw new Error(error.message || "Failed to request deletion");
  }
}

/**
 * Fetch deletion job status from backend
 */
export async function fetchDeletionStatus(userId: string): Promise<DeletionJob | null> {
  try {
    const getDeletionStatusFn = httpsCallable(functions, "getDeletionStatus");
    const result = await getDeletionStatusFn({ userId });
    const data = result.data as any;

    if (!data) {
      // Clear cache if no job exists
      await AsyncStorage.removeItem(getDeletionJobKey(userId));
      return null;
    }

    const job: DeletionJob = {
      jobId: data.jobId,
      status: data.status,
      requestedAt: data.requestedAt,
      reviewedAt: data.reviewedAt || null,
      scheduledFor: data.scheduledFor || null,
      startedAt: data.startedAt || null,
      completedAt: data.completedAt || null,
      rejectedAt: data.rejectedAt || null,
      userReason: data.userReason || null,
      rejectionReason: data.rejectionReason || null,
    };

    // Update cache
    await AsyncStorage.setItem(getDeletionJobKey(userId), JSON.stringify(job));

    return job;
  } catch (error: any) {
    console.error("Error fetching deletion status:", error);
    
    // Try to return cached version on error
    const cached = await AsyncStorage.getItem(getDeletionJobKey(userId));
    if (cached) {
      return JSON.parse(cached);
    }
    
    return null;
  }
}

/**
 * Get cached deletion job (for immediate display)
 */
export async function getCachedDeletionJob(userId: string): Promise<DeletionJob | null> {
  try {
    const cached = await AsyncStorage.getItem(getDeletionJobKey(userId));
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.error("Error getting cached deletion job:", error);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

/**
 * Format timestamp for display
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

/**
 * Calculate days until scheduled deletion
 */
export function daysUntilDeletion(scheduledFor: number): number {
  const now = Date.now();
  const diff = scheduledFor - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}