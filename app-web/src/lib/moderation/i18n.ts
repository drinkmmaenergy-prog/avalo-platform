/**
 * Moderation i18n — Translation helper for moderation UI.
 */

const translations: Record<string, Record<string, string>> = {
  en: {
    'mod.title': 'Moderation Dashboard',
    'mod.incidents': 'Incidents',
    'mod.appeals': 'Appeals',
    'mod.queue': 'Queue',
    'mod.analytics': 'Analytics',
    'mod.users': 'Users',
    'mod.severity.critical': 'Critical',
    'mod.severity.high': 'High',
    'mod.severity.medium': 'Medium',
    'mod.severity.low': 'Low',
    'mod.status.open': 'Open',
    'mod.status.resolved': 'Resolved',
    'mod.status.dismissed': 'Dismissed',
    'mod.action.warn': 'Warn',
    'mod.action.mute': 'Mute',
    'mod.action.suspend': 'Suspend',
    'mod.action.ban': 'Ban',
    'mod.action.resolve': 'Resolve',
    'mod.action.dismiss': 'Dismiss',
  },
};

export function useTranslations(locale: string = 'en') {
  const t = (key: string): string => {
    return translations[locale]?.[key] ?? translations['en']?.[key] ?? key;
  };

  return { t };
}
