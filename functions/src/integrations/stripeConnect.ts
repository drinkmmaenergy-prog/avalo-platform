/**
 * PACK 56 — Stripe Connect Integration
 * 
 * Handles Stripe Connect account creation, onboarding, and payouts.
 */

import Stripe from "stripe";

// Get Stripe key from config or environment - safe for emulator
const stripeApiKey = process.env.STRIPE_SECRET_KEY || "";

// Lazy initialization flag to avoid crashes on module load
let stripeInstance: Stripe | null = null;

/**
 * Safe Stripe getter - returns null and logs warning when no API key available
 * This allows the emulator to boot without crashing on missing Stripe key
 */
function getStripe(): Stripe | null {
  if (stripeInstance) {
    return stripeInstance;
  }
  
  if (!stripeApiKey) {
    console.warn("[stripeConnect] STRIPE_SECRET_KEY not configured - Stripe operations disabled");
    return null;
  }
  
  stripeInstance = new Stripe(stripeApiKey, {
    apiVersion: "2023-10-16",
  });
  
  return stripeInstance;
}

/**
 * Guard function that throws if Stripe is not configured
 */
function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured - STRIPE_SECRET_KEY is missing");
  }
  return stripe;
}

export interface CreateConnectAccountParams {
  userId: string;
  email: string;
  country: string;
}

export interface CreateConnectAccountResult {
  accountId: string;
  onboardingStatus: "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE";
}

export interface CreateOnboardingLinkParams {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}

export interface CreateOnboardingLinkResult {
  url: string;
  expiresAt: number;
}

export interface CreateTransferParams {
  accountId: string;
  amountCents: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CreateTransferResult {
  transferId: string;
  status: "PENDING" | "PAID" | "FAILED";
  amountCents: number;
  currency: string;
  createdAt: number;
}

export interface GetAccountStatusResult {
  accountId: string;
  onboardingStatus: "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: {
    currentlyDue: string[];
    pastDue: string[];
    eventuallyDue: string[];
  };
}

/**
 * Create or retrieve a Stripe Connect Express account for a user.
 */
export async function createOrUpdateStripeAccount(
  params: CreateConnectAccountParams
): Promise<CreateConnectAccountResult> {
  const stripe = requireStripe();
  
  try {
    // Create a new Connect Express account
    const account = await stripe.accounts.create({
      type: "express",
      country: params.country,
      email: params.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        avaloUserId: params.userId,
      },
    });

    // Determine initial onboarding status
    let onboardingStatus: "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE" = "PENDING";
    if (account.details_submitted && account.charges_enabled) {
      onboardingStatus = "COMPLETE";
    } else if (account.requirements?.currently_due?.length || account.requirements?.past_due?.length) {
      onboardingStatus = "RESTRICTED";
    }

    return {
      accountId: account.id,
      onboardingStatus,
    };
  } catch (error) {
    console.error("Error creating Stripe Connect account:", error);
    throw new Error(`Failed to create Stripe Connect account: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create an onboarding link for a Connect account.
 */
export async function createStripeOnboardingLink(
  params: CreateOnboardingLinkParams
): Promise<CreateOnboardingLinkResult> {
  const stripe = requireStripe();
  
  try {
    const accountLink = await stripe.accountLinks.create({
      account: params.accountId,
      refresh_url: params.refreshUrl,
      return_url: params.returnUrl,
      type: "account_onboarding",
    });

    return {
      url: accountLink.url,
      expiresAt: accountLink.expires_at,
    };
  } catch (error) {
    console.error("Error creating Stripe onboarding link:", error);
    throw new Error(`Failed to create onboarding link: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get the current status of a Connect account.
 */
export async function getStripeAccountStatus(
  accountId: string
): Promise<GetAccountStatusResult> {
  const stripe = requireStripe();
  
  try {
    const account = await stripe.accounts.retrieve(accountId);

    let onboardingStatus: "NONE" | "PENDING" | "RESTRICTED" | "COMPLETE" = "PENDING";
    if (account.details_submitted && account.charges_enabled && account.payouts_enabled) {
      onboardingStatus = "COMPLETE";
    } else if (account.requirements?.currently_due?.length || account.requirements?.past_due?.length) {
      onboardingStatus = "RESTRICTED";
    }

    return {
      accountId: account.id,
      onboardingStatus,
      chargesEnabled: account.charges_enabled || false,
      payoutsEnabled: account.payouts_enabled || false,
      requirements: {
        currentlyDue: account.requirements?.currently_due || [],
        pastDue: account.requirements?.past_due || [],
        eventuallyDue: account.requirements?.eventually_due || [],
      },
    };
  } catch (error) {
    console.error("Error getting Stripe account status:", error);
    throw new Error(`Failed to get account status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a transfer to a Connect account.
 * 
 * Note: This creates a transfer from the platform balance to the connected account.
 * The connected account must have payouts enabled.
 */
export async function createStripeTransfer(
  params: CreateTransferParams
): Promise<CreateTransferResult> {
  const stripe = requireStripe();
  
  try {
    const transfer = await stripe.transfers.create({
      amount: params.amountCents,
      currency: params.currency.toLowerCase(),
      destination: params.accountId,
      description: params.description || "Avalo creator payout",
      metadata: params.metadata || {},
    });

    return {
      transferId: transfer.id,
      status: transfer.reversed ? "FAILED" : "PAID",
      amountCents: transfer.amount,
      currency: transfer.currency.toUpperCase(),
      createdAt: transfer.created,
    };
  } catch (error) {
    console.error("Error creating Stripe transfer:", error);
    throw new Error(`Failed to create transfer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get a transfer by ID.
 */
export async function getStripeTransfer(
  transferId: string
): Promise<CreateTransferResult> {
  const stripe = requireStripe();
  
  try {
    const transfer = await stripe.transfers.retrieve(transferId);

    return {
      transferId: transfer.id,
      status: transfer.reversed ? "FAILED" : "PAID",
      amountCents: transfer.amount,
      currency: transfer.currency.toUpperCase(),
      createdAt: transfer.created,
    };
  } catch (error) {
    console.error("Error getting Stripe transfer:", error);
    throw new Error(`Failed to get transfer: ${error instanceof Error ? error.message : String(error)}`);
  }
}
