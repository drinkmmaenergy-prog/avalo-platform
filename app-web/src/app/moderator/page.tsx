import { redirect } from 'next/navigation';

/**
 * Moderator Root Page
 * Redirects to the dashboard
 */
export default function ModeratorRootPage() {
  redirect('/moderator/dashboard');
}