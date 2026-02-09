/**
 * Moderator Server Auth — Server-side moderator access control.
 *
 * Used in server components (layout.tsx) to check if the
 * current user has moderator/admin role before rendering
 * the moderation dashboard.
 */

export interface CurrentUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'moderator' | 'admin' | 'super_admin';
  permissions: string[];
}

/**
 * Get current user with role from server context.
 *
 * NOTE: In a real server component, this would use cookies/headers
 * to identify the user and check their role in Firestore via admin SDK.
 * For now, returns null (redirected to no-access by the layout).
 */
export async function getCurrentUserWithRole(): Promise<CurrentUser | null> {
  // Server-side auth check would go here.
  // This is called from the moderator layout.tsx server component.
  // Returns null to trigger the no-access redirect.
  return null;
}
