/**
 * PACK 305 — Legal & Audit Snapshot Export
 * Admin UI: Create Snapshot Request Form
 */

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface CreateSnapshotFormProps {
  onSuccess?: () => void;
}

export const CreateSnapshotForm: React.FC<CreateSnapshotFormProps> = ({ onSuccess }) => {
  const [type, setType] = useState<string>('INVESTOR_OVERVIEW');
  const [format, setFormat] = useState<string>('PDF');
  const [periodFrom, setPeriodFrom] = useState<string>('');
  const [periodTo, setPeriodTo] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const functions = getFunctions();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!periodFrom || !periodTo) {
      setError('Please select both start and end dates');
      return;
    }

    const fromDate = new Date(periodFrom);
    const toDate = new Date(periodTo);

    if (fromDate >= toDate) {
      setError('Start date must be before end date');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const createSnapshot = httpsCallable(functions, 'createLegalSnapshot');
      const result = await createSnapshot({
        type,
        format,
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        notes: notes || undefined,
      });

      if (result.data && typeof result.data === 'object' && 'success' in result.data) {
        const data = result.data as any;
        if (data.success) {
          setSuccess(`Snapshot request created successfully! ID: ${data.snapshotId}`);
          
          // Reset form
          setNotes('');
          
          // Call onSuccess callback
          if (onSuccess) {
            onSuccess();
          }
        } else {
          setError('Failed to create snapshot request');
        }
      }
    } catch (err: any) {
      console.error('Error creating snapshot:', err);
      setError(err.message || 'Failed to create snapshot request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Request New Snapshot
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Snapshot Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Snapshot Type *
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border rounded-lg px-4 py-2"
            required
          >
            <option value="INVESTOR_OVERVIEW">Investor Overview</option>
            <option value="REGULATOR_OVERVIEW">Regulator Overview</option>
            <option value="INTERNAL_COMPLIANCE">Internal Compliance</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {type === 'INVESTOR_OVERVIEW' && 'High-level business metrics, aggregated only (for investors)'}
            {type === 'REGULATOR_OVERVIEW' && 'Compliance-oriented view for regulators and auditors'}
            {type === 'INTERNAL_COMPLIANCE' && 'Internal compliance overview with policy tracking'}
          </p>
        </div>

        {/* File Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            File Format *
          </label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full border rounded-lg px-4 py-2"
            required
          >
            <option value="PDF">PDF (Formatted Report)</option>
            <option value="JSON">JSON (Machine-Readable)</option>
          </select>
        </div>

        {/* Period */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period Start *
            </label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Period End *
            </label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="w-full border rounded-lg px-4 py-2"
              required
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border rounded-lg px-4 py-2"
            rows={3}
            placeholder="Add any notes about this snapshot request..."
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Success Display */}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full px-4 py-2 rounded-lg font-medium ${
            loading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {loading ? 'Creating Snapshot...' : 'Create Snapshot Request'}
        </button>
      </form>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-medium text-blue-900 mb-2">
          Important Notes
        </h4>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• All snapshots are read-only and contain aggregated data only</li>
          <li>• No personal identifiers (PII) are included in any snapshot type</li>
          <li>• Snapshot generation may take a few minutes depending on data volume</li>
          <li>• All requests are logged for audit purposes</li>
        </ul>
      </div>
    </div>
  );
};