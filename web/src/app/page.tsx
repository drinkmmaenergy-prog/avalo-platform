'use client';

import React from 'react';
import { GradientSection } from '../components/GradientSection';
import { CTAButton } from '../components/CTAButton';
import { GlassCard } from '../components/GlassCard';
import { StoreBadges } from '../components/StoreBadges';

export default function HomePage() {
  return (
    <>
      {/* Hero Section */}
      <GradientSection className="min-h-screen flex items-center justify-center px-4" variant="primary" animate>
        <div className="max-w-5xl mx-auto text-center text-white">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            The Future of
            <br />
            Social Connections
          </h1>
          <p className="text-xl md:text-2xl mb-12 text-white/90 max-w-2xl mx-auto">
            Meet new people, make meaningful connections, and experience the next generation of social networking
          </p>
          <StoreBadges className="justify-center mb-8" />
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <CTAButton href="/download" size="large" variant="secondary">
              Download Now
            </CTAButton>
            <CTAButton
              href="#features"
              size="large"
              className="bg-white/20 hover:bg-white/30 backdrop-blur"
            >
              Learn More
            </CTAButton>
          </div>
        </div>
      </GradientSection>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 bg-background-light dark:bg-background-dark">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Choose Avalo?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Experience social networking reimagined with cutting-edge features and a focus on authentic connections
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <GlassCard>
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-2xl font-bold mb-3">Smart Matching</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Our AI-powered algorithm connects you with people who share your interests and values
              </p>
            </GlassCard>

            <GlassCard>
              <div className="text-4xl mb-4">🔒</div>
              <h3 className="text-2xl font-bold mb-3">Privacy First</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Your data is encrypted and protected. You control what you share and with whom
              </p>
            </GlassCard>

            <GlassCard>
              <div className="text-4xl mb-4">💬</div>
              <h3 className="text-2xl font-bold mb-3">Real Conversations</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Engage in meaningful chats with built-in AI companions and real people
              </p>
            </GlassCard>

            <GlassCard>
              <div className="text-4xl mb-4">🎨</div>
              <h3 className="text-2xl font-bold mb-3">Beautiful Design</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Stunning gradients and smooth animations make every interaction delightful
              </p>
            </GlassCard>

            <GlassCard>
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="text-2xl font-bold mb-3">Global Community</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Connect with people from around the world in a safe and inclusive environment
              </p>
            </GlassCard>

            <GlassCard>
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-2xl font-bold mb-3">Lightning Fast</h3>
              <p className="text-gray-600 dark:text-gray-400">
                Optimized performance ensures smooth scrolling and instant interactions
              </p>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <GradientSection className="py-24 px-4" variant="secondary">
        <div className="max-w-4xl mx-auto text-center text-white">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Join Avalo?
          </h2>
          <p className="text-xl mb-12 text-white/90">
            Download the app now and start making meaningful connections today
          </p>
          <StoreBadges className="justify-center" />
        </div>
      </GradientSection>
    </>
  );
}