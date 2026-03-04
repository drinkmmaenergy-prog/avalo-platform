'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function TokensClient() {
  const searchParams = useSearchParams();
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    const status = searchParams?.get('status');
    if (status === 'success') {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Tokens</h1>
      {showSuccess && (
        <div className="mt-4 rounded bg-green-100 p-3 text-green-800">
          Payment successful
        </div>
      )}
    </div>
  );
}

