/**
 * FIX 97C — Dynamic Sitemap
 *
 * Next.js App Router convention: src/app/sitemap.ts
 * Generates /sitemap.xml at build time.
 *
 * Static pages are listed here. For dynamic profile/post pages,
 * a separate sitemap generator could query Firestore for public profiles.
 */

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://avalo.app',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://avalo.app/discover',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: 'https://avalo.app/ai',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://avalo.app/legal/terms',
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://avalo.app/legal/privacy',
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://avalo.app/help',
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];
}
