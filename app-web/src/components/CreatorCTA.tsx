'use client';

/**
 * CreatorCTA — Client-side CTA buttons for the creator marketing page.
 *
 * Uses AuthModal for "Start Creating" instead of linking to email-only form.
 * Supports Google sign in via the centralized auth modal.
 */

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAuthModal } from '@/components/AuthModal';

interface CreatorCTAProps {
  variant?: 'primary' | 'nav-login' | 'nav-start';
  className?: string;
  children: React.ReactNode;
}

export default function CreatorCTA({ variant = 'primary', className = '', children }: CreatorCTAProps) {
  const router = useRouter();
  const { firebaseUser, needsOnboarding } = useAuth();
  const { openAuthModal } = useAuthModal();

  const handleClick = () => {
    if (firebaseUser) {
      if (needsOnboarding) {
        router.push('/onboarding');
      } else {
        router.push('/creator');
      }
    } else {
      openAuthModal('/creator');
    }
  };

  return (
    <button onClick={handleClick} className={className}>
      {children}
    </button>
  );
}

