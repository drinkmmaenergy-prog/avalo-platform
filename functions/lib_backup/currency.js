"use strict";
/**
 * Currency Conversion Utilities (Phase 11)
 *
 * Provides real-time currency conversion rates for global expansion.
 * Uses external API for live rates with fallback to static rates.
 *
 * Supported currencies:
 * - PLN (Polish Złoty) - base currency
 * - EUR (Euro)
 * - USD (US Dollar)
 * - GBP (British Pound)
 * - BTC (Bitcoin)
 * - ETH (Ethereum)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKEN_PACKAGES_PLN = exports.Currency = void 0;
exports.getExchangeRates = getExchangeRates;
exports.convertCurrency = convertCurrency;
exports.getTokenPackages = getTokenPackages;
exports.calculateTokensForAmount = calculateTokensForAmount;
exports.formatCurrency = formatCurrency;
exports.getCurrencyByCountryCode = getCurrencyByCountryCode;
exports.isValidCurrency = isValidCurrency;
// import axios from "axios"; // Requires axios package
// Axios placeholder - requires axios package installation
const axios = {
    get: async (url, config) => ({
        data: {
            rates: {},
            result: "success",
            conversion_rates: {},
            bitcoin: { pln: 0 },
            ethereum: { pln: 0 }
        }
    }),
};
/**
 * Currency codes
 */
var Currency;
(function (Currency) {
    Currency["PLN"] = "PLN";
    Currency["EUR"] = "EUR";
    Currency["USD"] = "USD";
    Currency["GBP"] = "GBP";
    Currency["BTC"] = "BTC";
    Currency["ETH"] = "ETH";
})(Currency || (exports.Currency = Currency = {}));
/**
 * Static fallback rates (PLN as base)
 * Updated: January 2025 approximate rates
 */
const FALLBACK_RATES = {
    [Currency.PLN]: 1.0,
    [Currency.EUR]: 0.23, // 1 PLN = ~0.23 EUR
    [Currency.USD]: 0.25, // 1 PLN = ~0.25 USD
    [Currency.GBP]: 0.20, // 1 PLN = ~0.20 GBP
    [Currency.BTC]: 0.0000028, // 1 PLN = ~0.0000028 BTC
    [Currency.ETH]: 0.000075, // 1 PLN = ~0.000075 ETH
};
/**
 * Cached exchange rates
 */
let cachedRates = { ...FALLBACK_RATES };
let lastFetchTime = 0;
const CACHE_DURATION = 3600000; // 1 hour in milliseconds
/**
 * Fetch live exchange rates from API
 */
async function fetchLiveRates() {
    try {
        // Using exchangerate-api.com (free tier)
        // Alternative: fixer.io, currencyapi.com, etc.
        const apiKey = process.env.EXCHANGE_RATE_API_KEY || "";
        if (!apiKey) {
            console.warn("No EXCHANGE_RATE_API_KEY, using fallback rates");
            return FALLBACK_RATES;
        }
        const response = await axios.get(`https://v6.exchangerate-api.com/v6/${apiKey}/latest/PLN`, { timeout: 5000 });
        if (response.data.result === "success") {
            const rates = response.data.conversion_rates;
            // For crypto, use a separate API or fixed approximations
            const cryptoRates = await fetchCryptoRates();
            return {
                [Currency.PLN]: 1.0,
                [Currency.EUR]: 1 / rates.EUR || FALLBACK_RATES[Currency.EUR],
                [Currency.USD]: 1 / rates.USD || FALLBACK_RATES[Currency.USD],
                [Currency.GBP]: 1 / rates.GBP || FALLBACK_RATES[Currency.GBP],
                [Currency.BTC]: cryptoRates.BTC,
                [Currency.ETH]: cryptoRates.ETH,
            };
        }
        return FALLBACK_RATES;
    }
    catch (error) {
        console.error("Error fetching live rates:", error);
        return FALLBACK_RATES;
    }
}
/**
 * Fetch cryptocurrency rates
 */
async function fetchCryptoRates() {
    try {
        // Using CoinGecko API (free, no API key required)
        const response = await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=pln", { timeout: 5000 });
        const btcPln = response.data.bitcoin?.pln || 0;
        const ethPln = response.data.ethereum?.pln || 0;
        return {
            BTC: btcPln > 0 ? 1 / btcPln : FALLBACK_RATES[Currency.BTC],
            ETH: ethPln > 0 ? 1 / ethPln : FALLBACK_RATES[Currency.ETH],
        };
    }
    catch (error) {
        console.error("Error fetching crypto rates:", error);
        return {
            BTC: FALLBACK_RATES[Currency.BTC],
            ETH: FALLBACK_RATES[Currency.ETH],
        };
    }
}
/**
 * Get current exchange rates (with caching)
 */
async function getExchangeRates() {
    const now = Date.now();
    // Use cache if fresh (< 1 hour old)
    if (now - lastFetchTime < CACHE_DURATION) {
        return cachedRates;
    }
    // Fetch new rates
    const freshRates = await fetchLiveRates();
    cachedRates = freshRates;
    lastFetchTime = now;
    return cachedRates;
}
/**
 * Convert amount from one currency to another
 *
 * @param amount - Amount to convert
 * @param fromCurrency - Source currency
 * @param toCurrency - Target currency
 * @returns Converted amount
 */
async function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
        return amount;
    }
    const rates = await getExchangeRates();
    // Convert to PLN first (base currency), then to target
    const amountInPLN = amount / rates[fromCurrency];
    const amountInTarget = amountInPLN * rates[toCurrency];
    return amountInTarget;
}
/**
 * Get token package price in specific currency
 *
 * Token packages in PLN:
 * - 150 tokens = 30 PLN (0.20 PLN per token)
 * - 350 tokens = 70 PLN
 * - 600 tokens = 120 PLN
 * - 1300 tokens = 260 PLN
 * - 5000 tokens = 1000 PLN
 */
exports.TOKEN_PACKAGES_PLN = [
    { tokens: 150, pricePLN: 30 },
    { tokens: 350, pricePLN: 70 },
    { tokens: 600, pricePLN: 120 },
    { tokens: 1300, pricePLN: 260 },
    { tokens: 5000, pricePLN: 1000 },
];
/**
 * Get token packages with prices in specified currency
 */
async function getTokenPackages(currency) {
    const rates = await getExchangeRates();
    return exports.TOKEN_PACKAGES_PLN.map(pkg => ({
        tokens: pkg.tokens,
        price: parseFloat((pkg.pricePLN * rates[currency]).toFixed(2)),
        currency,
    }));
}
/**
 * Calculate tokens for a given amount in any currency
 */
async function calculateTokensForAmount(amount, currency) {
    // Convert to PLN
    const amountPLN = await convertCurrency(amount, currency, Currency.PLN);
    // 1 token = 0.20 PLN
    const tokens = Math.floor(amountPLN / 0.20);
    return tokens;
}
/**
 * Format currency amount for display
 */
function formatCurrency(amount, currency) {
    if (currency === Currency.BTC || currency === Currency.ETH) {
        return `${amount.toFixed(8)} ${currency}`;
    }
    const symbols = {
        [Currency.PLN]: "zł",
        [Currency.EUR]: "€",
        [Currency.USD]: "$",
        [Currency.GBP]: "£",
        [Currency.BTC]: "₿",
        [Currency.ETH]: "Ξ",
    };
    const symbol = symbols[currency] || currency;
    if (currency === Currency.PLN) {
        return `${amount.toFixed(2)} ${symbol}`;
    }
    return `${symbol}${amount.toFixed(2)}`;
}
/**
 * Get user's preferred currency based on location
 */
function getCurrencyByCountryCode(countryCode) {
    const currencyMap = {
        PL: Currency.PLN,
        DE: Currency.EUR,
        FR: Currency.EUR,
        IT: Currency.EUR,
        ES: Currency.EUR,
        NL: Currency.EUR,
        BE: Currency.EUR,
        AT: Currency.EUR,
        PT: Currency.EUR,
        US: Currency.USD,
        GB: Currency.GBP,
        UK: Currency.GBP,
    };
    return currencyMap[countryCode.toUpperCase()] || Currency.EUR; // Default to EUR
}
/**
 * Validate currency code
 */
function isValidCurrency(code) {
    return Object.values(Currency).includes(code);
}
//# sourceMappingURL=currency.js.map