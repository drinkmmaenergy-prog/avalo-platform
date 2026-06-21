// HARD_DISABLED [F3]: earnerShop.ts -- creator product marketplace stubs
//
// All functions were placeholder stubs (return true / return []) -- a prohibited
// fake-success pattern under production hardening rules. Converted to throws.
//
// No billing, earning, delivery, or content-moderation logic exists here.
// Required before activation: verified-adult guard, explicit price, idempotency key,
// canonical consumer wallet debit (wallets/{uid}.balance), immutable billingEvents,
// actual delivery/unlock, recordCreatorEarning (creatorEarningAccounts.pendingEarningTokens),
// tiered hold, refund/dispute link, moderation/content-access checks. [F3]

export async function createCreatorProduct(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function uploadProductMedia(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function publishCreatorProduct(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function purchaseCreatorProduct(): Promise<never> {
  throw new Error(
    "HARD_DISABLED [F3]: earnerShop.purchaseCreatorProduct was a stub (return true). " +
    "No billing, earning, or delivery logic exists. " +
    "Implement canonical purchase path before activating. [F3]"
  );
}

export async function getProductAccessUrls(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function getCreatorProducts(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function getMyPurchases(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function getCreatorStats(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function updateCreatorProduct(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function toggleProductStatus(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}

export async function archiveCreatorProduct(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerShop -- stub only, no implementation");
}
