'use client';

import React from 'react';
import { GradientSection } from '../../components/GradientSection';
import { StoreBadges } from '../../components/StoreBadges';
import { GlassCard } from '../../components/GlassCard';

export default function DownloadPage() {
  return (
    <>
      <GradientSection className="min-h-[60vh] flex items-center justify-center px-4" variant="primary">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Download Avalo
          </h1>
          <p className="text-xl mb-12 text-white/90">
            Available on iOS and Android. Start connecting today.
          </p>
          <StoreBadges className="justify-center" />
        </div>
      </GradientSection>

      <section className="py-24 px-4 bg-background-light dark:bg-background-dark">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400">
              Follow these simple steps to join Avalo
            </p>
          </div>

          <div className="space-y-6">
            <GlassCard>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 gradient-primary rounded-full flex items-center justify-center text-white font-bold text-xl">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Download the App</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Get Avalo from the App Store or Google Play Store
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 gradient-primary rounded-full flex items-center justify-center text-white font-bold text-xl">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Create Your Profile</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Sign up with your email or social accounts and set up your profile
                  </p>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 gradient-primary rounded-full flex items-center justify-center text-white font-bold text-xl">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold mb-2">Start Connecting</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    Browse profiles, send messages, and make meaningful connections
                  </p>
                </div>
              </div>
            </GlassCard>
          </div>

          <div className="mt-16 text-center">
            <h3 className="text-2xl font-bold mb-4">Scan QR Code to Download</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Point your camera at this QR code to get the app instantly
            </p>
            <div className="inline-block p-8 glass-effect rounded-2xl">
              <div className="w-48 h-48 bg-white rounded-xl flex items-center justify-center">
                <div className="text-gray-400 text-sm">QR Code Here</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}