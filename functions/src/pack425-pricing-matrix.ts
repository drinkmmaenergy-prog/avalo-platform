import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

/**
 * PACK 425 — Pricing Matrix (USD-only Canonical Adapter)
 *
 * Original module provided regional pricing profiles.
 * Avalo is USD-only in production logic.
 * This adapter satisfies imports and keeps signatures stable.
 */

export type PaymentCurrency = "USD";

export interface CountryPaymentProfile {
  countryCode: string;
  currency: PaymentCurrency;      // USD only
  purchasingPowerIndex: number;   // keep for analytics; default 1.0
  payoutEnabled: boolean;         // policy flag
  monetizationRestricted?: boolean;
}

export async function getCountryPaymentProfile(countryCode: string): Promise<CountryPaymentProfile> {
  return {
    countryCode: (countryCode || "US").toUpperCase(),
    currency: "USD",
    purchasingPowerIndex: 1.0,
    payoutEnabled: false,
    monetizationRestricted: false
  };
}

export async function createCountryPaymentProfile(
  countryCode: string,
  currency: PaymentCurrency,
  profile: Omit<CountryPaymentProfile, "countryCode" | "currency">
): Promise<CountryPaymentProfile> {
  return {
    countryCode: (countryCode || "US").toUpperCase(),
    currency: "USD",
    purchasingPowerIndex: profile.purchasingPowerIndex ?? 1.0,
    payoutEnabled: profile.payoutEnabled ?? false,
    monetizationRestricted: profile.monetizationRestricted ?? false
  };
}

















