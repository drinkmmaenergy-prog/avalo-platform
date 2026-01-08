import React from 'react';
import { GlassCard } from '../../components/GlassCard';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-8">Privacy Policy</h1>
        
        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">1. Information We Collect</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            We collect information you provide directly to us, including:
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
            <li>Account information (name, email, phone number)</li>
            <li>Profile information (photos, bio, interests)</li>
            <li>Usage data and interactions</li>
            <li>Device and location information</li>
          </ul>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">2. How We Use Your Information</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            We use the information we collect to:
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
            <li>Provide, maintain, and improve our services</li>
            <li>Match you with compatible users</li>
            <li>Send you notifications and updates</li>
            <li>Ensure safety and prevent fraud</li>
            <li>Comply with legal obligations</li>
          </ul>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">3. Data Security</h2>
          <p className="text-gray-600 dark:text-gray-400">
            We implement industry-standard security measures to protect your data, including encryption, 
            secure servers, and regular security audits. Your privacy and security are our top priorities.
          </p>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">4. Your Rights</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You have the right to:
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and data</li>
            <li>Opt out of marketing communications</li>
            <li>Export your data</li>
          </ul>
        </GlassCard>

        <GlassCard>
          <h2 className="text-2xl font-bold mb-4">5. Contact Us</h2>
          <p className="text-gray-600 dark:text-gray-400">
            If you have questions about this Privacy Policy, please contact us at{' '}
            <a href="mailto:privacy@avalo.app" className="text-primary hover:underline">
              privacy@avalo.app
            </a>
          </p>
          <p className="text-gray-600 dark:text-gray-400 mt-4">
            Last updated: January 2024
          </p>
        </GlassCard>
      </div>
    </div>
  );
}