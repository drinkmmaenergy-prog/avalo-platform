import type { Metadata } from 'next';
import Link from 'next/link';
import { 
  Sparkles, 
  MessageCircle, 
  Video, 
  Calendar, 
  DollarSign,
  TrendingUp,
  Users,
  Award,
  ChevronRight,
  Heart,
  Zap,
  Shield
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'For Creators - Avalo',
  description: 'Turn your connections into opportunities. Build your audience and monetize your content on Avalo.',
};

export default function CreatorsPage() {
  const monetizationFeatures = [
    {
      icon: MessageCircle,
      title: 'Pay-Per-Message',
      description: 'Set your rates for premium chat interactions. Engage with your audience through exclusive conversations.'
    },
    {
      icon: Video,
      title: 'Video Calls',
      description: 'Offer one-on-one video call sessions at your preferred rates for deeper connections.'
    },
    {
      icon: Calendar,
      title: 'Meet & Greet Bookings',
      description: 'Schedule and monetize in-person meetings with integrated calendar and payment systems.'
    },
    {
      icon: Users,
      title: 'Event Hosting',
      description: 'Create exclusive events, sell tickets, and build community around shared interests.'
    },
    {
      icon: Sparkles,
      title: 'AI Companions',
      description: 'Create AI-powered characters that engage with your audience when you\'re offline.'
    },
    {
      icon: TrendingUp,
      title: 'Analytics & Insights',
      description: 'Track your performance, understand your audience, and optimize your earnings.'
    }
  ];

  const benefits = [
    {
      stat: '65-80%',
      label: 'Revenue Share',
      description: 'Competitive earnings on all your premium interactions'
    },
    {
      stat: '24/7',
      label: 'Support',
      description: 'Dedicated creator support team always available'
    },
    {
      stat: '100%',
      label: 'Control',
      description: 'You decide your rates, schedule, and content'
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
            <Link href="/features" className="hover:text-purple-400 transition-colors">
              Features
            </Link>
            <Link href="/creators" className="text-purple-400">
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
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center space-x-2 bg-purple-600/20 border border-purple-500/30 rounded-full px-4 py-2 mb-6">
                <Award className="w-4 h-4 text-purple-400" />
                <span className="text-sm">Build Your Creator Business</span>
              </div>
              
              <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                Turn Connections Into Income
              </h1>
              
              <p className="text-xl text-gray-300 mb-8">
                Build a sustainable income through authentic engagement. Monetize your time, content, and expertise with powerful creator tools.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link 
                  href="/start"
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all text-center"
                >
                  Start Creating
                </Link>
                <Link 
                  href="/download"
                  className="px-8 py-4 bg-white/10 backdrop-blur-sm rounded-full font-semibold text-lg hover:bg-white/20 transition-all border border-white/20 text-center"
                >
                  Download App
                </Link>
              </div>

              <div className="flex items-center space-x-2 text-sm text-gray-400">
                <Shield className="w-4 h-4" />
                <span>Safe, secure, and creator-friendly platform</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 rounded-3xl border border-white/10 p-8 backdrop-blur-sm">
              <div className="aspect-square bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-2xl flex items-center justify-center">
                <Heart className="w-32 h-32 text-purple-400" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {benefits.map((benefit, index) => (
              <div 
                key={index}
                className="text-center"
              >
                <div className="text-5xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-3">
                  {benefit.stat}
                </div>
                <h3 className="text-xl font-semibold mb-2">{benefit.label}</h3>
                <p className="text-gray-400">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Monetization Features */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Multiple Revenue Streams
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Diversify your income with various monetization options tailored to your audience
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {monetizationFeatures.map((feature, index) => (
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

      {/* How It Works */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              How Creator Earnings Work
            </h2>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              {
                step: '1',
                title: 'Set Your Rates',
                description: 'Choose your pricing for messages, calls, bookings, and events'
              },
              {
                step: '2',
                title: 'Build Your Audience',
                description: 'Grow your following through authentic engagement'
              },
              {
                step: '3',
                title: 'Earn Revenue',
                description: 'Get paid for every interaction at your chosen rates'
              },
              {
                step: '4',
                title: 'Track & Grow',
                description: 'Use analytics to optimize and scale your earnings'
              }
            ].map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border border-white/10">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold mb-4">Important Note</h3>
                <p className="text-gray-300 mb-4">
                  Avalo provides a safe, compliant platform for creators to monetize their time and engagement. All transactions follow platform guidelines and local regulations.
                </p>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-purple-400" />
                    <span>18+ verified community only</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-purple-400" />
                    <span>Safe, moderated environment</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-purple-400" />
                    <span>Clear content policies and guidelines</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <ChevronRight className="w-4 h-4 mt-1 flex-shrink-0 text-purple-400" />
                    <span>No explicit content requirements</span>
                  </li>
                </ul>
              </div>
              <div className="flex items-center justify-center">
                <Shield className="w-32 h-32 text-purple-400/50" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Start Earning?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Join thousands of creators building sustainable income on Avalo
          </p>
          <Link 
            href="/start"
            className="inline-block px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all"
          >
            Start Your Creator Journey
          </Link>
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