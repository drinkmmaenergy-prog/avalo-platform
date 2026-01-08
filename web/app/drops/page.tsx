'use client';

/**
 * Drops Marketplace Page (Web)
 * Allows users to browse and purchase drops
 */

import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface DropPublicInfo {
  dropId: string;
  ownerCreatorIds: string[];
  creatorNames: string[];
  creatorAvatars: string[];
  type: string;
  title: string;
  description: string;
  coverImageUrl: string;
  tags: string[];
  priceTokens: number;
  soldCount: number;
  stockRemaining: number | null;
  timeRemaining: number | null;
  isAvailable: boolean;
  is18Plus: boolean;
}

export default function DropsMarketplacePage() {
  const [drops, setDrops] = useState<DropPublicInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadDrops();
  }, [filter]);

  const loadDrops = async () => {
    try {
      setLoading(true);
      const functions = getFunctions();
      const listDropsFn = httpsCallable(functions, 'drops_listDrops');
      const filters = filter === 'all' ? {} : { type: filter };
      const result = await listDropsFn({ ...filters, activeOnly: true });
      setDrops((result.data as any).drops || []);
    } catch (error) {
      console.error('Error loading drops:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (ms: number | null): string => {
    if (ms === null) return 'Unlimited';
    if (ms <= 0) return 'Ended';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Drops Marketplace</h1>
          <a href="/profile/drops" className="text-green-400 hover:text-green-300">
            My Drops
          </a>
        </div>

        <div className="flex gap-4 mb-8 overflow-x-auto">
          {['all', 'STANDARD_DROP', 'FLASH_DROP', 'LOOTBOX_DROP', 'COOP_DROP'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                filter === f
                  ? 'bg-green-400 text-black'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_DROP', '')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-gray-400">Loading...</p>
          </div>
        ) : drops.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-xl">No drops available</p>
            <p className="text-gray-600 mt-2">Check back later for new drops!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {drops.map((drop) => (
              <a
                key={drop.dropId}
                href={`/drops/${drop.dropId}`}
                className="bg-gray-900 rounded-lg overflow-hidden hover:ring-2 hover:ring-green-400 transition"
              >
                <img
                  src={drop.coverImageUrl}
                  alt={drop.title}
                  className="w-full h-48 object-cover bg-gray-800"
                />
                {drop.type === 'FLASH_DROP' && drop.timeRemaining && (
                  <div className="absolute top-4 right-4 bg-red-500 px-3 py-1 rounded">
                    ⚡ {formatTimeRemaining(drop.timeRemaining)}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-semibold">{drop.title}</h3>
                    <span className="text-xs bg-gray-800 px-2 py-1 rounded">
                      {drop.type.replace('_DROP', '')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">
                    by {drop.creatorNames.join(', ')}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-green-400 font-bold text-xl">
                      {drop.priceTokens} 🪙
                    </span>
                    <div className="text-right">
                      {drop.stockRemaining !== null && (
                        <p className="text-sm text-gray-400">
                          {drop.stockRemaining} left
                        </p>
                      )}
                      <p className="text-xs text-gray-600">{drop.soldCount} sold</p>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}