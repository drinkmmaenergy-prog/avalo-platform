export const LEGAL_REGISTRY = {
  terms: {
    en: require('../../assets/legal/terms/en.md'),
    pl: require('../../assets/legal/terms/pl.md'),
  },
  privacy: {
    en: require('../../assets/legal/privacy/en.md'),
    pl: require('../../assets/legal/privacy/pl.md'),
  },
  community: {
    en: require('../../assets/legal/community/en.md'),
    pl: require('../../assets/legal/community/pl.md'),
  },
  safety: {
    en: require('../../assets/legal/safety/en.md'),
    pl: require('../../assets/legal/safety/pl.md'),
  },
  ai: {
    en: require('../../assets/legal/ai/en.md'),
    pl: require('../../assets/legal/ai/pl.md'),
  },
  monetization: {
    en: require('../../assets/legal/monetization/en.md'),
    pl: require('../../assets/legal/monetization/pl.md'),
  },
  refund: {
    en: require('../../assets/legal/refund/en.md'),
    pl: require('../../assets/legal/refund/pl.md'),
  },
  age: {
    en: require('../../assets/legal/age/en.md'),
    pl: require('../../assets/legal/age/pl.md'),
  },
} as const;

export type LegalTopic = keyof typeof LEGAL_REGISTRY;

export function getLegalDoc(topic: LegalTopic, locale: 'pl' | 'en') {
  const doc = LEGAL_REGISTRY[topic][locale];
  if (!doc) return LEGAL_REGISTRY[topic].en;
  return doc;
}
