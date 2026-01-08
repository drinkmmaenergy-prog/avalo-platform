import type { Metadata } from 'next';
import Link from 'next/link';
import { 
  Sparkles, 
  TrendingUp,
  Globe,
  Users,
  Shield,
  Zap,
  DollarSign,
  Award,
  ChevronRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Investors - Avalo',
  description: 'Learn about Avalo\'s vision, growth, and investment opportunity in the premium social platform space.',
};

export default function InvestorsPage() {
  const highlights = [
    {
      icon: Users,
      title: 'Growing Community',
      description: 'Rapidly expanding user base across multiple markets'
    },
    {
      icon: DollarSign,
      title: 'Multiple Revenue Streams',
      description: 'Diversified monetization through premium features'
    },
    {
      icon: Globe,
      title: 'Global Scale',
      description: 'Operating in key markets with expansion plans'
    },
    {
      icon: Shield,
      title: 'Safety First',
      description: 'Industry-leading trust and safety infrastructure'
    }
  ];

  const metrics = [
    {
      label: 'Market Opportunity',
      value: '$30B+',
      description: 'Global social dating market size'
    },
    {
      label: 'Target Audience',
      value: '18-45',
      description: 'Prime demographic segment'
    },
    {
      label: 'Growth Focus',
      value: 'Creator Economy',
      description: 'Next-gen monetization model'
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
              href="/investor/dashboard" 
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl text-center">
          <div className="inline-flex items-center space-x-2 bg-purple-600/20 border border-purple-500/30 rounded-full px-4 py-2 mb-8">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <span className="text-sm">Investment Opportunity</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            Building the Future of Social Connection
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Avalo is transforming how people connect, engage, and monetize relationships in the digital age
          </p>
        </div>
      </section>

      {/* Market Opportunity */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Market Opportunity
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Positioned at the intersection of dating, social media, and the creator economy
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {metrics.map((metric, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border border-white/10 text-center"
              >
                <div className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                  {metric.value}
                </div>
                <h3 className="text-xl font-semibold mb-2">{metric.label}</h3>
                <p className="text-gray-400">{metric.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Platform Highlights */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Why Avalo
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {highlights.map((highlight, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border border-white/10"
              >
                <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl flex items-center justify-center mb-4">
                  <highlight.icon className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-semibold mb-3">{highlight.title}</h3>
                <p className="text-gray-400">{highlight.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Business Model */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Revenue Streams
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Diversified monetization strategy built for sustainable growth
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Users,
                title: 'Premium Messaging',
                description: 'Pay-per-message and subscription models'
              },
              {
                icon: Zap,
                title: 'Video Calls',
                description: 'One-on-one premium video interactions'
              },
              {
                icon: Award,
                title: 'Bookings & Events',
                description: 'Calendar bookings and event ticketing'
              },
              {
                icon: Sparkles,
                title: 'AI Features',
                description: 'AI companion subscriptions and upgrades'
              }
            ].map((stream, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-xl p-6 border border-white/10 text-center"
              >
                <div className="w-10 h-10 bg-gradient-to-r from-purple-600/50 to-pink-600/50 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <stream.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{stream.title}</h3>
                <p className="text-sm text-gray-400">{stream.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Competitive Advantages */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Competitive Advantages
            </h2>
          </div>

          <div className="space-y-6">
            {[
              {
                title: 'Creator-First Platform',
                description: 'Built for creators to monetize authentically with competitive revenue shares'
              },
              {
                title: 'Privacy & Safety Infrastructure',
                description: 'Industry-leading verification, moderation, and safety features'
              },
              {
                title: 'AI-Powered Experience',
                description: 'Advanced matching, AI companions, and personalized engagement'
              },
              {
                title: 'Multi-Platform Reach',
                description: 'Native iOS, Android, and web apps with seamless synchronization'
              },
              {
                title: 'Compliance-First Approach',
                description: 'Built with regulatory compliance and legal frameworks from day one'
              }
            ].map((advantage, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-6 border border-white/10 flex items-start space-x-4"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <ChevronRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">{advantage.title}</h3>
                  <p className="text-gray-400">{advantage.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Investor Access */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-12 border border-white/10 text-center">
            <TrendingUp className="w-16 h-16 text-purple-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">Investor Dashboard</h2>
            <p className="text-xl text-gray-300 mb-8">
              Access real-time metrics, growth analytics, and performance data
            </p>
            <Link 
              href="/investor/dashboard"
              className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              <span>Access Dashboard</span>
              <ChevronRight className="w-5 h-5" />
            </Link>
            <p className="text-sm text-gray-400 mt-4">
              Authorized investors only • Credentials required
            </p>
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