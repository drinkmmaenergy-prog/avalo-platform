'use client';

/**
 * Earnings Filters — Date Range & Surface Filter
 *
 * Provides filter controls above the earnings breakdown table:
 *   - Date range selector: This Week, This Month, Last 3 Months, Custom date range
 *   - Surface filter: Chat, Tips, Media, All
 *
 * The filters are applied to the earningsBySource data and passed back to the parent.
 */
import React, { useState, useCallback } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type DateRangePreset = 'this_week' | 'this_month' | 'last_3_months' | 'custom';
export type SurfaceFilter = 'all' | 'chat' | 'tips' | 'media';

export interface EarningsFilterState {
  dateRange: DateRangePreset;
  customStartDate: string | null;
  customEndDate: string | null;
  surfaceFilter: SurfaceFilter;
}

export interface EarningsFiltersProps {
  filters: EarningsFilterState;
  onFiltersChange: (filters: EarningsFilterState) => void;
}

// ============================================================================
// DEFAULT STATE
// ============================================================================

export const DEFAULT_EARNINGS_FILTERS: EarningsFilterState = {
  dateRange: 'this_week',
  customStartDate: null,
  customEndDate: null,
  surfaceFilter: 'all',
};

// ============================================================================
// HELPER — Filter earnings by source data based on surface filter
// ============================================================================

export function filterEarningsBySource(
  earningsBySource: Record<string, number>,
  surfaceFilter: SurfaceFilter,
): Record<string, number> {
  if (surfaceFilter === 'all') {
    return earningsBySource;
  }

  const surfaceMap: Record<SurfaceFilter, string[]> = {
    all: [],
    chat: ['chat'],
    tips: ['tips'],
    media: ['contentUnlocks'],
  };

  const allowedKeys = surfaceMap[surfaceFilter] ?? [];
  const filtered: Record<string, number> = {};

  for (const key of allowedKeys) {
    if (earningsBySource[key] !== undefined) {
      filtered[key] = earningsBySource[key];
    }
  }

  return filtered;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function EarningsFilters({ filters, onFiltersChange }: EarningsFiltersProps) {
  const [showCustomDates, setShowCustomDates] = useState(filters.dateRange === 'custom');

  const handleDateRangeChange = useCallback(
    (preset: DateRangePreset) => {
      const isCustom = preset === 'custom';
      setShowCustomDates(isCustom);
      onFiltersChange({
        ...filters,
        dateRange: preset,
        customStartDate: isCustom ? filters.customStartDate : null,
        customEndDate: isCustom ? filters.customEndDate : null,
      });
    },
    [filters, onFiltersChange],
  );

  const handleSurfaceChange = useCallback(
    (surface: SurfaceFilter) => {
      onFiltersChange({
        ...filters,
        surfaceFilter: surface,
      });
    },
    [filters, onFiltersChange],
  );

  const handleCustomDateChange = useCallback(
    (field: 'customStartDate' | 'customEndDate', value: string) => {
      onFiltersChange({
        ...filters,
        [field]: value || null,
      });
    },
    [filters, onFiltersChange],
  );

  const dateRangeOptions: { key: DateRangePreset; label: string }[] = [
    { key: 'this_week', label: 'This Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_3_months', label: 'Last 3 Months' },
    { key: 'custom', label: 'Custom' },
  ];

  const surfaceOptions: { key: SurfaceFilter; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: '🔄' },
    { key: 'chat', label: 'Chat', icon: '💬' },
    { key: 'tips', label: 'Tips', icon: '💝' },
    { key: 'media', label: 'Media', icon: '🖼️' },
  ];

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-4">
      {/* Date Range Selector */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date Range</span>
        <div className="flex flex-wrap gap-1">
          {dateRangeOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleDateRangeChange(opt.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition
                ${filters.dateRange === opt.key
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {showCustomDates && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="date"
              value={filters.customStartDate || ''}
              onChange={(e) => handleCustomDateChange('customStartDate', e.target.value)}
              className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:ring-1 focus:ring-pink-500 focus:border-transparent"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={filters.customEndDate || ''}
              onChange={(e) => handleCustomDateChange('customEndDate', e.target.value)}
              className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:ring-1 focus:ring-pink-500 focus:border-transparent"
            />
          </div>
        )}
      </div>

      {/* Surface Filter */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Surface</span>
        <div className="flex flex-wrap gap-1">
          {surfaceOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleSurfaceChange(opt.key)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg transition
                ${filters.surfaceFilter === opt.key
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              <span>{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
