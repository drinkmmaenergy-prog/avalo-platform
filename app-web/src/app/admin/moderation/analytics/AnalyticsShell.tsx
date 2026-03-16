'use client';
import nextDynamic from 'next/dynamic';

const AnalyticsClient = nextDynamic(() => import('./AnalyticsClient'), { ssr: false });

export default function AnalyticsShell() {
  return <AnalyticsClient />;
}
