/**
 * PACK 123 - Secure Token Generation
 * 
 * Generates cryptographically secure tokens for team invitations
 */

import * as crypto from 'crypto';

export function generateInviteToken(): string {
  // Generate 32 bytes (256 bits) of random data
  const randomBytes = crypto.randomBytes(32);
  
  // Convert to base64url (URL-safe base64)
  return randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function generateDeviceFingerprint(
  ipAddress: string,
  userAgent: string
): string {
  const data = `${ipAddress}:${userAgent}`;
  return crypto
    .createHash('sha256')
    .update(data)
    .digest('hex');
}