export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import TokensClient from './tokens.client';

export default function TokensPage() {
  return (
    <Suspense fallback={null}>
      <TokensClient />
    </Suspense>
  );
}

