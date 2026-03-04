/**
 * Store Grid Component
 * Placeholder for digital product store
 */

'use client';

export default function StoreGrid() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Digital Store</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg shadow p-4">
            <div className="h-32 bg-gray-200 rounded mb-3 flex items-center justify-center text-gray-400">
              Product {i}
            </div>
            <p className="font-medium">Coming soon</p>
            <p className="text-gray-500 text-sm">$--</p>
          </div>
        ))}
      </div>
    </div>
  );
}

