import { redirect } from 'next/navigation';

/**
 * Investor index — redirects to /investor/dashboard.
 * No business logic. Server component redirect only.
 */
export default function InvestorPage() {
  redirect('/investor/dashboard');
}
