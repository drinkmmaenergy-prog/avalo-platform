// HARD_DISABLED [F3]: earnerStore.ts (V1) -- legacy creator product marketplace stubs
//
// All functions were placeholder stubs (return true / return []) -- a prohibited
// fake-success pattern under production hardening rules. Converted to throws.
//
// V1 endpoints are superseded by earnerShop.ts (also HARD_DISABLED [F3]).
// Neither V1 nor current shop has a canonical billing implementation.

export async function publishCreatorProductV1(): Promise<never> {
  throw new Error('HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation');
}

export async function getCreatorProductsV1(): Promise<never> {
  throw new Error('HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation');
}

export async function purchaseCreatorProductV1(): Promise<never> {
  throw new Error('HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation');
}

export async function getMyPurchasesV1(): Promise<never> {
  throw new Error('HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation');
}

export async function deactivateProductV1(): Promise<never> {
  throw new Error('HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation');
}

export async function getCreatorAnalyticsV1(): Promise<never> {
  throw new Error('HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation');
}

export async function createCreatorProductV1(): Promise<never> {
  throw new Error("HARD_DISABLED [F3]: earnerStore V1 -- stub only, no implementation");
}
