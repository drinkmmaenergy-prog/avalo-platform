import { MONETIZATION_SPLITS, SPLITS } from "./config/monetizationSplits";

export enum Currency {
  USD = "USD",
}

export async function getExchangeRates(): Promise<Record<Currency, number>> {
  return { [Currency.USD]: 1.0 };
}

export async function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency
): Promise<number> {
  // Backend USD-only — brak FX
  return amount;
}

export function formatCurrency(amount: number): string {
  const v = Number.isFinite(amount) ? amount : 0;
  return `$${v.toFixed(2)}`;
}

export function getCurrencyByCountryCode(_countryCode: string): Currency {
  return Currency.USD;
}

export function isValidCurrency(code: string): code is Currency {
  return code === "USD";
}


















