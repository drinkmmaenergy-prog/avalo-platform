'use client';

import React from 'react';
import { useLocale } from './LocaleProvider';

export function SafetySection() {
  const { t } = useLocale();

  return (
    <section id="safety" className="py-24 px-4 bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-5xl md:text-6xl font-bold mb-6 text-gray-900 dark:text-white">
            {t.safety.title}
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            {t.safety.subtitle}
          </p>
        </div>

        {/* Safety Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {t.safety.features.map((feature, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-lg border border-gray-200 dark:border-gray-800"
            >
              {/* Icon */}
              <div className="w-16 h-16 bg-gradient-to-br from-[#FF6B00] to-[#7B2EFF] rounded-2xl flex items-center justify-center text-3xl mb-6">
                {feature.icon}
              </div>

              {/* Title */}
              <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Verification Badges */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl p-12 shadow-xl border border-gray-200 dark:border-gray-800">
          <h3 className="text-3xl font-bold text-center mb-12 text-gray-900 dark:text-white">
            {t.verification.title}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {t.verification.badges.map((badge, index) => (
              <div key={index} className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[#FF6B00] to-[#7B2EFF] rounded-full flex items-center justify-center text-4xl">
                  {badge.icon}
                </div>
                <h4 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">
                  {badge.title}
                </h4>
                <p className="text-gray-600 dark:text-gray-400">
                  {badge.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}