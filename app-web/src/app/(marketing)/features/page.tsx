import type { Metadata } from 'next';
import Link from 'next/link';
import { 
  Sparkles, 
  MessageCircle, 
  Video, 
  Calendar, 
  Users, 
  Shield, 
  Zap,
  Heart,
  Globe,
  Lock,
  Bell,
  TrendingUp,
  ChevronRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Features - Avalo',
  description: 'Discover all the features that make Avalo the premier social and dating platform',
};

export default function FeaturesPage() {
  const features = [
    {
      category: 'Discovery & Matching',
      icon: Users,
      items: [
        {
          name: 'Smart Matching',
          description: 'AI-powered algorithm connects you with compatible people based on interests and preferences',
          icon: Sparkles
        },
        {
          name: 'Advanced Filters',
          description: 'Customize your search with detailed filters for location, interests, and more',
          icon: Zap
        },
        {
          name: 'Global Reach',
          description: 'Connect with people worldwide or focus on your local community',
          icon: Globe
        }
      ]
    },
    {
      category: 'Communication',
      icon: MessageCircle,
      items: [
        {
          name: 'Premium Chat',
          description: 'Rich messaging with photos, videos, voice messages, and reactions',
          icon: MessageCircle
        },
        {
          name: 'Video Calls',
          description: 'High-quality video calls for face-to-face conversations',
          icon: Video
        },
        {
          name: 'Real-time Notifications',
          description: 'Never miss a message with instant push notifications',
          icon: Bell
        }
      ]
    },
    {
      category: 'Meetings & Events',
      icon: Calendar,
      items: [
        {
          name: 'Calendar Bookings',
          description: 'Schedule one-on-one meetings with built-in calendar integration',
          icon: Calendar
        },
        {
          name: 'Event Hosting',
          description: 'Create and host exclusive events for your audience',
          icon: Users
        },
        {
          name: 'Meeting Verification',
          description: 'QR code and selfie verification for safe in-person meetings',
          icon: Shield
        }
      ]
    },
    {
      category: 'Creator Features',
      icon: TrendingUp,
      items: [
        {
          name: 'Monetization',
          description: 'Earn through pay-per-message, calls, bookings, and events',
          icon: TrendingUp
        },
        {
          name: 'AI Companions',
          description: 'Create AI-powered characters for enhanced engagement',
          icon: Sparkles
        },
        {
          name: 'Analytics',
          description: 'Track your performance and audience growth',
          icon: TrendingUp
        }
      ]
    },
    {
      category: 'Safety & Privacy',
      icon: Shield,
      items: [
        {
          name: 'Age Verification',
          description: 'Mandatory 18+ verification for all users',
          icon: Shield
        },
        {
          name: 'Privacy Controls',
          description: 'Complete control over who sees your profile and content',
          icon: Lock
        },
        {
          name: 'Panic Button',
          description: 'Instant emergency assistance at your fingertips',
          icon: Shield
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Sparkles className="w-8 h-8 text-purple-400" />
            <span className="text-2xl font-bold">Avalo</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/features" className="text-purple-400">
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

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            Everything You Need to Connect
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Powerful features designed for meaningful connections, authentic engagement, and seamless interactions
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl space-y-20">
          {features.map((category, categoryIndex) => (
            <div key={categoryIndex}>
              <div className="flex items-center space-x-3 mb-8">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                  <category.icon className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-bold">{category.category}</h2>
              </div>
              
              <div className="grid md:grid-cols-3 gap-8">
                {category.items.map((feature, featureIndex) => (
                  <div 
                    key={featureIndex}
                    className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-6 border border-white/10 hover:border-purple-500/50 transition-all"
                  >
                    <div className="w-10 h-10 bg-gradient-to-r from-purple-600/50 to-pink-600/50 rounded-lg flex items-center justify-center mb-4">
                      <feature.icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{feature.name}</h3>
                    <p className="text-gray-400">{feature.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Experience Avalo?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of users already connecting on the platform
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/download"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              Download App
            </Link>
            <Link 
              href="/start"
              className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm rounded-full font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Start on Web
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