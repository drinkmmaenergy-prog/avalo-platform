/**
 * Token Purchase Modal Component
 * Placeholder for Stripe payment flow
 */

'use client';

export default function TokenPurchaseModal() {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold mb-4">Purchase Tokens</h2>
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <p className="font-medium">100 Tokens</p>
            <p className="text-gray-500">$9.99</p>
          </div>
          <div className="p-4 border rounded-lg">
            <p className="font-medium">500 Tokens</p>
            <p className="text-gray-500">$39.99</p>
          </div>
          <p className="text-center text-gray-500 text-sm">Payment integration coming soon</p>
        </div>
      </div>
    </div>
  );
}
