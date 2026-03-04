import { redirect } from 'next/navigation';

/**
 * Auth index — redirects to /auth/login.
 * No business logic. Server component redirect only.
 */
export default function AuthPage() {
  redirect('/auth/login');
}

