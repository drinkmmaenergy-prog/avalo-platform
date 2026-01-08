import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Avalo',
  description: 'Read Avalo\'s Terms & Conditions. Understand our platform rules, user obligations, and service agreements.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Terms & Conditions
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: November 22, 2024
        </p>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 leading-relaxed mb-6">
            Welcome to Avalo. These Terms & Conditions ("Terms") govern your access to and use of the Avalo platform, including our mobile application and website (collectively, the "Service").
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            By accessing or using Avalo, you agree to be bound by these Terms. If you do not agree to these Terms, you may not access or use the Service.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Eligibility</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            You must be at least 18 years old to use Avalo. By using the Service, you represent and warrant that you meet this age requirement.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>You must provide accurate and complete information when creating your account</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials</li>
            <li>You agree to notify us immediately of any unauthorized access to your account</li>
            <li>You are responsible for all activities that occur under your account</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. User Conduct</h2>
          <p className="text-gray-700 leading-relaxed mb-4">You agree NOT to:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Violate any applicable laws or regulations</li>
            <li>Impersonate any person or entity</li>
            <li>Post content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
            <li>Engage in any form of harassment, bullying, or hate speech</li>
            <li>Share explicit content without appropriate consent</li>
            <li>Use the Service for commercial purposes without authorization</li>
            <li>Attempt to gain unauthorized access to our systems</li>
            <li>Interfere with or disrupt the Service</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Token Economy & Monetization</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Tokens are virtual goods with no real-world monetary value</li>
            <li>Token purchases are final and non-refundable except as required by law</li>
            <li>Token prices may change at any time</li>
            <li>Avalo reserves the right to modify token-related features</li>
            <li>Creators can earn tokens through legitimate platform activities</li>
            <li>All earnings are subject to applicable fees and terms</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Earn Mode & Creator Features</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Earn Mode allows eligible users to monetize content and interactions</li>
            <li>Participation requires acceptance of additional Creator Terms</li>
            <li>Earnings depend on engagement and platform policies</li>
            <li>Avalo may modify earning rates and features at any time</li>
            <li>All creator activities must comply with platform guidelines</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Privacy & Data</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            Your privacy is important to us. Please review our Privacy Policy to understand how we collect and use your data. By using Avalo, you consent to our data practices.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. Termination</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>We may suspend or terminate your account at any time for violations of these Terms</li>
            <li>You may delete your account at any time</li>
            <li>Upon termination, your right to use the Service ceases immediately</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">9. Contact Information</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            For questions about these Terms, contact us at:<br />
            Email: <a href="mailto:legal@avalo.app" className="text-blue-600 hover:text-blue-800">legal@avalo.app</a><br />
            Address: Avalo sp. z o.o., Poland
          </p>

          <div className="mt-12 p-6 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-gray-800 font-medium">
              By using Avalo, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Download the Avalo App</h3>
          <p className="text-gray-700 mb-4">
            Get the full Avalo experience on your mobile device. Connect with amazing people around the world.
          </p>
          <div className="flex gap-4">
            <button className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition">
              Download on iOS
            </button>
            <button className="bg-black text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition">
              Download on Android
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}