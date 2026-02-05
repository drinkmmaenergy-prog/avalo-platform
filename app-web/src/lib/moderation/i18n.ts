interface TranslationSet {
  common: {
    loading: string;
    error: string;
    save: string;
    cancel: string;
    delete: string;
    confirm: string;
  };
}

const translations: Record<string, TranslationSet> = {
  en: {
    common: {
      loading: 'Loading...',
      error: 'An error occurred',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      confirm: 'Confirm',
    },
  },
};

export function useTranslations(locale?: string): TranslationSet {
  return translations[locale ?? 'en'] ?? translations.en;
}
