/**
 * PACK 328A: Identity Verification Modal (Web)
 * Bank-ID & Document Fallback Verification (18+ Enforcement Layer)
 */

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../src/lib/firebase';

type VerificationReason = 'SELFIE_FAIL' | 'MISMATCH' | 'FRAUD_FLAG' | 'UNDERAGE_RISK';
type VerificationProvider = 'BANK_ID' | 'DOC_AI' | 'MANUAL';
type DocumentType = 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'LIVE_SELFIE';

interface VerificationStatus {
  hasPendingRequest: boolean;
  pendingRequest: {
    id: string;
    reason: VerificationReason;
    provider: VerificationProvider;
    requestedAt: string;
    timeoutAt: string;
  } | null;
  isVerified: boolean;
  ageConfirmed: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function IdentityVerificationModal({ isOpen, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<DocumentType>('PASSPORT');
  const [documents, setDocuments] = useState<{ type: DocumentType; file: File; base64: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVerificationStatus();
    }
  }, [isOpen]);

  const loadVerificationStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const getStatus = httpsCallable(functions, 'identityVerification_getStatus');
      const result = await getStatus({});
      setStatus(result.data as VerificationStatus);
    } catch (err: any) {
      console.error('Error loading verification status:', err);
      setError('Failed to load verification status');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (type: DocumentType, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setDocuments(prev => [
        ...prev.filter(d => d.type !== type),
        { type, file, base64: base64.split(',')[1] },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!status?.pendingRequest) {
      setError('No pending verification request');
      return;
    }

    // Validate documents
    const hasDocument = documents.some(d => 
      ['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'].includes(d.type)
    );
    const hasSelfie = documents.some(d => d.type === 'LIVE_SELFIE');

    if (!hasDocument || !hasSelfie) {
      setError('Please upload both an identity document and a live selfie');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const uploadDocuments = httpsCallable(functions, 'identityVerification_uploadDocuments');
      const result = await uploadDocuments({
        requestId: status.pendingRequest.id,
        documents: documents.map(d => ({
          type: d.type,
          data: d.base64,
        })),
      });

      const data = result.data as any;

      if (data.verified) {
        onSuccess?.();
        onClose();
      } else {
        alert('Your documents have been submitted and are under review. You will be notified once the review is complete.');
        onClose();
      }
    } catch (err: any) {
      console.error('Error submitting verification:', err);
      setError(err.message || 'Failed to submit verification');
    } finally {
      setUploading(false);
    }
  };

  const getReasonText = (reason: VerificationReason): string => {
    switch (reason) {
      case 'SELFIE_FAIL':
        return 'Your profile photo does not match your selfie verification';
      case 'MISMATCH':
        return 'Your profile information has been reported as mismatched';
      case 'FRAUD_FLAG':
        return 'Suspicious activity has been detected on your account';
      case 'UNDERAGE_RISK':
        return 'Age verification is required to continue';
      default:
        return 'Identity verification is required';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                🛡️ Identity Verification Required
              </h2>
              {status?.pendingRequest && (
                <p className="text-pink-400">
                  {getReasonText(status.pendingRequest.reason)}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              disabled={uploading}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading verification status...</p>
            </div>
          ) : status?.isVerified ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">✓</div>
              <h3 className="text-xl font-bold text-white mb-2">Verified</h3>
              <p className="text-gray-400 mb-6">Your identity has been verified successfully</p>
              <button
                onClick={onClose}
                className="bg-pink-500 hover:bg-pink-600 text-white px-6 py-2 rounded-lg"
              >
                Continue
              </button>
            </div>
          ) : !status?.hasPendingRequest ? (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-bold text-white mb-2">No Verification Required</h3>
              <p className="text-gray-400 mb-6">
                There is no pending verification request for your account
              </p>
              <button
                onClick={onClose}
                className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg"
              >
                Go Back
              </button>
            </div>
          ) : (
            <>
              {/* Instructions */}
              <div className="mb-6 bg-gray-800 p-4 rounded-lg">
                <h3 className="text-white font-semibold mb-3">What you need to provide:</h3>
                <div className="space-y-2">
                  <div className="flex items-start">
                    <span className="mr-2">📄</span>
                    <p className="text-gray-300 text-sm">
                      Valid government-issued ID (passport, national ID, or driver's license)
                    </p>
                  </div>
                  <div className="flex items-start">
                    <span className="mr-2">🤳</span>
                    <p className="text-gray-300 text-sm">
                      Live selfie photo (take a new photo, not from camera roll)
                    </p>
                  </div>
                </div>
              </div>

              {/* Document Type Selection */}
              <div className="mb-6">
                <label className="block text-white font-semibold mb-2">
                  Select Document Type:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['PASSPORT', 'NATIONAL_ID', 'DRIVERS_LICENSE'] as DocumentType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setSelectedDocType(type)}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        selectedDocType === type
                          ? 'bg-pink-500 border-pink-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      <span className="text-xs font-semibold">
                        {type.replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Document Upload */}
              <div className="mb-6 space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">
                    Upload {selectedDocType.replace('_', ' ')}:
                  </label>
                  <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-600 transition-colors">
                    {documents.find(d => d.type === selectedDocType) ? (
                      <div>
                        <div className="text-green-500 text-2xl mb-2">✓</div>
                        <p className="text-green-500 font-semibold">Document Uploaded</p>
                        <p className="text-gray-400 text-sm mt-1">
                          {documents.find(d => d.type === selectedDocType)?.file.name}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="text-4xl mb-2">📤</div>
                        <p className="text-white mb-2">Click to upload or drag and drop</p>
                        <p className="text-gray-400 text-sm">PNG, JPG up to 5MB</p>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileSelect(selectedDocType, e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2">
                    Upload Live Selfie:
                  </label>
                  <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-600 transition-colors relative">
                    {documents.find(d => d.type === 'LIVE_SELFIE') ? (
                      <div>
                        <div className="text-green-500 text-2xl mb-2">✓</div>
                        <p className="text-green-500 font-semibold">Selfie Uploaded</p>
                        <p className="text-gray-400 text-sm mt-1">
                          {documents.find(d => d.type === 'LIVE_SELFIE')?.file.name}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="text-4xl mb-2">📸</div>
                        <p className="text-white mb-2">Click to upload selfie</p>
                        <p className="text-gray-400 text-sm">Take a new photo now</p>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="user"
                      onChange={(e) => handleFileSelect('LIVE_SELFIE', e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Timeout Warning */}
              {status?.pendingRequest && (
                <div className="mb-6 bg-yellow-900 bg-opacity-30 border-l-4 border-yellow-500 p-4 rounded">
                  <p className="text-yellow-500 text-sm">
                    ⏰ You must complete verification by{' '}
                    {new Date(status.pendingRequest.timeoutAt).toLocaleDateString()}
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mb-6 bg-red-900 bg-opacity-30 border-l-4 border-red-500 p-4 rounded">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={uploading || documents.length < 2}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  uploading || documents.length < 2
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-pink-500 hover:bg-pink-600 text-white'
                }`}
              >
                {uploading ? 'Submitting...' : 'Submit for Verification'}
              </button>

              {/* Help Text */}
              <p className="text-gray-400 text-xs text-center mt-4">
                Your documents will be securely encrypted and reviewed by our verification team.
                This process typically takes 1-2 business days.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}