'use client';

/**
 * Discover Page — Creator/content discovery
 * Layout provides AppShell wrapping.
 */

import { useI18n } from '@/components/providers/I18nProvider';
import { Compass, Search } from 'lucide-react';

export default function DiscoverPage() {
  const { t } = useI18n();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
        {t('placeholder.discoverTitle')}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {t('placeholder.discoverDesc')}
      </p>

      {/* Search bar placeholder */}
      <div className="relative mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          placeholder="Search creators, content, trends..."
          className="input pl-10"
          disabled
        />
      </div>

      {/* Skeleton grid — shows discovery is loading / coming soon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="card p-6"
          >
            <div className="w-12 h-12 rounded-full skeleton mb-4" />
            <div className="h-4 skeleton rounded w-3/4 mb-2" />
            <div className="h-3 skeleton rounded w-1/2" />
          </div>
        ))}
      </div>

      {/* Empty state overlay */}
      <div className="mt-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mx-auto mb-4 flex items-center justify-center">
          <Compass className="w-8 h-8 text-primary-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Discovery is growing. More creators join every day.
        </p>
      </div>
    </div>
  );
}

