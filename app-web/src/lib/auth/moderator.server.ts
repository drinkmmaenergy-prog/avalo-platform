/**
 * Moderator Auth — Server-side (for server components / API routes).
 *
 * INVARIANTS:
 *   - NEVER import from client components.
 *   - Uses firebase-admin to verify tokens.
 */

export interface CurrentUser {
  uid: string;
  email: string;
  role: string;
  displayName?: string;
}

/**
 * Get current user with role from server-side context.
 * Returns null if not authenticated or not a moderator/admin.
 *
 * NOTE: In a full implementation, this would read from cookies/headers.
 * For now, returns null to let client-side handle auth.
 */
export async function getCurrentUserWithRole(): Promise<CurrentUser | null> {
  // Server-side auth check is handled by middleware or API routes.
  // This function is a placeholder for server component usage.
  return null;
}
