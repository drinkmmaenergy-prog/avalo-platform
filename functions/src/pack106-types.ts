import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK106 — Currency / Pricing Types
 * USD Canonical Economy
 */

import { Timestamp } from "firebase-admin/firestore";

/**
 * Currency profile
 */

export interface CurrencyProfile {
  code: "USD";
  name: string;
  symbol: string;

  enabled: boolean;

  priceUSD: number;

  // legacy compatibility fields still referenced in code
  decimalPlaces?: number;
  fxRate?: number;

  taxIncluded?: boolean;
  taxRate?: number;

  supportedPSPs?: string[];

  metadata?: Record<string, any>;

  updatedAt?: Timestamp;
}

/**
 * Request to update currency profile
 */

export interface UpdateCurrencyProfileRequest {
  code: "USD";

  enabled?: boolean;
  priceUSD?: number;

  taxIncluded?: boolean;
  taxRate?: number;

  supportedPSPs?: string[];

  metadata?: Record<string, any>;
}

/**
 * Request to change base token price
 */

export interface SetBaseTokenPriceRequest {
  priceUSD: number;

  // admin audit reason
  reason?: string;
}

/**
 * Token price configuration
 */

export interface BaseTokenPriceConfig {
  priceUSD: number;
  referenceCurrency?: 'USD';
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;

  approvals?: {
    admin1?: string;
    admin2?: string;
        timestamp?: Timestamp;
status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedBy?: string;
    requestedAt?: FirebaseFirestore.Timestamp;
    approvedBy?: string;
    approvedAt?: FirebaseFirestore.Timestamp;
    reason?: string;
  };
}/**
 * Admin dashboard stats
 */

export interface CurrencyDashboardStats {
  fxVarianceWarnings?: { currency:string; expectedRate:number; actualRate:number; variance:number }[];
  totalCurrencies?: number;
  activeCurrencies?: number;

  staleRates?: number;
  lastRefresh?: FirebaseFirestore.Timestamp;

  topCurrencies?: Array<{
    code: string;
    transactions: number;
    volume: number;
  }>;
}//
// AUTO-MERGE HOTFIX (USD canonical build compatibility)
// Do not remove unless you also refactor pack106-admin callsites.
//

export interface BaseTokenPriceConfig {
  priceUSD: number;
  referenceCurrency?: 'USD';
  updatedAt?: FirebaseFirestore.Timestamp;
  updatedBy?: string;

  approvals?: {
    admin1?: string;
    admin2?: string;
        timestamp?: Timestamp;
status?: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedBy?: string;
    requestedAt?: FirebaseFirestore.Timestamp;
    approvedBy?: string;
    approvedAt?: FirebaseFirestore.Timestamp;
    reason?: string;
  };
}export interface CurrencyDashboardStats {
  fxVarianceWarnings?: { currency:string; expectedRate:number; actualRate:number; variance:number }[];
  totalCurrencies?: number;
  activeCurrencies?: number;

  staleRates?: number;
  lastRefresh?: FirebaseFirestore.Timestamp;

  topCurrencies?: Array<{
    code: string;
    transactions: number;
    volume: number;
  }>;
}





















