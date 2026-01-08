'use client';

import React from 'react';
import { useLocale } from './LocaleProvider';

export function MarketingHero() {
  const { t } = useLocale();

  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF6B00] via-[#FF3C8E] to-[#7B2EFF]">
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* Animated gradient mesh overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[#FF6B00] rounded-full filter blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#7B2EFF] rounded-full filter blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto text-center text-white">
        {/* Logo/Title */}
        <div className="mb-8">
          <h1 className="text-7xl md:text-9xl font-bold mb-4 tracking-tight">
            AVALO
          </h1>
          <p className="text-2xl md:text-3xl font-semibold text-white/90">
            {t.hero.subtitle}
          </p>
        </div>

        {/* Main headline */}
        <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight max-w-4xl mx-auto">
          {t.hero.title}
        </h2>

        {/* Description */}
        <p className="text-xl md:text-2xl mb-12 text-white/90 max-w-3xl mx-auto leading-relaxed">
          {t.hero.description}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <a
            href="#download"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-full bg-white text-[#FF6B00] hover:bg-white/90 transition-all transform hover:scale-105 shadow-2xl"
          >
            {t.hero.downloadCTA}
          </a>
          <a
            href="#features"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-all border-2 border-white/30"
          >
            {t.hero.learnMore}
          </a>
        </div>

        {/* Store badges */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <span className="text-white/70 text-sm">{t.download.available}</span>
          <div className="flex gap-4">
            <img 
              src="/badges/app-store-badge.svg" 
              alt="Download on App Store" 
              className="h-12 hover:opacity-80 transition"
            />
            <img 
              src="/badges/google-play-badge.svg" 
              alt="Get it on Google Play" 
              className="h-12 hover:opacity-80 transition"
            />
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  );
}