'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { 
  Sparkles, 
  MessageCircle, 
  Calendar, 
  Shield, 
  Users, 
  Zap,
  Download,
  ChevronRight,
  Star,
  Heart,
  Video
} from 'lucide-react';

export default function MarketingHomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If user is authenticated, redirect to feed
    if (user && !loading) {
      router.push('/feed');
    }
  }, [user, loading, router]);

  // Show marketing page for non-authenticated users
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-pink-900">
        <div className="animate-pulse">
          <Sparkles className="w-12 h-12 text-purple-400" />
        </div>
      </div>
    );
  }

  if (user) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 text-white">
      {/* Header/Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-8 h-8 text-purple-400" />
            <span className="text-2xl font-bold">Avalo</span>
          </div>
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/features" className="hover:text-purple-400 transition-colors">
              Features
            </Link>
            <Link href="/creators" className="hover:text-purple-400 transition-colors">
              For Creators
            </Link>
            <Link href="/safety" className="hover:text-purple-400 transition-colors">
              Safety
            </Link>
            <Link href="/download" className="hover:text-purple-400 transition-colors">
              Download
            </Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link 
              href="/auth/login" 
              className="px-4 py-2 hover:text-purple-400 transition-colors"
            >
              Log In
            </Link>
            <Link 
              href="/start" 
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <div className="inline-flex items-center space-x-2 bg-purple-600/20 border border-purple-500/30 rounded-full px-4 py-2 mb-8">
            <Star className="w-4 h-4 text-purple-400" />
            <span className="text-sm">Premium Social & Dating Platform</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            Connect Beyond Boundaries
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Meet, chat, and build meaningful connections in a premium social ecosystem designed for authentic interactions
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <Link 
              href="/download"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all flex items-center justify-center space-x-2"
            >
              <Download className="w-5 h-5" />
              <span>Download App</span>
            </Link>
            <Link 
              href="/start"
              className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm rounded-full font-semibold text-lg hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center space-x-2"
            >
              <span>Start on Web</span>
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          {/* App Screenshot Placeholder */}
          <div className="relative max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-3xl border border-white/10 p-8 backdrop-blur-sm">
              <div className="aspect-video bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-2xl flex items-center justify-center">
                <div className="text-center">
                  <Sparkles className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                  <p className="text-gray-400">App Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Avalo Works */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            How Avalo Works
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Users,
                title: 'Discover & Swipe',
                description: 'Browse profiles and connect with people who match your interests and preferences'
              },
              {
                icon: MessageCircle,
                title: 'Chat & Connect',
                description: 'Engage in meaningful conversations with premium messaging features'
              },
              {
                icon: Calendar,
                title: 'Meet & Events',
                description: 'Book meetings and attend exclusive events to connect in real life'
              },
              {
                icon: Zap,
                title: 'Build Your Audience',
                description: 'Grow your following and monetize your content through authentic engagement'
              }
            ].map((feature, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition-all"
              >
                <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Creators Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Built for Creators
              </h2>
              <p className="text-xl text-gray-300 mb-8">
                Turn your connections into opportunities. Monetize your content, host events, and build a sustainable income through authentic engagement.
              </p>
              <ul className="space-y-4 mb-8">
                {[
                  'Pay-per-message premium chats',
                  'One-on-one video calls',
                  'Meet & greet bookings',
                  'Event hosting & ticketing',
                  'AI companion engagement'
                ].map((item, index) => (
                  <li key={index} className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
              <Link 
                href="/creators"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all"
              >
                <span>Learn More</span>
                <ChevronRight className="w-5 h-5" />
              </Link>
            </div>
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-3xl border border-white/10 p-8 backdrop-blur-sm">
              <div className="aspect-square bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-2xl flex items-center justify-center">
                <Heart className="w-24 h-24 text-purple-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Safety & Trust */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <Shield className="w-16 h-16 text-purple-400 mx-auto mb-6" />
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Safety & Trust First
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Your safety is our priority. We've built comprehensive systems to ensure a secure and trustworthy environment.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: '18+ Only',
                description: 'Strict age verification for all users'
              },
              {
                title: 'Identity Verification',
                description: 'Mandatory verification process'
              },
              {
                title: 'Panic Button',
                description: 'Instant help in emergencies'
              },
              {
                title: 'Meeting Verification',
                description: 'QR codes & selfie verification for safety'
              }
            ].map((item, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-xl p-6 border border-white/10 text-center"
              >
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-400">{item.description}</p>
              </div>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Link 
              href="/safety"
              className="inline-flex items-center space-x-2 text-purple-400 hover:text-purple-300 transition-colors"
            >
              <span>Read our Safety Guidelines</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Start Your Journey?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of users connecting, creating, and thriving on Avalo
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/download"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all flex items-center justify-center space-x-2"
            >
              <Download className="w-5 h-5" />
              <span>Download Now</span>
            </Link>
            <Link 
              href="/start"
              className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm rounded-full font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Open Web App
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Sparkles className="w-6 h-6 text-purple-400" />
                <span className="text-xl font-bold">Avalo</span>
              </div>
              <p className="text-gray-400 text-sm">
                Premium social & dating platform
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/features" className="hover:text-purple-400 transition-colors">Features</Link></li>
                <li><Link href="/creators" className="hover:text-purple-400 transition-colors">For Creators</Link></li>
                <li><Link href="/download" className="hover:text-purple-400 transition-colors">Download</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/investors" className="hover:text-purple-400 transition-colors">Investors</Link></li>
                <li><Link href="/safety" className="hover:text-purple-400 transition-colors">Safety</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/legal/terms" className="hover:text-purple-400 transition-colors">Terms of Service</Link></li>
                <li><Link href="/legal/privacy" className="hover:text-purple-400 transition-colors">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 text-center text-sm text-gray-400">
            <p>&copy; {new Date().getFullYear()} Avalo. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}