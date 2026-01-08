/**
 * Legal Acceptance Page
 * PHASE 30B-3: Legal Acceptance System
 * 
 * Web version - identical UX to mobile
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";

interface CheckboxState {
  terms: boolean;
  privacy: boolean;
  community: boolean;
  safety: boolean;
}

export default function LegalAcceptPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<CheckboxState>({
    terms: false,
    privacy: false,
    community: false,
    safety: false,
  });

  const allChecked = Object.values(checked).every((v) => v);

  const handleCheckbox = (key: keyof CheckboxState) => {
    setChecked((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleViewDocument = (type: string) => {
    // Open document in new tab
    window.open(`/legal/${type}`, "_blank");
  };

  const handleAccept = async () => {
    if (!allChecked) {
      alert("You must accept all legal documents.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in.");
      return;
    }

    setLoading(true);

    try {
      const acceptLegalDocuments = httpsCallable(functions, "acceptLegalDocuments");
      const result = await acceptLegalDocuments({
        platform: "web",
      });

      if ((result.data as any).success) {
        // Reload page after success
        window.location.reload();
      } else {
        throw new Error("Failed to accept legal documents");
      }
    } catch (error) {
      console.error("Error accepting legal documents:", error);
      alert("Failed to accept documents. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const documents = [
    {
      key: "terms" as keyof CheckboxState,
      title: "Terms of Service",
      subtitle: "Terms of use for Avalo",
    },
    {
      key: "privacy" as keyof CheckboxState,
      title: "Privacy Policy",
      subtitle: "How we handle your data",
    },
    {
      key: "community" as keyof CheckboxState,
      title: "Community Guidelines",
      subtitle: "Rules for our community",
    },
    {
      key: "safety" as keyof CheckboxState,
      title: "Safety & Security",
      subtitle: "Your safety matters",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">📋</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Legal Documents
          </h1>
          <p className="text-gray-600">
            Please review and accept all legal documents to continue using Avalo
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          {documents.map((doc, index) => (
            <div
              key={doc.key}
              className={`flex items-center justify-between py-4 ${
                index !== documents.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              <button
                onClick={() => handleCheckbox(doc.key)}
                className="flex items-center flex-1 text-left"
              >
                <div
                  className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center mr-3 transition-colors ${
                    checked[doc.key]
                      ? "bg-teal-400 border-teal-400"
                      : "border-gray-300"
                  }`}
                >
                  {checked[doc.key] && (
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M5 13l4 4L19 7"></path>
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{doc.title}</div>
                  <div className="text-sm text-gray-500">{doc.subtitle}</div>
                </div>
              </button>
              <button
                onClick={() => handleViewDocument(doc.key)}
                className="ml-3 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-teal-600 font-medium rounded-lg transition-colors"
              >
                View
              </button>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 rounded-xl p-4 mb-6">
          <p className="text-blue-800 text-sm text-center">
            🔒 Your data is protected under GDPR and Polish law
          </p>
        </div>

        <button
          onClick={handleAccept}
          disabled={!allChecked || loading}
          className={`w-full py-4 px-6 rounded-2xl font-bold text-lg transition-all ${
            allChecked && !loading
              ? "bg-teal-400 hover:bg-teal-500 text-white shadow-lg hover:shadow-xl"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Processing...
            </span>
          ) : allChecked ? (
            "Accept & Continue"
          ) : (
            "Please check all boxes"
          )}
        </button>

        <p className="text-center text-sm text-gray-500 mt-4">
          By accepting, you agree to all terms and policies
        </p>
      </div>
    </div>
  );
}