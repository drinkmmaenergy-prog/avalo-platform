"use client";

/**
 * PACK 328A: Identity Verification Modal (Web)
 * Bank-ID & Document Fallback Verification (18+ Enforcement Layer)
 */

import React, { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

type VerificationReason =
  | "SELFIE_FAIL"
  | "MISMATCH"
  | "FRAUD_FLAG"
  | "UNDERAGE_RISK";

type VerificationProvider = "BANK_ID" | "DOC_AI" | "MANUAL";

type DocumentType =
  | "PASSPORT"
  | "NATIONAL_ID"
  | "DRIVERS_LICENSE"
  | "LIVE_SELFIE";

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

/**
 * Strict runtime guard for Firebase Functions
 */
function requireFunctions() {
  if (!functions) {
    throw new Error("Firebase Functions not initialized");
  }
  return functions;
}

export default function IdentityVerificationModal({
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [selectedDocType, setSelectedDocType] =
    useState<DocumentType>("PASSPORT");
  const [documents, setDocuments] = useState<
    { type: DocumentType; file: File; base64: string }[]
  >([]);
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

      const getStatus = httpsCallable(
        requireFunctions(),
        "identityVerification_getStatus"
      );

      const result = await getStatus({});
      setStatus(result.data as VerificationStatus);
    } catch (err: any) {
      console.error("Error loading verification status:", err);
      setError("Failed to load verification status");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (
    type: DocumentType,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;

      setDocuments((prev) => [
        ...prev.filter((d) => d.type !== type),
        { type, file, base64: base64.split(",")[1] },
      ]);
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!status?.pendingRequest) {
      setError("No pending verification request");
      return;
    }

    const hasDocument = documents.some((d) =>
      ["PASSPORT", "NATIONAL_ID", "DRIVERS_LICENSE"].includes(d.type)
    );
    const hasSelfie = documents.some((d) => d.type === "LIVE_SELFIE");

    if (!hasDocument || !hasSelfie) {
      setError(
        "Please upload both an identity document and a live selfie"
      );
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const uploadDocuments = httpsCallable(
        requireFunctions(),
        "identityVerification_uploadDocuments"
      );

      const result = await uploadDocuments({
        requestId: status.pendingRequest.id,
        documents: documents.map((d) => ({
          type: d.type,
          data: d.base64,
        })),
      });

      const data = result.data as any;

      if (data.verified) {
        onSuccess?.();
        onClose();
      } else {
        alert(
          "Your documents have been submitted and are under review. You will be notified once the review is complete."
        );
        onClose();
      }
    } catch (err: any) {
      console.error("Error submitting verification:", err);
      setError(err.message || "Failed to submit verification");
    } finally {
      setUploading(false);
    }
  };

  const getReasonText = (reason: VerificationReason): string => {
    switch (reason) {
      case "SELFIE_FAIL":
        return "Your profile photo does not match your selfie verification";
      case "MISMATCH":
        return "Your profile information has been reported as mismatched";
      case "FRAUD_FLAG":
        return "Suspicious activity has been detected on your account";
      case "UNDERAGE_RISK":
        return "Age verification is required to continue";
      default:
        return "Identity verification is required";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-gray-400">
                Loading verification status...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 bg-red-900 bg-opacity-30 border-l-4 border-red-500 p-4 rounded">
                  <p className="text-red-500 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={uploading || documents.length < 2}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  uploading || documents.length < 2
                    ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                    : "bg-pink-500 hover:bg-pink-600 text-white"
                }`}
              >
                {uploading ? "Submitting..." : "Submit for Verification"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

