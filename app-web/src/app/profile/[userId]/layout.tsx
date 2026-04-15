import type { ReactNode } from 'react';

type LayoutProps = {
  children: ReactNode;
};

export default function ProfileUserLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </div>
    </div>
  );
}
