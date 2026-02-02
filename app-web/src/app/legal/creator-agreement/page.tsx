/**
 * Creator Agreement (B2B) Page - Web
 * PHASE 4.2 — B2B Creator Agreement Implementation
 *
 * Displays the full B2B Creator Agreement for creators on web.
 * This is a LEGAL DOCUMENT page - creators must accept this agreement
 * before they can access any monetization features.
 *
 * @version v1.0
 */

import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Creator Agreement (B2B) | Avalo',
  description: 'Read Avalo\'s Creator Agreement. Understand the B2B contractor relationship, your responsibilities, and platform terms for creators.',
};

// Agreement version - must match backend CREATOR_AGREEMENT_CURRENT_VERSION
const AGREEMENT_VERSION = 'v1.0';

export default function CreatorAgreementPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2 text-center">
          Creator Agreement (B2B)
        </h1>
        
        <p className="text-center text-gray-600 font-semibold mb-1">
          Version {AGREEMENT_VERSION}
        </p>
        
        <p className="text-sm text-gray-500 mb-8 text-center">
          Last Updated: February 2026
        </p>

        <div className="prose prose-lg max-w-none">

          {/* Section 1 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Independent Contractor Status</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            By accepting this Agreement and participating in the Avalo Creator Program,
            you acknowledge and agree that you are acting as an <strong>independent
            contractor (B2B - Business to Business)</strong> and NOT as an employee, agent,
            partner, or joint venturer of Avalo sp. z o.o. ("Avalo" or the "Platform").
          </p>
          <p className="text-gray-700 leading-relaxed mb-6">
            This Agreement establishes a business-to-business relationship between you
            ("Creator") and Avalo. Nothing in this Agreement creates an employment
            relationship, partnership, agency, or any other relationship other than
            that of independent contracting parties.
          </p>

          {/* Section 2 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Platform Intermediary Role</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Avalo operates as a <strong>platform intermediary</strong> that facilitates connections
            between Creators and users. Avalo is NOT your employer and does not direct or
            control the manner in which you provide services to users.
          </p>
          <p className="text-gray-700 leading-relaxed mb-4">
            You retain full control over:
          </p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>The content you create and share</li>
            <li>Your pricing within platform guidelines</li>
            <li>Your schedule and availability</li>
            <li>Which users you engage with</li>
            <li>Your creative and business decisions</li>
          </ul>

          {/* Section 3 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Creator Responsibilities</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            As an independent contractor, <strong>you are solely responsible for</strong>:
          </p>

          <h3 className="text-xl font-bold text-gray-800 mt-6 mb-3">3.1 Tax Obligations</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-4">
            <li>Registration with appropriate tax authorities</li>
            <li>Filing all required tax returns</li>
            <li>Payment of all applicable income taxes</li>
            <li>VAT registration and reporting (if applicable)</li>
            <li>Maintaining proper financial records</li>
            <li>Engaging professional tax advisors as needed</li>
          </ul>

          <h3 className="text-xl font-bold text-gray-800 mt-6 mb-3">3.2 VAT / Income Reporting</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-4">
            <li>Accurate reporting of all income earned through the Platform</li>
            <li>Compliance with VAT regulations in your jurisdiction</li>
            <li>Issuing invoices where required by local law</li>
            <li>Maintaining records for the statutory retention period</li>
          </ul>

          <h3 className="text-xl font-bold text-gray-800 mt-6 mb-3">3.3 Legal Compliance of Content</h3>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Ensuring all content you create complies with applicable laws</li>
            <li>Obtaining necessary rights, licenses, and consent for content</li>
            <li>Adhering to Platform content guidelines and policies</li>
            <li>Age verification and consent requirements for adult content</li>
            <li>Intellectual property rights and copyright compliance</li>
          </ul>

          {/* Section 4 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Payment Settlement</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            All payments for Creator earnings are settled via the <strong>Platform treasury system</strong>.
            This includes:
          </p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-4">
            <li>Token-to-currency conversion</li>
            <li>Payout processing and disbursement</li>
            <li>Transaction fee deduction</li>
            <li>Currency exchange (where applicable)</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-6">
            Payment terms, minimum thresholds, and processing timelines are subject to the
            Platform's payout policies as updated from time to time.
          </p>

          {/* Section 5 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Payout Suspension</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            Avalo reserves the right to <strong>suspend, withhold, or offset payouts</strong> in
            the following circumstances:
          </p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-4">
            <li><strong>Chargebacks:</strong> When users dispute transactions</li>
            <li><strong>Fraud:</strong> Suspected or confirmed fraudulent activity</li>
            <li><strong>Legal Violations:</strong> Breach of laws, regulations, or Platform policies</li>
            <li><strong>Disputes:</strong> Pending resolution of user complaints</li>
            <li><strong>Investigation:</strong> During ongoing compliance or fraud investigations</li>
            <li><strong>Tax Compliance:</strong> Failure to provide required tax documentation</li>
          </ul>
          <p className="text-gray-700 leading-relaxed mb-6">
            Avalo will make reasonable efforts to notify you of any payout suspension and the
            reasons therefor, subject to legal and regulatory constraints.
          </p>

          {/* Section 6 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. No Employment Benefits</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            As an independent contractor, you are NOT entitled to any employee benefits including but not limited to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 leading-relaxed mb-6">
            <li>Health insurance</li>
            <li>Retirement/pension contributions</li>
            <li>Paid leave or vacation</li>
            <li>Unemployment insurance</li>
            <li>Workers' compensation</li>
            <li>Any other employee benefits</li>
          </ul>

          {/* Section 7 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Governing Law & Jurisdiction</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            This Agreement shall be governed by and construed in accordance with the laws of <strong>Poland</strong>.
            Any disputes arising out of or in connection with this Agreement shall be subject to the exclusive
            jurisdiction of the courts of <strong>Warsaw, Poland</strong>.
          </p>
          <p className="text-gray-700 leading-relaxed mb-6">
            For EU Creators: This Agreement does not affect your mandatory consumer protection rights under
            applicable EU law where such rights cannot be waived by contract.
          </p>

          {/* Section 8 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. Agreement Version & Updates</h2>
          <p className="text-gray-700 leading-relaxed mb-4">
            This is version <strong>{AGREEMENT_VERSION}</strong> of the Creator Agreement.
            Avalo may update this Agreement from time to time. Material changes will require re-acceptance
            before you can continue using Creator features.
          </p>
          <p className="text-gray-700 leading-relaxed mb-6">
            Your continued use of Creator features after accepting this Agreement constitutes your ongoing
            acceptance of these terms.
          </p>

          {/* Section 9 */}
          <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">9. Contact Information</h2>
          <p className="text-gray-700 leading-relaxed mb-6">
            Avalo sp. z o.o.<br />
            Warsaw, Poland<br />
            Email: <a href="mailto:creators@avalo.app" className="text-blue-600 hover:text-blue-800">creators@avalo.app</a><br />
            Legal: <a href="mailto:legal@avalo.app" className="text-blue-600 hover:text-blue-800">legal@avalo.app</a>
          </p>

          {/* Acknowledgment Box */}
          <div className="mt-12 p-6 bg-amber-50 border-l-4 border-amber-500 rounded">
            <p className="text-amber-900 font-medium">
              By accepting this Agreement, you acknowledge that you have read, understood, and agree to be
              bound by all terms and conditions set forth herein. You confirm that you are acting as an
              independent B2B contractor and accept full responsibility for your tax obligations, content
              compliance, and legal requirements.
            </p>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Ready to become a Creator?</h3>
          <p className="text-gray-700 mb-4">
            Accept the Creator Agreement in the Avalo app to unlock monetization features.
          </p>
          <div className="flex gap-4">
            <button className="bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-600 transition">
              Download App to Accept
            </button>
            <a href="/legal" className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition">
              Back to Legal Documents
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
