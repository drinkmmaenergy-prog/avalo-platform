import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Token Economy - Avalo',
  description: 'Learn about Avalo\'s token economy. Buy, earn, spend, and withdraw tokens in our premium ecosystem.',
};

export default function TokenEconomyPage() {
  const tokenPacks = [
    { name: 'Mini', tokens: 100, price: '$5.49' },
    { name: 'Basic', tokens: 300, price: '$15.99' },
    { name: 'Standard', tokens: 500, price: '$26.99' },
    { name: 'Premium', tokens: 1000, price: '$52.99' },
    { name: 'Pro', tokens: 2000, price: '$104.99' },
    { name: 'Elite', tokens: 5000, price: '$259.99' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="text-2xl font-extrabold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            Avalo
          </Link>
          <Link href="/" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">
            ← Back to Home
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 dark:text-white mb-4">
            💎 Token Economy
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Avalo tokens power every interaction. Buy tokens, earn them as a creator, and spend them on premium experiences.
          </p>
        </div>

        {/* How it works */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: '💰', title: 'Buy Tokens', desc: 'Purchase token packs via Stripe. Secure, instant, no hidden fees.' },
              { icon: '🎯', title: 'Spend Tokens', desc: 'Use tokens for premium chat, video calls, gifts, events, and content unlocks.' },
              { icon: '💸', title: 'Earn & Withdraw', desc: 'Creators earn tokens from their audience and can withdraw to real money.' },
            ].map((item) => (
              <div
                key={item.title}
                className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800 shadow-sm"
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Token Packs */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">Token Packs</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {tokenPacks.map((pack) => (
              <div
                key={pack.name}
                className="bg-white dark:bg-gray-900 rounded-2xl p-6 text-center border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-purple-200 dark:hover:border-purple-800 transition-all"
              >
                <div className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 mb-1">
                  {pack.tokens}
                </div>
                <div className="text-xs text-gray-500 mb-3">tokens</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white mb-1">{pack.price}</div>
                <div className="text-xs text-gray-500">{pack.name} Pack</div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link
              href="/wallet/buy"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white text-lg font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              💎 Buy Tokens Now
            </Link>
          </div>
        </section>

        {/* Creator Earnings */}
        <section className="mb-20">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8 text-center">Creator Earnings</h2>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              <div>
                <div className="text-3xl font-extrabold text-green-600 mb-2">65–80%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Revenue share for creators</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-purple-600 mb-2">Instant</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Token earnings credited immediately</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-pink-600 mb-2">$0.03</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Token-to-USD payout rate</div>
              </div>
            </div>
          </div>
        </section>

        {/* Safety */}
        <section className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
            All payments are processed securely via Stripe. Token pricing is fixed and canonical — no discounts, no coupons, no hidden fees.
            Creator withdrawals are subject to standard KYC/AML verification.
          </p>
        </section>
      </main>
    </div>
  );
}
