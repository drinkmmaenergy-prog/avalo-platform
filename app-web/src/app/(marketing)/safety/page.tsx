import type { Metadata } from 'next';
import Link from 'next/link';
import { 
  Sparkles, 
  Shield, 
  Lock,
  AlertTriangle,
  UserCheck,
  Camera,
  Bell,
  Phone,
  CheckCircle,
  XCircle,
  ChevronRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Safety & Trust - Avalo',
  description: 'Your safety is our priority. Learn about our comprehensive safety features and community guidelines.',
};

export default function SafetyPage() {
  const safetyFeatures = [
    {
      icon: UserCheck,
      title: '18+ Verification',
      description: 'Every user must verify their age and identity before accessing the platform. We use industry-standard verification methods to ensure a safe, adult-only environment.'
    },
    {
      icon: Shield,
      title: 'Panic Button',
      description: 'One-tap emergency assistance available throughout the app. Instantly alert our support team or emergency contacts if you feel unsafe.'
    },
    {
      icon: Camera,
      title: 'Meeting Verification',
      description: 'For in-person meetings, use our QR code and selfie verification system to confirm identity and ensure safety before meeting.'
    },
    {
      icon: Lock,
      title: 'Privacy Controls',
      description: 'Complete control over your visibility, who can contact you, and what information you share. Block and report features readily available.'
    },
    {
      icon: Bell,
      title: 'Real-time Moderation',
      description: 'AI-powered content moderation combined with human review team working 24/7 to maintain community standards.'
    },
    {
      icon: AlertTriangle,
      title: 'Fraud Prevention',
      description: 'Advanced systems to detect and prevent scams, catfishing, and fraudulent activity. Report suspicious behavior instantly.'
    }
  ];

  const communityGuidelines = [
    {
      do: true,
      items: [
        'Be respectful and courteous to all users',
        'Use recent, genuine photos of yourself',
        'Report suspicious or inappropriate behavior',
        'Verify identities before in-person meetings',
        'Meet in public places for first meetings',
        'Trust your instincts - if something feels wrong, it probably is'
      ]
    },
    {
      do: false,
      items: [
        'Share financial information or send money',
        'Use fake photos or impersonate others',
        'Harass, threaten, or abuse other users',
        'Share explicit content without consent',
        'Promote illegal activities or services',
        'Attempt to take conversations off-platform to avoid moderation'
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
            <Link href="/features" className="hover:text-purple-400 transition-colors">
              Features
            </Link>
            <Link href="/creators" className="hover:text-purple-400 transition-colors">
              For Creators
            </Link>
            <Link href="/safety" className="text-purple-400">
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
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full mb-8">
            <Shield className="w-10 h-10" />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            Your Safety is Our Priority
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
            We've built comprehensive safety systems and guidelines to ensure a secure, trustworthy environment for all users
          </p>
        </div>
      </section>

      {/* Safety Features */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            Comprehensive Safety Features
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {safetyFeatures.map((feature, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-6 border border-white/10"
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

      {/* Community Guidelines */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            Community Guidelines
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Do's */}
            <div className="bg-gradient-to-br from-green-900/20 to-green-600/20 rounded-2xl p-8 border border-green-500/30">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">Do's</h3>
              </div>
              <ul className="space-y-3">
                {communityGuidelines[0].items.map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Don'ts */}
            <div className="bg-gradient-to-br from-red-900/20 to-red-600/20 rounded-2xl p-8 border border-red-500/30">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center">
                  <XCircle className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold">Don'ts</h3>
              </div>
              <ul className="space-y-3">
                {communityGuidelines[1].items.map((item, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Safety Tips */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16">
            Safety Tips
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Meeting in Person',
                tips: [
                  'Always meet in public places',
                  'Tell a friend where you\'re going',
                  'Use our meeting verification feature',
                  'Trust your instincts',
                  'Stay sober and alert'
                ]
              },
              {
                title: 'Protecting Your Privacy',
                tips: [
                  'Don\'t share financial information',
                  'Use the in-app communication features',
                  'Be cautious about sharing personal details',
                  'Check privacy settings regularly',
                  'Report suspicious behavior immediately'
                ]
              },
              {
                title: 'Spotting Red Flags',
                tips: [
                  'Requests for money or financial help',
                  'Pressure to move conversations off-platform',
                  'Inconsistent or vague information',
                  'Refusal to video chat or meet',
                  'Too good to be true scenarios'
                ]
              },
              {
                title: 'Using Platform Tools',
                tips: [
                  'Block users who make you uncomfortable',
                  'Report inappropriate content immediately',
                  'Use the panic button if needed',
                  'Keep evidence of harassment',
                  'Contact support for assistance'
                ]
              }
            ].map((section, index) => (
              <div 
                key={index}
                className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-6 border border-white/10"
              >
                <h3 className="text-xl font-semibold mb-4">{section.title}</h3>
                <ul className="space-y-2">
                  {section.tips.map((tip, tipIndex) => (
                    <li key={tipIndex} className="flex items-start space-x-3">
                      <ChevronRight className="w-4 h-4 text-purple-400 flex-shrink-0 mt-1" />
                      <span className="text-gray-400 text-sm">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Emergency Contact */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="bg-gradient-to-br from-red-900/30 to-red-600/30 rounded-2xl p-8 border border-red-500/30 text-center">
            <Phone className="w-16 h-16 text-red-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">In Case of Emergency</h2>
            <p className="text-xl text-gray-300 mb-6">
              If you're in immediate danger, contact local emergency services first
            </p>
            <div className="space-y-4">
              <p className="text-gray-400">
                Use our in-app panic button for immediate platform assistance, or contact our 24/7 safety team for non-emergency concerns
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  href="/download"
                  className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all"
                >
                  Download App
                </Link>
                <Link 
                  href="/legal/safety"
                  className="px-8 py-3 bg-white/10 backdrop-blur-sm rounded-full font-semibold hover:bg-white/20 transition-all border border-white/20"
                >
                  Full Safety Policy
                </Link>
              </div>
            </div>
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