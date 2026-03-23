import React from 'react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Link Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-8">
          <div>
            <h4 className="font-semibold text-sm mb-3">Platform</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/discover" className="text-gray-400 hover:text-white transition text-sm">
                  Discover
                </Link>
              </li>
              <li>
                <Link href="/ai" className="text-gray-400 hover:text-white transition text-sm">
                  AI Companions
                </Link>
              </li>
              <li>
                <Link href="/features/token-economy" className="text-gray-400 hover:text-white transition text-sm">
                  Token Economy
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-gray-400 hover:text-white transition text-sm">
                  Help Center
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Company</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/(marketing)/investors" className="text-gray-400 hover:text-white transition text-sm">
                  Investors
                </Link>
              </li>
              <li>
                <Link href="/(marketing)/safety" className="text-gray-400 hover:text-white transition text-sm">
                  Safety
                </Link>
              </li>
              <li>
                <Link href="/(marketing)/creators" className="text-gray-400 hover:text-white transition text-sm">
                  For Creators
                </Link>
              </li>
              <li>
                <Link href="/referrals" className="text-gray-400 hover:text-white transition text-sm">
                  Referral Program
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/legal/terms" className="text-gray-400 hover:text-white transition text-sm">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-gray-400 hover:text-white transition text-sm">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/cookies" className="text-gray-400 hover:text-white transition text-sm">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/community" className="text-gray-400 hover:text-white transition text-sm">
                  Community Guidelines
                </Link>
              </li>
              <li>
                <Link href="/legal/creator-agreement" className="text-gray-400 hover:text-white transition text-sm">
                  Creator Agreement
                </Link>
              </li>
              <li>
                <Link href="/legal/refund" className="text-gray-400 hover:text-white transition text-sm">
                  Refund Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/calendar-policy" className="text-gray-400 hover:text-white transition text-sm">
                  Meeting Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/safety" className="text-gray-400 hover:text-white transition text-sm">
                  Safety Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/age-verification" className="text-gray-400 hover:text-white transition text-sm">
                  Age Verification
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Download</h4>
            {/* FIX 139: QR code for quick mobile access */}
            <div className="flex flex-col items-center gap-2 mb-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('https://avalo.app')}&bgcolor=FFFFFF&color=E4458F`}
                alt="QR"
                className="w-24 h-24 rounded-lg"
                width={120}
                height={120}
              />
              <span className="text-xs text-gray-400">Scan to open</span>
            </div>
            <ul className="space-y-2">
              <li>
                <span className="text-[10px] text-gray-500">iOS App Store — Coming Soon</span>
              </li>
              <li>
                <span className="text-[10px] text-gray-500">Google Play — Coming Soon</span>
              </li>
              <li>
                <Link href="/(marketing)/download" className="text-gray-400 hover:text-white transition text-sm">
                  Progressive Web App
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} Avalo Inc. All rights reserved. | Registered in Delaware, USA.
            </p>

            {/* Social Media Icons */}
            <div className="flex items-center gap-4 mt-4 md:mt-0">
              {/* Instagram */}
              <a href="https://instagram.com/avaloapp" target="_blank" rel="noopener"
                className="text-gray-400 hover:text-[#E4458F] transition" aria-label="Instagram">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              {/* TikTok */}
              <a href="https://tiktok.com/@avaloapp" target="_blank" rel="noopener"
                className="text-gray-400 hover:text-[#E4458F] transition" aria-label="TikTok">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46V13a8.28 8.28 0 005.58 2.15V11.7a4.83 4.83 0 01-3.77-1.24V6.69z"/>
                </svg>
              </a>
              {/* X (Twitter) */}
              <a href="https://x.com/avaloapp" target="_blank" rel="noopener"
                className="text-gray-400 hover:text-[#E4458F] transition" aria-label="X">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              {/* Facebook */}
              <a href="https://facebook.com/avaloapp" target="_blank" rel="noopener"
                className="text-gray-400 hover:text-[#E4458F] transition" aria-label="Facebook">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              {/* LinkedIn */}
              <a href="https://linkedin.com/company/avaloapp" target="_blank" rel="noopener"
                className="text-gray-400 hover:text-[#E4458F] transition" aria-label="LinkedIn">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              {/* YouTube */}
              <a href="https://youtube.com/@avaloapp" target="_blank" rel="noopener"
                className="text-gray-400 hover:text-[#E4458F] transition" aria-label="YouTube">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
