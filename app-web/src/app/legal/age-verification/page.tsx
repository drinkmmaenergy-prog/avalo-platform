import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Age Verification Policy | Avalo',
  description: 'Read Avalo\'s Age Verification Policy. Learn about our age verification requirements, processes, and commitment to protecting minors.',
};

export default function AgeVerificationPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Age Verification Policy
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: January 22, 2025
        </p>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 leading-relaxed mb-6">
            Avalo is an adults-only platform designed exclusively for users aged 18 years or older. Age verification is not merely a regulatory requirement—it is a fundamental pillar of platform safety, user protection, and legal compliance.
          </p>

          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-red-800 font-semibold">
              ⚠️ Minimum Age Requirement: 18 Years
            </p>
            <p className="text-red-700 mt-2">
              Zero tolerance for underage users. We employ multiple verification methods and continuous monitoring to ensure compliance.
            </p>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Verification Methods</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li><strong>Government-issued ID:</strong> Passport, driver's license, or national ID card</li>
            <li><strong>Biometric Verification:</strong> Selfie with liveness detection</li>
            <li><strong>Facial Matching:</strong> AI comparison between ID photo and selfie</li>
            <li><strong>Database Cross-checks:</strong> Verification against official records</li>
            <li><strong>Continuous Monitoring:</strong> Ongoing verification and re-verification as needed</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Verification Process</h2>
          <div className="space-y-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold text-gray-900 mb-2">Step 1: Age Declaration</h3>
              <p className="text-gray-700">Declare your birth date during account creation</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold text-gray-900 mb-2">Step 2: Basic Verification</h3>
              <p className="text-gray-700">Email, phone, and initial selfie verification</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-bold text-gray-900 mb-2">Step 3: Enhanced Verification</h3>
              <p className="text-gray-700">Government ID upload and biometric matching (required for monetization)</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Privacy Protection</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>All documents encrypted at rest and in transit (AES-256, TLS 1.3)</li>
            <li>Raw documents deleted within 48 hours of successful verification</li>
            <li>Only verification confirmation stored, not actual images</li>
            <li>Compliance with GDPR, CCPA, and privacy regulations</li>
            <li>Never shared with other users or marketers</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Contact Verification Team</h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <p className="text-gray-800 mb-2"><strong>Technical Assistance:</strong> <a href="mailto:verification@avalo.app" className="text-blue-600 hover:text-blue-800">verification@avalo.app</a></p>
            <p className="text-gray-800 mb-2"><strong>Document Questions:</strong> <a href="mailto:documents@avalo.app" className="text-blue-600 hover:text-blue-800">documents@avalo.app</a></p>
            <p className="text-gray-800 mb-2"><strong>Appeal Submissions:</strong> <a href="mailto:appeals@avalo.app" className="text-blue-600 hover:text-blue-800">appeals@avalo.app</a></p>
            <p className="text-gray-800"><strong>Privacy Concerns:</strong> <a href="mailto:privacy@avalo.app" className="text-blue-600 hover:text-blue-800">privacy@avalo.app</a></p>
          </div>

          <div className="mt-12 p-6 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-gray-800 font-medium">
              Your safety and the protection of minors are our highest priorities.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Download the Avalo App</h3>
          <p className="text-gray-700 mb-4">
            Get the full Avalo experience on your mobile device. Complete age verification seamlessly.
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