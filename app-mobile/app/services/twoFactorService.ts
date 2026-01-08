// app/services/twoFactorService.ts

import type { SensitiveAction } from "@/types/twoFactor";

/**
 * TEMP STUB – Phase 1
 * Backend wiring later
 */

export async function requestTwoFactorCode(
  action: SensitiveAction
): Promise<{ success: true }> {
  console.warn(
    "[twoFactorService] requestTwoFactorCode – STUB",
    action
  );

  await new Promise((r) => setTimeout(r, 500));

  return { success: true };
}

export async function verifyTwoFactorCode(
  action: SensitiveAction,
  code: string
): Promise<{ verified: boolean }> {
  console.warn(
    "[twoFactorService] verifyTwoFactorCode – STUB",
    { action, code }
  );

  await new Promise((r) => setTimeout(r, 500));

  return { verified: true };
}
