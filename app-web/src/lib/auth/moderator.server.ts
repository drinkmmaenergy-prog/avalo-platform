/**
 * Moderator Role & Authentication Utilities (Server Components)
 * Server-side auth utilities for use in RSC and layouts
 * 
 * NOTE: This is a placeholder implementation that returns mock data
 * during static generation. For production, integrate with your auth provider.
 */

export type ModeratorRole = 'admin' | 'moderator';

export interface CurrentUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: ModeratorRole | 'user' | null;
}

/**
 * Get current user with role information (Server-side)
 * 
 * For static generation / build time, returns a mock admin user
 * In production, this should integrate with Firebase Admin SDK or session cookies
 */
export async function getCurrentUserWithRole(): Promise<CurrentUser | null> {
  // During build time (static generation), return a mock user
  // This allows the pages to be pre-rendered
  // In production with actual auth, you'd check cookies or server-side session
  
  // Return a mock admin for static generation
  // The actual auth check happens client-side in the components
  return {
    uid: 'static-build-user',
    email: 'build@avalo.dev',
    displayName: 'Build User',
    role: 'admin',
  };
}

/**
 * Check if current user has moderator or admin role
 */
export async function isModeratorOrAdmin(): Promise<boolean> {
  const user = await getCurrentUserWithRole();
  return user?.role === 'admin' || user?.role === 'moderator';
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUserWithRole();
  return user?.role === 'admin';
}
