'use client';

import React from 'react';
import { useLocale } from './LocaleProvider';

export function MarketingFooter() {
  const { t, locale, setLocale } = useLocale();

  return (
    <footer className="bg-gray-900 text-white py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="md:col-span-1">
            <div className="text-3xl font-bold mb-4 bg-gradient-to-r from-[#FF6B00] via-[#FF3C8E] to-[#7B2EFF] bg-clip-text text-transparent">
              AVALO
            </div>
            <p className="text-gray-400 mb-6">
              {t.footer.tagline}
            </p>
            
            {/* Language Switcher */}
            <div className="flex gap-2">
              <button
                onClick={() => setLocale('en')}
                className={`px-4 py-2 rounded-lg transition ${
                  locale === 'en'
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLocale('pl')}
                className={`px-4 py-2 rounded-lg transition ${
                  locale === 'pl'
                    ? 'bg-white text-gray-900'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                PL
              </button>
            </div>
          </div>

          {/* Product Column */}
          <div>
            <h3 className="font-bold text-lg mb-4">{t.footer.product}</h3>
            <ul className="space-y-3">
              <li>
                <a href="#features" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.features}
                </a>
              </li>
              <li>
                <a href="#wallet" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.pricing}
                </a>
              </li>
              <li>
                <a href="#creators" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.creators}
                </a>
              </li>
              <li>
                <a href="#safety" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.safety}
                </a>
              </li>
            </ul>
          </div>

          {/* Company Column */}
          <div>
            <h3 className="font-bold text-lg mb-4">{t.footer.company}</h3>
            <ul className="space-y-3">
              <li>
                <a href="/about" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.about}
                </a>
              </li>
              <li>
                <a href="/careers" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.careers}
                </a>
              </li>
              <li>
                <a href="/press" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.press}
                </a>
              </li>
              <li>
                <a href="/blog" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.blog}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal Column */}
          <div>
            <h3 className="font-bold text-lg mb-4">{t.footer.legal}</h3>
            <ul className="space-y-3">
              <li>
                <a href="/terms" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.terms}
                </a>
              </li>
              <li>
                <a href="/privacy" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.privacy}
                </a>
              </li>
              <li>
                <a href="/cookies" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.cookies}
                </a>
              </li>
              <li>
                <a href="/community-guidelines" className="text-gray-400 hover:text-white transition">
                  {t.footer.links.community}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Social Links */}
        <div className="flex justify-center gap-6 mb-8 pb-8 border-b border-gray-800">
          <a
            href="https://twitter.com/avaloapp"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition"
            aria-label="Twitter"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
            </svg>
          </a>
          <a
            href="https://instagram.com/avaloapp"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition"
            aria-label="Instagram"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
            </svg>
          </a>
          <a
            href="https://facebook.com/avaloapp"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition"
            aria-label="Facebook"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </a>
          <a
            href="https://linkedin.com/company/avaloapp"
            target="_blank"
            rel="noopener noreferrer"
            className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition"
            aria-label="LinkedIn"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        </div>

        {/* Bottom Bar */}
        <div className="text-center text-gray-400 text-sm">
          <p className="mb-2">{t.footer.copyright}</p>
          <p>{t.footer.contact}</p>
        </div>
      </div>
    </footer>
  );
}