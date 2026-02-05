'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/feed');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#40E0D0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#0a0a0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold tracking-tight">Avalo</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how-it-works" className="text-gray-400 hover:text-white transition-colors">How It Works</a>
            <a href="#benefits" className="text-gray-400 hover:text-white transition-colors">Benefits</a>
            <a href="#trust" className="text-gray-400 hover:text-white transition-colors">Trust & Safety</a>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/login"
              className="text-gray-300 hover:text-white transition-colors font-medium"
            >
              Log In
            </Link>
            <Link
              href="/start"
              className="px-6 py-2.5 bg-gradient-to-r from-[#40E0D0] to-[#D4AF37] text-[#0a0a0f] font-semibold rounded-full hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#40E0D0]/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#D4AF37]/10 rounded-full blur-3xl" />
        </div>
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/5 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
            <span className="text-sm text-[#D4AF37] font-medium">Premium Creator Platform</span>
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight mb-8">
            <span className="block">Your Audience.</span>
            <span className="block bg-gradient-to-r from-[#40E0D0] via-[#D4AF37] to-[#40E0D0] bg-clip-text text-transparent">
              Your Empire.
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 leading-relaxed">
            Build authentic connections, monetize your influence, and grow your creator business 
            on the platform built for safety-first premium experiences.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link
              href="/start"
              className="w-full sm:w-auto px-10 py-4 bg-gradient-to-r from-[#40E0D0] to-[#D4AF37] text-[#0a0a0f] font-bold text-lg rounded-full hover:opacity-90 transition-opacity shadow-lg shadow-[#40E0D0]/20"
            >
              Start Building Today
            </Link>
            <Link
              href="/download"
              className="w-full sm:w-auto px-10 py-4 border-2 border-white/20 text-white font-semibold text-lg rounded-full hover:bg-white/5 transition-colors"
            >
              Download Mobile App
            </Link>
          </div>
          <div className="flex items-center justify-center gap-8 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#40E0D0]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>ID Verified Users</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#40E0D0]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>18+ Platform</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#40E0D0]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>AI-Powered Safety</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 px-6 bg-gradient-to-b from-transparent via-[#0f0f18] to-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Get Started in <span className="text-[#40E0D0]">3 Simple Steps</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              From signup to your first earnings in minutes, not days.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#40E0D0]/20 to-[#D4AF37]/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-[#12121a] border border-white/10 rounded-2xl p-8 h-full">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#40E0D0] to-[#40E0D0]/50 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-[#0a0a0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="text-sm font-bold text-[#40E0D0] mb-2">STEP 01</div>
                <h3 className="text-2xl font-bold mb-3">Create Your Profile</h3>
                <p className="text-gray-400 leading-relaxed">
                  Sign up, verify your identity, and build a stunning profile that showcases your unique personality and content style.
                </p>
              </div>
            </div>
            {/* Step 2 */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#40E0D0]/20 to-[#D4AF37]/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-[#12121a] border border-white/10 rounded-2xl p-8 h-full">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#D4AF37]/50 flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-[#0a0a0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="text-sm font-bold text-[#D4AF37] mb-2">STEP 02</div>
                <h3 className="text-2xl font-bold mb-3">Build Your Audience</h3>
                <p className="text-gray-400 leading-relaxed">
                  Connect with fans through premium chats, exclusive content, and live events. Our AI helps you grow authentically.
                </p>
              </div>
            </div>
            {/* Step 3 */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-[#40E0D0]/20 to-[#D4AF37]/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative bg-[#12121a] border border-white/10 rounded-2xl p-8 h-full">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#40E0D0] via-[#D4AF37] to-[#40E0D0] flex items-center justify-center mb-6">
                  <svg className="w-7 h-7 text-[#0a0a0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm font-bold bg-gradient-to-r from-[#40E0D0] to-[#D4AF37] bg-clip-text text-transparent mb-2">STEP 03</div>
                <h3 className="text-2xl font-bold mb-3">Start Earning</h3>
                <p className="text-gray-400 leading-relaxed">
                  Monetize through pay-per-message, video calls, meet & greets, and exclusive content. Weekly payouts, zero hassle.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits Section */}
      <section id="benefits" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Why Creators Choose <span className="text-[#D4AF37]">Avalo</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Built from the ground up for creator success and safety.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Trust */}
            <div className="bg-gradient-to-b from-[#12121a] to-[#0f0f15] border border-white/10 rounded-2xl p-6 hover:border-[#40E0D0]/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#40E0D0]/10 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#40E0D0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Verified Trust</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Every user is identity-verified. Build genuine connections with real people, not bots or fake profiles.
              </p>
            </div>
            {/* Safety */}
            <div className="bg-gradient-to-b from-[#12121a] to-[#0f0f15] border border-white/10 rounded-2xl p-6 hover:border-[#D4AF37]/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Safety First</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Panic button, meeting verification, and 24/7 support team. Your safety is non-negotiable.
              </p>
            </div>
            {/* Monetization */}
            <div className="bg-gradient-to-b from-[#12121a] to-[#0f0f15] border border-white/10 rounded-2xl p-6 hover:border-[#40E0D0]/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#40E0D0]/10 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#40E0D0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Smart Monetization</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Multiple revenue streams: premium chats, video calls, events, tips, and exclusive content subscriptions.
              </p>
            </div>
            {/* AI Moderation */}
            <div className="bg-gradient-to-b from-[#12121a] to-[#0f0f15] border border-white/10 rounded-2xl p-6 hover:border-[#D4AF37]/30 transition-colors">
              <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center mb-5">
                <svg className="w-6 h-6 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">AI-Powered Moderation</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                Advanced AI detects and prevents harassment, spam, and inappropriate content before it reaches you.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Safety Section */}
      <section id="trust" className="py-24 px-6 bg-gradient-to-b from-transparent via-[#0f0f18] to-transparent">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#40E0D0]/30 bg-[#40E0D0]/5 mb-6">
                <svg className="w-4 h-4 text-[#40E0D0]" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-[#40E0D0] font-medium">Industry-Leading Safety</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Your Safety is Our <span className="text-[#40E0D0]">Foundation</span>
              </h2>
              <p className="text-xl text-gray-400 mb-10 leading-relaxed">
                We've built the most comprehensive safety infrastructure in the creator economy. 
                Every feature, every interaction is designed with your protection in mind.
              </p>
              <div className="space-y-6">
                {/* Moderation */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#40E0D0]/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#40E0D0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">24/7 Content Moderation</h3>
                    <p className="text-gray-400 text-sm">AI-powered and human-reviewed moderation catches harmful content in real-time.</p>
                  </div>
                </div>
                {/* Compliance */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Full Legal Compliance</h3>
                    <p className="text-gray-400 text-sm">GDPR, CCPA, and regional compliance built-in. Your data rights are protected globally.</p>
                  </div>
                </div>
                {/* Security */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#40E0D0]/10 flex items-center justify-center">
                    <svg className="w-6 h-6 text-[#40E0D0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1">Bank-Grade Security</h3>
                    <p className="text-gray-400 text-sm">End-to-end encryption, secure payments, and continuous security audits protect your account.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-[#40E0D0]/20 to-[#D4AF37]/20 rounded-3xl blur-xl" />
              <div className="relative bg-[#12121a] border border-white/10 rounded-3xl p-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-[#0a0a0f] rounded-2xl p-6 text-center">
                    <div className="text-4xl font-bold text-[#40E0D0] mb-2">100%</div>
                    <div className="text-sm text-gray-400">User Verification</div>
                  </div>
                  <div className="bg-[#0a0a0f] rounded-2xl p-6 text-center">
                    <div className="text-4xl font-bold text-[#D4AF37] mb-2">24/7</div>
                    <div className="text-sm text-gray-400">Safety Team</div>
                  </div>
                  <div className="bg-[#0a0a0f] rounded-2xl p-6 text-center">
                    <div className="text-4xl font-bold text-[#D4AF37] mb-2">&lt;1min</div>
                    <div className="text-sm text-gray-400">Response Time</div>
                  </div>
                  <div className="bg-[#0a0a0f] rounded-2xl p-6 text-center">
                    <div className="text-4xl font-bold text-[#40E0D0] mb-2">256-bit</div>
                    <div className="text-sm text-gray-400">Encryption</div>
                  </div>
                </div>
                <div className="mt-6 p-4 bg-[#0a0a0f] rounded-xl border border-[#40E0D0]/20">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#40E0D0]/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-[#40E0D0]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Panic Button Active</div>
                      <div className="text-xs text-gray-400">Instant emergency support available 24/7</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="relative">
            <div className="absolute -inset-8 bg-gradient-to-r from-[#40E0D0]/10 via-[#D4AF37]/10 to-[#40E0D0]/10 rounded-3xl blur-2xl" />
            <div className="relative bg-gradient-to-b from-[#12121a] to-[#0f0f15] border border-white/10 rounded-3xl p-12 md:p-16">
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
                Ready to Transform Your <span className="bg-gradient-to-r from-[#40E0D0] to-[#D4AF37] bg-clip-text text-transparent">Creator Journey</span>?
              </h2>
              <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
                Join thousands of creators already building their empires on Avalo. 
                Your audience is waiting.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/start"
                  className="w-full sm:w-auto px-12 py-4 bg-gradient-to-r from-[#40E0D0] to-[#D4AF37] text-[#0a0a0f] font-bold text-lg rounded-full hover:opacity-90 transition-opacity shadow-lg shadow-[#40E0D0]/20"
                >
                  Create Your Account
                </Link>
                <Link
                  href="/creators"
                  className="w-full sm:w-auto px-12 py-4 border-2 border-white/20 text-white font-semibold text-lg rounded-full hover:bg-white/5 transition-colors"
                >
                  Learn More
                </Link>
              </div>
              <p className="mt-8 text-sm text-gray-500">
                Free to join. No credit card required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] flex items-center justify-center">
                  <svg className="w-6 h-6 text-[#0a0a0f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className="text-xl font-bold">Avalo</span>
              </div>
              <p className="text-gray-500 text-sm">
                The premium creator platform built for authentic connections and sustainable growth.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">Platform</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li><Link href="/features" className="hover:text-[#40E0D0] transition-colors">Features</Link></li>
                <li><Link href="/creators" className="hover:text-[#40E0D0] transition-colors">For Creators</Link></li>
                <li><Link href="/download" className="hover:text-[#40E0D0] transition-colors">Download</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">Company</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li><Link href="/safety" className="hover:text-[#40E0D0] transition-colors">Safety Center</Link></li>
                <li><Link href="/investors" className="hover:text-[#40E0D0] transition-colors">Investors</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">Legal</h4>
              <ul className="space-y-3 text-sm text-gray-500">
                <li><Link href="/legal/terms" className="hover:text-[#40E0D0] transition-colors">Terms of Service</Link></li>
                <li><Link href="/legal/privacy" className="hover:text-[#40E0D0] transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              © {new Date().getFullYear()} Avalo. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
