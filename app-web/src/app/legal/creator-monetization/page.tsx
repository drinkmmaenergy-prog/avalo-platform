import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Creator Monetization Policy | Avalo',
  description: 'Read Avalo\'s Creator Monetization Policy. Learn about earning opportunities, commission structures, and guidelines for Creators on our platform.',
};

export default function CreatorMonetizationPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Creator Monetization Policy
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: January 22, 2025
        </p>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 leading-relaxed mb-6">
            Avalo empowers Creators to build meaningful connections while earning income through authentic engagement. Our Creator Economy is designed to be fair, transparent, and sustainable—enabling you to monetize your personality, time, and content while maintaining the highest standards of integrity and user safety.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Creator Tiers</h2>
          
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Free Tier</h3>
            <ul className="list-disc pl-6 text-gray-700 leading-relaxed">
              <li>0% commission on first 1,000 tokens monthly</li>
              <li>15% commission above 1,000 tokens</li>
              <li>3-5 day withdrawal processing</li>
              <li>Up to 1,000 fans</li>
            </ul>
          </div>

          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Pro Tier ($9.99/month)</h3>
            <ul className="list-disc pl-6 text-gray-700 leading-relaxed">
              <li>5% commission on all earnings</li>
              <li>2-3 day withdrawal processing</li>
              <li>Priority support</li>
              <li>Up to 5,000 fans</li>
              <li>Advanced analytics</li>
            </ul>
          </div>

          <div className="bg-purple-50 rounded-lg p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Elite Tier ($29.99/month)</h3>
            <ul className="list-disc pl-6 text-gray-700 leading-relaxed">
              <li>3% commission (lowest rate)</li>
              <li>24-hour withdrawal processing</li>
              <li>Dedicated account manager</li>
              <li>Unlimited fans</li>
              <li>Premium analytics suite</li>
              <li>Maximum profile visibility</li>
            </ul>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Key Principles</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li><strong>Authentic Monetization:</strong> Genuine monetization of your personality, time, and content</li>
            <li><strong>Fair Value Exchange:</strong> Clear communication and delivery of promised services</li>
            <li><strong>User Protection:</strong> No exploitation or manipulative tactics</li>
            <li><strong>Platform Integrity:</strong> No circumventing payment systems</li>
            <li><strong>Legal Compliance:</strong> Full adherence to all applicable laws</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Contact Creator Support</h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <p className="text-gray-800 mb-2"><strong>General Questions:</strong> <a href="mailto:creators@avalo.app" className="text-blue-600 hover:text-blue-800">creators@avalo.app</a></p>
            <p className="text-gray-800 mb-2"><strong>Payment Issues:</strong> <a href="mailto:payments@avalo.app" className="text-blue-600 hover:text-blue-800">payments@avalo.app</a></p>
            <p className="text-gray-800 mb-2"><strong>Technical Problems:</strong> <a href="mailto:support@avalo.app" className="text-blue-600 hover:text-blue-800">support@avalo.app</a></p>
            <p className="text-gray-800"><strong>Appeals:</strong> <a href="mailto:appeals@avalo.app" className="text-blue-600 hover:text-blue-800">appeals@avalo.app</a></p>
          </div>

          <div className="mt-12 p-6 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-gray-800 font-medium">
              Build your Creator business on Avalo—authentic, sustainable, and rewarding.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Download the Avalo App</h3>
          <p className="text-gray-700 mb-4">
            Get the full Avalo experience on your mobile device. Start earning as a Creator today.
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