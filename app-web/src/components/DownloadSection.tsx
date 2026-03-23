'use client';

/**
 * DownloadSection — Prominent "Download App" section for the homepage.
 *
 * Features:
 *   - Phone mockup using provided image
 *   - iOS / Android buttons ("Available on App Store" style)
 *   - Clean premium minimal look
 *   - Very visible download CTA
 */

import Image from 'next/image';
import Link from 'next/link';
import { Smartphone, ArrowRight } from 'lucide-react';
import { AppleIcon, GoogleIcon } from '@/components/icons/SocialIcons';

export default function DownloadSection() {
  return (
    <section className="relative bg-gradient-to-b from-white to-purple-50 dark:from-gray-900 dark:to-gray-950 py-20 sm:py-28 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* LEFT — Phone mockup */}
          <div className="relative flex justify-center">
            <div className="relative w-72 sm:w-80">
              {/* Glow */}
              <div className="absolute -inset-8 bg-gradient-to-r from-purple-400/15 to-pink-400/15 rounded-[3rem] blur-3xl" />

              {/* Phone frame */}
              <div className="relative bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
                <div className="rounded-[2rem] overflow-hidden bg-white">
                  <Image
                    src="/marketing/download.png"
                    alt="Avalo App"
                    width={320}
                    height={640}
                    className="w-full h-auto"
                  />
                </div>
                {/* Notch */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-b-2xl" />
              </div>
            </div>
          </div>

          {/* RIGHT — Content */}
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 text-xs font-medium mb-6">
              <Smartphone className="w-3.5 h-3.5" />
              Available on Mobile
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
              Take Avalo
              <br />
              <span className="gradient-text">Everywhere</span>
            </h2>

            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto lg:mx-0">
              Download the Avalo app for the full experience. Real-time chat, video calls, and seamless connections — right in your pocket.
            </p>

            {/* Store buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-6">
              <Link
                href="/download"
                className="inline-flex items-center gap-3 px-6 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-lg"
              >
                <AppleIcon className="w-6 h-6" />
                <div className="text-left">
                  <div className="text-[10px] font-medium opacity-80 leading-tight">Download on the</div>
                  <div className="text-sm font-semibold leading-tight">App Store</div>
                </div>
              </Link>

              <Link
                href="/download"
                className="inline-flex items-center gap-3 px-6 py-3.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-lg"
              >
                <GoogleIcon className="w-6 h-6" />
                <div className="text-left">
                  <div className="text-[10px] font-medium opacity-80 leading-tight">Get it on</div>
                  <div className="text-sm font-semibold leading-tight">Google Play</div>
                </div>
              </Link>
            </div>

            {/* Extra CTA */}
            <Link
              href="/download"
              className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 font-medium hover:text-purple-700 dark:hover:text-purple-300 transition"
            >
              Learn more about the app
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* FIX 139: QR Code — scan to open Avalo PWA */}
        <div className="text-center mt-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-2xl max-w-sm mx-auto">
          <h3 className="font-bold text-lg mb-2">Scan to Open Avalo</h3>
          <p className="text-sm text-gray-500 mb-4">Open on your phone — works like a native app</p>
          <div className="w-48 h-48 mx-auto bg-white p-3 rounded-xl shadow-sm">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://avalo.app')}&bgcolor=FFFFFF&color=E4458F`}
              alt="QR Code — Open Avalo"
              className="w-full h-full"
              width={200}
              height={200}
            />
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Progressive Web App — install directly from your browser
          </p>
        </div>
      </div>
    </section>
  );
}

