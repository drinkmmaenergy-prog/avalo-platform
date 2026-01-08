import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Avalo - Premium Social & Dating Platform',
  description: 'Connect beyond boundaries. Meet, chat, and build meaningful connections in a premium social ecosystem designed for authentic interactions.',
  openGraph: {
    title: 'Avalo - Premium Social & Dating Platform',
    description: 'Connect beyond boundaries. Meet, chat, and build meaningful connections.',
    type: 'website',
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}