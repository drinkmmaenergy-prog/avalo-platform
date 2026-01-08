'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, 
  Mail,
  Phone,
  Globe,
  ChevronRight,
  Loader2,
  Download,
  QrCode
} from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function StartPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preSignupId, setPreSignupId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    country: 'PL',
    language: 'en'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate email
      if (!formData.email || !formData.email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      // Create preSignup document
      const preSignupRef = await addDoc(collection(db, 'preSignup'), {
        email: formData.email,
        phone: formData.phone || null,
        country: formData.country,
        language: formData.language,
        createdAt: serverTimestamp(),
        status: 'PENDING',
        source: 'web_marketing',
        campaign: new URLSearchParams(window.location.search).get('utm_campaign') || null,
        medium: new URLSearchParams(window.location.search).get('utm_medium') || null,
        utmSource: new URLSearchParams(window.location.search).get('utm_source') || null,
      });

      setPreSignupId(preSignupRef.id);

      // Track analytics event
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'presignup_created', {
          event_category: 'engagement',
          event_label: 'web_onboarding',
          value: 1
        });
      }

    } catch (err) {
      console.error('PreSignup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  // Generate deep link for mobile apps
  const deepLink = preSignupId 
    ? `avalo://signup?preSignupId=${preSignupId}`
    : null;

  if (preSignupId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 text-white flex items-center justify-center px-6">
        <div className="max-w-2xl w-full">
          <div className="bg-gradient-to-br from-purple-900/30 to-pink-900/30 rounded-3xl p-8 md:p-12 border border-white/10 backdrop-blur-sm text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-8 h-8" />
            </div>
            
            <h1 className="text-3xl md:text-4xl font-bold mb-4">
              You're All Set!
            </h1>
            
            <p className="text-xl text-gray-300 mb-8">
              Choose how you'd like to continue
            </p>

            {/* Mobile App Option */}
            <div className="bg-black/30 rounded-2xl p-6 mb-6 border border-white/10">
              <h3 className="text-xl font-semibold mb-4 flex items-center justify-center space-x-2">
                <Download className="w-5 h-5" />
                <span>Continue on Mobile App</span>
              </h3>
              
              <p className="text-gray-400 text-sm mb-6">
                Scan this QR code or click the link below to download the app and continue your registration
              </p>

              {/* QR Code Placeholder */}
              <div className="bg-white rounded-xl p-4 max-w-[200px] mx-auto mb-4">
                <div className="aspect-square bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg flex items-center justify-center">
                  <QrCode className="w-24 h-24 text-white" />
                </div>
              </div>

              <div className="text-xs text-gray-500 mb-4 break-all">
                {deepLink}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <a 
                  href="#" 
                  className="flex-1 px-6 py-3 bg-black/50 hover:bg-black/70 transition-colors rounded-xl border border-white/10 text-center"
                >
                  <div className="text-xs text-gray-400">Download on</div>
                  <div className="font-semibold">App Store</div>
                </a>
                <a 
                  href="#" 
                  className="flex-1 px-6 py-3 bg-black/50 hover:bg-black/70 transition-colors rounded-xl border border-white/10 text-center"
                >
                  <div className="text-xs text-gray-400">Get it on</div>
                  <div className="font-semibold">Google Play</div>
                </a>
              </div>
            </div>

            {/* Web App Option */}
            <div className="bg-black/30 rounded-2xl p-6 border border-white/10">
              <h3 className="text-xl font-semibold mb-4">Or Continue on Web</h3>
              <p className="text-gray-400 text-sm mb-4">
                Your info has been saved. Complete your registration now.
              </p>
              <button
                onClick={() => router.push(`/auth/signup?preSignupId=${preSignupId}`)}
                className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all flex items-center justify-center space-x-2"
              >
                <span>Continue Registration</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <Link 
              href="/"
              className="inline-block mt-6 text-sm text-gray-400 hover:text-purple-400 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-pink-900 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Sparkles className="w-8 h-8 text-purple-400" />
            <span className="text-2xl font-bold">Avalo</span>
          </Link>
          <Link 
            href="/auth/login" 
            className="px-4 py-2 hover:text-purple-400 transition-colors"
          >
            Already have an account?
          </Link>
        </div>
      </header>

      {/* Form */}
      <div className="pt-32 pb-20 px-6 flex items-center justify-center min-h-screen">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full mb-6">
              <Sparkles className="w-8 h-8" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Let's Get Started
            </h1>
            <p className="text-xl text-gray-300">
              Create your Avalo account in just a few steps
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full pl-12 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Phone (Optional) */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium mb-2">
                Phone Number (Optional)
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full pl-12 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="+48 123 456 789"
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                We'll send you a link to continue on mobile
              </p>
            </div>

            {/* Country */}
            <div>
              <label htmlFor="country" className="block text-sm font-medium mb-2">
                Country *
              </label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <select
                  id="country"
                  name="country"
                  value={formData.country}
                  onChange={handleChange}
                  required
                  className="w-full pl-12 pr-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 transition-colors appearance-none"
                >
                  <option value="PL">Poland</option>
                  <option value="US">United States</option>
                  <option value="GB">United Kingdom</option>
                  <option value="DE">Germany</option>
                  <option value="FR">France</option>
                  <option value="ES">Spain</option>
                  <option value="IT">Italy</option>
                  <option value="CA">Canada</option>
                  <option value="AU">Australia</option>
                </select>
              </div>
            </div>

            {/* Language */}
            <div>
              <label htmlFor="language" className="block text-sm font-medium mb-2">
                Preferred Language *
              </label>
              <select
                id="language"
                name="language"
                value={formData.language}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl focus:outline-none focus:border-purple-500 transition-colors appearance-none"
              >
                <option value="en">English</option>
                <option value="pl">Polish</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
              </select>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 text-sm text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full font-semibold hover:from-purple-500 hover:to-pink-500 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>

            <p className="text-xs text-center text-gray-400">
              By continuing, you agree to our{' '}
              <Link href="/legal/terms" className="text-purple-400 hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/legal/privacy" className="text-purple-400 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </form>

          <div className="mt-8 text-center">
            <Link 
              href="/"
              className="text-sm text-gray-400 hover:text-purple-400 transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}