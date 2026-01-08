'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { CTAButton } from './CTAButton';

export const Nav: React.FC = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(darkMode);
    if (darkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-effect">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 gradient-primary rounded-lg" />
              <span className="text-xl font-bold">Avalo</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <Link href="/download" className="text-sm font-medium hover:text-primary transition">
              Download
            </Link>
            <Link href="/status" className="text-sm font-medium hover:text-primary transition">
              Status
            </Link>
            <Link href="/privacy" className="text-sm font-medium hover:text-primary transition">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm font-medium hover:text-primary transition">
              Terms
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Toggle theme"
            >
              {isDark ? '🌙' : '☀️'}
            </button>
            <CTAButton href="/download" size="small">
              Get Started
            </CTAButton>
          </div>
        </div>
      </div>
    </nav>
  );
};