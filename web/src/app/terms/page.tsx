import React from 'react';
import { GlassCard } from '../../components/GlassCard';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-24 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold mb-8">Terms of Service</h1>
        
        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-600 dark:text-gray-400">
            By accessing and using Avalo, you accept and agree to be bound by the terms and 
            provision of this agreement. If you do not agree to these terms, please do not use our services.
          </p>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">2. Use License</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Permission is granted to temporarily use Avalo for personal, non-commercial purposes. 
            This license shall automatically terminate if you violate any of these restrictions.
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            You may not:
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2 mt-2">
            <li>Modify or copy the materials</li>
            <li>Use the materials for commercial purposes</li>
            <li>Remove any copyright or proprietary notations</li>
            <li>Transfer the materials to another person</li>
          </ul>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">3. User Conduct</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You agree to use Avalo responsibly and respectfully. Prohibited activities include:
          </p>
          <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
            <li>Harassment, abuse, or threats toward other users</li>
            <li>Posting illegal, harmful, or offensive content</li>
            <li>Impersonating others or providing false information</li>
            <li>Attempting to access unauthorized areas of the service</li>
            <li>Using automated systems to access the service</li>
          </ul>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">4. Account Termination</h2>
          <p className="text-gray-600 dark:text-gray-400">
            We reserve the right to terminate or suspend your account at any time, without notice, 
            for conduct that we believe violates these Terms of Service or is harmful to other users, 
            us, or third parties, or for any other reason.
          </p>
        </GlassCard>

        <GlassCard className="mb-6">
          <h2 className="text-2xl font-bold mb-4">5. Disclaimer</h2>
          <p className="text-gray-600 dark:text-gray-400">
            The materials on Avalo are provided on an 'as is' basis. Avalo makes no warranties, 
            expressed or implied, and hereby disclaims and negates all other warranties including, 
            without limitation, implied warranties or conditions of merchantability, fitness for a 
            particular purpose, or non-infringement of intellectual property.
          </p>
        </GlassCard>

        <GlassCard>
          <h2 className="text-2xl font-bold mb-4">6. Contact Information</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Questions about the Terms of Service should be sent to us at{' '}
            <a href="mailto:legal@avalo.app" className="text-primary hover:underline">
              legal@avalo.app
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