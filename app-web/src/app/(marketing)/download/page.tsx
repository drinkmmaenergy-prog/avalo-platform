import type { Metadata } from 'next';
import Link from 'next/link';
import { 
  Sparkles, 
  Download,
  Smartphone,
  Monitor,
  QrCode,
  Apple,
  ChevronRight
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Download Avalo - Get Started',
  description: 'Download the Avalo app for iOS and Android, or use our web app on any device.',
};

export default function DownloadPage() {
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
            <Link href="/download" className="text-purple-400">
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
            <Download className="w-10 h-10" />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
            Get Avalo
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto">
            Available on iOS, Android, and web. Choose your platform and start connecting today.
          </p>
        </div>
      </section>

      {/* Download Options */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {/* Mobile Apps */}
            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border border-white/10 text-center">
              <Smartphone className="w-16 h-16 text-purple-400 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4">Mobile Apps</h2>
              <p className="text-gray-400 mb-8">
                Get the full Avalo experience on your mobile device
              </p>
              
              <div className="space-y-4">
                {/* App Store */}
                <a 
                  href="#" 
                  className="flex items-center justify-center space-x-3 bg-black/50 hover:bg-black/70 transition-colors rounded-xl p-4 border border-white/10"
                >
                  <Apple className="w-8 h-8" />
                  <div className="text-left">
                    <div className="text-xs text-gray-400">Download on the</div>
                    <div className="text-sm font-semibold">App Store</div>
                  </div>
                </a>

                {/* Play Store */}
                <a 
                  href="#" 
                  className="flex items-center justify-center space-x-3 bg-black/50 hover:bg-black/70 transition-colors rounded-xl p-4 border border-white/10"
                >
                  <div className="w-8 h-8 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-gray-400">Get it on</div>
                    <div className="text-sm font-semibold">Google Play</div>
                  </div>
                </a>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border border-white/10 text-center">
              <QrCode className="w-16 h-16 text-purple-400 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4">Scan QR Code</h2>
              <p className="text-gray-400 mb-8">
                Scan with your phone camera to download instantly
              </p>
              
              {/* QR Code Placeholder */}
              <div className="bg-white rounded-2xl p-4 mx-auto max-w-[200px]">
                <div className="aspect-square bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-white" />
                </div>
              </div>
            </div>

            {/* Web App */}
            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-2xl p-8 border border-white/10 text-center">
              <Monitor className="w-16 h-16 text-purple-400 mx-auto mb-6" />
              <h2 className="text-2xl font-bold mb-4">Web App</h2>
              <p className="text-gray-400 mb-8">
                Use Avalo directly in your browser on any device
              </p>
              
              <Link 
                href="/start"
                className="inline-flex items-center justify-center space-x-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all w-full"
              >
                <span>Open Web App</span>
                <ChevronRight className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Features Comparison */}
          <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-2xl p-8 border border-white/10">
            <h3 className="text-2xl font-bold mb-6 text-center">All Platforms, Full Features</h3>
            <div className="grid md:grid-cols-3 gap-8 text-center">
              <div>
                <h4 className="font-semibold mb-3">iOS & Android</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>✓ Native mobile experience</li>
                  <li>✓ Push notifications</li>
                  <li>✓ Offline support</li>
                  <li>✓ Camera integration</li>
                  <li>✓ Optimized performance</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Web App</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>✓ No installation required</li>
                  <li>✓ Desktop & mobile browsers</li>
                  <li>✓ Real-time updates</li>
                  <li>✓ Cross-device sync</li>
                  <li>✓ Progressive web app</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3">All Features</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>✓ Discovery & matching</li>
                  <li>✓ Chat & video calls</li>
                  <li>✓ Calendar bookings</li>
                  <li>✓ Events & meetings</li>
                  <li>✓ Creator monetization</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="py-20 px-6 bg-black/30">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12">System Requirements</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-semibold mb-4">Mobile</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>• iOS 14.0 or later</li>
                <li>• Android 8.0 or later</li>
                <li>• 100 MB free storage</li>
                <li>• Internet connection required</li>
              </ul>
            </div>
            <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-xl p-6 border border-white/10">
              <h3 className="text-xl font-semibold mb-4">Web</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>• Modern browser (Chrome, Safari, Firefox, Edge)</li>
                <li>• JavaScript enabled</li>
                <li>• Stable internet connection</li>
                <li>• Camera/microphone for calls (optional)</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Choose your platform and join thousands of users connecting on Avalo
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="/start"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold text-lg hover:from-purple-500 hover:to-pink-500 transition-all"
            >
              Start on Web
            </Link>
            <Link 
              href="/auth/login"
              className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur-sm rounded-full font-semibold text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Already Have an Account?
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