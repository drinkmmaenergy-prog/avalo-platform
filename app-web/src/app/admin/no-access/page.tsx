import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Access Denied | Avalo',
  description: 'Moderator access required',
};

export default function NoAccessPage() {
  return (
    <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-[#1A1A1A] rounded-2xl border-2 border-[#D4AF37] p-8 md:p-12 text-center">
          {/* Icon */}
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#40E0D0] to-[#D4AF37] mb-6">
            <ShieldAlert className="w-12 h-12 text-[#0F0F0F]" />
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Access Denied
          </h1>

          {/* Description */}
          <div className="space-y-3 mb-8">
            <p className="text-xl text-gray-300">
              This area is for <span className="text-[#D4AF37] font-semibold">Avalo moderators</span> only.
            </p>
            <p className="text-gray-400">
              You need moderator privileges to access the Avalo Moderation Dashboard.
            </p>
          </div>

          {/* Divider */}
          <div className="w-full h-px bg-gradient-to-r from-transparent via-[#40E0D0]/30 to-transparent mb-8" />

          {/* Info Box */}
          <div className="bg-[#0F0F0F] rounded-lg border border-[#40E0D0]/20 p-6 mb-8 text-left">
            <h2 className="text-lg font-semibold text-white mb-3">Requirements:</h2>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-[#40E0D0] mt-1">•</span>
                <span>Must be authenticated with a valid Avalo account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#40E0D0] mt-1">•</span>
                <span>Account must have <code className="text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded">isModerator: true</code> in Firebase</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#40E0D0] mt-1">•</span>
                <span>Moderator status must be verified by the system</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#40E0D0] to-[#2A9D8F] text-[#0F0F0F] font-semibold rounded-lg hover:from-[#40E0D0]/90 hover:to-[#2A9D8F]/90 transition-all duration-200 shadow-lg hover:shadow-[#40E0D0]/20"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Home
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0F0F0F] text-[#40E0D0] font-semibold rounded-lg border-2 border-[#40E0D0] hover:bg-[#40E0D0]/10 transition-all duration-200"
            >
              Contact Support
            </Link>
          </div>

          {/* Footer Note */}
          <p className="mt-8 text-sm text-gray-500">
            If you believe you should have access, please contact your administrator.
          </p>
        </div>

        {/* Avalo Branding */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600">
            Powered by <span className="text-[#40E0D0] font-semibold">Avalo TrustShield</span>
          </p>
        </div>
      </div>
    </div>
  );
}