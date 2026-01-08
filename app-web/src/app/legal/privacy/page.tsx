import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Avalo',
  description: 'Learn how Avalo collects, uses, and protects your personal information. Your privacy is our priority.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Privacy Policy
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: November 22, 2024
        </p>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 leading-relaxed mb-6">
            This Privacy Policy describes how Avalo ("we", "us", or "our") collects, uses, and shares your personal information when you use our platform.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>
          
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">1.1 Information You Provide</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Account information (email, username, password)</li>
            <li>Profile information (photos, bio, interests, preferences)</li>
            <li>Payment information (for token purchases)</li>
            <li>Content you create or share</li>
            <li>Messages and communications</li>
            <li>Feedback and correspondence</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">1.2 Automatically Collected Information</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Device information (device type, operating system, unique identifiers)</li>
            <li>Usage data (features used, time spent, interactions)</li>
            <li>Location data (with your permission)</li>
            <li>Log data (IP address, browser type, access times)</li>
            <li>Cookies and similar technologies</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
          <p className="text-gray-700 leading-relaxed mb-4">We use your information to:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Provide and improve the Service</li>
            <li>Create and maintain your account</li>
            <li>Enable communication between users</li>
            <li>Process payments and transactions</li>
            <li>Match you with compatible users</li>
            <li>Personalize your experience</li>
            <li>Show relevant content and advertisements</li>
            <li>Ensure safety and prevent fraud</li>
            <li>Comply with legal obligations</li>
            <li>Send notifications and updates</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. How We Share Your Information</h2>
          
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">3.1 With Other Users</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Profile information visible to other users</li>
            <li>Content you choose to share</li>
            <li>Activity indicators (online status, if enabled)</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">3.2 With Service Providers</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Payment processors</li>
            <li>Cloud hosting providers</li>
            <li>Analytics services</li>
            <li>Customer support tools</li>
            <li>Security services</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Data Security</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            We implement appropriate technical and organizational measures to protect your personal information, including encryption, secure authentication, regular security assessments, and access controls. However, no method of transmission over the Internet is 100% secure.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Your Rights and Choices</h2>
          
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">5.1 Data Protection Rights (GDPR)</h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            If you are in the European Economic Area, you have the right to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Object to processing</li>
            <li>Request data portability</li>
            <li>Withdraw consent</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Children's Privacy</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            Avalo is not intended for users under 18 years of age. We do not knowingly collect information from children. If we learn that we have collected information from a child, we will delete it immediately.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Token Economy & Monetization Data</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Token transaction history is recorded for billing and analytics</li>
            <li>Creator earnings and performance metrics are tracked</li>
            <li>Payment information is processed securely through third-party processors</li>
            <li>Earning patterns may be analyzed to improve platform features</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. Contact Us</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            If you have questions about this Privacy Policy or our privacy practices, contact us at:<br />
            Email: <a href="mailto:privacy@avalo.app" className="text-blue-600 hover:text-blue-800">privacy@avalo.app</a><br />
            Data Protection Officer: <a href="mailto:dpo@avalo.app" className="text-blue-600 hover:text-blue-800">dpo@avalo.app</a><br />
            Address: Avalo sp. z o.o., Poland
          </p>

          <div className="mt-12 p-6 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-gray-800 font-medium">
              By using Avalo, you consent to the collection and use of information as described in this Privacy Policy.
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