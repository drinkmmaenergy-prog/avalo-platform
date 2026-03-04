'use client';

/**
 * Chat Page — messaging placeholder
 * Layout provides AppShell wrapping.
 */

import { useI18n } from '@/components/providers/I18nProvider';
import { MessageCircle } from 'lucide-react';

export default function ChatPage() {
  const { t } = useI18n();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
        {t('placeholder.chatTitle')}
      </h1>
      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        {t('placeholder.chatDesc')}
      </p>

      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="card p-4 flex items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full skeleton flex-shrink-0" />
            <div className="flex-1">
              <div className="h-4 skeleton rounded w-1/3 mb-2" />
              <div className="h-3 skeleton rounded w-2/3" />
            </div>
            <div className="h-3 skeleton rounded w-12" />
          </div>
        ))}
      </div>

      {/* Empty state */}
      <div className="mt-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-50 dark:bg-primary-900/30 mx-auto mb-4 flex items-center justify-center">
          <MessageCircle className="w-8 h-8 text-primary-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Start a conversation to see your chats here.
        </p>
      </div>
    </div>
  );
}

