/**
 * Moderation i18n — Translation hook for moderation-specific strings.
 *
 * Uses the main I18nProvider context with moderation-specific key prefixes.
 * Falls back to English hardcoded strings for moderation UI.
 */

'use client';

import { useCallback } from 'react';

const MODERATION_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    'queue.title': 'Moderation Queue',
    'queue.empty': 'No pending items in queue',
    'incidents.title': 'Incidents',
    'incidents.open': 'Open',
    'incidents.resolved': 'Resolved',
    'incidents.dismissed': 'Dismissed',
    'appeals.title': 'Appeals',
    'appeals.pending': 'Pending Review',
    'appeals.approved': 'Approved',
    'appeals.denied': 'Denied',
    'actions.warn': 'Warn User',
    'actions.mute': 'Mute User',
    'actions.suspend': 'Suspend Account',
    'actions.ban': 'Ban Account',
    'actions.resolve': 'Resolve Incident',
    'actions.dismiss': 'Dismiss Incident',
    'actions.escalate': 'Escalate',
    'severity.critical': 'Critical',
    'severity.high': 'High',
    'severity.medium': 'Medium',
    'severity.low': 'Low',
  },
};

/**
 * Hook for moderation-specific translations.
 * Returns a `t()` function scoped to moderation keys.
 */
export function useTranslations(namespace = 'moderation') {
  const t = useCallback(
    (key: string): string => {
      const lang = 'en'; // Could be wired to I18nProvider locale in future
      const fullKey = key;
      return MODERATION_TRANSLATIONS[lang]?.[fullKey] ?? key;
    },
    [],
  );

  return t;
}
