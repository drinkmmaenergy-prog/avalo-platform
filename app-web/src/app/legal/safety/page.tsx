import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Safety Policy | Avalo',
  description: 'Read Avalo\'s Safety Policy. Learn about our comprehensive approach to protecting users, preventing abuse, and maintaining platform integrity.',
};

export default function SafetyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Safety Policy
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: January 22, 2025
        </p>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 leading-relaxed mb-6">
            Avalo is committed to creating a safe, secure, and trustworthy environment for all users. This Safety Policy outlines our comprehensive approach to protecting users from harm, preventing abuse, and maintaining platform integrity. Safety is not just a feature—it is the foundation of everything we build.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Platform Safety Principles</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li><strong>Prevention First:</strong> Proactive measures to prevent harm before it occurs</li>
            <li><strong>Rapid Response:</strong> Swift action when issues arise</li>
            <li><strong>User Empowerment:</strong> Tools to protect yourself</li>
            <li><strong>Transparency and Accountability:</strong> Clear standards and processes</li>
            <li><strong>Continuous Improvement:</strong> Ongoing commitment to safety</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Key Safety Features</h2>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Advanced AI scanning systems for content moderation</li>
            <li>Real-time behavioral analysis</li>
            <li>PhotoDNA technology to prevent CSAM distribution</li>
            <li>24/7 moderation team coverage</li>
            <li>Comprehensive blocking and reporting systems</li>
            <li>Privacy controls and safety settings</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">Contact Safety Team</h2>
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <p className="text-gray-800 mb-2"><strong>General Safety:</strong> <a href="mailto:safety@avalo.app" className="text-blue-600 hover:text-blue-800">safety@avalo.app</a></p>
            <p className="text-gray-800 mb-2"><strong>Abuse Reports:</strong> <a href="mailto:abuse@avalo.app" className="text-blue-600 hover:text-blue-800">abuse@avalo.app</a></p>
            <p className="text-gray-800 mb-2"><strong>Crisis Situations:</strong> <a href="mailto:crisis@avalo.app" className="text-blue-600 hover:text-blue-800">crisis@avalo.app</a></p>
            <p className="text-gray-800"><strong>Appeals:</strong> <a href="mailto:appeals@avalo.app" className="text-blue-600 hover:text-blue-800">appeals@avalo.app</a></p>
          </div>

          <div className="mt-12 p-6 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-gray-800 font-medium">
              Together, we build a safer platform for everyone. Your safety is our highest priority.
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