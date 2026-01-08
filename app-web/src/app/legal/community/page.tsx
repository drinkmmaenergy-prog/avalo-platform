import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community Rules | Avalo',
  description: 'Read Avalo\'s Community Rules. Learn about our guidelines for creating a safe, respectful, and positive environment.',
};

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Community Rules
        </h1>
        
        <p className="text-sm text-gray-600 mb-8">
          Last Updated: November 22, 2024
        </p>

        <div className="prose prose-lg max-w-none">
          <p className="text-gray-700 leading-relaxed mb-6">
            Welcome to the Avalo community! These Community Rules are designed to ensure a safe, respectful, and positive environment for all users. By using Avalo, you agree to follow these rules.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Core Values</h2>
          <p className="text-gray-700 leading-relaxed mb-4">At Avalo, we value:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li><strong>Respect:</strong> Treat all users with dignity and respect</li>
            <li><strong>Safety:</strong> Prioritize the safety and wellbeing of our community</li>
            <li><strong>Authenticity:</strong> Be genuine and honest in your interactions</li>
            <li><strong>Inclusivity:</strong> Welcome diversity and different perspectives</li>
            <li><strong>Responsibility:</strong> Take ownership of your actions and content</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Prohibited Behavior</h2>
          
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">2.1 Harassment and Abuse</h3>
          <p className="text-gray-700 leading-relaxed mb-4">You may NOT:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Harass, bully, or intimidate other users</li>
            <li>Send unwanted sexual content or advances</li>
            <li>Stalk or repeatedly contact someone who has asked you to stop</li>
            <li>Threaten or incite violence</li>
            <li>Doxx or share private information without consent</li>
            <li>Engage in hate speech or discrimination</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">2.2 Illegal Activities</h3>
          <p className="text-gray-700 leading-relaxed mb-4">You may NOT:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Engage in or promote illegal activities</li>
            <li>Facilitate the sale of illegal goods or services</li>
            <li>Share content depicting child sexual abuse material (CSAM)</li>
            <li>Violate intellectual property rights</li>
            <li>Engage in fraud, scams, or deceptive practices</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">2.3 Harmful Content</h3>
          <p className="text-gray-700 leading-relaxed mb-4">You may NOT post content that:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Depicts or promotes violence, self-harm, or dangerous activities</li>
            <li>Contains graphic violence or gore</li>
            <li>Promotes eating disorders or self-destructive behavior</li>
            <li>Spreads misinformation that could cause harm</li>
            <li>Contains malware or malicious code</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">2.4 Sexual Content</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Explicit sexual content must be shared only between consenting adults</li>
            <li>Non-consensual sharing of intimate images is strictly prohibited</li>
            <li>Sexual content involving minors is absolutely forbidden</li>
            <li>Respect boundaries and consent at all times</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Safety and Security</h2>
          
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">3.1 Meeting in Person</h3>
          <p className="text-gray-700 leading-relaxed mb-4">If you decide to meet someone from Avalo:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Meet in public places</li>
            <li>Tell a friend or family member your plans</li>
            <li>Use Safe-Meet features when available</li>
            <li>Trust your instincts and stay alert</li>
            <li>Never feel pressured to meet in person</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">3.2 Protect Your Privacy</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Don't share sensitive personal information prematurely</li>
            <li>Be cautious about sharing financial information</li>
            <li>Use platform features to control your visibility</li>
            <li>Report suspicious behavior or accounts</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Earn Mode and Creator Guidelines</h2>
          
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">4.1 Creator Responsibilities</h3>
          <p className="text-gray-700 leading-relaxed mb-4">Creators must:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Provide authentic and valuable content</li>
            <li>Accurately represent services and offerings</li>
            <li>Honor commitments to supporters and subscribers</li>
            <li>Comply with all platform monetization policies</li>
            <li>Pay applicable taxes on earnings</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Enforcement</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Violations of these Community Rules may result in:
          </p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Warning notifications</li>
            <li>Temporary account suspension</li>
            <li>Permanent account ban</li>
            <li>Loss of tokens or earnings</li>
            <li>Legal action in severe cases</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Positive Community Engagement</h2>
          <p className="text-gray-700 leading-relaxed mb-4">We encourage you to:</p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Be kind and supportive to others</li>
            <li>Give constructive feedback</li>
            <li>Celebrate diversity and different perspectives</li>
            <li>Report violations to keep the community safe</li>
            <li>Help create a welcoming environment for everyone</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Contact and Support</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            For questions about these Community Rules:<br />
            Email: <a href="mailto:community@avalo.app" className="text-blue-600 hover:text-blue-800">community@avalo.app</a><br />
            Safety concerns: <a href="mailto:safety@avalo.app" className="text-blue-600 hover:text-blue-800">safety@avalo.app</a>
          </p>

          <div className="mt-12 p-6 bg-blue-50 border-l-4 border-blue-500 rounded">
            <p className="text-gray-800 font-medium">
              Every member of the Avalo community plays a role in maintaining a safe and positive environment. By following these rules and reporting violations, you help make Avalo a better place for everyone.
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