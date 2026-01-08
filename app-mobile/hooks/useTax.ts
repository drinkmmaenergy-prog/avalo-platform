/**
 * PACK 129 — Tax Hooks (Mobile Client)
 * React hooks for tax profile and document operations
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import * as taxService from '../services/taxService';
import {
  TaxProfile,
  TaxProfileFormData,
  TaxDocument,
  TaxWithholdingRecord,
  TaxComplianceCheck,
  TaxDocumentType,
  DocumentFormat,
} from '../types/tax';

// ============================================================================
// TAX PROFILE HOOK
// ============================================================================

export function useTaxProfile() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      const result = await taxService.getTaxProfile(user.uid);
      setExists(result.exists);
      setProfile(result.profile);
    } catch (err: any) {
      setError(err.message || 'Failed to load tax profile');
      setExists(false);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const submitProfile = useCallback(
    async (formData: TaxProfileFormData) => {
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      setLoading(true);
      setError(null);

      try {
        const result = await taxService.submitTaxProfile(user.uid, formData);
        await loadProfile();
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to submit tax profile');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, loadProfile]
  );

  const updateProfile = useCallback(
    async (updates: Partial<TaxProfileFormData>) => {
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      setLoading(true);
      setError(null);

      try {
        const result = await taxService.updateTaxProfile(user.uid, updates);
        await loadProfile();
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to update tax profile');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, loadProfile]
  );

  return {
    profile,
    exists,
    loading,
    error,
    submitProfile,
    updateProfile,
    reload: loadProfile,
  };
}

// ============================================================================
// TAX COMPLIANCE HOOK
// ============================================================================

export function useTaxCompliance() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [compliance, setCompliance] = useState<TaxComplianceCheck | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkCompliance = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      const result = await taxService.checkTaxCompliance(user.uid);
      setCompliance(result);
    } catch (err: any) {
      setError(err.message || 'Failed to check compliance');
      setCompliance(null);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    checkCompliance();
  }, [checkCompliance]);

  return {
    compliance,
    loading,
    error,
    isCompliant: compliance?.passed || false,
    blockers: compliance?.blockers || [],
    warnings: compliance?.warnings || [],
    reload: checkCompliance,
  };
}

// ============================================================================
// TAX DOCUMENTS HOOK
// ============================================================================

export function useTaxDocuments(filters?: {
  year?: number;
  documentType?: TaxDocumentType;
}) {
  const auth = getAuth();
  const user = auth.currentUser;
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      const result = await taxService.getTaxDocuments(user.uid, filters);
      setDocuments(result.documents);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, filters?.year, filters?.documentType]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const generateInvoice = useCallback(
    async (periodStart: Date, periodEnd: Date, format?: DocumentFormat) => {
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      setLoading(true);
      setError(null);

      try {
        const result = await taxService.issueInvoice(
          user.uid,
          periodStart,
          periodEnd,
          format
        );
        await loadDocuments();
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to generate invoice');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, loadDocuments]
  );

  const generateReport = useCallback(
    async (year: number, quarter?: number, format?: DocumentFormat) => {
      if (!user?.uid) {
        throw new Error('User not authenticated');
      }

      setLoading(true);
      setError(null);

      try {
        const result = await taxService.generateTaxReport(
          user.uid,
          year,
          quarter,
          format
        );
        await loadDocuments();
        return result;
      } catch (err: any) {
        setError(err.message || 'Failed to generate report');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, loadDocuments]
  );

  return {
    documents,
    loading,
    error,
    generateInvoice,
    generateReport,
    reload: loadDocuments,
  };
}

// ============================================================================
// WITHHOLDING RECORDS HOOK
// ============================================================================

export function useWithholdingRecords(filters?: {
  year?: number;
  quarter?: number;
}) {
  const auth = getAuth();
  const user = auth.currentUser;
  const [records, setRecords] = useState<TaxWithholdingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);

    try {
      const result = await taxService.getWithholdingRecords(user.uid, filters);
      setRecords(result.records);
    } catch (err: any) {
      setError(err.message || 'Failed to load withholding records');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, filters?.year, filters?.quarter]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const totalWithheld = records.reduce(
    (sum, record) => sum + record.withholdingAmount,
    0
  );

  return {
    records,
    loading,
    error,
    totalWithheld,
    reload: loadRecords,
  };
}

// ============================================================================
// COMBINED TAX HOOK (ALL-IN-ONE)
// ============================================================================

export function useTax() {
  const profileHook = useTaxProfile();
  const complianceHook = useTaxCompliance();
  const documentsHook = useTaxDocuments();
  const withholdingHook = useWithholdingRecords();

  return {
    // Profile
    profile: profileHook.profile,
    profileExists: profileHook.exists,
    profileLoading: profileHook.loading,
    profileError: profileHook.error,
    submitProfile: profileHook.submitProfile,
    updateProfile: profileHook.updateProfile,
    reloadProfile: profileHook.reload,

    // Compliance
    compliance: complianceHook.compliance,
    isCompliant: complianceHook.isCompliant,
    complianceBlockers: complianceHook.blockers,
    complianceWarnings: complianceHook.warnings,
    complianceLoading: complianceHook.loading,
    complianceError: complianceHook.error,
    checkCompliance: complianceHook.reload,

    // Documents
    documents: documentsHook.documents,
    documentsLoading: documentsHook.loading,
    documentsError: documentsHook.error,
    generateInvoice: documentsHook.generateInvoice,
    generateReport: documentsHook.generateReport,
    reloadDocuments: documentsHook.reload,

    // Withholding
    withholdingRecords: withholdingHook.records,
    totalWithheld: withholdingHook.totalWithheld,
    withholdingLoading: withholdingHook.loading,
    withholdingError: withholdingHook.error,
    reloadWithholding: withholdingHook.reload,
  };
}