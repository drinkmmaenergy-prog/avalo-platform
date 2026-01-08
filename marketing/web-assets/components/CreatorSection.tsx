'use client';

import React from 'react';
import { useLocale } from './LocaleProvider';

export function CreatorSection() {
  const { t } = useLocale();

  return (
    <section id="creators" className="py-24 px-4 bg-gradient-to-br from-[#FF6B00] via-[#FF3C8E] to-[#7B2EFF] relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full filter blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full filter blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-16 text-white">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            {t.creators.title}
          </h2>
          <p className="text-xl text-white/90 max-w-3xl mx-auto">
            {t.creators.subtitle}
          </p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {t.creators.stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white/10 backdrop-blur-md rounded-3xl p-8 text-center border border-white/20"
            >
              <div className="text-6xl font-bold mb-2 text-white">
                {stat.value}
              </div>
              <div className="text-xl text-white/80">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Benefits Grid */}
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-12 border border-white/20 mb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {t.creators.benefits.map((benefit, index) => (
              <div key={index} className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg text-white/90 flex-1">
                  {benefit}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a
            href="#download"
            className="inline-flex items-center justify-center px-12 py-5 text-xl font-semibold rounded-full bg-white text-[#FF6B00] hover:bg-white/90 transition-all transform hover:scale-105 shadow-2xl"
          >
            {t.creators.cta}
            <svg className="w-6 h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}