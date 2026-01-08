/**
 * PACK 338a - Legal Documents List (Web)
 * Entry point for viewing legal policies on web
 */

'use client';

import React from 'react';
import Link from 'next/link';
import { LEGAL_DOCS, getAllLegalDocKeys } from '../../../../shared/legal/legalRegistry';

export default function LegalPage() {
  const [lang] = React.useState<'en' | 'pl'>('en'); // TODO: detect from browser locale
  const legalDocs = getAllLegalDocKeys();

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Legal & Policies</h1>
          <p className="text-gray-600">
            Review our legal documents and community policies
          </p>
        </div>

        <div className="space-y-4">
          {legalDocs.map((docKey) => {
            const doc = LEGAL_DOCS[docKey][lang];
            return (
              <Link
                key={docKey}
                href={`/legal/${docKey}`}
                className="block p-6 border border-gray-200 rounded-lg hover:border-pink-500 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-pink-50 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-6 h-6 text-pink-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">{doc.title}</h2>
                      <p className="text-sm text-gray-500">Version {doc.version}</p>
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500 mb-2">
            Last updated: December 13, 2024
          </p>
          <p className="text-sm text-gray-500">
            Have questions? Contact{' '}
            <a href="mailto:legal@avalo.app" className="text-pink-500 hover:underline">
              legal@avalo.app
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
