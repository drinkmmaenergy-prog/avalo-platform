/**
 * Referral Code Generator
 * Generates persistent 6-character referral codes (A-Z + 0-9)
 */

/**
 * Generate a random 6-character referral code
 * Format: XXXXXX (uppercase letters and digits)
 * Example: X3P9LA, A7K2M4, Z9B1C3
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  
  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    code += chars[randomIndex];
  }
  
  return code;
}

/**
 * Validate referral code format
 * Must be exactly 6 characters, only A-Z and 0-9
 */
export function isValidReferralCode(code: string): boolean {
  if (!code) return false;
  
  const codeRegex = /^[A-Z0-9]{6}$/;
  return codeRegex.test(code.toUpperCase());
}

/**
 * Normalize referral code to uppercase
 */
export function normalizeReferralCode(code: string): string {
  return code.toUpperCase().trim();
}