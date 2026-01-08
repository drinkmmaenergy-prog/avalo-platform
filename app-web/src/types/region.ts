/**
 * Region Types for Web App
 * PHASE 31A: Global Region Routing
 * 
 * Shared type definitions for region functionality
 */

export type AvaloRegionCode = "EU" | "US" | "ASIA" | "OTHER";

export type RegionSource = "AUTO_LOCALE" | "AUTO_IP" | "AUTO_PHONE" | "MANUAL";

export interface UserRegion {
  code: AvaloRegionCode;
  source: RegionSource;
  lastUpdatedAt: Date | any; // Firestore Timestamp or Date
  manualOverrideAt?: Date | any | null; // Last manual change
}

export interface RegionChangeLog {
  userId: string;
  previousCode: AvaloRegionCode | null;
  newCode: AvaloRegionCode;
  reason: "AUTO_ASSIGN" | "MANUAL_CHANGE";
  source: RegionSource;
  createdAt: Date | any;
}

export const REGION_NAMES: Record<AvaloRegionCode, string> = {
  EU: "Europe",
  US: "United States",
  ASIA: "Asia",
  OTHER: "Other Regions",
};

export const REGION_DESCRIPTIONS: Record<AvaloRegionCode, string> = {
  EU: "European region with Poland as main hub",
  US: "United States and Canada",
  ASIA: "Southeast Asia and East Asia",
  OTHER: "Rest of the world",
};

export const VALID_REGIONS: AvaloRegionCode[] = ["EU", "US", "ASIA", "OTHER"];

/**
 * 30 days cooldown period in milliseconds
 */
export const REGION_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;