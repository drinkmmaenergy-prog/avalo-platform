/**
 * PACK 338a - Legal Document Viewer (Web)
 * Displays individual legal documents
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LEGAL_DOCS, type LegalDocKey } from '../../../../../shared/legal/legalRegistry';

export default function LegalDocPage() {
  const params = useParams();
  const router = useRouter();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [lang] = useState<'en' | 'pl'>('en'); // TODO: detect from browser locale

  const docKey = params.doc as LegalDocKey;
  const docMeta = LEGAL_DOCS[docKey]?.[lang];

  useEffect(() => {
    loadDocument();
  }, [docKey]);

  const loadDocument = async () => {
    try {
      setLoading(true);

      // In production, load from Firestore or static assets
      // For now, provide placeholder
      const placeholder = `
${docMeta.title}
Version ${docMeta.version}

This document is currently being loaded from: ${docMeta.path}

To view the full document:
1. Documents are stored in docs/legal/ directory
2. Can be loaded from Next.js public folder or Firestore collection 'publicLegalDocs'
3. Consider using next/dynamic or static imports for markdown rendering
4. Or fetch from Firestore with caching

For development, please refer to the markdown files directly in the docs/legal/ folder.

Contact: legal@avalo.app
      `.trim();

      setContent(placeholder);
    } catch (error) {
      console.error('Error loading legal document:', error);
      setContent('Error loading document. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!docMeta) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <button
            onClick={() => router.back()}
            className="mb-8 text-gray-600 hover:text-gray-900 flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Not Found</h1>
            <p className="text-gray-600">The requested legal document could not be found.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <button
          onClick={() => router.back()}
          className="mb-8 text-gray-600 hover:text-gray-900 flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Legal Documents
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{docMeta.title}</h1>
          <p className="text-gray-500">Version {docMeta.version}</p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
          </div>
        ) : (
          <div className="prose prose-gray max-w-none">
            <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
              {content}
            </div>

            <div className="mt-12 pt-8 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-500 mb-2">Version {docMeta.version}</p>
              <p className="text-sm text-gray-500">
                Questions? Contact{' '}
                <a href="mailto:legal@avalo.app" className="text-pink-500 hover:underline">
                  legal@avalo.app
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
