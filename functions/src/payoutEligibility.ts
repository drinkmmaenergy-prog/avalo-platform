/**
 * PACK 56 — Payout Eligibility Module
 * 
 * Pure functions to determine if a user is eligible for payouts.
 * Integrates with PACK 55 (AML/KYC) and PACK 54 (Enforcement).
 */

export interface PayoutEligibilityContext {
  ageVerified: boolean;
  enforcement: {
    accountStatus: "ACTIVE" | "LIMITED" | "SUSPENDED" | "BANNED";
    earningStatus: "NORMAL" | "EARN_DISABLED";
  };
  aml: {
    kycRequired: boolean;
    kycVerified: boolean;
    kycLevel: "NONE" | "BASIC" | "FULL";
    riskScore: number;
  };
  creatorEarnings: {
    totalTokensEarnedAllTime: number;
    withdrawableTokens: number;
  };
}

export interface PayoutEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

/**
 * Compute payout eligibility based on age, enforcement, AML, and earnings state.
 * 
 * Rules:
 * - Must be 18+
 * - Account must not be suspended or banned
 * - Earning status must be NORMAL
 * - If KYC is required, it must be verified
 * - Must have withdrawable tokens > 0
 */
export function computePayoutEligibility(
  context: PayoutEligibilityContext
): PayoutEligibilityResult {
  const reasons: string[] = [];
  let eligible = true;

  // Rule 1: Age verification
  if (!context.ageVerified) {
    eligible = false;
    reasons.push("UNDERAGE");
  }

  // Rule 2: Account enforcement status
  if (context.enforcement.accountStatus === "SUSPENDED") {
    eligible = false;
    reasons.push("ACCOUNT_SUSPENDED");
  }
  if (context.enforcement.accountStatus === "BANNED") {
    eligible = false;
    reasons.push("ACCOUNT_BANNED");
  }

  // Rule 3: Earning status
  if (context.enforcement.earningStatus === "EARN_DISABLED") {
    eligible = false;
    reasons.push("EARNINGS_DISABLED");
  }

  // Rule 4: KYC requirements
  if (context.aml.kycRequired && !context.aml.kycVerified) {
    eligible = false;
    reasons.push("KYC_REQUIRED");
  }

  // Rule 5: Must have withdrawable tokens
  if (context.creatorEarnings.withdrawableTokens <= 0) {
    eligible = false;
    reasons.push("NO_EARNINGS");
  }

  return {
    eligible,
    reasons,
  };
}

/**
 * Convert reason codes to human-readable messages.
 */
export function getEligibilityReasonMessage(
  reason: string,
  language: "en" | "pl" = "en"
): string {
  const messages: Record<string, Record<"en" | "pl", string>> = {
    UNDERAGE: {
      en: "You must be 18 years or older to withdraw funds.",
      pl: "Musisz mieć ukończone 18 lat, aby wypłacić środki.",
    },
    ACCOUNT_SUSPENDED: {
      en: "Your account is currently suspended.",
      pl: "Twoje konto jest obecnie zawieszone.",
    },
    ACCOUNT_BANNED: {
      en: "Your account has been banned.",
      pl: "Twoje konto zostało zablokowane.",
    },
    EARNINGS_DISABLED: {
      en: "Your earning privileges have been disabled.",
      pl: "Twoje uprawnienia do zarabiania zostały wyłączone.",
    },
    KYC_REQUIRED: {
      en: "Identity verification is required before you can withdraw.",
      pl: "Przed wypłatą musisz zweryfikować swoją tożsamość.",
    },
    NO_EARNINGS: {
      en: "You do not have any withdrawable tokens.",
      pl: "Nie masz żadnych tokenów dostępnych do wypłaty.",
    },
  };

  return messages[reason]?.[language] || reason;
}